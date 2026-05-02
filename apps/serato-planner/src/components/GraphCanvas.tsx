import type { Suggestion, Track } from "../types";

interface Props {
  anchor: Track | null;
  suggestions: Suggestion[];
  onLeafClick: (s: Suggestion) => void;
  loading?: boolean;
}

const RADIUS = 180;
const NODE_W = 160;
const NODE_H = 100;

interface Pos {
  cx: number;
  cy: number;
}

/** Radial positions around centre (0,0). Lifted from prototypes/graph.jsx. */
function radialPositions(n: number): Pos[] {
  const out: Pos[] = [];
  for (let i = 0; i < n; i++) {
    const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
    out.push({
      cx: Math.cos(angle) * RADIUS,
      cy: Math.sin(angle) * RADIUS,
    });
  }
  return out;
}

export function GraphCanvas({ anchor, suggestions, onLeafClick, loading }: Props) {
  if (!anchor) {
    return (
      <div className="flex-1 flex items-center justify-center text-white/40 text-sm">
        Search for a starting track to anchor the graph.
      </div>
    );
  }

  const positions = radialPositions(suggestions.length);

  return (
    <div className="flex-1 relative overflow-hidden">
      <svg className="absolute inset-0 w-full h-full pointer-events-none">
        {positions.map((p, i) => (
          <line
            key={i}
            x1="50%"
            y1="50%"
            x2={`calc(50% + ${p.cx}px)`}
            y2={`calc(50% + ${p.cy}px)`}
            stroke="rgba(255,255,255,0.08)"
            strokeWidth={1}
          />
        ))}
      </svg>
      {/* Anchor */}
      <div
        className="absolute rounded-lg bg-[#1a1d22] flex flex-col items-center justify-center text-center px-3 py-2"
        style={{
          left: `calc(50% - ${NODE_W / 2}px)`,
          top: `calc(50% - ${NODE_H / 2}px)`,
          width: NODE_W,
          height: NODE_H,
          boxShadow:
            "0 0 0 1px rgba(200,48,46,0.7), 0 0 24px 4px rgba(200,48,46,0.35)",
        }}
      >
        <div className="text-sm font-medium truncate w-full">{anchor.title}</div>
        <div className="text-xs text-white/60 truncate w-full">{anchor.artist}</div>
        <div className="text-[11px] font-mono text-white/70 mt-1">
          {anchor.bpm > 0 ? `${anchor.bpm.toFixed(0)} BPM` : ""}
          {anchor.key ? ` · ${anchor.key}` : ""}
        </div>
        <div className="text-[10px] text-white/40 mt-0.5 truncate w-full">
          anchor
        </div>
      </div>
      {/* Leaves — every reason visible (no hover-only data). */}
      {suggestions.map((s, i) => {
        const p = positions[i];
        return (
          <button
            key={s.track.id}
            className="absolute rounded-lg bg-[#22262c] hover:bg-[#2c3036] flex flex-col items-stretch justify-start text-left px-3 py-1.5 cursor-pointer transition-colors overflow-hidden"
            style={{
              left: `calc(50% + ${p.cx}px - ${NODE_W / 2}px)`,
              top: `calc(50% + ${p.cy}px - ${NODE_H / 2}px)`,
              width: NODE_W,
              height: NODE_H,
            }}
            onClick={() => onLeafClick(s)}
          >
            <div className="text-sm truncate">{s.track.title}</div>
            <div className="text-xs text-white/60 truncate">
              {s.track.artist}
            </div>
            <div className="text-[11px] font-mono text-white/70 truncate">
              {s.track.bpm > 0 ? `${s.track.bpm.toFixed(0)} BPM` : "— BPM"}
              {s.track.key ? ` · ${s.track.key}` : ""}
            </div>
            <div className="flex flex-wrap gap-x-1 gap-y-0.5 mt-1">
              {s.reasons.map((r, idx) => (
                <span
                  key={idx}
                  className={
                    "text-[10px] leading-tight truncate " +
                    (idx === 0 ? "text-[#c8302e]" : "text-white/50")
                  }
                >
                  {r.detail}
                  {idx < s.reasons.length - 1 ? " ·" : ""}
                </span>
              ))}
            </div>
          </button>
        );
      })}
      {loading && (
        <div className="absolute top-2 right-2 text-xs text-white/40">
          thinking…
        </div>
      )}
      {!loading && suggestions.length === 0 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-xs text-white/40">
          No suggestions matched. Loosen settings or try a different anchor.
        </div>
      )}
    </div>
  );
}
