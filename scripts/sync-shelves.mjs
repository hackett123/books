#!/usr/bin/env node
/*
 * sync-shelves.mjs — re-runnable sync of the DYNAMIC Goodreads shelves
 * (currently-reading + to-read) into src/data/shelves.json.
 *
 * Unlike the review import, this writes pure data with no edits to lose, so it
 * fully regenerates the file every run. Reads the userId from goodreads.json
 * (saved by the importer); pass a URL/id to override.
 *
 * Usage:
 *   npm run sync
 *   node scripts/sync-shelves.mjs 12345678
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import {
  ROOT,
  parseUserId,
  fetchShelf,
  dateVal,
  readConfig,
  writeConfig,
} from "./goodreads-lib.mjs";
import { appendActivity, diffShelfActivity } from "./activity.mjs";

const OUT_FILE = path.join(ROOT, "src", "data", "shelves.json");

// Goodreads shelf name -> key in the output JSON.
const SHELVES = [
  { name: "currently-reading", key: "currentlyReading" },
  { name: "to-read", key: "toRead" },
];

const args = process.argv.slice(2);
const input = args.find((a) => !a.startsWith("--"));
const cfg = await readConfig();
const userId = parseUserId(input) || cfg.userId;

if (!userId) {
  console.error(
    "\nNo Goodreads userId. Run the importer first, or pass one:\n" +
      "  node scripts/sync-shelves.mjs 12345678\n"
  );
  process.exit(1);
}

main().catch((err) => {
  console.error("\nSync failed:", err.message);
  process.exit(1);
});

async function main() {
  console.log(`\nSyncing dynamic shelves for user ${userId}…\n`);
  const prev = await loadPrevious();
  const out = { syncedAt: new Date().toISOString() };

  for (const { name, key } of SHELVES) {
    let items = [];
    try {
      ({ items } = await fetchShelf(userId, name));
    } catch (err) {
      console.log(`  ${name}: skipped (${err.message})`);
      // Keep the previous list on a transient fetch failure so books don't
      // flicker off the site and re-log as "started" on the next run.
      out[key] = prev?.[key] ?? [];
      continue;
    }
    out[key] = items
      .map((b) => ({
        title: b.title,
        author: b.author,
        cover: b.cover,
        url: b.url,
        dateAdded: b.dateAdded ?? null,
      }))
      .sort((a, b) => dateVal(b.dateAdded) - dateVal(a.dateAdded));
    console.log(`  ${name.padEnd(18)} : ${out[key].length}`);
  }

  // Log my own "started reading" events for the updates strip (finished/rated
  // events come from the importer, which owns the read shelf). First sync has
  // no prior snapshot to diff, so it logs nothing.
  if (prev?.currentlyReading) {
    const events = diffShelfActivity(
      { currentlyReading: prev.currentlyReading },
      { currentlyReading: out.currentlyReading }
    );
    const updates = await appendActivity(events, { who: cfg.name ?? null, slug: null });
    if (updates) console.log(`  ${updates} update(s) logged`);
  }

  await mkdir(path.dirname(OUT_FILE), { recursive: true });
  await writeFile(OUT_FILE, JSON.stringify(out, null, 2) + "\n", "utf8");
  await writeConfig({ ...cfg, userId });
  console.log(`\nWrote ${path.relative(ROOT, OUT_FILE)}\n`);
}

async function loadPrevious() {
  if (!existsSync(OUT_FILE)) return null;
  try {
    return JSON.parse(await readFile(OUT_FILE, "utf8"));
  } catch {
    return null;
  }
}
