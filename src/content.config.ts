import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

// Reviews are Markdown files in src/content/reviews/.
// The Goodreads importer generates these; you own and edit them afterwards.
const reviews = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/reviews" }),
  schema: z.object({
    title: z.string(),
    author: z.string(),
    rating: z.number().min(0).max(5),
    dateRead: z.coerce.date().optional(),
    dateAdded: z.coerce.date(),
    // Remote Goodreads cover URL by default; can be swapped for a local path.
    cover: z.string().optional(),
    goodreadsId: z.string().optional(),
    goodreadsUrl: z.string().optional(),
    isbn: z.string().optional(),
    shelves: z.array(z.string()).default([]),
    pageCount: z.number().optional(),
    // Hidden from listings while true (use for stubs / truncated imports).
    draft: z.boolean().default(false),
    // Set by the importer when RSS truncated the review text.
    needsReviewText: z.boolean().default(false),
  }),
});

export const collections = { reviews };
