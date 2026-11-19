import { matchStatus, replay, scoreOf, type MatchDayState } from "./projection.ts";
import { DEFAULT_MATCH_COUNT, DEFAULT_SETTINGS } from "./settings.ts";
import type {
  Availability,
  Match,
  MatchDay,
  MatchEvent,
  Ms,
  NewMatchEvent,
  PlayerId,
  Settings,
} from "./types.ts";

/**
 * Commands validate against the replayed state and return a NEW MatchDay with
 * events appended. They never mutate their input and never read the clock:
 * the caller passes `now`.
 */

export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DomainError";
  }
}

export type IdGen = () => string;
export const randomId: IdGen = () => crypto.randomUUID();

export interface Ctx {
  now: number;
  newId?: IdGen;
}

/** A swap (both ids), a player leaving without replacement (inId null), or joining without anyone leaving (outId null). */
export interface SubPairInput {
  outId: PlayerId | null;
  inId: PlayerId | null;
}

// ---------------------------------------------------------------- helpers

const idGen = (ctx: Ctx): IdGen => ctx.newId ?? randomId;

function fail(message: string): never {
  throw new DomainError(message);
}

function ensureOpen(day: MatchDay): void {
  if (day.finishedAt !== undefined) fail("This match day is already finished.");
}

function findMatch(day: MatchDay, matchId: string): Match {
  return day.matches.find((m) => m.id === matchId) ?? fail(`Unknown match: ${matchId}`);
}

function requireCurrent(state: MatchDayState) {
  return state.current ?? fail("No match is in progress.");
}

function updateMatch(day: MatchDay, matchId: string, ctx: Ctx, f: (m: Match) => Match): MatchDay {
  return {
    ...day,
    lastSeenMs: ctx.now,
    matches: day.matches.map((m) => (m.id === matchId ? f(m) : m)),
  };
}

function appendEvents(day: MatchDay, matchId: string, ctx: Ctx, events: NewMatchEvent[]): MatchDay {
  const newId = idGen(ctx);
  const stamped = events.map((e) => ({ ...e, id: newId(), t: ctx.now }) as MatchEvent);
  return updateMatch(day, matchId, ctx, (m) => ({ ...m, events: [...m.events, ...stamped] }));
}

function validateSettings(s: Settings): void {
  if (!Number.isInteger(s.playersOnField) || s.playersOnField < 1) fail("Players on field must be at least 1.");
  if (!Number.isInteger(s.maxSubsPerRecommendation) || s.maxSubsPerRecommendation < 1)
    fail("Max substitutions per recommendation must be at least 1.");
  for (const k of ["defaultMatchDurationMs", "reminderIntervalMs", "snoozeMs"] as const)
    if (!(Number.isFinite(s[k]) && s[k] > 0)) fail(`${k} must be positive.`);
  if (!(Number.isFinite(s.minStintMs) && s.minStintMs >= 0) || !(Number.isFinite(s.maxStintMs) && s.maxStintMs >= 0))
    fail("Stint limits must be zero or more.");
  if (s.minStintMs > s.maxStintMs) fail("The minimum stint cannot be longer than the maximum stint.");
}

function validateDuration(ms: Ms): void {
  if (!(Number.isFinite(ms) && ms > 0)) fail("Match duration must be positive.");
}

/**
 * A lineup must have exactly `playersOnField` players, unless fewer players are
 * available, in which case all available players may start (reduced lineup).
 */
export function validateLineup(state: MatchDayState, ids: readonly PlayerId[], fieldSize: number): void {
  if (new Set(ids).size !== ids.length) fail("A player appears twice in the lineup.");
  for (const id of ids) {
    const p = state.byId[id] ?? fail(`Player ${id} is not taking part today.`);
    if (p.availability !== "available") fail(`Player ${id} is not available (${p.availability}).`);
  }
  const availableCount = state.players.filter((p) => p.availability === "available").length;
  const required = Math.min(fieldSize, availableCount);
  if (required < 1) fail("No players are available.");
  if (ids.length !== required)
    fail(`The lineup needs ${required} player${required === 1 ? "" : "s"}, got ${ids.length}.`);
}

// ---------------------------------------------------------------- match day

export interface CreateMatchDayInput {
  date: string;
  playerIds: PlayerId[];
  settings?: Partial<Settings>;
  /** One entry per planned match. Defaults to 4 matches of the default duration. */
  matchDurationsMs?: Ms[];
}

export function createMatchDay(input: CreateMatchDayInput, ctx: Ctx): MatchDay {
  const newId = idGen(ctx);
  const settings: Settings = { ...DEFAULT_SETTINGS, ...input.settings };
  validateSettings(settings);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || Number.isNaN(Date.parse(input.date)))
    fail("Pick a valid date for the match day.");
  if (input.playerIds.length < 1) fail("Select at least one player.");
  if (new Set(input.playerIds).size !== input.playerIds.length) fail("A player is selected twice.");
  const durations =
    input.matchDurationsMs ?? Array.from({ length: DEFAULT_MATCH_COUNT }, () => settings.defaultMatchDurationMs);
  durations.forEach(validateDuration);

  return {
    id: newId(),
    date: input.date,
    playerIds: [...input.playerIds],
    settings,
    matches: durations.map((plannedDurationMs) => ({
      id: newId(),
      plannedDurationMs,
      startingPlayerIds: [],
      events: [],
    })),
    availability: [],
    lastSeenMs: ctx.now,
  };
}

export function finishMatchDay(day: MatchDay, ctx: Ctx): MatchDay {
  ensureOpen(day);
  if (replay(day, ctx.now).current) fail("Finish the current match first.");
  return { ...day, finishedAt: ctx.now, lastSeenMs: ctx.now };
}

export function addMatch(day: MatchDay, ctx: Ctx, durationMs?: Ms): MatchDay {
  ensureOpen(day);
  const plannedDurationMs = durationMs ?? day.settings.defaultMatchDurationMs;
  validateDuration(plannedDurationMs);
  const match: Match = { id: idGen(ctx)(), plannedDurationMs, startingPlayerIds: [], events: [] };
  return { ...day, lastSeenMs: ctx.now, matches: [...day.matches, match] };
}

export function removeMatch(day: MatchDay, matchId: string, ctx: Ctx): MatchDay {
  ensureOpen(day);
  if (matchStatus(findMatch(day, matchId)) !== "ready") fail("Only a match that has not started can be removed.");
  return { ...day, lastSeenMs: ctx.now, matches: day.matches.filter((m) => m.id !== matchId) };
}

export const fieldSizeOf = (day: MatchDay, match: Match): number => match.playersOnField ?? day.settings.playersOnField;

/** How many players start on the field for one match. Only before kick-off. */
export function setMatchPlayersOnField(day: MatchDay, matchId: string, count: number, ctx: Ctx): MatchDay {
  ensureOpen(day);
  if (!Number.isInteger(count) || count < 1 || count > 11) fail("Players on the field must be between 1 and 11.");
  if (matchStatus(findMatch(day, matchId)) !== "ready") fail("The match has already started.");
  return updateMatch(day, matchId, ctx, (m) => ({ ...m, playersOnField: count }));
}

/** Before kick-off this edits the plan; during a match it is recorded as an event. */
export function setPlannedDuration(day: MatchDay, matchId: string, durationMs: Ms, ctx: Ctx): MatchDay {
  ensureOpen(day);
  validateDuration(durationMs);
  const status = matchStatus(findMatch(day, matchId));
  if (status === "finished") fail("This match is already finished.");
  if (status === "ready") return updateMatch(day, matchId, ctx, (m) => ({ ...m, plannedDurationMs: durationMs }));
  return appendEvents(day, matchId, ctx, [{ type: "DURATION_CHANGE", plannedDurationMs: durationMs }]);
}

/** The other club's name for one match (any time; an empty name means "Tegenstander"). */
export function setOpponentName(day: MatchDay, matchId: string, name: string, ctx: Ctx): MatchDay {
  ensureOpen(day);
  findMatch(day, matchId);
  const clean = name.trim().replace(/\s+/g, " ").slice(0, 40);
  return updateMatch(day, matchId, ctx, (m) => ({ ...m, opponentName: clean }));
}

/** Add (+1) or take back (−1) a goal in a started match. Finished matches can still be corrected. */
export function recordGoal(day: MatchDay, matchId: string, side: "us" | "them", delta: 1 | -1, ctx: Ctx): MatchDay {
  ensureOpen(day);
  const match = findMatch(day, matchId);
  if (matchStatus(match) === "ready") fail("The match has not started.");
  if (delta === -1 && scoreOf(match)[side] === 0) fail("The score is already 0.");
  return appendEvents(day, matchId, ctx, [{ type: "GOAL", side, delta }]);
}

export function setAvailability(day: MatchDay, playerId: PlayerId, status: Availability, ctx: Ctx): MatchDay {
  ensureOpen(day);
  if (!day.playerIds.includes(playerId)) fail(`Player ${playerId} is not taking part today.`);
  const change = { id: idGen(ctx)(), t: ctx.now, playerId, status };
  return { ...day, lastSeenMs: ctx.now, availability: [...day.availability, change] };
}

// ---------------------------------------------------------------- match clock

export function setStartingLineup(day: MatchDay, matchId: string, ids: PlayerId[], ctx: Ctx): MatchDay {
  ensureOpen(day);
  if (matchStatus(findMatch(day, matchId)) !== "ready") fail("The match has already started.");
  validateLineup(replay(day, ctx.now), ids, fieldSizeOf(day, findMatch(day, matchId)));
  return updateMatch(day, matchId, ctx, (m) => ({ ...m, startingPlayerIds: [...ids] }));
}

/** Start the next match. `lineup` overrides the stored starting lineup. */
export function startMatch(day: MatchDay, matchId: string, ctx: Ctx, lineup?: PlayerId[]): MatchDay {
  ensureOpen(day);
  const state = replay(day, ctx.now);
  if (state.current) fail(`Match ${state.current.number} is still in progress.`);
  if (state.next?.matchId !== matchId) {
    findMatch(day, matchId);
    fail("Matches must be played in order.");
  }
  const ids = lineup ?? findMatch(day, matchId).startingPlayerIds;
  validateLineup(state, ids, fieldSizeOf(day, findMatch(day, matchId)));
  const withLineup = updateMatch(day, matchId, ctx, (m) => ({ ...m, startingPlayerIds: [...ids] }));
  return appendEvents(withLineup, matchId, ctx, [{ type: "START" }]);
}

export function pauseMatch(day: MatchDay, ctx: Ctx): MatchDay {
  ensureOpen(day);
  const cur = requireCurrent(replay(day, ctx.now));
  if (cur.status !== "running") fail("The match is not running.");
  return appendEvents(day, cur.matchId, ctx, [{ type: "PAUSE" }]);
}

export function resumeMatch(day: MatchDay, ctx: Ctx): MatchDay {
  ensureOpen(day);
  const cur = requireCurrent(replay(day, ctx.now));
  if (cur.status !== "paused") fail("The match is not paused.");
  return appendEvents(day, cur.matchId, ctx, [{ type: "RESUME" }]);
}

/** Only the user finishes a match; reaching the planned duration never does. */
export function finishMatch(day: MatchDay, ctx: Ctx): MatchDay {
  ensureOpen(day);
  const cur = requireCurrent(replay(day, ctx.now));
  return appendEvents(day, cur.matchId, ctx, [{ type: "FINISH" }]);
}

// ---------------------------------------------------------------- substitutions

/**
 * Apply one or more lineup changes as a single batch (undone together).
 * Usually swaps; a pair with only `outId` removes a player, with only `inId`
 * adds one, as long as the field never ends up with more than `playersOnField`.
 */
export function substitute(day: MatchDay, pairs: readonly SubPairInput[], ctx: Ctx): MatchDay {
  ensureOpen(day);
  const state = replay(day, ctx.now);
  const cur = requireCurrent(state);
  if (pairs.length === 0) fail("No substitution selected.");
  if (pairs.some((p) => p.outId === null && p.inId === null)) fail("A substitution needs at least one player.");

  const involved = pairs.flatMap((p) => [p.outId, p.inId]).filter((id): id is PlayerId => id !== null);
  if (new Set(involved).size !== involved.length) fail("A player appears more than once in this substitution.");

  const onField = new Set(cur.onFieldIds);
  for (const { outId, inId } of pairs) {
    if (outId !== null && !onField.has(outId)) fail(`Player ${outId} is not on the field.`);
    if (inId === null) continue;
    const inn = state.byId[inId] ?? fail(`Player ${inId} is not taking part today.`);
    if (onField.has(inId)) fail(`Player ${inId} is already on the field.`);
    if (inn.availability !== "available") fail(`Player ${inId} is not available (${inn.availability}).`);
  }
  const added = pairs.filter((p) => p.outId === null).length - pairs.filter((p) => p.inId === null).length;
  if (onField.size + added > cur.playersOnField) fail(`Only ${cur.playersOnField} players can be on the field.`);
  if (onField.size + added < 1) fail("At least one player must stay on the field.");

  const batchId = idGen(ctx)();
  return appendEvents(
    day,
    cur.matchId,
    ctx,
    pairs.map((p) => ({ type: "SUB" as const, batchId, outId: p.outId, inId: p.inId })),
  );
}

/**
 * Revert the most recent substitution batch in the current match (repeatable, stack-like).
 * Refused if it would put an unavailable (injured, resting, …) player back on the field.
 */
export function undoLastSubstitution(day: MatchDay, ctx: Ctx): MatchDay {
  ensureOpen(day);
  const state = replay(day, ctx.now);
  const cur = requireCurrent(state);
  if (!cur.lastBatchId) fail("There is no substitution to undo.");
  const match = findMatch(day, cur.matchId);
  for (const e of match.events) {
    if (e.type !== "SUB" || e.batchId !== cur.lastBatchId || e.outId === null) continue;
    const status = state.byId[e.outId]!.availability;
    if (status !== "available") fail(`Can't undo: ${e.outId} is ${status}. Mark them available first.`);
  }
  return appendEvents(day, cur.matchId, ctx, [{ type: "UNDO", targetBatchId: cur.lastBatchId }]);
}

/** "Skip" restarts the full reminder interval; "snooze" (Later) re-reminds after `snoozeMs`. */
export function respondToReminder(day: MatchDay, action: "skip" | "snooze", ctx: Ctx): MatchDay {
  ensureOpen(day);
  const cur = requireCurrent(replay(day, ctx.now));
  return appendEvents(day, cur.matchId, ctx, [{ type: "REMINDER", action }]);
}

// ---------------------------------------------------------------- recovery

/** Record that the app is alive. Persist this every few seconds during a match. */
export function heartbeat(day: MatchDay, now: number): MatchDay {
  return { ...day, lastSeenMs: now };
}

export interface Interruption {
  fromT: number;
  toT: number;
  gapMs: Ms;
}

/** A running match whose heartbeat stopped for longer than `thresholdMs` (app closed or killed). */
export function detectInterruption(day: MatchDay, now: number, thresholdMs: Ms = 2 * 60_000): Interruption | null {
  const cur = replay(day, now).current;
  if (cur?.status !== "running") return null;
  const gapMs = now - day.lastSeenMs;
  return gapMs > thresholdMs ? { fromT: day.lastSeenMs, toT: now, gapMs } : null;
}

/** Exclude [fromT, toT] from match time, e.g. when the match was actually stopped while the app was closed. */
export function correctGap(day: MatchDay, fromT: number, toT: number, ctx: Ctx): MatchDay {
  ensureOpen(day);
  const cur = requireCurrent(replay(day, ctx.now));
  if (!(fromT < toT)) fail("The correction must end after it starts.");
  if (toT > ctx.now) fail("The correction cannot extend into the future.");
  if (cur.startedAt === null || fromT < cur.startedAt) fail("The correction cannot start before kick-off.");
  return appendEvents(day, cur.matchId, ctx, [{ type: "GAP_CORRECTION", fromT, toT }]);
}
