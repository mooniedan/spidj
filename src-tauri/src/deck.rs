use parking_lot::Mutex;
use serde::Serialize;
use std::path::PathBuf;
use std::sync::Arc;

/// Standard DJ pitch fader throw. ±8% covers the vast majority of beat-matching
/// needs; broader ranges (±50%) are post-MVP and would also need a settings UI.
pub const PITCH_RANGE: f32 = 0.08;

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
    /// Effective playback rate: 1.0 + pitch_norm * PITCH_RANGE.
    pub speed: f32,
    /// Pitch fader position normalised to [-1, 1].
    pub pitch_norm: f32,
    /// Cue point in interleaved frames; defaults to 0.
    pub cue_position_frames: u64,
    /// True while the transport-cue button is held in preview mode.
    pub cue_held: bool,
    /// Headphone-cue toggle: when true, this deck contributes to the cue mix
    /// (channels 2/3) regardless of crossfader position.
    pub cue_active: bool,
}

impl Deck {
    fn new(id: DeckId) -> Self {
        Self {
            id,
            track: None,
            position_frames: 0,
            playing: false,
            speed: 1.0,
            pitch_norm: 0.0,
            cue_position_frames: 0,
            cue_held: false,
            cue_active: false,
        }
    }

    pub fn load(&mut self, track: LoadedTrack) {
        self.track = Some(track);
        self.position_frames = 0;
        self.playing = false;
        self.cue_position_frames = 0;
        self.cue_held = false;
    }

    pub fn play(&mut self) {
        if self.track.is_some() {
            self.playing = true;
        }
    }

    pub fn pause(&mut self) {
        self.playing = false;
        self.cue_held = false;
    }

    /// Apply a normalised pitch fader value in [-1, 1].
    pub fn set_pitch(&mut self, norm: f32) {
        let n = norm.clamp(-1.0, 1.0);
        self.pitch_norm = n;
        self.speed = 1.0 + n * PITCH_RANGE;
    }

    /// CDJ-style cue press behavior:
    /// - Playing: jump back to cue point and pause.
    /// - Paused at cue point: start playing in preview mode (cue_held = true).
    /// - Paused not at cue point: set the cue point to the current position.
    pub fn cue_press(&mut self) {
        if self.track.is_none() {
            return;
        }
        if self.playing {
            self.position_frames = self.cue_position_frames;
            self.playing = false;
            self.cue_held = false;
            return;
        }
        // Paused: decide based on whether we're at the cue.
        if self.position_frames == self.cue_position_frames {
            self.playing = true;
            self.cue_held = true;
        } else {
            self.cue_position_frames = self.clamp_to_track(self.position_frames);
        }
    }

    /// Cue release: only acts if we were in preview mode (cue_held).
    pub fn cue_release(&mut self) {
        if self.cue_held {
            self.playing = false;
            self.position_frames = self.cue_position_frames;
            self.cue_held = false;
        }
    }

    pub fn toggle_cue_active(&mut self) {
        self.cue_active = !self.cue_active;
    }

    fn clamp_to_track(&self, frames: u64) -> u64 {
        match &self.track {
            Some(t) if t.duration_samples > 0 => frames.min(t.duration_samples - 1),
            _ => 0,
        }
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
    pub pitch_percent: f32,
    pub cue_position_seconds: f64,
    pub cue_active: bool,
}

impl DeckSnapshot {
    pub fn from_deck(d: &Deck, target_rate: u32) -> Self {
        let rate = target_rate.max(1) as f64;
        let (path, title, artist, duration_seconds) = match &d.track {
            Some(t) => (
                Some(t.path.to_string_lossy().to_string()),
                t.title.clone(),
                t.artist.clone(),
                t.duration_samples as f64 / rate,
            ),
            None => (None, None, None, 0.0),
        };
        Self {
            id: d.id,
            loaded_path: path,
            loaded_title: title,
            loaded_artist: artist,
            position_seconds: d.position_frames as f64 / rate,
            duration_seconds,
            playing: d.playing,
            pitch_percent: d.pitch_norm * PITCH_RANGE * 100.0,
            cue_position_seconds: d.cue_position_frames as f64 / rate,
            cue_active: d.cue_active,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct AppSnapshot {
    pub decks: Vec<DeckSnapshot>,
    pub crossfader: f32,
}
