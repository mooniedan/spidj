use parking_lot::Mutex;
use serde::Serialize;
use std::path::PathBuf;
use std::sync::Arc;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, serde::Deserialize)]
pub enum DeckId {
    A,
    B,
}

impl DeckId {
    pub fn index(self) -> usize {
        match self {
            DeckId::A => 0,
            DeckId::B => 1,
        }
    }

    pub fn from_str_loose(s: &str) -> Option<Self> {
        match s.to_ascii_uppercase().as_str() {
            "A" => Some(DeckId::A),
            "B" => Some(DeckId::B),
            _ => None,
        }
    }
}

/// PCM data for a loaded track. M1: decoded fully into memory at load time.
/// `samples` is interleaved stereo, resampled to the engine's target rate.
pub struct LoadedTrack {
    pub path: PathBuf,
    pub title: Option<String>,
    pub artist: Option<String>,
    pub samples: Arc<Vec<f32>>,
    pub sample_rate: u32,
    pub channels: u16,
    pub duration_samples: u64,
}

pub struct Deck {
    pub id: DeckId,
    pub track: Option<LoadedTrack>,
    /// Position in **interleaved frames** (i.e. samples / channels).
    pub position_frames: u64,
    pub playing: bool,
    pub speed: f32,
}

impl Deck {
    fn new(id: DeckId) -> Self {
        Self {
            id,
            track: None,
            position_frames: 0,
            playing: false,
            speed: 1.0,
        }
    }

    pub fn load(&mut self, track: LoadedTrack) {
        self.track = Some(track);
        self.position_frames = 0;
        self.playing = false;
    }

    pub fn play(&mut self) {
        if self.track.is_some() {
            self.playing = true;
        }
    }

    pub fn pause(&mut self) {
        self.playing = false;
    }

    pub fn cue(&mut self) {
        // M1 cue: pause and rewind to start.
        self.playing = false;
        self.position_frames = 0;
    }
}

pub struct DeckRack {
    pub decks: [Mutex<Deck>; 2],
}

impl DeckRack {
    pub fn new() -> Self {
        Self {
            decks: [Mutex::new(Deck::new(DeckId::A)), Mutex::new(Deck::new(DeckId::B))],
        }
    }

    pub fn deck(&self, id: DeckId) -> &Mutex<Deck> {
        &self.decks[id.index()]
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct DeckSnapshot {
    pub id: DeckId,
    pub loaded_path: Option<String>,
    pub loaded_title: Option<String>,
    pub loaded_artist: Option<String>,
    pub position_seconds: f64,
    pub duration_seconds: f64,
    pub playing: bool,
}

impl DeckSnapshot {
    pub fn from_deck(d: &Deck, target_rate: u32) -> Self {
        let (path, title, artist, duration_seconds) = match &d.track {
            Some(t) => (
                Some(t.path.to_string_lossy().to_string()),
                t.title.clone(),
                t.artist.clone(),
                t.duration_samples as f64 / target_rate.max(1) as f64,
            ),
            None => (None, None, None, 0.0),
        };
        Self {
            id: d.id,
            loaded_path: path,
            loaded_title: title,
            loaded_artist: artist,
            position_seconds: d.position_frames as f64 / target_rate.max(1) as f64,
            duration_seconds,
            playing: d.playing,
        }
    }
}
