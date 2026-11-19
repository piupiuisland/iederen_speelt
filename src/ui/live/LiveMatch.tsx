import { ArrowDown, ArrowUp, BellRing, Flag, Pause, Play, Sun, Undo2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  finishMatch,
  pauseMatch,
  recordGoal,
  respondToReminder,
  resumeMatch,
  setAvailability,
  setOpponentName,
  setPlannedDuration,
  substitute,
  undoLastSubstitution,
  type SubPairInput,
} from "../../domain/commands.ts";
import { recommend, type SubPair } from "../../domain/engine/recommend.ts";
import { replay } from "../../domain/projection.ts";
import { teamNameOf } from "../../domain/roster.ts";
import { MINUTE } from "../../domain/settings.ts";
import type { Availability, MatchDay } from "../../domain/types.ts";
import { beep, useNow, useWakeLock, vibrate } from "../../platform/device.ts";
import { useReadyStore } from "../../store/AppStore.tsx";
import { ErrorText } from "../components/ErrorText.tsx";
import { clock, short } from "../format.ts";
import { PlayerCard } from "./PlayerCard.tsx";
import { Scoreboard } from "./Scoreboard.tsx";

const AVAILABILITY_ACTIONS: { status: Availability; label: string }[] = [
  { status: "resting", label: "Resting" },
  { status: "injured", label: "Injured" },
  { status: "absent", label: "Gone home" },
  { status: "available", label: "Available" },
];

export function LiveMatch() {
  const { data, actions } = useReadyStore();
  const day = data.activeDay!;
  const now = useNow(true);
  const state = replay(day, now);
  const cur = state.current!;
  const running = cur.status === "running";
  const pairs = recommend(state, day.settings);
  const nameOf = (id: string) => data.roster.players.find((p) => p.id === id)?.name ?? "?";

  const [selected, setSelected] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [confirmFinish, setConfirmFinish] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wakeLock = useWakeLock(running);

  const run = (command: (d: MatchDay, ctx: { now: number }) => MatchDay) => {
    const err = actions.runDay(command);
    setError(err);
    return err === null;
  };

  // Heartbeat + interruption check while the match runs.
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => actions.heartbeat(), 5000);
    const onVisibility = () => {
      if (document.visibilityState === "visible") actions.checkInterruption();
      actions.heartbeat();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [running, actions]);

  // Buzz once when a reminder becomes due.
  const wasDue = useRef(cur.reminderDue);
  useEffect(() => {
    if (cur.reminderDue && !wasDue.current && running) {
      vibrate([200, 100, 200]);
      beep();
    }
    wasDue.current = cur.reminderDue;
  }, [cur.reminderDue, running]);

  // Hide the undo toast after a while.
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 8000);
    return () => clearTimeout(id);
  }, [toast]);

  const describe = (ps: readonly SubPairInput[]) =>
    ps
      .map((p) =>
        p.outId && p.inId ? `${nameOf(p.outId)} ⇄ ${nameOf(p.inId)}` : p.inId ? `${nameOf(p.inId)} on` : `${nameOf(p.outId!)} off`,
      )
      .join(", ");

  const doSub = (ps: readonly SubPairInput[]) => {
    if (run((d, ctx) => substitute(d, ps, ctx))) {
      setSelected(null);
      setToast(describe(ps));
      vibrate(40);
    }
  };

  const onField = new Set(cur.onFieldIds);
  const fieldIsFull = cur.onFieldIds.length >= cur.playersOnField;

  const tap = (id: string) => {
    setError(null);
    if (selected && selected !== id && onField.has(selected) !== onField.has(id)) {
      const outId = onField.has(id) ? id : selected;
      const inId = onField.has(id) ? selected : id;
      return doSub([{ outId, inId }]);
    }
    setSelected(selected === id ? null : id);
  };

  const outHints = new Set(pairs.flatMap((p) => (p.outId ? [p.outId] : [])));
  const inHints = new Set(pairs.flatMap((p) => (p.inId ? [p.inId] : [])));
  const field = cur.onFieldIds.map((id) => state.byId[id]!).sort((a, b) => a.rosterIndex - b.rosterIndex);
  const bench = state.players.filter((p) => !onField.has(p.playerId));
  const selectedStats = selected ? state.byId[selected] : undefined;

  return (
    <section className="space-y-3">
      {data.interruption && (
        <div role="alert" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
          <p className="font-semibold">
            The app was closed for {short(data.interruption.gapMs)} during the match. That time counts as played.
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => setError(actions.excludeInterruption())}
              className="h-10 rounded-lg bg-amber-600 px-3 font-bold text-white"
            >
              Don't count it
            </button>
            <button type="button" onClick={actions.dismissInterruption} className="h-10 rounded-lg bg-white px-3 font-semibold">
              OK, keep it
            </button>
          </div>
        </div>
      )}

      <Scoreboard
        teamName={teamNameOf(data.roster)}
        opponentName={cur.opponentName}
        score={cur.score}
        onGoal={(side, delta) => {
          if (run((d, ctx) => recordGoal(d, cur.matchId, side, delta, ctx)) && delta === 1) vibrate(60);
        }}
        onRenameOpponent={(name) => run((d, ctx) => setOpponentName(d, cur.matchId, name, ctx))}
      />

      <div className="flex items-end justify-between">
        <div>
          <p className="text-sm font-semibold text-gray-500">
            Match {cur.number} of {state.matches.length}
            {cur.status === "paused" && <span className="ml-2 rounded bg-gray-800 px-1.5 py-0.5 text-white">PAUSED</span>}
          </p>
          <p aria-label="Match clock" className={`text-6xl leading-none font-black tabular-nums ${cur.status === "paused" ? "text-gray-400" : ""}`}>
            {clock(cur.elapsedMs)}
          </p>
        </div>
        <div className="text-right text-sm">
          <p className={`font-bold tabular-nums ${cur.isOvertime ? "text-red-600" : "text-gray-700"}`}>
            {cur.isOvertime ? `+${clock(cur.remainingMs)} over` : `${clock(cur.remainingMs)} left`}
          </p>
          <div className="mt-1 flex items-center justify-end gap-1">
            <button
              type="button"
              aria-label="Shorten match by 1 minute"
              disabled={cur.plannedDurationMs <= MINUTE}
              onClick={() => run((d, ctx) => setPlannedDuration(d, cur.matchId, cur.plannedDurationMs - MINUTE, ctx))}
              className="h-8 rounded-md bg-gray-100 px-2 font-bold disabled:opacity-30"
            >
              −1′
            </button>
            <span className="w-12 text-center font-semibold tabular-nums">{cur.plannedDurationMs / MINUTE}′</span>
            <button
              type="button"
              aria-label="Lengthen match by 1 minute"
              onClick={() => run((d, ctx) => setPlannedDuration(d, cur.matchId, cur.plannedDurationMs + MINUTE, ctx))}
              className="h-8 rounded-md bg-gray-100 px-2 font-bold"
            >
              +1′
            </button>
          </div>
          <p className={`mt-1 font-semibold tabular-nums ${cur.reminderDue ? "text-blue-700" : "text-gray-500"}`}>
            {cur.reminderDue ? "Sub time!" : `Next sub ${clock(cur.nextReminderInMs ?? 0)}`}
          </p>
        </div>
      </div>

      <div>
        <h2 className="mb-1 text-xs font-bold tracking-wider text-green-700 uppercase">
          On the field · {cur.onFieldIds.length}/{cur.playersOnField}
        </h2>
        <div className="grid grid-cols-2 gap-2">
          {field.map((p) => (
            <PlayerCard
              key={p.playerId}
              name={nameOf(p.playerId)}
              stats={p}
              where="field"
              selected={selected === p.playerId}
              hint={outHints.has(p.playerId) ? "out" : undefined}
              onTap={() => tap(p.playerId)}
            />
          ))}
        </div>
      </div>

      <div>
        <h2 className="mb-1 text-xs font-bold tracking-wider text-orange-600 uppercase">Bench · {bench.length}</h2>
        <div className="grid grid-cols-3 gap-2">
          {bench.map((p) => (
            <PlayerCard
              key={p.playerId}
              name={nameOf(p.playerId)}
              stats={p}
              where="bench"
              selected={selected === p.playerId}
              hint={inHints.has(p.playerId) ? "in" : undefined}
              onTap={() => tap(p.playerId)}
            />
          ))}
        </div>
      </div>

      {selected && selectedStats ? (
        <div className="space-y-2 rounded-xl bg-blue-50 p-3">
          <p className="text-sm font-semibold text-blue-900">
            {nameOf(selected)} selected — tap a player {onField.has(selected) ? "on the bench" : "on the field"} to swap.
          </p>
          <div className="flex flex-wrap gap-2">
            {onField.has(selected) && cur.onFieldIds.length > 1 && (
              <button type="button" className="h-10 rounded-lg bg-white px-3 text-sm font-bold" onClick={() => doSub([{ outId: selected, inId: null }])}>
                Off, no sub
              </button>
            )}
            {!onField.has(selected) && !fieldIsFull && (
              <button type="button" className="h-10 rounded-lg bg-green-700 px-3 text-sm font-bold text-white" onClick={() => doSub([{ outId: null, inId: selected }])}>
                Put on
              </button>
            )}
            {AVAILABILITY_ACTIONS.filter((a) => a.status !== selectedStats.availability).map((a) => (
              <button
                key={a.status}
                type="button"
                className="h-10 rounded-lg bg-white px-3 text-sm font-semibold"
                onClick={() => {
                  if (run((d, ctx) => setAvailability(d, selected, a.status, ctx))) setSelected(null);
                }}
              >
                {a.label}
              </button>
            ))}
            <button type="button" className="h-10 rounded-lg px-3 text-sm font-semibold text-gray-600" onClick={() => setSelected(null)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <Recommendation
          pairs={pairs}
          due={cur.reminderDue}
          nameOf={nameOf}
          onConfirm={() => doSub(pairs)}
          onLater={() => run((d, ctx) => respondToReminder(d, "snooze", ctx))}
          onSkip={() => run((d, ctx) => respondToReminder(d, "skip", ctx))}
        />
      )}

      <ErrorText message={error} />

      <div className="grid grid-cols-[auto_1fr_1fr] gap-2">
        <button
          type="button"
          aria-label="Undo last substitution"
          disabled={!cur.lastBatchId}
          onClick={() => {
            if (run((d, ctx) => undoLastSubstitution(d, ctx))) setToast(null);
          }}
          className="grid h-14 w-14 place-items-center rounded-xl bg-gray-100 active:bg-gray-200 disabled:opacity-30"
        >
          <Undo2 size={22} />
        </button>
        {running ? (
          <button type="button" onClick={() => run((d, ctx) => pauseMatch(d, ctx))} className="flex h-14 items-center justify-center gap-2 rounded-xl bg-gray-800 font-bold text-white">
            <Pause size={20} fill="currentColor" /> Pause
          </button>
        ) : (
          <button type="button" onClick={() => run((d, ctx) => resumeMatch(d, ctx))} className="flex h-14 items-center justify-center gap-2 rounded-xl bg-green-700 font-bold text-white">
            <Play size={20} fill="currentColor" /> Resume
          </button>
        )}
        {confirmFinish ? (
          <button
            type="button"
            onClick={() => {
              setConfirmFinish(false);
              run((d, ctx) => finishMatch(d, ctx));
            }}
            className="h-14 rounded-xl bg-red-600 font-bold text-white"
          >
            Yes, finish
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmFinish(true)}
            className="flex h-14 items-center justify-center gap-2 rounded-xl border-2 border-red-600 font-bold text-red-700"
          >
            <Flag size={20} /> Finish
          </button>
        )}
      </div>

      <p className="flex items-center gap-1.5 text-xs text-gray-500">
        <Sun size={14} />
        {wakeLock === "on"
          ? "Screen stays on during the match."
          : "Keep the screen on: reminders can't sound while the phone is locked."}
      </p>

      {toast && (
        <div role="status" className="fixed inset-x-0 bottom-20 z-20 mx-auto flex max-w-sm items-center justify-between gap-3 rounded-xl bg-gray-900 px-4 py-3 text-white shadow-lg">
          <span className="truncate text-sm font-semibold">{toast}</span>
          <button
            type="button"
            onClick={() => {
              if (run((d, ctx) => undoLastSubstitution(d, ctx))) setToast(null);
            }}
            className="shrink-0 font-bold text-blue-300"
          >
            Undo
          </button>
        </div>
      )}
    </section>
  );
}

function Recommendation({
  pairs,
  due,
  nameOf,
  onConfirm,
  onLater,
  onSkip,
}: {
  pairs: SubPair[];
  due: boolean;
  nameOf: (id: string) => string;
  onConfirm: () => void;
  onLater: () => void;
  onSkip: () => void;
}) {
  if (pairs.length === 0) {
    if (!due) return null;
    return (
      <div className="flex items-center justify-between rounded-xl bg-blue-50 p-3">
        <span className="font-semibold text-blue-900">Sub time — no change needed.</span>
        <button type="button" onClick={onSkip} className="h-10 rounded-lg bg-blue-600 px-4 font-bold text-white">
          OK
        </button>
      </div>
    );
  }
  return (
    <div
      aria-label="Suggested substitutions"
      className={`rounded-xl p-3 ${due ? "bg-blue-600 text-white ring-4 ring-blue-300" : "border-2 border-blue-200 bg-blue-50 text-blue-950"}`}
    >
      <p className="mb-2 flex items-center gap-1.5 text-xs font-bold tracking-wider uppercase">
        {due && <BellRing size={14} />} {due ? "Sub time" : "Suggested"}
      </p>
      <ul className="mb-3 space-y-1">
        {pairs.map((p, i) => (
          <li key={i} className="flex items-center gap-2 text-lg font-bold">
            {p.outId && (
              <span className="flex items-center gap-1">
                <ArrowDown size={18} className={due ? "text-orange-200" : "text-orange-500"} />
                {nameOf(p.outId)}
              </span>
            )}
            {p.inId && (
              <span className="flex items-center gap-1">
                <ArrowUp size={18} className={due ? "text-green-200" : "text-green-600"} />
                {nameOf(p.inId)}
              </span>
            )}
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onConfirm}
          className={`h-12 flex-1 rounded-lg font-bold ${due ? "bg-white text-blue-700" : "bg-blue-600 text-white"}`}
        >
          {pairs.length === 1 ? "Do this sub" : `Do these ${pairs.length} subs`}
        </button>
        {due && (
          <>
            <button type="button" onClick={onLater} className="h-12 rounded-lg bg-blue-500 px-3 font-semibold">
              Later
            </button>
            <button type="button" onClick={onSkip} className="h-12 rounded-lg bg-blue-500 px-3 font-semibold">
              Skip
            </button>
          </>
        )}
      </div>
    </div>
  );
}
