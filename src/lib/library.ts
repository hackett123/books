import { getCollection } from "astro:content";
import { getShelf, type ShelfBook } from "./shelf";
import { withBase } from "./url";

export interface ReadEntry {
  title: string;
  author: string;
  rating: number;
  cover?: string;
  dateRead: Date | null;
  href: string; // review page, or Goodreads for unreviewed
  external: boolean; // true = links out to Goodreads
}

function normTitle(t: string): string {
  return t.toLowerCase().replace(/\s+/g, " ").trim();
}

// Shelf books that DON'T have a published review, matched by title. This keeps a
// book from showing twice (once as a review, once as a rating-only shelf entry)
// once it gains a review on Goodreads. Workflow: write the review on Goodreads,
// then `npm run import` moves it from shelf.json into a review file — but this is
// the safety net if the two ever drift (e.g. a hand-written .md). Draft reviews
// don't count, so a book stays on the shelf until its review is published.
export async function getUnreviewedShelf(): Promise<ShelfBook[]> {
  const reviews = await getCollection("reviews", ({ data }) => !data.draft);
  const reviewed = new Set(reviews.map((r) => normTitle(r.data.title)));
  return getShelf().filter((b) => !reviewed.has(normTitle(b.title)));
}

// Every book you've read — published reviews + rating-only shelf — as one list,
// newest first. Used by the homepage shelf and the timeline.
export async function getReadBooks(): Promise<ReadEntry[]> {
  const reviews = await getCollection("reviews", ({ data }) => !data.draft);

  const reviewed: ReadEntry[] = reviews.map((r) => ({
    title: r.data.title,
    author: r.data.author,
    rating: r.data.rating,
    cover: r.data.cover,
    dateRead: r.data.dateRead ? new Date(r.data.dateRead) : null,
    href: withBase(`/reviews/${r.id}`),
    external: false,
  }));

  const shelf: ReadEntry[] = (await getUnreviewedShelf()).map((b) => ({
    title: b.title,
    author: b.author,
    rating: b.rating,
    cover: b.cover,
    dateRead: b.dateRead ? new Date(b.dateRead) : null,
    href: b.url ?? "#",
    external: true,
  }));

  return [...reviewed, ...shelf].sort(
    (a, b) => (b.dateRead?.getTime() ?? 0) - (a.dateRead?.getTime() ?? 0)
  );
}

// Group read books by year, then by month (both newest first). Undated books
// go under an "Undated" year with a single "undated" month. Month `key` is a
// stable anchor id (e.g. "2026-03") that the heatmap links to.
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export interface MonthGroup {
  key: string; // "2026-03" or "undated"
  label: string; // "March" or "Undated"
  entries: ReadEntry[];
}
export interface YearGroup {
  label: string; // "2026" or "Undated"
  months: MonthGroup[];
}

export async function getTimeline(): Promise<YearGroup[]> {
  const books = await getReadBooks(); // already sorted newest first
  const years = new Map<string, ReadEntry[]>();
  for (const b of books) {
    // Dates are calendar dates stored as UTC midnight — read them in UTC so
    // they don't shift across timezones (e.g. "2026-03-01" -> Feb 28 in EDT).
    const y = b.dateRead ? String(b.dateRead.getUTCFullYear()) : "Undated";
    if (!years.has(y)) years.set(y, []);
    years.get(y)!.push(b);
  }

  const sortedYears = [...years.keys()].sort((a, b) => {
    if (a === "Undated") return 1;
    if (b === "Undated") return -1;
    return Number(b) - Number(a);
  });

  return sortedYears.map((y) => {
    const entries = years.get(y)!;
    if (y === "Undated") {
      return { label: y, months: [{ key: "undated", label: "Undated", entries }] };
    }
    const byMonth = new Map<number, ReadEntry[]>();
    for (const b of entries) {
      const mo = b.dateRead!.getUTCMonth();
      if (!byMonth.has(mo)) byMonth.set(mo, []);
      byMonth.get(mo)!.push(b);
    }
    const months: MonthGroup[] = [...byMonth.keys()]
      .sort((a, b) => b - a)
      .map((mo) => ({
        key: `${y}-${String(mo + 1).padStart(2, "0")}`,
        label: MONTH_NAMES[mo],
        entries: byMonth.get(mo)!,
      }));
    return { label: y, months };
  });
}
