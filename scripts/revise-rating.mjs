#!/usr/bin/env node
/*
 * revise-rating.mjs — change your mind about a book, on the record.
 *
 * Rewrites the `rating` in a review's frontmatter and appends a dated note to
 * the body, so the revision is visible in the post rather than hidden in git
 * history. Ratings may be fractional — StarRating.astro fills by percentage.
 *
 * The importer never rewrites an existing review file, so edits made here
 * survive the nightly sync.
 *
 * Usage:
 *   npm run revise -- "Nymph" 4
 *   npm run revise -- never-let-me-go 4.5 --note "on reflection, …"
 *   npm run revise -- "Bunny" 3.5 --dry-run
 */

import { readFile, writeFile, readdir } from "node:fs/promises";
import path from "node:path";
import { ROOT } from "./goodreads-lib.mjs";

const REVIEWS_DIR = path.join(ROOT, "src", "content", "reviews");

const argv = process.argv.slice(2);
const dryRun = argv.includes("--dry-run");
const noteIdx = argv.findIndex((a) => a === "--note");
const note = noteIdx !== -1 ? argv[noteIdx + 1] : null;
if (noteIdx !== -1 && !note) fail("--note needs a value.");

// Positionals are whatever isn't a flag or a flag's value.
const consumed = noteIdx === -1 ? new Set() : new Set([noteIdx, noteIdx + 1]);
const positional = argv.filter(
  (a, i) => !a.startsWith("--") && !consumed.has(i)
);
const [target, ratingArg] = positional;

if (!target || ratingArg === undefined) {
  fail(
    "Usage: npm run revise -- <title-or-slug> <rating> [--note \"…\"] [--dry-run]"
  );
}

const rating = Number(ratingArg);
if (!Number.isFinite(rating) || rating < 0 || rating > 5) {
  fail(`Rating must be a number from 0 to 5 — got "${ratingArg}".`);
}

main().catch((err) => {
  console.error(`\nRevise failed: ${err.message}\n`);
  process.exit(1);
});

async function main() {
  const file = await resolveReview(target);
  const raw = await readFile(file, "utf8");
  const slug = path.basename(file, ".md");

  const m = raw.match(/^rating:[ \t]*([\d.]+)[ \t]*$/m);
  if (!m) fail(`${slug}.md has no \`rating:\` line in its frontmatter.`);
  const old = Number(m[1]);

  if (old === rating && !note) {
    console.log(`\n${slug} is already ${fmt(rating)} — nothing to do.\n`);
    return;
  }

  // Frontmatter only: anchor on the first match so a "rating:" mentioned in
  // the review body is never touched.
  let out = raw.replace(m[0], `rating: ${fmt(rating)}`);

  const stamp = today();
  const parts = [];
  if (note) parts.push(note.trim());
  parts.push(`[revised from ${fmt(old)} to ${fmt(rating)} on ${stamp}]`);
  out = `${out.trimEnd()}\n\n${parts.join("\n\n")}\n`;

  const verb = rating > old ? "raised" : rating < old ? "dropped" : "annotated";
  if (dryRun) {
    console.log(`\n--dry-run — would have written ${slug}.md:\n`);
    console.log(parts.map((p) => `  ${p}`).join("\n\n"));
    console.log(`\n  ${verb}: ${fmt(old)} → ${fmt(rating)}\n`);
    return;
  }

  await writeFile(file, out, "utf8");
  console.log(`\n${slug}: ${verb} ${fmt(old)} → ${fmt(rating)}`);
  if (note) console.log(`  note appended (${note.trim().length} chars)`);
  console.log(`  ${path.relative(ROOT, file)}\n`);
}

// Match on slug first, then on the frontmatter title — both case-insensitive,
// exact before substring, so "Bunny" doesn't lose to "Bunny (Bunny, #1)".
async function resolveReview(query) {
  const files = (await readdir(REVIEWS_DIR)).filter((f) => f.endsWith(".md"));
  const q = query.toLowerCase().trim();

  const entries = await Promise.all(
    files.map(async (f) => {
      const raw = await readFile(path.join(REVIEWS_DIR, f), "utf8");
      const t = raw.match(/^title:[ \t]*"?(.*?)"?[ \t]*$/m);
      return {
        file: path.join(REVIEWS_DIR, f),
        slug: path.basename(f, ".md"),
        title: t ? t[1] : "",
      };
    })
  );

  const exact = entries.filter(
    (e) => e.slug.toLowerCase() === q || e.title.toLowerCase() === q
  );
  if (exact.length === 1) return exact[0].file;
  if (exact.length > 1) fail(ambiguous(query, exact));

  const partial = entries.filter(
    (e) => e.slug.toLowerCase().includes(q) || e.title.toLowerCase().includes(q)
  );
  if (partial.length === 1) return partial[0].file;
  if (partial.length > 1) fail(ambiguous(query, partial));

  fail(`No review matches "${query}".`);
}

function ambiguous(query, matches) {
  const list = matches.map((e) => `  ${e.slug}  (${e.title})`).join("\n");
  return `"${query}" matches ${matches.length} reviews — be more specific:\n${list}`;
}

// Trailing-zero-free: 4.5 stays "4.5", 4.0 becomes "4".
function fmt(n) {
  return String(Number(n));
}

function today() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function fail(msg) {
  console.error(`\n${msg}\n`);
  process.exit(1);
}
