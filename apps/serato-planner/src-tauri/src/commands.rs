use std::collections::HashSet;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use spidj_engine::{
    suggest, SuggestOptions, SuggestResult, SuggestionConfig, Track,
};
use tauri::State;

use crate::key_normalize;
use crate::{AppState, LoadedLibrary};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LibrarySummary {
    pub track_count: usize,
    pub folder: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CrateSummary {
    pub name: String,
    pub track_count: usize,
}

#[tauri::command]
pub fn library_open(
    state: State<'_, AppState>,
    folder: String,
) -> Result<LibrarySummary, String> {
    let path = PathBuf::from(&folder);
    let mut lib = serato_io::open_serato_library(&path).map_err(|e| e.to_string())?;
    // Normalise non-Camelot keys at the boundary so spidj-engine's matcher
    // works regardless of how Serato displays keys.
    for t in &mut lib.tracks {
        t.key = key_normalize::normalize(t.key.as_deref());
    }
    let summary = LibrarySummary {
        track_count: lib.tracks.len(),
        folder: folder.clone(),
    };
    *state.library.write() = Some(LoadedLibrary {
        folder: path,
        library: lib,
    });
    Ok(summary)
}

/// Return all tracks in the library so the frontend can render a full list
/// (filterable client-side). Sorted by title for stable display.
#[tauri::command]
pub fn library_all_tracks(state: State<'_, AppState>) -> Vec<Track> {
    let guard = state.library.read();
    let Some(loaded) = guard.as_ref() else { return Vec::new() };
    let mut out: Vec<Track> = loaded.library.tracks.clone();
    out.sort_by(|a, b| a.title.to_lowercase().cmp(&b.title.to_lowercase()));
    out
}

#[tauri::command]
pub fn library_get_track(state: State<'_, AppState>, id: String) -> Option<Track> {
    let guard = state.library.read();
    let loaded = guard.as_ref()?;
    loaded.library.track(&id).cloned()
}

#[tauri::command]
pub fn engine_suggest(
    state: State<'_, AppState>,
    anchor_id: String,
    config: SuggestionConfig,
    already_shown: Vec<String>,
) -> Result<SuggestResult, String> {
    let guard = state.library.read();
    let loaded = guard
        .as_ref()
        .ok_or_else(|| "library not loaded".to_string())?;
    let anchor = loaded
        .library
        .track(&anchor_id)
        .cloned()
        .ok_or_else(|| format!("anchor track not found: {anchor_id}"))?;

    let options = SuggestOptions {
        page: 0,
        already_shown: already_shown.into_iter().collect::<HashSet<_>>(),
    };
    Ok(suggest(&anchor, &loaded.library.tracks, &config, options))
}

#[tauri::command]
pub fn crate_list(state: State<'_, AppState>) -> Result<Vec<CrateSummary>, String> {
    let guard = state.library.read();
    let loaded = guard
        .as_ref()
        .ok_or_else(|| "library not loaded".to_string())?;
    let crates = serato_io::list_crates(&loaded.folder).map_err(|e| e.to_string())?;
    Ok(crates
        .into_iter()
        .map(|c| CrateSummary {
            name: c.name,
            track_count: c.track_count,
        })
        .collect())
}

/// Load a crate's tracks, resolving each path against the current library.
/// Paths not present in the library yield synthetic placeholder tracks so
/// the user can still see + edit the slot (and choose to remove it).
#[tauri::command]
pub fn crate_load(
    state: State<'_, AppState>,
    name: String,
) -> Result<Vec<Track>, String> {
    let guard = state.library.read();
    let loaded = guard
        .as_ref()
        .ok_or_else(|| "library not loaded".to_string())?;
    let path = loaded
        .folder
        .join("Subcrates")
        .join(format!("{name}.crate"));
    let track_paths = serato_io::read_crate(&path).map_err(|e| e.to_string())?;
    let resolved: Vec<Track> = track_paths
        .into_iter()
        .map(|tp| match loaded.library.track(&tp) {
            Some(t) => t.clone(),
            None => Track {
                id: tp.clone(),
                title: tp.rsplit(['/', '\\']).next().unwrap_or(&tp).to_string(),
                artist: "(not in library)".into(),
                bpm: 0.0,
                key: None,
                genre: String::new(),
                tags: Vec::new(),
                year: 0,
                energy: 5,
                album_art_color: "#22262c".into(),
                duration: None,
            },
        })
        .collect();
    Ok(resolved)
}

#[tauri::command]
pub fn crate_write(
    state: State<'_, AppState>,
    name: String,
    track_ids: Vec<String>,
    overwrite: bool,
) -> Result<String, String> {
    let guard = state.library.read();
    let loaded = guard
        .as_ref()
        .ok_or_else(|| "library not loaded".to_string())?;
    let path = serato_io::write_crate(&loaded.folder, &name, &track_ids, overwrite)
        .map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}
