import { useMemo, useState } from "react";
import type { Track } from "../types";

interface Props {
  tracks: Track[];
  anchorId: string | null;
  onAnchor: (track: Track) => void;
  onAdd: (track: Track) => void;
}

type SortKey = "title" | "artist" | "bpm" | "key" | "year";

export function LibraryList({ tracks, anchorId, onAnchor, onAdd }: Props) {
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState<SortKey>("title");
  const [asc, setAsc] = useState(true);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    let out = tracks;
    if (q) {
      out = out.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.artist.toLowerCase().includes(q) ||
          t.genre.toLowerCase().includes(q),
      );
    }
    out = [...out].sort((a, b) => {
      const cmp = compareTracks(a, b, sort);
      return asc ? cmp : -cmp;
    });
    return out;
  }, [tracks, filter, sort, asc]);

  const setSortKey = (k: SortKey) => {
    if (sort === k) setAsc(!asc);
    else {
      setSort(k);
      setAsc(true);
    }
  };

  const headerCell = (k: SortKey, label: string, extraClass = "") => (
    <button
      className={
        "px-3 py-1.5 text-left text-xs text-white/50 hover:text-white/80 select-none " +
        extraClass
      }
      onClick={() => setSortKey(k)}
    >
      {label}
      {sort === k ? (asc ? " ▲" : " ▼") : ""}
    </button>
  );

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-[#0a0a0a]">
      <div className="border-b border-white/5 p-2">
        <input
          className="w-full bg-[#1a1d22] border border-white/10 rounded px-3 py-1.5 text-sm outline-none focus:border-[#c8302e]"
          placeholder="Filter library by title, artist, or genre…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>
      <div className="grid grid-cols-[1fr_1fr_4rem_3rem_4rem_1fr] sticky top-0 bg-[#1a1d22] border-b border-white/5">
        {headerCell("title", "Title")}
        {headerCell("artist", "Artist")}
        {headerCell("bpm", "BPM", "text-right")}
        {headerCell("key", "Key", "text-center")}
        {headerCell("year", "Year", "text-right")}
        <div className="px-3 py-1.5 text-xs text-white/50">Genre</div>
      </div>
      <div className="flex-1 overflow-auto">
        {filtered.length === 0 ? (
          <div className="text-white/40 text-sm p-4">
            {tracks.length === 0
              ? "Choose a Serato folder to load tracks."
              : "No matches."}
          </div>
        ) : (
          filtered.map((t) => {
            const isAnchor = anchorId === t.id;
            return (
              <div
                key={t.id}
                className={
                  "grid grid-cols-[1fr_1fr_4rem_3rem_4rem_1fr] text-sm border-b border-white/5 cursor-pointer group " +
                  (isAnchor
                    ? "bg-[#1f2126]"
                    : "hover:bg-white/[0.03]")
                }
                onClick={() => onAnchor(t)}
                onDoubleClick={() => onAdd(t)}
                title="Click to anchor; double-click to add to working crate"
              >
                <div className="px-3 py-1.5 truncate">{t.title}</div>
                <div className="px-3 py-1.5 text-white/70 truncate">
                  {t.artist}
                </div>
                <div className="px-3 py-1.5 text-right font-mono text-white/70">
                  {t.bpm > 0 ? t.bpm.toFixed(0) : "—"}
                </div>
                <div className="px-3 py-1.5 text-center font-mono text-white/70">
                  {t.key ?? "—"}
                </div>
                <div className="px-3 py-1.5 text-right font-mono text-white/70">
                  {t.year > 0 ? t.year : "—"}
                </div>
                <div className="px-3 py-1.5 text-white/60 truncate">
                  {t.genre || "—"}
                </div>
              </div>
            );
          })
        )}
      </div>
      <div className="border-t border-white/5 px-3 py-1 text-xs text-white/40">
        {filtered.length} of {tracks.length} · click to anchor · double-click to add
      </div>
    </div>
  );
}

function compareTracks(a: Track, b: Track, k: SortKey): number {
  switch (k) {
    case "title":
      return a.title.toLowerCase().localeCompare(b.title.toLowerCase());
    case "artist":
      return a.artist.toLowerCase().localeCompare(b.artist.toLowerCase());
    case "bpm":
      return a.bpm - b.bpm;
    case "key":
      return (a.key ?? "").localeCompare(b.key ?? "");
    case "year":
      return a.year - b.year;
  }
}
