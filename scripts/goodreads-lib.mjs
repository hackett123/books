/*
 * goodreads-lib.mjs — shared helpers for the Goodreads RSS scripts.
 * Used by import-goodreads.mjs (one-time review backfill) and
 * sync-shelves.mjs (re-runnable currently-reading / to-read sync).
 */

import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { XMLParser } from "fast-xml-parser";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, "..");
export const CONFIG_FILE = path.join(ROOT, "goodreads.json");

// ---- config (stores the userId so sync needs no args) -------------------
export async function readConfig() {
  if (!existsSync(CONFIG_FILE)) return {};
  try {
    return JSON.parse(await readFile(CONFIG_FILE, "utf8"));
  } catch {
    return {};
  }
}

export async function writeConfig(cfg) {
  await writeFile(CONFIG_FILE, JSON.stringify(cfg, null, 2) + "\n", "utf8");
}

// ---- userId parsing -----------------------------------------------------
export function parseUserId(s) {
  if (!s) return null;
  s = String(s).trim();
  if (/^\d+$/.test(s)) return s;
  const m = s.match(/\/(?:user\/show|review\/list(?:_rss)?)\/(\d+)/);
  if (m) return m[1];
  const any = s.match(/(\d{3,})/);
  return any ? any[1] : null;
}

// ---- fetch + parse a shelf ---------------------------------------------
export async function fetchShelf(userId, shelf = "read") {
  const url = `https://www.goodreads.com/review/list_rss/${userId}?shelf=${encodeURIComponent(
    shelf
  )}`;
  const xml = await fetchText(url);
  const parser = new XMLParser({
    ignoreAttributes: false,
    cdataPropName: "__cdata",
    trimValues: true,
  });
  const doc = parser.parse(xml);
  const channel = doc?.rss?.channel;
  if (!channel) {
    throw new Error(
      `Unexpected RSS shape for shelf "${shelf}" (no channel). Is the profile public?`
    );
  }
  const items = asArray(channel.item).map(normalize).filter((b) => b.title);
  return { url, items };
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
      `HTTP ${res.status} ${res.statusText} for ${url}. ` +
        "Check the userId and that the profile/shelf is public."
    );
  }
  return res.text();
}

// ---- normalization ------------------------------------------------------
function asArray(x) {
  if (x == null) return [];
  return Array.isArray(x) ? x : [x];
}

function text(v) {
  if (v == null) return "";
  if (typeof v === "object") return String(v.__cdata ?? v["#text"] ?? "");
  return String(v);
}

export function normalize(item) {
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

export function cleanTitle(t) {
  return t.replace(/\s+/g, " ").trim();
}

export function slugify(s) {
  return (
    s
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/\(.*?\)/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 70) || "untitled"
  );
}

export function uniqueSlug(base, used) {
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
  return d.toISOString().slice(0, 10);
}
function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
export function dateVal(s) {
  return s ? new Date(s).getTime() : 0;
}

// ---- review text handling ----------------------------------------------
export function looksTruncated(html) {
  if (!html) return false;
  return /\.\.\.\s*<a[^>]*>\s*more\s*<\/a>/i.test(html) || /\.\.\.more/i.test(html);
}

export function htmlToMarkdown(html) {
  if (!html) return "";
  let s = html;
  s = s.replace(/\.\.\.\s*<a[^>]*>\s*more\s*<\/a>/gi, "…");
  s = s.replace(/<\s*br\s*\/?\s*>/gi, "\n");
  s = s.replace(/<\/p\s*>/gi, "\n\n");
  s = s.replace(/<p[^>]*>/gi, "");
  s = s.replace(/<\/?(b|strong)\s*>/gi, "**");
  s = s.replace(/<\/?(i|em)\s*>/gi, "_");
  s = s.replace(/<blockquote[^>]*>/gi, "\n> ");
  s = s.replace(/<\/blockquote\s*>/gi, "\n");
  s = s.replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, "[$2]($1)");
  s = s.replace(/<[^>]+>/g, "");
  s = decodeEntities(s);
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

export function yamlString(s) {
  return `"${String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}
