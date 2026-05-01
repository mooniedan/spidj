import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  AppSnapshot,
  DeckId,
  DeckSnapshot,
  MidiMessage,
  TrackEntry,
} from "../types";

export const ipc = {
  libraryScan: (path: string): Promise<TrackEntry[]> =>
    invoke("library_scan", { path }),

  deckLoad: (deckId: DeckId, path: string): Promise<void> =>
    invoke("deck_load", { deckId, path }),

  deckPlay: (deckId: DeckId): Promise<void> =>
    invoke("deck_play", { deckId }),

  deckPause: (deckId: DeckId): Promise<void> =>
    invoke("deck_pause", { deckId }),

  deckCuePress: (deckId: DeckId): Promise<void> =>
    invoke("deck_cue_press", { deckId }),

  deckCueRelease: (deckId: DeckId): Promise<void> =>
    invoke("deck_cue_release", { deckId }),

  deckToggleCueActive: (deckId: DeckId): Promise<void> =>
    invoke("deck_toggle_cue_active", { deckId }),

  deckSetPitch: (deckId: DeckId, norm: number): Promise<void> =>
    invoke("deck_set_pitch", { deckId, norm }),

  crossfaderSet: (value: number): Promise<void> =>
    invoke("crossfader_set", { value }),

  deckSnapshot: (): Promise<DeckSnapshot[]> => invoke("deck_snapshot"),

  appSnapshot: (): Promise<AppSnapshot> => invoke("app_snapshot"),

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

export function onAppState(
  cb: (snap: AppSnapshot) => void,
): Promise<UnlistenFn> {
  return listen<AppSnapshot>("deck:state", (e) => cb(e.payload));
}
