import { useEffect, useState } from "react";
import { ipc } from "../ipc/tauri";
import type { Track } from "../types";

interface Props {
  tracks: Track[];
  initialName: string;
  onTracksChange: (next: Track[]) => void;
  onAnchorAt: (idx: number) => void;
  onSaved: (name: string) => void;
  isEditingExisting: boolean;
}

export function WorkingCrate({
  tracks,
  initialName,
  onTracksChange,
  onAnchorAt,
  onSaved,
  isEditingExisting,
}: Props) {
  const [name, setName] = useState(initialName);
  const [busy, setBusy] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Reset the input when the parent switches to a different crate. Don't
  // touch it on other rerenders — the user is typing.
  useEffect(() => {
    setName(initialName);
  }, [initialName]);

  const remove = (i: number) => {
    onTracksChange(tracks.filter((_, idx) => idx !== i));
  };

  const reorder = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0 || from >= tracks.length || to >= tracks.length) return;
    const next = tracks.slice();
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onTracksChange(next);
  };

  const onDragStart = (i: number) => (e: React.DragEvent) => {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/x-crate-idx", String(i));
  };
  const onDragOver = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes("text/x-crate-idx")) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
    }
  };
  const onDrop = (toIdx: number) => (e: React.DragEvent) => {
    e.preventDefault();
    const raw = e.dataTransfer.getData("text/x-crate-idx");
    if (!raw) return;
    const fromIdx = Number(raw);
    if (Number.isFinite(fromIdx)) reorder(fromIdx, toIdx);
  };

  const save = async () => {
    setError(null);
    setSavedAt(null);
    if (!name.trim()) {
      setError("Crate name is required.");
      return;
    }
    if (tracks.length === 0) {
      setError("Working crate is empty.");
      return;
    }
    setBusy(true);
    try {
      const path = await ipc.crateWrite(
        name.trim(),
        tracks.map((t) => t.id),
        isEditingExisting,
      );
      setSavedAt(path);
      onSaved(name.trim());
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="w-full flex flex-col bg-[#1a1d22] border-l border-white/5 min-h-0">
      <div className="px-3 py-2 border-b border-white/5 flex items-center justify-between">
        <span className="text-xs text-white/60 uppercase tracking-widest">
          {isEditingExisting ? `Editing: ${initialName}` : "New crate"}
        </span>
        <span className="text-xs text-white/50 font-mono">{tracks.length}</span>
      </div>
      <div
        className="flex-1 overflow-auto"
        onDragOver={onDragOver}
        onDrop={onDrop(tracks.length)}
      >
        {tracks.length === 0 ? (
          <div className="text-white/40 text-sm p-3">
            Click a library track to anchor; click suggestions in the graph
            to add to this crate.
          </div>
        ) : (
          <ol>
            {tracks.map((t, i) => (
              <li
                key={`${t.id}-${i}`}
                draggable
                onDragStart={onDragStart(i)}
                onDragOver={onDragOver}
                onDrop={onDrop(i)}
                className="px-3 py-2 border-b border-white/5 hover:bg-white/[0.03] group cursor-grab active:cursor-grabbing"
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs text-white/40 font-mono w-6 shrink-0">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm truncate">{t.title}</div>
                    <div className="text-xs text-white/60 truncate">
                      {t.artist || "—"}
                      {t.bpm > 0 ? ` · ${t.bpm.toFixed(0)}` : ""}
                      {t.key ? ` · ${t.key}` : ""}
                    </div>
                  </div>
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                    <button
                      className="text-[10px] text-white/60 hover:text-[#c8302e] px-1"
                      onClick={() => onAnchorAt(i)}
                      title="Re-anchor on this track"
                    >
                      ⌖
                    </button>
                    <button
                      className="text-[10px] text-white/60 hover:text-[#c8302e] px-1"
                      onClick={() => remove(i)}
                      title="Remove"
                    >
                      ×
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
      <div className="border-t border-white/5 p-3 space-y-2">
        <input
          className="w-full bg-[#22262c] border border-white/10 rounded px-2 py-1 text-sm outline-none focus:border-[#c8302e]"
          placeholder="Crate name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button
          className="w-full px-3 py-1.5 rounded bg-[#c8302e] hover:bg-[#a02220] text-white text-sm disabled:opacity-50"
          onClick={save}
          disabled={busy || tracks.length === 0 || !name.trim()}
        >
          {busy
            ? "Saving…"
            : isEditingExisting
              ? "Save changes"
              : "Save crate to Serato"}
        </button>
        {error && <div className="text-xs text-[#c8302e]">{error}</div>}
        {savedAt && (
          <div className="text-xs text-white/60 truncate">
            Saved → {savedAt}
          </div>
        )}
      </div>
    </div>
  );
}
