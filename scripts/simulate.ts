// Prints fairness indicators for the PRD §12.4 simulation configurations.
// Run: npm run simulate
import { MINUTE } from "../src/domain/settings.ts";
import { simulateMatchDay } from "../src/domain/simulate.ts";

const configs: { players: number; durations: number[] }[] = [
  { players: 6, durations: [20, 20, 20] },
  { players: 6, durations: [30, 30, 30, 30] },
  { players: 7, durations: [20, 20, 20] },
  { players: 7, durations: [30, 30, 30, 30] },
  { players: 7, durations: [20, 30, 20, 30] },
];

const mmss = (ms: number) => {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

console.table(
  configs.map(({ players, durations }) => {
    const r = simulateMatchDay({ playerCount: players, matchDurationsMs: durations.map((d) => d * MINUTE) });
    return {
      players,
      matches: durations.join("/"),
      average: mmss(r.fairness.averageMs),
      range: mmss(r.fairness.rangeMs),
      MAD: mmss(r.fairness.madMs),
      subs: r.substitutions.length,
      skipped: r.skippedReminders,
    };
  }),
);
