### M4 — Graph View UI shell (DETAILED — approved scope)

**Goal:** replace the current minimal UI with the full visual chrome from `requirements.md §5` — three-band layout, tab strip, CDJ-style deck chrome, polished library with inline metadata editing. Graph canvas itself is M5; M4 ships the shell that hosts it plus a "coming soon" placeholder.

**Out of scope for M4** (deferred): graph canvas + radial node layout (M5), anchor source switching logic (M5), Up Next queue (M6), settings modal + reason chips (M7), drag-and-drop matrix wiring (M8), demo states (M9).

#### Existing hooks we build on

- **M2 deck state** (`DeckSnapshot`, `AppSnapshot`) — chrome reads from these unchanged; just renders more of it.
- **M3 engine types** (`src/engine/types.ts::Track`) — library row data conforms to `Track`-shaped objects.
- **`prototypes/chrome.jsx`** — `ArtBlock` (procedural SVG art from track id) and `Waveform` (seeded PRNG bars) lift verbatim. `Deck`, `Library`, `TabStrip` adapted, not lifted whole.
- **`src/components/{Deck,Library,Crossfader,MidiBar,AudioBar}.tsx`** — current minimal versions get replaced or restructured under the new layout.

#### M4.0 — Layout shell + tab strip

Three-band flex layout:

- **Top deck row** (REQ-LAYOUT-02): fixed height ~28% of window; never collapses. Contains the two CDJ deck cards + crossfader strip across the bottom.
- **Middle band** (REQ-LAYOUT-05): tab strip at top (Graph active, Browse / Crates / History visibly disabled per REQ-LAYOUT-06). Below the strip, content area for the active tab. M4 renders only the Graph tab content and a "Graph canvas — coming in M5" placeholder.
- **Bottom band**: Library. Fills remaining height.
- **Drag handle** (REQ-LAYOUT-03) between middle and bottom band. Min/max constraints (REQ-LAYOUT-04 acceptance): library can't shrink below ~3 rows; middle band can't shrink below the tab strip + small padding.

**Top-of-window utility bars**: keep `AudioBar` + `MidiBar` from M2 visible above the deck row for now. M7 will tuck them into a settings drawer; for M4 they stay where they are.

`src/components/Layout/`:
- `Shell.tsx` — top-level three-band flex container; mounts utility bars + deck row + middle + library.
- `DragHandle.tsx` — a 6 px draggable horizontal bar that updates a `bottomBandHeight` style on the bottom band.
- `TabStrip.tsx` — adapted from `prototypes/chrome.jsx::TabStrip`. Click on Graph is a no-op for now (only one tab is functional). Browse / Crates / History show as disabled (60% opacity, no hover, no cursor-pointer).

#### M4.1 — Deck CDJ chrome (REQ-DECK-02)

Replace the current minimal deck card with a full CDJ-style layout:

```
┌─────────────────────────────────────────┐
│ DECK A          [LIVE pill]   [🎧 CUE]  │  header row
├─────────────────────────────────────────┤
│ ░░▒▓█▓▒░░▒▓█▓▒░░▒▓█▓▒░░▒▓█▓▒░░▒▓█▓▒░░ │  waveform strip
├─────────────────────────────────────────┤
│        ╭───────╮                ↕ pitch │
│        │ ◉ art │   124.0 BPM  ┃         │
│        │       │   8A   +0.0% ┃ thumb   │
│        ╰───────╯               ┃         │
│ Title — Artist                          │
│ ⏵ PLAY   ⊛ CUE   ⟲ SYNC                 │
│     [HI]  [MID]  [LOW]   ◉ headphones   │
└─────────────────────────────────────────┘
```

Pieces:
- **Spinning platter** (REQ-DECK-04): `<div class="platter">` containing `<ArtBlock>` (procedural art keyed by `track.path` so it's stable per-file) + concentric SVG ring overlay. CSS `@keyframes spin` rotates when `playing`. Glow + `LIVE` pill (REQ-DECK-05) ported from M2's existing implementation.
- **Waveform strip** (REQ-DECK-02): lift `prototypes/chrome.jsx::Waveform` verbatim, seed = hash of `track.path`. Static bars; no scroll. Real-waveform analysis is post-MVP.
- **Tempo display**: monospaced `BPM.x` + `±x.xx%` per REQ-STYLE-06. Read from `DeckSnapshot.pitch_percent` (already populated in M2).
- **Pitch fader**: vertical track + thumb visual; thumb position from `pitch_percent`. Hardware drives it (M2); on-screen drag is M5 polish.
- **3 EQ knobs**: visual only (REQ-DECK-03 explicitly: "EQ remains visual-only"). Static circular knob SVG with a tick line at 12 o'clock.
- **Sync button**: visual only, disabled-styled (per REQ-DECK-03).
- **Transport buttons**: Play/Pause + Cue (REQ-DECK-03 functional). Headphone-cue toggle (existing 🎧 button from M2).
- **Anchor-source border** (REQ-DECK-06): a `border-anchor-source` className applied when this deck is the current anchor. M5 wires the toggle; M4 just declares the CSS rule (gradient `#c8302e → #a02220`).
- **Empty state** (REQ-DECK-09): dashed circle with copy "Drop a track or load from queue" instead of platter + metadata. Anchor click on an empty deck does nothing (REQ-DECK-10).
- **Click-to-anchor** (REQ-DECK-07): wire a `onAnchorClick` callback prop, but the parent supplies a no-op until M5. Visual cursor shows `pointer`.
- **Drop target** (REQ-DECK-08): we already have on-screen Load A/B buttons. M8 wires native HTML5 DnD; M4 just declares the dropzone CSS.

`src/components/DeckRow/`:
- `Deck.tsx` (replaces current `src/components/Deck.tsx`).
- `Platter.tsx` — spinning ring + ArtBlock + spindle.
- `Waveform.tsx` — lifted from prototype.
- `EqKnob.tsx`, `PitchFader.tsx`, `TransportButtons.tsx` — purely visual.
- `ArtBlock.tsx` — lifted from prototype (procedural SVG art).

#### M4.2 — Library upgrade with inline editing

**Track-level model change**: scanned files now project into `EngineTrack`-shaped rows by merging:
1. Symphonia metadata (title, artist, duration) — already in M1/M2.
2. **Track overrides** (BPM, key, genre, tags, year, energy, albumArtColor) — read from `<app_data>/track_overrides.json` keyed by absolute path. Empty by default; written as the user edits.

When the user hasn't supplied overrides, columns render `—`. Clicking the cell opens a small inline editor (text input or numeric input depending on column). Blur or Enter saves; Esc cancels.

**Schema** (`src-tauri/src/track_overrides.rs`):

```rust
#[derive(Serialize, Deserialize, Default, Clone)]
pub struct TrackOverrides {
    pub bpm: Option<f32>,
    pub key: Option<String>,        // Camelot, validated
    pub genre: Option<String>,
    pub tags: Option<Vec<String>>,  // free-form, comma-split on save
    pub year: Option<u16>,
    pub energy: Option<u8>,         // 1..10
    pub album_art_color: Option<String>,  // future
}

pub fn load_overrides(app: &AppHandle) -> HashMap<String, TrackOverrides>;
pub fn save_override(app: &AppHandle, path: &str, ov: TrackOverrides) -> Result<()>;
```

Tauri commands:
- `track_overrides_load() -> HashMap<String, TrackOverrides>`
- `track_overrides_set(path: String, overrides: TrackOverrides)` — writes through to disk atomically.

Storage location: `path_resolver().app_data_dir()/track_overrides.json`. Atomic write: `.tmp` then rename. JSON pretty-printed for human inspection.

**Library UI changes** (`src/components/Library/`):
- `Library.tsx` — search input (REQ-LIB-06: substring filter on title/artist/tags), sortable columns (REQ-LIB-08), filter-pill row (REQ-LIB-07: visual; only the genre pill actually filters).
- `LibraryRow.tsx` — art (`<ArtBlock>` keyed by path), title, artist, BPM, key, genre, tags (truncated to 2), year, energy. Hover reveals "Load to A" / "Load to B" buttons (REQ-LIB-05).
- `EditableCell.tsx` — generic click-to-edit cell. Renders display value or `—`; on click swaps to `<input>` of the right type; commits on blur/Enter; cancels on Esc.
- `TrackEnricher` (frontend hook): merges scanned `TrackEntry` with loaded `TrackOverrides` into an `EngineTrack`-shaped object for display + (later) engine consumption.

#### M4.3 — Visual style pass (REQ-STYLE-01..09)

Apply tokens consistently:
- Background `#0a0a0a`; surfaces `#1a1d22` / `#22262c`.
- Accent gradient `#c8302e → #a02220` reserved for: live deck glow, anchor-source border (CSS class only — M5 toggles it), primary buttons, page indicator (M7).
- Sans (Inter / system) for UI; monospaced (JetBrains Mono / system mono) for BPM, key, time, pitch %.
- No green / amber / blue. Warning states use desaturated red plus iconography (`AlertTriangle` from lucide-react).
- Borders reserved for the anchor-source treatment (REQ-STYLE-07). All other elevation via shadows.
- Motion: only the spinning platter + 150 ms hover/drag/expand transitions (REQ-STYLE-09). No pulsing.

Centralise tokens in a small `src/theme.ts` with named constants, so the values aren't scattered across arbitrary-value Tailwind classes.

#### M4.4 — Tab content placeholder

The Graph tab in the middle band shows:
- A header bar reading `Graph view — coming in M5`.
- Below it, a "Show suggestions" call-to-action button (the `REQ-GRAPH-01` collapsed-state affordance, even though there's nothing to expand into yet — visual placeholder only).

Browse / Crates / History tabs render but have `pointer-events: none` and 60% opacity. No tab switching needed (only Graph is selectable).

#### File touch-list

| Path | Note |
|---|---|
| `src/components/Layout/Shell.tsx` | New. Three-band wrapper. |
| `src/components/Layout/DragHandle.tsx` | New. |
| `src/components/Layout/TabStrip.tsx` | New (adapted from prototype). |
| `src/components/DeckRow/Deck.tsx` | Replaces existing `src/components/Deck.tsx`. |
| `src/components/DeckRow/{Platter,Waveform,ArtBlock,EqKnob,PitchFader,TransportButtons}.tsx` | New. ArtBlock + Waveform lifted from prototype. |
| `src/components/Library/Library.tsx` | Replaces existing `src/components/Library.tsx`. |
| `src/components/Library/{LibraryRow,EditableCell}.tsx` | New. |
| `src/components/MiddleBand.tsx` | New. Tab strip + Graph placeholder. |
| `src/App.tsx` | Restructured to use `Shell`. |
| `src/theme.ts` | New. Centralised palette + typography tokens. |
| `src-tauri/src/track_overrides.rs` | New. Overrides struct + load/save helpers. |
| `src-tauri/src/commands.rs` | Add `track_overrides_load` + `track_overrides_set` commands. |
| `src-tauri/src/lib.rs` | Wire overrides into app state if needed (probably not — commands can read/write on-demand). |
| `src-tauri/Cargo.toml` | Possibly `serde_json` already there; no new deps expected. |
| `src/types.ts` | Add `TrackOverrides` type mirroring Rust struct. |
| `src/ipc/tauri.ts` | New IPC wrappers. |
| `src/index.css` | Add `@keyframes spin` + a couple of utility classes (anchor-source border gradient). |
| `phases/PHASE-4.md` | New. Acceptance checklist. |
| `.claude/plans/M4-graph-view-shell.md` | New. Copy of this section. |

#### Open questions / default resolutions

- **Edit affordance for column headers**: M4 makes cells editable when clicked; column headers stay sortable on click (the two interactions don't collide since headers and cells live in different rows).
- **Validation**: BPM 30..300 (warn outside); Camelot key validated against `1A..12B` (reject invalid); year 1900..2100; energy 1..10. Free-form text fields (title/artist/genre/tags) accept anything non-empty.
- **Concurrent edits across rows**: each edit writes through to `track_overrides.json` immediately. No "save all" button.
- **Atomicity**: write to `.tmp` then rename so a crash mid-write doesn't corrupt the file.
- **Migration**: file doesn't exist on first run → treat as empty `HashMap`.
- **Deletion**: clearing a cell to empty saves `None` for that field, restoring `—`. Users who want to clear all overrides can delete the JSON file from disk.
- **Album art color override**: not edited in M4. Procedural color from path hash for now; future "edit album art color" UI can land in M11+.
- **Drag handle persistence**: don't persist the band split position across launches in M4. Resets to default proportions each run. Adding to `track_overrides.json` as a sibling top-level key is trivial later.
- **`prototypes/chrome.jsx` deck transport**: prototype has unwired buttons; we wire ours to the existing `ipc.deckPlay` / `ipc.deckCuePress` etc. from M2.
- **MIDI / Audio bars**: stay visible at top of window for M4. M7's settings drawer pulls them inside.

#### Verification

1. `npx tsc -b` clean. `npx vitest run` — existing 44 tests still pass (engine untouched).
2. `cd src-tauri && cargo build` clean. `cargo clippy` clean.
3. `npm run tauri dev` opens with the new chrome:
   - Three-band layout visible. Drag handle resizes middle/bottom.
   - Tab strip shows Graph (active) + Browse/Crates/History (disabled).
   - Both decks render the CDJ chrome. Empty decks show the dashed-circle placeholder.
   - Loading a track populates art + waveform + title/artist + BPM (from overrides if present, else `—`).
   - Pressing Play makes the platter spin; LIVE pill + red glow appear.
   - Library renders all REQ-LIB-02 columns. `—` for missing data.
   - Click an empty BPM cell → input appears; type 124 → blur → "124" persists. Reopen app → still "124".
   - Search box filters rows.
   - Click a sortable column header → rows resort.
4. Visual review against `requirements.md §5.10`:
   - No green / amber / blue anywhere.
   - Borders only on the anchor-source treatment (which won't be visible until M5; CSS class declared).
   - Only motion: platter spin + 150 ms transitions on hover.
5. `phases/PHASE-4.md` checklist ticked.

