#!/usr/bin/env node
/*
 * import-goodreads.mjs — pull new books from the Goodreads "read" shelf.
 *
 * Usage:
 *   node scripts/import-goodreads.mjs "<profile URL or numeric userId>"
 *   node scripts/import-goodreads.mjs 12345678 --download-covers
 *
 * Books WITH a written review -> src/content/reviews/<slug>.md
 * Books rated but NOT reviewed -> src/data/shelf.json
 *
 * Reads the public shelf widget (see fetchWidgetShelf in goodreads-lib.mjs):
 * Goodreads retired the RSS feed this used to read in October 2026. The widget
 * only shows the ~100 most recent books, with no dates and reviews cut at ~250
 * characters, so this is merge-only — it never rebuilds shelf.json, and books
 * already in it keep their dates/cover/title and only pick up rating changes.
 * Books seen for the first time get today's date as dateRead (the nightly
 * sync sees them the day they're marked read); correct it in overrides.json.
 *
 * Existing review .md files are NOT overwritten (your edits survive). A new
 * review the widget truncated is written as a draft flagged needsReviewText.
 */

import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import {
  ROOT,
  parseUserId,
  fetchWidgetShelf,
  htmlToMarkdown,
  slugify,
  uniqueSlug,
  yamlString,
  dateVal,
  todayISO,
  readConfig,
  writeConfig,
} from "./goodreads-lib.mjs";
import { appendActivity, bookEvent } from "./activity.mjs";

const REVIEWS_DIR = path.join(ROOT, "src", "content", "reviews");
const SHELF_FILE = path.join(ROOT, "src", "data", "shelf.json");
const COVERS_DIR = path.join(ROOT, "public", "covers");

const args = process.argv.slice(2);
const downloadCovers = args.includes("--download-covers");
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

// Key a shelf book/entry for the merge. The Goodreads review URL is unique per
// book on a user's shelf; fall back to title+author for hand-added entries
// (overrides) that may lack one.
function shelfKey(b) {
  return b.url || `${(b.title || "").toLowerCase().trim()}::${(b.author || "").toLowerCase().trim()}`;
}

// Goodreads review ids that already have a review post, so a reviewed book the
// widget shows without text (or under a different title) isn't also added to
// the rating-only shelf.
async function reviewedIds() {
  const ids = new Set();
  if (!existsSync(REVIEWS_DIR)) return ids;
  for (const f of await readdir(REVIEWS_DIR)) {
    if (!f.endsWith(".md")) continue;
    const id = (await readFile(path.join(REVIEWS_DIR, f), "utf8")).match(
      /^goodreadsUrl: .*\/review\/show\/(\d+)/m
    )?.[1];
    if (id) ids.add(id);
  }
  return ids;
}

async function main() {
  console.log(`\nFetching Goodreads "read" shelf widget for user ${userId}…\n`);
  const { items } = await fetchWidgetShelf(userId);

  await mkdir(REVIEWS_DIR, { recursive: true });
  await mkdir(path.dirname(SHELF_FILE), { recursive: true });
  if (downloadCovers) await mkdir(COVERS_DIR, { recursive: true });

  // Previous shelf snapshot: the base the widget merges into, and the baseline
  // for activity events (a book absent from it = newly finished). null on the
  // very first import, which is a backfill — no events, no guessed dates.
  let oldShelf = null;
  if (existsSync(SHELF_FILE)) {
    try {
      oldShelf = new Map(
        JSON.parse(await readFile(SHELF_FILE, "utf8")).map((e) => [shelfKey(e), e])
      );
    } catch {
      /* unreadable shelf.json — treat like a first import */
    }
  }
  const shelfMap = new Map(oldShelf ?? []);
  const reviewed = await reviewedIds();
  const today = todayISO();

  // Slug collisions WITHIN this run get a `-2` suffix; collisions with an
  // already-imported book are caught by the existsSync skip below (add-only).
  const usedSlugs = new Set();

  let written = 0;
  let added = 0;
  let truncatedCount = 0;
  const events = [];

  for (const book of items) {
    if (reviewed.has(book.reviewId)) continue; // already a post; you own it now
    const key = shelfKey(book);
    const old = oldShelf?.get(key);
    const reviewMd = htmlToMarkdown(book.userReview);

    let cover = old?.cover || book.cover;
    if (!old && downloadCovers && cover) cover = (await downloadCover(cover, book)) ?? cover;
    const eventBook = {
      title: old?.title ?? book.title,
      author: old?.author ?? book.author,
      cover,
      url: book.url,
    };

    if (reviewMd.trim()) {
      const slug = uniqueSlug(slugify(eventBook.title), usedSlugs);
      const file = path.join(REVIEWS_DIR, `${slug}.md`);
      if (existsSync(file)) continue; // a different book with this slug; leave it
      // It's a review now, so it no longer belongs on the rating-only shelf.
      shelfMap.delete(key);
      const dateRead = old ? old.dateRead : oldShelf ? today : null;
      if (book.reviewTruncated) truncatedCount++;
      await writeFile(
        file,
        renderMarkdown({ ...book, ...eventBook, dateRead, dateAdded: today }, reviewMd, book.reviewTruncated),
        "utf8"
      );
      written++;
      if (oldShelf) {
        events.push(
          bookEvent(old ? "reviewed" : "finished", eventBook, {
            ...(book.rating > 0 && { rating: book.rating }),
            reviewed: true,
            reviewSlug: slug,
          })
        );
      }
    } else if (old) {
      if ((old.rating ?? 0) !== book.rating && book.rating > 0) {
        shelfMap.set(key, { ...old, rating: book.rating });
        events.push(bookEvent("rated", eventBook, { rating: book.rating }));
      }
    } else {
      shelfMap.set(key, {
        title: book.title,
        author: book.author,
        rating: book.rating,
        cover,
        url: book.url,
        dateRead: oldShelf ? today : null,
      });
      added++;
      if (oldShelf) {
        events.push(
          bookEvent("finished", eventBook, { ...(book.rating > 0 && { rating: book.rating }) })
        );
      }
    }
  }

  const updates = await appendActivity(events, { who: cfg.name ?? null, slug: null });

  const shelfEntries = [...shelfMap.values()].sort(
    (a, b) =>
      dateVal(b.dateRead) - dateVal(a.dateRead) || (a.title || "").localeCompare(b.title || "")
  );
  await writeFile(SHELF_FILE, JSON.stringify(shelfEntries, null, 2) + "\n", "utf8");
  await writeConfig({ ...cfg, userId });

  console.log("Done.");
  console.log(`  widget books seen    : ${items.length}`);
  console.log(`  review posts written : ${written}`);
  console.log(`  shelf entries        : ${shelfEntries.length} (${added} new)`);
  if (updates) console.log(`  updates logged       : ${updates}`);
  if (truncatedCount)
    console.log(`  ⚠ truncated by GR    : ${truncatedCount} (flagged draft — paste the full text in)`);
  console.log("");
}

function renderMarkdown(book, body, truncated) {
  const fm = ["---"];
  fm.push(`title: ${yamlString(book.title)}`);
  fm.push(`author: ${yamlString(book.author)}`);
  fm.push(`rating: ${book.rating}`);
  if (book.dateRead) fm.push(`dateRead: ${book.dateRead}`);
  fm.push(`dateAdded: ${book.dateAdded}`);
  if (book.cover) fm.push(`cover: ${yamlString(book.cover)}`);
  if (book.url) fm.push(`goodreadsUrl: ${yamlString(book.url)}`);
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
    const name = `${slugify(book.title)}-${book.reviewId || "x"}.${ext}`;
    const buf = Buffer.from(await res.arrayBuffer());
    await writeFile(path.join(COVERS_DIR, name), buf);
    return `/covers/${name}`;
  } catch {
    return null;
  }
}
