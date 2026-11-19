import { describe, expect, it } from "vitest";
import {
  correctGap,
  finishMatch,
  pauseMatch,
  respondToReminder,
  resumeMatch,
  setPlannedDuration,
  startMatch,
  substitute,
  undoLastSubstitution,
} from "../src/domain/commands.ts";
import { replay } from "../src/domain/projection.ts";
import { at, c, min, newDay, startedDay } from "./fixtures.ts";

const sumTotals = (day: ReturnType<typeof startedDay>, now: number) =>
  replay(day, now).players.reduce((s, p) => s + p.totalMs, 0);

describe("time tracking", () => {
  it("accumulates on-field and bench time", () => {
    const s = replay(startedDay(), at(5));
    expect(s.byId.P1!.totalMs).toBe(min(5));
    expect(s.byId.P1!.stintMs).toBe(min(5));
    expect(s.byId.P5!.totalMs).toBe(0);
    expect(s.byId.P5!.benchStintMs).toBe(min(5));
    expect(s.current!.elapsedMs).toBe(min(5));
    expect(s.current!.remainingMs).toBe(min(15));
  });

  it("stops while paused and continues after resume", () => {
    let day = pauseMatch(startedDay(), c(5));
    expect(replay(day, at(7)).byId.P1!.totalMs).toBe(min(5));
    expect(replay(day, at(7)).current!.status).toBe("paused");
    day = resumeMatch(day, c(8));
    expect(replay(day, at(10)).byId.P1!.totalMs).toBe(min(7));
    expect(replay(day, at(10)).current!.elapsedMs).toBe(min(7));
  });

  it("is exact after a long gap without ticks (phone locked / backgrounded)", () => {
    const s = replay(startedDay(), at(13, 27));
    expect(s.byId.P1!.totalMs).toBe(min(13) + 27_000);
  });

  it("supports overtime without finishing the match", () => {
    const s = replay(startedDay(), at(25));
    expect(s.current!.status).toBe("running");
    expect(s.current!.remainingMs).toBe(-min(5));
    expect(s.current!.isOvertime).toBe(true);
  });

  it("applies a planned-duration change during the match", () => {
    const base = startedDay();
    const day = setPlannedDuration(base, base.matches[0]!.id, min(25), c(5));
    expect(replay(day, at(10)).current!.remainingMs).toBe(min(15));
  });

  it("does not count breaks and accumulates across matches", () => {
    let day = finishMatch(startedDay(), c(20));
    day = startMatch(day, day.matches[1]!.id, c(30), ["P3", "P4", "P5", "P6"]);
    const s = replay(day, at(40));
    expect(s.byId.P1!.totalMs).toBe(min(20));
    expect(s.byId.P1!.matchMs).toBe(0);
    expect(s.byId.P3!.totalMs).toBe(min(30));
    expect(s.byId.P3!.matchMs).toBe(min(10));
    expect(s.byId.P5!.totalMs).toBe(min(10));
    expect(s.totalActiveMs).toBe(min(30));
    expect(s.completedMatches).toBe(1);
    expect(s.current!.number).toBe(2);
  });

  it("preserves totals across matches with different durations", () => {
    let day = newDay(6, [20, 30]);
    day = startMatch(day, day.matches[0]!.id, c(0), ["P1", "P2", "P3", "P4"]);
    day = finishMatch(day, c(20));
    day = startMatch(day, day.matches[1]!.id, c(25), ["P1", "P2", "P5", "P6"]);
    day = finishMatch(day, c(55));
    const s = replay(day, at(60));
    expect(s.byId.P1!.totalMs).toBe(min(50));
    expect(s.byId.P3!.totalMs).toBe(min(20));
    expect(s.byId.P5!.totalMs).toBe(min(30));
    expect(s.totalActiveMs).toBe(min(50));
  });

  it("excludes a corrected gap", () => {
    const day = correctGap(startedDay(), at(5), at(9), c(10));
    expect(replay(day, at(10)).current!.elapsedMs).toBe(min(6));
    expect(replay(day, at(10)).byId.P1!.totalMs).toBe(min(6));
  });

  it("derives match status from events", () => {
    const day = newDay();
    expect(replay(day, at(0)).matches.map((m) => m.status)).toEqual(["ready", "ready"]);
    const finished = finishMatch(startedDay(), c(20));
    expect(replay(finished, at(21)).matches.map((m) => m.status)).toEqual(["finished", "ready"]);
    expect(replay(finished, at(21)).current).toBeNull();
  });
});

describe("substitutions", () => {
  it("moves players and resets stints", () => {
    const day = substitute(startedDay(), [{ outId: "P1", inId: "P5" }], c(4));
    const s = replay(day, at(10));
    expect(s.current!.onFieldIds.sort()).toEqual(["P2", "P3", "P4", "P5"]);
    expect(s.byId.P1).toMatchObject({ totalMs: min(4), onField: false, stintMs: 0, benchStintMs: min(6), subsOut: 1 });
    expect(s.byId.P5).toMatchObject({ totalMs: min(6), onField: true, stintMs: min(6), benchStintMs: 0, subsIn: 1 });
    expect(s.current!.substitutionCount).toBe(1);
  });

  it("keeps total player time equal to K × active time", () => {
    let day = substitute(startedDay(), [{ outId: "P1", inId: "P5" }, { outId: "P2", inId: "P6" }], c(4));
    day = pauseMatch(day, c(6));
    day = resumeMatch(day, c(7));
    day = substitute(day, [{ outId: "P5", inId: "P1" }], c(9));
    expect(sumTotals(day, at(12))).toBe(4 * replay(day, at(12)).totalActiveMs);
  });

  it("undo restores lineup and recalculates time as if the sub never happened", () => {
    let day = substitute(startedDay(), [{ outId: "P1", inId: "P5" }], c(4));
    day = undoLastSubstitution(day, c(5));
    const s = replay(day, at(10));
    expect(s.current!.onFieldIds.sort()).toEqual(["P1", "P2", "P3", "P4"]);
    expect(s.byId.P1!.totalMs).toBe(min(10));
    expect(s.byId.P5!.totalMs).toBe(0);
    expect(s.current!.lastBatchId).toBeNull();
  });

  it("undo reverts a whole batch, and repeated undo works like a stack", () => {
    let day = substitute(startedDay(), [{ outId: "P1", inId: "P5" }], c(4));
    day = substitute(day, [{ outId: "P2", inId: "P6" }, { outId: "P3", inId: "P1" }], c(6));
    day = undoLastSubstitution(day, c(7));
    expect(replay(day, at(7)).current!.onFieldIds.sort()).toEqual(["P2", "P3", "P4", "P5"]);
    day = undoLastSubstitution(day, c(8));
    expect(replay(day, at(8)).current!.onFieldIds.sort()).toEqual(["P1", "P2", "P3", "P4"]);
  });
});

describe("reminder clock", () => {
  it("counts down active time from kick-off", () => {
    const day = startedDay();
    expect(replay(day, at(3, 59)).current!.nextReminderInMs).toBe(1000);
    expect(replay(day, at(3, 59)).current!.reminderDue).toBe(false);
    expect(replay(day, at(4)).current!.reminderDue).toBe(true);
  });

  it("stops while paused", () => {
    let day = pauseMatch(startedDay(), c(2));
    day = resumeMatch(day, c(5));
    expect(replay(day, at(6)).current!.nextReminderInMs).toBe(min(1));
  });

  it("restarts after a substitution, skip, or snooze", () => {
    const sub = substitute(startedDay(), [{ outId: "P1", inId: "P5" }], c(4));
    expect(replay(sub, at(5)).current!.nextReminderInMs).toBe(min(3));
    const skip = respondToReminder(startedDay(), "skip", c(4));
    expect(replay(skip, at(5)).current!.nextReminderInMs).toBe(min(3));
    const snooze = respondToReminder(startedDay(), "snooze", c(4));
    expect(replay(snooze, at(4, 30)).current!.nextReminderInMs).toBe(30_000);
  });

  it("is null when the match is not live", () => {
    expect(replay(finishMatch(startedDay(), c(20)), at(21)).matches[0]!.nextReminderInMs).toBeNull();
  });
});
