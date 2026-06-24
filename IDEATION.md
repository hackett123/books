# Ideation — future development

A running list of ideas for the blog. Not a roadmap or a backlog — just options,
roughly grouped, with a gut-feel on effort (S / M / L) and why each might be
worth it. Cherry-pick freely.

## Shipped

- ✅ **Reading timeline** (M) — `/timeline`: every dated read (reviews + shelf)
  pinned to when you finished it, grouped by year/month, with a centered axis
  and friends' reads flanking the sides.
- ✅ **"Books per month" heatmap** (M) — `/stats` (and per-friend): years ×
  months grid shaded by how many books you finished. Squares deep-link into the
  timeline.
- ✅ **With-friends view** (L) — `/friends`: per-friend quick stats, ratings
  histogram, heatmap, top authors, currently-reading, and recent reads, sourced
  from their Goodreads userIds (`src/data/friends.json`, `npm run sync:friends`).
  The timeline can overlay friends' reads, with a "✓ you both read it" badge on
  shared books.
- ✅ **Shelf as homepage** (S) — the full library grid is the front door; the
  reviews feed moved to `/reviews`. Reviewed books carry an ink-underline.
- ✅ **Homepage star filter** (S) — `/?rating=N` filters the shelf by full-star
  bucket (partial stars floored); the `/stats` histogram links into it.
- ✅ **Header search** (S) — a `⌕` search entry lives in the header nav (Pagefind).
- ✅ **Mobile nav** (S) — the header collapses into a hamburger dropdown under
  ~56rem instead of overflowing off-screen.
- ✅ **Web fonts** (S) — self-hosted Fraunces (display serif) + Inter (body) via
  Fontsource; tuned by `--font-display` / `--font-sans` in `tokens.css`.
- ✅ **Subtle reading-progress / nocturne touches** (S) — a thin oxblood→indigo
  scroll-progress bar (CSS scroll-timeline, no JS) with a moon on the leading
  edge, on review pages; plus a gentle content fade-in.
- ✅ **Print stylesheet** (S) — `@media print` in `global.css` hides chrome,
  widens the measure, blackens text, and prints link URLs.

## Next up

- **Author pages** (M) — _chosen._ `/authors/<name>` with everything you've read
  by that author (reviews + shelf, ratings, dates). `bookstats.ts` already
  computes `topAuthors`, so this is mostly a new route + `getStaticPaths`; link
  to it from `/stats` and from book listings.

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

- **More homepage sort/filter** (M) — the star filter shipped; could add sort by
  year or author, "highest rated first", etc. Pure client-side over the static
  list.
- **Related reviews** (M) — "if you liked this" by shared author / future tags.

## Data & stats

- **Pages-read backfill** (S) — `num_pages` is sparse in the RSS, so the "Pages"
  stat is hidden. The Goodreads CSV export has reliable page counts if you ever
  want that number to show.
- **Rating-over-time chart** (M) — are you getting harsher or kinder? Average by
  month/year as a line. The monthly data already exists.
- **Genre / language breakdown** (M) — would need tags or a data source; your
  reading skews Japanese/Korean literary fiction, which is a fun thing to chart.

## Friends

- **Books in common** (S–M) — you already detect both-read on the timeline;
  surface a shared-shelf view per friend + where your ratings agree or diverge.
- **Fold `sync:friends` into `npm run sync`** (S) — one command to refresh your
  own reads *and* friends' shelves / currently-reading.

## Character & polish

- **Rename "Marginalia"** (S) — the name + crescent mark are still placeholders
  (`src/layouts/BaseLayout.astro`).
- **Per-review OG/share images** (M) — auto-generate cover + title + stars cards
  so shared links look good (Astro can render these at build time).

## Plumbing

- **Comments / reactions** (M) — static-friendly options (e.g. webmentions, or a
  lightweight hosted widget) if you ever want feedback.
- **Goodreads CSV importer** (M) — an alternative/able-to-coexist importer that
  reads the CSV export. Unlocks custom shelves (genres), reliable page counts,
  and re-reads — the things RSS can't give us.
- **Content backups** (S) — the reviews are the irreplaceable part; the git repo
  already is the backup, but worth a note to keep it pushed somewhere remote.

---

_Constraints worth remembering:_ it's a static Astro site (no server at
runtime), deployed to GitHub Pages under the `/books` base path (so internal
links must go through `withBase()`); Goodreads RSS caps at ~100 books/shelf,
omits custom shelves, and has sparse page counts; per-review Goodreads pages are
login-gated. The CSV export is the escape hatch for richer data.
