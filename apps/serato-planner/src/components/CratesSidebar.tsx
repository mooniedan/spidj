import type { CrateSummary } from "../types";

interface Props {
  crates: CrateSummary[];
  activeCrate: string | null;
  onSelect: (name: string) => void;
  onNew: () => void;
}

export function CratesSidebar({ crates, activeCrate, onSelect, onNew }: Props) {
  return (
    <div className="w-44 bg-[#1a1d22] border-r border-white/5 flex flex-col">
      <div className="px-3 py-2 border-b border-white/5 flex items-center justify-between">
        <span className="text-xs text-white/60 uppercase tracking-widest">
          Crates
        </span>
        <button
          className="text-xs text-white/60 hover:text-white"
          onClick={onNew}
          title="Start a new crate"
        >
          + New
        </button>
      </div>
      <div className="flex-1 overflow-auto">
        <button
          className={
            "w-full text-left px-3 py-2 text-sm border-b border-white/5 " +
            (activeCrate === null
              ? "bg-[#22262c] text-white"
              : "text-white/70 hover:bg-white/[0.03]")
          }
          onClick={onNew}
        >
          (new crate)
        </button>
        {crates.length === 0 ? (
          <div className="text-white/40 text-xs p-3">no crates yet</div>
        ) : (
          crates.map((c) => (
            <button
              key={c.name}
              className={
                "w-full text-left px-3 py-2 text-sm border-b border-white/5 flex items-center justify-between gap-2 " +
                (activeCrate === c.name
                  ? "bg-[#22262c] text-white"
                  : "text-white/80 hover:bg-white/[0.03]")
              }
              onClick={() => onSelect(c.name)}
            >
              <span className="truncate">{c.name}</span>
              <span className="text-[10px] text-white/40 font-mono shrink-0">
                {c.trackCount}
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
