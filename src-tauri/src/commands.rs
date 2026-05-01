use std::path::PathBuf;
use tauri::{AppHandle, Emitter, State};

use crate::audio::{self, TARGET_RATE};
use crate::deck::{DeckId, DeckSnapshot};
use crate::library::{self, TrackEntry};
use crate::midi;
use crate::AppState;

#[tauri::command]
pub fn library_scan(path: String) -> Vec<TrackEntry> {
    library::scan_folder(&PathBuf::from(path))
}

#[tauri::command]
pub fn deck_load(
    state: State<'_, AppState>,
    app: AppHandle,
    deck_id: String,
    path: String,
) -> Result<(), String> {
    let id = DeckId::from_str_loose(&deck_id).ok_or_else(|| "bad deck id".to_string())?;
    let track = audio::decode_file(&PathBuf::from(&path)).map_err(|e| e.to_string())?;
    {
        let rack = state.decks.lock();
        rack.deck(id).lock().load(track);
    }
    emit_deck_state(&state, &app);
    Ok(())
}

#[tauri::command]
pub fn deck_play(
    state: State<'_, AppState>,
    app: AppHandle,
    deck_id: String,
) -> Result<(), String> {
    let id = DeckId::from_str_loose(&deck_id).ok_or_else(|| "bad deck id".to_string())?;
    {
        let rack = state.decks.lock();
        let mut deck = rack.deck(id).lock();
        deck.play();
        eprintln!(
            "[cmd] deck_play {:?} → playing={} pos={} loaded={}",
            id,
            deck.playing,
            deck.position_frames,
            deck.track.is_some()
        );
    }
    emit_deck_state(&state, &app);
    Ok(())
}

#[tauri::command]
pub fn deck_pause(
    state: State<'_, AppState>,
    app: AppHandle,
    deck_id: String,
) -> Result<(), String> {
    let id = DeckId::from_str_loose(&deck_id).ok_or_else(|| "bad deck id".to_string())?;
    state.decks.lock().deck(id).lock().pause();
    emit_deck_state(&state, &app);
    Ok(())
}

#[tauri::command]
pub fn deck_cue(
    state: State<'_, AppState>,
    app: AppHandle,
    deck_id: String,
) -> Result<(), String> {
    let id = DeckId::from_str_loose(&deck_id).ok_or_else(|| "bad deck id".to_string())?;
    state.decks.lock().deck(id).lock().cue();
    emit_deck_state(&state, &app);
    Ok(())
}

#[tauri::command]
pub fn deck_snapshot(state: State<'_, AppState>) -> Vec<DeckSnapshot> {
    snapshot_now(&state)
}

#[tauri::command]
pub fn midi_list_inputs() -> Result<Vec<String>, String> {
    midi::list_inputs()
}

#[tauri::command]
pub fn midi_connect(state: State<'_, AppState>, port_index: usize) -> Result<(), String> {
    midi::connect(&state.midi, state.decks.clone(), port_index)
}

#[tauri::command]
pub fn audio_list_outputs() -> Vec<String> {
    audio::list_output_devices()
}

#[tauri::command]
pub fn audio_set_output(state: State<'_, AppState>, name: String) -> Result<(), String> {
    let dev = if name.is_empty() { None } else { Some(name) };
    state.audio.start(dev).map_err(|e| e.to_string())
}

fn snapshot_now(state: &State<'_, AppState>) -> Vec<DeckSnapshot> {
    let rack = state.decks.lock();
    rack.decks
        .iter()
        .map(|d| DeckSnapshot::from_deck(&d.lock(), TARGET_RATE))
        .collect()
}

fn emit_deck_state(state: &State<'_, AppState>, app: &AppHandle) {
    let snaps = snapshot_now(state);
    let _ = app.emit("deck:state", snaps);
}
