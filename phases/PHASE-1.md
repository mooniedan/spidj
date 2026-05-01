# PHASE-1 — M1 vertical slice (controller → audio)

Plan: `.claude/plans/let-s-focmulate-an-implementation-dazzling-porcupine.md`

## Scope

The first shippable milestone. Verifies the hardware-to-audio loop end-to-end:

- Plug in Numark Mixtrack Platinum.
- Pick a music folder; see scanned tracks.
- Load two tracks to deck A and deck B.
- Press Play / Cue on the controller; audio comes out of the system audio device.
- Both decks can play simultaneously.

REQ-IDs partially or fully covered:

- REQ-DECK-01 (two virtual decks render side by side) — minimal version, full chrome lands in M4.
- REQ-DECK-03 (transport drives real audio) — *as amended 2026-05-01*.
- REQ-LIB-01..03 (library lists tracks with metadata; rows have load actions) — minimal version against scanned folder, full chrome lands in M4.

## Out of scope (deferred)

- REQ-DECK-02 (CDJ chrome: spinning platter, EQ knobs, waveform, pitch fader).
- REQ-DECK-04..08 (live-glow, anchor border, click-to-anchor, drag-drop).
- REQ-LIB-04..08 (search, filter pills, sortable columns).
- REQ-GRAPH-* / REQ-QUEUE-* / REQ-CFG-* (graph, queue, settings) — M4+.
- Pitch fader, jog nudge, jog scratch, crossfader, learn-mode mapping — M2.
- BPM/key/energy mock metadata for the engine — M3.

## Files touched

| Path | New | Note |
|---|---|---|
| `Claude.md` | mod | Rewrote for Tauri pivot. |
| `.claude/requirements.md` | mod | Amended §1.4 + §2 to retire mock-only / no-audio non-goals; amended REQ-DECK-03. |
| `package.json`, `vite.config.ts`, `tsconfig.json`, `tsconfig.node.json`, `tailwind.config.js`, `postcss.config.js`, `index.html`, `.gitignore` | new | Frontend scaffold. |
| `src/main.tsx`, `src/App.tsx`, `src/index.css`, `src/types.ts` | new | React entry + IPC types. |
| `src/ipc/tauri.ts` | new | Typed wrappers around invoke / listen. |
| `src/components/MidiBar.tsx`, `Library.tsx`, `Deck.tsx` | new | M1 UI. |
| `src-tauri/Cargo.toml`, `tauri.conf.json`, `build.rs` | new | Tauri scaffold. |
| `src-tauri/src/{main,lib,deck,audio,library,midi,commands}.rs` | new | Backend modules. |

## Acceptance checks

All walked successfully on 2026-05-01 with the Numark Mixtrack Platinum FX connected:

1. ☑ `npm install` clean.
2. ☑ `cd src-tauri && cargo build` clean.
3. ☑ `npm run tauri dev` opens a window with no console / Cargo errors.
4. ☑ MIDI bar lists the Numark; selecting it + pressing controls makes the "last message" hex update.
5. ☑ "Choose folder" → pick a folder of mixed audio → table populates.
6. ☑ Click "Load A" / "Load B" → deck panels show track titles.
7. ☑ On-screen Play → audio plays through controller's headphones; LIVE pill + red bloom appear.
8. ☑ Pause stops audio.
9. ☑ Both decks playable simultaneously; audio mixes.
10. ☑ Controller's Play A / Play B drive transport.
11. ☑ Cue on a playing deck pauses + rewinds to start.
12. ☑ Captured codes via dev spy: ch0/note0x00 = Play, ch0/note0x01 = Cue (Deck A); ch1 mirrors for Deck B. Mapping in `src-tauri/src/midi.rs` updated.

## Open questions / default resolutions

- **Numark MIDI codes are placeholders.** `midi.rs` currently assumes Note-On 0x3B = Play, 0x33 = Cue, channel 0/1 = Deck A/B (a common Numark stock-mapping convention). Step 12 above confirms or replaces these.
- **Sample-rate mismatch.** Decode pipeline resamples to 44.1 kHz on load via naive linear interpolation. Acceptable for M1; replace with `rubato` in M3 if quality issues surface.
- **Decode-to-memory only.** Files are fully decoded into a `Vec<f32>` on load. Acceptable for typical 5–10 min tracks; very long files / lossless flac will be heavy. Streaming decode is M2+.
- **Audio device sample format.** Engine handles f32 / i16 / u16 cpal stream formats. Other formats fail at startup with a clear error.
- **No persistence yet.** App forgets selected folder + MIDI port on close. Tauri-fs config file lands in M2 alongside learn-mode mapping.
- **Volume.** Each deck mixes at 0.5; total never clips. M2's crossfader replaces this.

## Prerequisites the user must install (one-time)

Per `.claude/poc.md`, these are required for the Tauri backend to build at all:

- **Rust** via `rustup` — not currently on this machine. Install from https://rustup.rs.
- **Visual Studio Build Tools** with the "Desktop development with C++" workload — required by the MSVC linker that `cpal`/`midir`/`tauri` build against.
- Node.js LTS — *already installed* (v22.4.1).

After installing Rust, run `cd src-tauri && cargo build` once to fetch the dep tree (this will take several minutes the first time).

## Status

**Completed 2026-05-01.** M1 vertical slice fully verified end-to-end with hardware connected. Audio plays through the Numark Mixtrack Platinum FX's headphones, on-screen and on-controller transport both work, both decks mix simultaneously.

Notes captured during the walk-through:
- Output device picker added (`src/components/AudioBar.tsx`) so the user can pick a non-default audio device — turned out unnecessary in the end since Numark was already default, but it's there for future flexibility.
- Mix routes the same stereo pair to all output channel pairs so 4-channel devices (controller master + headphone cue) get audio everywhere. Independent cue routing is M2.
- Numark demo animations continue while spidj is connected; cosmetic only. Serato uses a proprietary HID handshake to suppress them — out of scope for M1.
