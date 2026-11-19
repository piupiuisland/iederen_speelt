import { ROTATION_TEMPLATES } from "./rotationTemplates.data.ts";

/** A recommended substitution rhythm, found by simulation (see scripts/generate-rotation-templates.ts). */
export interface RotationTemplate {
  present: number;
  onField: number;
  matchMin: number;
  /** Swap every N minutes… */
  intervalMin: number;
  /** …this many children at a time. */
  swapsPerSub: number;
  /** Expected max − min playing time over a 3-match day, in minutes. */
  differenceMin: number;
  swapMomentsPerMatch: number;
}

/**
 * The built-in template for this situation, or null when nobody needs to come
 * off (as many children as places). Unknown combinations use the closest
 * simulated one: same bench size first, then nearest field size and match length.
 */
export function rotationTemplate(present: number, onField: number, matchMin: number): RotationTemplate | null {
  const bench = present - onField;
  if (bench < 1 || onField < 1) return null;
  const exact = ROTATION_TEMPLATES.find((t) => t.present === present && t.onField === onField && t.matchMin === matchMin);
  if (exact) return exact;

  const distance = (t: RotationTemplate) =>
    Math.abs(t.present - t.onField - bench) * 100 + Math.abs(t.onField - onField) * 10 + Math.abs(t.matchMin - matchMin) / 10;
  const closest = [...ROTATION_TEMPLATES].sort((a, b) => distance(a) - distance(b))[0];
  if (!closest) return null;
  return {
    ...closest,
    present,
    onField,
    matchMin,
    swapsPerSub: Math.min(closest.swapsPerSub, bench),
  };
}
