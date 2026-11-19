import { Play, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { activePlayers } from "../../domain/roster.ts";
import { useReadyStore } from "../../store/AppStore.tsx";
import { formatDate, todayISO, type SetupPrefs } from "../../store/prefs.ts";
import { Chips, FIELD_SIZES, MATCH_LENGTHS } from "../components/Chips.tsx";
import { ErrorText } from "../components/ErrorText.tsx";
import { Stepper } from "../components/Stepper.tsx";

const QUICK_DURATIONS = MATCH_LENGTHS;

/** Start of a match day: who is here today, and how the matches are set up. */
export function SetupScreen() {
  const { data, actions } = useReadyStore();
  const players = activePlayers(data.roster);
  const [absent, setAbsent] = useState<Set<string>>(() => new Set());
  const [prefs, setPrefs] = useState<SetupPrefs>(data.prefs);
  const [date, setDate] = useState(todayISO);
  const [error, setError] = useState<string | null>(null);

  const playing = players.filter((p) => !absent.has(p.id)).length;
  const set =
    <K extends keyof SetupPrefs>(key: K) =>
    (value: SetupPrefs[K]) =>
      setPrefs((p) => ({ ...p, [key]: value }));
  const toggle = (id: string) =>
    setAbsent((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <section className="space-y-6">
      <div>
        <div className="flex items-baseline justify-between gap-2">
          <h1 className="text-2xl font-bold">Who's playing today?</h1>
        </div>
        <div className="mt-1 flex items-center justify-between">
          <p className="text-base font-semibold text-green-700">
            {playing} of {players.length} playing
          </p>
          <input
            type="date"
            aria-label="Match day date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-lg border border-gray-300 px-2 py-1 text-sm"
          />
        </div>
      </div>

      {players.length === 0 ? (
        <p className="rounded-xl bg-gray-50 p-4 text-gray-600">Add players in the Team tab first.</p>
      ) : (
        <ul className="grid grid-cols-1 gap-2">
          {players.map((p) => {
            const here = !absent.has(p.id);
            return (
              <li key={p.id}>
                <button
                  type="button"
                  aria-pressed={here}
                  aria-label={`${p.name}: ${here ? "playing" : "absent"}`}
                  onClick={() => toggle(p.id)}
                  className={`flex min-h-14 w-full items-center justify-between rounded-xl border-2 px-4 py-2 text-left text-lg font-semibold ${
                    here ? "border-green-600 bg-green-50 text-gray-900" : "border-gray-200 bg-gray-50 text-gray-500"
                  }`}
                >
                  <span>{p.name}</span>
                  <span
                    className={`rounded-full px-3 py-1 text-sm font-bold ${
                      here ? "bg-green-600 text-white" : "bg-gray-300 text-gray-700"
                    }`}
                  >
                    {here ? "Playing" : "Absent"}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="rounded-2xl border border-gray-200 px-4 py-2">
        <Chips label="On the field" options={FIELD_SIZES} value={prefs.playersOnField} onChange={set("playersOnField")} />
        <Stepper label="Matches" value={prefs.matchCount} min={1} max={8} onChange={set("matchCount")} />
        <Stepper
          label="Match length"
          unit="min"
          value={prefs.matchDurationMin}
          min={1}
          max={90}
          onChange={set("matchDurationMin")}
        />
        <div className="flex justify-end gap-2 pb-2" role="group" aria-label="Quick match length">
          {QUICK_DURATIONS.map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={prefs.matchDurationMin === m}
              onClick={() => set("matchDurationMin")(m)}
              className={`h-10 rounded-lg px-3 text-sm font-bold ${
                prefs.matchDurationMin === m ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700"
              }`}
            >
              {m}′
            </button>
          ))}
        </div>
        <p className="pb-2 text-xs text-gray-500">How often to swap is suggested for each match, based on who's here.</p>
      </div>

      {playing > 0 && playing < prefs.playersOnField && (
        <p className="flex items-start gap-2 rounded-xl bg-orange-50 p-3 text-sm font-medium text-orange-800">
          <TriangleAlert size={18} className="mt-0.5 shrink-0" />
          Only {playing} playing — matches will start with {playing} on the field.
        </p>
      )}

      <ErrorText message={error} />

      <button
        type="button"
        disabled={playing === 0}
        onClick={() => setError(actions.startMatchDay({ absentIds: absent, prefs, date: date || todayISO() }))}
        className="flex h-16 w-full items-center justify-center gap-2 rounded-2xl bg-green-700 text-xl font-bold text-white shadow active:bg-green-800 disabled:bg-gray-300"
      >
        <Play size={24} fill="currentColor" /> Start match day
      </button>

      {data.history.length > 0 && (
        <div className="space-y-1.5 pt-2">
          <h2 className="text-xs font-bold tracking-wider text-gray-500 uppercase">Earlier match days</h2>
          {data.history.slice(0, 10).map((d) => {
            const played = d.matches.filter((m) => m.events.length > 0).length;
            return (
              <button
                key={d.id}
                type="button"
                onClick={() => actions.openSummary(d.id)}
                className="flex h-12 w-full items-center justify-between rounded-xl bg-gray-50 px-4 text-left active:bg-gray-100"
              >
                <span className="font-semibold">
                  {formatDate(d.date)}
                  {d.finishedAt !== undefined && (
                    <span className="ml-1.5 font-normal text-gray-500">
                      {new Date(d.finishedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  )}
                </span>
                <span className="text-sm text-gray-600">
                  {played} {played === 1 ? "match" : "matches"} · {d.playerIds.length} players
                </span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
