//! Seeded mock library. Mirrors `apps/spidj/src/engine/mockLibrary.ts`.
//!
//! Same PRNG (mulberry32, seed 42), same structures. The Rust and TS
//! versions stay byte-identical so behaviour is comparable across both
//! engines.

use crate::camelot::CAMELOT_KEYS;
use crate::types::Track;

const GENRES: [&str; 4] = [
    "Melodic Techno",
    "Deep House",
    "Progressive House",
    "Drum & Bass",
];

fn bpm_range(genre: &str) -> (i32, i32) {
    match genre {
        "Melodic Techno" => (118, 126),
        "Deep House" => (118, 124),
        "Progressive House" => (120, 128),
        "Drum & Bass" => (168, 176),
        _ => (120, 128),
    }
}

fn artist_pool(genre: &str) -> &'static [&'static str] {
    match genre {
        "Melodic Techno" => &[
            "Argy", "Kevin de Vries", "Mind Against", "Massano", "Anyma",
            "Adriatique", "Colyn", "Innellea",
        ],
        "Deep House" => &[
            "Ben Sterling", "Cinthie", "Mall Grab", "Folamour", "Honey Dijon", "Move D",
        ],
        "Progressive House" => &[
            "Yotto", "Cristoph", "Eli & Fur", "Tinlicker", "Nora En Pure", "Marsh",
        ],
        "Drum & Bass" => &[
            "Sub Focus", "Dimension", "Wilkinson", "Hybrid Minds", "Kanine", "Bou",
        ],
        _ => &[],
    }
}

fn tag_pool(genre: &str) -> &'static [&'static str] {
    match genre {
        "Melodic Techno" => &[
            "rolling", "hypnotic", "peak time", "driving",
            "dark", "emotional", "cinematic", "arpeggiated",
        ],
        "Deep House" => &[
            "groovy", "jackin", "warm", "late night", "raw", "soulful", "disco edge",
        ],
        "Progressive House" => &[
            "uplifting", "sunset", "euphoric", "tribal", "big room", "atmospheric",
        ],
        "Drum & Bass" => &[
            "liquid", "rolling", "techy", "jump up", "minimal", "vocal",
        ],
        _ => &[],
    }
}

const TITLE_PARTS_A: [&str; 20] = [
    "Hidden", "Liminal", "Glass", "Iron", "Velvet", "Cinder", "Halcyon",
    "Mirror", "Static", "Phantom", "Northern", "Concrete", "Salt", "Echo",
    "Brass", "Slate", "Distant", "Black", "Ancient", "Slow",
];
const TITLE_PARTS_B: [&str; 20] = [
    "Tides", "Hours", "Geometry", "Pilgrim", "Engine", "Choir", "Distance",
    "Hours", "Drift", "Signal", "Lights", "Garden", "Halo", "Procession",
    "Theory", "Memory", "Vow", "Passage", "Fever", "Dial",
];
const ALBUM_ART_PALETTE: [&str; 8] = [
    "#1a1d22", "#22262c", "#c8302e", "#a02220", "#3b3f47",
    "#1f2126", "#2c1f1f", "#1c2a2e",
];

/// mulberry32 — same PRNG as the TS port. Matches output bit-for-bit.
struct Mulberry32 {
    state: u32,
}

impl Mulberry32 {
    fn new(seed: u32) -> Self {
        Self { state: seed }
    }

    /// Returns a float in [0, 1).
    fn next(&mut self) -> f64 {
        // The TS version mutates `a` first (`let t = a += 0x6d2b79f5`),
        // so we add before using. Wrapping arithmetic mirrors JS's
        // implicit u32 truncation in the right places.
        self.state = self.state.wrapping_add(0x6d2b79f5);
        let mut t = self.state;
        t = t.wrapping_mul(t ^ (t >> 15) | 1).wrapping_add(0).wrapping_mul(1);
        // The above doesn't quite mirror Math.imul. Recompute:
        let a = t ^ (t >> 15);
        let b = t | 1;
        t = imul(a, b);
        let a2 = t ^ (t >> 7);
        let b2 = t | 61;
        t ^= t.wrapping_add(imul(a2, b2));
        ((t ^ (t >> 14)) as f64) / 4_294_967_296.0
    }
}

/// Equivalent of JavaScript's Math.imul: 32-bit integer multiplication
/// with truncation. Two-step to match JS semantics on both signed and
/// unsigned interpretations.
fn imul(a: u32, b: u32) -> u32 {
    a.wrapping_mul(b)
}

#[derive(Default)]
struct MockOpts<'a> {
    genre: Option<&'a str>,
    bpm: Option<f32>,
    key: Option<String>,
    artist: Option<String>,
    title: Option<String>,
    year: Option<i32>,
    tags: Option<Vec<String>>,
    energy: Option<u8>,
}

struct Factory {
    rng: Mulberry32,
}

impl Factory {
    fn new(seed: u32) -> Self {
        Self { rng: Mulberry32::new(seed) }
    }

    fn rand(&mut self) -> f64 {
        self.rng.next()
    }

    fn pick_index(&mut self, len: usize) -> usize {
        let idx = (self.rand() * len as f64).floor() as usize;
        if len == 0 { 0 } else { idx.min(len - 1) }
    }

    fn pick_str<'a>(&mut self, arr: &'a [&'a str]) -> &'a str {
        arr[self.pick_index(arr.len())]
    }

    fn pick_n(&mut self, arr: &[&'static str], n: usize) -> Vec<String> {
        let mut copy: Vec<&'static str> = arr.to_vec();
        let mut out = Vec::with_capacity(n);
        for _ in 0..n {
            if copy.is_empty() {
                break;
            }
            let idx = self.pick_index(copy.len());
            out.push(copy.remove(idx).to_string());
        }
        out
    }

    fn make_track(&mut self, id: &str, opts: MockOpts) -> Track {
        let genre = opts
            .genre
            .map(|s| s.to_string())
            .unwrap_or_else(|| self.pick_str(&GENRES).to_string());
        let (lo, hi) = bpm_range(&genre);
        let bpm = opts
            .bpm
            .unwrap_or_else(|| (lo as f64 + self.rand() * (hi - lo) as f64).round() as f32);
        let key = opts
            .key
            .unwrap_or_else(|| self.pick_str(&CAMELOT_KEYS).to_string());
        let artist = opts
            .artist
            .unwrap_or_else(|| self.pick_str(artist_pool(&genre)).to_string());
        let title = opts.title.unwrap_or_else(|| {
            format!(
                "{} {}",
                self.pick_str(&TITLE_PARTS_A),
                self.pick_str(&TITLE_PARTS_B)
            )
        });
        let year = opts
            .year
            .unwrap_or_else(|| 2018 + (self.rand() * 8.0).floor() as i32);
        let tags = opts.tags.unwrap_or_else(|| {
            let n = 1 + (self.rand() * 3.0).floor() as usize;
            self.pick_n(tag_pool(&genre), n)
        });
        let energy = opts
            .energy
            .unwrap_or_else(|| 3 + (self.rand() * 7.0).floor() as u8);
        let album_art_color = self.pick_str(&ALBUM_ART_PALETTE).to_string();

        Track {
            id: id.to_string(),
            title,
            artist,
            bpm,
            key: Some(key),
            genre,
            year,
            tags,
            energy,
            album_art_color,
            duration: None,
        }
    }
}

#[derive(Debug, Clone)]
pub struct MockLibraryBundle {
    pub library: Vec<Track>,
    pub anchor: Track,
    pub deck_b_default: Track,
}

/// Build the canonical mock library. Deterministic for a given seed.
pub fn build_mock_library(seed: u32) -> MockLibraryBundle {
    let mut f = Factory::new(seed);

    let anchor = f.make_track(
        "t-anchor",
        MockOpts {
            title: Some("Hidden Geometry".into()),
            artist: Some("Mind Against".into()),
            bpm: Some(124.0),
            key: Some("8A".into()),
            genre: Some("Melodic Techno"),
            year: Some(2024),
            tags: Some(vec!["rolling".into(), "hypnotic".into(), "peak time".into()]),
            energy: Some(7),
        },
    );

    let mut library: Vec<Track> = vec![anchor.clone()];
    for i in 0..40 {
        let genre: &'static str = if i < 18 {
            "Melodic Techno"
        } else {
            f.pick_str(&GENRES)
        };
        let mut opts = MockOpts {
            genre: Some(genre),
            ..Default::default()
        };
        if i < 6 {
            opts.key = Some("8A".into());
        } else if i < 10 {
            opts.key = Some(f.pick_str(&["7A", "9A", "8B"]).to_string());
        }
        if i % 7 == 0 {
            opts.artist = Some("Mind Against".into());
        }
        if i % 5 == 0 && genre == "Melodic Techno" {
            opts.tags =
                Some(f.pick_n(&["rolling", "hypnotic", "peak time", "driving"], 2));
        }
        library.push(f.make_track(&format!("t-{}", i), opts));
    }

    let deck_b_default = f.make_track(
        "t-deckb",
        MockOpts {
            title: Some("Slow Procession".into()),
            artist: Some("Adriatique".into()),
            bpm: Some(122.0),
            key: Some("9A".into()),
            genre: Some("Melodic Techno"),
            year: Some(2023),
            tags: Some(vec!["emotional".into(), "cinematic".into()]),
            energy: Some(6),
        },
    );
    library.push(deck_b_default.clone());

    MockLibraryBundle {
        library,
        anchor,
        deck_b_default,
    }
}
