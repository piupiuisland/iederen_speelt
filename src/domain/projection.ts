import { activeMsBetween, runningIntervals, totalActiveMs } from "./time.ts";
import { FIRST_SUB_AFTER_MS, NO_SUB_IN_LAST_MS } from "./settings.ts";
import type { Availability, Match, MatchDay, Ms, PlayerId, Settings, SubEvent } from "./types.ts";

export type MatchStatus = "ready" | "running" | "paused" | "finished";

export interface PlayerStats {
  playerId: PlayerId;
  rosterIndex: number;
  availability: Availability;
  onField: boolean;
  /** Match-day total, including the current running interval. */
  totalMs: Ms;
  /** Playing time in the current (or most recently started) match. */
  matchMs: Ms;
  /** Continuous on-field time in the current match (0 if on the bench). */
  stintMs: Ms;
  /** Continuous bench time in the current match (0 if on the field). */
  benchStintMs: Ms;
  subsIn: number;
  subsOut: number;
  matchesStarted: number;
}

export interface Score {
  us: number;
  them: number;
}

export interface MatchState {
  matchId: string;
  number: number;
  /** Field size for this match. */
  playersOnField: number;
  /** Substitution rhythm for this match. */
  reminderIntervalMs: Ms;
  maxSubsPerReminder: number;
  /** Soft limit on a continuous stint: the settings value, but never below two reminder intervals. */
  maxStintMs: Ms;
  opponentName: string;
  score: Score;
  status: MatchStatus;
  plannedDurationMs: Ms;
  elapsedMs: Ms;
  /** Negative during overtime. */
  remainingMs: Ms;
  isOvertime: boolean;
  startedAt: number | null;
  startingPlayerIds: PlayerId[];
  onFieldIds: PlayerId[];
  substitutionCount: number;
  /** The batch an undo would revert, if any. */
  lastBatchId: string | null;
  /** Active match time until the next reminder; <= 0 means due. Null when not live. */
  nextReminderInMs: Ms | null;
  reminderDue: boolean;
}

export interface MatchDayState {
  nowMs: number;
  players: PlayerStats[];
  byId: Record<PlayerId, PlayerStats>;
  matches: MatchState[];
  /** The running or paused match. */
  current: MatchState | null;
  /** The first match not yet started. */
  next: MatchState | null;
  completedMatches: number;
  totalActiveMs: Ms;
  finished: boolean;
}

export function matchStatus(match: Match): MatchStatus {
  let status: MatchStatus = "ready";
  for (const e of match.events) {
    if (e.type === "START" || e.type === "RESUME") status = "running";
    else if (e.type === "PAUSE") status = "paused";
    else if (e.type === "FINISH") status = "finished";
  }
  return status;
}

export function plannedDurationMs(match: Match): Ms {
  let planned = match.plannedDurationMs;
  for (const e of match.events) if (e.type === "DURATION_CHANGE") planned = e.plannedDurationMs;
  return planned;
}

/** SUB events that have not been undone, in order. */
export function effectiveSubs(match: Match): SubEvent[] {
  const undone = new Set<string>();
  for (const e of match.events) if (e.type === "UNDO") undone.add(e.targetBatchId);
  return match.events.filter((e): e is SubEvent => e.type === "SUB" && !undone.has(e.batchId));
}

const intervalOf = (match: Match, settings: Settings): Ms => match.reminderIntervalMs ?? settings.reminderIntervalMs;

export function scoreOf(match: Match): Score {
  const score = { us: 0, them: 0 };
  for (const e of match.events) if (e.type === "GOAL") score[e.side] = Math.max(0, score[e.side] + e.delta);
  return score;
}

export function availabilityOf(day: MatchDay, playerId: PlayerId): Availability {
  let status: Availability = "available";
  for (const c of day.availability) if (c.playerId === playerId) status = c.status;
  return status;
}

/** Derive the full match-day state at `nowMs` from the persisted match day. Pure. */
export function replay(day: MatchDay, nowMs: number): MatchDayState {
  const players: PlayerStats[] = day.playerIds.map((playerId, rosterIndex) => ({
    playerId,
    rosterIndex,
    availability: availabilityOf(day, playerId),
    onField: false,
    totalMs: 0,
    matchMs: 0,
    stintMs: 0,
    benchStintMs: 0,
    subsIn: 0,
    subsOut: 0,
    matchesStarted: 0,
  }));
  const byId: Record<PlayerId, PlayerStats> = Object.fromEntries(players.map((p) => [p.playerId, p]));

  const matches = day.matches.map((m, i) => replayMatch(m, i + 1, players, byId, day.settings, nowMs));
  const current = matches.find((m) => m.status === "running" || m.status === "paused") ?? null;

  return {
    nowMs,
    players,
    byId,
    matches,
    current,
    next: matches.find((m) => m.status === "ready") ?? null,
    completedMatches: matches.filter((m) => m.status === "finished").length,
    totalActiveMs: matches.reduce((sum, m) => sum + m.elapsedMs, 0),
    finished: day.finishedAt !== undefined,
  };
}

function replayMatch(
  match: Match,
  number: number,
  players: PlayerStats[],
  byId: Record<PlayerId, PlayerStats>,
  settings: Settings,
  nowMs: number,
): MatchState {
  const status = matchStatus(match);
  const planned = plannedDurationMs(match);
  const base = {
    matchId: match.id,
    number,
    playersOnField: match.playersOnField ?? settings.playersOnField,
    reminderIntervalMs: intervalOf(match, settings),
    maxSubsPerReminder: match.maxSubsPerReminder ?? settings.maxSubsPerRecommendation,
    maxStintMs: Math.max(settings.maxStintMs, 2 * intervalOf(match, settings)),
    opponentName: match.opponentName ?? "",
    score: scoreOf(match),
    status,
    plannedDurationMs: planned,
    startingPlayerIds: [...match.startingPlayerIds],
  };

  const start = match.events.find((e) => e.type === "START");
  if (status === "ready" || !start) {
    return {
      ...base,
      elapsedMs: 0,
      remainingMs: planned,
      isOvertime: false,
      startedAt: null,
      onFieldIds: [...match.startingPlayerIds],
      substitutionCount: 0,
      lastBatchId: null,
      nextReminderInMs: null,
      reminderDue: false,
    };
  }

  const intervals = runningIntervals(match.events, nowMs);
  const subs = effectiveSubs(match);
  const effectiveBatches = new Set(subs.map((s) => s.batchId));

  // Per-match counters restart; match-day totals carry over.
  for (const p of players) {
    p.matchMs = 0;
    p.stintMs = 0;
    p.benchStintMs = 0;
  }
  const on = new Set(match.startingPlayerIds);
  for (const id of on) byId[id]!.matchesStarted++;

  let lastT = start.t;
  const creditUntil = (t: number) => {
    const d = activeMsBetween(intervals, lastT, t);
    if (d > 0) {
      for (const p of players) {
        if (on.has(p.playerId)) {
          p.totalMs += d;
          p.matchMs += d;
          p.stintMs += d;
        } else {
          p.benchStintMs += d;
        }
      }
    }
    lastT = Math.max(lastT, t);
  };

  for (const sub of subs) {
    creditUntil(sub.t);
    if (sub.outId !== null) {
      on.delete(sub.outId);
      const out = byId[sub.outId]!;
      out.stintMs = 0;
      out.benchStintMs = 0;
      out.subsOut++;
    }
    if (sub.inId !== null) {
      on.add(sub.inId);
      const inn = byId[sub.inId]!;
      inn.stintMs = 0;
      inn.benchStintMs = 0;
      inn.subsIn++;
    }
  }
  creditUntil(nowMs);
  for (const p of players) p.onField = on.has(p.playerId);

  // Reminder clock: counts active time since the last anchor (start, sub, skip, snooze).
  // The first swap waits at least FIRST_SUB_AFTER_MS; none is due in the last NO_SUB_IN_LAST_MS.
  let anchorT = start.t;
  const interval = intervalOf(match, settings);
  let dueAfter = Math.max(interval, FIRST_SUB_AFTER_MS);
  for (const e of match.events) {
    if (e.type === "SUB" && effectiveBatches.has(e.batchId)) {
      anchorT = e.t;
      dueAfter = interval;
    } else if (e.type === "REMINDER") {
      anchorT = e.t;
      dueAfter = e.action === "snooze" ? settings.snoozeMs : interval;
    }
  }
  const live = status === "running" || status === "paused";
  const sinceAnchor = activeMsBetween(intervals, anchorT, nowMs);
  const dueAtElapsed = activeMsBetween(intervals, start.t, anchorT) + dueAfter;
  const nextReminderInMs = live && planned - dueAtElapsed >= NO_SUB_IN_LAST_MS ? dueAfter - sinceAnchor : null;

  const elapsedMs = totalActiveMs(intervals);
  return {
    ...base,
    elapsedMs,
    remainingMs: planned - elapsedMs,
    isOvertime: elapsedMs > planned,
    startedAt: start.t,
    onFieldIds: [...on],
    substitutionCount: subs.length,
    lastBatchId: subs.at(-1)?.batchId ?? null,
    nextReminderInMs,
    reminderDue: nextReminderInMs !== null && nextReminderInMs <= 0,
  };
}
