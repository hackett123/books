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
