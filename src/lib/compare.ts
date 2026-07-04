// Book-by-book comparison between the owner's library and a friend's synced
// shelf: which books you share, how often your ratings agree, and where they
// split hardest. Used by /friends/<slug> (and the timeline's match key).
import type { Friend } from "./friends";
import type { ReadEntry } from "./library";

// Match books across people by normalized title + author. Strips series
// suffixes like "(Hierarchy, #1)" — same edition differences shouldn't hide
// a shared read. (Also used by Timeline.astro for its "both read it" badge.)
export function matchKey(title: string, author: string): string {
  const t = title.toLowerCase().replace(/\(.*?\)/g, "").replace(/[^a-z0-9]+/g, " ").trim();
  const a = (author ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return `${t}|${a}`;
}

export interface SharedBook {
  title: string;
  author: string;
  cover?: string;
  href: string; // owner's link: review page, or Goodreads for shelf-only
  external: boolean;
  theirUrl?: string;
  myRating: number;
  theirRating: number;
  diff: number; // myRating - theirRating (0 when either is unrated)
}

export interface Comparison {
  shared: SharedBook[]; // biggest rating gap first
  bothRated: number; // shared books where both gave a rating
  withinOne: number; // ...of those, rated within one star of each other
  agreementPct: number | null; // withinOne / bothRated, rounded
  biggestGap: SharedBook | null; // the starkest split (≥ 2 stars apart)
}

export function compareWithFriend(mine: ReadEntry[], friend: Friend): Comparison {
  const myByKey = new Map(mine.map((b) => [matchKey(b.title, b.author), b]));
  const seen = new Set<string>();
  const shared: SharedBook[] = [];

  for (const fb of friend.read) {
    const key = matchKey(fb.title, fb.author);
    if (seen.has(key)) continue; // friend shelved the same book twice
    const me = myByKey.get(key);
    if (!me) continue;
    seen.add(key);
    const rated = me.rating > 0 && fb.rating > 0;
    shared.push({
      title: me.title,
      author: me.author,
      cover: me.cover ?? fb.cover,
      href: me.href,
      external: me.external,
      theirUrl: fb.url,
      myRating: me.rating,
      theirRating: fb.rating,
      diff: rated ? me.rating - fb.rating : 0,
    });
  }

  const rated = shared.filter((s) => s.myRating > 0 && s.theirRating > 0);
  const withinOne = rated.filter((s) => Math.abs(s.diff) <= 1).length;
  const agreementPct = rated.length
    ? Math.round((100 * withinOne) / rated.length)
    : null;

  shared.sort(
    (a, b) => Math.abs(b.diff) - Math.abs(a.diff) || a.title.localeCompare(b.title)
  );
  const biggestGap =
    shared.length > 0 && Math.abs(shared[0].diff) >= 2 ? shared[0] : null;

  return { shared, bothRated: rated.length, withinOne, agreementPct, biggestGap };
}
