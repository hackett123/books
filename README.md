# Marginalia — a book reviews blog

A personal, static book-reviews blog built with [Astro](https://astro.build).
Reviews are plain Markdown files you own and edit. The library was backfilled
once from Goodreads; from here, the blog is the source of truth.

> **"Marginalia" is a placeholder name.** Rename it in
> `src/layouts/BaseLayout.astro` (`siteName` / `tagline`) and
> `src/pages/rss.xml.js` (the feed `title`/`description`).

---

## Quick start

```bash
# Node 20.3+ required (this machine has it via nvm — run this first in a new shell):
source ~/.nvm/nvm.sh

npm install      # one-time
npm run dev      # http://localhost:4321
npm run build    # production build -> dist/
npm run preview  # serve the built dist/ to spot-check
```

---

## What's what — project structure

```
reviewer/
├─ astro.config.mjs        Site config. Set your real domain in `site:` before deploy.
├─ netlify.toml            Netlify build settings (build cmd + publish dir).
├─ package.json            Scripts: dev / build / preview / import.
│
├─ scripts/
│  └─ import-goodreads.mjs One-time Goodreads backfill (see "Importing" below).
│
├─ public/                 Files served as-is at the site root.
│  └─ favicon.svg          The ¶ favicon.
│
└─ src/
   ├─ content.config.ts    Review frontmatter SCHEMA (allowed fields + types).
   │
   ├─ content/reviews/     ← YOUR REVIEWS. One Markdown file per book.
   │
   ├─ data/
   │  └─ shelf.json        Rated-but-unreviewed books shown on /shelf (generated).
   │
   ├─ lib/
   │  └─ reviews.ts        Helpers: sorting, the homepage EXCERPT length, dates.
   │
   ├─ layouts/
   │  └─ BaseLayout.astro  Page shell: <head>, header/nav, footer, site name.
   │
   ├─ components/
   │  ├─ StarRating.astro  Star rating (supports halves).
   │  ├─ BookCover.astro   Cover image, with a typographic fallback if none.
   │  └─ ReviewCard.astro  A single row in the homepage feed.
   │
   ├─ pages/               Each file = a URL (Astro file-based routing).
   │  ├─ index.astro          /            The review feed.
   │  ├─ reviews/[...slug].astro  /reviews/<slug>  A single review.
   │  ├─ shelf.astro          /shelf       Rated-but-unreviewed grid.
   │  ├─ about.astro          /about       Edit this with your own bio.
   │  ├─ styleguide.astro     /styleguide  Design canvas (all tokens + components).
   │  └─ rss.xml.js           /rss.xml     The blog's RSS feed.
   │
   └─ styles/
      ├─ tokens.css        ← DESIGN CONTROL PANEL. Colors, fonts, sizes, spacing.
      └─ global.css        Base element styling + .prose (long-form text) styles.
```

---

## Writing a new review

Create a file in `src/content/reviews/`. The **filename becomes the URL slug**
(`the-vegetarian.md` → `/reviews/the-vegetarian`). Use lowercase-with-dashes.

```markdown
---
title: "The Vegetarian"
author: "Han Kang"
rating: 4.5                          # 0–5, halves allowed
dateRead: 2026-05-01                 # optional
dateAdded: 2026-04-20                # required
cover: "https://…/cover.jpg"         # optional (omit for the text fallback)
shelves: ["fiction", "favorites"]    # optional
goodreadsUrl: "https://…"            # optional (adds a "View on Goodreads" link)
isbn: "…"                            # optional
pageCount: 188                       # optional
draft: false                         # optional; true = hide from listings
---

Your review goes here, in **Markdown**. Headings, _italics_, lists,

> blockquotes,

and links all work.
```

All allowed fields (and their types) are defined in `src/content.config.ts`.
If you add a field that isn't in the schema, the build will tell you.

**Drafts:** set `draft: true` to keep a review out of the homepage/RSS while you
work on it. You can still preview it directly at its `/reviews/<slug>` URL.

---

## Where the design lives

Everything visual is centralized so you rarely touch component files:

| Want to change… | Edit… |
|---|---|
| Colors, fonts, text sizes, spacing, page widths, accent | `src/styles/tokens.css` |
| Base look of paragraphs, headings, links, quotes, code | `src/styles/global.css` |
| Long-form review body styling (the `.prose` rules) | `src/styles/global.css` |
| Site name, nav links, header/footer | `src/layouts/BaseLayout.astro` |
| Homepage intro copy | `src/pages/index.astro` |
| How much preview text shows on feed cards | `excerpt()` in `src/lib/reviews.ts` |

**Workflow:** run `npm run dev`, open **`/styleguide`**, and edit
`src/styles/tokens.css`. Every color swatch, type size, and component on that
page updates live — it's the best place to dial in the look before touching real
pages. Each `.astro` component also has a scoped `<style>` block at the bottom
for fine-tuning that specific piece.

---

## Importing from Goodreads (one-time, already done)

The backfill has already run. You'd only need this again to re-pull or to set up
a fresh copy.

```bash
npm run import -- "https://www.goodreads.com/user/show/<id>-name"
# or just the numeric id:  npm run import -- 84930813
```

Options:
- `--shelf read` (default) — which Goodreads shelf to pull.
- `--download-covers` — save covers into `public/covers/` instead of hotlinking
  from Goodreads.

What it does:
- Books **with a written review** → `src/content/reviews/<slug>.md`
- Books **rated but not reviewed** → entries in `src/data/shelf.json` (the `/shelf` page)
- Reviews Goodreads truncates are flagged `draft: true` + `needsReviewText: true`.

**Re-running is safe:** existing review files are never overwritten, so your
edits survive. `shelf.json` is always regenerated.

> Note: Goodreads' RSS feed returns the ~100 most-recently-added books per shelf,
> which is everything for shelves under 100 books. The full review text lives in
> that feed (the public per-review pages are login-gated).

---

## Deploy (Netlify)

1. Set your real domain in `astro.config.mjs` (`site:`) so RSS/sitemap URLs are absolute.
2. Either connect the repo to Netlify (it reads `netlify.toml`) or run:

   ```bash
   npx netlify deploy --prod
   ```
