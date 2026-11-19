import { describe, expect, it } from "vitest";
import { finishMatch, finishMatchDay, recordGoal, setAvailability, setOpponentName, startMatch, substitute } from "../src/domain/commands.ts";
import { summarizeMatchDay } from "../src/domain/engine/summary.ts";
import { c, min, newDay } from "./fixtures.ts";

describe("match day summary", () => {
  it("adds up results, goals, substitutions and playing time", () => {
    let day = newDay(6, [20, 20, 20]);
    const [m1, m2] = day.matches;
    day = setOpponentName(day, m1!.id, "Vriend", c(0));
    day = startMatch(day, m1!.id, c(0), ["P1", "P2", "P3", "P4"]);
    day = recordGoal(day, m1!.id, "us", 1, c(3));
    day = substitute(day, [{ outId: "P1", inId: "P5" }, { outId: "P2", inId: "P6" }], c(10));
    day = finishMatch(day, c(20));
    day = startMatch(day, m2!.id, c(30), ["P1", "P2", "P5", "P6"]);
    day = recordGoal(day, m2!.id, "them", 1, c(35));
    day = setAvailability(day, "P6", "left", c(40));
    day = finishMatch(day, c(50));
    day = finishMatchDay(day, c(55)); // third match never played

    const s = summarizeMatchDay(day);
    expect(s.matchesPlayed).toBe(2);
    expect(s.totalActiveMs).toBe(min(40));
    expect(s.goals).toEqual({ us: 1, them: 1 });
    expect(s.substitutions).toBe(2);
    expect(s.results.map((r) => [r.number, r.opponentName, r.score])).toEqual([
      [1, "Vriend", { us: 1, them: 0 }],
      [2, "", { us: 0, them: 1 }],
    ]);
    const byId = Object.fromEntries(s.players.map((p) => [p.playerId, p]));
    expect(byId.P1!.totalMs).toBe(min(30));
    expect(byId.P3!.totalMs).toBe(min(20));
    expect(byId.P5!.totalMs).toBe(min(30));
    // A child who left is listed but not counted for the average.
    expect(byId.P6!.deltaFromAverageMs).toBeNull();
    expect(s.fairness.playerIds).not.toContain("P6");
    expect(byId.P1!.deltaFromAverageMs).toBeCloseTo(min(30) - s.fairness.averageMs, 6);
  });
});
