import { describe, expect, it } from "vitest";
import { MINUTE } from "../src/domain/settings.ts";
import { simulateMatchDay } from "../src/domain/simulate.ts";

// PRD §12.4. Fairness is reported (npm run simulate), not asserted: it is an
// indicator, not a requirement. These tests check correctness invariants only.
const CONFIGS = [
  { players: 6, durations: [20, 20, 20] },
  { players: 6, durations: [30, 30, 30, 30] },
  { players: 7, durations: [20, 20, 20] },
  { players: 7, durations: [30, 30, 30, 30] },
  { players: 7, durations: [20, 30, 20, 30] },
];

describe.each(CONFIGS)("simulated match day: $players players, $durations min", ({ players, durations }) => {
  const K = 4;
  const violations: string[] = [];
  const result = simulateMatchDay({
    playerCount: players,
    matchDurationsMs: durations.map((d) => d * MINUTE),
    onTick: (s) => {
      if (s.current!.onFieldIds.length !== K) violations.push(`on-field count ${s.current!.onFieldIds.length}`);
      const sum = s.players.reduce((a, p) => a + p.totalMs, 0);
      if (sum !== K * s.totalActiveMs) violations.push(`player-time ${sum} != ${K} × ${s.totalActiveMs}`);
      if (s.players.some((p) => p.totalMs < 0 || p.stintMs < 0)) violations.push("negative time");
    },
  });

  it("keeps invariants at every second", () => {
    expect(violations.slice(0, 5)).toEqual([]);
  });

  it("plays every match to its planned duration", () => {
    const totalMin = durations.reduce((a, b) => a + b, 0);
    expect(result.state.completedMatches).toBe(durations.length);
    expect(result.state.totalActiveMs).toBe(totalMin * MINUTE);
    expect(result.fairness.averageMs).toBeCloseTo((K * totalMin * MINUTE) / players, 6);
  });

  it("never takes a player off before the minimum stint for rotation", () => {
    const early = result.substitutions.filter((s) => s.reason === "rotation" && s.outStintMs < 3 * MINUTE);
    expect(early).toEqual([]);
  });

  it("gives every player playing time", () => {
    expect(result.state.players.every((p) => p.totalMs > 0)).toBe(true);
  });
});
