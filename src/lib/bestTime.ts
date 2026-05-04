/**
 * Best-time-to-post hints, computed entirely client-side from the user's
 * own `posts` history (status === "sent" with non-zero reach or clicks).
 *
 * We deliberately avoid a separate Zernio analytics roll-up here:
 *  - Zernio's /analytics endpoints return profile-level *summaries* (total
 *    reach / clicks / engagement rate), not per-slot breakdowns.
 *  - We'd need a separate per-post fan-out to reconstruct slot-level data,
 *    and the sample size for most Posta accounts is still tiny — local
 *    ScheduledPost.reach / ScheduledPost.clicks (populated by
 *    syncPostStatuses) already gives us what we need without extra calls.
 *
 * The score per bucket is `reach + clicks * CLICK_WEIGHT` where clicks are
 * weighted higher because they're a stronger engagement signal than raw
 * impressions.
 */

import type { ScheduledPost } from "./state";

/** Minimum number of sent-with-data posts before we'll surface a hint at
 *  all. Below this the top-slot "winner" is basically noise. */
const MIN_SAMPLE = 3;

/** Clicks are rarer and more intentful than reach; weight accordingly
 *  when combining into a single bucket score. Value picked empirically:
 *  a single click is roughly worth the same as 10 additional impressions
 *  for day/hour-of-week recommendations. */
const CLICK_WEIGHT = 10;

export interface BestTimeSlot {
  /** 0 = Sunday … 6 = Saturday. Matches Date.prototype.getDay(). */
  dayOfWeek: number;
  /** 0–23 local hour. */
  hour: number;
  /** How many sent posts fell into this bucket. */
  samples: number;
  /** Sum of (reach + clicks*CLICK_WEIGHT) for this bucket. */
  score: number;
  /** Mean engagement per post in this bucket (score / samples). Useful
   *  for ranking when sample sizes differ. */
  meanScore: number;
}

export interface BestTimeHint {
  /** Top-ranked slot. Non-null iff totalSamples >= MIN_SAMPLE. */
  top: BestTimeSlot;
  /** Next best slots (up to 2) after `top`, for dashboard drill-downs. */
  runnersUp: BestTimeSlot[];
  /** Total number of sent-with-data posts we considered. */
  totalSamples: number;
}

const DOW_LABEL = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/** Format a slot as "Fridays around 6 PM". Plural on the day for the
 *  pattern ("Fridays" reads as a habit rather than one specific date). */
export function formatBestTimeSlot(slot: BestTimeSlot): string {
  const day = DOW_LABEL[slot.dayOfWeek] + "s";
  const h = slot.hour;
  const suffix = h < 12 ? "AM" : "PM";
  const twelve = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${day} around ${twelve} ${suffix}`;
}

/**
 * Compute a best-time hint from a user's sent-post history.
 *
 * Returns null when:
 *  - Fewer than MIN_SAMPLE posts have status==="sent" with non-zero
 *    reach or clicks.
 *  - Every post scores zero (so ranking would be arbitrary).
 */
export function computeBestTimeHint(
  posts: ScheduledPost[]
): BestTimeHint | null {
  const buckets = new Map<string, BestTimeSlot>();
  let totalSamples = 0;

  for (const p of posts) {
    if (p.status !== "sent") continue;
    const reach = p.reach ?? 0;
    const clicks = p.clicks ?? 0;
    if (reach === 0 && clicks === 0) continue;

    const when = new Date(p.scheduledAt);
    if (Number.isNaN(when.getTime())) continue;

    const dow = when.getDay();
    const hour = when.getHours();
    const key = `${dow}:${hour}`;
    const score = reach + clicks * CLICK_WEIGHT;

    const prev = buckets.get(key);
    if (prev) {
      prev.samples += 1;
      prev.score += score;
      prev.meanScore = prev.score / prev.samples;
    } else {
      buckets.set(key, {
        dayOfWeek: dow,
        hour,
        samples: 1,
        score,
        meanScore: score,
      });
    }
    totalSamples += 1;
  }

  if (totalSamples < MIN_SAMPLE) return null;

  const ranked = [...buckets.values()].sort(
    (a, b) => b.meanScore - a.meanScore || b.samples - a.samples
  );
  const top = ranked[0];
  if (!top || top.meanScore === 0) return null;

  return {
    top,
    runnersUp: ranked.slice(1, 3),
    totalSamples,
  };
}
