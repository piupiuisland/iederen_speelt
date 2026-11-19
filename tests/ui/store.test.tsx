/** @vitest-environment jsdom */
// Regression tests for storage issues found in the code review.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { openDB } from "idb";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "../../src/App.tsx";
import { AppStoreProvider } from "../../src/store/AppStore.tsx";
import { openRepo, type Repo } from "../../src/store/db.ts";
import { todayISO } from "../../src/store/prefs.ts";
import { TEST_NAMES } from "../fixtures.ts";
import { freshDbName, readDb, renderApp } from "./helpers.tsx";

afterEach(cleanup);

describe("store robustness", () => {
  it("fills missing fields in saved setup prefs with defaults", async () => {
    const name = freshDbName();
    (await openRepo(name)).close(); // create the schema
    const db = await openDB(name, 1);
    await db.put("kv", { matchCount: 3 }, "setupPrefs"); // an old/partial record
    db.close();

    await renderApp(name);
    expect(screen.getByRole("status", { name: "Matches" })).toHaveTextContent("3");
    expect(screen.getByRole("group", { name: "On the field" })).toContainElement(
      screen.getByRole("button", { name: "4", pressed: true }),
    );
    expect(screen.getByRole("status", { name: "Match length" })).toHaveTextContent("20");
  });

  it("keeps a save failure visible even after a later save succeeds", async () => {
    const name = freshDbName();
    let failNext = true;
    const open = async (): Promise<Repo> => {
      const repo = await openRepo(name);
      return {
        ...repo,
        async saveRoster(r) {
          if (failNext) {
            failNext = false;
            throw new Error("disk full");
          }
          return repo.saveRoster(r);
        },
      };
    };
    // Seeding the roster on first launch uses saveRoster too, so seed it first.
    await readDb(name, async () => {});
    const seeded = await openRepo(name);
    const { createRoster } = await import("../../src/domain/roster.ts");
    await seeded.saveRoster(createRoster(TEST_NAMES));
    seeded.close();

    const user = userEvent.setup();
    render(
      <AppStoreProvider openRepo={open}>
        <App />
      </AppStoreProvider>,
    );
    await user.click(await screen.findByRole("button", { name: "Team" }));
    await user.type(screen.getByRole("textbox", { name: "New player name" }), "Bo{Enter}");
    expect(await screen.findByText(/could not be saved \(disk full\)/)).toBeInTheDocument();

    await user.type(screen.getByRole("textbox", { name: "New player name" }), "Cy{Enter}");
    await waitFor(async () => {
      const roster = await readDb(name, (r) => r.getRoster());
      expect(roster!.players.map((p) => p.name)).toContain("Cy");
    });
    expect(screen.getByText(/could not be saved/)).toBeInTheDocument();
  });

  it("finishes queued writes before closing on unmount", async () => {
    const dbName = freshDbName();
    const open = async (): Promise<Repo> => {
      const repo = await openRepo(dbName);
      return {
        ...repo,
        async saveRoster(r) {
          await new Promise((res) => setTimeout(res, 50)); // slow disk: write still pending at unmount
          return repo.saveRoster(r);
        },
      };
    };
    const user = userEvent.setup();
    const { unmount } = render(
      <AppStoreProvider openRepo={open}>
        <App />
      </AppStoreProvider>,
    );
    await user.click(await screen.findByRole("button", { name: "Team" }));
    await user.type(await screen.findByRole("textbox", { name: "New player name" }), "Bo{Enter}");
    unmount();
    await waitFor(async () => {
      const roster = await readDb(dbName, (r) => r.getRoster());
      expect(roster!.players.map((p) => p.name)).toContain("Bo");
    });
  });

  it("uses today's date when the date field is cleared", async () => {
    const { user, dbName } = await renderApp();
    fireEvent.change(screen.getByLabelText("Match day date"), { target: { value: "" } });
    await user.click(screen.getByRole("button", { name: /Start match day/ }));
    expect(await screen.findByRole("heading", { name: /^Match 1/ })).toBeInTheDocument();
    await waitFor(async () => {
      expect((await readDb(dbName, (r) => r.getActiveMatchDay()))?.date).toBe(todayISO());
    });
  });
});
