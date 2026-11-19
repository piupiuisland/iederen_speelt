import { Minus, Plus } from "lucide-react";
import { useState } from "react";
import type { Score } from "../../domain/projection.ts";
import { OPPONENT_FALLBACK } from "../format.ts";

type Side = "us" | "them";

/** Our team on the left, the opponent on the right. Tap + for a goal, − to correct. */
export function Scoreboard({
  teamName,
  opponentName,
  score,
  onGoal,
  onRenameOpponent,
}: {
  teamName: string;
  opponentName: string;
  score: Score;
  onGoal?: (side: Side, delta: 1 | -1) => void;
  onRenameOpponent?: (name: string) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const opponent = opponentName || OPPONENT_FALLBACK;

  const side = (s: Side, name: string) => (
    <div className={`flex min-w-0 flex-col gap-2 ${s === "us" ? "items-start" : "items-end"}`}>
      {s === "them" && onRenameOpponent && editing !== null ? (
        <input
          autoFocus
          aria-label="Opponent name"
          value={editing}
          placeholder={OPPONENT_FALLBACK}
          onChange={(e) => setEditing(e.target.value)}
          onBlur={() => {
            onRenameOpponent(editing);
            setEditing(null);
          }}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          className="w-full rounded-md bg-white px-2 py-1 text-right text-sm font-bold text-gray-900 outline-none"
        />
      ) : (
        <button
          type="button"
          disabled={s === "us" || !onRenameOpponent}
          onClick={() => setEditing(opponentName)}
          className={`max-w-full truncate text-sm font-bold uppercase tracking-wide ${
            s === "us" ? "text-green-300" : "text-orange-200 underline decoration-dotted underline-offset-4 disabled:no-underline"
          }`}
          aria-label={s === "them" && onRenameOpponent ? `Opponent: ${opponent}. Tap to rename` : undefined}
        >
          {name}
        </button>
      )}
      {onGoal && (
        <div className={`flex items-center gap-2 ${s === "them" ? "flex-row-reverse" : ""}`}>
          <button
            type="button"
            aria-label={`Goal for ${name}`}
            onClick={() => onGoal(s, 1)}
            className="grid size-12 place-items-center rounded-xl bg-white/15 active:bg-white/30"
          >
            <Plus size={26} strokeWidth={3} />
          </button>
          <button
            type="button"
            aria-label={`Remove goal for ${name}`}
            disabled={score[s] === 0}
            onClick={() => onGoal(s, -1)}
            className="grid size-9 place-items-center rounded-lg bg-white/10 active:bg-white/25 disabled:opacity-30"
          >
            <Minus size={18} strokeWidth={3} />
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-2xl bg-gray-900 p-3 text-white">
      {side("us", teamName)}
      <output aria-label="Score" className="px-1 text-center text-4xl font-black tabular-nums">
        {score.us}
        <span className="mx-1 text-gray-500">:</span>
        {score.them}
      </output>
      {side("them", opponent)}
    </div>
  );
}
