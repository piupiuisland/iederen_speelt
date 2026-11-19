import { Check, Play, Sparkles } from "lucide-react";
import { useState } from "react";
import {
  removeMatch,
  setMatchPlayersOnField,
  setMatchRotation,
  setOpponentName,
  setPlannedDuration,
  startMatch,
} from "../../domain/commands.ts";
import { recommendStartingLineup } from "../../domain/engine/lineup.ts";
import { rotationTemplate } from "../../domain/engine/rotation.ts";
import { replay } from "../../domain/projection.ts";
import { MINUTE } from "../../domain/settings.ts";
import { primeAudio } from "../../platform/device.ts";
import { useReadyStore } from "../../store/AppStore.tsx";
import { Chips, FIELD_SIZES, MATCH_LENGTHS } from "../components/Chips.tsx";
import { ErrorText } from "../components/ErrorText.tsx";
import { Stepper } from "../components/Stepper.tsx";
import { OPPONENT_FALLBACK, short } from "../format.ts";

const QUICK_DURATIONS = MATCH_LENGTHS;

/** Before kick-off: opponent, this match's length, and the starting lineup. Render with key={matchId}. */
export function PreMatch({ matchId }: { matchId: string }) {
  const { data, actions } = useReadyStore();
  const day = data.activeDay!;
  const state = replay(day, Date.now());
  const match = state.matches.find((m) => m.matchId === matchId)!;
  const nameOf = (id: string) => data.roster.players.find((p) => p.id === id)?.name ?? "?";

  // Rotate the first match's suggestion each match day so the same children don't always start.
  const lineupOffset = data.history.length * day.settings.playersOnField;
  // Field size: this match's choice, else the previous match's, else the match-day default.
  const previous = state.matches.filter((m) => m.status !== "ready").at(-1);
  const fieldSize =
    day.matches.find((m) => m.id === matchId)!.playersOnField ?? previous?.playersOnField ?? day.settings.playersOnField;

  const [opponent, setOpponent] = useState(match.opponentName);
  const [lineup, setLineup] = useState<string[]>(() =>
    match.startingPlayerIds.length > 0 ? match.startingPlayerIds : recommendStartingLineup(day, Date.now(), lineupOffset, fieldSize),
  );
  const [error, setError] = useState<string | null>(null);

  const available = state.players.filter((p) => p.availability === "available");
  const requiredFor = (size: number) => Math.min(size, available.length);
  const required = requiredFor(fieldSize);

  /** Keep the parent's picks; trim or top up from the suggestion. */
  const changeFieldSize = (size: number) => {
    const err = actions.runDay((d, ctx) => setMatchPlayersOnField(d, matchId, size, ctx));
    setError(err);
    if (err) return;
    const need = requiredFor(size);
    if (lineup.length >= need) return setLineup(lineup.slice(0, need));
    const extra = recommendStartingLineup(day, Date.now(), lineupOffset, size).filter((id) => !lineup.includes(id));
    setLineup([...lineup, ...extra].slice(0, need));
  };
  const minutes = match.plannedDurationMs / MINUTE;
  const setMinutes = (m: number) =>
    setError(actions.runDay((d, ctx) => setPlannedDuration(d, matchId, m * MINUTE, ctx)));

  // Substitution rhythm: the built-in template for today's situation unless the parent changes it.
  const bench = available.length - fieldSize;
  const template = rotationTemplate(available.length, fieldSize, minutes);
  const [custom, setCustom] = useState<{ intervalMin: number; swaps: number } | null>(null);
  const rotation = custom ??
    (template
      ? { intervalMin: template.intervalMin, swaps: template.swapsPerSub }
      : { intervalMin: Math.round(day.settings.reminderIntervalMs / MINUTE), swaps: Math.max(1, Math.min(2, bench)) });
  const swaps = Math.max(1, Math.min(rotation.swaps, Math.max(1, bench)));
  const isTemplate = !!template && template.intervalMin === rotation.intervalMin && template.swapsPerSub === swaps;

  const toggle = (id: string) => {
    setError(null);
    if (lineup.includes(id)) return setLineup(lineup.filter((x) => x !== id));
    if (lineup.length >= required) return setError(`${required} already selected — tap one to take them out first.`);
    setLineup([...lineup, id]);
  };

  const kickOff = () => {
    primeAudio(); // allow reminder beeps later (browsers need a tap first)
    setError(
      actions.runDay((d, ctx) => {
        const named = opponent !== match.opponentName ? setOpponentName(d, matchId, opponent, ctx) : d;
        const sized = setMatchPlayersOnField(named, matchId, fieldSize, ctx);
        const paced = setMatchRotation(
          sized,
          matchId,
          { reminderIntervalMs: rotation.intervalMin * MINUTE, maxSubsPerReminder: swaps },
          ctx,
        );
        return startMatch(paced, matchId, ctx, lineup);
      }),
    );
  };

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-bold">
        Match {match.number} <span className="font-semibold text-gray-400">of {state.matches.length}</span>
      </h1>

      <label className="block">
        <span className="text-sm font-semibold text-gray-600">Playing against</span>
        <input
          aria-label="Opponent name"
          placeholder={OPPONENT_FALLBACK}
          value={opponent}
          onChange={(e) => setOpponent(e.target.value)}
          onBlur={() => opponent !== match.opponentName && actions.runDay((d, ctx) => setOpponentName(d, matchId, opponent, ctx))}
          className="mt-1 w-full rounded-xl border-2 border-gray-300 px-3 py-3 text-lg font-semibold outline-none focus:border-blue-500"
        />
      </label>

      <div className="rounded-2xl border border-gray-200 px-4 py-1">
        <Chips label="On the field" options={FIELD_SIZES} value={fieldSize} onChange={changeFieldSize} />
        <Stepper label="Match length" unit="min" value={minutes} min={1} max={90} onChange={setMinutes} />
        <div className="flex justify-end gap-2 pb-2" role="group" aria-label="Quick match length">
          {QUICK_DURATIONS.map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={minutes === m}
              onClick={() => setMinutes(m)}
              className={`h-10 rounded-lg px-3 text-sm font-bold ${minutes === m ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700"}`}
            >
              {m}′
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 px-4 py-2" aria-label="Substitutions">
        <h2 className="pt-1 font-bold">Substitutions</h2>
        {bench < 1 ? (
          <p className="py-2 text-sm text-gray-600">Everyone plays the whole match — no substitutions needed.</p>
        ) : (
          <>
            <Stepper
              label="Swap every"
              unit="min"
              value={rotation.intervalMin}
              min={2}
              max={20}
              onChange={(v) => setCustom({ intervalMin: v, swaps })}
            />
            <Stepper
              label="Children per swap"
              value={swaps}
              min={1}
              max={bench}
              onChange={(v) => setCustom({ intervalMin: rotation.intervalMin, swaps: v })}
            />
            {template && (
              <div className={`mb-2 flex items-start gap-2 rounded-xl p-3 text-sm ${isTemplate ? "bg-green-50 text-green-900" : "bg-gray-50 text-gray-700"}`}>
                <Sparkles size={16} className="mt-0.5 shrink-0" />
                <div className="flex-1">
                  <p>
                    {isTemplate ? "Recommended" : "Recommended"} for {available.length} children, {fieldSize} on the field,{" "}
                    {minutes} min: <b>every {template.intervalMin} min, {template.swapsPerSub} at a time</b>.
                  </p>
                  <p className="text-xs opacity-75">
                    About {template.swapMomentsPerMatch} swap moments per match · expected difference {template.differenceMin} min
                    over 3 matches.
                  </p>
                  {!isTemplate && (
                    <button type="button" onClick={() => setCustom(null)} className="mt-1 font-bold text-green-800 underline">
                      Use recommended
                    </button>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <div>
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="font-bold">Starting lineup</h2>
          <span className={`text-sm font-semibold ${lineup.length === required ? "text-green-700" : "text-orange-600"}`}>
            {lineup.length} of {required} selected
          </span>
        </div>
        <ul className="grid grid-cols-2 gap-2">
          {state.players.map((p) => {
            const on = lineup.includes(p.playerId);
            const unavailable = p.availability !== "available";
            return (
              <li key={p.playerId}>
                <button
                  type="button"
                  disabled={unavailable}
                  aria-pressed={on}
                  aria-label={`Start ${nameOf(p.playerId)}`}
                  onClick={() => toggle(p.playerId)}
                  className={`flex min-h-14 w-full items-center justify-between rounded-xl border-2 px-3 py-2 text-left ${
                    on ? "border-green-600 bg-green-50" : "border-gray-200 bg-white"
                  } disabled:bg-gray-100 disabled:text-gray-400`}
                >
                  <span>
                    <span className="block text-lg leading-tight font-bold">{nameOf(p.playerId)}</span>
                    <span className="text-xs text-gray-500 tabular-nums">
                      {unavailable ? p.availability : state.completedMatches > 0 ? `played ${short(p.totalMs)}` : " "}
                    </span>
                  </span>
                  {on && <Check size={22} className="text-green-700" strokeWidth={3} />}
                </button>
              </li>
            );
          })}
        </ul>
        {state.completedMatches > 0 && (
          <p className="mt-2 text-xs text-gray-500">Suggested: who has played least so far today.</p>
        )}
      </div>

      <ErrorText message={error} />

      <button
        type="button"
        disabled={lineup.length !== required}
        onClick={kickOff}
        className="flex h-16 w-full items-center justify-center gap-2 rounded-2xl bg-green-700 text-xl font-bold text-white shadow active:bg-green-800 disabled:bg-gray-300"
      >
        <Play size={24} fill="currentColor" /> Kick off
      </button>
      <button
        type="button"
        onClick={() => setError(actions.runDay((d, ctx) => removeMatch(d, matchId, ctx)))}
        className="w-full py-2 text-sm font-semibold text-gray-500"
      >
        Skip this match
      </button>
    </section>
  );
}
