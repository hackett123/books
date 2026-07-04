// Pure reading-stats computation over a normalized list of read books. Shared by
// the owner's /stats page and each friend's data, so everyone is computed the
// same way (floor-bucketed ratings, UTC dates, etc.).

export interface ReadBook {
  rating: number;
  dateRead: Date | null;
  author: string;
  pageCount?: number;
  reviewed: boolean; // has a written review
}

export interface YearStats {
  year: number;
  count: number;
  reviewed: number;
  avgRating: number;
  pages: number;
}

export interface MonthRow {
  year: number;
  months: number[]; // length 12, Jan..Dec, count of books read
}

export interface StreakInfo {
  months: number;
  from: string; // "2026-03" month keys (match the timeline anchors)
  to: string;
}

export interface PaceStats {
  longestStreak: StreakInfo | null; // most consecutive months with ≥1 book
  currentStreak: number; // months, counted back from this (or last) month
  longestGap: { days: number; from: string; to: string } | null; // ISO dates
  busiestMonth: { year: number; month: number; count: number } | null; // month 0-11
}

export interface Stats {
  totalRead: number;
  totalReviewed: number;
  avgRating: number;
  totalPages: number;
  ratingHistogram: { rating: number; count: number }[]; // 1..5
  topAuthors: { author: string; count: number }[];
  byYear: YearStats[];
  monthly: MonthRow[]; // heatmap rows, newest year first
  maxMonth: number; // busiest single month (for heatmap scaling)
  unknownYear: number; // books read with no dateRead
  pace: PaceStats;
}

// Goodreads sometimes has double spaces in author names.
export function normalizeAuthor(a: string): string {
  return a.replace(/\s+/g, " ").trim();
}

// Month index = year*12 + month, so consecutive months differ by exactly 1
// across year boundaries (Dec 2025 -> Jan 2026).
function monthIdx(d: Date): number {
  return d.getUTCFullYear() * 12 + d.getUTCMonth();
}
function monthKey(idx: number): string {
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`;
}

// Reading-pace stats over the dated books: streaks of consecutive months with
// at least one finish, the longest dry spell between finishes, and the single
// busiest month. Books with no dateRead can't participate.
function computePace(books: ReadBook[], now = new Date()): PaceStats {
  const dated = books
    .filter((b) => b.dateRead && !isNaN(b.dateRead.getTime()))
    .sort((a, b) => a.dateRead!.getTime() - b.dateRead!.getTime());
  if (dated.length === 0) {
    return { longestStreak: null, currentStreak: 0, longestGap: null, busiestMonth: null };
  }

  const monthCounts = new Map<number, number>();
  for (const b of dated) {
    const i = monthIdx(b.dateRead!);
    monthCounts.set(i, (monthCounts.get(i) ?? 0) + 1);
  }
  const months = [...monthCounts.keys()].sort((a, b) => a - b);

  let bestLen = 1;
  let bestEnd = months[0];
  let run = 1;
  for (let k = 1; k < months.length; k++) {
    run = months[k] === months[k - 1] + 1 ? run + 1 : 1;
    if (run > bestLen) {
      bestLen = run;
      bestEnd = months[k];
    }
  }
  const longestStreak: StreakInfo = {
    months: bestLen,
    from: monthKey(bestEnd - bestLen + 1),
    to: monthKey(bestEnd),
  };

  // Current streak counts back from this month — or last month, so an unbroken
  // streak isn't reported as 0 just because this month has no finish yet.
  const nowIdx = now.getUTCFullYear() * 12 + now.getUTCMonth();
  const have = new Set(months);
  let cursor: number | null = have.has(nowIdx)
    ? nowIdx
    : have.has(nowIdx - 1)
      ? nowIdx - 1
      : null;
  let currentStreak = 0;
  while (cursor !== null && have.has(cursor)) {
    currentStreak++;
    cursor--;
  }

  let longestGap: PaceStats["longestGap"] = null;
  for (let k = 1; k < dated.length; k++) {
    const days = Math.round(
      (dated[k].dateRead!.getTime() - dated[k - 1].dateRead!.getTime()) / 86_400_000
    );
    if (!longestGap || days > longestGap.days) {
      longestGap = {
        days,
        from: dated[k - 1].dateRead!.toISOString().slice(0, 10),
        to: dated[k].dateRead!.toISOString().slice(0, 10),
      };
    }
  }

  let busiestMonth: PaceStats["busiestMonth"] = null;
  for (const [i, count] of monthCounts) {
    if (!busiestMonth || count > busiestMonth.count) {
      busiestMonth = { year: Math.floor(i / 12), month: i % 12, count };
    }
  }

  return { longestStreak, currentStreak, longestGap, busiestMonth };
}

export function computeStats(input: ReadBook[]): Stats {
  const books = input.map((b) => ({ ...b, author: normalizeAuthor(b.author) }));

  const rated = books.filter((b) => b.rating > 0);
  const avgRating =
    rated.length > 0
      ? rated.reduce((sum, b) => sum + b.rating, 0) / rated.length
      : 0;

  // Bucket = number of full stars (floor), matching the shelf filter.
  const ratingHistogram = [1, 2, 3, 4, 5].map((rating) => ({
    rating,
    count: books.filter((b) => Math.floor(b.rating) === rating).length,
  }));

  const authorCounts = new Map<string, number>();
  for (const b of books) {
    if (!b.author) continue;
    authorCounts.set(b.author, (authorCounts.get(b.author) ?? 0) + 1);
  }
  const topAuthors = [...authorCounts.entries()]
    .map(([author, count]) => ({ author, count }))
    .filter((a) => a.count > 1)
    .sort((a, b) => b.count - a.count || a.author.localeCompare(b.author))
    .slice(0, 10);

  const yearMap = new Map<number, ReadBook[]>();
  let unknownYear = 0;
  for (const b of books) {
    if (!b.dateRead || isNaN(b.dateRead.getTime())) {
      unknownYear++;
      continue;
    }
    // Dates are UTC-midnight calendar dates — read in UTC so they don't shift.
    const y = b.dateRead.getUTCFullYear();
    if (!yearMap.has(y)) yearMap.set(y, []);
    yearMap.get(y)!.push(b);
  }

  const byYear: YearStats[] = [...yearMap.entries()]
    .map(([year, list]) => {
      const r = list.filter((b) => b.rating > 0);
      return {
        year,
        count: list.length,
        reviewed: list.filter((b) => b.reviewed).length,
        avgRating: r.length ? r.reduce((s, b) => s + b.rating, 0) / r.length : 0,
        pages: list.reduce((s, b) => s + (b.pageCount ?? 0), 0),
      };
    })
    .sort((a, b) => b.year - a.year);

  // Monthly heatmap matrix (one row per year, 12 cells each).
  let maxMonth = 0;
  const monthly: MonthRow[] = [...yearMap.entries()]
    .map(([year, list]) => {
      const months = new Array(12).fill(0);
      for (const b of list) {
        if (b.dateRead) months[b.dateRead.getUTCMonth()]++;
      }
      maxMonth = Math.max(maxMonth, ...months);
      return { year, months };
    })
    .sort((a, b) => b.year - a.year);

  return {
    totalRead: books.length,
    totalReviewed: books.filter((b) => b.reviewed).length,
    avgRating,
    totalPages: books.reduce((s, b) => s + (b.pageCount ?? 0), 0),
    ratingHistogram,
    topAuthors,
    byYear,
    monthly,
    maxMonth,
    unknownYear,
    pace: computePace(books),
  };
}
