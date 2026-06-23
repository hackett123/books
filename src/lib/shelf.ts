import shelfData from "../data/shelf.json";
import overridesData from "../data/overrides.json";

export interface ShelfBook {
  title: string;
  author: string;
  rating: number;
  cover?: string;
  url?: string;
  dateRead: string | null;
}

interface Override {
  title: string;
  author?: string;
  rating?: number;
  cover?: string;
  url?: string;
  dateRead?: string | null;
}

function norm(t: string): string {
  return t.toLowerCase().replace(/\s+/g, " ").trim();
}

// The rated-but-unreviewed shelf, with manual overrides applied on top of the
// import-generated shelf.json. Overrides correct/fill values Goodreads gets
// wrong (e.g. missing dates, integer-only ratings) and can add books Goodreads
// omits entirely. Because corrections live in overrides.json, they survive
// `npm run import` regenerating shelf.json.
export function getShelf(): ShelfBook[] {
  const overrides = (overridesData.books ?? []) as Override[];
  const byTitle = new Map(overrides.map((o) => [norm(o.title), o]));

  const merged: ShelfBook[] = (shelfData as ShelfBook[]).map((b) => {
    const o = byTitle.get(norm(b.title));
    if (!o) return b;
    byTitle.delete(norm(b.title));
    return {
      ...b,
      ...(o.rating !== undefined && { rating: o.rating }),
      ...(o.dateRead !== undefined && { dateRead: o.dateRead }),
      ...(o.author !== undefined && { author: o.author }),
      ...(o.cover !== undefined && { cover: o.cover }),
      ...(o.url !== undefined && { url: o.url }),
    };
  });

  // Any override that didn't match an existing shelf entry = a book Goodreads
  // doesn't have; add it (needs at least a title + author to be useful).
  for (const o of byTitle.values()) {
    merged.push({
      title: o.title,
      author: o.author ?? "",
      rating: o.rating ?? 0,
      cover: o.cover,
      url: o.url,
      dateRead: o.dateRead ?? null,
    });
  }

  return merged.sort(
    (a, b) =>
      (a.dateRead ? Date.parse(a.dateRead) : 0) <
      (b.dateRead ? Date.parse(b.dateRead) : 0)
        ? 1
        : -1
  );
}
