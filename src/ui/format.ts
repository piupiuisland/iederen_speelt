import type { Ms } from "../domain/types.ts";

/** 754000 → "12:34" (minutes may exceed 59). Negative values are shown as their absolute value. */
export function clock(ms: Ms): string {
  const total = Math.floor(Math.abs(ms) / 1000);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/** Compact minutes:seconds for player times: "4:05". */
export function short(ms: Ms): string {
  const total = Math.floor(Math.max(0, ms) / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export const OPPONENT_FALLBACK = "Tegenstander";
