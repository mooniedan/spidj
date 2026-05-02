//! Read Serato's `database V2` and project records into `spidj_engine::Track`.
//!
//! The format is the same record container used by `.crate` files. Each
//! track is an `otrk` record whose payload is a nested sequence; we extract:
//!
//! | Sub-record | Type | Track field |
//! |---|---|---|
//! | `pfil` | UTF-16 BE | `id` (Serato library path; deduplicated) |
//! | `tsng` | UTF-16 BE | `title` |
//! | `tart` | UTF-16 BE | `artist` |
//! | `tgen` | UTF-16 BE | `genre` |
//! | `tbpm` | UTF-16 BE | `bpm` (string-encoded float) |
//! | `tkey` | UTF-16 BE | `key` (Camelot-style if Serato has analysed) |
//! | `tyr ` | UTF-16 BE | `year` |
//!
//! Other sub-records (cue points, beatgrids, waveform overviews, etc.) are
//! ignored. Tags are left empty for MVP — Serato's free-text comment field
//! is in `tcom`/`tcmt` but parsing it into structured tags is out of scope.

use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

use spidj_engine::Track;

use crate::record::{decode_utf16_be, parse_nested, parse_records};

#[derive(Debug, thiserror::Error)]
pub enum LibraryError {
    #[error("Serato folder does not exist: {0}")]
    NoFolder(PathBuf),
    #[error("no `database V2` found at {0}")]
    NoDatabase(PathBuf),
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
    #[error("parse: {0}")]
    Parse(String),
}

/// In-memory snapshot of the Serato library.
#[derive(Debug, Clone, Default)]
pub struct Library {
    pub tracks: Vec<Track>,
    pub by_id: HashMap<String, usize>,
}

impl Library {
    pub fn track(&self, id: &str) -> Option<&Track> {
        self.by_id.get(id).and_then(|&i| self.tracks.get(i))
    }
}

/// Open the Serato library at `serato_root` (the `_Serato_` folder itself,
/// not its parent).
pub fn open_serato_library(serato_root: &Path) -> Result<Library, LibraryError> {
    if !serato_root.exists() {
        return Err(LibraryError::NoFolder(serato_root.to_path_buf()));
    }
    let db_path = serato_root.join("database V2");
    if !db_path.exists() {
        return Err(LibraryError::NoDatabase(db_path));
    }

    let bytes = fs::read(&db_path)?;
    let top = parse_records(&bytes).map_err(|e| LibraryError::Parse(e.to_string()))?;

    let mut tracks: Vec<Track> = Vec::new();
    let mut by_id: HashMap<String, usize> = HashMap::new();

    for rec in top {
        if rec.tag_str() != "otrk" {
            continue;
        }
        let inner = match parse_nested(&rec.payload) {
            Ok(v) => v,
            Err(_) => continue, // skip malformed tracks
        };

        let mut path: Option<String> = None;
        let mut title: Option<String> = None;
        let mut artist: Option<String> = None;
        let mut genre: Option<String> = None;
        let mut bpm: Option<f32> = None;
        let mut key: Option<String> = None;
        let mut year: Option<i32> = None;

        for sub in inner {
            let s = decode_utf16_be(&sub.payload);
            match sub.tag_str() {
                "pfil" => path = s,
                "tsng" => title = s,
                "tart" => artist = s,
                "tgen" => genre = s,
                "tbpm" => bpm = s.and_then(|v| parse_loose_f32(&v)),
                "tkey" => key = s.filter(|v| !v.is_empty()),
                "tyr " | "tyr" => year = s.and_then(|v| v.trim().parse::<i32>().ok()),
                _ => {}
            }
        }

        let Some(path) = path else { continue };
        let title = title.unwrap_or_else(|| filename_from_path(&path));
        let artist = artist.unwrap_or_default();
        let genre = genre.unwrap_or_default();
        let bpm = bpm.unwrap_or(0.0);
        let year = year.unwrap_or(0);

        let track = Track {
            id: path.clone(),
            title,
            artist,
            bpm,
            key,
            genre,
            tags: Vec::new(),
            year,
            energy: 5,
            album_art_color: "#22262c".into(),
            duration: None,
        };

        use std::collections::hash_map::Entry;
        if let Entry::Vacant(slot) = by_id.entry(path) {
            slot.insert(tracks.len());
            tracks.push(track);
        }
    }

    Ok(Library { tracks, by_id })
}

fn parse_loose_f32(s: &str) -> Option<f32> {
    s.trim().parse::<f32>().ok().filter(|v| v.is_finite())
}

fn filename_from_path(p: &str) -> String {
    p.rsplit(['/', '\\']).next().unwrap_or(p).to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::record::{encode_utf16_be, Record};

    /// Build a minimal `database V2` payload with one synthetic track.
    fn synthetic_db(track_path: &str) -> Vec<u8> {
        // Build the inner record list for the track:
        let mut inner = Vec::new();
        Record::new(b"pfil", encode_utf16_be(track_path)).encode(&mut inner);
        Record::new(b"tsng", encode_utf16_be("Test Title")).encode(&mut inner);
        Record::new(b"tart", encode_utf16_be("Test Artist")).encode(&mut inner);
        Record::new(b"tgen", encode_utf16_be("Melodic Techno")).encode(&mut inner);
        Record::new(b"tbpm", encode_utf16_be("124.0")).encode(&mut inner);
        Record::new(b"tkey", encode_utf16_be("8A")).encode(&mut inner);
        Record::new(b"tyr ", encode_utf16_be("2024")).encode(&mut inner);

        let mut top = Vec::new();
        Record::new(b"vrsn", encode_utf16_be("synthetic")).encode(&mut top);
        Record::new(b"otrk", inner).encode(&mut top);
        top
    }

    #[test]
    fn open_synthetic_library_via_temp_dir() {
        let dir = tempdir();
        std::fs::write(
            dir.path().join("database V2"),
            synthetic_db("Users/test/Music/foo.mp3"),
        )
        .unwrap();

        let lib = open_serato_library(dir.path()).unwrap();
        assert_eq!(lib.tracks.len(), 1);
        let t = &lib.tracks[0];
        assert_eq!(t.id, "Users/test/Music/foo.mp3");
        assert_eq!(t.title, "Test Title");
        assert_eq!(t.artist, "Test Artist");
        assert_eq!(t.genre, "Melodic Techno");
        assert_eq!(t.bpm, 124.0);
        assert_eq!(t.key.as_deref(), Some("8A"));
        assert_eq!(t.year, 2024);
        assert!(lib.track("Users/test/Music/foo.mp3").is_some());
    }

    #[test]
    fn missing_folder_errors() {
        let dir = tempdir();
        let bogus = dir.path().join("nope");
        let err = open_serato_library(&bogus).unwrap_err();
        assert!(matches!(err, LibraryError::NoFolder(_)));
    }

    #[test]
    fn missing_database_errors() {
        let dir = tempdir();
        let err = open_serato_library(dir.path()).unwrap_err();
        assert!(matches!(err, LibraryError::NoDatabase(_)));
    }

    /// Tiny stand-in for `tempfile::TempDir` so we don't pull in a dep.
    /// Creates a unique temp directory and removes it on Drop.
    fn tempdir() -> TempDirHandle {
        use std::sync::atomic::{AtomicU64, Ordering};
        static N: AtomicU64 = AtomicU64::new(0);
        let n = N.fetch_add(1, Ordering::Relaxed);
        let path = std::env::temp_dir().join(format!(
            "spidj-serato-io-test-{}-{}",
            std::process::id(),
            n
        ));
        std::fs::create_dir_all(&path).unwrap();
        TempDirHandle(path)
    }

    struct TempDirHandle(PathBuf);
    impl TempDirHandle {
        fn path(&self) -> &Path {
            &self.0
        }
    }
    impl Drop for TempDirHandle {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }
}
