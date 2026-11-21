import { describe, expect, it } from "vitest";
import { finishMatch, finishMatchDay, recordGoal, setScore } from "../src/domain/commands.ts";
import { replay } from "../src/domain/projection.ts";
import type { MatchDay } from "../src/domain/types.ts";
import { at, c, startedDay } from "./fixtures.ts";

const score = (day: MatchDay) => replay(day, at(60)).matches[0]!.score;

describe("correcting a score", () => {
  it("sets the score of a finished match outright; later goals count on top", () => {
    let day = startedDay();
    const id = day.matches[0]!.id;
    day = recordGoal(day, id, "us", 1, c(2));
    day = finishMatch(day, c(20));
    day = setScore(day, id, { us: 3, them: 2 }, c(25));
    expect(score(day)).toEqual({ us: 3, them: 2 });
    expect(score(recordGoal(day, id, "them", -1, c(26)))).toEqual({ us: 3, them: 1 });
  });

  it("works after the match day has ended, without touching playing time", () => {
    let day = finishMatchDay(finishMatch(startedDay(), c(20)), c(21));
    const before = replay(day, at(60)).players.map((p) => p.totalMs);
    day = setScore(day, day.matches[0]!.id, { us: 4, them: 0 }, c(90));
    expect(score(day)).toEqual({ us: 4, them: 0 });
    expect(replay(day, at(60)).players.map((p) => p.totalMs)).toEqual(before);
  });

  it("rejects bad scores and unstarted matches", () => {
    const day = startedDay();
    expect(() => setScore(day, day.matches[0]!.id, { us: -1, them: 0 }, c(1))).toThrow(/0–99/);
    expect(() => setScore(day, day.matches[1]!.id, { us: 1, them: 0 }, c(1))).toThrow(/not started/);
  });
});
