// Three graph layout variations for the suggestion view.
// All share the same node-card rendering and drag/drop semantics.
// Layouts differ in spatial arrangement only.

const { useState: useStateG, useMemo: useMemoG, useRef: useRefG, useEffect: useEffectG } = React;

// ── Suggestion node card (shared) ──────────────────────────────────
function NodeCard({ s, anchor, isAnchor, labelVerbosity, onAnchor, onDropToDeck }) {
  // s is { track, score, reasons } OR for anchor we pass {track:anchor, ...}
  const t = s.track;
  const reasons = s.reasons || [];
  const primary = reasons[0];
  const extra = Math.max(0, reasons.length - 1);
  const verbose = labelVerbosity === "verbose";
  const minimal = labelVerbosity === "minimal";

  return (
    <div className={`node ${isAnchor ? "is-anchor" : ""}`}
      draggable={!isAnchor}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/track-id", t.id);
        e.dataTransfer.effectAllowed = "copy";
      }}
    >
      <div className="node-inner">
        <div className="node-art">
          <ArtBlock track={t} size={isAnchor ? 56 : 38}/>
        </div>
        <div className="node-text">
          <div className="hand node-title" title={t.title}>{t.title}</div>
          {!minimal && <div className="hand muted small node-artist">{t.artist}</div>}
          <div className="mono small node-stats">
            <span>{t.bpm}</span>
            <span className="dot">·</span>
            <span>{t.key || "—"}</span>
            {verbose && (
              <>
                <span className="dot">·</span>
                <span className="muted">e{t.energy}</span>
              </>
            )}
          </div>
          {!isAnchor && primary && (
            <div className="reason-row">
              <span className="reason-chip hand">{primary.text}</span>
              {extra > 0 && <span className="reason-more hand muted">+{extra}</span>}
            </div>
          )}
          {isAnchor && (
            <div className="reason-row">
              <span className="anchor-chip hand">⌖ ANCHOR</span>
            </div>
          )}
        </div>
        {!isAnchor && (
          <button className="node-explore hand" title="explore from this track"
            onClick={(e) => { e.stopPropagation(); onAnchor(t.id); }}>
            ↳
          </button>
        )}
      </div>
    </div>
  );
}

// ── Edge SVG layer ────────────────────────────────────────────────
function Edges({ anchorPos, nodePositions, variant }) {
  return (
    <svg className="edges" preserveAspectRatio="none">
      {nodePositions.map((p, i) => {
        const dash = variant === "cluster" ? "3 4" : "0";
        return (
          <line key={i}
            x1={`${anchorPos.x}%`} y1={`${anchorPos.y}%`}
            x2={`${p.x}%`} y2={`${p.y}%`}
            stroke="currentColor" strokeWidth="1.2" strokeDasharray={dash} opacity="0.55"/>
        );
      })}
    </svg>
  );
}

// ── Variant 1: RADIAL — even ring around anchor ───────────────────
function radialPositions(n) {
  const out = [];
  // Wider stage than tall → use ellipse so nodes don't crash off top/bottom
  const rx = 38, ry = 34;
  for (let i = 0; i < n; i++) {
    const angle = -Math.PI / 2 + (i / n) * Math.PI * 2;
    out.push({
      x: 50 + Math.cos(angle) * rx,
      y: 50 + Math.sin(angle) * ry,
    });
  }
  return out;
}

// ── Variant 2: CLUSTER — force-ish jittered cluster ───────────────
function clusterPositions(n, seed = 1) {
  const r = mulberry32S(seed);
  const out = [];
  const baseRx = 32, baseRy = 28;
  for (let i = 0; i < n; i++) {
    const angle = (i / n) * Math.PI * 2 + r() * 0.6 - 0.3;
    const jitter = r() * 0.35 + 0.85;
    out.push({
      x: 50 + Math.cos(angle) * baseRx * jitter,
      y: 50 + Math.sin(angle) * baseRy * jitter,
    });
  }
  return out;
}

// ── Variant 3: ORBIT-BY-CRITERION — concentric rings labeled by reason kind ─
const ORBIT_ORDER = ["key","bpm","artist","tag","genre","energy","year"];
function orbitPositions(suggestions) {
  const n = suggestions.length;
  if (!n) return { positions: [], rings: [] };

  // Pick top kinds (max 3) by count, in canonical order
  const kindCounts = {};
  suggestions.forEach(s => (s.reasons || []).forEach(r => {
    kindCounts[r.kind] = (kindCounts[r.kind] || 0) + 1;
  }));
  let kinds = ORBIT_ORDER.filter(k => kindCounts[k]);
  if (!kinds.length) kinds = ["other"];
  const ringCount = Math.min(3, Math.max(1, Math.min(kinds.length, Math.ceil(n / 3))));
  kinds = kinds.slice(0, ringCount);

  // Distribute suggestions evenly across rings by sorted-score order.
  // Prefer giving each suggestion a ring whose kind matches its reasons.
  const byRing = Array.from({ length: ringCount }, () => []);
  const idealPer = Math.ceil(n / ringCount);
  const remaining = suggestions.map((_, i) => i);
  // Pass 1: place into ring matching primary reason if room
  for (let i = remaining.length - 1; i >= 0; i--) {
    const idx = remaining[i];
    const reasonKinds = (suggestions[idx].reasons || []).map(r => r.kind);
    const wantRing = kinds.findIndex(k => reasonKinds.includes(k));
    if (wantRing >= 0 && byRing[wantRing].length < idealPer) {
      byRing[wantRing].push(idx);
      remaining.splice(i, 1);
    }
  }
  // Pass 2: place leftovers into emptiest ring
  remaining.forEach(idx => {
    const ring = byRing.reduce((a, b, bi) => byRing[a].length <= b.length ? a : bi, 0);
    byRing[ring].push(idx);
  });
  // Re-label rings: name each by its most common reason kind among assigned items
  const ringLabels = byRing.map((items, ri) => {
    const counts = {};
    items.forEach(i => (suggestions[i].reasons || []).forEach(r => {
      counts[r.kind] = (counts[r.kind] || 0) + 1;
    }));
    const top = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
    return top || kinds[ri] || "other";
  });

  const positions = new Array(n);
  const rings = [];
  // Cap to 2 rings, with hard-coded radii that fit the ~640×360 stage cleanly
  const ringRadii = [{ rx: 40, ry: 30 }, { rx: 44, ry: 41 }];
  const finalRingCount = Math.min(byRing.length, 2);
  // If we computed 3 rings, merge ring[2] into ring[1]
  if (byRing.length > finalRingCount) {
    for (let r = finalRingCount; r < byRing.length; r++) {
      byRing[finalRingCount - 1].push(...byRing[r]);
    }
    byRing.length = finalRingCount;
    ringLabels.length = finalRingCount;
  }
  byRing.forEach((items, ringIdx) => {
    const { rx, ry } = ringRadii[ringIdx];
    if (items.length === 0) {
      rings.push({ kind: ringLabels[ringIdx], rx, ry });
      return;
    }
    const startAngle = ringIdx === 0 ? -Math.PI / 2 + Math.PI / items.length : -Math.PI / 2;
    items.forEach((idx, i) => {
      const angle = startAngle + (i / items.length) * Math.PI * 2;
      positions[idx] = {
        x: 50 + Math.cos(angle) * rx,
        y: 50 + Math.sin(angle) * ry,
      };
    });
    rings.push({ kind: ringLabels[ringIdx], rx, ry });
  });
  return { positions, rings };
}

// ── Main GraphCanvas ──────────────────────────────────────────────
function GraphCanvas({
  variant, anchor, suggestions, page, totalPages,
  labelVerbosity, onAnchor, onPrev, onNext, onOpenSettings,
  emptyState, // null | "no-results"
  settingsSummary,
}) {
  const anchorPos = { x: 50, y: 50 };

  let nodePositions = [];
  let rings = [];
  if (variant === "radial") nodePositions = radialPositions(suggestions.length);
  else if (variant === "cluster") nodePositions = clusterPositions(suggestions.length, hashStr(anchor?.id || "x"));
  else if (variant === "orbit") {
    const r = orbitPositions(suggestions);
    nodePositions = r.positions;
    rings = r.rings;
  }

  return (
    <div className="graph-canvas">
      <div className="graph-head">
        <div className="filter-chip hand">
          <span className="dot-marker"/> {settingsSummary}
        </div>
        <div className="graph-head-right">
          <button className="ghost-btn hand" onClick={onPrev} disabled={page <= 1}>‹ prev</button>
          <span className="mono small page-ind">page {page} of {totalPages || 1}</span>
          <button className="ghost-btn hand" onClick={onNext} disabled={page >= totalPages}>next ›</button>
          <button className="ghost-btn hand gear" onClick={onOpenSettings} title="suggestion settings">⚙</button>
        </div>
      </div>
      <div className={`graph-stage variant-${variant}`}>
        {variant === "orbit" && rings.map((r, i) => (
          <div key={i} className="orbit-ring" style={{
            width: `${r.rx * 2}%`, height: `${r.ry * 2}%`,
            left: `${50 - r.rx}%`, top: `${50 - r.ry}%`,
          }}>
            <span className="orbit-label hand muted small">{r.kind}</span>
          </div>
        ))}
        {emptyState === "no-results" ? (
          <div className="empty-state">
            <SketchBox className="empty-box" dashed>
              <div className="hand big">No matches in current filters</div>
              <div className="hand muted">Try loosening criteria or BPM tolerance.</div>
              <button className="primary-btn hand" onClick={() => onOpenSettings(true)}>Loosen filters</button>
            </SketchBox>
          </div>
        ) : (
          <>
            <Edges anchorPos={anchorPos} nodePositions={nodePositions} variant={variant}/>
            {anchor && (
              <div className="node-pos anchor-pos" style={{ left: `${anchorPos.x}%`, top: `${anchorPos.y}%` }}>
                <NodeCard s={{ track: anchor, reasons: [] }} anchor={anchor} isAnchor labelVerbosity={labelVerbosity} onAnchor={onAnchor}/>
              </div>
            )}
            {suggestions.map((s, i) => {
              const p = nodePositions[i] || { x: 50, y: 50 };
              return (
                <div key={s.track.id} className="node-pos"
                  style={{ left: `${p.x}%`, top: `${p.y}%` }}>
                  <NodeCard s={s} anchor={anchor} labelVerbosity={labelVerbosity} onAnchor={onAnchor}/>
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}

Object.assign(window, { GraphCanvas, NodeCard });
