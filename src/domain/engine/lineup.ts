import { replay } from "../projection.ts";
import { timeBucket } from "../settings.ts";
import type { MatchDay, PlayerId } from "../types.ts";

/**
 * Suggested starting lineup for the next match.
 *
 * First match of the day: the first K available players in roster order,
 *   rotated by `rotationOffset` (e.g. advance it by K each match day so the
 *   same children don't always start).
 * Later matches: least match-day playing time first; on a tie, players who did
 *   not start the previous match go first; then roster order.
 */
export function recommendStartingLineup(
  day: MatchDay,
  nowMs: number,
  rotationOffset = 0,
  /** Field size; defaults to the next match's. */
  size?: number,
): PlayerId[] {
  const state = replay(day, nowMs);
  const k = size ?? state.next?.playersOnField ?? day.settings.playersOnField;
  const isAvailable = (id: PlayerId) => state.byId[id]!.availability === "available";

  const previous = state.matches.filter((m) => m.status !== "ready").at(-1);
  if (!previous) {
    const n = day.playerIds.length;
    const offset = ((rotationOffset % n) + n) % n;
    const rotated = [...day.playerIds.slice(offset), ...day.playerIds.slice(0, offset)];
    return rotated.filter(isAvailable).slice(0, k);
  }

  const startedPrevious = new Set(previous.startingPlayerIds);
  return state.players
    .filter((p) => p.availability === "available")
    .sort(
      (a, b) =>
        timeBucket(a.totalMs) - timeBucket(b.totalMs) ||
        Number(startedPrevious.has(a.playerId)) - Number(startedPrevious.has(b.playerId)) ||
        a.rosterIndex - b.rosterIndex,
    )
    .slice(0, k)
    .map((p) => p.playerId);
}
