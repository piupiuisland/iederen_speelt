import { describe, expect, it } from "vitest";
import { DomainError } from "../src/domain/commands.ts";
import { recommendStartingLineup } from "../src/domain/engine/lineup.ts";
import {
  activePlayers,
  addPlayer,
  createMatchDayFromAttendance,
  createRoster,
  defaultAttendance,
  removePlayer,
  renamePlayer,
} from "../src/domain/roster.ts";
import { at, c, TEST_NAMES } from "./fixtures.ts";

const ids = () => {
  let n = 0;
  return () => `k${++n}`;
};
const names = (r: ReturnType<typeof createRoster>) => activePlayers(r).map((p) => p.name);

describe("roster", () => {
  it("starts empty: children's names are never stored in the code", () => {
    expect(names(createRoster())).toEqual([]);
  });

  it("sorts the team alphabetically", () => {
    expect(names(createRoster(TEST_NAMES))).toEqual(["Ava", "Ben", "Daan", "Emma", "Finn", "Lars", "Noah"]);
  });

  it("stays sorted after add and rename", () => {
    let r = addPlayer(createRoster(TEST_NAMES, ids()), "Bo", ids());
    expect(names(r).slice(0, 3)).toEqual(["Ava", "Ben", "Bo"]);
    const sep = r.players.find((p) => p.name === "Noah")!;
    r = renamePlayer(r, sep.id, "Aaa");
    expect(names(r)[0]).toBe("Aaa");
  });

  it("rejects empty and duplicate names (case-insensitive)", () => {
    const r = createRoster(TEST_NAMES, ids());
    expect(() => addPlayer(r, "  ")).toThrow(DomainError);
    expect(() => addPlayer(r, "daan")).toThrow(DomainError);
  });

  it("removing archives the player", () => {
    const r = createRoster(TEST_NAMES, ids());
    const nina = r.players.find((p) => p.name === "Emma")!;
    const after = removePlayer(r, nina.id);
    expect(names(after)).not.toContain("Emma");
    expect(after.players).toHaveLength(7);
  });
});

describe("attendance → match day", () => {
  it("everyone is present by default; absent children are left out", () => {
    const r = createRoster(TEST_NAMES, ids());
    const attendance = defaultAttendance(r);
    expect(Object.values(attendance).every(Boolean)).toBe(true);

    const nameOf = (id: string) => r.players.find((p) => p.id === id)!.name;
    const idOf = (name: string) => r.players.find((p) => p.name === name)!.id;
    attendance[idOf("Finn")] = false;

    const day = createMatchDayFromAttendance(r, attendance, { date: "2026-11-21" }, c(0));
    expect(day.playerIds.map(nameOf)).toEqual(["Ava", "Ben", "Daan", "Emma", "Lars", "Noah"]);
    expect(recommendStartingLineup(day, at(0)).map(nameOf)).toEqual(["Ava", "Ben", "Daan", "Emma"]);
  });

  it("needs at least one child present", () => {
    const r = createRoster(TEST_NAMES, ids());
    const none = Object.fromEntries(r.players.map((p) => [p.id, false]));
    expect(() => createMatchDayFromAttendance(r, none, { date: "2026-11-21" }, c(0))).toThrow(DomainError);
  });
});
