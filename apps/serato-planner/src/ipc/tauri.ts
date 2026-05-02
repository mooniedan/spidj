import { invoke } from "@tauri-apps/api/core";
import type {
  CrateSummary,
  LibrarySummary,
  SuggestResult,
  SuggestionConfig,
  Track,
} from "../types";

export const ipc = {
  libraryOpen: (folder: string): Promise<LibrarySummary> =>
    invoke("library_open", { folder }),

  libraryAllTracks: (): Promise<Track[]> => invoke("library_all_tracks"),

  libraryGetTrack: (id: string): Promise<Track | null> =>
    invoke("library_get_track", { id }),

  engineSuggest: (
    anchorId: string,
    config: SuggestionConfig,
    alreadyShown: string[],
  ): Promise<SuggestResult> =>
    invoke("engine_suggest", { anchorId, config, alreadyShown }),

  crateList: (): Promise<CrateSummary[]> => invoke("crate_list"),

  crateLoad: (name: string): Promise<Track[]> =>
    invoke("crate_load", { name }),

  crateWrite: (
    name: string,
    trackIds: string[],
    overwrite: boolean,
  ): Promise<string> =>
    invoke("crate_write", { name, trackIds, overwrite }),
};
