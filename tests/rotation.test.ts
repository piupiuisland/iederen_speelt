import { describe, expect, it } from "vitest";
import { setMatchRotation, startMatch } from "../src/domain/commands.ts";
import { recommend } from "../src/domain/engine/recommend.ts";
import { rotationTemplate } from "../src/domain/engine/rotation.ts";
import { ROTATION_TEMPLATES } from "../src/domain/engine/rotationTemplates.data.ts";
import { replay } from "../src/domain/projection.ts";
import { MINUTE } from "../src/domain/settings.ts";
import { simulateMatchDay } from "../src/domain/simulate.ts";
import { at, c, min, newDay } from "./fixtures.ts";

describe("rotation templates", () => {
  it("has a template for every common situation", () => {
    for (const present of [5, 6, 7])
      for (const onField of [4, 5])
        for (const matchMin of [20, 30, 40]) {
          const t = rotationTemplate(present, onField, matchMin);
          if (present === onField) expect(t).toBeNull();
          else {
            expect(t, `${present}/${onField}/${matchMin}`).not.toBeNull();
            expect(t!.intervalMin).toBeGreaterThanOrEqual(5); // not more often than every 5 minutes
            expect(t!.intervalMin).toBeLessThanOrEqual(8); // nobody waits longer than 8 minutes
            expect(t!.swapsPerSub).toBeLessThanOrEqual(present - onField);
          }
        }
  });

  it("knows the cases discussed: 7 children, 5 on the field, 20 min → every 8 min, 2 at a time", () => {
    expect(rotationTemplate(7, 5, 20)).toMatchObject({ intervalMin: 8, swapsPerSub: 2 });
    expect(rotationTemplate(6, 4, 20)).toMatchObject({ intervalMin: 7, swapsPerSub: 2 });
    expect(rotationTemplate(5, 4, 20)).toMatchObject({ intervalMin: 8, swapsPerSub: 1 });
    expect(rotationTemplate(7, 5, 15)).toMatchObject({ intervalMin: 5, swapsPerSub: 2 });
  });

  it("falls back to the closest template for unusual situations", () => {
    const t = rotationTemplate(7, 5, 25)!;
    expect(t).toMatchObject({ present: 7, onField: 5, matchMin: 25 });
    expect(rotationTemplate(10, 4, 20)!.swapsPerSub).toBeLessThanOrEqual(6);
    expect(rotationTemplate(4, 4, 20)).toBeNull();
  });

  it("stays in sync with the simulation (run `npm run templates` after changing the engine)", () => {
    for (const t of ROTATION_TEMPLATES.filter((x) => x.matchMin === 20 && x.present <= 7)) {
      const r = simulateMatchDay({
        playerCount: t.present,
        matchDurationsMs: [1, 2, 3].map(() => t.matchMin * MINUTE),
        settings: { playersOnField: t.onField, reminderIntervalMs: t.intervalMin * MINUTE, maxSubsPerRecommendation: t.swapsPerSub },
      });
      expect(Math.round(r.fairness.rangeMs / MINUTE), `${t.present}/${t.onField}`).toBe(t.differenceMin);
    }
  });
});

describe("per-match rotation", () => {
  it("uses the match's own interval and swap count", () => {
    const base = newDay(7);
    const id = base.matches[0]!.id;
    let day = setMatchRotation(base, id, { reminderIntervalMs: min(8), maxSubsPerReminder: 3 }, c(0));
    day = startMatch(day, id, c(0), ["P1", "P2", "P3", "P4"]);
    expect(replay(day, at(5)).current!.reminderDue).toBe(false); // default would be due at 4
    expect(replay(day, at(8)).current!.reminderDue).toBe(true);
    expect(recommend(replay(day, at(8)), day.settings)).toHaveLength(3);
    expect(() => setMatchRotation(day, id, { reminderIntervalMs: min(6), maxSubsPerReminder: 2 }, c(9))).toThrow(/already started/);
    // The next match still uses the defaults.
    expect(replay(day, at(9)).matches[1]!.reminderIntervalMs).toBe(min(4));
  });

  it("rejects nonsense", () => {
    const day = newDay(7);
    const id = day.matches[0]!.id;
    expect(() => setMatchRotation(day, id, { reminderIntervalMs: 0, maxSubsPerReminder: 2 }, c(0))).toThrow();
    expect(() => setMatchRotation(day, id, { reminderIntervalMs: min(5), maxSubsPerReminder: 0 }, c(0))).toThrow();
  });
});
