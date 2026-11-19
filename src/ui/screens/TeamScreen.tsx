import { Check, Pencil, Trash2, UserPlus, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import { activePlayers, teamNameOf } from "../../domain/roster.ts";
import { useReadyStore } from "../../store/AppStore.tsx";
import { ErrorText } from "../components/ErrorText.tsx";

const iconBtn = "grid size-12 shrink-0 place-items-center rounded-xl active:bg-gray-200";

export function TeamScreen() {
  const { data, actions } = useReadyStore();
  const players = activePlayers(data.roster);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [teamName, setTeamName] = useState(teamNameOf(data.roster));

  const add = (e: FormEvent) => {
    e.preventDefault();
    const err = actions.addPlayer(newName);
    setError(err);
    if (!err) setNewName("");
  };

  const saveRename = (e: FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    const err = actions.renamePlayer(editing.id, editing.name);
    setError(err);
    if (!err) setEditing(null);
  };

  return (
    <section className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-bold">Team</h1>
        <span className="text-sm font-medium text-gray-500">{players.length} players</span>
      </div>

      <label className="block">
        <span className="text-sm font-semibold text-gray-600">Team name (scoreboard)</span>
        <input
          aria-label="Team name"
          value={teamName}
          onChange={(e) => setTeamName(e.target.value)}
          onBlur={() => {
            const err = actions.setTeamName(teamName);
            setError(err);
            if (err) setTeamName(teamNameOf(data.roster));
          }}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          className="mt-1 w-full rounded-xl border-2 border-gray-300 px-3 py-3 text-lg font-semibold outline-none focus:border-blue-500"
        />
      </label>

      <ul className="divide-y divide-gray-200 rounded-2xl border border-gray-200">
        {players.map((p) => (
          <li key={p.id} className="flex min-h-16 items-center gap-2 px-3 py-2">
            {editing?.id === p.id ? (
              <form onSubmit={saveRename} className="flex flex-1 items-center gap-2">
                <input
                  autoFocus
                  aria-label={`Name for ${p.name}`}
                  value={editing.name}
                  onChange={(e) => setEditing({ id: p.id, name: e.target.value })}
                  className="min-w-0 flex-1 rounded-xl border-2 border-blue-500 px-3 py-2 text-lg font-semibold outline-none"
                />
                <button type="submit" aria-label="Save name" className={`${iconBtn} bg-blue-600 text-white`}>
                  <Check size={22} />
                </button>
                <button
                  type="button"
                  aria-label="Cancel rename"
                  className={`${iconBtn} bg-gray-100`}
                  onClick={() => {
                    setEditing(null);
                    setError(null);
                  }}
                >
                  <X size={22} />
                </button>
              </form>
            ) : confirmRemove === p.id ? (
              <>
                <span className="flex-1 text-lg font-semibold">Remove {p.name}?</span>
                <button
                  type="button"
                  aria-label={`Yes, remove ${p.name}`}
                  className="h-12 rounded-xl bg-red-600 px-4 font-bold text-white active:bg-red-700"
                  onClick={() => {
                    actions.removePlayer(p.id);
                    setConfirmRemove(null);
                  }}
                >
                  Remove
                </button>
                <button
                  type="button"
                  className="h-12 rounded-xl bg-gray-100 px-4 font-semibold active:bg-gray-200"
                  onClick={() => setConfirmRemove(null)}
                >
                  Keep
                </button>
              </>
            ) : (
              <>
                <span data-testid="player-name" className="flex-1 text-lg font-semibold">
                  {p.name}
                </span>
                <button
                  type="button"
                  aria-label={`Rename ${p.name}`}
                  className={`${iconBtn} text-gray-600`}
                  onClick={() => {
                    setEditing({ id: p.id, name: p.name });
                    setConfirmRemove(null);
                    setError(null);
                  }}
                >
                  <Pencil size={20} />
                </button>
                <button
                  type="button"
                  aria-label={`Remove ${p.name}`}
                  className={`${iconBtn} text-red-600`}
                  onClick={() => {
                    setConfirmRemove(p.id);
                    setEditing(null);
                  }}
                >
                  <Trash2 size={20} />
                </button>
              </>
            )}
          </li>
        ))}
        {players.length === 0 && <li className="px-4 py-6 text-center text-gray-500">No players yet.</li>}
      </ul>

      <form onSubmit={add} className="flex gap-2">
        <input
          aria-label="New player name"
          placeholder="Add a player"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          className="min-w-0 flex-1 rounded-xl border-2 border-gray-300 px-3 py-3 text-lg outline-none focus:border-blue-500"
        />
        <button
          type="submit"
          className="flex h-14 items-center gap-2 rounded-xl bg-green-700 px-4 font-bold text-white active:bg-green-800"
        >
          <UserPlus size={20} /> Add
        </button>
      </form>
      <ErrorText message={error} />
    </section>
  );
}
