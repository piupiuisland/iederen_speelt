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
