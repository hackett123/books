import { getCollection } from "astro:content";
import { getShelf } from "./shelf";

// A book counts toward stats if it's a published review OR a shelf entry
// (rated-but-unreviewed). Both represent books actually read.
interface ReadBook {
  rating: number;
  dateRead: Date | null;
  author: string;
  pageCount?: number;
  reviewed: boolean;
}

export interface YearStats {
  year: number;
  count: number;
  reviewed: number;
  avgRating: number;
  pages: number;
}

export interface MonthRow {
  year: number;
  months: number[]; // length 12, Jan..Dec, count of books read
}

export interface Stats {
  totalRead: number;
  totalReviewed: number;
  avgRating: number;
  totalPages: number;
  ratingHistogram: { rating: number; count: number }[]; // 1..5
  topAuthors: { author: string; count: number }[];
  byYear: YearStats[];
  monthly: MonthRow[]; // heatmap rows, newest year first
  maxMonth: number; // busiest single month (for heatmap scaling)
  unknownYear: number; // books read with no dateRead
}

export async function getStats(): Promise<Stats> {
  const reviews = await getCollection("reviews", ({ data }) => !data.draft);
  const books: ReadBook[] = [];

  for (const r of reviews) {
    books.push({
      rating: r.data.rating,
      dateRead: r.data.dateRead ? new Date(r.data.dateRead) : null,
      author: normalizeAuthor(r.data.author),
      pageCount: r.data.pageCount,
      reviewed: true,
    });
  }
  for (const s of getShelf()) {
    books.push({
      rating: s.rating ?? 0,
      dateRead: s.dateRead ? new Date(s.dateRead) : null,
      author: normalizeAuthor(s.author),
      reviewed: false,
    });
  }

  const rated = books.filter((b) => b.rating > 0);
  const avgRating =
    rated.length > 0
      ? rated.reduce((sum, b) => sum + b.rating, 0) / rated.length
      : 0;

  const ratingHistogram = [1, 2, 3, 4, 5].map((rating) => ({
    rating,
    count: books.filter((b) => Math.round(b.rating) === rating).length,
  }));

  const authorCounts = new Map<string, number>();
  for (const b of books) {
    if (!b.author) continue;
    authorCounts.set(b.author, (authorCounts.get(b.author) ?? 0) + 1);
  }
  const topAuthors = [...authorCounts.entries()]
    .map(([author, count]) => ({ author, count }))
    .filter((a) => a.count > 1)
    .sort((a, b) => b.count - a.count || a.author.localeCompare(b.author))
    .slice(0, 10);

  const yearMap = new Map<number, ReadBook[]>();
  let unknownYear = 0;
  for (const b of books) {
    if (!b.dateRead || isNaN(b.dateRead.getTime())) {
      unknownYear++;
      continue;
    }
    const y = b.dateRead.getUTCFullYear();
    if (!yearMap.has(y)) yearMap.set(y, []);
    yearMap.get(y)!.push(b);
  }

  const byYear: YearStats[] = [...yearMap.entries()]
    .map(([year, list]) => {
      const r = list.filter((b) => b.rating > 0);
      return {
        year,
        count: list.length,
        reviewed: list.filter((b) => b.reviewed).length,
        avgRating: r.length ? r.reduce((s, b) => s + b.rating, 0) / r.length : 0,
        pages: list.reduce((s, b) => s + (b.pageCount ?? 0), 0),
      };
    })
    .sort((a, b) => b.year - a.year);

  // Monthly heatmap matrix (one row per year, 12 cells each).
  let maxMonth = 0;
  const monthly: MonthRow[] = [...yearMap.entries()]
    .map(([year, list]) => {
      const months = new Array(12).fill(0);
      for (const b of list) {
        if (b.dateRead) months[b.dateRead.getUTCMonth()]++;
      }
      maxMonth = Math.max(maxMonth, ...months);
      return { year, months };
    })
    .sort((a, b) => b.year - a.year);

  return {
    totalRead: books.length,
    totalReviewed: books.filter((b) => b.reviewed).length,
    avgRating,
    totalPages: books.reduce((s, b) => s + (b.pageCount ?? 0), 0),
    ratingHistogram,
    topAuthors,
    byYear,
    monthly,
    maxMonth,
    unknownYear,
  };
}

// Goodreads sometimes has double spaces in author names.
function normalizeAuthor(a: string): string {
  return a.replace(/\s+/g, " ").trim();
}
