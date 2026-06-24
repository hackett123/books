import { getCollection } from "astro:content";
import { getUnreviewedShelf } from "./library";
import { computeStats, type ReadBook, type Stats } from "./bookstats";

export type { Stats, YearStats, MonthRow } from "./bookstats";

// The owner's reading stats: published reviews + rating-only shelf, fed through
// the shared computeStats().
export async function getStats(): Promise<Stats> {
  const reviews = await getCollection("reviews", ({ data }) => !data.draft);
  const books: ReadBook[] = [];

  for (const r of reviews) {
    books.push({
      rating: r.data.rating,
      dateRead: r.data.dateRead ? new Date(r.data.dateRead) : null,
      author: r.data.author,
      pageCount: r.data.pageCount,
      reviewed: true,
    });
  }
  for (const s of await getUnreviewedShelf()) {
    books.push({
      rating: s.rating ?? 0,
      dateRead: s.dateRead ? new Date(s.dateRead) : null,
      author: s.author,
      reviewed: false,
    });
  }

  return computeStats(books);
}
