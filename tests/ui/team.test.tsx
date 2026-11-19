/** @vitest-environment jsdom */
import { cleanup, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { activePlayers } from "../../src/domain/roster.ts";
import { readDb, renderApp, visibleNames } from "./helpers.tsx";

afterEach(cleanup);

const SEEDED = ["Ava", "Ben", "Daan", "Emma", "Finn", "Lars", "Noah"];

const savedNames = (dbName: string) =>
  readDb(dbName, async (r) => activePlayers((await r.getRoster())!).map((p) => p.name));

describe("Team screen", () => {
  it("seeds the team alphabetically on first launch and saves it", async () => {
    const { user, dbName } = await renderApp();
    await user.click(screen.getByRole("button", { name: "Team" }));
    expect(visibleNames()).toEqual(SEEDED);
    expect(await savedNames(dbName)).toEqual(SEEDED);
  });

  it("adds a player in alphabetical position and persists it", async () => {
    const { user, dbName } = await renderApp();
    await user.click(screen.getByRole("button", { name: "Team" }));
    await user.type(screen.getByRole("textbox", { name: "New player name" }), "Bo");
    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(visibleNames().slice(0, 3)).toEqual(["Ava", "Ben", "Bo"]);
    expect(screen.getByRole("textbox", { name: "New player name" })).toHaveValue("");
    await waitFor(async () => expect(await savedNames(dbName)).toContain("Bo"));
  });

  it("shows an error for a duplicate name", async () => {
    const { user } = await renderApp();
    await user.click(screen.getByRole("button", { name: "Team" }));
    await user.type(screen.getByRole("textbox", { name: "New player name" }), "daan");
    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(screen.getByRole("alert")).toHaveTextContent("There is already a player called daan.");
    expect(visibleNames()).toEqual(SEEDED);
  });

  it("renames a player and re-sorts", async () => {
    const { user, dbName } = await renderApp();
    await user.click(screen.getByRole("button", { name: "Team" }));
    await user.click(screen.getByRole("button", { name: "Rename Noah" }));
    const input = screen.getByRole("textbox", { name: "Name for Noah" });
    await user.clear(input);
    await user.type(input, "Aaa");
    await user.click(screen.getByRole("button", { name: "Save name" }));
    expect(visibleNames()[0]).toBe("Aaa");
    await waitFor(async () => expect((await savedNames(dbName))[0]).toBe("Aaa"));
  });

  it("removes a player only after confirmation", async () => {
    const { user, dbName } = await renderApp();
    await user.click(screen.getByRole("button", { name: "Team" }));
    await user.click(screen.getByRole("button", { name: "Remove Emma" }));
    await user.click(screen.getByRole("button", { name: "Keep" }));
    expect(visibleNames()).toContain("Emma");
    await user.click(screen.getByRole("button", { name: "Remove Emma" }));
    await user.click(screen.getByRole("button", { name: "Yes, remove Emma" }));
    expect(visibleNames()).not.toContain("Emma");
    await waitFor(async () => expect(await savedNames(dbName)).not.toContain("Emma"));
  });
});

describe("first launch", () => {
  it("starts with the team, sorted alphabetically", async () => {
    const { user } = await renderApp(undefined, { seedTeam: false });
    expect(screen.getByText("7 of 7 playing")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Team" }));
    expect(visibleNames()).toEqual(["Aanurakti", "Arvid", "Jonah", "Nina", "Rico", "Ronnie", "Sep"]);
  });
});
