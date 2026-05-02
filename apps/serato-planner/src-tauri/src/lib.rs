mod commands;
mod key_normalize;

use parking_lot::RwLock;
use serato_io::Library;
use std::path::PathBuf;
use std::sync::Arc;

pub struct AppState {
    pub library: Arc<RwLock<Option<LoadedLibrary>>>,
}

pub struct LoadedLibrary {
    pub folder: PathBuf,
    pub library: Library,
}

pub fn run() {
    let state = AppState {
        library: Arc::new(RwLock::new(None)),
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(state)
        .invoke_handler(tauri::generate_handler![
            commands::library_open,
            commands::library_all_tracks,
            commands::library_get_track,
            commands::engine_suggest,
            commands::crate_list,
            commands::crate_load,
            commands::crate_write,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
