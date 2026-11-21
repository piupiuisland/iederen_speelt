import { Flag, Plus, X } from "lucide-react";
import { useState } from "react";
import { addMatch, removeMatch } from "../../domain/commands.ts";
import { MINUTE } from "../../domain/settings.ts";
import { replay } from "../../domain/projection.ts";
import { teamNameOf } from "../../domain/roster.ts";
import { useReadyStore } from "../../store/AppStore.tsx";
import { formatDate } from "../../store/prefs.ts";
import { ErrorText } from "../components/ErrorText.tsx";
import { ResultRow } from "../components/ResultRow.tsx";
import { short } from "../format.ts";
import { LiveMatch } from "../live/LiveMatch.tsx";
import { PreMatch } from "../live/PreMatch.tsx";

/** The Today tab during a match day: the live match, or the break between matches. */
export function MatchDayScreen() {
  const { data } = useReadyStore();
  const state = replay(data.activeDay!, Date.now());
  if (state.current) return <LiveMatch />;
  return <BetweenMatches />;
}

function BetweenMatches() {
  const { data, actions } = useReadyStore();
  const day = data.activeDay!;
  const state = replay(day, Date.now());
  const nameOf = (id: string) => data.roster.players.find((p) => p.id === id)?.name ?? "?";
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const finished = state.matches.filter((m) => m.status === "finished");
  const upcoming = state.matches.filter((m) => m.status === "ready" && m.matchId !== state.next?.matchId);
  const maxTotal = Math.max(1, ...state.players.map((p) => p.totalMs));

  return (
    <section className="space-y-5">
      <p className="text-sm font-medium text-gray-500">
        {formatDate(day.date)} · {day.playerIds.length} players
      </p>

      {finished.length > 0 && (
        <div className="space-y-1.5">
          <h2 className="text-xs font-bold tracking-wider text-gray-500 uppercase">Results</h2>
          {finished.map((m) => (
            <ResultRow
              key={m.matchId}
              number={m.number}
              teamName={teamNameOf(data.roster)}
              opponentName={m.opponentName}
              score={m.score}
              onSave={(score) => actions.editScore(day.id, m.matchId, score)}
            />
          ))}
        </div>
      )}

      {state.next ? (
        <PreMatch key={state.next.matchId} matchId={state.next.matchId} />
      ) : (
        <p className="rounded-2xl bg-green-50 p-4 text-lg font-bold text-green-900">
          {finished.length > 0 ? `All ${finished.length} matches played.` : "No matches planned."}
        </p>
      )}

      <div className="space-y-1.5">
        {upcoming.length > 0 && <h2 className="text-xs font-bold tracking-wider text-gray-500 uppercase">Coming up</h2>}
        {upcoming.map((m) => (
          <div key={m.matchId} className="flex h-12 items-center justify-between rounded-xl bg-gray-50 pl-4">
            <span className="font-semibold">
              Match {m.number} <span className="font-normal text-gray-500">· {m.plannedDurationMs / MINUTE}′</span>
            </span>
            <button
              type="button"
              aria-label={`Remove match ${m.number}`}
              onClick={() => setError(actions.runDay((d, ctx) => removeMatch(d, m.matchId, ctx)))}
              className="grid size-12 place-items-center text-gray-500 active:text-red-600"
            >
              <X size={20} />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setError(actions.runDay((d, ctx) => addMatch(d, ctx)))}
          className="flex h-12 items-center gap-2 rounded-xl px-2 font-bold text-green-800 active:bg-green-50"
        >
          <Plus size={20} /> Add a match
        </button>
      </div>

      {finished.length > 0 && (
        <div className="space-y-1.5">
          <h2 className="text-xs font-bold tracking-wider text-gray-500 uppercase">Playing time today</h2>
          {state.players.map((p) => (
            <div key={p.playerId} className="flex items-center gap-2 text-sm">
              <span className="w-24 truncate font-semibold">{nameOf(p.playerId)}</span>
              <span className="h-3 flex-1 overflow-hidden rounded-full bg-gray-100">
                <span className="block h-full rounded-full bg-green-600" style={{ width: `${(p.totalMs / maxTotal) * 100}%` }} />
              </span>
              <span className="w-12 text-right font-semibold tabular-nums">{short(p.totalMs)}</span>
            </div>
          ))}
        </div>
      )}

      <ErrorText message={error} />
      {confirmEnd ? (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setError(actions.endMatchDay())}
            className="h-14 flex-1 rounded-xl bg-red-600 font-bold text-white active:bg-red-700"
          >
            Yes, end match day
          </button>
          <button type="button" onClick={() => setConfirmEnd(false)} className="h-14 rounded-xl bg-gray-100 px-5 font-semibold">
            Cancel
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirmEnd(true)}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-xl text-sm font-bold text-red-700 active:bg-red-50"
        >
          <Flag size={18} /> End match day
        </button>
      )}
    </section>
  );
}
