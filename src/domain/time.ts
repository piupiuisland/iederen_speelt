import type { MatchEvent, Ms } from "./types.ts";

export type Interval = readonly [start: number, end: number];

/**
 * Wall-clock intervals during which the match clock was running, derived from
 * START/PAUSE/RESUME/FINISH and with GAP_CORRECTION periods removed.
 * An open interval (running match) ends at `nowMs`.
 */
export function runningIntervals(events: readonly MatchEvent[], nowMs: number): Interval[] {
  const raw: Interval[] = [];
  let openAt: number | null = null;
  for (const e of events) {
    if (e.type === "START" || e.type === "RESUME") {
      if (openAt === null) openAt = e.t;
    } else if (e.type === "PAUSE" || e.type === "FINISH") {
      if (openAt !== null) {
        raw.push([openAt, Math.max(openAt, e.t)]);
        openAt = null;
      }
    }
  }
  if (openAt !== null) raw.push([openAt, Math.max(openAt, nowMs)]);

  const gaps = events.flatMap((e): Interval[] => (e.type === "GAP_CORRECTION" ? [[e.fromT, e.toT]] : []));
  return gaps.reduce<Interval[]>((acc, gap) => acc.flatMap((iv) => subtract(iv, gap)), raw);
}

function subtract([s, e]: Interval, [gs, ge]: Interval): Interval[] {
  if (ge <= s || gs >= e) return [[s, e]];
  const out: Interval[] = [];
  if (gs > s) out.push([s, gs]);
  if (ge < e) out.push([ge, e]);
  return out;
}

/** Running time between two wall-clock instants. */
export function activeMsBetween(intervals: readonly Interval[], from: number, to: number): Ms {
  let sum = 0;
  for (const [s, e] of intervals) {
    const a = Math.max(s, from);
    const b = Math.min(e, to);
    if (b > a) sum += b - a;
  }
  return sum;
}

export function totalActiveMs(intervals: readonly Interval[]): Ms {
  return intervals.reduce((sum, [s, e]) => sum + (e - s), 0);
}
