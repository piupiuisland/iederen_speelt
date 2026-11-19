import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  correctGap,
  detectInterruption,
  DomainError,
  finishMatchDay,
  heartbeat,
  type Ctx,
  type Interruption,
} from "../domain/commands.ts";
import {
  activePlayers,
  addPlayer,
  createMatchDayFromAttendance,
  createRoster,
  removePlayer,
  renamePlayer,
  setTeamName,
  type Roster,
} from "../domain/roster.ts";
import type { MatchDay, PlayerId } from "../domain/types.ts";
import { openRepo as openDefaultRepo, requestPersistentStorage, type Repo } from "./db.ts";
import { DEFAULT_PREFS, prefsToMatchDayInput, type SetupPrefs } from "./prefs.ts";

export interface AppData {
  roster: Roster;
  activeDay: MatchDay | null;
  prefs: SetupPrefs;
  /** The app was closed/frozen while a match was running (not persisted). */
  interruption: Interruption | null;
  /** Finished match days, newest first. */
  history: MatchDay[];
  /** The match day whose summary is open (just finished, or picked from history). Not persisted. */
  summaryDayId: string | null;
}

/** Actions apply immediately in memory and persist in order in the background. Return an error message or null. */
export interface AppActions {
  addPlayer(name: string): string | null;
  renamePlayer(id: PlayerId, name: string): string | null;
  removePlayer(id: PlayerId): void;
  setTeamName(name: string): string | null;
  /** Run a domain command against the active match day and persist the result. */
  runDay(command: (day: MatchDay, ctx: Ctx) => MatchDay): string | null;
  /** Record that the app is alive during a running match. */
  heartbeat(): void;
  /** After returning to the app: was it frozen long enough to ask about the gap? */
  checkInterruption(): void;
  dismissInterruption(): void;
  openSummary(dayId: string): void;
  closeSummary(): void;
  /** Permanently remove a finished match day from history (e.g. a test run). */
  deleteMatchDay(dayId: string): void;
  /** Don't count the interruption as playing time. */
  excludeInterruption(): string | null;
  startMatchDay(input: { absentIds: ReadonlySet<PlayerId>; prefs: SetupPrefs; date: string }): string | null;
  endMatchDay(): string | null;
  /** Resolves once every change so far is written. */
  whenSaved(): Promise<void>;
}

export type AppStore =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: AppData; actions: AppActions; saveError: string | null };

const StoreContext = createContext<AppStore>({ status: "loading" });

const defaultOpen = () => openDefaultRepo();

async function loadAppData(repo: Repo): Promise<AppData> {
  let roster = await repo.getRoster();
  if (!roster) {
    roster = createRoster();
    await repo.saveRoster(roster);
  }
  const [prefs, activeDay, all] = await Promise.all([repo.getSetupPrefs(), repo.getActiveMatchDay(), repo.listMatchDays()]);
  const history = all
    .filter((d) => d.finishedAt !== undefined)
    .sort((a, b) => (b.finishedAt ?? 0) - (a.finishedAt ?? 0));
  // Merge so a record saved by an older version (missing newer fields) still works.
  return {
    roster,
    prefs: { ...DEFAULT_PREFS, ...prefs },
    activeDay,
    interruption: activeDay ? detectInterruption(activeDay, Date.now()) : null,
    history,
    summaryDayId: null,
  };
}

function attempt<T>(f: () => T): { ok: true; value: T } | { ok: false; error: string } {
  try {
    return { ok: true, value: f() };
  } catch (e) {
    if (e instanceof DomainError) return { ok: false, error: e.message };
    throw e;
  }
}

export function AppStoreProvider({
  children,
  openRepo = defaultOpen,
}: {
  children: ReactNode;
  /** Must be referentially stable. Tests pass one with a unique database name. */
  openRepo?: () => Promise<Repo>;
}) {
  const [loaded, setLoaded] = useState<{ status: "loading" } | { status: "error"; message: string } | { status: "ready"; data: AppData }>(
    { status: "loading" },
  );
  const [saveError, setSaveError] = useState<string | null>(null);
  const repoRef = useRef<Repo | null>(null);
  const dataRef = useRef<AppData | null>(null);
  const queueRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const repo = await openRepo();
        if (cancelled) return repo.close();
        const data = await loadAppData(repo);
        if (cancelled) return repo.close();
        repoRef.current = repo;
        dataRef.current = data;
        setLoaded({ status: "ready", data });
      } catch (e) {
        if (!cancelled) setLoaded({ status: "error", message: e instanceof Error ? e.message : String(e) });
      }
    })();
    requestPersistentStorage();
    return () => {
      cancelled = true;
      // Let queued writes finish before closing, or they would be lost.
      const repo = repoRef.current;
      void queueRef.current.finally(() => {
        repo?.close();
        if (repoRef.current === repo) repoRef.current = null;
      });
    };
  }, [openRepo]);

  const actions = useMemo<AppActions>(() => {
    const commit = (next: AppData, persist: (repo: Repo) => Promise<void>) => {
      dataRef.current = next;
      setLoaded({ status: "ready", data: next });
      queueRef.current = queueRef.current
        .then(() => {
          const repo = repoRef.current;
          if (!repo) throw new Error("storage is closed");
          return persist(repo);
        })
        // A failure stays visible: a later successful write does not repair the one that was lost.
        .catch((e: unknown) =>
          setSaveError(
            `Some changes could not be saved (${e instanceof Error ? e.message : String(e)}). They will be lost if the app closes.`,
          ),
        );
    };
    const current = () => {
      if (!dataRef.current) throw new Error("App data not loaded");
      return dataRef.current;
    };
    const updateRoster = (f: (r: Roster) => Roster): string | null => {
      const d = current();
      const r = attempt(() => f(d.roster));
      if (!r.ok) return r.error;
      commit({ ...d, roster: r.value }, (repo) => repo.saveRoster(r.value));
      return null;
    };

    const show = (next: AppData) => {
      dataRef.current = next;
      setLoaded({ status: "ready", data: next });
    };

    return {
      setTeamName: (name) => updateRoster((r) => setTeamName(r, name)),

      runDay(command) {
        const d = current();
        if (!d.activeDay) return "No match day in progress.";
        const r = attempt(() => command(d.activeDay!, { now: Date.now() }));
        if (!r.ok) return r.error;
        commit({ ...d, activeDay: r.value }, (repo) => repo.saveMatchDay(r.value));
        return null;
      },

      heartbeat() {
        const d = current();
        if (!d.activeDay) return;
        const next = heartbeat(d.activeDay, Date.now());
        commit({ ...d, activeDay: next }, (repo) => repo.saveMatchDay(next));
      },

      checkInterruption() {
        const d = current();
        if (!d.activeDay || d.interruption) return;
        const interruption = detectInterruption(d.activeDay, Date.now());
        if (interruption) show({ ...d, interruption });
      },

      dismissInterruption() {
        show({ ...current(), interruption: null });
      },

      openSummary(dayId) {
        show({ ...current(), summaryDayId: dayId });
      },

      closeSummary() {
        show({ ...current(), summaryDayId: null });
      },

      deleteMatchDay(dayId) {
        const d = current();
        if (d.activeDay?.id === dayId) return; // only finished days live in history
        commit(
          {
            ...d,
            history: d.history.filter((h) => h.id !== dayId),
            summaryDayId: d.summaryDayId === dayId ? null : d.summaryDayId,
          },
          (repo) => repo.deleteMatchDay(dayId),
        );
      },

      excludeInterruption() {
        const d = current();
        const gap = d.interruption;
        if (!d.activeDay || !gap) return null;
        const r = attempt(() => correctGap(d.activeDay!, gap.fromT, gap.toT, { now: Date.now() }));
        if (!r.ok) return r.error;
        commit({ ...d, activeDay: r.value, interruption: null }, (repo) => repo.saveMatchDay(r.value));
        return null;
      },

      addPlayer: (name) => updateRoster((r) => addPlayer(r, name)),
      renamePlayer: (id, name) => updateRoster((r) => renamePlayer(r, id, name)),
      removePlayer: (id) => void updateRoster((r) => removePlayer(r, id)),

      startMatchDay({ absentIds, prefs, date }) {
        const d = current();
        if (d.activeDay) return "A match day is already in progress.";
        const attendance = Object.fromEntries(activePlayers(d.roster).map((p) => [p.id, !absentIds.has(p.id)]));
        const r = attempt(() =>
          createMatchDayFromAttendance(d.roster, attendance, { date, ...prefsToMatchDayInput(prefs) }, { now: Date.now() }),
        );
        if (!r.ok) return r.error;
        commit({ ...d, activeDay: r.value, prefs, summaryDayId: null }, (repo) => repo.startMatchDay(r.value, prefs));
        return null;
      },

      endMatchDay() {
        const d = current();
        if (!d.activeDay) return null;
        const r = attempt(() => finishMatchDay(d.activeDay!, { now: Date.now() }));
        if (!r.ok) return r.error;
        // Show the day's summary straight away.
        commit(
          { ...d, activeDay: null, interruption: null, history: [r.value, ...d.history], summaryDayId: r.value.id },
          (repo) => repo.endMatchDay(r.value),
        );
        return null;
      },

      whenSaved: () => queueRef.current,
    };
  }, []);

  const value = useMemo<AppStore>(
    () => (loaded.status === "ready" ? { ...loaded, actions, saveError } : loaded),
    [loaded, actions, saveError],
  );
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useAppStore(): AppStore {
  return useContext(StoreContext);
}

/** For screens rendered only once the store is ready. */
export function useReadyStore() {
  const store = useAppStore();
  if (store.status !== "ready") throw new Error("useReadyStore used before the store is ready");
  return store;
}
