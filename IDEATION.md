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
- ✅ **Author pages** (M) — `/authors` + `/authors/<slug>`: everything you've
  read by an author, linked from `/stats` and book listings (`lib/authors.ts`).
- ✅ **Friends history past the 100-book RSS cap** (S) — productionized:
  `fetchShelf` in `goodreads-lib.mjs` walks `&page=N` until a short page and
  dedups by `bookId`, so every sync gets whole shelves.
- ✅ **Nightly auto-sync** (S) — `.github/workflows/sync.yml` runs
  `import` / `sync` / `sync:friends` / `enrich` on a nightly cron, commits any
  changes, and dispatches the deploy — the site now mirrors Goodreads on its
  own.
- ✅ **Year in Books wrap-ups** (M) — `/year/<year>` for every year with a
  dated read (2025 and earlier backfilled automatically): headline numbers,
  the five-star shelf, and the year month by month. Linked from `/stats`.
- ✅ **To-read pile** (S) — `/to-read` renders the synced to-read shelf (it was
  data-only before), with a "pick my next read" random spotlight button.
- ✅ **Books in common / taste match** (M) — each `/friends/<slug>` page lists
  shared reads with both ratings side by side, an agreement score (% within
  one star), and the biggest split (`lib/compare.ts`).
- ✅ **"From your friends" recommendations** (S) — `/friends` ends with books
  friends rated 4★+ that aren't on your shelf or pile, multi-fan books first
  (`lib/recommend.ts`).
- ✅ **Reading-pace stats** (S) — longest/current monthly streak, longest dry
  spell, busiest month on `/stats` (`computePace` in `bookstats.ts`).
- ✅ **Open Library enrichment** (M) — `npm run enrich` caches page counts +
  subjects + edition languages into `src/data/enrichment.json`; fills the
  Pages stat and powers the "Common threads" subject chart on `/stats`.
- ✅ **JSON-LD structured data** (S) — schema.org `Review`/`Book` on every
  review page, so search results can show the star rating.
- ✅ **View transitions** (S) — cross-document CSS view transitions (no JS
  router): covers morph from shelf/feed/favorites/year grids into the review
  header; respects reduced motion. Firefox degrades to normal navigation.

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
- **Sync highlights from Kobo / Kindle** (M–L) — the `/quotes` commonplace book
  exists but is empty, so it's currently unlinked from the header. Figure out how
  to pull real highlights in instead of hand-entering them. Sources to
  investigate: Kobo keeps highlights in an on-device SQLite DB
  (`KoboReader.sqlite`, the `Bookmark` table — `Text`, `Annotation`, plus a
  content/book id to join on) that we could parse when the e-reader is plugged
  in; Kindle exposes `My Clippings.txt` on the device and a per-book "export
  notebook" from the Kindle app/Notebook web view. Open questions: a stable book
  identifier to match a highlight to a review/shelf entry, dedup across re-syncs
  (lean on the existing incremental-sync/cache pattern), and whether highlights
  live in committed JSON like `quotes.json` or their own data file. Re-add the
  `/quotes` nav link once there's data to show.

## Discovery & navigation

- **More homepage sort/filter** (M) — the star filter shipped; could add sort by
  year or author, "highest rated first", etc. Pure client-side over the static
  list.
- **Related reviews** (M) — "if you liked this" by shared author / future tags.

## Data & stats

- **Rating-over-time chart** (M) — are you getting harsher or kinder? Average by
  month/year as a line. The monthly data already exists.
- **Original-language / in-translation breakdown** (M) — the Open Library
  enrichment stores *edition* languages, but "originally written in Japanese"
  isn't in that data. Needs a better source or a hand-tagged field; your
  reading skews Japanese/Korean literary fiction, which is a fun thing to
  chart honestly.

## Friends

- **Fold `sync:friends` into `npm run sync`** (S) — one command to refresh your
  own reads *and* friends' shelves / currently-reading. (Low urgency now that
  the nightly workflow runs everything anyway.)
- **Taste-match deep dive** (M) — the agreement score shipped; could extend to
  a scatter of "your rating vs theirs" or per-genre agreement once tags exist.

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
links must go through `withBase()`); Goodreads RSS defaults to 100 books/shelf
but honors `&page=N` / `&per_page` for the full shelf (the `/review/list/` HTML
endpoint is now login-gated, but the RSS feed is not), omits custom shelves, and
has sparse page counts; per-review Goodreads pages are login-gated. The CSV
export remains the escape hatch for custom shelves and reliable page counts.
