// Regression tests for issues found in the Phase 1–2 code review.
import { describe, expect, it } from "vitest";
import {
  createMatchDay,
  DomainError,
  setAvailability,
  startMatch,
  substitute,
  undoLastSubstitution,
} from "../src/domain/commands.ts";
import { replay } from "../src/domain/projection.ts";
import { at, c, min, newDay, playerIds, startedDay } from "./fixtures.ts";

const err = (f: () => unknown, msg?: RegExp) => expect(f).toThrow(msg ?? DomainError);

describe("settings and date validation", () => {
  it("rejects NaN stint limits and min > max", () => {
    const base = { date: "2026-11-21", playerIds: playerIds(6) };
    err(() => createMatchDay({ ...base, settings: { minStintMs: NaN } }, c(0)));
    err(() => createMatchDay({ ...base, settings: { maxStintMs: NaN } }, c(0)));
    err(() => createMatchDay({ ...base, settings: { reminderIntervalMs: NaN } }, c(0)));
    err(() => createMatchDay({ ...base, settings: { minStintMs: min(10), maxStintMs: min(8) } }, c(0)), /minimum stint/);
  });

  it("rejects an empty or malformed date", () => {
    err(() => createMatchDay({ date: "", playerIds: playerIds(6) }, c(0)), /valid date/);
    err(() => createMatchDay({ date: "21-11-2026", playerIds: playerIds(6) }, c(0)), /valid date/);
  });
});

describe("undo safety", () => {
  it("refuses to put an injured player back on the field", () => {
    let day = setAvailability(startedDay(), "P1", "injured", c(3));
    day = substitute(day, [{ outId: "P1", inId: "P5" }], c(3));
    err(() => undoLastSubstitution(day, c(4)), /P1 is injured/);
    day = setAvailability(day, "P1", "available", c(5));
    expect(replay(undoLastSubstitution(day, c(5)), at(6)).current!.onFieldIds).toContain("P1");
  });
});

describe("lineup changes without a swap", () => {
  it("removes an injured player when the bench is empty", () => {
    let day = newDay(4, [20]);
    day = startMatch(day, day.matches[0]!.id, c(0), ["P1", "P2", "P3", "P4"]);
    day = setAvailability(day, "P2", "injured", c(5));
    day = substitute(day, [{ outId: "P2", inId: null }], c(5));
    const s = replay(day, at(10));
    expect(s.current!.onFieldIds.sort()).toEqual(["P1", "P3", "P4"]);
    expect(s.byId.P2!.totalMs).toBe(min(5));
    expect(s.players.reduce((a, p) => a + p.totalMs, 0)).toBe(4 * min(5) + 3 * min(5));
  });

  it("tops up a reduced lineup when a child becomes available", () => {
    let day = setAvailability(newDay(4, [20]), "P4", "resting", c(0));
    day = startMatch(day, day.matches[0]!.id, c(0), ["P1", "P2", "P3"]);
    err(() => substitute(day, [{ outId: null, inId: "P4" }], c(3)), /not available/);
    day = setAvailability(day, "P4", "available", c(3));
    day = substitute(day, [{ outId: null, inId: "P4" }], c(3));
    const s = replay(day, at(10));
    expect(s.current!.onFieldIds).toHaveLength(4);
    expect(s.byId.P4!.totalMs).toBe(min(7));
    // Undo takes them off again.
    expect(replay(undoLastSubstitution(day, c(10)), at(10)).current!.onFieldIds).toHaveLength(3);
  });

  it("never exceeds the field size or empties the field", () => {
    const day = startedDay(6);
    err(() => substitute(day, [{ outId: null, inId: "P5" }], c(1)), /Only 4 players/);
    err(() => substitute(day, [{ outId: null, inId: null }], c(1)), /at least one player/);
    let small = newDay(1, [20], { playersOnField: 1 });
    small = startMatch(small, small.matches[0]!.id, c(0), ["P1"]);
    err(() => substitute(small, [{ outId: "P1", inId: null }], c(1)), /must stay on the field/);
  });
});
