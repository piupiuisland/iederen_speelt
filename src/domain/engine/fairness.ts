import type { MatchDayState } from "../projection.ts";
import type { Ms, PlayerId } from "../types.ts";

export interface FairnessIndicators {
  /** Players included: all participants except those who left the match day. */
  playerIds: PlayerId[];
  /** Average playing time; equals K × T / N when every match had a full lineup. */
  averageMs: Ms;
  /** max − min playing time. */
  rangeMs: Ms;
  /** Mean absolute deviation from the average. */
  madMs: Ms;
  perPlayer: { playerId: PlayerId; totalMs: Ms; deltaFromAverageMs: Ms }[];
}

/**
 * Informational only. The recommendation engine does NOT use these numbers;
 * they are shown to the user (summary screen / live indicator).
 */
export function fairnessIndicators(state: MatchDayState): FairnessIndicators {
  const players = state.players.filter((p) => p.availability !== "left");
  if (players.length === 0) return { playerIds: [], averageMs: 0, rangeMs: 0, madMs: 0, perPlayer: [] };

  const totals = players.map((p) => p.totalMs);
  const averageMs = totals.reduce((a, b) => a + b, 0) / totals.length;
  return {
    playerIds: players.map((p) => p.playerId),
    averageMs,
    rangeMs: Math.max(...totals) - Math.min(...totals),
    madMs: totals.reduce((sum, t) => sum + Math.abs(t - averageMs), 0) / totals.length,
    perPlayer: players.map((p) => ({
      playerId: p.playerId,
      totalMs: p.totalMs,
      deltaFromAverageMs: p.totalMs - averageMs,
    })),
  };
}
