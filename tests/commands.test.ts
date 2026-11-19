import { describe, expect, it } from "vitest";
import {
  addMatch,
  createMatchDay,
  DomainError,
  finishMatch,
  finishMatchDay,
  pauseMatch,
  removeMatch,
  resumeMatch,
  setAvailability,
  setPlannedDuration,
  startMatch,
  substitute,
  undoLastSubstitution,
} from "../src/domain/commands.ts";
import { replay } from "../src/domain/projection.ts";
import { at, c, min, newDay, startedDay } from "./fixtures.ts";

const err = (f: () => unknown) => expect(f).toThrow(DomainError);

describe("match day setup", () => {
  it("defaults to 4 matches of 20 minutes with default settings", () => {
    const day = createMatchDay({ date: "2026-11-21", playerIds: ["A", "B"] }, c(0));
    expect(day.matches.map((m) => m.plannedDurationMs)).toEqual([min(20), min(20), min(20), min(20)]);
    expect(day.settings.playersOnField).toBe(4);
  });

  it("rejects duplicate players and bad settings", () => {
    err(() => createMatchDay({ date: "d", playerIds: ["A", "A"] }, c(0)));
    err(() => createMatchDay({ date: "d", playerIds: [] }, c(0)));
    err(() => createMatchDay({ date: "d", playerIds: ["A"], settings: { playersOnField: 0 } }, c(0)));
    err(() => createMatchDay({ date: "d", playerIds: ["A"], matchDurationsMs: [0] }, c(0)));
  });

  it("adds and removes unstarted matches, edits upcoming durations", () => {
    let day = addMatch(newDay(), c(0), min(25));
    expect(day.matches).toHaveLength(3);
    day = setPlannedDuration(day, day.matches[2]!.id, min(30), c(0));
    expect(day.matches[2]!.plannedDurationMs).toBe(min(30));
    day = removeMatch(day, day.matches[2]!.id, c(0));
    expect(day.matches).toHaveLength(2);
    const started = startedDay();
    err(() => removeMatch(started, started.matches[0]!.id, c(1)));
  });

  it("does not mutate its input", () => {
    const day = startedDay();
    const snapshot = structuredClone(day);
    substitute(day, [{ outId: "P1", inId: "P5" }], c(4));
    pauseMatch(day, c(4));
    expect(day).toEqual(snapshot);
  });
});

describe("lineup validation", () => {
  it("requires exactly playersOnField distinct, available participants", () => {
    const day = newDay();
    const id = day.matches[0]!.id;
    err(() => startMatch(day, id, c(0), ["P1", "P2", "P3"]));
    err(() => startMatch(day, id, c(0), ["P1", "P2", "P3", "P3"]));
    err(() => startMatch(day, id, c(0), ["P1", "P2", "P3", "X9"]));
    err(() => startMatch(day, id, c(0))); // no lineup set
    const injured = setAvailability(day, "P4", "injured", c(0));
    err(() => startMatch(injured, id, c(0), ["P1", "P2", "P3", "P4"]));
  });

  it("Scenario K: allows a reduced lineup only when fewer players are available", () => {
    let day = newDay();
    for (const p of ["P4", "P5", "P6"]) day = setAvailability(day, p, "absent", c(0));
    const id = day.matches[0]!.id;
    err(() => startMatch(day, id, c(0), ["P1", "P2"]));
    const started = startMatch(day, id, c(0), ["P1", "P2", "P3"]);
    expect(replay(started, at(1)).current!.onFieldIds).toHaveLength(3);
  });
});

describe("match flow", () => {
  it("plays matches in order and one at a time", () => {
    const day = startedDay();
    err(() => startMatch(day, day.matches[1]!.id, c(1), ["P1", "P2", "P3", "P4"]));
    const fresh = newDay();
    err(() => startMatch(fresh, fresh.matches[1]!.id, c(0), ["P1", "P2", "P3", "P4"]));
  });

  it("validates pause/resume/finish transitions", () => {
    const day = startedDay();
    err(() => resumeMatch(day, c(1)));
    const paused = pauseMatch(day, c(1));
    err(() => pauseMatch(paused, c(2)));
    const finished = finishMatch(paused, c(3)); // finishing while paused is allowed
    err(() => pauseMatch(finished, c(4)));
    err(() => finishMatch(finished, c(4)));
  });

  it("finishes the match day early and then rejects changes", () => {
    err(() => finishMatchDay(startedDay(), c(5)));
    const done = finishMatchDay(finishMatch(startedDay(), c(20)), c(21));
    expect(replay(done, at(22)).finished).toBe(true);
    expect(replay(done, at(22)).completedMatches).toBe(1);
    err(() => startMatch(done, done.matches[1]!.id, c(30), ["P1", "P2", "P3", "P4"]));
  });
});

describe("substitution validation", () => {
  const day = startedDay();
  it("rejects invalid pairs", () => {
    err(() => substitute(day, [], c(4)));
    err(() => substitute(day, [{ outId: "P5", inId: "P6" }], c(4))); // out is on the bench
    err(() => substitute(day, [{ outId: "P1", inId: "P2" }], c(4))); // in is on the field
    err(() => substitute(day, [{ outId: "P1", inId: "P1" }], c(4))); // same player
    err(() => substitute(day, [{ outId: "P1", inId: "X9" }], c(4))); // not participating
    err(() => substitute(day, [{ outId: "P1", inId: "P5" }, { outId: "P2", inId: "P5" }], c(4))); // duplicate
    const injured = setAvailability(day, "P5", "injured", c(3));
    err(() => substitute(injured, [{ outId: "P1", inId: "P5" }], c(4)));
  });

  it("allows substituting while paused", () => {
    const paused = pauseMatch(day, c(3));
    expect(() => substitute(paused, [{ outId: "P1", inId: "P5" }], c(4))).not.toThrow();
  });

  it("requires a live match", () => {
    const fresh = newDay();
    err(() => substitute(fresh, [{ outId: "P1", inId: "P5" }], c(0)));
    err(() => substitute(finishMatch(day, c(20)), [{ outId: "P1", inId: "P5" }], c(21)));
  });

  it("undo needs something to undo", () => {
    err(() => undoLastSubstitution(day, c(4)));
    const once = undoLastSubstitution(substitute(day, [{ outId: "P1", inId: "P5" }], c(4)), c(5));
    err(() => undoLastSubstitution(once, c(6)));
  });
});
