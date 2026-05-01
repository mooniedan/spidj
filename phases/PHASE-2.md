# PHASE-2 — M2 Mixing Essentials

Plan: `.claude/plans/let-s-focmulate-an-implementation-dazzling-porcupine.md` → "M2 — Mixing essentials" section.

## Scope

Real DJ mixing: pitch fader per deck, full CDJ-style cue behavior, crossfader-weighted master mix, and 4-channel split routing so the controller's headphone outputs cue silently to master.

REQ coverage:

- REQ-DECK-02 (partial): pitch fader is functional. Full CDJ chrome (platter / EQ / waveform) remains M4.
- REQ-DECK-03 (extended): transport now also includes proper cue-set / cue-jump / cue-preview and crossfader-weighted output.

## Out of scope (deferred)

- Jog-wheel nudge + scratch (M3).
- Learn Mode persistence + per-config UI (M3).
- EQ knob audio routing (REQ-DECK-03 keeps EQ visual-only for now).
- Sync, FX, hot cues, beatgrid.

## Files touched

| Path | Note |
|---|---|
| `src-tauri/src/deck.rs` | New fields: `pitch_norm`, `cue_position_frames`, `cue_held`, `cue_active`. New methods: `set_pitch`, `cue_press`, `cue_release`, `toggle_cue_active`. Updated `DeckSnapshot`. New `AppSnapshot`. |
| `src-tauri/src/audio.rs` | `mix_into` refactored: per-deck render snapshot under short locks, then split master (ch 0/1, crossfader-weighted) vs cue (ch 2/3, sum of cue-active decks) routing. `AudioController` accepts crossfader Arc. |
| `src-tauri/src/midi.rs` | CC + Note-Off handling. New `Action` variants. Captured constants for pitch (CC 0x09 MSB, LSB 0x29 ignored), crossfader (channel 15, CC 0x08), and headphone cue (note 0x1B). Spy-log file at `%TEMP%\spidj-midi.log` for sample-accurate captures beyond the UI's 50-line cap. |
| `src-tauri/src/commands.rs` | New commands: `deck_cue_press`, `deck_cue_release`, `deck_toggle_cue_active`, `deck_set_pitch`, `crossfader_set`, `app_snapshot`. Extended event payload to `AppSnapshot { decks, crossfader }`. |
| `src-tauri/src/lib.rs` | `AppState.crossfader: Arc<Mutex<f32>>`. Wires into audio thread + MIDI callback. |
| `src/components/Deck.tsx` | Pitch % readout. Position bar with cue marker. Headphone-cue toggle button. |
| `src/components/Crossfader.tsx` | New. Visual strip showing crossfader position. |
| `src/components/MidiBar.tsx` | Spy panel got a Clear button + count (added during M2.0). |
| `src/App.tsx` | Subscribes to `deck:state` as `AppSnapshot`. Mounts Crossfader. |
| `src/types.ts` | Extended `DeckSnapshot`. New `AppSnapshot`. |
| `src/ipc/tauri.ts` | New IPC wrappers, `onAppState` listener. |

## Captured Numark Mixtrack Platinum FX MIDI codes (M2.0)

| Control | Status | Data1 | Data2 |
|---|---|---|---|
| Pitch fader Deck A (MSB) | `B0` | `0x09` | 0–127 |
| Pitch fader Deck A (LSB, ignored) | `B0` | `0x29` | 0–127 |
| Pitch fader Deck B (MSB) | `B1` | `0x09` | 0–127 |
| Crossfader | `BF` (channel 15) | `0x08` | 0–127 |
| Headphone cue Deck A | `90`/`80` | `0x1B` | velocity / 0 |
| Headphone cue Deck B | `91`/`81` | `0x1B` | velocity / 0 |

Pitch is 14-bit MIDI (MSB on 0x09, LSB on 0x09+0x20=0x29). MSB alone gives 128 positions across the throw — enough for ±8% pitch.

## Acceptance checks

All walked successfully on 2026-05-01 with the Numark connected:

1. ☑ Pitch fader Deck A: hardware fader smoothly varies the deck's pitch in real time; on-screen pitch % readout matches; centred fader = 0.00%.
2. ☑ Pitch fader Deck B: same.
3. ☑ Crossfader fully left → only Deck A in master; fully right → only Deck B; centred → both audible. UI strip mirrors hardware position.
4. ☑ Cue press while playing → jumps to cue, pauses.
5. ☑ Cue press while paused not at cue → cue point updates to current position; on-screen position bar tick moves.
6. ☑ Cue press-and-hold while paused at cue → plays preview while held; release returns to cue and stops.
7. ☑ Headphone cue toggle on Deck A: with crossfader fully right (master = B), toggling Deck A's cue plays A in headphones silent to master.
8. ☑ Toggle cue off → headphones go silent (strict cue routing).

## Open questions / default resolutions

- **Mirror master to headphones on no-cue**: tried briefly, removed. Strict cue routing matches real DJ workflow; users can use the controller's hardware Cue/Master blend knob for monitoring master in headphones.
- **Pitch fader resolution**: MSB only (7-bit) is sufficient for ±8% throw. 14-bit upgrade is post-MVP.
- **Visual crossfader is read-only**: hardware-driven; on-screen drag ships in M3.
- **Spy log file location**: `%TEMP%\spidj-midi.log`, truncated on each `midi_connect`. Useful for debugging, not user-visible.

## Status

**Completed 2026-05-01.** M2 ships a usable mixing setup. Pitch + crossfader + full cue + 4-channel routing all verified end-to-end on the Numark Mixtrack Platinum FX. Ready to commit and push.
