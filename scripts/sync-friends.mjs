#!/usr/bin/env node
/*
 * sync-friends.mjs — fetch friends' public Goodreads shelves into committed JSON.
 *
 * Friends are defined in src/data/friends.json ({ name, slug, userId }). For
 * each, this pulls their `read` and `currently-reading` shelves and writes
 * src/data/friends/<slug>.json. Re-runnable (pure data); commit the JSON so the
 * static build (and GitHub Pages) picks it up.
 *
 * Usage:  npm run sync:friends
 *
 * Note: fetchShelf() paginates the RSS feed (&page=N), so this captures a
 * friend's whole `read` shelf, not just the 100 most-recently-added books.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { ROOT, fetchShelf, dateVal } from "./goodreads-lib.mjs";
import {
  readCache,
  writeCache,
  getLastSync,
  setLastSync,
} from "./sync-cache.mjs";

const FRIENDS_CONFIG = path.join(ROOT, "src", "data", "friends.json");
const OUT_DIR = path.join(ROOT, "src", "data", "friends");

const force = process.argv.slice(2).includes("--force");

main().catch((err) => {
  console.error("\nFriends sync failed:", err.message);
  process.exit(1);
});

async function main() {
  const friends = JSON.parse(await readFile(FRIENDS_CONFIG, "utf8"));
  if (!Array.isArray(friends) || friends.length === 0) {
    console.log("No friends in src/data/friends.json. Nothing to sync.");
    return;
  }

  await mkdir(OUT_DIR, { recursive: true });
  const cache = await readCache();
  const startedAt = new Date().toISOString();
  console.log(
    `\nSyncing ${friends.length} friend(s)${force ? " (--force: full refresh)" : ""}…\n`
  );

  for (const f of friends) {
    if (!f.userId || !f.slug) {
      console.log(`  skipping ${f.name ?? "?"} (missing userId/slug)`);
      continue;
    }
    const file = path.join(OUT_DIR, `${f.slug}.json`);
    try {
      // INCREMENTAL: only pull `read` books added since this friend's last sync.
      // currently-reading is a small "state" shelf where items leave when a book
      // is finished, so it's always fetched in full (caching would strand them).
      const since = force ? null : getLastSync(cache, f.userId, "read");
      const { items: read, complete } = await fetchShelf(f.userId, "read", { since });
      let currentlyReading = [];
      try {
        ({ items: currentlyReading } = await fetchShelf(f.userId, "currently-reading"));
      } catch {
        currentlyReading = [];
      }

      // Same canonical order (newest read first) on both paths, so an unchanged
      // incremental run produces a byte-identical file. The site re-sorts anyway.
      const mergedRead = complete
        ? read.map(slimRead).sort(byReadDesc)
        : mergeReads(await loadExistingRead(file), read.map(slimRead));

      const out = {
        name: f.name ?? f.slug,
        slug: f.slug,
        userId: String(f.userId),
        profileUrl: `https://www.goodreads.com/user/show/${f.userId}`,
        syncedAt: new Date().toISOString(),
        read: mergedRead,
        currentlyReading: currentlyReading.map(slimReading),
      };

      await writeFile(file, JSON.stringify(out, null, 2) + "\n", "utf8");
      setLastSync(cache, f.userId, "read", startedAt, f.name ?? f.slug);
      const tag = complete ? "" : ` (+${read.length} new)`;
      console.log(
        `  ${f.slug.padEnd(10)} read ${String(out.read.length).padStart(3)}${tag} · currently-reading ${out.currentlyReading.length}`
      );
    } catch (err) {
      console.log(`  ${f.slug}: failed (${err.message}) — is the profile public?`);
    }
  }
  await writeCache(cache);
  console.log(`\nWrote ${path.relative(ROOT, OUT_DIR)}/<slug>.json\n`);
}

// Key a read entry by its Goodreads URL (carries the unique bookId) so the merge
// upserts cleanly; fall back to title+author only when a URL is missing.
function readKey(b) {
  return b.url || `${(b.title || "").toLowerCase().trim()}::${(b.author || "").toLowerCase().trim()}`;
}

async function loadExistingRead(file) {
  if (!existsSync(file)) return [];
  try {
    return JSON.parse(await readFile(file, "utf8")).read ?? [];
  } catch {
    return [];
  }
}

// Upsert freshly-fetched reads over the existing list, newest read first.
function mergeReads(existing, fresh) {
  const map = new Map(existing.map((b) => [readKey(b), b]));
  for (const b of fresh) map.set(readKey(b), b);
  return [...map.values()].sort(byReadDesc);
}

// Deterministic order: newest read first, title as a stable tiebreaker (many
// friend reads share a null dateRead, so the tiebreaker keeps runs identical).
function byReadDesc(a, b) {
  return dateVal(b.dateRead) - dateVal(a.dateRead) || (a.title || "").localeCompare(b.title || "");
}

function slimRead(b) {
  return {
    title: b.title,
    author: b.author,
    rating: b.rating,
    cover: b.cover,
    url: b.url,
    dateRead: b.dateRead ?? null,
    pageCount: b.pageCount,
    hasReview: Boolean(b.userReview && b.userReview.trim()),
  };
}

function slimReading(b) {
  return { title: b.title, author: b.author, cover: b.cover, url: b.url };
}
