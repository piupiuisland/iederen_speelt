import type { CreateMatchDayInput } from "../domain/commands.ts";
import { DEFAULT_MATCH_COUNT, DEFAULT_SETTINGS, MINUTE } from "../domain/settings.ts";

/** The last-used match-day setup, remembered so next week's setup is one tap. */
export interface SetupPrefs {
  playersOnField: number;
  matchCount: number;
  matchDurationMin: number;
  reminderIntervalMin: number;
}

export const DEFAULT_PREFS: SetupPrefs = {
  playersOnField: DEFAULT_SETTINGS.playersOnField,
  matchCount: DEFAULT_MATCH_COUNT,
  matchDurationMin: DEFAULT_SETTINGS.defaultMatchDurationMs / MINUTE,
  reminderIntervalMin: DEFAULT_SETTINGS.reminderIntervalMs / MINUTE,
};

export function prefsToMatchDayInput(p: SetupPrefs): Pick<CreateMatchDayInput, "settings" | "matchDurationsMs"> {
  return {
    settings: {
      playersOnField: p.playersOnField,
      defaultMatchDurationMs: p.matchDurationMin * MINUTE,
      reminderIntervalMs: p.reminderIntervalMin * MINUTE,
    },
    matchDurationsMs: Array.from({ length: p.matchCount }, () => p.matchDurationMin * MINUTE),
  };
}

/** Today's date in the device's time zone, as YYYY-MM-DD. */
export function todayISO(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y!, m! - 1, d!).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}
