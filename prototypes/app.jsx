// Main app: state, drag wiring, settings modal, demo states, tweaks panel.

const { useState: useStateA, useMemo: useMemoA, useEffect: useEffectA, useRef: useRefA } = React;

const DEFAULT_SETTINGS = {
  criteria: { bpm: true, key: true, genre: true, tags: true, artist: true, year: true, energy: true },
  strictness: 0.5,
  bpmTolDown: 4,
  bpmTolUp: 6,
  perPage: 7,
};

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "accent": "red",
  "nodeDensity": "default",
  "labelVerbosity": "default",
  "graphVariant": "radial"
}/*EDITMODE-END*/;

const ACCENTS = {
  red:    { stroke: "#9b1f1d", fill: "#c8302e", soft: "rgba(200,48,46,0.10)" },
  ink:    { stroke: "#1a1a1a", fill: "#2a2a2a", soft: "rgba(26,26,26,0.10)" },
  cobalt: { stroke: "#1d3a8a", fill: "#2a52be", soft: "rgba(42,82,190,0.10)" },
  ochre:  { stroke: "#8a5a14", fill: "#b88122", soft: "rgba(184,129,34,0.12)" },
};

function summarizeSettings(s, suggestionsCount, defaults) {
  const total = Object.values(s.criteria).filter(Boolean).length;
  const strict = s.strictness < 0.34 ? "Loose" : s.strictness > 0.66 ? "Strict" : "Mid";
  const lo = Math.round((defaults.bpm || 124) * (1 - s.bpmTolDown / 100));
  const hi = Math.round((defaults.bpm || 124) * (1 + s.bpmTolUp / 100));
  const keyPart = s.criteria.key && defaults.key ? `Key ${defaults.key} · ` : "";
  return `Range ${lo}–${hi} BPM · ${keyPart}${total} of 7 criteria · ${strict}`;
}

// ─── Settings modal ─────────────────────────────────────────────
function SettingsModal({ open, settings, setSettings, onClose, focusStrictness }) {
  const strictRef = useRefA(null);
  useEffectA(() => {
    if (open && focusStrictness && strictRef.current) {
      setTimeout(() => strictRef.current.focus(), 80);
    }
  }, [open, focusStrictness]);

  if (!open) return null;
  const c = settings.criteria;
  const setC = (k, v) => setSettings({ ...settings, criteria: { ...c, [k]: v } });
  const labels = {
    bpm: "BPM", key: "Musical key", genre: "Genre", tags: "Tags",
    artist: "Artist", year: "Year / era", energy: "Energy level",
  };
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <SketchBox className="modal-box">
          <div className="modal-head">
            <div className="hand big">Suggestion settings</div>
            <button className="ghost-btn hand" onClick={onClose}>close ×</button>
          </div>
          <div className="modal-section">
            <div className="hand muted small">criteria — toggle off to ignore</div>
            <div className="crit-grid">
              {Object.keys(labels).map(k => (
                <label key={k} className="crit-row hand">
                  <input type="checkbox" checked={c[k]} onChange={(e) => setC(k, e.target.checked)}/>
                  <span>{labels[k]}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="modal-section">
            <div className="hand muted small">strictness</div>
            <div className="slider-row">
              <span className="hand muted small">loose</span>
              <input ref={strictRef} className={`slider ${focusStrictness ? "focus-flash" : ""}`}
                type="range" min="0" max="1" step="0.01"
                value={settings.strictness}
                onChange={(e) => setSettings({ ...settings, strictness: parseFloat(e.target.value) })}/>
              <span className="hand muted small">strict</span>
            </div>
          </div>
          <div className="modal-section">
            <div className="hand muted small">BPM tolerance — asymmetric</div>
            <div className="num-grid">
              <label className="num-row hand">
                slow down up to
                <input type="number" min="0" max="20" value={settings.bpmTolDown}
                  onChange={(e) => setSettings({ ...settings, bpmTolDown: +e.target.value })}/>
                %
              </label>
              <label className="num-row hand">
                speed up up to
                <input type="number" min="0" max="20" value={settings.bpmTolUp}
                  onChange={(e) => setSettings({ ...settings, bpmTolUp: +e.target.value })}/>
                %
              </label>
            </div>
          </div>
          <div className="modal-section">
            <div className="hand muted small">suggestions per page</div>
            <input type="number" min="5" max="12" value={settings.perPage}
              onChange={(e) => setSettings({ ...settings, perPage: Math.max(5, Math.min(12, +e.target.value)) })}/>
          </div>
          <div className="modal-foot hand muted small">
            changes apply immediately — close when done
          </div>
        </SketchBox>
      </div>
    </div>
  );
}

// ─── Demo states pill row ───────────────────────────────────────
function DemoPills({ value, onChange }) {
  const items = [
    { id: "happy",   label: "Happy" },
    { id: "cold",    label: "Cold start" },
    { id: "sparse",  label: "Sparse metadata" },
    { id: "noresults", label: "Strict / no results" },
  ];
  return (
    <div className="demo-pills">
      <div className="demo-pills-label hand small">
        <span className="demo-marker">⌘</span> demo states — prototype only
      </div>
      <div className="demo-pills-row">
        {items.map(it => (
          <button key={it.id}
            className={`demo-pill hand ${value === it.id ? "on" : ""}`}
            onClick={() => onChange(it.id)}>{it.label}</button>
        ))}
      </div>
    </div>
  );
}

// ─── Main App ──────────────────────────────────────────────────
function App() {
  const [tweaks, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const accent = ACCENTS[tweaks.accent] || ACCENTS.red;

  const [demo, setDemo] = useStateA("happy");

  // Derived demo state inputs
  const initialFor = (d) => {
    if (d === "cold") return {
      decks: { A: null, B: null },
      live: null,
      queue: [],
      anchorRef: null,
      graphCollapsed: true,
      settings: DEFAULT_SETTINGS,
    };
    if (d === "sparse") {
      // anchor with missing key/tags
      const sparseAnchor = { ...ANCHOR_TRACK, id: "t-sparse", key: null, tags: [] };
      return {
        decks: { A: sparseAnchor, B: DECK_B_DEFAULT },
        live: "A",
        queue: [LIBRARY[3], LIBRARY[7]],
        anchorRef: { kind: "deck", side: "A" },
        graphCollapsed: false,
        sparseAnchor,
        settings: DEFAULT_SETTINGS,
      };
    }
    if (d === "noresults") return {
      decks: { A: ANCHOR_TRACK, B: DECK_B_DEFAULT },
      live: "A",
      queue: [LIBRARY[3]],
      anchorRef: { kind: "deck", side: "A" },
      graphCollapsed: false,
      settings: { ...DEFAULT_SETTINGS, strictness: 0.95, bpmTolDown: 0.5, bpmTolUp: 0.5 },
    };
    // happy (default)
    return {
      decks: { A: ANCHOR_TRACK, B: DECK_B_DEFAULT },
      live: "A",
      queue: [LIBRARY[3], LIBRARY[5], LIBRARY[8]],
      anchorRef: { kind: "deck", side: "A" },
      graphCollapsed: false,
      settings: DEFAULT_SETTINGS,
    };
  };

  // Apply demo state on change
  const [decks, setDecks] = useStateA(() => initialFor("happy").decks);
  const [live, setLive] = useStateA("A");
  const [queue, setQueue] = useStateA(() => initialFor("happy").queue);
  const [anchorRef, setAnchorRef] = useStateA({ kind: "deck", side: "A" });
  const [graphCollapsed, setGraphCollapsed] = useStateA(false);
  const [sparseAnchor, setSparseAnchor] = useStateA(null);
  const [settings, setSettings] = useStateA(DEFAULT_SETTINGS);
  const [page, setPage] = useStateA(1);
  const [settingsOpen, setSettingsOpen] = useStateA(false);
  const [focusStrictness, setFocusStrictness] = useStateA(false);

  useEffectA(() => {
    const s = initialFor(demo);
    setDecks(s.decks);
    setLive(s.live);
    setQueue(s.queue);
    setAnchorRef(s.anchorRef);
    setGraphCollapsed(s.graphCollapsed);
    setSparseAnchor(s.sparseAnchor || null);
    setSettings(s.settings);
    setPage(1);
  }, [demo]);

  // Resolve anchor track from anchorRef
  const anchor = useMemoA(() => {
    if (!anchorRef) return null;
    if (anchorRef.kind === "deck") {
      const t = decks[anchorRef.side];
      if (anchorRef.side === "A" && demo === "sparse" && sparseAnchor) return sparseAnchor;
      return t;
    }
    if (anchorRef.kind === "track") {
      return LIBRARY.find(t => t.id === anchorRef.id) || null;
    }
    return null;
  }, [anchorRef, decks, demo, sparseAnchor]);

  // Compute suggestions
  const allSuggestions = useMemoA(() => {
    if (!anchor) return [];
    return getSuggestions(anchor, settings);
  }, [anchor, settings]);

  const perPage = settings.perPage;
  const totalPages = Math.max(1, Math.ceil(allSuggestions.length / perPage));
  const safePage = Math.min(page, totalPages);
  const pageSuggestions = allSuggestions.slice((safePage - 1) * perPage, safePage * perPage);

  // ── Anchor change handlers (auto-expand graph) ──
  const setAnchor = (ref) => {
    setAnchorRef(ref);
    setPage(1);
    setGraphCollapsed(false);
  };
  const anchorDeck = (side) => decks[side] && setAnchor({ kind: "deck", side });
  const anchorTrack = (id) => setAnchor({ kind: "track", id });

  // ── Drag/drop handlers ──
  const loadDeck = (side, trackId, fromQueue = false) => {
    const t = (LIBRARY.find(x => x.id === trackId)) || queue.find(x => x.id === trackId);
    if (!t) return;
    setDecks(d => ({ ...d, [side]: t }));
    if (fromQueue) setQueue(q => q.filter(x => x.id !== trackId));
    // also set live if previously empty
    setLive(l => l || side);
  };
  const addQueue = (trackId) => {
    const t = LIBRARY.find(x => x.id === trackId);
    if (!t) return;
    setQueue(q => q.find(x => x.id === t.id) ? q : [...q, t]);
  };
  const removeQueue = (id) => setQueue(q => q.filter(x => x.id !== id));
  const reorderQueue = (from, to) => setQueue(q => {
    const next = [...q];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    return next;
  });

  // ── Graph drop target (anchor by drop) ──
  const onGraphDrop = (e) => {
    e.preventDefault();
    const tid = e.dataTransfer.getData("text/track-id");
    if (tid) anchorTrack(tid);
  };

  // ── Settings summary ──
  const settingsSummary = anchor
    ? summarizeSettings(settings, pageSuggestions.length, anchor)
    : "No anchor — pick a deck or track";

  // ── Density classes ──
  const densityClass = `density-${tweaks.nodeDensity || "default"}`;
  const verbosity = tweaks.labelVerbosity || "default";

  return (
    <div className={`app accent-${tweaks.accent} ${densityClass}`}
      style={{
        "--accent": accent.fill,
        "--accent-stroke": accent.stroke,
        "--accent-soft": accent.soft,
      }}>
      {/* Header strip */}
      <div className="app-head">
        <div className="brand hand">
          <span className="brand-mark">◐</span>
          <span className="brand-name">spidj</span>
          <span className="brand-tag muted small">/ graph view wireframes</span>
        </div>
        <DemoPills value={demo} onChange={setDemo}/>
      </div>

      {/* Three side-by-side variant frames */}
      <div className="variants-row">
        {["radial","cluster","orbit"].map(variant => (
          <VariantFrame key={variant}
            variant={variant}
            title={variant === "radial" ? "v1 · radial" : variant === "cluster" ? "v2 · force cluster" : "v3 · orbit by criterion"}
            description={
              variant === "radial" ? "even ring around the anchor — predictable, scannable"
              : variant === "cluster" ? "loose force-ish jitter — feels organic, less structured"
              : "concentric rings grouped by primary reason — explains the why"
            }
            decks={decks}
            live={live}
            anchorRef={anchorRef}
            queue={queue}
            anchor={anchor}
            graphCollapsed={graphCollapsed}
            setGraphCollapsed={setGraphCollapsed}
            pageSuggestions={pageSuggestions}
            page={safePage}
            totalPages={totalPages}
            settingsSummary={settingsSummary}
            verbosity={verbosity}
            allSuggestionsCount={allSuggestions.length}
            demo={demo}
            settings={settings}
            onAnchorDeck={anchorDeck}
            onAnchorTrack={anchorTrack}
            onLoadDeck={loadDeck}
            onAddQueue={addQueue}
            onRemoveQueue={removeQueue}
            onReorderQueue={reorderQueue}
            onPrev={() => setPage(p => Math.max(1, p - 1))}
            onNext={() => setPage(p => Math.min(totalPages, p + 1))}
            onOpenSettings={(focus) => { setSettingsOpen(true); setFocusStrictness(!!focus); }}
            onGraphDrop={onGraphDrop}
          />
        ))}
      </div>

      {/* Library — shared, since wireframes share state */}
      <div className="library-wrap">
        <SketchBox className="library-frame">
          <Library
            onLoadDeck={loadDeck}
            onAddQueue={addQueue}
            onAnchor={anchorTrack}
          />
        </SketchBox>
      </div>

      <SettingsModal
        open={settingsOpen}
        settings={settings}
        setSettings={setSettings}
        focusStrictness={focusStrictness}
        onClose={() => { setSettingsOpen(false); setFocusStrictness(false); }}
      />

      <TweaksPanel title="Tweaks">
        <TweakSection title="Accent">
          <TweakRadio
            value={tweaks.accent}
            onChange={(v) => setTweak("accent", v)}
            options={[
              { value: "red", label: "Red" },
              { value: "ink", label: "Ink" },
              { value: "cobalt", label: "Cobalt" },
              { value: "ochre", label: "Ochre" },
            ]}
          />
        </TweakSection>
        <TweakSection title="Node density">
          <TweakRadio
            value={tweaks.nodeDensity}
            onChange={(v) => setTweak("nodeDensity", v)}
            options={[
              { value: "compact", label: "Compact" },
              { value: "default", label: "Default" },
              { value: "spacious", label: "Spacious" },
            ]}
          />
        </TweakSection>
        <TweakSection title="Label verbosity">
          <TweakRadio
            value={tweaks.labelVerbosity}
            onChange={(v) => setTweak("labelVerbosity", v)}
            options={[
              { value: "minimal", label: "Minimal" },
              { value: "default", label: "Default" },
              { value: "verbose", label: "Verbose" },
            ]}
          />
        </TweakSection>
      </TweaksPanel>
    </div>
  );
}

// ─── One full DJ frame (decks + graph + queue) per layout variant ───
function VariantFrame({
  variant, title, description,
  decks, live, anchorRef, queue, anchor,
  graphCollapsed, setGraphCollapsed, pageSuggestions, page, totalPages,
  settingsSummary, verbosity, allSuggestionsCount, demo, settings,
  onAnchorDeck, onAnchorTrack, onLoadDeck, onAddQueue, onRemoveQueue, onReorderQueue,
  onPrev, onNext, onOpenSettings, onGraphDrop,
}) {
  const [over, setOver] = useStateA(false);
  const isAnchorDeckSrc = (side) => anchorRef?.kind === "deck" && anchorRef.side === side;

  const emptyState = demo === "noresults" ? "no-results" : null;

  return (
    <div className="variant-frame">
      <div className="variant-head">
        <div className="hand big variant-title">{title}</div>
        <div className="hand muted small variant-desc">{description}</div>
      </div>

      <SketchBox className="frame-shell">
        <div className="frame-inner">
          {/* Deck stack (left) */}
          <div className="frame-decks">
            <Deck side="A" track={decks.A} live={live === "A"}
              isAnchorSource={isAnchorDeckSrc("A")}
              onClick={() => onAnchorDeck("A")}
              onDropTrack={(id) => onLoadDeck("A", id)}/>
            <Deck side="B" track={decks.B} live={live === "B"}
              isAnchorSource={isAnchorDeckSrc("B")}
              onClick={() => onAnchorDeck("B")}
              onDropTrack={(id) => onLoadDeck("B", id)}/>
          </div>

          {/* Main column: tab strip + graph */}
          <div className="frame-main">
            <TabStrip/>
            <div className="mid-band">
              <div className={`graph-area ${graphCollapsed ? "collapsed" : "expanded"} ${over ? "drop-over" : ""}`}
                onDragOver={(e) => { e.preventDefault(); setOver(true); }}
                onDragLeave={() => setOver(false)}
                onDrop={(e) => { setOver(false); onGraphDrop(e); }}
              >
                {graphCollapsed ? (
                  <button className="show-suggestions hand"
                    onClick={() => setGraphCollapsed(false)}>
                    <span className="ss-mark">⌖</span>
                    <span>Show suggestions</span>
                    <span className="hand muted small ss-sub">
                      {demo === "cold" ? "load a track or drag from your library to begin" : "or drag a track here to anchor"}
                    </span>
                  </button>
                ) : (
                  <GraphCanvas
                    variant={variant}
                    anchor={anchor}
                    suggestions={pageSuggestions}
                    page={page}
                    totalPages={totalPages}
                    labelVerbosity={verbosity}
                    emptyState={emptyState}
                    settingsSummary={settingsSummary}
                    onAnchor={onAnchorTrack}
                    onPrev={onPrev}
                    onNext={onNext}
                    onOpenSettings={onOpenSettings}
                  />
                )}
                {!graphCollapsed && (
                  <button className="collapse-handle hand muted small"
                    onClick={() => setGraphCollapsed(true)} title="collapse graph">
                    ⌃ collapse
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Queue strip (right) */}
          <QueueStrip
            queue={queue}
            anchorId={anchorRef?.kind === "track" ? anchorRef.id : null}
            onAnchor={onAnchorTrack}
            onRemove={onRemoveQueue}
            onLoadDeck={onLoadDeck}
            onReorder={onReorderQueue}
            onDropTrack={(id) => onAddQueue(id)}
          />
        </div>
      </SketchBox>
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App/>);
