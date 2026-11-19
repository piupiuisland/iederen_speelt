/** @vitest-environment jsdom */
import { cleanup, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { renderApp } from "./helpers.tsx";

afterEach(cleanup);

const startDay = async (user: Awaited<ReturnType<typeof renderApp>>["user"]) => {
  await user.click(screen.getByRole("button", { name: /Start match day/ }));
  await screen.findByRole("heading", { name: "Match 1 of 4" });
};

const playMatch = async (user: Awaited<ReturnType<typeof renderApp>>["user"], goals = 0) => {
  await user.click(screen.getByRole("button", { name: /Kick off/ }));
  await screen.findByLabelText("Match clock");
  for (let i = 0; i < goals; i++) await user.click(screen.getByRole("button", { name: "Goal for Best Vooruit" }));
  await user.click(screen.getByRole("button", { name: /Finish/ }));
  await user.click(screen.getByRole("button", { name: "Yes, finish" }));
};

describe("upcoming matches", () => {
  it("removes, skips and adds matches", async () => {
    const { user } = await renderApp();
    await startDay(user);
    expect(screen.getByText("Coming up")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remove match 4" }));
    expect(screen.getByRole("heading", { name: "Match 1 of 3" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Skip this match" }));
    expect(screen.getByRole("heading", { name: "Match 1 of 2" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add a match" }));
    expect(screen.getByRole("heading", { name: "Match 1 of 3" })).toBeInTheDocument();
  });
});

describe("summary and history", () => {
  it("shows the summary after ending the day, and keeps it in history", async () => {
    const { user, dbName, unmount } = await renderApp();
    await startDay(user);
    await playMatch(user, 2);
    await screen.findByRole("heading", { name: "Match 2 of 4" });
    await playMatch(user, 1);
    await screen.findByRole("heading", { name: "Match 3 of 4" });

    await user.click(screen.getByRole("button", { name: "End match day" }));
    await user.click(screen.getByRole("button", { name: "Yes, end match day" }));
    expect(await screen.findByRole("heading", { name: "Match day summary" })).toBeInTheDocument();
    const tiles = screen.getByText("Matches").closest("dl")!;
    expect(within(tiles).getByText("Matches").nextSibling).toHaveTextContent("2");
    expect(within(tiles).getByText("Goals").nextSibling).toHaveTextContent("3:0");
    const chart = screen.getByRole("figure", { name: "Playing time per player" });
    expect(within(chart).getAllByRole("row")).toHaveLength(8); // header + 7 children
    expect(within(chart).getByRole("rowheader", { name: "Noah" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Done" }));
    const earlier = await screen.findByText("Earlier match days");
    expect(earlier).toBeInTheDocument();

    // History survives a reload and reopens the summary.
    unmount();
    const again = await renderApp(dbName);
    await again.user.click(screen.getByRole("button", { name: /2 matches · 7 players/ }));
    expect(await screen.findByRole("heading", { name: "Match day summary" })).toBeInTheDocument();
  });

  it("rotates who starts the first match on the next match day", async () => {
    const { user } = await renderApp();
    await startDay(user);
    await user.click(screen.getByRole("button", { name: "End match day" }));
    await user.click(screen.getByRole("button", { name: "Yes, end match day" }));
    await user.click(await screen.findByRole("button", { name: "Done" }));
    await startDay(user);
    const starters = screen
      .getAllByRole("button", { pressed: true })
      .filter((b) => b.getAttribute("aria-label")?.startsWith("Start "))
      .map((b) => b.getAttribute("aria-label")!.slice(6));
    expect(starters.sort()).toEqual(["Ava", "Finn", "Lars", "Noah"]);
  });
});
