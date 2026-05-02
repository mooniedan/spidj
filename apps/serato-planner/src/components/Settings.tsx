import type { CriterionKey, SuggestionConfig } from "../types";

interface Props {
  config: SuggestionConfig;
  onChange: (c: SuggestionConfig) => void;
}

const CRITERIA: { key: CriterionKey; label: string }[] = [
  { key: "bpm", label: "BPM" },
  { key: "key", label: "Key" },
  { key: "genre", label: "Genre" },
  { key: "tags", label: "Tags" },
  { key: "artist", label: "Artist" },
  { key: "year", label: "Year" },
  { key: "energy", label: "Energy" },
];

export function Settings({ config, onChange }: Props) {
  const toggle = (k: CriterionKey) => {
    onChange({
      ...config,
      enabledCriteria: {
        ...config.enabledCriteria,
        [k]: !config.enabledCriteria[k],
      },
    });
  };

  return (
    <div className="bg-[#1a1d22] border-b border-white/5 px-4 py-2">
      <div className="flex items-center gap-3 text-xs flex-wrap">
        <span className="text-white/60 uppercase tracking-widest">
          Criteria
        </span>
        {CRITERIA.map((c) => {
          const on = config.enabledCriteria[c.key];
          return (
            <button
              key={c.key}
              className={
                "px-2 py-0.5 rounded border " +
                (on
                  ? "bg-[#c8302e] border-[#c8302e] text-white"
                  : "bg-transparent border-white/15 text-white/60 hover:border-white/40")
              }
              onClick={() => toggle(c.key)}
            >
              {c.label}
            </button>
          );
        })}
        <span className="text-white/60 uppercase tracking-widest ml-4">
          Strict
        </span>
        <input
          type="range"
          min={0}
          max={100}
          value={config.strictness}
          onChange={(e) =>
            onChange({ ...config, strictness: Number(e.target.value) })
          }
          className="w-32"
        />
        <span className="text-white/60 font-mono">
          {config.strictness}
        </span>
      </div>
    </div>
  );
}
