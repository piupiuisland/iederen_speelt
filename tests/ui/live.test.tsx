/** @vitest-environment jsdom */
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { heartbeat, startMatch } from "../../src/domain/commands.ts";
import { recommendStartingLineup } from "../../src/domain/engine/lineup.ts";
import { createMatchDayFromAttendance, createRoster, defaultAttendance } from "../../src/domain/roster.ts";
import { MINUTE } from "../../src/domain/settings.ts";
import { openRepo } from "../../src/store/db.ts";
import { DEFAULT_PREFS, todayISO } from "../../src/store/prefs.ts";
import { TEST_NAMES } from "../fixtures.ts";
import { freshDbName, readDb, renderApp } from "./helpers.tsx";

afterEach(cleanup);

/** A database with match 1 kicked off `startedMinAgo` minutes ago (lineup Ava, Ben, Daan, Emma). */
async function seedRunningMatch(startedMinAgo: number, lastSeenMinAgo = 0) {
  const dbName = freshDbName();
  const repo = await openRepo(dbName);
  const roster = createRoster(TEST_NAMES);
  await repo.saveRoster(roster);
  const now = Date.now();
  const t0 = now - startedMinAgo * MINUTE;
  let day = createMatchDayFromAttendance(roster, defaultAttendance(roster), { date: todayISO() }, { now: t0 });
  day = startMatch(day, day.matches[0]!.id, { now: t0 }, recommendStartingLineup(day, t0));
  day = heartbeat(day, now - lastSeenMinAgo * MINUTE);
  await repo.startMatchDay(day, DEFAULT_PREFS);
  repo.close();
  return dbName;
}

const card = (name: string, where: "field" | "bench") =>
  screen.getByRole("button", { name: new RegExp(`^${name}, on ${where === "field" ? "field" : "bench"}`) });

describe("pre-match", () => {
  it("sets opponent, match length and lineup, then kicks off", async () => {
    const { user, dbName } = await renderApp();
    await user.click(screen.getByRole("button", { name: /Start match day/ }));
    expect(await screen.findByRole("heading", { name: "Match 1 of 4" })).toBeInTheDocument();

    // Suggested lineup for the first match: the first four alphabetically.
    for (const n of ["Ava", "Ben", "Daan", "Emma"])
      expect(screen.getByRole("button", { name: `Start ${n}` })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("4 of 4 selected")).toBeInTheDocument();

    // Swap a starter: deselect Emma, select Noah.
    await user.click(screen.getByRole("button", { name: "Start Emma" }));
    await user.click(screen.getByRole("button", { name: "Start Noah" }));

    await user.type(screen.getByRole("textbox", { name: "Opponent name" }), "Vriend");
    await user.click(screen.getByRole("button", { name: "30′" }));
    expect(screen.getByRole("status", { name: "Match length" })).toHaveTextContent("30");

    await user.click(screen.getByRole("button", { name: /Kick off/ }));
    expect(await screen.findByLabelText("Match clock")).toBeInTheDocument();
    expect(screen.getByText("Best Vooruit")).toBeInTheDocument();
    expect(screen.getByText("Vriend")).toBeInTheDocument();
    expect(card("Noah", "field")).toBeInTheDocument();
    expect(card("Emma", "bench")).toBeInTheDocument();

    await waitFor(async () => {
      const day = await readDb(dbName, (r) => r.getActiveMatchDay());
      expect(day!.matches[0]!.plannedDurationMs).toBe(30 * MINUTE);
      expect(day!.matches[0]!.opponentName).toBe("Vriend");
    });
  });
});

describe("field size per match", () => {
  it("starts with 5 on the field and keeps the parent's picks when changing size", async () => {
    const { user, dbName } = await renderApp();
    await user.click(screen.getByRole("button", { name: /Start match day/ }));
    await screen.findByRole("heading", { name: "Match 1 of 4" });
    const sizes = () => within(screen.getByRole("group", { name: "On the field" }));

    // Parent swaps Emma for Noah, then picks 5 on the field: Noah stays, one more is added.
    await user.click(screen.getByRole("button", { name: "Start Emma" }));
    await user.click(screen.getByRole("button", { name: "Start Noah" }));
    await user.click(sizes().getByRole("button", { name: "5" }));
    expect(screen.getByText("5 of 5 selected")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start Noah" })).toHaveAttribute("aria-pressed", "true");

    // Back down to 4 trims the last pick; then up to 6.
    await user.click(sizes().getByRole("button", { name: "4" }));
    expect(screen.getByText("4 of 4 selected")).toBeInTheDocument();
    await user.click(sizes().getByRole("button", { name: "6" }));
    expect(screen.getByText("6 of 6 selected")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Kick off/ }));
    expect(await screen.findByText("On the field · 6/6")).toBeInTheDocument();
    await waitFor(async () => {
      const day = await readDb(dbName, (r) => r.getActiveMatchDay());
      expect(day!.matches[0]!.playersOnField).toBe(6);
    });

    // The next match defaults to the size used last.
    await user.click(screen.getByRole("button", { name: /Finish/ }));
    await user.click(screen.getByRole("button", { name: "Yes, finish" }));
    await screen.findByRole("heading", { name: "Match 2 of 4" });
    expect(sizes().getByRole("button", { name: "6" })).toHaveAttribute("aria-pressed", "true");
  });
});

describe("live match", () => {
  it("keeps score, swaps with two taps, undoes, pauses and finishes", async () => {
    const { user } = await renderApp(await seedRunningMatch(1));
    expect(screen.getByLabelText("Score")).toHaveTextContent("0:0");

    await user.click(screen.getByRole("button", { name: "Goal for Best Vooruit" }));
    await user.click(screen.getByRole("button", { name: "Goal for Best Vooruit" }));
    await user.click(screen.getByRole("button", { name: "Goal for Tegenstander" }));
    await user.click(screen.getByRole("button", { name: "Remove goal for Best Vooruit" }));
    expect(screen.getByLabelText("Score")).toHaveTextContent("1:1");

    // Two taps: field player, then bench player.
    await user.click(card("Ava", "field"));
    await user.click(card("Finn", "bench"));
    expect(card("Finn", "field")).toBeInTheDocument();
    expect(card("Ava", "bench")).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "" })).toHaveTextContent("Ava ⇄ Finn");

    await user.click(screen.getByRole("button", { name: "Undo last substitution" }));
    expect(card("Ava", "field")).toBeInTheDocument();
    expect(card("Finn", "bench")).toBeInTheDocument();

    // Tapping the same card again just deselects; nothing changes.
    await user.click(card("Daan", "field"));
    await user.click(card("Daan", "field"));
    expect(card("Daan", "field")).toHaveAttribute("aria-pressed", "false");

    await user.click(screen.getByRole("button", { name: /Pause/ }));
    expect(screen.getByText("PAUSED")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Resume/ }));

    await user.click(screen.getByRole("button", { name: /Finish/ }));
    await user.click(screen.getByRole("button", { name: "Yes, finish" }));
    expect(await screen.findByRole("heading", { name: "Match 2 of 4" })).toBeInTheDocument();
    expect(screen.getByLabelText("Match 1 score")).toHaveTextContent("1 : 1");
  });

  it("marks a child injured and takes them off without a sub", async () => {
    const { user } = await renderApp(await seedRunningMatch(1));
    await user.click(card("Daan", "field"));
    await user.click(screen.getByRole("button", { name: "Injured" }));
    // Suggestion: Daan off, least-played bench child on.
    expect(screen.getByLabelText("Suggested substitutions")).toHaveTextContent("Daan");
    await user.click(card("Daan", "field"));
    await user.click(screen.getByRole("button", { name: "Off, no sub" }));
    expect(card("Daan", "bench")).toHaveAccessibleName(/injured/);
    expect(screen.getByText("On the field · 3/4")).toBeInTheDocument();
  });

  it("shows the suggestion when a sub is due and applies it in one tap", async () => {
    const { user } = await renderApp(await seedRunningMatch(5));
    expect(screen.getByText("Sub time!")).toBeInTheDocument();
    const box = screen.getByLabelText("Suggested substitutions");
    expect(box).toHaveTextContent("Ava");
    expect(box).toHaveTextContent("Finn");
    await user.click(screen.getByRole("button", { name: "Do these 2 subs" }));
    expect(card("Finn", "field")).toBeInTheDocument();
    expect(card("Lars", "field")).toBeInTheDocument();
    expect(card("Ava", "bench")).toBeInTheDocument();
  });

  it("can lengthen the match while it runs", async () => {
    const { user, dbName } = await renderApp(await seedRunningMatch(1));
    await user.click(screen.getByRole("button", { name: "Lengthen match by 1 minute" }));
    expect(screen.getByText("21′")).toBeInTheDocument();
    await waitFor(async () => {
      const day = await readDb(dbName, (r) => r.getActiveMatchDay());
      expect(day!.matches[0]!.events.some((e) => e.type === "DURATION_CHANGE")).toBe(true);
    });
  });

  it("survives a refresh mid-match", async () => {
    const dbName = await seedRunningMatch(3);
    const first = await renderApp(dbName);
    await first.user.click(screen.getByRole("button", { name: "Goal for Best Vooruit" }));
    await waitFor(async () => {
      const day = await readDb(dbName, (r) => r.getActiveMatchDay());
      expect(day!.matches[0]!.events.some((e) => e.type === "GOAL")).toBe(true);
    });
    first.unmount();
    await renderApp(dbName);
    expect(screen.getByLabelText("Score")).toHaveTextContent("1:0");
    expect(screen.getByLabelText("Match clock").textContent).toMatch(/^03:0\d$/);
  });

  it("asks about time while the app was closed and can exclude it", async () => {
    const { user } = await renderApp(await seedRunningMatch(10, 9));
    expect(screen.getByRole("alert")).toHaveTextContent(/closed for 9:0\d/);
    expect(screen.getByLabelText("Match clock").textContent).toMatch(/^10:0\d$/);
    await user.click(screen.getByRole("button", { name: "Don't count it" }));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByLabelText("Match clock").textContent).toMatch(/^0(0:5\d|1:0\d)$/);
  });
});

describe("substitution templates", () => {
  it("suggests the rhythm for today's situation and applies it at kick-off", async () => {
    const { user, dbName } = await renderApp();
    await user.click(screen.getByRole("button", { name: /Start match day/ }));
    await screen.findByRole("heading", { name: "Match 1 of 4" });
    const subs = within(screen.getByLabelText("Substitutions"));
    // 7 children, 4 on the field, 20 min.
    expect(subs.getByText(/every 8 min, 2 at a time/)).toBeInTheDocument();
    expect(subs.getByRole("status", { name: "Swap every" })).toHaveTextContent("8");
    expect(subs.getByRole("status", { name: "Children per swap" })).toHaveTextContent("2");

    // Parent changes it, then goes back to the recommendation.
    await user.click(subs.getByRole("button", { name: "Decrease Swap every" }));
    expect(subs.getByRole("status", { name: "Swap every" })).toHaveTextContent("7");
    await user.click(subs.getByRole("button", { name: "Use recommended" }));
    expect(subs.getByRole("status", { name: "Swap every" })).toHaveTextContent("8");

    await user.click(screen.getByRole("button", { name: /Kick off/ }));
    expect(await screen.findByText(/Next sub 0[78]:\d\d · 2×/)).toBeInTheDocument();
    await waitFor(async () => {
      const m = (await readDb(dbName, (r) => r.getActiveMatchDay()))!.matches[0]!;
      expect(m.reminderIntervalMs).toBe(8 * MINUTE);
      expect(m.maxSubsPerReminder).toBe(2);
    });
  });

  it("needs no substitutions when everyone fits on the field", async () => {
    const { user } = await renderApp();
    for (const n of ["Ava", "Ben", "Daan"]) await user.click(screen.getByRole("button", { name: new RegExp(`^${n}:`) }));
    await user.click(screen.getByRole("button", { name: /Start match day/ }));
    await screen.findByRole("heading", { name: "Match 1 of 4" });
    expect(screen.getByText(/no substitutions needed/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Kick off/ }));
    expect(await screen.findByText("No subs needed")).toBeInTheDocument();
  });
});
