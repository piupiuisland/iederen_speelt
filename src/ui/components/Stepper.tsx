import { Minus, Plus } from "lucide-react";

export function Stepper({
  label,
  value,
  min,
  max,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  unit?: string;
  onChange: (value: number) => void;
}) {
  const btn =
    "grid size-12 place-items-center rounded-xl bg-gray-100 text-gray-900 active:bg-gray-200 disabled:opacity-30";
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <span className="text-base font-medium text-gray-900">{label}</span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          className={btn}
          aria-label={`Decrease ${label}`}
          disabled={value <= min}
          onClick={() => onChange(Math.max(min, value - 1))}
        >
          <Minus size={22} strokeWidth={2.5} />
        </button>
        <output aria-label={label} className="w-20 text-center text-lg font-bold tabular-nums">
          {value}
          {unit && <span className="ml-1 text-sm font-medium text-gray-500">{unit}</span>}
        </output>
        <button
          type="button"
          className={btn}
          aria-label={`Increase ${label}`}
          disabled={value >= max}
          onClick={() => onChange(Math.min(max, value + 1))}
        >
          <Plus size={22} strokeWidth={2.5} />
        </button>
      </div>
    </div>
  );
}
