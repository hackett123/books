# Marginalia — a self-updating book blog

A personal reading site built with [Astro](https://astro.build), deployed free
on GitHub Pages, and **kept in sync with Goodreads automatically**: a nightly
GitHub Action pulls new reviews, shelves, and friends' reading, commits the
changes, and redeploys. You write on Goodreads; the site follows. Reviews are
plain Markdown files you own and edit.

What you get out of the box:

- **The Shelf** (`/`) — every book you've read as a filterable, sortable cover
  grid; reviewed titles link to full review pages (`/reviews/<slug>`).
- **Year in Books** (`/year/<year>`) — a wrap-up per year: headline numbers,
  the five-star shelf, the year month by month. Past years backfill themselves.
- **Stats** (`/stats`) — rating histogram, books-by-month heatmap, reading
  pace (streaks, dry spells), most-read authors, and a subject breakdown via
  Open Library.
- **Friends** (`/friends`) — per-friend stats, heatmaps, and year pages from
  their public shelves; **books in common** with a rating-agreement score; and
  **"from your friends"** — books they loved that you haven't read.
- **Timeline** (`/timeline`) — your reading history on an axis, with friends'
  reads overlaid.
- Plus `/to-read` (the TBR pile, with a "pick my next read" button),
  `/favorites`, `/authors`, full-text search (Pagefind), RSS, print styles,
  dark mode, JSON-LD on reviews, and cover-morph view transitions.

> **Want your own?** Fork it, point it at your Goodreads, deploy — see
> [Fork & host your own](#fork--host-your-own) below (~10 minutes).

---

## How the sync works

Two GitHub Actions workflows do all the operating:

- **`sync.yml`** runs nightly (and on demand from the Actions tab). It pulls
  your read shelf (`import`), currently-reading/to-read (`sync`), friends'
  shelves (`sync:friends`), and Open Library metadata for new books
  (`enrich`). If anything changed it commits and kicks off the deploy.
- **`deploy.yml`** builds the site and publishes to GitHub Pages on every push
  to `main` — whether from the nightly sync or from you.

So the steady state is: **finish a book on Goodreads, rate it, review it —
the site updates itself overnight.** Everything can still be run locally (see
[the reference](#goodreads-import--sync--reference)) if you'd rather not wait.

Two properties keep the automation safe:

- `import` is **add-only** — it never overwrites an existing review file, so
  edits you make to your Markdown are never clobbered by a sync.
- All synced data is **committed to git** — the repo is the database, every
  nightly change is a reviewable diff, and a bad sync is a `git revert` away.

---

## Fork & host your own

Your own copy, backfilled from *your* Goodreads, on GitHub Pages.

### 1. Fork the repo

Fork this repo into your GitHub account. The **repo name becomes the URL path**
(this one is `books`, served at `https://<you>.github.io/books`).

### 2. Point it at your Goodreads

Find your Goodreads **userId** — open your profile and copy the number in the URL
(`goodreads.com/user/show/`**`12345678`**`-name`). Your profile/shelves must be
**public**. Put it in `goodreads.json`:

```json
{ "userId": "12345678" }
```

### 3. Clear out the original content

The fork ships with my books — wipe them first, **before** importing. (`import`
is add-only and skips files that already exist, so if we reviewed the same book
it would keep *mine* and skip *yours* unless you clear first.)

- delete every `.md` file in `src/content/reviews/` (they're all mine; your
  import adds yours);
- reset `src/data/overrides.json` to `{ "books": [] }`,
  `src/data/quotes.json` to `[]`, and `src/data/enrichment.json` to `{}`
  (hand-entered / generated-for-my-books data);
- reset `src/data/friends.json` to `[]` and delete `src/data/friends/*.json`
  (or replace with your own friends — see [With friends](#with-friends)).

### 4. Install & pull in your books

```bash
source ~/.nvm/nvm.sh        # if Node 20.3+ isn't already on PATH
npm install
npm run import              # your reviews -> src/content/reviews/ + shelf.json
npm run sync                # currently-reading + to-read -> shelves.json
npm run enrich              # page counts + subjects from Open Library
```

`import` reads the userId from `goodreads.json`. This backfill is a **one-time**
step — after this, the nightly workflow keeps everything current.

### 5. Set the URL paths

In `astro.config.mjs`:

```js
site: "https://<your-username>.github.io",
base: "/<your-repo-name>",   // e.g. "/books"; DELETE this line if the repo is
                             // named "<your-username>.github.io" (a user site)
```

`site` + `base` drive every absolute URL (sitemap, RSS, JSON-LD) and the
`withBase()` helper in `src/lib/url.ts`, so internal links work under the
`/<repo>` path. Always route new internal links through `withBase()` — don't
hardcode the base.

### 6. Turn on Pages, allow the sync to commit, push

1. **Settings → Pages → Build and deployment → Source: GitHub Actions.**
2. **Settings → Actions → General → Workflow permissions → "Read and write
   permissions"** — the nightly sync needs this to commit what it fetched.
   (Without it the site still deploys fine; only the auto-sync commits fail.)
3. Push to `main`. Watch the **Actions** tab; when the deploy is green, your
   site is live at `https://<you>.github.io/<repo>`.

### 7. Make it yours

- Rename the site in `src/layouts/BaseLayout.astro` (`siteName` / `tagline`)
  and `src/pages/rss.xml.js`.
- Put your name in `siteAuthor` in `src/pages/reviews/[...slug].astro` (it's
  the review author in the JSON-LD that search engines read).
- Edit `src/pages/about.astro` with your bio.
- Tune the whole look from `src/styles/tokens.css` (see
  [Where the design lives](#where-the-design-lives)); `/styleguide` previews
  every token + component.

---

## Local development

```bash
source ~/.nvm/nvm.sh   # if Node 20.3+ isn't on PATH
npm install            # one-time
npm run dev            # http://localhost:4321
npm run build          # production build -> dist/
npm run preview        # serve the built dist/ to spot-check
```

---

## What's what — project structure

```
reviewer/
├─ astro.config.mjs        Site config: `site` + `base` (URL paths), integrations.
├─ goodreads.json          Your Goodreads userId (used by import + sync).
├─ package.json            Scripts: dev / build / preview / import / sync(:friends) / enrich.
│
├─ .github/workflows/
│  ├─ deploy.yml           Builds + deploys to GitHub Pages on every push to main.
│  └─ sync.yml             Nightly cron: import + sync + sync:friends + enrich,
│                          commits changes, then triggers the deploy.
│
├─ scripts/
│  ├─ goodreads-lib.mjs    Shared RSS fetch/parse helpers (paginates whole shelves).
│  ├─ import-goodreads.mjs Goodreads review import (backfill + add-new).
│  ├─ sync-shelves.mjs     Re-runnable sync of currently-reading / to-read.
│  ├─ sync-friends.mjs     Fetch friends' public shelves -> data/friends/*.json.
│  └─ enrich-openlibrary.mjs  Page counts + subjects from Open Library
│                          -> src/data/enrichment.json (incremental).
│
├─ public/                 Files served as-is at the site root.
│  └─ favicon.svg          The crescent-moon favicon.
│
└─ src/
   ├─ content.config.ts    Review frontmatter SCHEMA (allowed fields + types).
   │
   ├─ content/reviews/     ← YOUR REVIEWS. One Markdown file per book.
   │
   ├─ data/
   │  ├─ shelf.json        Rated-but-unreviewed read books -> homepage (generated).
   │  ├─ shelves.json      currently-reading + to-read (generated by `npm run sync`).
   │  ├─ overrides.json    ← Hand corrections/additions for shelf books (you edit).
   │  ├─ quotes.json       ← Commonplace book entries for /quotes (you edit).
   │  ├─ friends.json      ← Friends to track: { name, slug, userId } (you edit).
   │  ├─ friends/<slug>.json  Per-friend shelves (generated by `sync:friends`).
   │  └─ enrichment.json   Open Library pages/subjects (generated by `enrich`).
   │
   ├─ lib/
   │  ├─ reviews.ts        Helpers: sorting, the homepage EXCERPT length, dates.
   │  ├─ library.ts        Merged read-books list + timeline grouping + shelf dedup.
   │  ├─ shelf.ts          Reads shelf.json and applies overrides.json.
   │  ├─ bookstats.ts      computeStats() + computePace() — shared with friends.
   │  ├─ friends.ts        Loads data/friends/*.json + computes each friend's stats.
   │  ├─ compare.ts        Books-in-common + rating-agreement per friend.
   │  ├─ recommend.ts      "From your friends" recs (4★+ books you haven't read).
   │  ├─ enrichment.ts     Reads enrichment.json; subject breakdown for /stats.
   │  ├─ authors.ts        Author grouping for /authors pages.
   │  ├─ tags.ts           Tag/shelf grouping for /tags.
   │  ├─ stats.ts          The owner's /stats data (wraps computeStats).
   │  └─ url.ts            `withBase()` — prefixes internal links with `base`.
   │
   ├─ layouts/
   │  └─ BaseLayout.astro  Page shell: <head> (+ per-page slot), nav, footer.
   │
   ├─ components/
   │  ├─ StarRating.astro  Star rating (supports halves).
   │  ├─ BookCover.astro   Cover image + fallback; carries the view-transition name.
   │  ├─ ReviewCard.astro  A single row in the reviews feed.
   │  ├─ Heatmap.astro     Books-by-month grid (owner stats + friends).
   │  ├─ Timeline.astro    The banded axis-and-flanks reading timeline.
   │  ├─ YearInBooks.astro Year-wrap-up body (owner + friend year pages).
   │  └─ Divider.astro     Asterism (⁂) section divider — part of the motif.
   │
   ├─ pages/               Each file = a URL (Astro file-based routing).
   │  ├─ index.astro          /            Homepage = full library grid (all
   │  │                                    reads); star filter (?rating=N);
   │  │                                    reviewed titles get the ink underline.
   │  ├─ reviews/index.astro   /reviews     The review feed + "currently reading".
   │  ├─ reviews/[...slug].astro  /reviews/<slug>  A single review (+ JSON-LD).
   │  ├─ favorites.astro      /favorites   5★ "shelf of honor" gallery.
   │  ├─ to-read.astro        /to-read     The TBR pile + "pick my next read".
   │  ├─ year/[year].astro    /year/<year> Year-in-books wrap-up per year.
   │  ├─ authors/…            /authors(/<slug>)  Everything read, by author.
   │  ├─ friends/index.astro  /friends     Friends overview + "from your friends" recs.
   │  ├─ friends/[slug].astro /friends/<slug>  Friend stats, books in common,
   │  │                                    year links, latest 20 reads.
   │  ├─ friends/[slug]/year/[year].astro  /friends/<slug>/year/<year>
   │  │                                    A friend's own year wrap-up.
   │  ├─ timeline.astro       /timeline    Your reads on the axis, friends flanking.
   │  ├─ timeline/[slug].astro /timeline/<slug>  A friend on the axis, you flanking.
   │  ├─ quotes.astro         /quotes      Commonplace book (from data/quotes.json).
   │  ├─ stats.astro          /stats       Reading stats, pace, subjects, year links.
   │  ├─ tags/index.astro     /tags        Tag cloud (needs shelf data — see note).
   │  ├─ tags/[tag].astro     /tags/<tag>  Reviews for one shelf/tag.
   │  ├─ search.astro         /search      Full-text search (Pagefind).
   │  ├─ about.astro          /about       Edit this with your own bio.
   │  ├─ styleguide.astro     /styleguide  Design canvas (all tokens + components).
   │  └─ rss.xml.js           /rss.xml     The blog's RSS feed.
   │
   └─ styles/
      ├─ tokens.css        ← DESIGN CONTROL PANEL. Colors, fonts, sizes, spacing, motif.
      └─ global.css        Base styling, .prose, motif utilities, view transitions.
```

### The "Nocturne" motif

The site's character lives in a few tunable places (all in `tokens.css` /
`global.css`): a **crescent-moon** brand mark (doubling as the dark-mode
toggle), **serif display headings** over a sans body, a **hand-drawn ink
underline** on links/active nav (`--ink-underline`), the **asterism (⁂)
divider** (`Divider.astro`), and **cover-morph view transitions** — clicking a
cover glides it into the review page header (pure CSS `@view-transition`, no
JS router; Firefox just navigates normally). To go back to plain clean, set
`--font-display: var(--font-sans)`, remove the `.ink-underline` background
rules, and delete the view-transitions block in `global.css`.

---

## Writing reviews

**Goodreads is where you write; this blog mirrors it.** When you finish a book:

1. On **Goodreads**: mark it **Read**, give it a **star rating**, and write
   your review there.
2. …and that's it. The nightly sync picks it up, commits it, and redeploys.
   In a hurry? Trigger **"Nightly Goodreads sync"** manually from the Actions
   tab, or run it locally:

   ```bash
   source ~/.nvm/nvm.sh   # if Node isn't on PATH
   npm run import         # adds NEW reviews + refreshes the rating-only shelf
   npm run sync           # refreshes currently-reading / to-read
   ```
   then commit and push — the deploy Action rebuilds either way.

`import` is **add-only**: it writes a review file for each newly reviewed book
and **never overwrites** an existing one, so your local tweaks are safe. A book
that was rating-only and now has a review automatically moves off the shelf
into a review on the next import.

### Things to know

- **Editing an old review on Goodreads does _not_ re-sync** (add-only by
  design). If you revise one, edit its file in `src/content/reviews/` directly —
  that copy is canonical from then on.
- **Very long reviews can be truncated** by Goodreads' RSS feed. The importer
  detects this and flags the file `draft: true` + `needsReviewText: true`; paste
  the full text in and remove those two lines.
- **Goodreads-only metadata** (read-dates it's missing, half-star ratings) lives
  in `src/data/overrides.json` for shelf books, or directly in a review's
  frontmatter. These survive re-imports. Note: when a rating-only book *becomes*
  a review, re-import writes a fresh file with Goodreads' integer rating — so
  re-apply any half-star/date there if you'd set it in overrides.
- **Read dates power a lot** — the timeline, heatmaps, year pages, and pace
  stats all pin books to their `dateRead`. Goodreads only knows it if you set
  it, so it's worth filling in the "date finished" field there (or patching
  via `overrides.json` after the fact).

### Writing a review by hand (optional)

You can also just create `src/content/reviews/<slug>.md` yourself — the filename
becomes the URL (`the-vegetarian.md` → `/reviews/the-vegetarian`):

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
> blockquotes, and links all work.
```

All allowed fields are defined in `src/content.config.ts`; an unknown field
fails the build. **Drafts** (`draft: true`) stay out of listings/RSS but are
previewable at their `/reviews/<slug>` URL.

---

## With friends

Friends' reading comes from their **public** Goodreads shelves and shows up in
four places:

- **`/friends`** — a card per friend (stats, heatmap, current reads, books in
  common count), capped off with **"From your friends"**: books they rated 4★+
  that aren't on your shelf or to-read pile, the ones several friends loved
  first.
- **`/friends/<slug>`** — their full stats, plus **books in common**: every
  shared read with both ratings side by side, how often you land within a star
  of each other, and your starkest disagreement.
- **`/friends/<slug>/year/<year>`** — their own Year in Books wrap-ups, linked
  from year chips on their page.
- **`/timeline`** — a "Show friends' timelines" toggle overlays their reads
  onto yours, color-coded and aligned by month, with a "✓ you both read it"
  badge. Each friend also gets `/timeline/<slug>` with themselves on the axis.

**Add a friend:** put them in `src/data/friends.json` (the `userId` is the
number in their profile URL, `goodreads.com/user/show/`**`12345678`**`-name`):

```json
[
  { "name": "Mic", "slug": "mic", "userId": "44710141" }
]
```

Then fetch their data (or just wait for the nightly sync):

```bash
npm run sync:friends     # writes src/data/friends/<slug>.json
```

This is **static, committed data** — friends' pages reflect the last sync,
and the nightly workflow keeps them fresh. The fetch paginates through their
**whole** read shelf, not just the newest 100. Caveats: a friend whose profile
isn't public is skipped with a warning, and a friend who doesn't set read
dates on Goodreads gets no heatmap, timeline, or year pages (there's nothing
to pin their books to).

---

## Where the design lives

Everything visual is centralized so you rarely touch component files:

| Want to change… | Edit… |
|---|---|
| Colors, fonts, text sizes, spacing, page widths, accent | `src/styles/tokens.css` |
| Base look of paragraphs, headings, links, quotes, code | `src/styles/global.css` |
| Long-form review body styling (the `.prose` rules) | `src/styles/global.css` |
| View transitions (cover morph) on/off + behavior | `@view-transition` block in `src/styles/global.css` |
| Site name, nav links, header/footer | `src/layouts/BaseLayout.astro` |
| Homepage (shelf) intro copy | `src/pages/index.astro` |
| Reviews feed intro copy | `src/pages/reviews/index.astro` |
| How much preview text shows on feed cards | `excerpt()` in `src/lib/reviews.ts` |

**Workflow:** run `npm run dev`, open **`/styleguide`**, and edit
`src/styles/tokens.css`. Every color swatch, type size, and component on that
page updates live — it's the best place to dial in the look before touching real
pages. Each `.astro` component also has a scoped `<style>` block at the bottom
for fine-tuning that specific piece.

---

## Goodreads import & sync — reference

Three commands talk to Goodreads and one to Open Library. The Goodreads ones
read your userId from `goodreads.json` (pass a profile URL or numeric id as an
argument to override). The nightly workflow runs all four in order; everything
here is also safe to run by hand.

### `npm run import`

Pulls your **read** shelf and writes:

- books **with a written review** → `src/content/reviews/<slug>.md`
- books **rated but not reviewed** → `src/data/shelf.json` (the homepage shelf)
- reviews Goodreads truncates → flagged `draft: true` + `needsReviewText: true`

It's **add-only** — existing review files are never overwritten, so your edits
survive; `shelf.json` is regenerated each run.

Flags: `--shelf read` (which shelf; default `read`), `--download-covers` (save
covers into `public/covers/` instead of hotlinking from Goodreads),
`--force` (see incremental sync below).

### `npm run sync`

Refreshes the **currently-reading** and **to-read** shelves into
`src/data/shelves.json`. Pure data, regenerated each run — safe to run anytime.

### `npm run sync:friends`

Fetches each friend's read shelf + currently-reading into
`src/data/friends/<slug>.json`, walking every page of their shelf.

### `npm run enrich`

Looks each read book up on **Open Library** and caches page counts, subjects,
and edition languages into `src/data/enrichment.json` (committed). Fills the
"Pages" stat where Goodreads' RSS has none and powers the "Common threads"
subject chart on `/stats`. **Incremental**: already-cached books (including
confirmed misses) are skipped, so re-runs only fetch new books; `--force`
re-fetches everything. Rate-limited to one polite request per ~0.4s.

### Incremental sync & `--force`

`import` and `sync:friends` are **incremental**. The Goodreads `read` feed is
ordered by date-added (newest first), so each run only reads books added since
the last sync and stops paginating once it reaches already-known ones — much
faster than re-walking a long shelf every time. The last-sync time per person is
kept in `.sync-cache.json` at the repo root (**git-ignored** — it's local state,
so a fresh clone or a CI runner just does a full sync).

The tradeoff: **editing an old review on Goodreads doesn't move its date-added,
so an incremental sync won't notice the change.** Run with `--force`
(`npm run import -- --force`, `npm run sync:friends -- --force`) to ignore the
cache and re-read the whole shelf. (`npm run sync` — currently-reading / to-read —
is always a full refresh and ignores the cache.)

### The nightly workflow (`sync.yml`)

Runs at **07:23 UTC** (and on demand: Actions tab → "Nightly Goodreads sync" →
Run workflow). It executes `import` → `sync` → `sync:friends` → `enrich`,
commits as `github-actions[bot]` only if something changed, and then dispatches
the deploy workflow explicitly (pushes from a workflow's own token don't
trigger push-based workflows). Requirements: **Workflow permissions set to
"Read and write"** (fork step 6). To pause the automation, disable the workflow
from the Actions tab; to change the schedule, edit the `cron:` line.

> **RSS limits:** Goodreads' RSS feed omits per-book custom shelves (genres)
> and often lacks page counts and read dates. Full review text is in the feed,
> but very long reviews get truncated (the importer flags these); the public
> per-review pages are login-gated, so truncated text is pasted in by hand.

> **Fixing/adding shelf books (`src/data/overrides.json`):** Goodreads often
> omits read-dates and only allows whole-star ratings, and `npm run import`
> regenerates `shelf.json` from scratch — so don't hand-edit `shelf.json`.
> Instead put corrections in `src/data/overrides.json`, matched to a shelf book
> by title:
>
> ```json
> { "books": [
>   { "title": "A Tale for the Time Being", "rating": 4.25, "dateRead": "2026-03-01" }
> ] }
> ```
>
> Any field you set wins over the imported value, fractional ratings are fine,
> and these survive re-imports. A title with no matching shelf entry is **added**
> (give it `author`, `cover`, `url` too) — handy for books Goodreads doesn't
> have. Reviews aren't controlled here: edit those Markdown files directly.

> **Tags / custom shelves:** Goodreads' RSS does **not** expose per-book custom
> shelves (genres), so the importer can't populate tags. Add them yourself by
> putting `shelves: ["sci-fi", "favorites"]` in a review's frontmatter — the
> `/tags` page and footer link appear automatically once any review has them.
> (If you ever want genre tags backfilled in bulk, the Goodreads CSV export has
> a "Bookshelves" column we could parse.)
