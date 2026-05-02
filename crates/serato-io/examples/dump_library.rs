//! Smoke check: open the user's real Serato library and print a summary.
//! Usage:
//!   cargo run --example dump_library                 (auto-detect)
//!   cargo run --example dump_library -- C:/path/to/_Serato_

use std::path::PathBuf;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let root: PathBuf = std::env::args().nth(1).map(PathBuf::from).unwrap_or_else(|| {
        let home = std::env::var("USERPROFILE")
            .or_else(|_| std::env::var("HOME"))
            .expect("need USERPROFILE or HOME");
        PathBuf::from(home).join("Music").join("_Serato_")
    });

    let lib = serato_io::open_serato_library(&root)?;
    println!(
        "[serato-io] {}: {} tracks",
        root.display(),
        lib.tracks.len()
    );
    for (i, t) in lib.tracks.iter().take(5).enumerate() {
        println!(
            "  [{}] {} — {} ({} BPM, {})",
            i,
            t.title,
            t.artist,
            t.bpm,
            t.key.as_deref().unwrap_or("--")
        );
    }
    Ok(())
}
