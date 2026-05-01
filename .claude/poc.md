# 🎛️ DJ App MVP / PoC (Numark Mixtrack Platinum) — Windows

## 📌 Goal

Build a **minimal DJ application** that:

* Uses **Numark Mixtrack Platinum (MIDI)**
* Plays audio tracks
* Responds to controller input:

  * Play / Pause
  * Cue
  * Pitch fader
  * Jog wheel (nudge + scratch)

---

## 🧠 Core Concept

```text
MIDI → Mapping → Deck Engine → Audio Output
```

You are **NOT decoding timecode (DVS)**.

You are:
👉 translating controller messages into playback control

---

## 🧱 Architecture

| Layer        | Tech               | Responsibility              |
| ------------ | ------------------ | --------------------------- |
| UI           | TypeScript (React) | Controls, waveform, mapping |
| Backend      | Rust               | Audio + MIDI                |
| Bridge       | Tauri              | IPC                         |
| MIDI Input   | `midir`            | Controller messages         |
| Audio Output | `cpal` (WASAPI)    | Low-latency playback        |
| Decoding     | `symphonia`        | MP3/WAV/etc                 |

---

## ⚙️ Prerequisites (Windows)

Install:

* Node.js (LTS)
* Rust (`rustup`)
* Visual Studio Build Tools (C++ workload)

---

## 🚀 Project Setup

```bash
npm create tauri-app@latest dj-mvp
cd dj-mvp
npm install
npm run tauri dev
```

---

## 📦 Rust Dependencies

Edit:

```text
src-tauri/Cargo.toml
```

Add:

```toml
[dependencies]
tauri = { version = "2", features = [] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"

midir = "0.10"
anyhow = "1"

cpal = "0.15"

symphonia = { version = "0.5", features = ["mp3", "wav", "flac", "aac", "isomp4"] }
```

---

# 🎹 STEP 1 — MIDI SPY (FOUNDATION)

## Purpose

Before anything else:
👉 **inspect what the controller sends**

---

## Rust — MIDI Module

Create:

```text
src-tauri/src/midi.rs
```

```rust
use midir::{Ignore, MidiInput};
use serde::Serialize;
use std::{sync::Arc, time::SystemTime};
use tauri::{AppHandle, Emitter};

#[derive(Debug, Clone, Serialize)]
pub struct MidiMsg {
  pub timestamp_ms: u128,
  pub data: Vec<u8>,
}

pub fn start_midi_spy(app: AppHandle, port_index: usize) -> Result<(), String> {
  let mut midi_in = MidiInput::new("dj-mvp-midi-in").map_err(|e| e.to_string())?;
  midi_in.ignore(Ignore::None);

  let ports = midi_in.ports();
  let port = ports.get(port_index).ok_or("Invalid MIDI port index")?.clone();

  let app = Arc::new(app);

  let _conn = midi_in.connect(
    &port,
    "dj-mvp-midi-conn",
    move |_stamp, message, _| {
      let now = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();

      let msg = MidiMsg {
        timestamp_ms: now,
        data: message.to_vec(),
      };

      let _ = app.emit("midi:message", msg);
    },
    (),
  ).map_err(|e| e.to_string())?;

  std::mem::forget(_conn);
  Ok(())
}

pub fn list_midi_inputs() -> Result<Vec<String>, String> {
  let midi_in = MidiInput::new("dj-mvp-midi-enum").map_err(|e| e.to_string())?;
  let ports = midi_in.ports();

  let mut names = Vec::new();
  for p in ports {
    names.push(midi_in.port_name(&p).unwrap_or("Unknown".to_string()));
  }

  Ok(names)
}
```

---

## Wire Commands

Edit:

```text
src-tauri/src/lib.rs
```

```rust
mod midi;

#[tauri::command]
fn midi_list_inputs() -> Result<Vec<String>, String> {
  midi::list_midi_inputs()
}

#[tauri::command]
fn midi_start_spy(app: tauri::AppHandle, port_index: usize) -> Result<(), String> {
  midi::start_midi_spy(app, port_index)
}

pub fn run() {
  tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![
      midi_list_inputs,
      midi_start_spy
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
```

---

## 🖥️ Frontend — MIDI Spy

```tsx
import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

type MidiMsg = {
  timestamp_ms: number;
  data: number[];
};

const hex = (n: number): string =>
  n.toString(16).padStart(2, "0").toUpperCase();

export function MidiSpy(): JSX.Element {
  const [inputs, setInputs] = useState<string[]>([]);
  const [selected, setSelected] = useState<number>(0);
  const [messages, setMessages] = useState<MidiMsg[]>([]);

  const rows = useMemo(() => messages.slice(-100).reverse(), [messages]);

  useEffect(() => {
    void (async () => {
      const list = await invoke<string[]>("midi_list_inputs");
      setInputs(list);
    })();
  }, []);

  useEffect(() => {
    const unlistenPromise = listen<MidiMsg>("midi:message", (event) => {
      setMessages((prev) => [...prev, event.payload]);
    });

    return () => {
      void (async () => {
        const unlisten = await unlistenPromise;
        unlisten();
      })();
    };
  }, []);

  const start = async (): Promise<void> => {
    await invoke("midi_start_spy", { portIndex: selected });
  };

  return (
    <div style={{ padding: 16 }}>
      <h2>MIDI Spy</h2>

      <select
        value={selected}
        onChange={(e) => setSelected(Number(e.target.value))}
      >
        {inputs.map((name, idx) => (
          <option value={idx} key={name}>
            {idx}: {name}
          </option>
        ))}
      </select>

      <button onClick={() => void start()}>Start</button>

      <table>
        <tbody>
          {rows.map((m, i) => (
            <tr key={`${m.timestamp_ms}-${i}`}>
              <td>{m.timestamp_ms}</td>
              <td>{m.data.map(hex).join(" ")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

---

# 🎧 STEP 2 — AUDIO ENGINE (NEXT)

Pipeline:

```text
file → decode → PCM buffer → audio output
```

### Responsibilities

* Load file (MP3/WAV)
* Decode using `symphonia`
* Output via `cpal`
* Maintain playback state (position, speed)

---

# 🎛️ STEP 3 — CONTROLLER MAPPING

## Strategy

❌ Do NOT hardcode controller mappings
✅ Use **Learn Mode**

Example:

```json
{
  "deckA.play": { "status": 144, "data1": 60 },
  "deckA.pitch": { "status": 176, "data1": 16 }
}
```

---

# 🎚️ STEP 4 — JOG WHEEL LOGIC

## Mode 1 — Nudge

* Jog movement → temporary pitch bend

## Mode 2 — Scratch

* Jog movement → direct playhead movement
* Activated via **touch sensor**

---

# 🧪 BUILD ORDER (CRITICAL)

1. Audio playback
2. MIDI spy
3. Play / Cue
4. Pitch fader
5. Jog (nudge)
6. Jog touch → scratch
7. Crossfader
8. Waveform UI
9. Save mappings

---

# 🎯 NEXT STEP

Run MIDI spy and capture:

* Jog wheel (CW + CCW)
* Jog touch
* Pitch fader
* Play / Cue buttons

👉 Then build:

* mapping table
* typed parser
* jog algorithm

---

# 🚧 FUTURE

* Beatgrid detection
* Sync engine
* FX chain
* Library browser
* HID support

---

# 💡 KEY CHALLENGE

The hardest part is:

👉 **latency + jog feel**

Everything else is straightforward.

```
```
