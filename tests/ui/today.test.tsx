/** @vitest-environment jsdom */
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MINUTE } from "../../src/domain/settings.ts";
import { readDb, renderApp } from "./helpers.tsx";

afterEach(cleanup);

const attendanceButton = (name: string) => screen.getByRole("button", { name: new RegExp(`^${name}:`) });

describe("Today: attendance and match-day setup", () => {
  it("lists everyone alphabetically, all playing by default", async () => {
    await renderApp();
    expect(screen.getByText("7 of 7 playing")).toBeInTheDocument();
    const pressed = screen.getAllByRole("button", { pressed: true }).map((b) => b.textContent);
    expect(pressed.slice(0, 7)).toEqual([
      "AvaPlaying",
      "BenPlaying",
      "DaanPlaying",
      "EmmaPlaying",
      "FinnPlaying",
      "LarsPlaying",
      "NoahPlaying",
    ]);
  });

  it("marks a child absent and back", async () => {
    const { user } = await renderApp();
    await user.click(attendanceButton("Finn"));
    expect(attendanceButton("Finn")).toHaveAttribute("aria-pressed", "false");
    expect(attendanceButton("Finn")).toHaveTextContent("Absent");
    expect(screen.getByText("6 of 7 playing")).toBeInTheDocument();
    await user.click(attendanceButton("Finn"));
    expect(screen.getByText("7 of 7 playing")).toBeInTheDocument();
  });

  it("keeps attendance when switching to the Team tab and back", async () => {
    const { user } = await renderApp();
    await user.click(attendanceButton("Finn"));
    await user.click(screen.getByRole("button", { name: "Team" }));
    expect(screen.queryByText(/of 7 playing/)).not.toBeVisible();
    await user.click(screen.getByRole("button", { name: "Today" }));
    expect(screen.getByText("6 of 7 playing")).toBeVisible();
    expect(attendanceButton("Finn")).toHaveAttribute("aria-pressed", "false");
  });

  it("warns when fewer children than field places are playing", async () => {
    const { user } = await renderApp();
    for (const n of ["Ava", "Ben", "Daan", "Emma"]) await user.click(attendanceButton(n));
    expect(screen.getByText(/Only 3 playing/)).toBeInTheDocument();
  });

  it("starts a match day with only the children who are here, survives a refresh, and ends", async () => {
    const first = await renderApp();
    const { user, dbName } = first;
    await user.click(attendanceButton("Finn"));
    await user.click(screen.getByRole("button", { name: "Decrease Matches" }));
    await user.click(screen.getByRole("button", { name: "30′" }));
    await user.click(screen.getByRole("button", { name: /Start match day/ }));

    expect(await screen.findByRole("heading", { name: "Match 1 of 3" })).toBeInTheDocument();
    expect(screen.getByText(/6 players/)).toBeInTheDocument();
    // Only today's children can be picked for the lineup.
    expect(screen.queryByRole("button", { name: "Start Finn" })).toBeNull();
    expect(screen.getByRole("button", { name: "Start Noah" })).toBeInTheDocument();

    const saved = await waitFor(async () => {
      const day = await readDb(dbName, (r) => r.getActiveMatchDay());
      expect(day).not.toBeNull();
      return day!;
    });
    expect(saved.playerIds).toHaveLength(6);
    expect(saved.matches.map((m) => m.plannedDurationMs)).toEqual([30 * MINUTE, 30 * MINUTE, 30 * MINUTE]);

    // Refresh: a new app instance on the same database reopens the match day.
    first.unmount();
    const second = await renderApp(dbName);
    expect(await screen.findByRole("heading", { name: "Match 1 of 3" })).toBeInTheDocument();

    await second.user.click(screen.getByRole("button", { name: "End match day" }));
    await second.user.click(screen.getByRole("button", { name: "Yes, end match day" }));
    expect(await screen.findByRole("heading", { name: "Match day summary" })).toBeInTheDocument();
    await second.user.click(screen.getByRole("button", { name: "Done" }));
    expect(await screen.findByRole("heading", { name: "Who's playing today?" })).toBeInTheDocument();

    // Last week's setup is remembered; attendance resets to everyone.
    expect(screen.getByRole("status", { name: "Matches" })).toHaveTextContent("3");
    expect(screen.getByRole("status", { name: "Match length" })).toHaveTextContent("30");
    expect(screen.getByText("7 of 7 playing")).toBeInTheDocument();

    await waitFor(async () => {
      expect(await readDb(dbName, (r) => r.getActiveMatchDay())).toBeNull();
      const days = await readDb(dbName, (r) => r.listMatchDays());
      expect(days).toHaveLength(1);
      expect(days[0]!.finishedAt).toBeTypeOf("number");
    });
  });

  it("can't start with nobody playing", async () => {
    const { user } = await renderApp();
    for (const b of screen.getAllByRole("button", { pressed: true })) await user.click(b);
    expect(within(document.body).getByRole("button", { name: /Start match day/ })).toBeDisabled();
  });
});
