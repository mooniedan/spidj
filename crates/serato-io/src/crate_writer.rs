//! Write a fresh `.crate` file Serato will pick up on next launch.
//!
//! Format (verified against a real Serato library by the SP-2 spike):
//!   `vrsn` record with payload `"1.0/Serato ScratchLive Crate"` (UTF-16 BE)
//!   one `otrk` record per track, payload contains a nested `ptrk` record
//!     holding the file path (UTF-16 BE).
//!
//! `osrt` (sort spec) and `ovct` (column visibility) records are NOT written;
//! Serato adds them itself the first time the user interacts with the crate.
//!
//! Path encoding: forward slashes, no drive letter, no leading slash. Pass
//! whatever `Library::tracks[i].id` reports — the database stores paths in
//! exactly the form `.crate` files reference them.

use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

use crate::record::{decode_utf16_be, encode_utf16_be, parse_records, Record};

const VERSION_PAYLOAD: &str = "1.0/Serato ScratchLive Crate";

#[derive(Debug, thiserror::Error)]
pub enum CrateWriteError {
    #[error("crate name is empty after sanitisation")]
    EmptyName,
    #[error("crate `{name}` already exists at {path:?}; refuse to overwrite")]
    AlreadyExists { name: String, path: PathBuf },
    #[error("`{0}` is not a directory")]
    NotADirectory(PathBuf),
    #[error("parse: {0}")]
    Parse(String),
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
}

/// Write `track_paths` as a `.crate` named `name` into
/// `serato_root/Subcrates/`. With `overwrite = false`, refuses to clobber an
/// existing crate. With `overwrite = true`, makes a `.crate.bak` of any
/// existing file before replacing it.
pub fn write_crate(
    serato_root: &Path,
    name: &str,
    track_paths: &[String],
    overwrite: bool,
) -> Result<PathBuf, CrateWriteError> {
    let safe = sanitize_name(name);
    if safe.is_empty() {
        return Err(CrateWriteError::EmptyName);
    }

    let subcrates = serato_root.join("Subcrates");
    if !subcrates.exists() {
        fs::create_dir_all(&subcrates)?;
    } else if !subcrates.is_dir() {
        return Err(CrateWriteError::NotADirectory(subcrates));
    }

    let target = subcrates.join(format!("{safe}.crate"));
    if target.exists() {
        if !overwrite {
            return Err(CrateWriteError::AlreadyExists {
                name: safe,
                path: target,
            });
        }
        // Make a single-slot backup before clobbering.
        let bak = target.with_extension("crate.bak");
        let _ = fs::remove_file(&bak);
        fs::copy(&target, &bak)?;
    }

    let bytes = build_crate_bytes(track_paths);

    // Atomic write: <name>.crate.tmp then rename. The .tmp must live in the
    // same directory so the rename is on the same filesystem.
    let tmp = target.with_extension("crate.tmp");
    {
        let mut f = fs::File::create(&tmp)?;
        f.write_all(&bytes)?;
        f.sync_all()?;
    }
    fs::rename(&tmp, &target)?;

    Ok(target)
}

/// Read the track paths recorded in a single `.crate` file. Returns the
/// list in original order (as written; not as Serato might display them).
pub fn read_crate(path: &Path) -> Result<Vec<String>, CrateWriteError> {
    let bytes = fs::read(path)?;
    let top = parse_records(&bytes)
        .map_err(|e| CrateWriteError::Parse(e.to_string()))?;
    let mut out = Vec::new();
    for rec in top {
        if rec.tag_str() != "otrk" {
            continue;
        }
        let inner = parse_records(&rec.payload)
            .map_err(|e| CrateWriteError::Parse(e.to_string()))?;
        for sub in inner {
            if sub.tag_str() == "ptrk" {
                if let Some(p) = decode_utf16_be(&sub.payload) {
                    out.push(p);
                }
                break;
            }
        }
    }
    Ok(out)
}

#[derive(Debug, Clone)]
pub struct CrateInfo {
    /// Crate name = filename without `.crate`.
    pub name: String,
    /// Absolute path to the `.crate` file.
    pub path: PathBuf,
    /// Number of `otrk` records in the file.
    pub track_count: usize,
}

/// Enumerate `.crate` files in `serato_root/Subcrates/`. Skips files that
/// fail to parse rather than failing the whole listing.
pub fn list_crates(serato_root: &Path) -> Result<Vec<CrateInfo>, CrateWriteError> {
    let subcrates = serato_root.join("Subcrates");
    if !subcrates.exists() {
        return Ok(Vec::new());
    }
    let mut out = Vec::new();
    for entry in fs::read_dir(&subcrates)? {
        let entry = entry?;
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("crate") {
            continue;
        }
        let Some(stem) = path.file_stem().and_then(|s| s.to_str()) else {
            continue;
        };
        let track_count = match read_crate(&path) {
            Ok(v) => v.len(),
            Err(_) => continue,
        };
        out.push(CrateInfo {
            name: stem.to_string(),
            path,
            track_count,
        });
    }
    out.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(out)
}

/// Strip filesystem-illegal characters so the crate name can be a filename.
/// Replaces `/ \ : * ? " < > |` with `-`; trims surrounding whitespace.
pub fn sanitize_name(name: &str) -> String {
    name.trim()
        .chars()
        .map(|c| match c {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '-',
            _ => c,
        })
        .collect::<String>()
        .trim()
        .to_string()
}

/// Build the byte representation of a `.crate` from a list of track paths.
/// Public for tests and for future SP-3 in-memory previews.
pub fn build_crate_bytes(track_paths: &[String]) -> Vec<u8> {
    let mut out = Vec::new();

    Record::new(b"vrsn", encode_utf16_be(VERSION_PAYLOAD)).encode(&mut out);

    for path in track_paths {
        let mut otrk_payload = Vec::new();
        Record::new(b"ptrk", encode_utf16_be(path)).encode(&mut otrk_payload);
        Record::new(b"otrk", otrk_payload).encode(&mut out);
    }

    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::record::{decode_utf16_be, parse_records};

    #[test]
    fn sanitize_strips_path_chars() {
        assert_eq!(sanitize_name("hello"), "hello");
        assert_eq!(sanitize_name("  trimmed  "), "trimmed");
        assert_eq!(sanitize_name("a/b\\c:d*e"), "a-b-c-d-e");
        assert_eq!(sanitize_name("with \"quotes\""), "with -quotes-");
    }

    #[test]
    fn build_round_trips() {
        let bytes = build_crate_bytes(&[
            "Users/x/foo.mp3".into(),
            "Users/x/bar.mp3".into(),
        ]);
        let records = parse_records(&bytes).unwrap();
        assert_eq!(records.len(), 3);
        assert_eq!(records[0].tag_str(), "vrsn");
        assert_eq!(
            decode_utf16_be(&records[0].payload).as_deref(),
            Some(VERSION_PAYLOAD)
        );
        assert_eq!(records[1].tag_str(), "otrk");
        assert_eq!(records[2].tag_str(), "otrk");

        let inner1 = parse_records(&records[1].payload).unwrap();
        assert_eq!(inner1.len(), 1);
        assert_eq!(inner1[0].tag_str(), "ptrk");
        assert_eq!(
            decode_utf16_be(&inner1[0].payload).as_deref(),
            Some("Users/x/foo.mp3")
        );
    }

    fn temp_root(tag: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "spidj-{}-{}-{}",
            tag,
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn refuses_to_overwrite_when_disabled() {
        let dir = temp_root("overwrite");
        let first = write_crate(&dir, "set", &["Users/x/foo.mp3".into()], false);
        assert!(first.is_ok());

        let second = write_crate(&dir, "set", &["Users/x/foo.mp3".into()], false);
        assert!(matches!(second, Err(CrateWriteError::AlreadyExists { .. })));

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn overwrite_replaces_and_makes_backup() {
        let dir = temp_root("overwrite-backup");
        write_crate(&dir, "set", &["Users/x/old.mp3".into()], false).unwrap();
        write_crate(&dir, "set", &["Users/x/new.mp3".into()], true).unwrap();

        let target = dir.join("Subcrates").join("set.crate");
        let bak = target.with_extension("crate.bak");
        assert!(target.exists() && bak.exists());

        let new_paths = read_crate(&target).unwrap();
        assert_eq!(new_paths, vec!["Users/x/new.mp3"]);
        let old_paths = read_crate(&bak).unwrap();
        assert_eq!(old_paths, vec!["Users/x/old.mp3"]);

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn empty_name_errors() {
        let dir = temp_root("empty-name");
        let r = write_crate(&dir, "   ", &["foo".into()], false);
        assert!(matches!(r, Err(CrateWriteError::EmptyName)));
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn read_crate_round_trip() {
        let dir = temp_root("read-round-trip");
        let target = write_crate(
            &dir,
            "round",
            &["Users/x/a.mp3".into(), "Users/x/b.mp3".into()],
            false,
        )
        .unwrap();
        let paths = read_crate(&target).unwrap();
        assert_eq!(paths, vec!["Users/x/a.mp3", "Users/x/b.mp3"]);
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn list_crates_returns_sorted() {
        let dir = temp_root("list-crates");
        write_crate(&dir, "Zebra", &["Users/x/z.mp3".into()], false).unwrap();
        write_crate(&dir, "alpha", &["Users/x/a.mp3".into(), "Users/x/b.mp3".into()], false).unwrap();
        write_crate(&dir, "Mango", &["Users/x/m.mp3".into()], false).unwrap();

        let crates = list_crates(&dir).unwrap();
        let names: Vec<&str> = crates.iter().map(|c| c.name.as_str()).collect();
        assert_eq!(names, vec!["alpha", "Mango", "Zebra"]);
        let counts: Vec<usize> = crates.iter().map(|c| c.track_count).collect();
        assert_eq!(counts, vec![2, 1, 1]);
        std::fs::remove_dir_all(&dir).ok();
    }
}
