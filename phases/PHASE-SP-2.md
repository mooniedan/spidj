# PHASE-SP-2 — Serato I/O crate

Plan: `.claude/plans/SP-serato-set-planner.md` → "SP-2 — Serato I/O crate".

## Scope

Read Serato's `database V2` into `Vec<spidj_engine::Track>` and write fresh `.crate` files Serato picks up on next launch. Hand-rolled record parser/writer; no external Serato library. Format previously verified end-to-end by the SP-2 spike (`spike/`).

## Files added

| Path | Note |
|---|---|
| `crates/serato-io/Cargo.toml` | Crate manifest. Depends on `spidj-engine` for `Track`. |
| `crates/serato-io/src/lib.rs` | Module re-exports + format docs. |
| `crates/serato-io/src/record.rs` | Tag/length container parser + writer (used by both library reads and crate writes). |
| `crates/serato-io/src/library.rs` | `open_serato_library(folder) -> Library`. Maps `pfil`/`tsng`/`tart`/`tgen`/`tbpm`/`tkey`/`tyr ` records to `Track` fields. |
| `crates/serato-io/src/crate_writer.rs` | `write_crate(folder, name, paths) -> PathBuf`. Atomic write via `.tmp` + rename. |
| `crates/serato-io/examples/dump_library.rs` | Smoke check against a real Serato folder. |

## Files modified

- `Cargo.toml` (workspace) — added `crates/serato-io` to members.

## Acceptance checks

All passing on 2026-05-02:

1. ☑ `cargo build --workspace` clean.
2. ☑ `cargo test --package serato-io` — 11/11 tests pass (record parse/encode, UTF-16 round-trip, library read against synthetic DB, write-refuse-overwrite, sanitize-name, build-round-trip, missing-folder/db error paths).
3. ☑ `cargo clippy --package serato-io --tests -- -D warnings` clean.
4. ☑ `cargo run --example dump_library` against the user's real `_Serato_` reads **77 tracks**, exactly matching the SP-2 spike.
5. ☑ Sample real-library tracks show populated BPM, title, artist, and (where Serato analysed) key.

## Coverage of database V2 sub-records

| Sub-record | Use |
|---|---|
| `pfil` | Track id (path; deduplicated) |
| `tsng` | Title |
| `tart` | Artist |
| `tgen` | Genre |
| `tbpm` | BPM (string-parsed to f32) |
| `tkey` | Key (raw — see open question below) |
| `tyr ` / `tyr` | Year |

Other sub-records (cue points, beatgrids, waveform overviews, `tcom`, `tcmt`, etc.) are skipped. Tags vec is empty for MVP.

## Crate writer

- `write_crate(serato_root, name, &[paths]) -> Result<PathBuf>`.
- Builds `vrsn` + N × `otrk(ptrk)`. Format byte-identical to the spike's writer that Serato confirmed loads correctly.
- Sanitises `name` (strips `/ \ : * ? " < > |`).
- Atomic write: `<name>.crate.tmp` → rename.
- Refuses to overwrite an existing `.crate` of the same name (returns `CrateWriteError::AlreadyExists`).

## Open questions / new finding

- **Key notation**: Serato stores `tkey` in whichever notation the user has configured. The user's library shows `Fm`, `F#m` (classical) for some tracks and `4A`, `11A` (Camelot) for others. The engine's Camelot adjacency helper only matches Camelot-format strings. Fix landing in SP-3 or sooner: a normaliser that converts classical → Camelot at the library-load boundary, with a fallback of `None` for unparseable values (keys then contribute 0 to the score, which is the right behaviour for unknown data).
- **Tags from comment**: `tcom`/`tcmt` is a free-text comment. SP-3 may expose this as a single-string field rather than splitting into engine `tags`. Decide later.
- **Energy**: Serato doesn't expose this consistently. We default to 5. SP-3 may add an inline editor, mirroring the M4 plan's `track_overrides.json` approach.
- **Album art colour**: defaulted to `#22262c`. Could derive a per-track colour from a hash of the path (mirrors `prototypes/chrome.jsx::ArtBlock`); SP-3 work.
- **Database write-back**: still out of scope. We never modify `database V2` or pre-existing `.crate` files.

## Status

**Completed 2026-05-02.** Library reader + crate writer are production-ready against the spike's findings. Ready for SP-3 (the planner Tauri app) to wire these crates plus `spidj-engine` behind a UI.
