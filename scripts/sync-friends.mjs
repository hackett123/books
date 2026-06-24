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
 * Note: Goodreads RSS returns only the ~100 most-recently-added books per shelf,
 * so a friend's stats reflect their recent reads, not their whole history.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { ROOT, fetchShelf } from "./goodreads-lib.mjs";

const FRIENDS_CONFIG = path.join(ROOT, "src", "data", "friends.json");
const OUT_DIR = path.join(ROOT, "src", "data", "friends");

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
  console.log(`\nSyncing ${friends.length} friend(s)…\n`);

  for (const f of friends) {
    if (!f.userId || !f.slug) {
      console.log(`  skipping ${f.name ?? "?"} (missing userId/slug)`);
      continue;
    }
    try {
      const { items: read } = await fetchShelf(f.userId, "read");
      let currentlyReading = [];
      try {
        ({ items: currentlyReading } = await fetchShelf(f.userId, "currently-reading"));
      } catch {
        currentlyReading = [];
      }

      const out = {
        name: f.name ?? f.slug,
        slug: f.slug,
        userId: String(f.userId),
        profileUrl: `https://www.goodreads.com/user/show/${f.userId}`,
        syncedAt: new Date().toISOString(),
        read: read.map(slimRead),
        currentlyReading: currentlyReading.map(slimReading),
      };

      const file = path.join(OUT_DIR, `${f.slug}.json`);
      await writeFile(file, JSON.stringify(out, null, 2) + "\n", "utf8");
      console.log(
        `  ${f.slug.padEnd(10)} read ${String(out.read.length).padStart(3)} · currently-reading ${out.currentlyReading.length}`
      );
    } catch (err) {
      console.log(`  ${f.slug}: failed (${err.message}) — is the profile public?`);
    }
  }
  console.log(`\nWrote ${path.relative(ROOT, OUT_DIR)}/<slug>.json\n`);
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
