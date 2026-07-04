/*
 * enrich-openlibrary.mjs — look up every read book (reviews + shelf) on
 * Open Library and cache page counts, subjects, and edition languages into
 * src/data/enrichment.json (committed data, consumed by src/lib/enrichment.ts).
 *
 * Incremental: books already in the cache — including confirmed misses — are
 * skipped, so re-runs (and the nightly sync workflow) only fetch new books.
 * Run with --force to re-fetch everything.
 */

import { readFile, writeFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const REVIEWS_DIR = path.join(ROOT, "src/content/reviews");
const SHELF_FILE = path.join(ROOT, "src/data/shelf.json");
const OVERRIDES_FILE = path.join(ROOT, "src/data/overrides.json");
const OUT_FILE = path.join(ROOT, "src/data/enrichment.json");

const FORCE = process.argv.includes("--force");
const DELAY_MS = 400; // be polite — one request every ~0.4s
const USER_AGENT =
  "marginalia-book-blog/1.0 (personal reading blog; contact: mhackett10@gmail.com)";

// Must stay in sync with matchKey() in src/lib/compare.ts — the frontend
// looks enrichment up by the same key.
function matchKey(title, author) {
  const t = String(title).toLowerCase().replace(/\(.*?\)/g, "").replace(/[^a-z0-9]+/g, " ").trim();
  const a = String(author ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return `${t}|${a}`;
}

// Minimal frontmatter reader for the importer-generated reviews. Only pulls
// the scalar fields we need; not a general YAML parser.
function parseFrontmatter(md) {
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return {};
  const out = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z]+):\s*(.*)$/);
    if (!kv) continue;
    let v = kv[2].trim();
    if (v.startsWith('"')) {
      try {
        v = JSON.parse(v);
      } catch {
        v = v.replace(/^"|"$/g, "");
      }
    }
    out[kv[1]] = v;
  }
  return out;
}

async function gatherBooks() {
  const books = new Map(); // key -> { title, author, isbn? }
  const add = (title, author, isbn) => {
    if (!title) return;
    const key = matchKey(title, author);
    if (!books.has(key)) books.set(key, { title, author, isbn });
  };

  for (const file of await readdir(REVIEWS_DIR)) {
    if (!file.endsWith(".md")) continue;
    const fm = parseFrontmatter(await readFile(path.join(REVIEWS_DIR, file), "utf8"));
    add(fm.title, fm.author, fm.isbn || undefined);
  }
  const shelf = JSON.parse(await readFile(SHELF_FILE, "utf8"));
  for (const b of shelf) add(b.title, b.author);
  if (existsSync(OVERRIDES_FILE)) {
    const overrides = JSON.parse(await readFile(OVERRIDES_FILE, "utf8"));
    for (const b of overrides.books ?? []) {
      if (b.author) add(b.title, b.author); // hand-added books only
    }
  }
  return books;
}

// Subjects from Open Library are noisy — drop catalog/marketing tags and
// keep a dozen of the useful ones per book.
const SUBJECT_JUNK = [
  /^fiction$/i, /^general$/i, /^literature$/i, /^novels?$/i, /^roman$/i,
  /nyt:/i, /new york times/i, /bestseller/i, /award:/i, /^open library/i,
  /accessible book/i, /protected daisy/i, /internet archive/i, /overdrive/i,
  /^large type/i, /reading level/i, /staff picks/i, /^collection/i,
  /^translations from/i, /^specimens$/i,
];
function cleanSubjects(subjects) {
  const seen = new Set();
  const out = [];
  for (const s of subjects ?? []) {
    const t = String(s).trim();
    if (!t || t.length > 40) continue;
    if (SUBJECT_JUNK.some((re) => re.test(t))) continue;
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
    if (out.length >= 12) break;
  }
  return out;
}

const FIELDS =
  "key,title,author_name,number_of_pages_median,subject,language,first_publish_year";

async function searchOL(params) {
  params.set("limit", "3");
  params.set("fields", FIELDS);
  const url = `https://openlibrary.org/search.json?${params}`;
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
  return (await res.json()).docs ?? [];
}

async function lookup(book) {
  // ISBN is the precise handle when the importer captured one…
  if (book.isbn) {
    const docs = await searchOL(new URLSearchParams({ q: `isbn:${book.isbn}` }));
    if (docs.length > 0) return docs[0];
  }
  // …otherwise (or if the ISBN missed) search by title + author. Series
  // suffixes and subtitles confuse OL search, so query the bare title.
  const bare = book.title.replace(/\(.*?\)/g, "").split(":")[0].trim();
  const params = new URLSearchParams({ title: bare });
  if (book.author) params.set("author", book.author);
  const docs = await searchOL(params);
  return docs[0] ?? null;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const books = await gatherBooks();
let cache = {};
if (existsSync(OUT_FILE) && !FORCE) {
  cache = JSON.parse(await readFile(OUT_FILE, "utf8"));
}

const pending = [...books.entries()].filter(([key]) => !(key in cache));
console.log(
  `${books.size} books in the library; ${pending.length} to look up on Open Library.`
);

let done = 0;
for (const [key, book] of pending) {
  done++;
  const label = `${book.title} — ${book.author}`;
  try {
    const doc = await lookup(book);
    if (!doc) {
      cache[key] = { title: book.title, author: book.author, found: false };
      console.log(`  [${done}/${pending.length}] ✗ not found: ${label}`);
    } else {
      cache[key] = {
        title: book.title,
        author: book.author,
        found: true,
        olKey: doc.key,
        ...(doc.number_of_pages_median && { pages: doc.number_of_pages_median }),
        subjects: cleanSubjects(doc.subject),
        ...(doc.language && { languages: doc.language.slice(0, 20) }),
        ...(doc.first_publish_year && { firstPublishYear: doc.first_publish_year }),
      };
      console.log(
        `  [${done}/${pending.length}] ✓ ${label}` +
          (doc.number_of_pages_median ? ` (${doc.number_of_pages_median} pp)` : "")
      );
    }
  } catch (err) {
    // Leave failed lookups out of the cache so the next run retries them.
    console.warn(`  [${done}/${pending.length}] ! error for ${label}: ${err.message}`);
  }
  if (done < pending.length) await sleep(DELAY_MS);
}

// Drop cache entries for books no longer in the library, keep keys sorted so
// diffs stay reviewable.
const sorted = {};
for (const key of [...books.keys()].sort()) {
  if (cache[key]) sorted[key] = cache[key];
}
await writeFile(OUT_FILE, JSON.stringify(sorted, null, 2) + "\n", "utf8");

const found = Object.values(sorted).filter((e) => e.found).length;
console.log(
  `Wrote ${OUT_FILE.replace(ROOT + "/", "")}: ${found}/${books.size} matched.`
);
