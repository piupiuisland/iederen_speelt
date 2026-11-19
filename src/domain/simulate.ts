import {
  createMatchDay,
  finishMatch,
  finishMatchDay,
  respondToReminder,
  startMatch,
  substitute,
  type Ctx,
} from "./commands.ts";
import { fairnessIndicators, type FairnessIndicators } from "./engine/fairness.ts";
import { recommendStartingLineup } from "./engine/lineup.ts";
import { recommend, type SubReason } from "./engine/recommend.ts";
import { replay, type MatchDayState } from "./projection.ts";
import { MINUTE, SECOND } from "./settings.ts";
import type { MatchDay, Ms, Settings } from "./types.ts";

export interface SimulationOptions {
  playerCount: number;
  matchDurationsMs: Ms[];
  settings?: Partial<Settings>;
  stepMs?: Ms;
  breakMs?: Ms;
  startMs?: number;
  /** Called after every simulated step while a match is live. */
  onTick?: (state: MatchDayState, day: MatchDay) => void;
}

export interface SimulatedSub {
  matchNumber: number;
  elapsedMs: Ms;
  outId: string | null;
  inId: string | null;
  outStintMs: Ms;
  reason: SubReason;
}

export interface SimulationResult {
  day: MatchDay;
  state: MatchDayState;
  fairness: FairnessIndicators;
  substitutions: SimulatedSub[];
  skippedReminders: number;
}

/**
 * Plays a full match day with a "perfect parent": every reminder's
 * recommendation is accepted, or skipped if there is none. Each match is
 * finished exactly at its planned duration.
 */
export function simulateMatchDay(opts: SimulationOptions): SimulationResult {
  const stepMs = opts.stepMs ?? SECOND;
  let now = opts.startMs ?? Date.UTC(2026, 10, 21, 9, 0);
  let seq = 0;
  const ctx = (): Ctx => ({ now, newId: () => `id${++seq}` });

  const playerIds = Array.from({ length: opts.playerCount }, (_, i) => `P${i + 1}`);
  let day = createMatchDay(
    { date: "2026-11-21", playerIds, settings: opts.settings, matchDurationsMs: opts.matchDurationsMs },
    ctx(),
  );

  const substitutions: SimulatedSub[] = [];
  let skippedReminders = 0;

  for (const match of [...day.matches]) {
    day = startMatch(day, match.id, ctx(), recommendStartingLineup(day, now));
    for (;;) {
      now += stepMs;
      const state = replay(day, now);
      const cur = state.current!;
      if (cur.elapsedMs >= cur.plannedDurationMs) break;
      if (cur.reminderDue) {
        const pairs = recommend(state, day.settings);
        if (pairs.length > 0) {
          for (const p of pairs)
            substitutions.push({
              matchNumber: cur.number,
              elapsedMs: cur.elapsedMs,
              outId: p.outId,
              inId: p.inId,
              outStintMs: p.outId ? state.byId[p.outId]!.stintMs : 0,
              reason: p.reason,
            });
          day = substitute(day, pairs, ctx());
        } else {
          skippedReminders++;
          day = respondToReminder(day, "skip", ctx());
        }
      }
      opts.onTick?.(replay(day, now), day);
    }
    day = finishMatch(day, ctx());
    now += opts.breakMs ?? 10 * MINUTE;
  }
  day = finishMatchDay(day, ctx());

  const state = replay(day, now);
  return { day, state, fairness: fairnessIndicators(state), substitutions, skippedReminders };
}
