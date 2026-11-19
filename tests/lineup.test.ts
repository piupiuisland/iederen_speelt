import { describe, expect, it } from "vitest";
import { finishMatch, setAvailability, substitute } from "../src/domain/commands.ts";
import { recommendStartingLineup } from "../src/domain/engine/lineup.ts";
import { at, c, newDay, startedDay } from "./fixtures.ts";

describe("starting lineup", () => {
  it("first match uses roster order, optionally rotated", () => {
    expect(recommendStartingLineup(newDay(6), at(0))).toEqual(["P1", "P2", "P3", "P4"]);
    expect(recommendStartingLineup(newDay(6), at(0), 4)).toEqual(["P5", "P6", "P1", "P2"]);
  });

  it("skips unavailable players", () => {
    const day = setAvailability(newDay(6), "P2", "resting", c(0));
    expect(recommendStartingLineup(day, at(0))).toEqual(["P1", "P3", "P4", "P5"]);
  });

  it("later matches start the least-played players", () => {
    const day = finishMatch(startedDay(6), c(20));
    expect(recommendStartingLineup(day, at(25))).toEqual(["P5", "P6", "P1", "P2"]);
  });

  it("breaks ties in favour of players who did not start the previous match", () => {
    let day = substitute(startedDay(7), [{ outId: "P1", inId: "P5" }, { outId: "P2", inId: "P6" }], c(10));
    day = finishMatch(day, c(20));
    // Totals: P7 0, P1/P2/P5/P6 10 min, P3/P4 20 min. P1,P2 started last match.
    expect(recommendStartingLineup(day, at(25))).toEqual(["P7", "P5", "P6", "P1"]);
  });
});
