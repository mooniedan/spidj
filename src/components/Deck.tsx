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

const fmtPitch = (p: number) => {
  const sign = p >= 0 ? "+" : "";
  return `${sign}${p.toFixed(2)}%`;
};

export function Deck({ deckId, snapshot }: Props) {
  const loaded = snapshot?.loaded_path != null;
  const playing = snapshot?.playing ?? false;
  const cueActive = snapshot?.cue_active ?? false;
  const duration = snapshot?.duration_seconds ?? 0;
  const position = snapshot?.position_seconds ?? 0;
  const cuePosition = snapshot?.cue_position_seconds ?? 0;

  const ringStyle: React.CSSProperties = playing
    ? {
        boxShadow:
          "0 0 0 1px rgba(200,48,46,0.7), 0 0 24px 4px rgba(200,48,46,0.35)",
      }
    : {};

  const posPct = duration > 0 ? Math.min(100, (position / duration) * 100) : 0;
  const cuePct = duration > 0 ? Math.min(100, (cuePosition / duration) * 100) : 0;

  // On press of on-screen Cue we mimic the controller's press+release in one
  // click. M2 controller behavior is press-and-hold for preview; the on-screen
  // button only does press+immediate-release (no preview). M3 can add a
  // hold-on-mousedown variant.
  const handleScreenCue = async () => {
    await ipc.deckCuePress(deckId);
    await ipc.deckCueRelease(deckId);
  };

  return (
    <div
      className="flex-1 bg-[#1a1d22] rounded-lg p-4 flex flex-col gap-3"
      style={ringStyle}
    >
      <div className="flex items-center justify-between">
        <div className="text-xs text-white/60 uppercase tracking-widest">
          Deck {deckId}
        </div>
        <div className="flex gap-1">
          {cueActive && (
            <span
              className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#22262c] text-white/80"
              title="Headphone cue active"
            >
              🎧 CUE
            </span>
          )}
          {playing && (
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#c8302e] text-white">
              LIVE
            </span>
          )}
        </div>
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

      {/* Position bar with cue marker */}
      <div className="relative h-1.5 bg-[#0a0a0a] rounded">
        <div
          className="absolute inset-y-0 left-0 bg-white/30 rounded-l"
          style={{ width: `${posPct}%` }}
        />
        {loaded && (
          <div
            className="absolute inset-y-0 w-0.5 bg-[#c8302e]"
            style={{ left: `${cuePct}%` }}
            title={`Cue: ${fmtTime(cuePosition)}`}
          />
        )}
      </div>

      <div className="flex items-center justify-between font-mono text-xs text-white/60">
        <span>
          {fmtTime(position)} / {fmtTime(duration)}
        </span>
        <span title="Pitch fader">
          {fmtPitch(snapshot?.pitch_percent ?? 0)}
        </span>
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
          onClick={handleScreenCue}
        >
          Cue
        </button>
        <button
          className={
            "px-3 py-1.5 rounded text-sm disabled:opacity-40 " +
            (cueActive
              ? "bg-[#c8302e] hover:bg-[#a02220]"
              : "bg-[#22262c] hover:bg-[#2c3036]")
          }
          disabled={!loaded}
          onClick={() => ipc.deckToggleCueActive(deckId)}
          title="Headphone cue toggle"
        >
          🎧
        </button>
      </div>
    </div>
  );
}
