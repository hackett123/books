import rss from "@astrojs/rss";
import { getCollection } from "astro:content";

export async function GET(context) {
  const reviews = (await getCollection("reviews", ({ data }) => !data.draft))
    .sort((a, b) => {
      const da = a.data.dateRead ?? a.data.dateAdded;
      const db = b.data.dateRead ?? b.data.dateAdded;
      return new Date(db).getTime() - new Date(da).getTime();
    });

  return rss({
    title: "Marginalia",
    description: "Book reviews and reading notes.",
    site: context.site,
    items: reviews.map((r) => ({
      title: `${r.data.title} — ${r.data.author}`,
      description: `★ ${r.data.rating}/5`,
      pubDate: r.data.dateRead ?? r.data.dateAdded,
      link: `/reviews/${r.id}/`,
    })),
    customData: `<language>en-us</language>`,
  });
}
