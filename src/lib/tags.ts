import { getPublishedReviews, type Review } from "./reviews";

export function tagSlug(tag: string): string {
  return tag
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export interface TagInfo {
  tag: string; // display name (first-seen casing)
  slug: string;
  count: number;
}

// All shelves/tags used across published reviews, with counts, sorted by count.
export async function getAllTags(): Promise<TagInfo[]> {
  const reviews = await getPublishedReviews();
  const map = new Map<string, TagInfo>();
  for (const r of reviews) {
    for (const raw of r.data.shelves) {
      const slug = tagSlug(raw);
      if (!slug) continue;
      const existing = map.get(slug);
      if (existing) existing.count++;
      else map.set(slug, { tag: raw, slug, count: 1 });
    }
  }
  return [...map.values()].sort(
    (a, b) => b.count - a.count || a.tag.localeCompare(b.tag)
  );
}

export async function getReviewsByTag(slug: string): Promise<Review[]> {
  const reviews = await getPublishedReviews();
  return reviews.filter((r) => r.data.shelves.some((s) => tagSlug(s) === slug));
}
