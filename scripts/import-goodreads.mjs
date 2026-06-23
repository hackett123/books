#!/usr/bin/env node
/*
 * import-goodreads.mjs — one-time backfill of a Goodreads "read" shelf.
 *
 * Usage:
 *   node scripts/import-goodreads.mjs "<goodreads profile URL or numeric userId>"
 *   node scripts/import-goodreads.mjs 12345678
 *   node scripts/import-goodreads.mjs --shelf read --download-covers <url>
 *
 * What it does:
 *   - Reads the public RSS feed: /review/list_rss/<userId>?shelf=read
 *     (no login needed; returns the ~100 most-recently-added books per shelf)
 *   - Books WITH written review text  -> src/content/reviews/<slug>.md
 *   - Books rated but NOT reviewed    -> entries in src/data/shelf.json
 *   - Detects reviews Goodreads truncated and flags them (draft + needsReviewText)
 *
 * Safe to re-run: existing review .md files are NOT overwritten (so your edits
 * survive); shelf.json is always regenerated.
 */

import { writeFile, readFile, mkdir, access } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { XMLParser } from "fast-xml-parser";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const REVIEWS_DIR = path.join(ROOT, "src", "content", "reviews");
const SHELF_FILE = path.join(ROOT, "src", "data", "shelf.json");
const COVERS_DIR = path.join(ROOT, "public", "covers");

// ---- args ---------------------------------------------------------------
const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")));
const positional = args.filter((a) => !a.startsWith("--"));
const shelfIdx = args.indexOf("--shelf");
const shelf = shelfIdx !== -1 ? args[shelfIdx + 1] : "read";
const downloadCovers = flags.has("--download-covers");

const input = positional.find((a) => a !== shelf);
if (!input) {
  console.error(
    "\nMissing Goodreads profile URL or userId.\n" +
      'Usage: node scripts/import-goodreads.mjs "https://www.goodreads.com/user/show/12345678-name"\n'
  );
  process.exit(1);
}

const userId = parseUserId(input);
if (!userId) {
  console.error(`Could not find a numeric Goodreads userId in: ${input}`);
  process.exit(1);
}

const feedUrl = `https://www.goodreads.com/review/list_rss/${userId}?shelf=${encodeURIComponent(
  shelf
)}`;

// ---- run ----------------------------------------------------------------
main().catch((err) => {
  console.error("\nImport failed:", err.message);
  process.exit(1);
});

async function main() {
  console.log(`\nFetching Goodreads shelf "${shelf}" for user ${userId}…`);
  console.log(`  ${feedUrl}\n`);

  const xml = await fetchText(feedUrl);
  const parser = new XMLParser({
    ignoreAttributes: false,
    cdataPropName: "__cdata",
    trimValues: true,
  });
  const doc = parser.parse(xml);

  const channel = doc?.rss?.channel;
  if (!channel) throw new Error("Unexpected RSS shape (no channel). Is the profile public?");
  const items = asArray(channel.item);
  if (items.length === 0) {
    console.log("No books found in this shelf's feed. Nothing to import.");
    return;
  }
  if (items.length >= 100) {
    console.log(
      "⚠ Feed returned 100 items — Goodreads caps RSS at ~100 most-recent.\n" +
        "  If you have more, the rest weren't fetched (you said <100, so likely fine).\n"
    );
  }

  await mkdir(REVIEWS_DIR, { recursive: true });
  await mkdir(path.dirname(SHELF_FILE), { recursive: true });
  if (downloadCovers) await mkdir(COVERS_DIR, { recursive: true });

  const usedSlugs = new Set();
  const shelfEntries = [];
  let written = 0;
  let skipped = 0;
  let truncatedCount = 0;

  for (const item of items) {
    const book = normalize(item);
    if (!book.title) continue;

    const reviewMd = htmlToMarkdown(book.userReview);
    const hasReview = reviewMd.trim().length > 0;

    let cover = book.cover;
    if (downloadCovers && cover) {
      cover = (await downloadCover(cover, book)) ?? cover;
    }

    if (hasReview) {
      const slug = uniqueSlug(slugify(book.title), usedSlugs);
      const file = path.join(REVIEWS_DIR, `${slug}.md`);

      if (existsSync(file)) {
        skipped++;
        continue; // never clobber an edited review
      }

      const truncated = looksTruncated(book.userReview);
      if (truncated) truncatedCount++;

      const md = renderMarkdown(book, reviewMd, cover, truncated);
      await writeFile(file, md, "utf8");
      written++;
    } else {
      shelfEntries.push({
        title: book.title,
        author: book.author,
        rating: book.rating,
        cover,
        url: book.url,
        dateRead: book.dateRead ?? null,
      });
    }
  }

  shelfEntries.sort((a, b) => dateVal(b.dateRead) - dateVal(a.dateRead));
  await writeFile(SHELF_FILE, JSON.stringify(shelfEntries, null, 2) + "\n", "utf8");

  console.log("Done.");
  console.log(`  review posts written : ${written}`);
  if (skipped) console.log(`  review posts skipped : ${skipped} (already existed)`);
  console.log(`  shelf entries        : ${shelfEntries.length}`);
  if (truncatedCount)
    console.log(
      `  ⚠ truncated by GR    : ${truncatedCount} (flagged draft + needsReviewText — paste full text)`
    );
  console.log("");
}

// ---- helpers ------------------------------------------------------------
function parseUserId(s) {
  if (/^\d+$/.test(s.trim())) return s.trim();
  const m = s.match(/\/(?:user\/show|review\/list(?:_rss)?)\/(\d+)/);
  if (m) return m[1];
  const any = s.match(/(\d{3,})/);
  return any ? any[1] : null;
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; personal-reviews-backfill/1.0; one-time import)",
      Accept: "application/rss+xml, application/xml, text/xml, */*",
    },
  });
  if (!res.ok) {
    throw new Error(
      `HTTP ${res.status} ${res.statusText}. ` +
        "Check the userId and that the profile/shelf is public."
    );
  }
  return res.text();
}

function asArray(x) {
  if (x == null) return [];
  return Array.isArray(x) ? x : [x];
}

function text(v) {
  if (v == null) return "";
  if (typeof v === "object") return String(v.__cdata ?? v["#text"] ?? "");
  return String(v);
}

function normalize(item) {
  const rating = Number(text(item.user_rating)) || 0;
  return {
    title: cleanTitle(text(item.title)),
    author: text(item.author_name).trim(),
    rating,
    userReview: text(item.user_review),
    dateRead: parseDate(text(item.user_read_at)),
    dateAdded:
      parseDate(text(item.user_date_added)) ||
      parseDate(text(item.user_date_created)) ||
      todayISO(),
    cover:
      text(item.book_large_image_url) ||
      text(item.book_image_url) ||
      text(item.book_medium_image_url) ||
      "",
    bookId: text(item.book_id),
    isbn: text(item.isbn),
    pageCount: Number(text(item.num_pages)) || undefined,
    shelves: text(item.user_shelves)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    url: text(item.link) || bookUrl(text(item.book_id)),
  };
}

function bookUrl(id) {
  return id ? `https://www.goodreads.com/book/show/${id}` : undefined;
}

function cleanTitle(t) {
  // Goodreads appends series info like "Title (Series, #1)" — keep as-is but trim.
  return t.replace(/\s+/g, " ").trim();
}

function slugify(s) {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\(.*?\)/g, "") // drop "(Series, #1)"
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70) || "untitled";
}

function uniqueSlug(base, used) {
  let slug = base;
  let n = 2;
  while (used.has(slug)) slug = `${base}-${n++}`;
  used.add(slug);
  return slug;
}

function parseDate(s) {
  if (!s) return undefined;
  const d = new Date(s);
  if (isNaN(d.getTime())) return undefined;
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}
function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function dateVal(s) {
  return s ? new Date(s).getTime() : 0;
}

function looksTruncated(html) {
  if (!html) return false;
  // Goodreads truncates with a trailing "...more" link to the full review.
  return /\.\.\.\s*<a[^>]*>\s*more\s*<\/a>/i.test(html) || /\.\.\.more/i.test(html);
}

// Lightweight HTML -> Markdown for the small subset Goodreads emits.
function htmlToMarkdown(html) {
  if (!html) return "";
  let s = html;
  // Drop the "...more" truncation link entirely.
  s = s.replace(/\.\.\.\s*<a[^>]*>\s*more\s*<\/a>/gi, "…");
  // Block / line breaks
  s = s.replace(/<\s*br\s*\/?\s*>/gi, "\n");
  s = s.replace(/<\/p\s*>/gi, "\n\n");
  s = s.replace(/<p[^>]*>/gi, "");
  // Emphasis
  s = s.replace(/<\/?(b|strong)\s*>/gi, "**");
  s = s.replace(/<\/?(i|em)\s*>/gi, "_");
  // Blockquote
  s = s.replace(/<blockquote[^>]*>/gi, "\n> ");
  s = s.replace(/<\/blockquote\s*>/gi, "\n");
  // Links -> [text](href)
  s = s.replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, "[$2]($1)");
  // Strip any remaining tags
  s = s.replace(/<[^>]+>/g, "");
  // Decode common entities
  s = decodeEntities(s);
  // Tidy whitespace
  s = s.replace(/\r/g, "");
  s = s.replace(/[ \t]+\n/g, "\n");
  s = s.replace(/\n{3,}/g, "\n\n");
  return s.trim();
}

function decodeEntities(s) {
  const named = {
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": '"',
    "&#39;": "'",
    "&apos;": "'",
    "&rsquo;": "’",
    "&lsquo;": "‘",
    "&rdquo;": "”",
    "&ldquo;": "“",
    "&hellip;": "…",
    "&mdash;": "—",
    "&ndash;": "–",
    "&nbsp;": " ",
  };
  return s
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&[a-z]+;/gi, (m) => named[m.toLowerCase()] ?? m);
}

function yamlString(s) {
  return `"${String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function renderMarkdown(book, body, cover, truncated) {
  const fm = ["---"];
  fm.push(`title: ${yamlString(book.title)}`);
  fm.push(`author: ${yamlString(book.author)}`);
  fm.push(`rating: ${book.rating}`);
  if (book.dateRead) fm.push(`dateRead: ${book.dateRead}`);
  fm.push(`dateAdded: ${book.dateAdded}`);
  if (cover) fm.push(`cover: ${yamlString(cover)}`);
  if (book.bookId) fm.push(`goodreadsId: ${yamlString(book.bookId)}`);
  if (book.url) fm.push(`goodreadsUrl: ${yamlString(book.url)}`);
  if (book.isbn) fm.push(`isbn: ${yamlString(book.isbn)}`);
  if (book.pageCount) fm.push(`pageCount: ${book.pageCount}`);
  if (book.shelves.length)
    fm.push(`shelves: [${book.shelves.map(yamlString).join(", ")}]`);
  if (truncated) {
    fm.push("draft: true");
    fm.push("needsReviewText: true");
  }
  fm.push("---");
  fm.push("");
  fm.push(body);
  fm.push("");
  return fm.join("\n");
}

async function downloadCover(url, book) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const ext = (url.match(/\.(jpe?g|png|webp|gif)(?:\?|$)/i)?.[1] || "jpg").toLowerCase();
    const name = `${slugify(book.title)}-${book.bookId || "x"}.${ext}`;
    const buf = Buffer.from(await res.arrayBuffer());
    await writeFile(path.join(COVERS_DIR, name), buf);
    return `/covers/${name}`;
  } catch {
    return null;
  }
}
