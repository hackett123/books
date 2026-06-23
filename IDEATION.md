# Ideation — future development

A running list of ideas for the blog. Not a roadmap or a backlog — just options,
roughly grouped, with a gut-feel on effort (S / M / L) and why each might be
worth it. Cherry-pick freely.

## Already discussed / deferred

- **Deploy to Netlify** (S) — set the real domain in `astro.config.mjs` (`site:`)
  and connect the repo. It isn't live yet.
- **Rename "Marginalia"** (S) — the name + crescent mark are placeholders
  (`src/layouts/BaseLayout.astro`).
- **Fold read-import into `npm run sync`** (S) — one command to pull new
  finished books (reviews + shelf) *and* refresh currently-reading/to-read.
- **Self-refreshing build** (S–M) — run sync during the Netlify build (or on a
  schedule / Goodreads-triggered hook) so currently-reading updates without a
  manual step.
- **Harden import dedup by `goodreadsId`** (S) — declined for now; only matters
  if review files get renamed or Goodreads titles change.

## Content & writing

- **Series grouping** (M) — many reads are part of series (the `(Series, #1)`
  suffix is already in titles). Parse it, link entries, show reading order.
- **Re-reads** (S–M) — model a book read more than once (multiple dates /
  evolving thoughts). Goodreads flattens this; the blog doesn't have to.
- **"Did not finish" shelf** (S) — a DNF list with a one-line why. Honest and
  on-brand for the voice.
- **Spoiler toggles** (S) — a `<details>`-based spoiler block for reviews that
  need to get into plot.
- **Footnotes / marginalia in the actual margin** (M) — lean into the name:
  sidenotes that sit in the page margin on wide screens.

## Discovery & navigation

- **Filter/sort on the homepage** (M) — by rating, year, author; "highest rated
  first" etc. Pure client-side over the static list.
- **Related reviews** (M) — "if you liked this" by shared author / future tags.
- **Author pages** (M) — `/authors/<name>` with everything by that author
  (the data already exists; `/stats` proves the grouping works).
- ✅ **Reading timeline** (M) — _done._ `/timeline`: every read book (reviews +
  shelf) pinned to when you finished it, grouped by year.

## Data & stats

- **Pages-read backfill** (S) — `num_pages` is sparse in the RSS, so the "Pages"
  stat is hidden. The Goodreads CSV export has reliable page counts if you ever
  want that number to show.
- **Rating-over-time chart** (M) — are you getting harsher or kinder? Average by
  month/year as a line.
- **Genre / language breakdown** (M) — would need tags or a data source; your
  reading skews Japanese/Korean literary fiction, which is a fun thing to chart.
- ✅ **"Books per month" heatmap** (M) — _done._ On `/stats`: years × months
  grid shaded by how many books you finished each month.

## Character & polish

- **Dark mode** (S) — tokens are already structured for it; there's a
  commented-out starting block in `src/styles/tokens.css`.
- **Per-review OG/share images** (M) — auto-generate cover + title + stars cards
  so shared links look good (Astro can render these at build time).
- ✅ **Web fonts** (S) — _done._ Self-hosted Fraunces (literary display serif)
  for headings + Inter for body, via Fontsource; tuned by `--font-display` /
  `--font-sans` in `tokens.css`.
- ✅ **Subtle reading-progress / nocturne touches** (S) — _done._ A thin
  oxblood→indigo scroll-progress bar (CSS scroll-timeline, no JS) with a moon on
  the leading edge, on review pages; plus a gentle content fade-in.
- ✅ **Print stylesheet** (S) — _done._ `@media print` in `global.css` hides
  chrome, widens the measure, blackens text, and prints link URLs.

## Plumbing

- **Comments / reactions** (M) — static-friendly options (e.g. webmentions, or a
  lightweight hosted widget) if you ever want feedback.
- **Search upgrades** (S) — Pagefind filters by rating/year once tags or facets
  exist; surface a search box in the header instead of a separate page.
- **Goodreads CSV importer** (M) — an alternative/able-to-coexist importer that
  reads the CSV export. Unlocks custom shelves (genres), reliable page counts,
  and re-reads — the things RSS can't give us.
- **Content backups** (S) — the reviews are the irreplaceable part; the git repo
  already is the backup, but worth a note to keep it pushed somewhere remote.

---

_Constraints worth remembering:_ it's a static Astro site (no server at
runtime); Goodreads RSS caps at ~100 books/shelf, omits custom shelves, and has
sparse page counts; per-review Goodreads pages are login-gated. The CSV export is
the escape hatch for richer data.
