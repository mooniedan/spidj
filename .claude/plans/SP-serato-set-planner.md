## Side project: Serato Set Planner

> **Status:** SP-2 spike succeeded 2026-05-02. Format work confirmed end-to-end against the user's real Serato library (77 tracks, `database V2`, `DJ Music.crate`). Proceeding into the proper build starting with SP-0.

### Spike findings (2026-05-02)

A throwaway crate at `spike/` (gitignored, hand-rolled parser, no `triseratops` dep) read 77 tracks from `database V2` and wrote a 5-track `spidj-spike-test.crate` that Serato loaded on next launch with all tracks intact.

Confirmed empirically:

- **Record format**: `[4-byte ASCII tag][4-byte u32 BE length][payload]` — exactly as the reverse-engineered docs say. No padding, no envelope.
- **Required records for a loadable crate**: `vrsn` (with payload `"1.0/Serato ScratchLive Crate"` UTF-16 BE) + N × `otrk` records, each containing one nested `ptrk` with the path. That's it.
- **Optional records Serato adds itself**: `osrt` (sort spec) + `ovct` (column visibility/width) — these are UI display state. Serato adds them when the crate is opened, sorted, or column-resized. We do NOT need to write them.
- **Path encoding** (matches what's in `database V2`):
  - UTF-16 BE.
  - Forward slashes, e.g. `Users/mooni/Music/DJ Music/Afro Beats/2Baba - Coded Tinz.mp3`.
  - **No drive letter, no leading slash.**
  - Non-ASCII characters work directly (Beyoncé's `é` round-tripped without issue).
- **Crate name** is purely the filename minus `.crate`; not encoded inside the file.
- **Display vs storage order**: Serato shows tracks sorted by whatever column the user has selected, but the original write order is preserved in the `#` column.
- **No DB write needed**: dropping a fresh `.crate` into `Subcrates/` is sufficient; Serato picks it up on next launch. The `database V2` is read-only as far as we're concerned.
- **`triseratops` not strictly required** for this minimal scope. Hand-rolled parser+writer is ~100 lines and avoids an external dep that's still maturing. Re-evaluate if we need richer metadata access later (e.g. reading Serato cue points / beatgrids for downstream features).

### Risks resolved by the spike

- ~~Will Serato accept a hand-written `.crate`?~~ Yes.
- ~~Path encoding pitfalls?~~ No surprises; UTF-16 BE forward-slash matches database paths.
- ~~Need `osrt`/`ovct` for the crate to load?~~ No.
- ~~`triseratops` API churn risk?~~ Avoided by not depending on it.

### Risks still open (cover in SP-2)

- Overwriting an existing `.crate`: refuse + UI rename prompt per the plan.
- Crate names with filesystem-illegal chars (`/ \ : * ? " < > |`): sanitize before writing.
- Editing pre-existing crates: still out of scope; never modify what Serato wrote.
- Concurrent Serato + spidj writes: Serato writes its own `.crate` files when the user re-saves a crate inside Serato. Detect a running Serato and warn before writing.
- Very long paths (Windows MAX_PATH 260 chars): test once SP-3 is wired.

### Context

A standalone offline DJ-set planner that reads the user's existing **Serato library**, runs the spidj suggestion engine over it, and lets the user walk a recursive graph (search a starting track → click suggestion → it joins the new crate AND becomes the new anchor → repeat). Saves the assembled list as a fresh `.crate` file Serato discovers on next launch.

This is adjacent to spidj rather than part of it: different stack timing (offline planning, not live performance), different audio dependencies (none — no playback), but the **suggestion engine is shared**. The user prefers a Cargo + npm workspace so that engine code lives in exactly one place.

### Architecture

Repo refactor turns the current single-app layout into a workspace:

```
spidj/                         (root; current single-app spidj)
├── Cargo.toml                 NEW: workspace declaration
├── package.json               NEW: npm workspaces declaration
├── crates/
│   ├── spidj-engine/          NEW: pure suggestion engine (no audio, no UI)
│   │   ├── Cargo.toml
│   │   └── src/lib.rs         port of prototypes/data.jsx::scoreTrack
│   └── serato-io/             NEW: Serato library/crate I/O
│       ├── Cargo.toml
│       └── src/
│           ├── lib.rs
│           ├── library.rs     read database V2 via `triseratops`
│           └── crate_writer.rs hand-rolled .crate binary writer
└── apps/
    ├── spidj/                 EXISTING spidj moved here; depends on
    │                          crates/spidj-engine (later, in M3)
    └── serato-planner/        NEW: standalone Tauri app
        ├── package.json
        ├── src/               React frontend
        └── src-tauri/         depends on spidj-engine + serato-io
```

The refactor is its own commit — no behavior change, just reorganisation. The existing spidj continues to work; M3 will lift its inline scoring stub into the shared crate when it lands.

### Build order (when we resume)

#### SP-0 — Workspace refactor

- Move existing files into `apps/spidj/` (keep git history with `git mv`).
- Add root `Cargo.toml` with `members = ["crates/*", "apps/*/src-tauri"]`.
- Add root `package.json` with `workspaces: ["apps/*"]`.
- Update spidj's path references (CLAUDE.md, plan, hardware memory).
- **Acceptance:** `cargo build --workspace` clean; `cd apps/spidj && npm run tauri dev` still launches the existing app and M2 features still work.

#### SP-1 — Engine crate (`crates/spidj-engine`)

- Port `prototypes/data.jsx::scoreTrack` + `getSuggestions` to Rust.
  - Pure functions; no I/O.
  - Public API:
    ```rust
    pub struct Track { pub id, pub title, pub artist, pub bpm,
                       pub key, pub genre, pub tags, pub year, pub energy }
    pub struct Settings { pub criteria_enabled, pub strictness,
                          pub bpm_tol_down_pct, pub bpm_tol_up_pct }
    pub struct Suggestion { pub track: Track, pub score: f32,
                            pub reasons: Vec<Reason> }
    pub fn suggest(anchor: &Track, library: &[Track],
                   settings: &Settings) -> Vec<Suggestion>
    ```
- Note in code header: `prototypes/data.jsx` uses fixed-point scoring (BPM = 4 pts, Key = 5 pts, …); `requirements.md §6.3` specifies normalised 0–1 mean. Port the prototype's behavior verbatim for now; reconcile with §6.3 in spidj M3 (separate decision).
- `cargo test`-only verification (no UI, no integration tests).

#### SP-2 — Serato I/O crate (`crates/serato-io`)

- **Reading the library**:
  - Resolve default `_Serato_/` location: `%USERPROFILE%\Music\_Serato_\` on Windows; `~/Music/_Serato_/` on Mac. Allow override via picker.
  - Parse `database V2` directly. Format is the same `[4-byte tag][4-byte BE length][payload]` records used by `.crate` files (confirmed by the SP spike on 2026-05-02). Track records are `otrk`; the path lives in a nested `pfil` sub-record (UTF-16 BE). No `triseratops` dep needed for the basic library read; reconsider if richer Serato metadata (cue points, beatgrids) becomes interesting later.
  - Project Serato's record into `spidj_engine::Track`. Mappings:
    - title, artist, BPM, key — directly available.
    - genre — from Serato's "genre" tag; fallback to ID3 if missing.
    - tags — Serato has a free-text "comment" field; for MVP we **don't** auto-parse tags; leave empty (engine handles missing tags as 0 score).
    - year — from `year` field if present.
    - energy — Serato doesn't expose this consistently; default to mid-scale (5).
  - Return `Library { tracks: Vec<Track>, by_id: HashMap<String, usize> }`.

- **Writing a crate**:
  - Hand-roll the `.crate` binary writer (no library, ~50 lines). Format:
    ```
    [4-byte ASCII tag][4-byte BE length][payload]   repeated
    ```
    - `vrsn` record with payload `"1.0/Serato ScratchLive Crate"` (UTF-16 BE).
    - One `otrk` record per track, payload contains a nested `ptrk` record holding the file path (UTF-16 BE).
  - Path encoding: copy whatever case + slash style `triseratops` returned for that track. Don't normalise.
  - Write atomically: write to `<name>.crate.tmp` then rename. Refuse to overwrite an existing `.crate` of the same name (UI prompts to rename).
  - **Never** modify `database V2` or pre-existing `.crate` files.

#### SP-3 — Serato planner Tauri app (`apps/serato-planner`)

Frontend (React + TS, Tailwind):

- **Library bar**: "Choose Serato folder" button + path display + track count.
- **Search box** (top centre): debounced substring filter on title/artist/genre. Dropdown shows top 8 matches.
- **Graph view** (centre, fills most of the window): a single anchor node + 6–10 leaf suggestion nodes arranged radially. Lift `prototypes/graph.jsx::radialPositions` for layout.
- **Click a leaf node**:
  1. Adds it to the working crate (sidebar list).
  2. Becomes the new anchor; suggestions re-render around it.
  3. The previous anchor is now the **first** node in the working crate; all subsequent clicks append.
- **Working crate sidebar** (right): ordered list of added tracks. Drag to reorder. Trash icon to remove. Bottom: "Save crate" button + name input.
- **Settings drawer**: minimal — toggles for which criteria contribute (BPM / key / genre / tags / artist / year / energy), strictness slider (Loose ↔ Strict). Persisted to a JSON file in the app's data dir.
- **No audio playback.** This app is offline planning only.

Backend (`apps/serato-planner/src-tauri`) commands:

| Command | Inputs | Returns |
|---|---|---|
| `library_open` | folder path | `Library` summary + track count |
| `library_search` | query string | `Vec<Track>` (top N matches) |
| `engine_suggest` | anchor track id, settings | `Vec<Suggestion>` |
| `crate_write` | name, ordered list of track ids | `()` or descriptive error |
| `settings_load` / `settings_save` | (none) / `Settings` | persistence |

The library is loaded once into Rust state at `library_open` time; subsequent commands operate on the in-memory `Library` for snappy interaction.

#### SP-4 — Manual acceptance walkthrough

1. `cargo build --workspace` and `cd apps/serato-planner && npm run tauri dev` — both clean, window opens.
2. Click "Choose Serato folder" → pick the user's `_Serato_/` → status shows track count matching Serato itself.
3. Type a known track name in the search box → autocomplete shows it.
4. Click the result → the central node appears with a track on it; ~7 suggestion nodes render around it.
5. Click a leaf node → it joins the working-crate sidebar; the leaf becomes the new anchor; a fresh suggestion ring renders.
6. Repeat 5× to build a 5-track set.
7. Reorder one entry in the sidebar via drag.
8. Type "Test Set" in the name field; click Save → file appears at `_Serato_/Subcrates/Test Set.crate`.
9. Quit Serato (if running). Open Serato fresh → "Test Set" crate appears in the sidebar with the correct tracks in the correct order.
10. Toggle off the "Year" criterion in settings → re-anchor on a track → results visibly differ.

### Open questions / defaults

- **Anchor history / back button**: not in MVP. Easy to add later.
- **Multiple anchors / branching**: not in MVP. The forward-walk is the whole UX.
- **Crate folders (subcrates / nesting)**: not in MVP. All saves to flat `Subcrates/`.
- **Database V2 writes**: out of scope permanently. Read-only.
- **Edit existing crate**: out of scope for MVP. New crates only. Editing an existing crate would risk breaking Serato's expectations on a file it owns.
- **OS coverage**: design is OS-agnostic; will test on the user's primary OS first (Windows). Mac support requires only the default-folder resolution to flip on `cfg(target_os = "macos")`.
- **Metadata gaps**: tracks Serato hasn't analysed (no BPM/key) get filtered out by the BPM hard-filter when used as candidates; as anchors they fall through to a "select another track — this one is missing BPM" tooltip.

### Risks

- ~~**`triseratops` API churn**~~ — resolved: spike used a hand-rolled parser; we don't depend on `triseratops` at all.
- **`.crate` writer edge cases** — paths with non-ASCII, very long names, special chars. Test against a few real-world Serato libraries.
- **Big libraries** (50k+ tracks) — read-once into memory should be fine (a few hundred MB at most). If it isn't, add lazy loading.
- **User confusion if a `.crate` doesn't appear in Serato** — likely cause: Serato was running when we wrote. Detect a running Serato process and warn.

### What this side project does NOT do

- No audio playback / preview. (The user can preview in Serato after import.)
- No editing of `database V2`.
- No editing of existing `.crate` files.
- No live MIDI / hardware integration.
- No graph zoom / pan / drag-rearrange of nodes; the graph is purely informational.

### When we resume

The user said "we'll address this separately" — so this section is a holding pattern. When we restart, the natural sequence is SP-0 → SP-1 → SP-2 → SP-3 → SP-4 with a phase doc per step (`phases/PHASE-SP-N.md`).

---

