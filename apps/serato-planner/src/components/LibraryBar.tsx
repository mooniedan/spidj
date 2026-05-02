import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { ipc } from "../ipc/tauri";
import type { LibrarySummary } from "../types";

interface Props {
  summary: LibrarySummary | null;
  onLoaded: (s: LibrarySummary) => void;
}

const DEFAULT_FOLDER = "C:\\Users\\mooni\\Music\\_Serato_";

export function LibraryBar({ summary, onLoaded }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = async () => {
    setError(null);
    const folder = await open({
      directory: true,
      multiple: false,
      defaultPath: DEFAULT_FOLDER,
    });
    if (typeof folder !== "string") return;
    setBusy(true);
    try {
      const s = await ipc.libraryOpen(folder);
      onLoaded(s);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-[#1a1d22] border-b border-white/5 px-4 py-2">
      <div className="flex items-center gap-3 text-sm">
        <button
          className="px-3 py-1 rounded bg-[#22262c] hover:bg-[#2c3036] text-white"
          onClick={pick}
          disabled={busy}
        >
          {busy ? "Loading…" : "Choose Serato folder"}
        </button>
        <span className="text-xs text-white/50 truncate flex-1">
          {summary?.folder ?? "(no folder selected)"}
        </span>
        <span className="text-xs text-white/50 font-mono">
          {summary ? `${summary.trackCount} tracks` : "—"}
        </span>
      </div>
      {error && <div className="text-xs text-[#c8302e] mt-1">{error}</div>}
    </div>
  );
}
