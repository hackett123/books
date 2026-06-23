import { getCollection, type CollectionEntry } from "astro:content";

export type Review = CollectionEntry<"reviews">;

// Published reviews (non-draft), newest first by dateRead then dateAdded.
export async function getPublishedReviews(): Promise<Review[]> {
  const all = await getCollection("reviews", ({ data }) => !data.draft);
  return all.sort((a, b) => sortDate(b) - sortDate(a));
}

function sortDate(entry: Review): number {
  const d = entry.data.dateRead ?? entry.data.dateAdded;
  return d ? new Date(d).getTime() : 0;
}

// Plain-text excerpt from raw Markdown body.
export function excerpt(body: string | undefined, max = 220): string {
  if (!body) return "";
  const text = body
    .replace(/^---[\s\S]*?---/, "") // strip any frontmatter remnant
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "") // images
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // links -> text
    .replace(/[#>*_`~]/g, "") // md punctuation
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= max) return text;
  return text.slice(0, max).replace(/\s+\S*$/, "") + "…";
}

export function formatDate(d?: Date): string | undefined {
  if (!d) return undefined;
  return new Date(d).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
