// MIDI input via midir. The connection runs on its own thread (midir owns it);
// callbacks emit raw `midi:message` events to the frontend (for the dev spy)
// and call into the deck rack directly when a known mapping matches.

use midir::{Ignore, MidiInput, MidiInputConnection};
use parking_lot::Mutex;
use serde::Serialize;
use std::fs::File;
use std::io::{BufWriter, Write};
use std::path::PathBuf;
use std::sync::Arc;
use std::time::SystemTime;
use tauri::{AppHandle, Emitter};

use crate::deck::{DeckId, DeckRack};

fn midi_log_path() -> PathBuf {
    std::env::temp_dir().join("spidj-midi.log")
}

#[derive(Debug, Clone, Serialize)]
pub struct MidiMessage {
    pub timestamp_ms: u128,
    pub data: Vec<u8>,
}

pub struct MidiState {
    handle: Option<AppHandle>,
    _conn: Option<MidiInputConnection<()>>,
}

impl MidiState {
    pub fn new() -> Self {
        Self {
            handle: None,
            _conn: None,
        }
    }

    pub fn set_handle(&mut self, handle: AppHandle) {
        self.handle = Some(handle);
    }
}

pub fn list_inputs() -> Result<Vec<String>, String> {
    let midi_in = MidiInput::new("spidj-midi-enum").map_err(|e| e.to_string())?;
    Ok(midi_in
        .ports()
        .iter()
        .map(|p| midi_in.port_name(p).unwrap_or_else(|_| "Unknown".to_string()))
        .collect())
}

pub fn connect(
    state: &Mutex<MidiState>,
    rack: Arc<Mutex<DeckRack>>,
    crossfader: Arc<Mutex<f32>>,
    port_index: usize,
) -> Result<(), String> {
    let mut midi_in = MidiInput::new("spidj-midi-in").map_err(|e| e.to_string())?;
    midi_in.ignore(Ignore::None);

    let ports = midi_in.ports();
    let port = ports
        .get(port_index)
        .ok_or_else(|| "invalid MIDI port index".to_string())?
        .clone();

    let handle = state
        .lock()
        .handle
        .clone()
        .ok_or_else(|| "AppHandle not set".to_string())?;

    // Open (truncating) the spy log file. Each callback appends the message
    // so the agent reading the file gets a complete capture without the
    // 50-line UI cap.
    let log_path = midi_log_path();
    let log_writer: Arc<Mutex<Option<BufWriter<File>>>> = match File::create(&log_path) {
        Ok(f) => {
            eprintln!("[midi] spy log → {}", log_path.display());
            Arc::new(Mutex::new(Some(BufWriter::new(f))))
        }
        Err(e) => {
            eprintln!("[midi] could not open spy log {}: {e}", log_path.display());
            Arc::new(Mutex::new(None))
        }
    };

    let conn = midi_in
        .connect(
            &port,
            "spidj-midi-conn",
            move |_stamp, message, _| {
                let now = SystemTime::now()
                    .duration_since(SystemTime::UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_millis();

                let msg = MidiMessage {
                    timestamp_ms: now,
                    data: message.to_vec(),
                };

                // Append to spy log (truncate-on-connect, append-on-message).
                if let Some(w) = log_writer.lock().as_mut() {
                    let mut line = format!("{now}");
                    for b in message {
                        line.push_str(&format!(" {:02X}", b));
                    }
                    line.push('\n');
                    let _ = w.write_all(line.as_bytes());
                    let _ = w.flush();
                }

                // Emit for the dev spy.
                let _ = handle.emit("midi:message", &msg);

                // Try to map and act.
                if let Some(action) = map_message(message) {
                    apply_action(&rack, &crossfader, action);
                    let snaps: Vec<_> = {
                        let r = rack.lock();
                        r.decks
                            .iter()
                            .map(|d| {
                                crate::deck::DeckSnapshot::from_deck(
                                    &d.lock(),
                                    crate::audio::TARGET_RATE,
                                )
                            })
                            .collect()
                    };
                    let payload = crate::deck::AppSnapshot {
                        decks: snaps,
                        crossfader: *crossfader.lock(),
                    };
                    let _ = handle.emit("deck:state", &payload);
                }
            },
            (),
        )
        .map_err(|e| e.to_string())?;

    state.lock()._conn = Some(conn);
    Ok(())
}

#[derive(Debug, Clone, Copy)]
enum Action {
    PlayPause(DeckId),
    CuePress(DeckId),
    CueRelease(DeckId),
    SetPitch(DeckId, f32),
    Crossfader(f32),
    ToggleCueActive(DeckId),
}

// Numark Mixtrack Platinum FX captured mappings (M1 + M2.0, 2026-05-01).
// Channel 0 = Deck A, Channel 1 = Deck B.
// Note codes:
const NOTE_PLAY: u8 = 0x00;
const NOTE_TRANSPORT_CUE: u8 = 0x01;
const NOTE_HEADPHONE_CUE: u8 = 0x1B;
// CC codes for per-deck controls:
//   Pitch fader is 14-bit MIDI: MSB on CC 0x09, LSB on CC 0x29 (= 0x09 + 0x20).
//   We use MSB only — 128 positions across the throw is plenty for ±8% pitch.
const CC_PITCH_MSB: u8 = 0x09;
const CC_PITCH_LSB: u8 = 0x29;
// Crossfader: status BF (channel 15 / "global"), CC 0x08, value 0..127.
const CC_CROSSFADER_CHANNEL: u8 = 0x0F;
const CC_CROSSFADER_CTRL: u8 = 0x08;

fn map_message(msg: &[u8]) -> Option<Action> {
    if msg.len() < 3 {
        return None;
    }
    let status_high = msg[0] & 0xF0;
    let channel = msg[0] & 0x0F;
    let data1 = msg[1];
    let data2 = msg[2];

    match status_high {
        // Note On
        0x90 => {
            let is_press = data2 > 0;
            let deck = channel_to_deck(channel)?;
            match data1 {
                NOTE_PLAY if is_press => Some(Action::PlayPause(deck)),
                NOTE_TRANSPORT_CUE if is_press => Some(Action::CuePress(deck)),
                NOTE_TRANSPORT_CUE if !is_press => Some(Action::CueRelease(deck)),
                n if n == NOTE_HEADPHONE_CUE && is_press => Some(Action::ToggleCueActive(deck)),
                _ => None,
            }
        }
        // Note Off — Numark sends Note-Off for cue release.
        0x80 => {
            let deck = channel_to_deck(channel)?;
            if data1 == NOTE_TRANSPORT_CUE {
                Some(Action::CueRelease(deck))
            } else {
                None
            }
        }
        // Control Change
        0xB0 => {
            // Crossfader: matched on (channel, controller).
            if channel == CC_CROSSFADER_CHANNEL && data1 == CC_CROSSFADER_CTRL {
                let x = data2 as f32 / 127.0;
                return Some(Action::Crossfader(x));
            }
            // Pitch fader (14-bit MSB): per-deck.
            if data1 == CC_PITCH_MSB {
                let deck = channel_to_deck(channel)?;
                // Centre at 64; map [0,127] → [-1, +1] then clamp.
                let norm = ((data2 as f32 - 64.0) / 64.0).clamp(-1.0, 1.0);
                return Some(Action::SetPitch(deck, norm));
            }
            // Pitch fader LSB: ignored (we only need MSB resolution).
            if data1 == CC_PITCH_LSB {
                return None;
            }
            None
        }
        _ => None,
    }
}

fn channel_to_deck(channel: u8) -> Option<DeckId> {
    match channel {
        0 => Some(DeckId::A),
        1 => Some(DeckId::B),
        _ => None,
    }
}

fn apply_action(rack: &Mutex<DeckRack>, crossfader: &Mutex<f32>, action: Action) {
    let rack = rack.lock();
    match action {
        Action::PlayPause(id) => {
            let mut d = rack.deck(id).lock();
            if d.playing {
                d.pause();
            } else {
                d.play();
            }
        }
        Action::CuePress(id) => {
            rack.deck(id).lock().cue_press();
        }
        Action::CueRelease(id) => {
            rack.deck(id).lock().cue_release();
        }
        Action::SetPitch(id, norm) => {
            rack.deck(id).lock().set_pitch(norm);
        }
        Action::Crossfader(x) => {
            *crossfader.lock() = x.clamp(0.0, 1.0);
        }
        Action::ToggleCueActive(id) => {
            rack.deck(id).lock().toggle_cue_active();
        }
    }
}
