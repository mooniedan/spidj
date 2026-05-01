# DJ Graph View — Implementation Plan

## Context

This repo carried two parallel tracks: a **DJ Graph View** prototype (`./.claude/requirements.md`, originally a single-file React artifact for Claude.ai with **mock-only** decks) and a separate **Tauri/Rust/MIDI feasibility PoC** (`./.claude/poc.md`) for a Numark Mixtrack Platinum controller.

The user has decided the PoC's stack is the real product: a **native Tauri desktop app** that produces actual audio output and is driven by a real MIDI controller, rendered behind the Graph View UI. The two tracks merge into one. The "single React artifact" deliverable and the "decks are visual-only" non-goal in `requirements.md` are retired.

**Milestone 1 (M1)** is a vertical slice that proves the hardware-to-audio loop works: plug in the Numark, point the app at a music folder, see a list of tracks, load two to deck A/B, and start/stop them with the controller's transport buttons. Everything else (graph, suggestions, fancy decks, jog wheels, pitch, sync) comes after.

This plan covers M1 in detail and sketches M2+ at lower resolution, since downstream phases will be re-planned per `CLAUDE.md`'s phase-doc workflow.

---

## Architecture (target, post-M1)

```
┌─────────────────────────────────────────────┐
│  React + TypeScript (src/)                  │  Frontend
│  Graph View UI, library, deck rows, IPC     │
└──────────────────┬──────────────────────────┘
                   │ Tauri invoke / events
┌──────────────────▼──────────────────────────┐
│  Rust (src-tauri/src/)                      │  Backend
│  ┌────────┬────────┬────────┬────────────┐  │
│  │ midi   │ audio  │ library│ deck       │  │
│  │ midir  │ cpal + │ walkdir│ state mgmt │  │
│  │        │ symph. │ symph. │            │  │
│  └────────┴────────┴────────┴────────────┘  │
└─────────────────────────────────────────────┘
            │                │
       MIDI in           WASAPI out
      (Numark)         (system audio)
```

State of truth lives in Rust. The frontend is a thin view: it asks Rust to load tracks / play / pause and listens for state-change events. MIDI input never crosses into the frontend except as telemetry; mapping happens in Rust so latency stays tight.

---

## File / module layout (M1 target)

```
spidj/
├── CLAUDE.md                              (needs rewrite — separate task)
├── .claude/
│   ├── requirements.md                    (canonical UI spec; visual-only clause to be amended)
│   └── poc.md                             (kept as historical reference)
├── phases/
│   └── PHASE-1.md                         (created at start of M1; tracks REQ-IDs + acceptance)
├── package.json
├── vite.config.ts
├── tsconfig.json
├── src/                                   ── React frontend
│   ├── main.tsx
│   ├── App.tsx                            top-level layout; MIDI port + folder pickers + decks + library
│   ├── types.ts                           TrackEntry, DeckId, DeckState, MidiPort (mirrors Rust types)
│   ├── ipc/
│   │   └── tauri.ts                       typed wrappers around invoke() and listen()
│   └── components/
│       ├── MidiBar.tsx                    select MIDI port; show last-message blip
│       ├── FolderPicker.tsx               choose folder; trigger library scan
│       ├── Library.tsx                    track table; per-row "Load A" / "Load B"
│       └── Deck.tsx                       title/artist; play/pause/cue buttons; LIVE indicator
└── src-tauri/
    ├── Cargo.toml
    ├── tauri.conf.json
    └── src/
        ├── main.rs                        entry; calls lib::run()
        ├── lib.rs                         tauri builder; state init; command registration
        ├── midi.rs                        list ports, connect, emit raw events, basic mapper
        ├── audio.rs                       cpal output stream, decoder, two-deck mixer
        ├── library.rs                     scan folder for audio files; pull metadata via symphonia
        ├── deck.rs                        DeckState struct + transport ops (play/pause/cue/load)
        └── commands.rs                    #[tauri::command] handlers
```

---

## Milestone 1 — Plug-and-play vertical slice

**Definition of done:** plug Numark in, launch app, click "Choose folder", click "Load A" on one row + "Load B" on another, press the controller's Play A button → deck A plays through speakers; press Play A again → it pauses; same for deck B; both can play simultaneously and audio mixes.

### M1 dependency-ordered tasks

The PoC's recommended build order (audio first, then MIDI) is correct: get the audio path provably working with on-screen buttons, then layer MIDI on top so when MIDI fails you know the failure is in the MIDI layer.

#### M1.0 — Project scaffold

- `npm create tauri-app@latest` into the existing repo (or scaffold manually if it conflicts with the existing files; prefer manual scaffold since `prototypes/` and the docs would clash with template scaffolding).
- Configure `vite.config.ts`, `tsconfig.json` (strict), `tailwind.config.js` (utility-first, no custom plugin per `CLAUDE.md`), `package.json` with React 18, lucide-react, `@tauri-apps/api`.
- `src-tauri/Cargo.toml` deps per `poc.md`: `tauri 2`, `serde`, `serde_json`, `midir 0.10`, `anyhow`, `cpal 0.15`, `symphonia 0.5` (mp3/wav/flac/aac/isomp4 features), plus `walkdir` for library scan and `parking_lot` for low-overhead locks.
- Verify `npm run tauri dev` opens a window. **Acceptance:** blank window appears with no console/Cargo errors.

#### M1.1 — Audio engine (Rust): one deck, hardcoded path

Build the audio path before MIDI or library — the riskiest part is latency-correct audio output, prove it works in isolation.

- `src-tauri/src/deck.rs`:
  ```rust
  pub struct DeckState {
      pub id: DeckId,           // A | B
      pub track: Option<LoadedTrack>,
      pub position_samples: u64,
      pub playing: bool,
      pub speed: f32,           // 1.0 for M1; pitch fader hooks here in M2
  }

  pub struct LoadedTrack {
      pub path: PathBuf,
      pub samples: Arc<Vec<f32>>,    // decoded interleaved stereo, 44.1k
      pub sample_rate: u32,
      pub channels: u16,
      pub duration_samples: u64,
  }
  ```
  Decode the whole file on load via `symphonia`; resample to 44.1 kHz stereo if needed. A 6-minute track ≈ 60 MB f32, acceptable for a prototype. Streaming decode is M2+ work.

- `src-tauri/src/audio.rs`:
  - One `cpal` output stream on the default WASAPI device, 44.1 kHz, f32 stereo, ~256–512 sample buffer (~5–11 ms latency).
  - Output callback owns a clone of `Arc<Mutex<[DeckState; 2]>>` (or `Arc<RwLock<...>>` via `parking_lot`). Each frame: read both decks, advance their positions if `playing`, sum samples, write to output.
  - Linear interpolation when `speed != 1.0` (no-op at 1.0).
  - **Avoid `std::sync::Mutex` in the audio callback** — use `parking_lot::Mutex` or a lock-free SPSC ring for transport commands.

- `src-tauri/src/commands.rs`: `deck_load(deck_id, path)`, `deck_play(deck_id)`, `deck_pause(deck_id)`, `deck_cue(deck_id)` (= pause + position 0).

- **M1.1 acceptance:** in `App.tsx`, hardcode two `deck_load` calls with paths to two test files; render a `<button>` per deck for play/pause; hear them play, hear them mix when both run.

#### M1.2 — Library scan + folder picker

- `src-tauri/src/library.rs`:
  ```rust
  pub struct TrackEntry {
      pub path: String,
      pub filename: String,
      pub title: Option<String>,
      pub artist: Option<String>,
      pub duration_seconds: Option<f64>,
  }

  pub fn scan_folder(root: &Path) -> Vec<TrackEntry> { ... }
  ```
  `walkdir` with extension filter (`mp3 wav flac aac m4a`); for each file, `symphonia::default::get_probe().format(...)` to read tags + duration. Skip files that fail to probe.

- Tauri command `library_scan(path: String) -> Vec<TrackEntry>`. Frontend calls it via the dialog plugin → user picks a folder → table renders.

- `src/components/Library.tsx`: table rows with **Load A** / **Load B** buttons; clicking calls `deck_load`.

- **M1.2 acceptance:** point at a real music folder, see populated rows with title/artist where tags exist, click Load A on one row + Load B on another, both decks play via the on-screen buttons from M1.1.

#### M1.3 — MIDI input + minimal mapping

- Drop in `midi.rs` from `poc.md` essentially as-written (list inputs; connect; emit `midi:message` events with raw bytes + timestamp).

- Add a **temporary spy panel** in the frontend (collapsible, dev-only) that shows the last 50 MIDI messages — needed to capture the Numark's actual button codes for Play/Pause/Cue on each deck.

- **Manually capture mappings**: with the spy on, press each transport button, write the resulting `(status, data1)` pairs into a hardcoded map in `midi.rs`:
  ```rust
  // Captured manually from Numark Mixtrack Platinum
  const PLAY_A:  (u8, u8) = (0x90, 0x??);
  const CUE_A:   (u8, u8) = (0x90, 0x??);
  const PLAY_B:  (u8, u8) = (0x91, 0x??);
  const CUE_B:   (u8, u8) = (0x91, 0x??);
  ```

- In the MIDI callback (Rust side, **not the frontend**), match incoming messages against the map and call the corresponding deck transport function directly. Frontend gets a `deck:state` event for UI sync.

- **M1.3 acceptance:** unplug the on-screen play buttons; controller alone drives transport. Both decks playable simultaneously.

#### M1 deliverable

A single `npm run tauri dev` command launches a window with: MIDI port selector, "Choose folder" button + library list, two deck panels showing loaded track + play state, and a tucked-away dev MIDI spy. The Numark drives play/cue on both decks. Audio comes out the speakers.

#### Files modified / created in M1

| Path | New? | Purpose |
|---|---|---|
| `package.json`, `vite.config.ts`, `tsconfig.json`, `tailwind.config.js` | new | Frontend scaffold |
| `src/main.tsx`, `src/App.tsx` | new | React entry + layout |
| `src/types.ts` | new | TS mirrors of Rust types |
| `src/ipc/tauri.ts` | new | invoke + listen wrappers |
| `src/components/MidiBar.tsx`, `FolderPicker.tsx`, `Library.tsx`, `Deck.tsx` | new | UI |
| `src-tauri/Cargo.toml`, `tauri.conf.json` | new | Rust scaffold |
| `src-tauri/src/{main,lib,midi,audio,library,deck,commands}.rs` | new | Backend |
| `phases/PHASE-1.md` | new | Phase doc per CLAUDE.md workflow |

#### Reusable assets from existing prototypes

- `prototypes/data.jsx` — `CAMELOT_KEYS`, `GENRES`, scoring function. **Not used in M1**, but lift into `src/engine/` when M3 starts.
- `prototypes/chrome.jsx` — `Library`, `Deck` component shapes. Reference for visual structure when we pretty up M1's plain components.
- `prototypes/graph.jsx`, `tweaks-panel.jsx`, `app.jsx` — defer.

#### M1 open questions / default resolutions

- **Sample-rate mismatch:** if a file is 48 kHz and output is 44.1 kHz, we need resampling on load. Default: resample-on-load via a simple linear filter; acceptable quality for a prototype, replace with `rubato` in M3 if needed.
- **Track files >100 MB:** decode-to-memory will hurt. Default for M1: skip with a warning. Streaming decoder is M2+.
- **Controller mode:** Numark Mixtrack Platinum has a Serato-mode default that may suppress some MIDI. Default: assume HID/Serato off; if the spy returns nothing, document holding mode buttons at startup.

---

## M2+ roadmap (low resolution)

Each becomes its own phase doc when started, per `CLAUDE.md`.

### M2 — Mixing essentials (DETAILED — approved scope)

**Goal:** real DJ mixing works — pitch-shift each deck, cue points behave like a CDJ, crossfader weights the master output, and the controller's headphone outputs cue a deck silently before bringing it into the mix.

**Out of scope for M2** (deferred to M3): jog-wheel nudge, jog-wheel scratch, Learn Mode persistence, EQ knobs, Sync, FX. Numark demo-animation suppression.

#### Existing hooks we build on (from `src-tauri/src/`)

- `deck.rs::Deck.speed: f32` — already wired into `mix_into`; pitch fader plugs straight in.
- `audio.rs::mix_into()` — currently mirrors stereo to every channel pair at 0.5/0.5 weights. M2 splits this into a master mix (channels 0/1) and a cue mix (channels 2/3).
- `midi.rs::map_message()` — handles only Note-On press detection. M2 extends it with CC handling (status `0xB0`/`0xB1`) and Note-Off (`0x80`/`0x81`) for cue release.
- `commands.rs::DeckSnapshot` — extend with new fields (`pitch_percent`, `cue_position_seconds`, `cue_active`).
- `lib.rs::AppState` — add a global `crossfader: Arc<parking_lot::Mutex<f32>>`.

#### M2.0 — Capture remaining MIDI codes (~15 minutes, blocking)

Use the dev spy in `MidiBar.tsx` (Clear button is already there). Capture:

1. **Pitch fader, Deck A** — slowly slide the fader from one end to the other; expect a stream of CC messages on channel 0. Note the controller# (`data1`) and the value range. The Numark Mixtrack Platinum FX usually sends linear 7-bit (0–127), with 0 at the bottom and 127 at the top, but Numark sometimes inverts.
2. **Pitch fader, Deck B** — same, channel 1.
3. **Crossfader** — slide it left to right; CC stream on whatever channel the controller assigns (often channel 8 or a "global" channel).
4. **Headphone Cue button, Deck A** — press once. Expect Note-On + Note-Off on a different note number than the existing transport Cue (which is `0x01`).
5. **Headphone Cue button, Deck B** — same, channel 1.
6. **Existing transport Cue button release** — already captured (`80 01 00`); confirms M2 cue-preview logic can use Note-Off.

User pastes the captures; mappings get hardcoded into `midi.rs` (Learn Mode is M3).

#### M2.1 — Pitch fader → speed

`src-tauri/src/midi.rs`:
- Add `Action::SetPitch(DeckId, f32)` where the f32 is a normalised value in [-1.0, 1.0].
- In `map_message`, when status is `0xB0`/`0xB1` and `data1` matches the captured pitch CC, return `SetPitch(deck, (value - 64) / 64)`.

`src-tauri/src/deck.rs`:
- Add `pub pitch_norm: f32` (-1..1) field on `Deck`. Default 0.0.
- Add method `set_pitch(norm: f32)` that updates `pitch_norm` and recomputes `speed = 1.0 + norm * PITCH_RANGE` where `PITCH_RANGE = 0.08` (±8% standard DJ throw).
- Update `DeckSnapshot::from_deck` to include `pitch_percent: f32` (= `pitch_norm * 8.0`).

`src-tauri/src/midi.rs::apply_action` extended to call `deck.set_pitch(norm)` on `SetPitch`.

The existing linear-interp resampling in `mix_into` already uses `deck.speed`, so audio just follows.

**Acceptance:** sliding the fader smoothly varies the deck's pitch in real time; the on-screen `pitch_percent` readout matches; centred fader = 0.0% = source rate.

#### M2.2 — Full cue behavior (CDJ-style)

DJ-standard cue-button state machine:

| Current state | Cue press | Cue release |
|---|---|---|
| Playing | Jump to cue point, pause | (no-op) |
| Paused at cue point | Start playing (preview); set `cue_held` | If `cue_held`: pause + jump to cue point |
| Paused not at cue point | Set cue point to current position | (no-op) |

`src-tauri/src/deck.rs`:
- Add `pub cue_position_frames: u64` (default 0).
- Add `pub cue_held: bool` (transient flag, not exposed to UI).
- Replace `cue()` with `cue_press()` + `cue_release()` per the table above.
- Add `cue_position_seconds` to `DeckSnapshot`.

`src-tauri/src/midi.rs`:
- `Action::CuePress(DeckId)` (already exists as `Cue`, rename for clarity).
- New `Action::CueRelease(DeckId)` triggered by Note-Off `0x80`/`0x81` data1=`0x01`.

`src-tauri/src/commands.rs::deck_cue` becomes `deck_cue_press`; add `deck_cue_release` for symmetry from on-screen UI.

**Acceptance:** four scenarios verified manually:
1. Playing + Cue → jumps back, pauses.
2. Paused at non-cue position + Cue → cue point updates to current position (visible by pressing Cue again from a different position and confirming jump target moved).
3. Paused at cue + hold Cue → plays from cue while held; on release, returns to cue and stops.
4. The position bar marker on the UI moves to the cue point.

#### M2.3 — Crossfader

`src-tauri/src/lib.rs`:
- `AppState.crossfader: Arc<parking_lot::Mutex<f32>>` (0.0 = full A, 1.0 = full B).

`src-tauri/src/midi.rs`:
- `Action::Crossfader(f32)` (normalised 0..1).
- In `map_message`, match the captured crossfader CC and value → normalise to 0..1.
- `apply_action` writes into `state.crossfader`.

`src-tauri/src/audio.rs::mix_into`:
- Take a `crossfader: f32` parameter (or read from a captured `Arc<Mutex<f32>>` clone in the closure).
- Per-deck contribution to **master**: deck A weighted by `(1.0 - x)`, deck B by `x`. Linear curve for now; sharper/smooth curves are post-MVP.

Surface the value to UI via a new `audio:crossfader` event or extend the existing `deck:state` payload with a top-level `crossfader` field. Recommend the latter — fewer event channels.

**Acceptance:** sliding the hardware crossfader fully left silences B in master; fully right silences A. Centre → both audible. UI strip mirrors hardware position.

#### M2.4 — Headphone cue routing (4-channel split)

The Mixtrack exposes 4 output channels; M1 mirrors the stereo mix to all of them. M2 separates them:

- **Master (channels 0/1)**: `(1-x)·A + x·B` (post-pitch, post-crossfader).
- **Cue (channels 2/3)**: sum of decks whose `cue_active` flag is true (no crossfader weighting).

`src-tauri/src/deck.rs`: `pub cue_active: bool` field on `Deck`. Surfaced in `DeckSnapshot`. Toggled by the headphone-cue MIDI button.

`src-tauri/src/midi.rs`: `Action::ToggleCueActive(DeckId)`.

`src-tauri/src/audio.rs::mix_into`: refactor the per-frame loop to compute `(master_l, master_r, cue_l, cue_r)` once per frame and route them to the right channels. Fallback for 2-channel devices: write master only.

`src-tauri/src/commands.rs`: add `deck_toggle_cue_active(deck_id)` so on-screen UI can toggle without the controller.

**Acceptance:**
1. Crossfader fully right + Deck A cue_active = on → Deck A audible in headphones, silent in master; Deck B audible in master, silent in headphones (assuming B's cue_active is off).
2. Both decks cue_active = on → both audible in headphones.
3. UI shows a "🎧" pill or similar on each deck card when its cue is active.

#### M2.5 — Minimal UI additions

Per the user's "minimal additions only" answer; full deck chrome is M4.

- `src/components/Deck.tsx`:
  - Pitch % readout next to the time display, mono font, e.g. `+2.3%`.
  - A thin position bar under the title with a tick mark at `cue_position / duration`.
  - Headphone-cue toggle button (small, next to existing Play/Cue), shows engaged state.
- New `src/components/Crossfader.tsx`: a horizontal strip showing the crossfader position. Read-only (hardware drives it; no on-screen drag in M2).
- `src/App.tsx`: place the Crossfader strip between the deck row and the library.
- `src/types.ts`: extend `DeckSnapshot` with `pitch_percent`, `cue_position_seconds`, `cue_active`. Add a new top-level `AppSnapshot` type for crossfader, or piggy-back on the existing `deck:state` event with `{ decks, crossfader }`.

#### File touch-list

| Path | Note |
|---|---|
| `src-tauri/src/deck.rs` | New fields: `pitch_norm`, `cue_position_frames`, `cue_held`, `cue_active`. New methods. Updated `DeckSnapshot`. |
| `src-tauri/src/audio.rs` | `mix_into` refactor: split master vs cue routing; crossfader weighting. |
| `src-tauri/src/midi.rs` | CC + Note-Off handling. New `Action` variants. Captured CC numbers as constants. |
| `src-tauri/src/commands.rs` | New commands: `deck_cue_release`, `deck_toggle_cue_active`, `crossfader_set` (for UI parity). Extend `deck_snapshot` payload to include crossfader. |
| `src-tauri/src/lib.rs` | `AppState.crossfader`. Wire into audio thread + MIDI callback. |
| `src/components/Deck.tsx` | Pitch %, cue marker, headphone-cue toggle. |
| `src/components/Crossfader.tsx` | New. Visual strip. |
| `src/App.tsx` | Mount Crossfader. Subscribe to extended `deck:state`. |
| `src/types.ts` | Extended `DeckSnapshot`, new `AppSnapshot`. |
| `src/ipc/tauri.ts` | New IPC wrappers; updated event payload types. |
| `phases/PHASE-2.md` | New. Acceptance checklist below. |
| `.claude/plans/M2-mixing-essentials.md` | New. Copy of this section for in-repo persistence. |

#### Open questions / default resolutions

- **Pitch CC width**: assume 7-bit linear (0–127). If the captured stream looks coarse during M2.0, upgrade to 14-bit (LSB+MSB CC pair) — small refactor, isolated to `map_message`.
- **Pitch direction**: capture confirms which end is positive. If inverted, negate in the mapping function only.
- **Crossfader curve**: linear. Sharp/smooth curves are post-MVP.
- **Cue point clamping**: don't let cue land beyond track end; clamp to [0, duration_samples - 1].
- **Multiple cue points / hot cues**: out of scope. Single cue per deck.
- **Visual crossfader is read-only**: hardware-driven; no on-screen drag in M2 to keep scope tight. M3 makes it interactive.

#### Verification

1. Walk M2.0 captures with the user; confirm constants in `midi.rs` match.
2. Walk M2.2 cue scenarios (4 cases above).
3. Walk M2.4 cue routing (3 cases above).
4. End-to-end: load both decks, set a cue point in B while paused, slide crossfader left, play A. Headphone-cue B; preview B in headphones. Slide crossfader right while pressing the transport Cue → playback launches from the cue point in B and B fades into master. This is the basic DJ workflow.
5. `cargo clippy` clean. `tsc -b` clean.
6. `phases/PHASE-2.md` checklist fully ticked.

### M3 — Suggestion engine (pure)

Lift `prototypes/data.jsx`'s scoring code into `src/engine/suggestionEngine.ts` per `requirements.md` §6.3 — pure function, Vitest tests, deterministic. No UI yet. Mock track library `src/mockData.ts` lives here too — but augment it: scanned real files now provide the library, and we annotate them with BPM/key/etc fields that don't yet have a source. For M3, **mock those fields by hash-stable random** so the engine can be exercised end-to-end against the real folder.

### M4 — Graph View UI shell

Lay out `requirements.md` §5: deck row + middle band (with disabled tabs) + bottom library, gunmetal/red palette, drag handle. Replace M1's plain UI with the proper visual chrome. Pull patterns from `prototypes/chrome.jsx`.

### M5 — Graph canvas + anchor system

Per `requirements.md` §5.4 / REQ-GRAPH-*. Pull layout algorithms from `prototypes/graph.jsx` (`radialPositions`, etc.). Anchor switches between deck/queue/library/recursive sources.

### M6 — Up Next queue + recursive anchoring

REQ-QUEUE-* + recursion behavior. Pull `QueueStrip` from `prototypes/chrome.jsx`.

### M7 — Settings + pagination + reason chips

REQ-CFG-*, REQ-GRAPH-PAGE-*, reason-chip rendering on suggestion nodes.

### M8 — Drag-and-drop matrix

`requirements.md` §7.1 — library→deck, library→queue, graph-node→deck, graph-node→queue, queue-reorder. Native HTML5 DnD per CLAUDE.md.

### M9 — Demo states + final polish

REQ-DEMO-* as integration test. Run the acceptance checklist for every prior phase.

### M10 — Real BPM/key analysis (optional, post-MVP)

Replace the M3 mock metadata with real analysis (e.g. `aubio` via FFI, or a bundled Rust BPM library). Out of scope for first release.

---

## Documentation updates required (do in M1.0)

- `CLAUDE.md`:
  - Remove "single React artifact" deliverable + final-artifact collapse phase.
  - Remove forbidden-list entries that no longer apply now we're a desktop app (`localStorage`/`fetch`/etc. — Tauri `fs` and `http` are the right primitives).
  - Update file-organisation block to show `src-tauri/`.
  - Update tech-stack section to add Rust, midir, cpal, symphonia, Tauri.
  - Add a "no-audio non-goal is retired" note.
- `.claude/requirements.md`:
  - Annotate §2 to remove the "no audio playback" non-goal and the "transport buttons render but do not function" line.
  - Add a brief §10 on hardware (Numark Mixtrack Platinum, MIDI mapping).
- Move `requirements.md` and `poc.md` references in `CLAUDE.md` to their new `.claude/` paths.

These edits happen as part of M1.0, **before** any code, so the rules driving the rest of the work are coherent.

---

## Verification

### M1 end-to-end test (manual, Windows)

1. `npm install` and `cd src-tauri && cargo build` — both clean, no warnings of severity error.
2. Plug Numark Mixtrack Platinum into a USB port.
3. `npm run tauri dev` — window opens, no Vite/Cargo console errors.
4. MIDI bar shows the Numark in the port list; selecting it shows the "last message" blip when any controller button is pressed.
5. Click "Choose folder" → pick a folder with at least 4 audio files of mixed formats (mp3/wav/flac).
6. Library table renders with title/artist where tags exist; rows for files without tags show the filename.
7. Click "Load A" on row 1 → deck A panel shows that track's title.
8. Click "Load B" on row 2 → deck B panel shows that track.
9. Press **Play A** on the controller → deck A audio plays through speakers; UI play indicator lights up.
10. Press **Play A** again → audio stops; indicator clears.
11. With deck A playing, press **Play B** → both audible simultaneously, mixed.
12. Press **Cue A** while deck A is playing → playback stops, position returns to 0.

If steps 1–12 pass, M1 is done.

### Per-phase verification (M2+)

Each later phase ships its own `phases/PHASE-N.md` with an acceptance checklist derived from the in-scope `REQ-IDs`, walked manually before declaring the phase done. Vitest covers the suggestion engine specifically (M3+). No UI test automation per `CLAUDE.md`.

---

## Critical files to read before implementing M1

- `C:\Users\mooni\workspace\spidj\.claude\poc.md` — `midi.rs` and the React MidiSpy can be lifted nearly verbatim.
- `C:\Users\mooni\workspace\spidj\.claude\requirements.md` §6.1 (state shapes), §5.10 (palette) — only the bits relevant to deck/library UI for now.
- `C:\Users\mooni\workspace\spidj\prototypes\chrome.jsx` — visual reference for `Deck` and `Library` components.
- Symphonia decoder example: https://github.com/pdeljanov/Symphonia/tree/master/symphonia-play (pattern for decode-to-PCM-buffer).
- cpal `feedback.rs` example for output stream callback structure.
