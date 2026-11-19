import { createMatchDay, startMatch, type Ctx } from "../src/domain/commands.ts";
import { MINUTE, SECOND } from "../src/domain/settings.ts";
import type { MatchDay, Ms, Settings } from "../src/domain/types.ts";

export const T0 = Date.UTC(2026, 10, 21, 9, 0);

/** Wall-clock time `min` minutes (and `sec` seconds) after T0. */
export const at = (min: number, sec = 0): number => T0 + min * MINUTE + sec * SECOND;
export const min = (m: number): Ms => m * MINUTE;

/** Made-up names for UI tests (unsorted on purpose; alphabetically: Ava, Ben, Daan, Emma, Finn, Lars, Noah). */
export const TEST_NAMES = ["Daan", "Noah", "Lars", "Emma", "Finn", "Ava", "Ben"];

export const playerIds = (n: number): string[] => Array.from({ length: n }, (_, i) => `P${i + 1}`);

let seq = 0;
const newId = () => `id${++seq}`;

/** Command context at T0 + m minutes + s seconds. */
export const c = (m: number, s = 0): Ctx => ({ now: at(m, s), newId });

export function newDay(players = 6, durationsMin: number[] = [20, 20], settings?: Partial<Settings>): MatchDay {
  return createMatchDay(
    { date: "2026-11-21", playerIds: playerIds(players), matchDurationsMs: durationsMin.map(min), settings },
    c(0),
  );
}

/** A day whose first match kicked off at T0 with P1–P4 on the field. */
export function startedDay(players = 6, durationsMin: number[] = [20, 20], settings?: Partial<Settings>): MatchDay {
  const day = newDay(players, durationsMin, settings);
  return startMatch(day, day.matches[0]!.id, c(0), ["P1", "P2", "P3", "P4"]);
}
