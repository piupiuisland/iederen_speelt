import { ArrowDown, ArrowUp } from "lucide-react";
import type { PlayerStats } from "../../domain/projection.ts";
import { short } from "../format.ts";

const AVAILABILITY_LABEL = {
  available: "",
  resting: "Resting",
  injured: "Injured",
  absent: "Absent",
  left: "Left",
} as const;

export function PlayerCard({
  name,
  stats,
  where,
  selected,
  hint,
  onTap,
}: {
  name: string;
  stats: PlayerStats;
  where: "field" | "bench";
  selected: boolean;
  /** Recommended to come off (out) or go on (in). */
  hint?: "out" | "in";
  onTap: () => void;
}) {
  const unavailable = stats.availability !== "available";
  const tone =
    where === "field"
      ? "border-green-600 bg-green-50"
      : unavailable
        ? "border-gray-200 bg-gray-100 text-gray-500"
        : "border-orange-400 bg-orange-50";

  return (
    <button
      type="button"
      onClick={onTap}
      aria-pressed={selected}
      aria-label={`${name}, ${where === "field" ? "on field" : "on bench"}${unavailable ? `, ${stats.availability}` : ""}`}
      className={`relative flex min-h-[72px] w-full flex-col items-start justify-center rounded-xl border-2 px-3 py-2 text-left ${tone} ${
        selected ? "ring-4 ring-blue-500 ring-offset-1" : ""
      }`}
    >
      <span className="w-full truncate pr-6 text-lg leading-tight font-bold">{name}</span>
      <span className="text-sm font-semibold tabular-nums text-gray-700">
        {short(stats.totalMs)}
        <span className="ml-1.5 font-normal text-gray-500">
          {unavailable
            ? AVAILABILITY_LABEL[stats.availability]
            : where === "field"
              ? `on ${short(stats.stintMs)}`
              : `off ${short(stats.benchStintMs)}`}
        </span>
      </span>
      {hint && (
        <span
          className={`absolute top-1.5 right-1.5 grid size-6 place-items-center rounded-full text-white ${
            hint === "out" ? "bg-orange-500" : "bg-green-600"
          }`}
          aria-hidden
        >
          {hint === "out" ? <ArrowDown size={16} strokeWidth={3} /> : <ArrowUp size={16} strokeWidth={3} />}
        </span>
      )}
    </button>
  );
}
