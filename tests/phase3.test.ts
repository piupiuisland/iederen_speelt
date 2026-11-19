import { describe, expect, it } from "vitest";
import {
  DomainError,
  finishMatch,
  recordGoal,
  setAvailability,
  setMatchPlayersOnField,
  setOpponentName,
  startMatch,
  substitute,
} from "../src/domain/commands.ts";
import { recommendStartingLineup } from "../src/domain/engine/lineup.ts";
import { recommend } from "../src/domain/engine/recommend.ts";
import { replay } from "../src/domain/projection.ts";
import { createRoster, DEFAULT_TEAM_NAME, setTeamName, teamNameOf } from "../src/domain/roster.ts";
import type { MatchDay } from "../src/domain/types.ts";
import { at, c, newDay, startedDay } from "./fixtures.ts";

const score = (day: MatchDay, i = 0) => replay(day, at(30)).matches[i]!.score;

describe("score", () => {
  it("counts goals for both sides and allows corrections", () => {
    const day = startedDay();
    const id = day.matches[0]!.id;
    let d = recordGoal(day, id, "us", 1, c(2));
    d = recordGoal(d, id, "us", 1, c(5));
    d = recordGoal(d, id, "them", 1, c(7));
    d = recordGoal(d, id, "us", -1, c(8));
    expect(score(d)).toEqual({ us: 1, them: 1 });
  });

  it("never goes below zero and needs a started match", () => {
    const day = startedDay();
    expect(() => recordGoal(day, day.matches[0]!.id, "them", -1, c(1))).toThrow(DomainError);
    expect(() => recordGoal(day, day.matches[1]!.id, "us", 1, c(1))).toThrow(/not started/);
  });

  it("can still correct a finished match", () => {
    const day = finishMatch(startedDay(), c(20));
    expect(score(recordGoal(day, day.matches[0]!.id, "us", 1, c(21)))).toEqual({ us: 1, them: 0 });
  });

  it("keeps scores per match", () => {
    const base = startedDay();
    let day = recordGoal(base, base.matches[0]!.id, "us", 1, c(1));
    day = finishMatch(day, c(20));
    day = startMatch(day, day.matches[1]!.id, c(25), ["P1", "P2", "P3", "P4"]);
    day = recordGoal(day, day.matches[1]!.id, "them", 1, c(26));
    expect(score(day, 0)).toEqual({ us: 1, them: 0 });
    expect(score(day, 1)).toEqual({ us: 0, them: 1 });
  });
});

describe("names", () => {
  it("stores a trimmed opponent name per match", () => {
    const day = newDay();
    const d = setOpponentName(day, day.matches[1]!.id, "  VV   Vriend ", c(0));
    const s = replay(d, at(0));
    expect(s.matches[0]!.opponentName).toBe("");
    expect(s.matches[1]!.opponentName).toBe("VV Vriend");
  });

  it("team name defaults to Best Vooruit and can be changed", () => {
    const roster = createRoster();
    expect(teamNameOf(roster)).toBe(DEFAULT_TEAM_NAME);
    expect(teamNameOf({ players: [] })).toBe("Best Vooruit"); // roster saved before team names existed
    expect(teamNameOf(setTeamName(roster, " Vooruit JO7-5 "))).toBe("Vooruit JO7-5");
    expect(() => setTeamName(roster, "  ")).toThrow(DomainError);
  });
});

describe("field size per match", () => {
  it("validates lineups and subs against the match's own size", () => {
    const base = newDay(7);
    const id = base.matches[0]!.id;
    let day = setMatchPlayersOnField(base, id, 5, c(0));
    expect(() => setMatchPlayersOnField(day, id, 0, c(0))).toThrow(DomainError);
    expect(() => startMatch(day, id, c(0), ["P1", "P2", "P3", "P4"])).toThrow(/needs 5/);
    day = startMatch(day, id, c(0), ["P1", "P2", "P3", "P4", "P5"]);
    expect(replay(day, at(1)).current!.playersOnField).toBe(5);
    expect(() => substitute(day, [{ outId: null, inId: "P6" }], c(1))).toThrow(/Only 5/);
    expect(() => setMatchPlayersOnField(day, id, 6, c(1))).toThrow(/already started/);
    // Other matches keep the default.
    expect(replay(day, at(1)).matches[1]!.playersOnField).toBe(4);
  });

  it("suggests a lineup of the requested size", () => {
    expect(recommendStartingLineup(newDay(7), at(0), 0, 6)).toHaveLength(6);
  });
});

describe("recommendations beyond simple swaps", () => {
  it("suggests filling an empty place when a child becomes available", () => {
    let day = setAvailability(newDay(6), "P4", "resting", c(0));
    day = startMatch(day, day.matches[0]!.id, c(0), ["P1", "P2", "P3", "P5"]);
    day = setAvailability(day, "P4", "available", c(1));
    // Field has 4 already: P6 and P4 are bench; no fill needed.
    expect(recommend(replay(day, at(1)), day.settings).some((p) => p.reason === "fill")).toBe(false);

    let short = setAvailability(newDay(4), "P4", "resting", c(0));
    short = startMatch(short, short.matches[0]!.id, c(0), ["P1", "P2", "P3"]);
    short = setAvailability(short, "P4", "available", c(1));
    expect(recommend(replay(short, at(1)), short.settings)).toEqual([{ outId: null, inId: "P4", reason: "fill" }]);
  });

  it("suggests taking an injured child off even when the bench is empty", () => {
    let day = newDay(4);
    day = startMatch(day, day.matches[0]!.id, c(0), ["P1", "P2", "P3", "P4"]);
    day = setAvailability(day, "P3", "injured", c(2));
    const pairs = recommend(replay(day, at(2)), day.settings);
    expect(pairs).toEqual([{ outId: "P3", inId: null, reason: "unavailable" }]);
    expect(() => substitute(day, pairs, c(2))).not.toThrow();
  });

  it("never suggests emptying the field", () => {
    let day = newDay(1, [20], { playersOnField: 1 });
    day = startMatch(day, day.matches[0]!.id, c(0), ["P1"]);
    day = setAvailability(day, "P1", "injured", c(1));
    expect(recommend(replay(day, at(1)), day.settings)).toEqual([]);
  });
});
