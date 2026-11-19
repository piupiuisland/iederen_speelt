import type { MatchDayState, PlayerStats } from "../projection.ts";
import { timeBucket } from "../settings.ts";
import type { PlayerId, Settings } from "../types.ts";

/**
 * unavailable: an injured/resting/absent player is on the field.
 * fill:        the field has an empty place and someone is available.
 * max-stint:   a player has been on longer than the preferred maximum.
 * rotation:    ordinary rotation (most-played off, least-played on).
 */
export type SubReason = "unavailable" | "fill" | "max-stint" | "rotation";

/** outId null: bring a player on without anyone leaving. inId null: take a player off without a replacement. */
export interface SubPair {
  outId: PlayerId | null;
  inId: PlayerId | null;
  reason: SubReason;
}

const FINAL_MINUTE_MS = 60_000;

const byMostPlayed = (a: PlayerStats, b: PlayerStats) =>
  timeBucket(b.totalMs) - timeBucket(a.totalMs) || b.stintMs - a.stintMs || a.rosterIndex - b.rosterIndex;

/**
 * Deterministic suggestion heuristic. Pure: call it on every render; it adapts
 * to manual substitutions automatically. It only suggests; nothing is applied.
 *
 * Priority:
 *  1. Unavailable players on the field come off (swapped, or removed if the bench is empty).
 *  2. Empty places on the field are filled.
 *  3. Players over the max stint, then rotation: most match-day time off,
 *     least match-day time on. Rotation needs `minStintMs` on the field, is
 *     skipped if the incoming player has played more than the outgoing one,
 *     and is not suggested in the final minute of a match.
 */
export function recommend(state: MatchDayState, settings: Settings): SubPair[] {
  const match = state.current;
  if (!match) return [];

  const max = match.maxSubsPerReminder;
  const onField = new Set(match.onFieldIds);
  const field = match.onFieldIds.map((id) => state.byId[id]!);
  const ins = state.players
    .filter((p) => !onField.has(p.playerId) && p.availability === "available")
    .sort(
      (a, b) =>
        timeBucket(a.totalMs) - timeBucket(b.totalMs) ||
        b.benchStintMs - a.benchStintMs ||
        a.rosterIndex - b.rosterIndex,
    );
  let nextIn = 0;
  let fieldCount = field.length;
  const pairs: SubPair[] = [];

  // 1. Unavailable players off.
  for (const out of field.filter((p) => p.availability !== "available").sort(byMostPlayed)) {
    if (pairs.length >= max) return pairs;
    const inn = ins[nextIn];
    if (inn) nextIn++;
    else if (fieldCount <= 1) continue; // never empty the field
    else fieldCount--;
    pairs.push({ outId: out.playerId, inId: inn?.playerId ?? null, reason: "unavailable" });
  }

  // 2. Fill empty places.
  while (fieldCount < match.playersOnField && nextIn < ins.length) {
    if (pairs.length >= max) return pairs;
    pairs.push({ outId: null, inId: ins[nextIn++]!.playerId, reason: "fill" });
    fieldCount++;
  }

  // 3. Max stint, then rotation.
  const finalMinute = match.remainingMs > 0 && match.remainingMs < FINAL_MINUTE_MS;
  const overMax = (p: PlayerStats) => p.stintMs >= match.maxStintMs;
  const outs = field
    .filter((p) => p.availability === "available" && (overMax(p) || p.stintMs >= settings.minStintMs))
    .sort((a, b) => Number(overMax(b)) - Number(overMax(a)) || byMostPlayed(a, b));
  for (const out of outs) {
    const inn = ins[nextIn];
    if (pairs.length >= max || !inn) break;
    const reason: SubReason = overMax(out) ? "max-stint" : "rotation";
    // Outs are most-played first and ins least-played first, so once a
    // rotation pair isn't worthwhile, no later pair is either.
    if (reason === "rotation" && (finalMinute || timeBucket(inn.totalMs) > timeBucket(out.totalMs))) break;
    pairs.push({ outId: out.playerId, inId: inn.playerId, reason });
    nextIn++;
  }
  return pairs;
}
