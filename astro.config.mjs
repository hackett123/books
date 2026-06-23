// @ts-check
import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

// Update `site` to your real domain before deploying (used for sitemap + RSS).
export default defineConfig({
  site: "https://example.com",
  integrations: [sitemap()],
  markdown: {
    shikiConfig: {
      theme: "github-light",
      wrap: true,
    },
  },
});
