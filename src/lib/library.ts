import { getCollection } from "astro:content";
import shelfData from "../data/shelf.json";

export interface ReadEntry {
  title: string;
  author: string;
  rating: number;
  cover?: string;
  dateRead: Date | null;
  href: string; // review page, or Goodreads for unreviewed
  external: boolean; // true = links out to Goodreads
}

interface ShelfRow {
  title: string;
  author: string;
  rating: number;
  cover?: string;
  url?: string;
  dateRead?: string | null;
}

// Every book you've read — published reviews + rated-only shelf — as one list,
// newest first. Used by the timeline.
export async function getReadBooks(): Promise<ReadEntry[]> {
  const reviews = await getCollection("reviews", ({ data }) => !data.draft);

  const reviewed: ReadEntry[] = reviews.map((r) => ({
    title: r.data.title,
    author: r.data.author,
    rating: r.data.rating,
    cover: r.data.cover,
    dateRead: r.data.dateRead ? new Date(r.data.dateRead) : null,
    href: `/reviews/${r.id}`,
    external: false,
  }));

  const shelf: ReadEntry[] = (shelfData as ShelfRow[]).map((b) => ({
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

// Group read books by year (newest first); undated books go under "Undated".
export interface YearGroup {
  label: string;
  entries: ReadEntry[];
}

export async function getTimeline(): Promise<YearGroup[]> {
  const books = await getReadBooks();
  const groups = new Map<string, ReadEntry[]>();
  for (const b of books) {
    const label = b.dateRead ? String(b.dateRead.getFullYear()) : "Undated";
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(b);
  }
  return [...groups.entries()]
    .map(([label, entries]) => ({ label, entries }))
    .sort((a, b) => {
      if (a.label === "Undated") return 1;
      if (b.label === "Undated") return -1;
      return Number(b.label) - Number(a.label);
    });
}
