#!/usr/bin/env node
/*
 * import-goodreads.mjs — one-time backfill of a Goodreads "read" shelf.
 *
 * Usage:
 *   node scripts/import-goodreads.mjs "<profile URL or numeric userId>"
 *   node scripts/import-goodreads.mjs 12345678 --download-covers
 *
 * Books WITH a written review -> src/content/reviews/<slug>.md
 * Books rated but NOT reviewed -> src/data/shelf.json
 *
 * Safe to re-run: existing review .md files are NOT overwritten (your edits
 * survive); shelf.json is always regenerated. Saves the userId to
 * goodreads.json so `npm run sync` needs no arguments afterwards.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import {
  ROOT,
  parseUserId,
  fetchShelf,
  htmlToMarkdown,
  looksTruncated,
  slugify,
  uniqueSlug,
  yamlString,
  dateVal,
  readConfig,
  writeConfig,
} from "./goodreads-lib.mjs";
import {
  readCache,
  writeCache,
  getLastSync,
  setLastSync,
} from "./sync-cache.mjs";

const REVIEWS_DIR = path.join(ROOT, "src", "content", "reviews");
const SHELF_FILE = path.join(ROOT, "src", "data", "shelf.json");
const COVERS_DIR = path.join(ROOT, "public", "covers");

const args = process.argv.slice(2);
const downloadCovers = args.includes("--download-covers");
const force = args.includes("--force"); // ignore the sync cache, re-read whole shelf
const input = args.find((a) => !a.startsWith("--"));

const cfg = await readConfig();
const userId = parseUserId(input) || cfg.userId;
if (!userId) {
  console.error(
    "\nMissing Goodreads profile URL or userId.\n" +
      'Usage: node scripts/import-goodreads.mjs "https://www.goodreads.com/user/show/12345678-name"\n'
  );
  process.exit(1);
}

main().catch((err) => {
  console.error("\nImport failed:", err.message);
  process.exit(1);
});

// Key a shelf book/entry for the incremental merge. The Goodreads book URL
// carries the unique bookId; fall back to title+author for hand-added entries
// (overrides) that may lack one. title+author alone would collapse distinct
// same-titled editions, so it's only the fallback.
function shelfKey(b) {
  return b.url || `${(b.title || "").toLowerCase().trim()}::${(b.author || "").toLowerCase().trim()}`;
}

async function main() {
  const cache = await readCache();
  // INCREMENTAL: the feed is date-added DESC, so we only need books added after
  // our last sync; --force (or no prior sync) re-reads the whole shelf.
  const since = force ? null : getLastSync(cache, userId, "read");
  const startedAt = new Date().toISOString();

  if (since) {
    console.log(`\nFetching new books since ${since} for user ${userId}…`);
    console.log("(use --force to re-read the whole shelf, e.g. after editing old reviews)\n");
  } else {
    console.log(`\nFetching Goodreads "read" shelf for user ${userId}…\n`);
  }

  const { items, complete } = await fetchShelf(userId, "read", { since });

  await mkdir(REVIEWS_DIR, { recursive: true });
  await mkdir(path.dirname(SHELF_FILE), { recursive: true });
  if (downloadCovers) await mkdir(COVERS_DIR, { recursive: true });

  if (items.length === 0) {
    // Nothing new (incremental) or an empty shelf (full). Leave shelf.json as-is;
    // just record that we checked so the next run stays incremental.
    console.log(complete ? "No books found. Nothing to import." : "No new books since last sync.");
    setLastSync(cache, userId, "read", startedAt, cfg.name || "you");
    await writeCache(cache);
    await writeConfig({ ...cfg, userId });
    return;
  }
  if (complete && items.length >= 100) {
    console.log(
      "⚠ Feed returned 100 items — Goodreads caps RSS at ~100 most-recent.\n"
    );
  }

  // Slug collisions WITHIN this run get a `-2` suffix; collisions with an
  // already-imported book are caught by the existsSync skip below (add-only).
  const usedSlugs = new Set();

  // On a full read, regenerate shelf.json from scratch. Incrementally, merge the
  // new books into the existing shelf (keyed by title+author).
  const shelfMap = new Map();
  if (!complete && existsSync(SHELF_FILE)) {
    try {
      for (const e of JSON.parse(await readFile(SHELF_FILE, "utf8"))) {
        shelfMap.set(shelfKey(e), e);
      }
    } catch {
      /* unreadable shelf.json — fall back to rebuilding from the new books */
    }
  }

  let written = 0;
  let skipped = 0;
  let truncatedCount = 0;

  for (const book of items) {
    const reviewMd = htmlToMarkdown(book.userReview);
    const hasReview = reviewMd.trim().length > 0;

    let cover = book.cover;
    if (downloadCovers && cover) cover = (await downloadCover(cover, book)) ?? cover;

    if (hasReview) {
      // It's a review now, so it no longer belongs on the rating-only shelf.
      shelfMap.delete(shelfKey(book));
      const slug = uniqueSlug(slugify(book.title), usedSlugs);
      const file = path.join(REVIEWS_DIR, `${slug}.md`);
      if (existsSync(file)) {
        skipped++;
        continue;
      }
      const truncated = looksTruncated(book.userReview);
      if (truncated) truncatedCount++;
      await writeFile(file, renderMarkdown(book, reviewMd, cover, truncated), "utf8");
      written++;
    } else {
      shelfMap.set(shelfKey(book), {
        title: book.title,
        author: book.author,
        rating: book.rating,
        cover,
        url: book.url,
        dateRead: book.dateRead ?? null,
      });
    }
  }

  const shelfEntries = [...shelfMap.values()].sort(
    (a, b) =>
      dateVal(b.dateRead) - dateVal(a.dateRead) || (a.title || "").localeCompare(b.title || "")
  );
  await writeFile(SHELF_FILE, JSON.stringify(shelfEntries, null, 2) + "\n", "utf8");

  setLastSync(cache, userId, "read", startedAt, cfg.name || "you");
  await writeCache(cache);
  await writeConfig({ ...cfg, userId });

  console.log("Done.");
  console.log(`  review posts written : ${written}`);
  if (skipped) console.log(`  review posts skipped : ${skipped} (already existed)`);
  console.log(`  shelf entries        : ${shelfEntries.length}${complete ? "" : " (merged)"}`);
  if (truncatedCount)
    console.log(`  ⚠ truncated by GR    : ${truncatedCount} (flagged draft)`);
  console.log(`\nSaved userId to goodreads.json — run \`npm run sync\` anytime.\n`);
}

function renderMarkdown(book, body, cover, truncated) {
  const fm = ["---"];
  fm.push(`title: ${yamlString(book.title)}`);
  fm.push(`author: ${yamlString(book.author)}`);
  fm.push(`rating: ${book.rating}`);
  if (book.dateRead) fm.push(`dateRead: ${book.dateRead}`);
  fm.push(`dateAdded: ${book.dateAdded}`);
  if (cover) fm.push(`cover: ${yamlString(cover)}`);
  if (book.bookId) fm.push(`goodreadsId: ${yamlString(book.bookId)}`);
  if (book.url) fm.push(`goodreadsUrl: ${yamlString(book.url)}`);
  if (book.isbn) fm.push(`isbn: ${yamlString(book.isbn)}`);
  if (book.pageCount) fm.push(`pageCount: ${book.pageCount}`);
  if (book.shelves.length)
    fm.push(`shelves: [${book.shelves.map(yamlString).join(", ")}]`);
  if (truncated) {
    fm.push("draft: true");
    fm.push("needsReviewText: true");
  }
  fm.push("---", "", body, "");
  return fm.join("\n");
}

async function downloadCover(url, book) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const ext = (url.match(/\.(jpe?g|png|webp|gif)(?:\?|$)/i)?.[1] || "jpg").toLowerCase();
    const name = `${slugify(book.title)}-${book.bookId || "x"}.${ext}`;
    const buf = Buffer.from(await res.arrayBuffer());
    await writeFile(path.join(COVERS_DIR, name), buf);
    return `/covers/${name}`;
  } catch {
    return null;
  }
}
