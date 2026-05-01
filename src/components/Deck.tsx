import { ipc } from "../ipc/tauri";
import type { DeckId, DeckSnapshot } from "../types";

interface Props {
  deckId: DeckId;
  snapshot: DeckSnapshot | null;
}

const fmtTime = (s: number) => {
  if (!isFinite(s) || s < 0) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60).toString().padStart(2, "0");
  return `${m}:${sec}`;
};

export function Deck({ deckId, snapshot }: Props) {
  const loaded = snapshot?.loaded_path != null;
  const playing = snapshot?.playing ?? false;

  const ringStyle: React.CSSProperties = playing
    ? {
        boxShadow:
          "0 0 0 1px rgba(200,48,46,0.7), 0 0 24px 4px rgba(200,48,46,0.35)",
      }
    : {};

  return (
    <div
      className="flex-1 bg-[#1a1d22] rounded-lg p-4 flex flex-col gap-3"
      style={ringStyle}
    >
      <div className="flex items-center justify-between">
        <div className="text-xs text-white/60 uppercase tracking-widest">
          Deck {deckId}
        </div>
        {playing && (
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#c8302e] text-white">
            LIVE
          </span>
        )}
      </div>

      <div className="min-h-[3.5rem]">
        {loaded ? (
          <>
            <div className="text-base font-medium truncate">
              {snapshot?.loaded_title ??
                snapshot?.loaded_path?.split(/[\\/]/).pop()}
            </div>
            <div className="text-sm text-white/60 truncate">
              {snapshot?.loaded_artist ?? "—"}
            </div>
          </>
        ) : (
          <div className="text-white/40 text-sm">No track loaded</div>
        )}
      </div>

      <div className="font-mono text-xs text-white/60">
        {fmtTime(snapshot?.position_seconds ?? 0)} /{" "}
        {fmtTime(snapshot?.duration_seconds ?? 0)}
      </div>

      <div className="flex gap-2 mt-auto">
        <button
          className="flex-1 px-3 py-1.5 rounded bg-[#c8302e] hover:bg-[#a02220] text-sm disabled:opacity-40"
          disabled={!loaded}
          onClick={() =>
            playing ? ipc.deckPause(deckId) : ipc.deckPlay(deckId)
          }
        >
          {playing ? "Pause" : "Play"}
        </button>
        <button
          className="px-3 py-1.5 rounded bg-[#22262c] hover:bg-[#2c3036] text-sm disabled:opacity-40"
          disabled={!loaded}
          onClick={() => ipc.deckCue(deckId)}
        >
          Cue
        </button>
      </div>
    </div>
  );
}
