// Pure suggestion engine implementing requirements.md §6.3.
//
// Per the M3 plan: this is the canonical implementation. The older
// prototypes/data.jsx::scoreTrack uses a different (heuristic) algorithm and
// is not what we ship — see PHASE-3.md.
//
// Rules:
// 1. Hard BPM filter (when enabled).
// 2. Per-criterion score in [0, 1].
// 3. Total score = mean of enabled-criterion scores.
// 4. Strictness threshold maps linearly: 0 → 0.3, 100 → 0.7.
// 5. Reasons = criteria scoring ≥ 0.6; primary = highest.
// 6. Sort desc, paginate by suggestionsPerPage.

import { camelotIsAdjacent } from "./camelot";
import type {
  CriterionKey,
  Suggestion,
  SuggestionConfig,
  SuggestionReason,
  Track,
} from "./types";

const REASON_THRESHOLD = 0.6;

interface ScoreResult {
  total: number;
  perCriterion: ReadonlyMap<CriterionKey, number>;
  reasons: SuggestionReason[];
}

export interface SuggestOptions {
  /** 0-indexed page. Default 0. */
  page?: number;
  /** Track ids to exclude (already shown on previous pages for this anchor). */
  alreadyShown?: ReadonlySet<string>;
}

export interface SuggestResult {
  suggestions: Suggestion[];
  totalPages: number;
  bpmRange: { min: number; max: number };
}

// ── Public API ─────────────────────────────────────────────────────────

export function suggest(
  anchor: Track,
  library: Track[],
  config: SuggestionConfig,
  options: SuggestOptions = {},
): SuggestResult {
  const page = Math.max(0, Math.floor(options.page ?? 0));
  const alreadyShown = options.alreadyShown ?? EMPTY_SET;

  const bpmRange = resolvedBpmRange(anchor, config);

  const survivors: Array<{ track: Track; score: ScoreResult }> = [];
  for (const candidate of library) {
    if (candidate.id === anchor.id) continue;
    if (config.enabledCriteria.bpm && !withinBpmRange(candidate.bpm, bpmRange)) {
      continue;
    }
    const score = scoreCandidate(anchor, candidate, config);
    if (score.total >= strictnessThreshold(config.strictness)) {
      survivors.push({ track: candidate, score });
    }
  }

  survivors.sort((a, b) => {
    if (b.score.total !== a.score.total) return b.score.total - a.score.total;
    // Stable tie-breaker: track id ascending.
    return a.track.id.localeCompare(b.track.id);
  });

  const remaining = survivors.filter((s) => !alreadyShown.has(s.track.id));
  const perPage = Math.max(1, Math.floor(config.suggestionsPerPage));
  const totalPages = Math.max(1, Math.ceil(remaining.length / perPage));

  const start = page * perPage;
  const slice = remaining.slice(start, start + perPage);

  return {
    suggestions: slice.map(({ track, score }) => ({
      track,
      reasons: score.reasons,
    })),
    totalPages,
    bpmRange,
  };
}

const EMPTY_SET: ReadonlySet<string> = new Set();

// ── Per-criterion scoring (each returns [0, 1]) ────────────────────────

export function scoreBpm(
  anchor: Track,
  c: Track,
  config: SuggestionConfig,
): number {
  const maxTolPct = Math.max(config.bpmSlowDownPercent, config.bpmSpeedUpPercent);
  if (maxTolPct <= 0 || anchor.bpm <= 0) return c.bpm === anchor.bpm ? 1 : 0;
  const maxTol = (maxTolPct / 100) * anchor.bpm;
  const delta = Math.abs(c.bpm - anchor.bpm);
  return clamp01(1 - delta / maxTol);
}

export function scoreKey(anchor: Track, c: Track): number {
  if (!anchor.key || !c.key) return 0;
  if (anchor.key === c.key) return 1;
  if (camelotIsAdjacent(anchor.key, c.key)) return 0.7;
  return 0;
}

export function scoreGenre(anchor: Track, c: Track): number {
  return anchor.genre === c.genre ? 1 : 0;
}

export function scoreTags(anchor: Track, c: Track): number {
  const a = new Set(anchor.tags);
  const b = new Set(c.tags);
  if (a.size === 0 && b.size === 0) return 0;
  let intersection = 0;
  for (const tag of a) if (b.has(tag)) intersection++;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export function scoreArtist(anchor: Track, c: Track): number {
  return anchor.artist === c.artist ? 1 : 0;
}

export function scoreYear(anchor: Track, c: Track): number {
  return clamp01(1 - Math.min(Math.abs(c.year - anchor.year) / 10, 1));
}

export function scoreEnergy(anchor: Track, c: Track): number {
  return clamp01(1 - Math.abs(c.energy - anchor.energy) / 9);
}

// ── Strictness threshold ───────────────────────────────────────────────

/** Map strictness (0..100) to the score threshold (0.3..0.7) per §6.3. */
export function strictnessThreshold(strictness: number): number {
  const clamped = Math.max(0, Math.min(100, strictness));
  return 0.3 + 0.4 * (clamped / 100);
}

// ── BPM tolerance helpers ──────────────────────────────────────────────

export function resolvedBpmRange(
  anchor: Track,
  config: SuggestionConfig,
): { min: number; max: number } {
  const min = Math.round(anchor.bpm * (1 - config.bpmSlowDownPercent / 100));
  const max = Math.round(anchor.bpm * (1 + config.bpmSpeedUpPercent / 100));
  return { min, max };
}

function withinBpmRange(bpm: number, range: { min: number; max: number }) {
  return bpm >= range.min && bpm <= range.max;
}

// ── Internals ──────────────────────────────────────────────────────────

function scoreCandidate(
  anchor: Track,
  c: Track,
  config: SuggestionConfig,
): ScoreResult {
  const enabled = config.enabledCriteria;
  const perCriterion = new Map<CriterionKey, number>();

  if (enabled.bpm) perCriterion.set("bpm", scoreBpm(anchor, c, config));
  if (enabled.key) perCriterion.set("key", scoreKey(anchor, c));
  if (enabled.genre) perCriterion.set("genre", scoreGenre(anchor, c));
  if (enabled.tags) perCriterion.set("tags", scoreTags(anchor, c));
  if (enabled.artist) perCriterion.set("artist", scoreArtist(anchor, c));
  if (enabled.year) perCriterion.set("year", scoreYear(anchor, c));
  if (enabled.energy) perCriterion.set("energy", scoreEnergy(anchor, c));

  if (perCriterion.size === 0) {
    return { total: 0, perCriterion, reasons: [] };
  }

  let sum = 0;
  for (const v of perCriterion.values()) sum += v;
  const total = sum / perCriterion.size;

  const reasons = buildReasons(anchor, c, perCriterion);

  return { total, perCriterion, reasons };
}

function buildReasons(
  anchor: Track,
  c: Track,
  perCriterion: ReadonlyMap<CriterionKey, number>,
): SuggestionReason[] {
  const out: SuggestionReason[] = [];
  for (const [type, strength] of perCriterion) {
    if (strength < REASON_THRESHOLD) continue;
    out.push({ type, detail: formatReason(type, anchor, c, strength), strength });
  }
  // Primary first (highest strength). Ties broken by criterion order in the
  // map, which is insertion order matching the §6.1 enabled-criteria layout.
  out.sort((a, b) => b.strength - a.strength);
  return out;
}

function formatReason(
  type: CriterionKey,
  anchor: Track,
  c: Track,
  _strength: number,
): string {
  switch (type) {
    case "bpm": {
      const delta = c.bpm - anchor.bpm;
      if (delta === 0) return "Same BPM";
      const sign = delta > 0 ? "+" : "";
      return `${sign}${delta} BPM`;
    }
    case "key": {
      if (anchor.key && c.key && anchor.key === c.key) {
        return `Same key ${c.key}`;
      }
      return `Adjacent key ${c.key ?? "?"}`;
    }
    case "genre":
      return `Genre ${c.genre}`;
    case "tags": {
      const a = new Set(anchor.tags);
      const shared = c.tags.filter((t) => a.has(t));
      if (shared.length === 0) return "Shared tags";
      return `Shared tags: ${shared.slice(0, 2).join(", ")}`;
    }
    case "artist":
      return `Same artist ${c.artist}`;
    case "year": {
      const diff = Math.abs(c.year - anchor.year);
      if (diff === 0) return `Same year ${c.year}`;
      if (diff === 1) return "Same era";
      return `${diff}y apart`;
    }
    case "energy": {
      const diff = Math.abs(c.energy - anchor.energy);
      if (diff === 0) return "Same energy";
      return "Similar energy";
    }
  }
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}
