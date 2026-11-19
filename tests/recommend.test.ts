import { describe, expect, it } from "vitest";
import { finishMatch, setAvailability, startMatch, substitute } from "../src/domain/commands.ts";
import { recommend } from "../src/domain/engine/recommend.ts";
import { replay } from "../src/domain/projection.ts";
import type { MatchDay } from "../src/domain/types.ts";
import { at, c, min, newDay, startedDay } from "./fixtures.ts";

const rec = (day: MatchDay, now: number) => recommend(replay(day, now), day.settings);
const pairs = (day: MatchDay, now: number) => rec(day, now).map((p) => `${p.outId}>${p.inId}`);

describe("recommend", () => {
  it("returns nothing without a live match", () => {
    expect(rec(newDay(), at(0))).toEqual([]);
  });

  it("Scenario A: six players, rotates both bench players in", () => {
    expect(rec(startedDay(6), at(4))).toEqual([
      { outId: "P1", inId: "P5", reason: "rotation" },
      { outId: "P2", inId: "P6", reason: "rotation" },
    ]);
  });

  it("Scenario B: seven players, brings on the least-played", () => {
    const day = substitute(startedDay(7), [{ outId: "P1", inId: "P5" }, { outId: "P2", inId: "P6" }], c(4));
    // field: P3,P4 (8 min) P5,P6 (4 min); bench: P7 (0), P1,P2 (4 min)
    expect(pairs(day, at(8))).toEqual(["P3>P7", "P4>P1"]);
  });

  it("Scenario C: adapts to a manual sub and respects the minimum stint", () => {
    const day = substitute(startedDay(6), [{ outId: "P1", inId: "P5" }], c(2));
    // P5 has only played 2 min (< 3 min minimum) so it is not taken off.
    expect(pairs(day, at(4))).toEqual(["P2>P6", "P3>P1"]);
  });

  it("Scenario D: excludes an unavailable bench player", () => {
    const day = setAvailability(startedDay(6), "P5", "injured", c(1));
    expect(pairs(day, at(4))).toEqual(["P1>P6"]);
  });

  it("takes an unavailable on-field player off first, even before the minimum stint", () => {
    const day = setAvailability(startedDay(6), "P2", "injured", c(1));
    expect(rec(day, at(1))).toEqual([{ outId: "P2", inId: "P5", reason: "unavailable" }]);
  });

  it("flags players over the max stint", () => {
    const day = startedDay(6, [20], { maxStintMs: min(5), reminderIntervalMs: min(2) });
    expect(rec(day, at(6)).map((p) => p.reason)).toEqual(["max-stint", "max-stint"]);
  });

  it("honours maxSubsPerRecommendation", () => {
    expect(rec(startedDay(6, [20], { maxSubsPerRecommendation: 1 }), at(4))).toHaveLength(1);
  });

  it("uses unequal match-day totals from earlier matches", () => {
    let day = finishMatch(startedDay(6), c(20)); // P1–P4: 20 min, P5,P6: 0
    day = startMatch(day, day.matches[1]!.id, c(30), ["P1", "P2", "P5", "P6"]);
    // P1,P2 have the most time; P3,P4 (20 min) are the bench.
    expect(pairs(day, at(34))).toEqual(["P1>P3", "P2>P4"]);
  });

  it("does not bring on a player who has played more than the one going off", () => {
    let day = finishMatch(startedDay(6), c(20));
    day = startMatch(day, day.matches[1]!.id, c(30), ["P5", "P6", "P1", "P2"]);
    day = substitute(day, [{ outId: "P1", inId: "P3" }, { outId: "P2", inId: "P4" }], c(30, 30));
    // Eligible outs: P5,P6 (~3 min total). Bench P1,P2 have ~20 min → no rotation.
    expect(rec(day, at(33, 10))).toEqual([]);
  });

  it("makes no rotation suggestions in the final minute, but does in overtime", () => {
    const day = startedDay(6, [20], { maxStintMs: min(60) });
    expect(rec(day, at(19, 30))).toEqual([]);
    expect(rec(day, at(21))).toHaveLength(2);
  });

  it("never suggests the same player twice or an invalid pair", () => {
    const day = substitute(startedDay(7), [{ outId: "P1", inId: "P5" }], c(1));
    for (let m = 0; m <= 20; m++) {
      const state = replay(day, at(m));
      const ps = recommend(state, day.settings);
      const ids = ps.flatMap((p) => [p.outId, p.inId]);
      expect(new Set(ids).size).toBe(ids.length);
      for (const p of ps) {
        expect(state.current!.onFieldIds).toContain(p.outId);
        expect(state.current!.onFieldIds).not.toContain(p.inId);
      }
    }
  });
});
