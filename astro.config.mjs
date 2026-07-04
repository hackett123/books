// @ts-check
import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import pagefind from "astro-pagefind";

export default defineConfig({
  site: "https://books.michaelhackett.me",
  base: "/",
  // pagefind builds a static search index from the built HTML at build time.
  build: { format: "directory" },
  integrations: [sitemap(), pagefind()],
  markdown: {
    shikiConfig: {
      theme: "github-light",
      wrap: true,
    },
  },
});
