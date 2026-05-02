import { useCallback, useEffect, useState } from "react";
import { CratesSidebar } from "./components/CratesSidebar";
import { GraphCanvas } from "./components/GraphCanvas";
import { LibraryBar } from "./components/LibraryBar";
import { LibraryList } from "./components/LibraryList";
import { Settings } from "./components/Settings";
import { WorkingCrate } from "./components/WorkingCrate";
import { ipc } from "./ipc/tauri";
import type {
  CrateSummary,
  LibrarySummary,
  Suggestion,
  SuggestionConfig,
  Track,
} from "./types";
import { DEFAULT_CONFIG } from "./types";

export default function App() {
  const [library, setLibrary] = useState<LibrarySummary | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [crates, setCrates] = useState<CrateSummary[]>([]);

  const [activeCrate, setActiveCrate] = useState<string | null>(null);
  const [crate, setCrate] = useState<Track[]>([]);

  const [anchor, setAnchor] = useState<Track | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [config, setConfig] = useState<SuggestionConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(false);

  // Refresh suggestions whenever anchor/config change.
  useEffect(() => {
    if (!anchor) {
      setSuggestions([]);
      return;
    }
    const shown = crate.map((t) => t.id);
    setLoading(true);
    let cancelled = false;
    ipc
      .engineSuggest(anchor.id, config, shown)
      .then((r) => {
        if (!cancelled) setSuggestions(r.suggestions);
      })
      .catch(() => {
        if (!cancelled) setSuggestions([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchor, config]);

  const loadEverything = useCallback(async () => {
    const [t, c] = await Promise.all([ipc.libraryAllTracks(), ipc.crateList()]);
    setTracks(t);
    setCrates(c);
  }, []);

  const onLibraryLoaded = async (s: LibrarySummary) => {
    setLibrary(s);
    setActiveCrate(null);
    setCrate([]);
    setAnchor(null);
    await loadEverything();
  };

  const refreshCrates = useCallback(async () => {
    try {
      setCrates(await ipc.crateList());
    } catch {
      /* noop */
    }
  }, []);

  const onAnchorTrack = (t: Track) => {
    setAnchor(t);
    // Per the user's request: anchoring also seeds the new crate's first
    // track, but only when starting fresh (not editing an existing crate).
    if (activeCrate === null && crate.length === 0) {
      setCrate([t]);
    }
  };

  const onLeafClick = (s: Suggestion) => {
    setCrate((prev) =>
      prev.some((t) => t.id === s.track.id) ? prev : [...prev, s.track],
    );
    setAnchor(s.track);
  };

  const onDoubleClickAdd = (t: Track) => {
    setCrate((prev) =>
      prev.some((x) => x.id === t.id) ? prev : [...prev, t],
    );
  };

  const onSelectCrate = async (name: string) => {
    setActiveCrate(name);
    try {
      const loaded = await ipc.crateLoad(name);
      setCrate(loaded);
      // Anchor on the last track so suggestions follow the end of the set.
      setAnchor(loaded[loaded.length - 1] ?? null);
    } catch (e) {
      console.error("crate_load failed", e);
    }
  };

  const onNewCrate = () => {
    setActiveCrate(null);
    setCrate([]);
    setAnchor(null);
  };

  const onCrateSaved = async (savedName: string) => {
    await refreshCrates();
    setActiveCrate(savedName);
  };

  return (
    <div className="h-full flex flex-col bg-[#0a0a0a] text-white">
      <LibraryBar summary={library} onLoaded={onLibraryLoaded} />
      <Settings config={config} onChange={setConfig} />
      <div className="flex-1 flex flex-col min-h-0">
        {/* TOP — crates | graph | working crate. Fixed 55% of available
            height; doesn't scroll out. Each child pane handles its own
            overflow via inner overflow-auto regions. */}
        <div className="flex basis-[55%] shrink-0 grow-0 min-h-0">
          <div className="flex flex-col min-h-0">
            <CratesSidebar
              crates={crates}
              activeCrate={activeCrate}
              onSelect={onSelectCrate}
              onNew={onNewCrate}
            />
          </div>
          <div className="flex-1 min-w-0 flex flex-col bg-[#0a0a0a] min-h-0">
            <div className="px-3 py-1.5 border-b border-white/5 text-xs text-white/60 uppercase tracking-widest shrink-0">
              Suggestions {anchor ? "" : "— pick a starting track from the library below"}
            </div>
            <GraphCanvas
              anchor={anchor}
              suggestions={suggestions}
              onLeafClick={onLeafClick}
              loading={loading}
            />
          </div>
          <div className="w-[24rem] flex flex-col min-h-0">
            <WorkingCrate
              tracks={crate}
              initialName={activeCrate ?? ""}
              onTracksChange={setCrate}
              onAnchorAt={(i) => setAnchor(crate[i] ?? null)}
              onSaved={onCrateSaved}
              isEditingExisting={activeCrate !== null}
            />
          </div>
        </div>
        {/* BOTTOM — full-width library, takes remaining height. */}
        <div className="flex-1 min-h-0 border-t border-white/5 flex flex-col">
          <LibraryList
            tracks={tracks}
            anchorId={anchor?.id ?? null}
            onAnchor={onAnchorTrack}
            onAdd={onDoubleClickAdd}
          />
        </div>
      </div>
    </div>
  );
}
