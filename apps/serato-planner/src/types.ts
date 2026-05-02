// IPC types — mirror Rust shapes.
// `Track` and config types come from the spidj-engine crate via Tauri's
// JSON serialization. Field names match serde rename_all = "camelCase".

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

export interface EnabledCriteria {
  bpm: boolean;
  key: boolean;
  genre: boolean;
  tags: boolean;
  artist: boolean;
  year: boolean;
  energy: boolean;
}

export interface SuggestionConfig {
  enabledCriteria: EnabledCriteria;
  strictness: number;
  bpmSlowDownPercent: number;
  bpmSpeedUpPercent: number;
  suggestionsPerPage: number;
}

export type CriterionKey =
  | "bpm"
  | "key"
  | "genre"
  | "tags"
  | "artist"
  | "year"
  | "energy";

export interface SuggestionReason {
  type: CriterionKey;
  detail: string;
  strength: number;
}

export interface Suggestion {
  track: Track;
  reasons: SuggestionReason[];
}

export interface SuggestResult {
  suggestions: Suggestion[];
  totalPages: number;
  bpmRange: { min: number; max: number };
}

export interface LibrarySummary {
  trackCount: number;
  folder: string;
}

export interface CrateSummary {
  name: string;
  trackCount: number;
}

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
