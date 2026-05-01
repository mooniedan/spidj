import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { DeckId, DeckSnapshot, MidiMessage, TrackEntry } from "../types";

export const ipc = {
  libraryScan: (path: string): Promise<TrackEntry[]> =>
    invoke("library_scan", { path }),

  deckLoad: (deckId: DeckId, path: string): Promise<void> =>
    invoke("deck_load", { deckId, path }),

  deckPlay: (deckId: DeckId): Promise<void> =>
    invoke("deck_play", { deckId }),

  deckPause: (deckId: DeckId): Promise<void> =>
    invoke("deck_pause", { deckId }),

  deckCue: (deckId: DeckId): Promise<void> =>
    invoke("deck_cue", { deckId }),

  deckSnapshot: (): Promise<DeckSnapshot[]> => invoke("deck_snapshot"),

  midiListInputs: (): Promise<string[]> => invoke("midi_list_inputs"),

  midiConnect: (portIndex: number): Promise<void> =>
    invoke("midi_connect", { portIndex }),

  audioListOutputs: (): Promise<string[]> => invoke("audio_list_outputs"),

  audioSetOutput: (name: string): Promise<void> =>
    invoke("audio_set_output", { name }),
};

export function onMidiMessage(
  cb: (msg: MidiMessage) => void,
): Promise<UnlistenFn> {
  return listen<MidiMessage>("midi:message", (e) => cb(e.payload));
}

export function onDeckState(
  cb: (snapshots: DeckSnapshot[]) => void,
): Promise<UnlistenFn> {
  return listen<DeckSnapshot[]>("deck:state", (e) => cb(e.payload));
}
