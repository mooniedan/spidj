mod audio;
mod commands;
mod deck;
mod library;
mod midi;

use parking_lot::Mutex;
use std::sync::Arc;
use tauri::Manager;

pub struct AppState {
    pub decks: Arc<Mutex<deck::DeckRack>>,
    pub midi: Arc<Mutex<midi::MidiState>>,
    pub audio: Arc<audio::AudioController>,
    /// Crossfader position: 0.0 = full Deck A, 1.0 = full Deck B. Linear curve.
    pub crossfader: Arc<Mutex<f32>>,
}

pub fn run() {
    let decks = Arc::new(Mutex::new(deck::DeckRack::new()));
    let crossfader = Arc::new(Mutex::new(0.5f32));
    let audio_ctrl = Arc::new(audio::AudioController::new(decks.clone(), crossfader.clone()));
    if let Err(e) = audio_ctrl.start(None) {
        eprintln!("[audio] initial start with default device failed: {e}");
    }
    let midi = Arc::new(Mutex::new(midi::MidiState::new()));

    let state = AppState {
        decks,
        midi,
        audio: audio_ctrl,
        crossfader,
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(state)
        .invoke_handler(tauri::generate_handler![
            commands::library_scan,
            commands::deck_load,
            commands::deck_play,
            commands::deck_pause,
            commands::deck_cue_press,
            commands::deck_cue_release,
            commands::deck_toggle_cue_active,
            commands::deck_set_pitch,
            commands::crossfader_set,
            commands::deck_snapshot,
            commands::app_snapshot,
            commands::midi_list_inputs,
            commands::midi_connect,
            commands::audio_list_outputs,
            commands::audio_set_output,
        ])
        .setup(|app| {
            // Hand the AppHandle to the MIDI state so it can emit events from
            // the input thread.
            let handle = app.handle().clone();
            let state = app.state::<AppState>();
            state.inner().midi.lock().set_handle(handle);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
