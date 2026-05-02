# PHASE-SP-3 — Serato planner Tauri app

Plan: `.claude/plans/SP-serato-set-planner.md` → "SP-3 — Serato planner Tauri app".

## Scope

A standalone Tauri desktop app (`apps/serato-planner`) that opens the user's Serato library, lets them browse/filter the full track list, walk a recursive suggestion graph, and assemble a new crate (or edit an existing one) for Serato to pick up on next launch.

Layout based on the user's hand-sketched mock (`.claude/images/set-planner-layout.jpeg`):

- **Top half (fixed 55%)**: Crates sidebar (left) · Graph view (centre) · Working crate (right). Each pane scrolls independently.
- **Bottom half**: full-width library list with filter input + sortable columns.
- No decks, no audio.

## Files added

| Path | Note |
|---|---|
| `apps/serato-planner/package.json` | Frontend deps (React, Tauri API, dialog plugin). |
| `apps/serato-planner/vite.config.ts` | Port 1421 (avoids spidj's 1420). |
| `apps/serato-planner/tsconfig{.json,.node.json}`, `tailwind.config.js`, `postcss.config.js`, `index.html` | Standard Vite + Tailwind scaffold. |
| `apps/serato-planner/src/{main,App,index.css,types}.{ts,tsx,css}` | Frontend entry + state shape. |
| `apps/serato-planner/src/ipc/tauri.ts` | Typed IPC wrappers. |
| `apps/serato-planner/src/components/LibraryBar.tsx` | Folder picker + count display. |
| `apps/serato-planner/src/components/Settings.tsx` | Criterion toggles + strictness slider. |
| `apps/serato-planner/src/components/CratesSidebar.tsx` | List existing crates + "New crate". |
| `apps/serato-planner/src/components/LibraryList.tsx` | Filterable / sortable full library. |
| `apps/serato-planner/src/components/GraphCanvas.tsx` | Anchor + radial leaf nodes; all reasons visible inline. |
| `apps/serato-planner/src/components/WorkingCrate.tsx` | Drag-reorder, remove, re-anchor, save. |
| `apps/serato-planner/src-tauri/Cargo.toml` | Backend crate; depends on `spidj-engine` + `serato-io`. |
| `apps/serato-planner/src-tauri/build.rs`, `tauri.conf.json`, `capabilities/default.json` | Tauri scaffold. |
| `apps/serato-planner/src-tauri/icons/*` | Copied from spidj. |
| `apps/serato-planner/src-tauri/src/main.rs`, `lib.rs`, `commands.rs` | Backend entry + Tauri command handlers. |
| `apps/serato-planner/src-tauri/src/key_normalize.rs` | Classical → Camelot conversion. |

## Backend Tauri commands

| Command | Inputs | Returns |
|---|---|---|
| `library_open` | folder path | `LibrarySummary` (count + path) |
| `library_all_tracks` | (none) | `Vec<Track>` (sorted by title) |
| `library_get_track` | id | `Option<Track>` |
| `engine_suggest` | anchorId, config, alreadyShown | `SuggestResult` |
| `crate_list` | (none) | `Vec<CrateSummary>` |
| `crate_load` | name | `Vec<Track>` (resolves missing paths to placeholder) |
| `crate_write` | name, trackIds, overwrite | path |

`serato-io` extended with `read_crate`, `list_crates`, and an `overwrite` flag on `write_crate` (with `.crate.bak` backup before overwriting).

## Files modified

- `Cargo.toml` (workspace) — added `apps/serato-planner/src-tauri`.
- `package.json` (workspace) — added a `planner` proxy script.
- `crates/serato-io/src/{lib,crate_writer}.rs` — added `read_crate`, `list_crates`, `CrateInfo`, overwrite flag, backup behaviour.

## Acceptance checks

Walked successfully on 2026-05-02 with the user's real `_Serato_` library:

1. ☑ `cargo check --workspace` clean.
2. ☑ `cargo test --workspace` clean (engine 34 + serato-io 14).
3. ☑ `npx tsc -b` clean in `apps/serato-planner/`.
4. ☑ `npm run tauri dev` opens window with no errors.
5. ☑ Choose folder → library populates with 77 tracks.
6. ☑ Crates sidebar lists existing crates (DJ Music, spidj-spike-test).
7. ☑ Click a track in the library → anchor + first-track-of-new-crate seeded.
8. ☑ Suggestions render around the anchor with all reasons visible inline.
9. ☑ Click a suggestion → adds to working crate + walks anchor.
10. ☑ Drag rows in working crate to reorder.
11. ☑ Type a name + Save → `.crate` written, appears in crate sidebar.
12. ☑ Click an existing crate → loads its tracks into working area for editing.

## Open questions / known gaps

- **Key normalisation tested in isolation only.** The user's library has a mix of classical (`Fm`, `F#m`) and Camelot (`4A`, `11A`) notations. The `key_normalize` module converts at `library_open` time so the engine matches consistently. End-to-end suggestion-quality validation against the real library is the next user-facing test.
- **Overwriting an existing crate**: the writer makes a `<name>.crate.bak` backup before clobbering. Single backup slot — second overwrite wipes the first backup. Adequate for now; multi-version history is post-MVP.
- **Per-track reasons**: all reasons rendered inline on each leaf node (primary in red, rest dim white). No tooltip-only data.
- **Anchor seeds the new crate's first slot**: only when starting fresh; editing an existing crate doesn't auto-add the anchor.
- **No track preview / playback**: out of scope for the planner.
- **No ID3 fallback**: tracks Serato hasn't analysed (no BPM, no key) appear with `—` and contribute 0 to those criteria. M10 covers real analysis if/when we want it.
- **Crate sort stability**: list_crates returns case-insensitive alphabetical. Doesn't preserve Serato's nesting hierarchy (subcrates inside crates) — the file format stores nesting in the filesystem layout but we treat all `.crate` files in `Subcrates/` as flat. Acceptable for MVP.
- **"Already shown" exclusion**: when re-anchoring, suggestions that are already in the working crate are excluded. This means a track can never be added twice (intentional).

## Status

**Code complete and walked end-to-end on 2026-05-02.** User confirmed the layout works and basic save flow functions. SP-3 ships the planner; SP-4 below is the formal acceptance walkthrough we just performed.

Next polish pass items, when we revisit:
- A "delete crate" command and UI button.
- Visual feedback during drag-reorder (placeholder line where the row will land).
- Settings panel persistence across launches via `tauri-plugin-fs`.
- Album-art-color hash from track path to give each row a colour cue.
