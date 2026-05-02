// Mirrors of Rust types crossing the Tauri IPC boundary, plus re-exports
// of the engine types so frontend code uses one canonical Track shape.
// Keep field names in serde-snake-case to match Rust's default Serialize.

export type {
  CriterionKey,
  Suggestion,
  SuggestionConfig,
  SuggestionReason,
  Track as EngineTrack,
} from "./engine/types";
export { DEFAULT_CONFIG as DEFAULT_SUGGESTION_CONFIG } from "./engine/types";

export type DeckId = "A" | "B";

export interface TrackEntry {
  path: string;
  filename: string;
  title: string | null;
  artist: string | null;
  duration_seconds: number | null;
}

export interface DeckSnapshot {
  id: DeckId;
  loaded_path: string | null;
  loaded_title: string | null;
  loaded_artist: string | null;
  position_seconds: number;
  duration_seconds: number;
  playing: boolean;
  pitch_percent: number;
  cue_position_seconds: number;
  cue_active: boolean;
}

export interface AppSnapshot {
  decks: DeckSnapshot[];
  crossfader: number;
}

export interface MidiMessage {
  timestamp_ms: number;
  data: number[];
}
