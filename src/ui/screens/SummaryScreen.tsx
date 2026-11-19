import { Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { summarizeMatchDay } from "../../domain/engine/summary.ts";
import { teamNameOf } from "../../domain/roster.ts";
import { MINUTE } from "../../domain/settings.ts";
import { useReadyStore } from "../../store/AppStore.tsx";
import { formatDate } from "../../store/prefs.ts";
import { OPPONENT_FALLBACK, short } from "../format.ts";

const signed = (ms: number) => `${ms >= 0 ? "+" : "−"}${short(Math.abs(ms))}`;

/** End-of-day overview: results, and playing time per child against the average. */
export function SummaryScreen({ dayId }: { dayId: string }) {
  const { data, actions } = useReadyStore();
  const day = data.history.find((d) => d.id === dayId);
  const summary = useMemo(() => (day ? summarizeMatchDay(day) : null), [day]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  if (!day || !summary) return null;

  const nameOf = (id: string) => data.roster.players.find((p) => p.id === id)?.name ?? "?";
  const { fairness } = summary;
  const scaleMax = Math.max(1, fairness.averageMs, ...summary.players.map((p) => p.totalMs));
  const avgPct = (fairness.averageMs / scaleMax) * 100;
  const counted = summary.players.filter((p) => p.deltaFromAverageMs !== null);
  const most = counted.reduce((a, b) => (b.totalMs > a.totalMs ? b : a), counted[0]!);
  const least = counted.reduce((a, b) => (b.totalMs < a.totalMs ? b : a), counted[0]!);

  return (
    <section className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Match day summary</h1>
        <p className="text-base font-medium text-gray-600">
          {formatDate(day.date)} · {day.playerIds.length} players
        </p>
      </div>

      <dl className="grid grid-cols-4 gap-2 text-center">
        {[
          ["Matches", String(summary.matchesPlayed)],
          ["Played", `${Math.round(summary.totalActiveMs / MINUTE)}′`],
          ["Goals", `${summary.goals.us}:${summary.goals.them}`],
          ["Subs", String(summary.substitutions)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl bg-gray-50 px-1 py-2">
            <dt className="text-xs font-semibold text-gray-500">{label}</dt>
            <dd className="text-2xl font-black tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>

      {summary.results.length > 0 && (
        <div className="space-y-1.5">
          <h2 className="text-xs font-bold tracking-wider text-gray-500 uppercase">Results</h2>
          {summary.results.map((m) => (
            <div key={m.number} className="flex items-center rounded-xl bg-gray-900 px-4 py-2.5 text-white">
              <span className="w-8 text-sm text-gray-400">{m.number}</span>
              <span className="flex-1 truncate pr-3 text-right text-sm font-semibold">{teamNameOf(data.roster)}</span>
              <span className="text-xl font-black tabular-nums">
                {m.score.us} : {m.score.them}
              </span>
              <span className="flex-1 truncate pl-3 text-sm font-semibold">{m.opponentName || OPPONENT_FALLBACK}</span>
            </div>
          ))}
        </div>
      )}

      <figure className="space-y-2" aria-label="Playing time per player">
        <div className="flex items-baseline justify-between">
          <h2 className="text-xs font-bold tracking-wider text-gray-500 uppercase">Playing time</h2>
          <span className="text-sm text-gray-600">
            average <b className="tabular-nums text-gray-900">{short(fairness.averageMs)}</b>
          </span>
        </div>
        <table className="w-full text-sm">
          <thead className="sr-only">
            <tr>
              <th>Player</th>
              <th>Bar</th>
              <th>Playing time</th>
              <th>Versus average</th>
            </tr>
          </thead>
          <tbody>
            {summary.players.map((p) => (
              <tr key={p.playerId} className="h-9">
                <th scope="row" className="w-24 truncate pr-2 text-left font-semibold">
                  {nameOf(p.playerId)}
                </th>
                <td className="px-1">
                  <div className="relative h-4">
                    <div className="absolute inset-y-0 left-0 rounded-r bg-green-600" style={{ width: `${(p.totalMs / scaleMax) * 100}%` }} />
                    <div
                      className="absolute -inset-y-1 w-0 border-l-2 border-dashed border-gray-900"
                      style={{ left: `${avgPct}%` }}
                      aria-hidden
                    />
                  </div>
                </td>
                <td className="w-12 text-right font-bold tabular-nums">{short(p.totalMs)}</td>
                <td className="w-14 text-right text-xs tabular-nums text-gray-500">
                  {p.deltaFromAverageMs === null ? p.availability : signed(p.deltaFromAverageMs)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <figcaption className="text-xs text-gray-500">
          Dashed line: average. {counted.length > 1 && (
            <>
              Most: {nameOf(most.playerId)} {short(most.totalMs)} · least: {nameOf(least.playerId)} {short(least.totalMs)} ·
              difference <b className="text-gray-700">{short(fairness.rangeMs)}</b>.
            </>
          )}
        </figcaption>
      </figure>

      <button
        type="button"
        onClick={actions.closeSummary}
        className="h-14 w-full rounded-xl bg-green-700 text-lg font-bold text-white active:bg-green-800"
      >
        Done
      </button>

      {confirmDelete ? (
        <div className="space-y-2 rounded-xl bg-red-50 p-3">
          <p className="text-sm font-semibold text-red-900">
            Delete the match day of {formatDate(day.date)}? This can't be undone.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => actions.deleteMatchDay(day.id)}
              className="h-12 flex-1 rounded-xl bg-red-600 font-bold text-white active:bg-red-700"
            >
              Yes, delete
            </button>
            <button type="button" onClick={() => setConfirmDelete(false)} className="h-12 rounded-xl bg-white px-5 font-semibold">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirmDelete(true)}
          className="flex h-12 w-full items-center justify-center gap-2 text-sm font-semibold text-red-700"
        >
          <Trash2 size={16} /> Delete this match day
        </button>
      )}
    </section>
  );
}
