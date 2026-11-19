import { openDB, type DBSchema } from "idb";
import type { Roster } from "../domain/roster.ts";
import type { MatchDay } from "../domain/types.ts";
import type { SetupPrefs } from "./prefs.ts";

/** Typed key/value entries in the `kv` store. */
interface KV {
  roster: Roster;
  setupPrefs: SetupPrefs;
  activeMatchDayId: string;
}

interface FairPlaySchema extends DBSchema {
  kv: { key: keyof KV; value: KV[keyof KV] };
  matchDays: { key: string; value: MatchDay };
}

export interface Repo {
  getRoster(): Promise<Roster | undefined>;
  saveRoster(roster: Roster): Promise<void>;
  getSetupPrefs(): Promise<SetupPrefs | undefined>;
  getActiveMatchDay(): Promise<MatchDay | null>;
  listMatchDays(): Promise<MatchDay[]>;
  saveMatchDay(day: MatchDay): Promise<void>;
  /** Atomically: store the new day, mark it active, remember the setup. */
  startMatchDay(day: MatchDay, prefs: SetupPrefs): Promise<void>;
  /** Atomically: store the finished day and clear the active pointer. */
  endMatchDay(day: MatchDay): Promise<void>;
  close(): void;
}

export const DB_NAME = "fairplay";

export async function openRepo(name: string = DB_NAME): Promise<Repo> {
  const db = await openDB<FairPlaySchema>(name, 1, {
    upgrade(db) {
      db.createObjectStore("kv");
      db.createObjectStore("matchDays", { keyPath: "id" });
    },
  });
  const get = async <K extends keyof KV>(key: K) => (await db.get("kv", key)) as KV[K] | undefined;

  return {
    getRoster: () => get("roster"),
    async saveRoster(roster) {
      await db.put("kv", roster, "roster");
    },
    getSetupPrefs: () => get("setupPrefs"),
    async getActiveMatchDay() {
      const id = await get("activeMatchDayId");
      return id ? ((await db.get("matchDays", id)) ?? null) : null;
    },
    listMatchDays: () => db.getAll("matchDays"),
    async saveMatchDay(day) {
      await db.put("matchDays", day);
    },
    async startMatchDay(day, prefs) {
      const tx = db.transaction(["kv", "matchDays"], "readwrite");
      await Promise.all([
        tx.objectStore("matchDays").put(day),
        tx.objectStore("kv").put(day.id, "activeMatchDayId"),
        tx.objectStore("kv").put(prefs, "setupPrefs"),
        tx.done,
      ]);
    },
    async endMatchDay(day) {
      const tx = db.transaction(["kv", "matchDays"], "readwrite");
      await Promise.all([tx.objectStore("matchDays").put(day), tx.objectStore("kv").delete("activeMatchDayId"), tx.done]);
    },
    close: () => db.close(),
  };
}

/** Ask the browser not to evict our data under storage pressure (best effort). */
export function requestPersistentStorage(): void {
  navigator.storage?.persist?.().catch(() => {});
}
