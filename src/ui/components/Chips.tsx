/** A row of big toggle buttons for picking one value (e.g. 4 / 5 / 6 players, 20′ / 30′ / 40′). */
export function Chips({
  label,
  options,
  value,
  onChange,
  format = String,
}: {
  label: string;
  options: readonly number[];
  value: number;
  onChange: (value: number) => void;
  format?: (value: number) => string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <span className="text-base font-medium text-gray-900">{label}</span>
      <div className="flex gap-2" role="group" aria-label={label}>
        {options.map((o) => (
          <button
            key={o}
            type="button"
            aria-pressed={value === o}
            onClick={() => onChange(o)}
            className={`h-12 min-w-14 rounded-xl px-3 text-lg font-bold ${
              value === o ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700 active:bg-gray-200"
            }`}
          >
            {format(o)}
          </button>
        ))}
      </div>
    </div>
  );
}

export const FIELD_SIZES = [4, 5, 6] as const;
export const MATCH_LENGTHS = [20, 30, 40] as const;
export const minutes = (m: number) => `${m}′`;
