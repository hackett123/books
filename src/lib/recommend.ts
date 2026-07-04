// "From your friends" — books your friends rated highly that you haven't
// read and haven't already queued on the to-read shelf, ranked by how many
// friends loved them (then by their average rating).
import { matchKey } from "./compare";
import { getFriends } from "./friends";
import { getReadBooks } from "./library";
import shelvesData from "../data/shelves.json";

export interface Recommendation {
  title: string;
  author: string;
  cover?: string;
  url?: string;
  fans: { name: string; slug: string; rating: number }[];
  avgRating: number;
}

export async function getRecommendations(minRating = 4): Promise<Recommendation[]> {
  const myKeys = new Set(
    (await getReadBooks()).map((b) => matchKey(b.title, b.author))
  );
  // Already on the pile — no need to recommend it again.
  const toRead = (shelvesData.toRead ?? []) as { title: string; author: string }[];
  for (const t of toRead) myKeys.add(matchKey(t.title, t.author));

  const map = new Map<string, Recommendation>();
  for (const f of getFriends()) {
    const seenForFriend = new Set<string>();
    for (const b of f.read) {
      if (b.rating < minRating) continue;
      const key = matchKey(b.title, b.author);
      if (myKeys.has(key) || seenForFriend.has(key)) continue;
      seenForFriend.add(key);
      let rec = map.get(key);
      if (!rec) {
        rec = {
          title: b.title,
          author: b.author,
          cover: b.cover,
          url: b.url,
          fans: [],
          avgRating: 0,
        };
        map.set(key, rec);
      }
      rec.fans.push({ name: f.name, slug: f.slug, rating: b.rating });
    }
  }

  return [...map.values()]
    .map((r) => ({
      ...r,
      avgRating: r.fans.reduce((s, x) => s + x.rating, 0) / r.fans.length,
      fans: r.fans.slice().sort((a, b) => b.rating - a.rating),
    }))
    .sort(
      (a, b) =>
        b.fans.length - a.fans.length ||
        b.avgRating - a.avgRating ||
        a.title.localeCompare(b.title)
    );
}
