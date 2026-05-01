import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { ipc } from "../ipc/tauri";
import type { DeckId, TrackEntry } from "../types";

interface Props {
  onLoad: (deckId: DeckId, path: string) => void;
}

const fmtDur = (s: number | null) => {
  if (s == null) return "—";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60).toString().padStart(2, "0");
  return `${m}:${sec}`;
};

export function Library({ onLoad }: Props) {
  const [tracks, setTracks] = useState<TrackEntry[]>([]);
  const [folder, setFolder] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const pickFolder = async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      defaultPath: "C:\\Users\\mooni\\Music\\SPIDJ",
    });
    if (typeof selected !== "string") return;
    setFolder(selected);
    setBusy(true);
    try {
      const result = await ipc.libraryScan(selected);
      setTracks(result);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#1a1d22] border-t border-white/5">
      <div className="flex items-center gap-3 px-4 py-2 border-b border-white/5">
        <button
          className="px-3 py-1 rounded bg-[#22262c] hover:bg-[#2c3036] text-white text-sm"
          onClick={pickFolder}
          disabled={busy}
        >
          Choose folder
        </button>
        <span className="text-xs text-white/50 truncate">
          {folder ?? "(no folder selected)"}
        </span>
        <span className="text-xs text-white/50 ml-auto">
          {tracks.length} track{tracks.length === 1 ? "" : "s"}
        </span>
      </div>
      <div className="flex-1 overflow-auto">
        {tracks.length === 0 ? (
          <div className="text-white/40 text-sm p-4">
            {busy ? "scanning…" : "Pick a folder containing audio files."}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-[#1a1d22] text-white/50 text-xs">
              <tr>
                <th className="text-left px-3 py-1.5 font-normal">Title</th>
                <th className="text-left px-3 py-1.5 font-normal">Artist</th>
                <th className="text-right px-3 py-1.5 font-normal font-mono">
                  Time
                </th>
                <th className="text-right px-3 py-1.5 font-normal w-44"></th>
              </tr>
            </thead>
            <tbody>
              {tracks.map((t) => (
                <tr key={t.path} className="hover:bg-white/[0.03]">
                  <td className="px-3 py-1.5 truncate max-w-[24rem]">
                    {t.title ?? t.filename}
                  </td>
                  <td className="px-3 py-1.5 text-white/70 truncate max-w-[16rem]">
                    {t.artist ?? "—"}
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono text-white/70">
                    {fmtDur(t.duration_seconds)}
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    <button
                      className="px-2 py-0.5 rounded bg-[#22262c] hover:bg-[#c8302e] text-xs mr-1"
                      onClick={() => onLoad("A", t.path)}
                    >
                      Load A
                    </button>
                    <button
                      className="px-2 py-0.5 rounded bg-[#22262c] hover:bg-[#c8302e] text-xs"
                      onClick={() => onLoad("B", t.path)}
                    >
                      Load B
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
