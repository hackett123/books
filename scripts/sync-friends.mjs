#!/usr/bin/env node
/*
 * sync-friends.mjs — fetch friends' public Goodreads shelves into committed JSON.
 *
 * Friends are defined in src/data/friends.json ({ name, slug, userId }). For
 * each, this merges the books from their public shelf widget into
 * src/data/friends/<slug>.json. Re-runnable (pure data); commit the JSON so the
 * static build (and GitHub Pages) picks it up.
 *
 * Usage:  npm run sync:friends
 *
 * Goodreads retired the RSS feeds in October 2026. The widget that replaces
 * them only shows a friend's ~100 most recent `read` books, with no dates or
 * page counts, and can't see currently-reading at all. So:
 *   - read: merge-only. Known books keep their dates/page counts and pick up
 *     rating/review changes; new books get today as dateRead (a friend's very
 *     first sync gets null instead — those are backfill, not today's reads).
 *   - currently-reading: frozen at the last RSS snapshot, minus any book that
 *     has since shown up as read.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { ROOT, fetchWidgetShelf, dateVal, todayISO } from "./goodreads-lib.mjs";
import { appendActivity, diffShelfActivity } from "./activity.mjs";

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
    const file = path.join(OUT_DIR, `${f.slug}.json`);
    try {
      const existing = await loadExisting(file);
      const { items: read } = await fetchWidgetShelf(f.userId);
      const mergedRead = mergeReads(existing?.read ?? [], read.map(slimRead), {
        newDateRead: existing ? todayISO() : null,
      });
      const readKeys = new Set(mergedRead.map(readKey));
      const currentlyReading = (existing?.currentlyReading ?? []).filter(
        (b) => !readKeys.has(readKey(b))
      );

      const out = {
        name: f.name ?? f.slug,
        slug: f.slug,
        userId: String(f.userId),
        profileUrl: `https://www.goodreads.com/user/show/${f.userId}`,
        syncedAt: new Date().toISOString(),
        read: mergedRead,
        currentlyReading,
      };

      // Log started/finished/rated/reviewed events for the updates strip.
      // First sync for a friend (no prior file) is a backfill, not news.
      const updates = existing
        ? await appendActivity(diffShelfActivity(existing, out), {
            who: out.name,
            slug: out.slug,
          })
        : 0;

      await writeFile(file, JSON.stringify(out, null, 2) + "\n", "utf8");
      const added = mergedRead.length - (existing?.read?.length ?? 0);
      const tag = added ? ` (+${added} new)` : "";
      console.log(
        `  ${f.slug.padEnd(10)} read ${String(out.read.length).padStart(3)}${tag} · currently-reading ${out.currentlyReading.length}${updates ? ` · ${updates} update(s)` : ""}`
      );
    } catch (err) {
      console.log(`  ${f.slug}: failed (${err.message}) — is the profile public?`);
    }
  }
  console.log(`\nWrote ${path.relative(ROOT, OUT_DIR)}/<slug>.json\n`);
}

// Key a read entry by its Goodreads URL (carries the unique bookId) so the merge
// upserts cleanly; fall back to title+author only when a URL is missing.
function readKey(b) {
  return b.url || `${(b.title || "").toLowerCase().trim()}::${(b.author || "").toLowerCase().trim()}`;
}

async function loadExisting(file) {
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return null;
  }
}

// Merge freshly-fetched reads into the existing list, newest read first. The
// widget lacks dates and page counts, so a known book keeps its own and only
// takes the widget's rating and review status; a new book gets newDateRead.
function mergeReads(existing, fresh, { newDateRead }) {
  const map = new Map(existing.map((b) => [readKey(b), b]));
  for (const b of fresh) {
    const old = map.get(readKey(b));
    map.set(
      readKey(b),
      old ? { ...old, rating: b.rating, hasReview: b.hasReview } : { ...b, dateRead: newDateRead }
    );
  }
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
