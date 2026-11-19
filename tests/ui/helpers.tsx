import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect } from "vitest";
import { App } from "../../src/App.tsx";
import { AppStoreProvider } from "../../src/store/AppStore.tsx";
import { createRoster } from "../../src/domain/roster.ts";
import { openRepo, type Repo } from "../../src/store/db.ts";
import { TEST_NAMES } from "../fixtures.ts";

let n = 0;
export const freshDbName = () => `fairplay-test-${++n}-${Math.random().toString(36).slice(2)}`;

/** Render the whole app against its own IndexedDB database. Re-render with the same name to simulate a refresh. */
export async function renderApp(dbName = freshDbName(), { seedTeam = true } = {}) {
  // The app starts with an empty team; most tests want the made-up test team (only if none is saved yet).
  if (seedTeam) await readDb(dbName, async (r) => void ((await r.getRoster()) ?? (await r.saveRoster(createRoster(TEST_NAMES)))));
  const open = () => openRepo(dbName);
  const user = userEvent.setup();
  const view = render(
    <AppStoreProvider openRepo={open}>
      <App />
    </AppStoreProvider>,
  );
  await screen.findByRole("button", { name: "Team" });
  await waitFor(() => expect(screen.queryByLabelText("Loading")).toBeNull());
  return { ...view, user, dbName };
}

/** Read the database directly, independent of the UI. */
export async function readDb<T>(dbName: string, f: (repo: Repo) => Promise<T>): Promise<T> {
  const repo = await openRepo(dbName);
  try {
    return await f(repo);
  } finally {
    repo.close();
  }
}

export const visibleNames = () => screen.getAllByTestId("player-name").map((e) => e.textContent);

