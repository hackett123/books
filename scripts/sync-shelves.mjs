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

import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import {
  ROOT,
  parseUserId,
  fetchShelf,
  dateVal,
  readConfig,
  writeConfig,
} from "./goodreads-lib.mjs";

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
  const out = { syncedAt: new Date().toISOString() };

  for (const { name, key } of SHELVES) {
    let items = [];
    try {
      ({ items } = await fetchShelf(userId, name));
    } catch (err) {
      console.log(`  ${name}: skipped (${err.message})`);
      out[key] = [];
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

  await mkdir(path.dirname(OUT_FILE), { recursive: true });
  await writeFile(OUT_FILE, JSON.stringify(out, null, 2) + "\n", "utf8");
  await writeConfig({ ...cfg, userId });
  console.log(`\nWrote ${path.relative(ROOT, OUT_FILE)}\n`);
}
