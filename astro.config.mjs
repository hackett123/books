// @ts-check
import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import pagefind from "astro-pagefind";

// Update `site` to your real domain before deploying (used for sitemap + RSS).
export default defineConfig({
  site: "https://hackett123.github.io",
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
