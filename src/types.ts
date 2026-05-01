// Mirrors of Rust types crossing the Tauri IPC boundary.
// Keep field names in serde-snake-case to match Rust's default Serialize.

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
}

export interface MidiMessage {
  timestamp_ms: number;
  data: number[];
}
