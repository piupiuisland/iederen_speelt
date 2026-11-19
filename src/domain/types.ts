/** Milliseconds. All durations in the domain are stored in ms; the UI converts. */
export type Ms = number;
export type PlayerId = string;

export interface Player {
  id: PlayerId;
  name: string;
  /** Removed from the roster (kept so old match days still resolve names). */
  archived: boolean;
}

export interface Settings {
  playersOnField: number;
  defaultMatchDurationMs: Ms;
  reminderIntervalMs: Ms;
  /** Soft: don't recommend taking a player off before this stint length. */
  minStintMs: Ms;
  /** Soft: a player on longer than this is prioritised to come off. */
  maxStintMs: Ms;
  maxSubsPerRecommendation: number;
  /** "Later" postpones the reminder by this much active match time. */
  snoozeMs: Ms;
}

export type Availability = "available" | "resting" | "injured" | "absent" | "left";

export interface AvailabilityChange {
  id: string;
  t: number;
  playerId: PlayerId;
  status: Availability;
}

export interface MatchDay {
  id: string;
  date: string;
  /** Participants, in rotation order. */
  playerIds: PlayerId[];
  settings: Settings;
  /** Ordered; index + 1 is the match number. */
  matches: Match[];
  availability: AvailabilityChange[];
  finishedAt?: number;
  /** Heartbeat used to detect that the app was closed during a running match. */
  lastSeenMs: number;
}

export interface Match {
  id: string;
  plannedDurationMs: Ms;
  startingPlayerIds: PlayerId[];
  /** Players on the field for this match (e.g. 4, 5 or 6). Missing: the match day's default. */
  playersOnField?: number;
  /** The other club, if the parent typed it. Empty or missing: shown as "Tegenstander". */
  opponentName?: string;
  /** Append-only. Match status and all statistics are derived from this log. */
  events: MatchEvent[];
}

interface EventBase {
  id: string;
  /** Wall-clock timestamp (Date.now()). */
  t: number;
}

export type StartEvent = EventBase & { type: "START" };
export type PauseEvent = EventBase & { type: "PAUSE" };
export type ResumeEvent = EventBase & { type: "RESUME" };
export type FinishEvent = EventBase & { type: "FINISH" };
export type SubEvent = EventBase & {
  type: "SUB";
  /** Pairs confirmed together share a batch and are undone together. */
  batchId: string;
  /** null: a player joins without anyone leaving (topping up a reduced lineup). */
  outId: PlayerId | null;
  /** null: a player leaves without a replacement (e.g. injured, empty bench). */
  inId: PlayerId | null;
};
export type UndoEvent = EventBase & { type: "UNDO"; targetBatchId: string };
export type DurationChangeEvent = EventBase & { type: "DURATION_CHANGE"; plannedDurationMs: Ms };
export type ReminderEvent = EventBase & { type: "REMINDER"; action: "skip" | "snooze" };
/** A goal (+1) or a correction (−1) for one side. */
export type GoalEvent = EventBase & { type: "GOAL"; side: "us" | "them"; delta: 1 | -1 };
/** Marks [fromT, toT] as not played (e.g. the app was closed and the match was actually stopped). */
export type GapCorrectionEvent = EventBase & { type: "GAP_CORRECTION"; fromT: number; toT: number };

export type MatchEvent =
  | StartEvent
  | PauseEvent
  | ResumeEvent
  | FinishEvent
  | SubEvent
  | UndoEvent
  | DurationChangeEvent
  | ReminderEvent
  | GoalEvent
  | GapCorrectionEvent;

/** An event before id/t are assigned. */
export type NewMatchEvent = MatchEvent extends infer E
  ? E extends MatchEvent
    ? Omit<E, "id" | "t">
    : never
  : never;
