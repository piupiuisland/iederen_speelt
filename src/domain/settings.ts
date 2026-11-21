import type { Ms, Settings } from "./types.ts";

export const SECOND: Ms = 1000;
export const MINUTE: Ms = 60 * SECOND;

export const DEFAULT_SETTINGS: Settings = {
  playersOnField: 4,
  defaultMatchDurationMs: 20 * MINUTE,
  reminderIntervalMs: 4 * MINUTE,
  minStintMs: 3 * MINUTE,
  maxStintMs: 8 * MINUTE,
  maxSubsPerRecommendation: 2,
  snoozeMs: 1 * MINUTE,
};

export const DEFAULT_MATCH_COUNT = 4;

/** Playing times are compared in 15 s buckets so tie-breakers matter for "effectively equal" players. */
export const TIME_BUCKET_MS: Ms = 15 * SECOND;
export const timeBucket = (ms: Ms): number => Math.floor(ms / TIME_BUCKET_MS);

/** The first swap of a match comes after at least this long: children need time to get into the game. */
export const FIRST_SUB_AFTER_MS: Ms = 6 * MINUTE;
/** No swap reminder when less than this is left: a child coming on would barely play. */
export const NO_SUB_IN_LAST_MS: Ms = 4 * MINUTE;

/**
 * Planned reminder times (match clock) for a match without surprises: the first
 * after max(interval, 6 min), then every interval, none in the last 4 minutes.
 * E.g. 15 min every 5 → 6′, 11′; 20 min every 7 → 7′, 14′; 15 min every 7 → 7′.
 */
export function plannedSubTimes(plannedMs: Ms, intervalMs: Ms): Ms[] {
  const times: Ms[] = [];
  if (intervalMs <= 0) return times;
  for (let t = Math.max(intervalMs, FIRST_SUB_AFTER_MS); plannedMs - t >= NO_SUB_IN_LAST_MS; t += intervalMs) times.push(t);
  return times;
}
