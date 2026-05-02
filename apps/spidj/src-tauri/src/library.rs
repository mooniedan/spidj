use serde::Serialize;
use std::path::Path;
use symphonia::core::formats::FormatOptions;
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::MetadataOptions;
use symphonia::core::probe::Hint;
use walkdir::WalkDir;

const SUPPORTED_EXTS: &[&str] = &["mp3", "wav", "flac", "aac", "m4a"];

#[derive(Debug, Clone, Serialize)]
pub struct TrackEntry {
    pub path: String,
    pub filename: String,
    pub title: Option<String>,
    pub artist: Option<String>,
    pub duration_seconds: Option<f64>,
}

pub fn scan_folder(root: &Path) -> Vec<TrackEntry> {
    let mut out = Vec::new();
    for entry in WalkDir::new(root).max_depth(8).into_iter().flatten() {
        if !entry.file_type().is_file() {
            continue;
        }
        let path = entry.path();
        let ext_ok = path
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| SUPPORTED_EXTS.contains(&e.to_ascii_lowercase().as_str()))
            .unwrap_or(false);
        if !ext_ok {
            continue;
        }

        let filename = path
            .file_name()
            .and_then(|f| f.to_str())
            .unwrap_or("?")
            .to_string();

        let (title, artist, duration_seconds) = probe_metadata(path).unwrap_or((None, None, None));

        out.push(TrackEntry {
            path: path.to_string_lossy().to_string(),
            filename,
            title,
            artist,
            duration_seconds,
        });
    }
    out
}

fn probe_metadata(
    path: &Path,
) -> Option<(Option<String>, Option<String>, Option<f64>)> {
    let file = std::fs::File::open(path).ok()?;
    let mss = MediaSourceStream::new(Box::new(file), Default::default());
    let mut hint = Hint::new();
    if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
        hint.with_extension(ext);
    }
    let probed = symphonia::default::get_probe()
        .format(&hint, mss, &FormatOptions::default(), &MetadataOptions::default())
        .ok()?;

    let mut format = probed.format;
    let track = format.default_track()?;
    let sample_rate = track.codec_params.sample_rate.unwrap_or(0);
    let n_frames = track.codec_params.n_frames.unwrap_or(0);
    let duration_seconds = if sample_rate > 0 && n_frames > 0 {
        Some(n_frames as f64 / sample_rate as f64)
    } else {
        None
    };

    let mut title = None;
    let mut artist = None;
    if let Some(metadata) = format.metadata().current() {
        for tag in metadata.tags() {
            let key = tag.std_key.map(|k| format!("{:?}", k)).unwrap_or_default();
            let val = tag.value.to_string();
            match key.as_str() {
                "TrackTitle" => {
                    title.get_or_insert(val);
                }
                "Artist" | "AlbumArtist" => {
                    artist.get_or_insert(val);
                }
                _ => {}
            }
        }
    }

    Some((title, artist, duration_seconds))
}
