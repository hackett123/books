/*
 * activity.mjs — shared append-only log of reading events detected by the
 * sync scripts: someone started a book, finished one, or rated/reviewed one.
 *
 * Goodreads RSS carries no event timestamps, so events are found by diffing
 * the freshly-fetched shelves against the previously-committed JSON, then
 * stamped with the sync time and written to src/data/activity.json. The site
 * renders events stamped within 24h of the build; deploys follow each nightly
 * sync, so in practice that means "since yesterday's sync".
 */

import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { ROOT } from "./goodreads-lib.mjs";

const ACTIVITY_FILE = path.join(ROOT, "src", "data", "activity.json");

// Keep two weeks of events. The site only shows the last 24h; the rest is
// slack for debugging and for deduping across overlapping local/CI runs.
const RETAIN_MS = 14 * 24 * 60 * 60 * 1000;

// A friend bulk-adding books they read long ago shouldn't read as a burst of
// "finished" events; a dated read older than this is backfill, not news.
const FRESH_READ_MS = 14 * 24 * 60 * 60 * 1000;

export function isFreshRead(dateRead) {
  if (!dateRead) return true; // undated: can't tell, assume it just happened
  const t = Date.parse(dateRead);
  return Number.isNaN(t) || Date.now() - t < FRESH_READ_MS;
}

export function bookEvent(action, book, extra = {}) {
  return {
    action, // "started" | "finished" | "rated" | "reviewed"
    book: { title: book.title, author: book.author, cover: book.cover, url: book.url },
    ...extra, // rating, reviewed, reviewSlug…
  };
}

function bookKey(b = {}) {
  return b.url || `${(b.title || "").toLowerCase()}::${(b.author || "").toLowerCase()}`;
}

function eventKey(e) {
  return `${e.slug ?? "me"}|${e.action}|${bookKey(e.book)}`;
}

/*
 * Diff a previously-synced shelf snapshot against the fresh one. Both sides
 * are { read?: [...], currentlyReading?: [...] }; either list may be absent.
 * Returns bookEvent()s (unstamped). Callers must skip the diff entirely on a
 * first sync — with no prior snapshot the whole shelf would look "new".
 */
export function diffShelfActivity(prev, next) {
  const events = [];

  const prevReading = new Set((prev.currentlyReading ?? []).map(bookKey));
  for (const b of next.currentlyReading ?? []) {
    if (!prevReading.has(bookKey(b))) events.push(bookEvent("started", b));
  }

  const prevRead = new Map((prev.read ?? []).map((b) => [bookKey(b), b]));
  for (const b of next.read ?? []) {
    const old = prevRead.get(bookKey(b));
    if (!old) {
      if (!isFreshRead(b.dateRead)) continue; // backfill of an old read
      events.push(
        bookEvent("finished", b, {
          ...(b.rating > 0 && { rating: b.rating }),
          ...(b.hasReview && { reviewed: true }),
        })
      );
    } else {
      if ((old.rating ?? 0) !== b.rating && b.rating > 0) {
        events.push(bookEvent("rated", b, { rating: b.rating }));
      }
      if (!old.hasReview && b.hasReview) {
        events.push(bookEvent("reviewed", b, { ...(b.rating > 0 && { rating: b.rating }) }));
      }
    }
  }
  return events;
}

/*
 * Stamp events with the current time + actor and prepend them to the log.
 * slug identifies a friend; slug=null means the site owner. Events already in
 * the retained log (same actor/action/book) are dropped, so a local run
 * followed by a CI run doesn't double-log. Returns how many were added.
 */
export async function appendActivity(events, { who = null, slug = null } = {}) {
  const now = Date.now();
  let existing = [];
  if (existsSync(ACTIVITY_FILE)) {
    try {
      existing = JSON.parse(await readFile(ACTIVITY_FILE, "utf8"));
    } catch {
      existing = [];
    }
  }
  const kept = existing.filter((e) => now - Date.parse(e.at) < RETAIN_MS);
  const seen = new Set(kept.map(eventKey));

  const stamped = [];
  for (const e of events) {
    const full = { at: new Date(now).toISOString(), who, slug, ...e };
    if (seen.has(eventKey(full))) continue;
    seen.add(eventKey(full));
    stamped.push(full);
  }

  if (stamped.length === 0 && kept.length === existing.length) return 0;
  await writeFile(
    ACTIVITY_FILE,
    JSON.stringify([...stamped, ...kept], null, 2) + "\n", // newest first
    "utf8"
  );
  return stamped.length;
}
