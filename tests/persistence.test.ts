import { describe, expect, it } from "vitest";
import {
  correctGap,
  detectInterruption,
  heartbeat,
  pauseMatch,
  setAvailability,
  substitute,
  undoLastSubstitution,
} from "../src/domain/commands.ts";
import { replay } from "../src/domain/projection.ts";
import type { MatchDay } from "../src/domain/types.ts";
import { at, c, min, startedDay } from "./fixtures.ts";

const roundTrip = (day: MatchDay): MatchDay => JSON.parse(JSON.stringify(day));

describe("persistence and recovery", () => {
  it("Scenario F: a JSON round-trip replays to the identical state", () => {
    let day = substitute(startedDay(7), [{ outId: "P1", inId: "P5" }, { outId: "P2", inId: "P6" }], c(4));
    day = undoLastSubstitution(day, c(5));
    day = substitute(day, [{ outId: "P3", inId: "P7" }], c(6));
    day = setAvailability(day, "P1", "resting", c(7));
    day = pauseMatch(day, c(8));
    expect(replay(roundTrip(day), at(12))).toEqual(replay(day, at(12)));
  });

  it("detects an interruption only for a running match past the threshold", () => {
    const day = heartbeat(startedDay(), at(5));
    expect(detectInterruption(day, at(6))).toBeNull();
    expect(detectInterruption(day, at(12))).toEqual({ fromT: at(5), toT: at(12), gapMs: min(7) });
    expect(detectInterruption(pauseMatch(day, c(5)), at(12))).toBeNull();
  });

  it("Scenario G: by default, time while closed counts; the user can correct it", () => {
    const day = heartbeat(startedDay(), at(5));
    expect(replay(day, at(12)).current!.elapsedMs).toBe(min(12));
    const gap = detectInterruption(day, at(12))!;
    const corrected = correctGap(day, gap.fromT, gap.toT, c(12));
    expect(replay(corrected, at(12)).current!.elapsedMs).toBe(min(5));
    expect(replay(corrected, at(14)).current!.elapsedMs).toBe(min(7));
  });

  it("rejects corrections outside the match", () => {
    const day = startedDay();
    expect(() => correctGap(day, at(-1), at(2), c(5))).toThrow();
    expect(() => correctGap(day, at(3), at(6), c(5))).toThrow();
    expect(() => correctGap(day, at(3), at(3), c(5))).toThrow();
  });
});
