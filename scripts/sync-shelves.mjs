#!/usr/bin/env node
/*
 * sync-shelves.mjs — maintain the DYNAMIC shelves (currently-reading +
 * to-read) in src/data/shelves.json.
 *
 * Goodreads retired the RSS feeds these came from in October 2026, and the
 * shelf widget that replaced them for the read shelf can't show other shelves.
 * So both lists are frozen at the last RSS snapshot; all this can still do is
 * drop books that have since shown up on the read shelf. New currently-reading
 * or to-read books need adding to shelves.json by hand.
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
  fetchWidgetShelf,
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
  console.log(`\nPruning finished books from dynamic shelves for user ${userId}…\n`);
  const prev = await loadPrevious();
  if (!prev) {
    console.log("  no shelves.json yet, and there's no feed to build one from. Nothing to do.\n");
    return;
  }
  const { items } = await fetchWidgetShelf(userId);
  const read = new Set(items.map((b) => b.url));

  let removed = 0;
  const out = { ...prev };
  for (const { name, key } of SHELVES) {
    const kept = (prev[key] ?? []).filter((b) => !read.has(b.url));
    removed += (prev[key] ?? []).length - kept.length;
    out[key] = kept;
    console.log(`  ${name.padEnd(18)} : ${kept.length}`);
  }

  // Leave the file (and syncedAt) untouched when nothing moved, so a quiet
  // night doesn't produce a commit and a redeploy.
  if (removed === 0) {
    console.log("\nNo books moved to read. shelves.json unchanged.\n");
    return;
  }
  out.syncedAt = new Date().toISOString();
  await mkdir(path.dirname(OUT_FILE), { recursive: true });
  await writeFile(OUT_FILE, JSON.stringify(out, null, 2) + "\n", "utf8");
  await writeConfig({ ...cfg, userId });
  console.log(`\nRemoved ${removed} finished book(s); wrote ${path.relative(ROOT, OUT_FILE)}\n`);
}

async function loadPrevious() {
  if (!existsSync(OUT_FILE)) return null;
  try {
    return JSON.parse(await readFile(OUT_FILE, "utf8"));
  } catch {
    return null;
  }
}
