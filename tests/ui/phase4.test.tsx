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

describe("deleting a match day", () => {
  it("removes a test run from history after confirmation, also after reload", async () => {
    const { user, dbName, unmount } = await renderApp();
    for (let i = 0; i < 2; i++) {
      await startDay(user);
      await user.click(screen.getByRole("button", { name: "End match day" }));
      await user.click(screen.getByRole("button", { name: "Yes, end match day" }));
      await user.click(await screen.findByRole("button", { name: "Done" }));
    }
    const rows = () => screen.queryAllByRole("button", { name: /0 matches · 7 players/ });
    expect(rows()).toHaveLength(2);

    await user.click(rows()[0]!);
    await user.click(screen.getByRole("button", { name: /Delete this match day/ }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: /Delete this match day/ }));
    await user.click(screen.getByRole("button", { name: "Yes, delete" }));

    expect(await screen.findByRole("heading", { name: "Who's playing today?" })).toBeInTheDocument();
    expect(rows()).toHaveLength(1);

    unmount();
    await renderApp(dbName);
    expect(rows()).toHaveLength(1);
  });
});

describe("editing a score", () => {
  it("corrects a result between matches and after the day has ended", async () => {
    const { user, dbName, unmount } = await renderApp();
    await startDay(user);
    await playMatch(user, 1);
    await screen.findByRole("heading", { name: "Match 2 of 4" });
    expect(screen.getByLabelText("Match 1 score")).toHaveTextContent("1 : 0");

    await user.click(screen.getByRole("button", { name: "Edit score of match 1" }));
    await user.click(screen.getByRole("button", { name: "Best Vooruit one goal more" }));
    await user.click(screen.getByRole("button", { name: "Tegenstander one goal more" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByLabelText("Match 1 score")).toHaveTextContent("2 : 1");

    await user.click(screen.getByRole("button", { name: "End match day" }));
    await user.click(screen.getByRole("button", { name: "Yes, end match day" }));
    await screen.findByRole("heading", { name: "Match day summary" });
    await user.click(screen.getByRole("button", { name: "Edit score of match 1" }));
    await user.click(screen.getByRole("button", { name: "Best Vooruit one goal less" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByLabelText("Match 1 score")).toHaveTextContent("1 : 1");
    const tiles = screen.getByText("Matches").closest("dl")!;
    expect(within(tiles).getByText("Goals").nextSibling).toHaveTextContent("1:1");

    // Saved: still corrected after a reload.
    await user.click(screen.getByRole("button", { name: "Done" }));
    unmount();
    const again = await renderApp(dbName);
    await again.user.click(screen.getByRole("button", { name: /1 match/ }));
    expect(await screen.findByLabelText("Match 1 score")).toHaveTextContent("1 : 1");
  });
});
