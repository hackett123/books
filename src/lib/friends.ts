import { computeStats, type Stats, type ReadBook } from "./bookstats";

export interface FriendBook {
  title: string;
  author: string;
  rating: number;
  cover?: string;
  url?: string;
  dateRead: Date | null;
  pageCount?: number;
  hasReview: boolean;
}

export interface FriendReading {
  title: string;
  author: string;
  cover?: string;
  url?: string;
}

export interface Friend {
  name: string;
  slug: string;
  userId: string;
  profileUrl: string;
  syncedAt: string | null;
  read: FriendBook[];
  currentlyReading: FriendReading[];
  stats: Stats;
}

interface RawFriend {
  name: string;
  slug: string;
  userId: string;
  profileUrl: string;
  syncedAt: string;
  read: Array<Omit<FriendBook, "dateRead"> & { dateRead: string | null }>;
  currentlyReading: FriendReading[];
}

// Eagerly load every synced friend file at build time.
const files = import.meta.glob<RawFriend>("../data/friends/*.json", {
  eager: true,
  import: "default",
});

function hydrate(raw: RawFriend): Friend {
  const read: FriendBook[] = raw.read.map((b) => ({
    ...b,
    dateRead: b.dateRead ? new Date(b.dateRead) : null,
  }));
  const statsInput: ReadBook[] = read.map((b) => ({
    rating: b.rating,
    dateRead: b.dateRead,
    author: b.author,
    pageCount: b.pageCount,
    reviewed: b.hasReview,
  }));
  return {
    name: raw.name,
    slug: raw.slug,
    userId: raw.userId,
    profileUrl: raw.profileUrl,
    syncedAt: raw.syncedAt ?? null,
    read,
    currentlyReading: raw.currentlyReading ?? [],
    stats: computeStats(statsInput),
  };
}

// All friends, ordered by most books read (desc).
export function getFriends(): Friend[] {
  return Object.values(files)
    .map(hydrate)
    .sort((a, b) => b.stats.totalRead - a.stats.totalRead);
}

export function getFriend(slug: string): Friend | undefined {
  return getFriends().find((f) => f.slug === slug);
}
