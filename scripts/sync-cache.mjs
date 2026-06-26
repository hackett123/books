/*
 * sync-cache.mjs — local record of the last Goodreads sync per person.
 *
 * Goodreads' `read` RSS feed is ordered by date-added DESCENDING (verified), so
 * once a sync walks back to a book added at or before the last sync, everything
 * after it is already known and pagination can stop early. This module persists
 * that "last sync" timestamp, keyed by userId + shelf, in .sync-cache.json at the
 * repo root.
 *
 * The file is git-ignored on purpose: it's local machine state, and committing it
 * would make every sync produce a diff (defeating publish.sh's "nothing changed"
 * skip). A fresh clone with no cache simply does a full refresh.
 *
 * CAVEAT: incremental sync only sees books whose date-added moved past the last
 * sync. Editing an old review on Goodreads does NOT bump its date-added, so
 * revisions are missed — run any sync with `--force` to ignore the cache and
 * re-read the whole shelf.
 */

import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { ROOT } from "./goodreads-lib.mjs";

export const CACHE_FILE = path.join(ROOT, ".sync-cache.json");

export async function readCache() {
  if (!existsSync(CACHE_FILE)) return { users: {} };
  try {
    const c = JSON.parse(await readFile(CACHE_FILE, "utf8"));
    return c && typeof c === "object" && c.users ? c : { users: {} };
  } catch {
    return { users: {} };
  }
}

export async function writeCache(cache) {
  await writeFile(CACHE_FILE, JSON.stringify(cache, null, 2) + "\n", "utf8");
}

// ISO timestamp of the last successful sync of `shelf` for `userId`, or null.
export function getLastSync(cache, userId, shelf = "read") {
  return cache.users?.[String(userId)]?.shelves?.[shelf] ?? null;
}

export function setLastSync(cache, userId, shelf, iso, name) {
  cache.users ??= {};
  const u = (cache.users[String(userId)] ??= {});
  if (name) u.name = name;
  u.shelves ??= {};
  u.shelves[shelf] = iso;
  return cache;
}
