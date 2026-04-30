// Chrome components: decks, library, queue, tab strip.
// Wireframe / sketchy aesthetic. b&w + accent.

const { useState, useRef, useEffect, useMemo } = React;

// ─────────────────────────────────────────────────────────────────
// Procedural album art — deterministic from track id.
// Returns a small SVG block with a colored field + monogram.
// ─────────────────────────────────────────────────────────────────
function hashStr(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
  return h >>> 0;
}
function ArtBlock({ track, size = 36 }) {
  if (!track) {
    return (
      <div className="art-empty" style={{ width: size, height: size }}>
        <svg viewBox="0 0 36 36" width={size} height={size}>
          <rect x="2" y="2" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 3" rx="2" />
          <line x1="2" y1="2" x2="34" y2="34" stroke="currentColor" strokeWidth="1" opacity="0.4"/>
        </svg>
      </div>
    );
  }
  const h = hashStr(track.id + track.title);
  const initials = (track.artist || "?")
    .split(" ").map(s => s[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
  // Three style variants picked from hash
  const variant = h % 3;
  const seedX = (h % 100) / 100;
  const seedY = ((h >> 8) % 100) / 100;
  return (
    <svg className="art-block" viewBox="0 0 36 36" width={size} height={size}>
      <rect x="0" y="0" width="36" height="36" fill="var(--paper-2)" />
      {variant === 0 && (
        <>
          <circle cx={10 + seedX * 16} cy={10 + seedY * 16} r="14" fill="var(--ink-2)" opacity="0.18" />
          <circle cx={20 + seedY * 8} cy={22 + seedX * 6} r="8" fill="var(--ink-1)" opacity="0.22" />
        </>
      )}
      {variant === 1 && (
        <>
          <rect x={2 + seedX * 8} y={4} width={16 + seedY * 10} height="3" fill="var(--ink-1)" opacity="0.3" />
          <rect x={4} y={14} width={28} height="2" fill="var(--ink-1)" opacity="0.2" />
          <rect x={2 + seedY * 6} y={22} width={20} height="3" fill="var(--ink-2)" opacity="0.28" />
          <rect x={6} y={30} width={16} height="2" fill="var(--ink-1)" opacity="0.18" />
        </>
      )}
      {variant === 2 && (
        <>
          <polygon points={`${4 + seedX * 8},32 18,${4 + seedY * 8} ${28 + seedX * 4},30`}
            fill="var(--ink-2)" opacity="0.22" />
          <polygon points="2,2 12,2 2,14" fill="var(--ink-1)" opacity="0.18" />
        </>
      )}
      <rect x="0" y="0" width="36" height="36" fill="none" stroke="var(--ink-1)" strokeWidth="0.8" opacity="0.6"/>
      <text x="18" y="22" textAnchor="middle" fontFamily="var(--font-hand)"
            fontSize="11" fill="var(--ink-1)" opacity="0.85" fontWeight="600">{initials}</text>
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────
// Sketchy box wrapper — hand-drawn-feeling border via SVG
// ─────────────────────────────────────────────────────────────────
function SketchBox({ children, className = "", style, accent = false, dashed = false, ...rest }) {
  return (
    <div className={`sketch-box ${className} ${accent ? "accent" : ""} ${dashed ? "dashed" : ""}`} style={style} {...rest}>
      <svg className="sketch-border" preserveAspectRatio="none">
        <rect x="2" y="2" width="calc(100% - 4px)" height="calc(100% - 4px)" />
      </svg>
      <div className="sketch-content">{children}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Waveform — sketchy zig-zag
// ─────────────────────────────────────────────────────────────────
function Waveform({ playing, seed = 1 }) {
  const bars = useMemo(() => {
    const r = mulberry32S(seed);
    return Array.from({ length: 64 }, () => 0.3 + r() * 0.7);
  }, [seed]);
  return (
    <div className="waveform">
      {bars.map((h, i) => (
        <div key={i} className="wf-bar" style={{ height: `${h * 100}%`, opacity: playing && i < 28 ? 1 : (i < 28 ? 0.5 : 0.35) }} />
      ))}
      <div className="wf-playhead" style={{ left: "44%" }} />
    </div>
  );
}
function mulberry32S(a) {
  return function() {
    let t = a += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// ─────────────────────────────────────────────────────────────────
// Deck — minimal: art (spinning when live), title, transport, waveform, tempo
// ─────────────────────────────────────────────────────────────────
function Deck({ side, track, live, isAnchorSource, onClick, onDropTrack }) {
  const [over, setOver] = useState(false);
  const onDrop = (e) => {
    e.preventDefault();
    setOver(false);
    const data = e.dataTransfer.getData("text/track-id");
    if (data && onDropTrack) onDropTrack(data);
  };
  return (
    <div className={`deck deck-${side} ${isAnchorSource ? "is-anchor-src" : ""} ${over ? "drop-over" : ""}`}
         onClick={() => track && onClick && onClick()}
         onDragOver={(e) => { e.preventDefault(); setOver(true); }}
         onDragLeave={() => setOver(false)}
         onDrop={onDrop}>
      <SketchBox className="deck-box">
        <div className="deck-head">
          <span className="deck-label">DECK {side}</span>
          {live && <span className="live-pill">● LIVE</span>}
          {!live && track && <span className="cued-pill">CUED</span>}
        </div>

        {!track ? (
          <div className="deck-empty">
            <svg viewBox="0 0 80 80" width="68" height="68">
              <circle cx="40" cy="40" r="34" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 4"/>
              <circle cx="40" cy="40" r="6" fill="none" stroke="currentColor" strokeWidth="1.5"/>
            </svg>
            <span className="hand muted">drop a track here</span>
          </div>
        ) : (
          <>
            <Waveform playing={live} seed={hashStr(track.id) % 10000} />
            <div className="deck-body">
              <div className={`platter ${live ? "spinning" : ""}`}>
                <ArtBlock track={track} size={68} />
                <svg className="platter-ring" viewBox="0 0 80 80">
                  <circle cx="40" cy="40" r="38" fill="none" stroke="currentColor" strokeWidth="1.2" />
                  <circle cx="40" cy="40" r="3" fill="currentColor"/>
                  <line x1="40" y1="40" x2="40" y2="6" stroke="currentColor" strokeWidth="1"/>
                </svg>
              </div>
              <div className="deck-meta">
                <div className="hand title">{track.title}</div>
                <div className="hand muted">{track.artist}</div>
                <div className="mono deck-numbers">
                  <span>{track.bpm.toFixed(1)} BPM</span>
                  <span className="dot">·</span>
                  <span>{track.key}</span>
                  <span className="dot">·</span>
                  <span>{track.genre}</span>
                </div>
                <div className="transport">
                  <button className="t-btn" title="cue">CUE</button>
                  <button className="t-btn primary" title="play/pause">{live ? "❚❚" : "▶"}</button>
                  <button className="t-btn" title="sync">SYNC</button>
                  <span className="pitch mono">PITCH 0.0%</span>
                </div>
              </div>
            </div>
          </>
        )}
      </SketchBox>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Tab strip
// ─────────────────────────────────────────────────────────────────
function TabStrip() {
  return (
    <div className="tab-strip">
      <div className="tab active hand">Graph</div>
      <div className="tab disabled hand">Browse</div>
      <div className="tab disabled hand">Crates</div>
      <div className="tab disabled hand">History</div>
      <div className="tab-spacer"/>
      <div className="tab-note hand muted">/ wireframe — graph view focus</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Library — search + filter pills + sortable list
// ─────────────────────────────────────────────────────────────────
function Library({ onLoadDeck, onAddQueue, onAnchor }) {
  const [q, setQ] = useState("");
  const [genreFilter, setGenreFilter] = useState(null);
  const [sortBy, setSortBy] = useState("artist");
  const filtered = useMemo(() => {
    let items = LIBRARY.filter(t => {
      if (genreFilter && t.genre !== genreFilter) return false;
      if (!q) return true;
      const s = q.toLowerCase();
      return t.title.toLowerCase().includes(s) || t.artist.toLowerCase().includes(s)
        || t.genre.toLowerCase().includes(s) || t.tags.some(tag => tag.includes(s));
    });
    items.sort((a, b) => {
      if (sortBy === "bpm") return a.bpm - b.bpm;
      if (sortBy === "key") return a.key.localeCompare(b.key);
      if (sortBy === "year") return b.year - a.year;
      return a.artist.localeCompare(b.artist);
    });
    return items;
  }, [q, genreFilter, sortBy]);

  return (
    <div className="library">
      <div className="library-head">
        <div className="search-row">
          <span className="hand muted">library</span>
          <input className="search hand" value={q} onChange={(e) => setQ(e.target.value)}
                 placeholder="search title, artist, tag…"/>
          <span className="hand muted small">{filtered.length} tracks</span>
        </div>
        <div className="pill-row">
          <button className={`pill hand ${!genreFilter ? "on" : ""}`} onClick={() => setGenreFilter(null)}>all</button>
          {GENRES.map(g => (
            <button key={g} className={`pill hand ${genreFilter === g ? "on" : ""}`} onClick={() => setGenreFilter(g)}>{g.toLowerCase()}</button>
          ))}
          <span className="pill-sep"/>
          <span className="hand muted small">sort</span>
          {["artist","bpm","key","year"].map(s => (
            <button key={s} className={`pill hand ${sortBy === s ? "on" : ""}`} onClick={() => setSortBy(s)}>{s}</button>
          ))}
        </div>
      </div>
      <div className="lib-table">
        <div className="lib-row lib-head-row hand muted">
          <div className="c-art"></div>
          <div className="c-title">title</div>
          <div className="c-artist">artist</div>
          <div className="c-bpm mono">bpm</div>
          <div className="c-key mono">key</div>
          <div className="c-genre">genre</div>
          <div className="c-tags">tags</div>
          <div className="c-year mono">yr</div>
          <div className="c-en mono">en</div>
          <div className="c-act"></div>
        </div>
        <div className="lib-scroll">
          {filtered.map(t => (
            <div key={t.id} className="lib-row" draggable
              onDragStart={(e) => {
                e.dataTransfer.setData("text/track-id", t.id);
                e.dataTransfer.effectAllowed = "copyMove";
              }}>
              <div className="c-art"><ArtBlock track={t} size={26}/></div>
              <div className="c-title hand">{t.title}</div>
              <div className="c-artist hand muted">{t.artist}</div>
              <div className="c-bpm mono">{t.bpm}</div>
              <div className="c-key mono">{t.key}</div>
              <div className="c-genre hand muted">{t.genre}</div>
              <div className="c-tags hand muted small">{t.tags.slice(0,2).join(", ")}</div>
              <div className="c-year mono">{t.year}</div>
              <div className="c-en mono">{t.energy}</div>
              <div className="c-act">
                <button className="row-btn hand" onClick={() => onLoadDeck("A", t.id)}>→A</button>
                <button className="row-btn hand" onClick={() => onLoadDeck("B", t.id)}>→B</button>
                <button className="row-btn hand" onClick={() => onAddQueue(t.id)}>+Q</button>
                <button className="row-btn hand" onClick={() => onAnchor(t.id)}>⌖</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Queue strip
// ─────────────────────────────────────────────────────────────────
function QueueStrip({ queue, anchorId, onAnchor, onRemove, onLoadDeck, onReorder, onDropTrack }) {
  const [over, setOver] = useState(false);
  const dragIdx = useRef(null);
  return (
    <div className={`queue-strip ${over ? "drop-over" : ""}`}
      onDragOver={(e) => {
        // allow drop only if it's a track-id drag (not a queue reorder)
        e.preventDefault(); setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        setOver(false);
        const tid = e.dataTransfer.getData("text/track-id");
        if (tid) onDropTrack(tid);
      }}
    >
      <SketchBox className="queue-box">
        <div className="queue-head hand">UP NEXT <span className="muted small">· {queue.length}</span></div>
        {queue.length === 0 ? (
          <div className="queue-empty hand muted">
            drag suggestions or library tracks here to plan your set
          </div>
        ) : (
          <div className="queue-list">
            {queue.map((t, i) => (
              <div key={t.id}
                className={`queue-card ${anchorId === t.id ? "is-anchor-src" : ""}`}
                draggable
                onDragStart={(e) => {
                  dragIdx.current = i;
                  e.dataTransfer.setData("text/queue-idx", String(i));
                  e.dataTransfer.setData("text/track-id", t.id);
                  e.dataTransfer.effectAllowed = "copyMove";
                }}
                onDragOver={(e) => { e.preventDefault(); }}
                onDrop={(e) => {
                  e.stopPropagation();
                  const idxStr = e.dataTransfer.getData("text/queue-idx");
                  if (idxStr !== "") {
                    const from = parseInt(idxStr);
                    if (!Number.isNaN(from) && from !== i) onReorder(from, i);
                  }
                }}
                onClick={() => onAnchor(t.id)}>
                <div className="qc-art"><ArtBlock track={t} size={32}/></div>
                <div className="qc-meta">
                  <div className="hand qc-title">{t.title}</div>
                  <div className="hand muted small">{t.artist}</div>
                  <div className="mono small">{t.bpm} · {t.key}</div>
                </div>
                <div className="qc-actions">
                  <button className="row-btn hand" onClick={(e) => { e.stopPropagation(); onLoadDeck("A", t.id, true); }}>→A</button>
                  <button className="row-btn hand" onClick={(e) => { e.stopPropagation(); onLoadDeck("B", t.id, true); }}>→B</button>
                  <button className="row-btn hand" onClick={(e) => { e.stopPropagation(); onRemove(t.id); }}>×</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </SketchBox>
    </div>
  );
}

Object.assign(window, { ArtBlock, SketchBox, Waveform, Deck, TabStrip, Library, QueueStrip, hashStr });
