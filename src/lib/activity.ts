import activityData from "../data/activity.json";

// Reading events logged by the sync scripts (see scripts/activity.mjs):
// someone started, finished, rated, or reviewed a book. slug identifies a
// friend; slug=null is the site owner.
export type ActivityAction = "started" | "finished" | "rated" | "reviewed";

export interface ActivityEvent {
  at: Date;
  who: string | null;
  slug: string | null;
  action: ActivityAction;
  book: { title: string; author: string; cover?: string; url?: string };
  rating?: number;
  reviewed?: boolean;
  reviewSlug?: string;
}

interface RawEvent extends Omit<ActivityEvent, "at"> {
  at: string;
}

// Events stamped within the given window before the BUILD (a static site's
// only "now"). Deploys follow each nightly sync, so 24h ≈ "since yesterday's
// sync"; if no deploy happens for a while the strip simply goes quiet.
export function getRecentActivity(hours = 24): ActivityEvent[] {
  const cutoff = Date.now() - hours * 60 * 60 * 1000;
  return (activityData as RawEvent[])
    .filter((e) => Date.parse(e.at) >= cutoff)
    .map((e) => ({ ...e, at: new Date(e.at) }))
    .sort((a, b) => b.at.getTime() - a.at.getTime());
}

// First non-empty window, so the home strip degrades from "since yesterday"
// to "this week" to "this month" instead of vanishing on quiet days. Returns
// the last window with an empty list if nothing happened at all.
export function getActivityWindow(
  windows: number[] = [24, 24 * 7, 24 * 30],
): { hours: number; events: ActivityEvent[] } {
  for (const hours of windows) {
    const events = getRecentActivity(hours);
    if (events.length > 0) return { hours, events };
  }
  const last = windows[windows.length - 1] ?? 24;
  return { hours: last, events: [] };
}
