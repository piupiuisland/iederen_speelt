import { Minus, Pencil, Plus } from "lucide-react";
import { useState } from "react";
import type { Score } from "../../domain/projection.ts";
import { OPPONENT_FALLBACK } from "../format.ts";
import { ErrorText } from "./ErrorText.tsx";

/** One match result; tap the pencil to correct the score (also after the match or the day has ended). */
export function ResultRow({
  number,
  teamName,
  opponentName,
  score,
  onSave,
}: {
  number: number;
  teamName: string;
  opponentName: string;
  score: Score;
  /** Returns an error message, or null when saved. */
  onSave: (score: Score) => string | null;
}) {
  const [draft, setDraft] = useState<Score | null>(null);
  const [error, setError] = useState<string | null>(null);
  const opponent = opponentName || OPPONENT_FALLBACK;

  if (!draft)
    return (
      <div className="flex items-center rounded-xl bg-gray-900 py-2.5 pr-1 pl-4 text-white">
        <span className="w-6 text-sm text-gray-400">{number}</span>
        <span className="flex-1 truncate pr-3 text-right text-sm font-semibold">{teamName}</span>
        <span aria-label={`Match ${number} score`} className="text-xl font-black tabular-nums">
          {score.us} : {score.them}
        </span>
        <span className="flex-1 truncate pl-3 text-sm font-semibold">{opponent}</span>
        <button
          type="button"
          aria-label={`Edit score of match ${number}`}
          onClick={() => {
            setError(null);
            setDraft(score);
          }}
          className="grid size-10 place-items-center rounded-lg text-gray-400 active:bg-gray-700"
        >
          <Pencil size={16} />
        </button>
      </div>
    );

  const side = (key: keyof Score, label: string) => (
    <div className="flex flex-1 flex-col items-center gap-1">
      <span className="max-w-full truncate text-sm font-semibold">{label}</span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label={`${label} one goal less`}
          disabled={draft[key] <= 0}
          onClick={() => setDraft({ ...draft, [key]: draft[key] - 1 })}
          className="grid size-11 place-items-center rounded-lg bg-gray-700 active:bg-gray-600 disabled:opacity-30"
        >
          <Minus size={18} />
        </button>
        <output aria-label={`${label} goals`} className="w-9 text-center text-2xl font-black tabular-nums">
          {draft[key]}
        </output>
        <button
          type="button"
          aria-label={`${label} one goal more`}
          disabled={draft[key] >= 99}
          onClick={() => setDraft({ ...draft, [key]: draft[key] + 1 })}
          className="grid size-11 place-items-center rounded-lg bg-gray-700 active:bg-gray-600 disabled:opacity-30"
        >
          <Plus size={18} />
        </button>
      </div>
    </div>
  );

  return (
    <div className="space-y-3 rounded-xl bg-gray-900 p-3 text-white" aria-label={`Edit match ${number}`}>
      <p className="text-xs font-bold tracking-wider text-gray-400 uppercase">Correct score · match {number}</p>
      <div className="flex gap-2">
        {side("us", teamName)}
        {side("them", opponent)}
      </div>
      <ErrorText message={error} />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => {
            const err = onSave(draft);
            setError(err);
            if (!err) setDraft(null);
          }}
          className="h-11 flex-1 rounded-lg bg-green-600 font-bold active:bg-green-700"
        >
          Save
        </button>
        <button type="button" onClick={() => setDraft(null)} className="h-11 rounded-lg bg-gray-700 px-5 font-semibold">
          Cancel
        </button>
      </div>
    </div>
  );
}
