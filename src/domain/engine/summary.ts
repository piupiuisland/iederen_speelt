import { replay, type Score } from "../projection.ts";
import type { Availability, MatchDay, Ms, PlayerId } from "../types.ts";
import { fairnessIndicators, type FairnessIndicators } from "./fairness.ts";

export interface MatchResult {
  matchId: string;
  number: number;
  opponentName: string;
  score: Score;
  playedMs: Ms;
  playersOnField: number;
}

export interface PlayerSummary {
  playerId: PlayerId;
  totalMs: Ms;
  /** Versus the average of the players counted for fairness (not set for players who left). */
  deltaFromAverageMs: Ms | null;
  subsIn: number;
  subsOut: number;
  matchesStarted: number;
  availability: Availability;
}

export interface DaySummary {
  date: string;
  matchesPlayed: number;
  totalActiveMs: Ms;
  goals: Score;
  substitutions: number;
  results: MatchResult[];
  /** In roster (alphabetical) order. */
  players: PlayerSummary[];
  /** Indicator only — never used to decide anything. */
  fairness: FairnessIndicators;
}

/** Everything the end-of-day screen shows, derived from the event log. */
export function summarizeMatchDay(day: MatchDay, nowMs: number = day.finishedAt ?? Date.now()): DaySummary {
  const state = replay(day, nowMs);
  const played = state.matches.filter((m) => m.status !== "ready");
  const fairness = fairnessIndicators(state);
  const delta = new Map(fairness.perPlayer.map((p) => [p.playerId, p.deltaFromAverageMs]));

  return {
    date: day.date,
    matchesPlayed: played.length,
    totalActiveMs: state.totalActiveMs,
    goals: played.reduce((g, m) => ({ us: g.us + m.score.us, them: g.them + m.score.them }), { us: 0, them: 0 }),
    substitutions: played.reduce((n, m) => n + m.substitutionCount, 0),
    results: played.map((m) => ({
      matchId: m.matchId,
      number: m.number,
      opponentName: m.opponentName,
      score: m.score,
      playedMs: m.elapsedMs,
      playersOnField: m.playersOnField,
    })),
    players: state.players.map((p) => ({
      playerId: p.playerId,
      totalMs: p.totalMs,
      deltaFromAverageMs: delta.get(p.playerId) ?? null,
      subsIn: p.subsIn,
      subsOut: p.subsOut,
      matchesStarted: p.matchesStarted,
      availability: p.availability,
    })),
    fairness,
  };
}
