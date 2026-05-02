// Engine types — verbatim from requirements.md §6.1.
// These are the canonical shapes; src/types.ts re-exports them so the
// frontend uses one source.

export type CriterionKey =
  | "bpm"
  | "key"
  | "genre"
  | "tags"
  | "artist"
  | "year"
  | "energy";

export interface Track {
  id: string;
  title: string;
  artist: string;
  bpm: number;
  key: string | null;
  genre: string;
  tags: string[];
  year: number;
  energy: number;
  albumArtColor: string;
  duration?: number;
}

export interface SuggestionConfig {
  enabledCriteria: Record<CriterionKey, boolean>;
  /** REQ-SUGGEST-04: 0 = Loose, 100 = Strict. */
  strictness: number;
  /** REQ-SUGGEST-03: percent allowed below anchor. Default 4. */
  bpmSlowDownPercent: number;
  /** REQ-SUGGEST-03: percent allowed above anchor. Default 6. */
  bpmSpeedUpPercent: number;
  /** REQ-SUGGEST-05: 5..12, default 7. */
  suggestionsPerPage: number;
}

export interface Suggestion {
  track: Track;
  reasons: SuggestionReason[];
}

export interface SuggestionReason {
  type: CriterionKey;
  detail: string;
  /** Per-criterion score in [0, 1]. The reason with the highest strength
   *  is the primary one (REQ-SUGGEST-06). */
  strength: number;
}

/** Defaults per REQ-SUGGEST-02..05. */
export const DEFAULT_CONFIG: SuggestionConfig = {
  enabledCriteria: {
    bpm: true,
    key: true,
    genre: true,
    tags: true,
    artist: true,
    year: true,
    energy: true,
  },
  strictness: 50,
  bpmSlowDownPercent: 4,
  bpmSpeedUpPercent: 6,
  suggestionsPerPage: 7,
};
