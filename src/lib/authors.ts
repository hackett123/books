import { getReadBooks, type ReadEntry } from "./library";
import { normalizeAuthor } from "./bookstats";

export interface AuthorSummary {
  name: string;
  slug: string;
  books: ReadEntry[]; // newest first (inherited from getReadBooks)
  count: number;
  reviewedCount: number;
  avgRating: number; // over rated books only
}

// Stable, URL-safe slug for an author name. normalizeAuthor first so the same
// person doesn't split across slugs over a stray double space.
export function authorSlug(name: string): string {
  return normalizeAuthor(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Every author you've read, grouped from the full library (reviews + shelf),
// most-read first. One entry per author; single-book authors included so links
// to /authors/<slug> from anywhere resolve.
export async function getAuthors(): Promise<AuthorSummary[]> {
  const books = await getReadBooks(); // newest first
  const map = new Map<string, ReadEntry[]>();
  for (const b of books) {
    const name = normalizeAuthor(b.author);
    if (!name) continue;
    if (!map.has(name)) map.set(name, []);
    map.get(name)!.push(b);
  }

  return [...map.entries()]
    .map(([name, list]) => {
      const rated = list.filter((b) => b.rating > 0);
      return {
        name,
        slug: authorSlug(name),
        books: list,
        count: list.length,
        reviewedCount: list.filter((b) => !b.external).length,
        avgRating: rated.length
          ? rated.reduce((s, b) => s + b.rating, 0) / rated.length
          : 0,
      };
    })
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export async function getAuthor(slug: string): Promise<AuthorSummary | undefined> {
  return (await getAuthors()).find((a) => a.slug === slug);
}
