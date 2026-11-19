import { createMatchDay, DomainError, randomId, type CreateMatchDayInput, type Ctx } from "./commands.ts";
import type { MatchDay, Player, PlayerId } from "./types.ts";

/**
 * Players seeded on first launch. Deliberately empty: children's names are
 * entered on the device (Team tab) and never stored in this public code.
 */
export const DEFAULT_TEAM_NAMES: readonly string[] = [];

export const DEFAULT_TEAM_NAME = "Best Vooruit";

export interface Roster {
  /** Our team's name on the scoreboard. */
  teamName?: string;
  /** Always sorted alphabetically by name. */
  players: Player[];
}

export const teamNameOf = (roster: Roster): string => roster.teamName || DEFAULT_TEAM_NAME;

export function setTeamName(roster: Roster, name: string): Roster {
  const clean = name.trim().replace(/\s+/g, " ").slice(0, 40);
  if (!clean) throw new DomainError("A team name is required.");
  return { ...roster, teamName: clean };
}

const collator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });

export function sortByName<T extends { name: string }>(players: readonly T[]): T[] {
  return [...players].sort((a, b) => collator.compare(a.name, b.name));
}

function cleanName(name: string, roster: Roster, exceptId?: PlayerId): string {
  const trimmed = name.trim().replace(/\s+/g, " ");
  if (!trimmed) throw new DomainError("A name is required.");
  const clash = roster.players.some(
    (p) => !p.archived && p.id !== exceptId && collator.compare(p.name, trimmed) === 0,
  );
  if (clash) throw new DomainError(`There is already a player called ${trimmed}.`);
  return trimmed;
}

export function createRoster(names: readonly string[] = DEFAULT_TEAM_NAMES, newId: () => string = randomId): Roster {
  return names.reduce<Roster>((r, name) => addPlayer(r, name, newId), { teamName: DEFAULT_TEAM_NAME, players: [] });
}

export function addPlayer(roster: Roster, name: string, newId: () => string = randomId): Roster {
  const player: Player = { id: newId(), name: cleanName(name, roster), archived: false };
  return { ...roster, players: sortByName([...roster.players, player]) };
}

export function renamePlayer(roster: Roster, playerId: PlayerId, name: string): Roster {
  const clean = cleanName(name, roster, playerId);
  return { ...roster, players: sortByName(roster.players.map((p) => (p.id === playerId ? { ...p, name: clean } : p))) };
}

/** Archived players disappear from the roster but old match days can still show their names. */
export function removePlayer(roster: Roster, playerId: PlayerId): Roster {
  return { ...roster, players: roster.players.map((p) => (p.id === playerId ? { ...p, archived: true } : p)) };
}

export function activePlayers(roster: Roster): Player[] {
  return roster.players.filter((p) => !p.archived);
}

/**
 * Start-of-day attendance: everyone on the roster, ticked as present by default.
 * The parent unticks absent children, then creates the match day.
 */
export function defaultAttendance(roster: Roster): Record<PlayerId, boolean> {
  return Object.fromEntries(activePlayers(roster).map((p) => [p.id, true]));
}

export function createMatchDayFromAttendance(
  roster: Roster,
  attendance: Record<PlayerId, boolean>,
  input: Omit<CreateMatchDayInput, "playerIds">,
  ctx: Ctx,
): MatchDay {
  // Participants keep alphabetical order, which is also the first-match rotation order.
  const playerIds = activePlayers(roster)
    .filter((p) => attendance[p.id])
    .map((p) => p.id);
  if (playerIds.length === 0) throw new DomainError("Tick at least one player who is here today.");
  return createMatchDay({ ...input, playerIds }, ctx);
}
