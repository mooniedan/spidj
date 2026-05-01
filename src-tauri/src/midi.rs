// MIDI input via midir. The connection runs on its own thread (midir owns it);
// callbacks emit raw `midi:message` events to the frontend (for the dev spy)
// and call into the deck rack directly when a known mapping matches.

use midir::{Ignore, MidiInput, MidiInputConnection};
use parking_lot::Mutex;
use serde::Serialize;
use std::sync::Arc;
use std::time::SystemTime;
use tauri::{AppHandle, Emitter};

use crate::deck::{DeckId, DeckRack};

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

                // Emit for the dev spy.
                let _ = handle.emit("midi:message", &msg);

                // Try to map and act on transport.
                if let Some(action) = map_message(message) {
                    apply_action(&rack, action);
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
                    let _ = handle.emit("deck:state", &snaps);
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
    Cue(DeckId),
}

// Numark Mixtrack Platinum FX captured mapping (verified via dev spy 2026-05-01):
//   Channel 0 = Deck A, Channel 1 = Deck B.
//   Note 0x00 = Play/Pause, Note 0x01 = Cue.
// The remaining controls (pitch fader, jog, EQ, sync) come in M2.
fn map_message(msg: &[u8]) -> Option<Action> {
    if msg.len() < 3 {
        return None;
    }
    let status = msg[0];
    let data1 = msg[1];
    let data2 = msg[2];

    // Note-on with non-zero velocity = button press; note-on velocity 0 or
    // note-off = release. Act only on press.
    let is_press = matches!(status & 0xF0, 0x90) && data2 > 0;
    if !is_press {
        return None;
    }
    let channel = status & 0x0F;
    let deck = match channel {
        0 => DeckId::A,
        1 => DeckId::B,
        _ => return None,
    };

    match data1 {
        0x00 => Some(Action::PlayPause(deck)),
        0x01 => Some(Action::Cue(deck)),
        _ => None,
    }
}

fn apply_action(rack: &Mutex<DeckRack>, action: Action) {
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
        Action::Cue(id) => {
            rack.deck(id).lock().cue();
        }
    }
}
