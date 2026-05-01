// cpal output stream that mixes both decks into a chosen output device.
// Decoding is in this module too: symphonia → resample to TARGET_RATE → store
// as interleaved stereo f32 in DeckRack. Streaming decode is out of M1 scope.

use anyhow::{anyhow, Context, Result};
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{Device, SampleFormat, Stream, StreamConfig};
use parking_lot::Mutex;
use std::path::Path;
use std::sync::{mpsc, Arc};
use std::thread::JoinHandle;
use symphonia::core::audio::SampleBuffer;
use symphonia::core::codecs::DecoderOptions;
use symphonia::core::formats::FormatOptions;
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::MetadataOptions;
use symphonia::core::probe::Hint;

use crate::deck::{DeckRack, LoadedTrack};

pub const TARGET_RATE: u32 = 44_100;
pub const TARGET_CHANNELS: u16 = 2;

/// Owns the audio output thread, lets us swap output devices at runtime.
/// `cpal::Stream` is `!Send + !Sync` on Windows, so the stream lives entirely
/// inside the spawned thread; we only keep a shutdown channel + JoinHandle.
pub struct AudioController {
    rack: Arc<Mutex<DeckRack>>,
    crossfader: Arc<Mutex<f32>>,
    inner: Mutex<Option<Running>>,
}

struct Running {
    shutdown: mpsc::Sender<()>,
    handle: JoinHandle<()>,
}

impl AudioController {
    pub fn new(rack: Arc<Mutex<DeckRack>>, crossfader: Arc<Mutex<f32>>) -> Self {
        Self {
            rack,
            crossfader,
            inner: Mutex::new(None),
        }
    }

    pub fn start(&self, device_name: Option<String>) -> Result<()> {
        self.stop();
        let (sd_tx, sd_rx) = mpsc::channel::<()>();
        let (init_tx, init_rx) = mpsc::channel::<Result<()>>();
        let rack = self.rack.clone();
        let xfader = self.crossfader.clone();
        let device_name_owned = device_name.clone();

        let handle = std::thread::Builder::new()
            .name("spidj-audio".into())
            .spawn(move || {
                match build_and_play_stream(rack, xfader, device_name_owned.as_deref()) {
                    Ok(stream) => {
                        let _ = init_tx.send(Ok(()));
                        // Block until shutdown (or sender dropped). Stream
                        // stays alive on this thread's stack until then.
                        let _ = sd_rx.recv();
                        drop(stream);
                    }
                    Err(e) => {
                        let _ = init_tx.send(Err(e));
                    }
                }
            })?;

        match init_rx.recv() {
            Ok(Ok(())) => {
                *self.inner.lock() = Some(Running {
                    shutdown: sd_tx,
                    handle,
                });
                Ok(())
            }
            Ok(Err(e)) => {
                let _ = handle.join();
                Err(e)
            }
            Err(e) => Err(anyhow!("audio thread did not report status: {e}")),
        }
    }

    pub fn stop(&self) {
        if let Some(running) = self.inner.lock().take() {
            let _ = running.shutdown.send(());
            let _ = running.handle.join();
        }
    }
}

pub fn list_output_devices() -> Vec<String> {
    let host = cpal::default_host();
    let default_name = host
        .default_output_device()
        .and_then(|d| d.name().ok())
        .unwrap_or_default();
    let mut out = Vec::new();
    if !default_name.is_empty() {
        out.push(format!("(default) {default_name}"));
    }
    if let Ok(devices) = host.output_devices() {
        for d in devices {
            if let Ok(name) = d.name() {
                if name != default_name {
                    out.push(name);
                }
            }
        }
    }
    out
}

fn pick_device(name: Option<&str>) -> Result<Device> {
    let host = cpal::default_host();
    if let Some(want) = name {
        // Strip the "(default) " prefix the UI may carry.
        let want = want.strip_prefix("(default) ").unwrap_or(want);
        for d in host.output_devices()? {
            if let Ok(n) = d.name() {
                if n == want {
                    return Ok(d);
                }
            }
        }
        // Fallback: try default if explicit pick missing.
        eprintln!("[audio] device {:?} not found, falling back to default", want);
    }
    host.default_output_device()
        .ok_or_else(|| anyhow!("no default output device"))
}

fn build_and_play_stream(
    rack: Arc<Mutex<DeckRack>>,
    crossfader: Arc<Mutex<f32>>,
    device_name: Option<&str>,
) -> Result<Stream> {
    let device = pick_device(device_name)?;

    let device_name = device.name().unwrap_or_else(|_| "?".into());
    let supported = device.default_output_config()?;
    let sample_format = supported.sample_format();
    let config: StreamConfig = supported.config();
    let out_rate = config.sample_rate.0;
    let out_channels = config.channels;

    eprintln!(
        "[audio] device={} rate={} channels={} format={:?}",
        device_name, out_rate, out_channels, sample_format
    );

    let err_fn = |err| eprintln!("[audio] stream error: {err}");

    let stream = match sample_format {
        SampleFormat::F32 => {
            let rack = rack.clone();
            let xfader = crossfader.clone();
            device.build_output_stream(
                &config,
                move |data: &mut [f32], _| {
                    mix_into(&rack, &xfader, data, out_channels, out_rate);
                },
                err_fn,
                None,
            )?
        }
        SampleFormat::I16 => {
            let rack = rack.clone();
            let xfader = crossfader.clone();
            device.build_output_stream(
                &config,
                move |data: &mut [i16], _| {
                    let mut tmp = vec![0.0f32; data.len()];
                    mix_into(&rack, &xfader, &mut tmp, out_channels, out_rate);
                    for (o, s) in data.iter_mut().zip(tmp.iter()) {
                        *o = (s.clamp(-1.0, 1.0) * i16::MAX as f32) as i16;
                    }
                },
                err_fn,
                None,
            )?
        }
        SampleFormat::U16 => {
            let rack = rack.clone();
            let xfader = crossfader.clone();
            device.build_output_stream(
                &config,
                move |data: &mut [u16], _| {
                    let mut tmp = vec![0.0f32; data.len()];
                    mix_into(&rack, &xfader, &mut tmp, out_channels, out_rate);
                    for (o, s) in data.iter_mut().zip(tmp.iter()) {
                        let v = (s.clamp(-1.0, 1.0) * 0.5 + 0.5) * u16::MAX as f32;
                        *o = v as u16;
                    }
                },
                err_fn,
                None,
            )?
        }
        SampleFormat::I32 => {
            let rack = rack.clone();
            let xfader = crossfader.clone();
            device.build_output_stream(
                &config,
                move |data: &mut [i32], _| {
                    let mut tmp = vec![0.0f32; data.len()];
                    mix_into(&rack, &xfader, &mut tmp, out_channels, out_rate);
                    for (o, s) in data.iter_mut().zip(tmp.iter()) {
                        *o = (s.clamp(-1.0, 1.0) * i32::MAX as f32) as i32;
                    }
                },
                err_fn,
                None,
            )?
        }
        other => return Err(anyhow!("unsupported sample format: {:?}", other)),
    };

    stream.play()?;
    Ok(stream)
}

/// Per-deck rendering scratch we collect under the lock for one callback.
struct DeckRender {
    samples: Arc<Vec<f32>>,
    in_channels: usize,
    speed: f64,
    start_pos: f64,
    cue_active: bool,
    /// Crossfader weight on master: (1-x) for A, x for B.
    master_weight: f32,
}

/// Mix both decks into the output buffer. Output is interleaved.
/// Channels 0/1 carry the master mix (post-crossfader). Channels 2/3 carry the
/// cue mix (sum of decks whose cue_active is true; no crossfader weight).
/// Devices with only 2 channels receive master only.
fn mix_into(
    rack: &Mutex<DeckRack>,
    crossfader: &Mutex<f32>,
    out: &mut [f32],
    out_channels: u16,
    out_rate: u32,
) {
    for s in out.iter_mut() {
        *s = 0.0;
    }

    let frames = out.len() / out_channels.max(1) as usize;
    let rate_ratio = TARGET_RATE as f64 / out_rate.max(1) as f64;
    let oc = out_channels as usize;
    let has_cue_pair = oc >= 4;

    // Snapshot per-deck render data and crossfader, then release the locks
    // before the inner sample loop so we don't hold them across thousands of
    // sample reads. The position write-back happens at the end via the same
    // lock pattern.
    let xfader = (*crossfader.lock()).clamp(0.0, 1.0);

    let rack_guard = rack.lock();
    let mut renders: [Option<DeckRender>; 2] = [None, None];
    for (idx, deck_mtx) in rack_guard.decks.iter().enumerate() {
        let deck = deck_mtx.lock();
        if !deck.playing {
            continue;
        }
        let Some(track) = deck.track.as_ref() else {
            continue;
        };
        let master_weight = match deck.id {
            crate::deck::DeckId::A => 1.0 - xfader,
            crate::deck::DeckId::B => xfader,
        };
        renders[idx] = Some(DeckRender {
            samples: track.samples.clone(),
            in_channels: track.channels.max(1) as usize,
            speed: deck.speed as f64 * rate_ratio,
            start_pos: deck.position_frames as f64,
            cue_active: deck.cue_active,
            master_weight,
        });
    }
    drop(rack_guard);

    // Per-deck final positions and reached-end flags, written back below.
    let mut new_positions: [Option<u64>; 2] = [None, None];
    let mut reached_end: [bool; 2] = [false, false];

    for (idx, maybe_render) in renders.iter().enumerate() {
        let Some(r) = maybe_render else { continue };
        let total_frames = (r.samples.len() / r.in_channels) as f64;
        let mut pos = r.start_pos;

        // Master attenuation: 0.5 keeps the sum-of-two-decks below clip even
        // with crossfader centred. M2 keeps the same headroom strategy.
        let master_gain = r.master_weight * 0.5;
        let cue_gain = if r.cue_active { 0.5 } else { 0.0 };

        for f in 0..frames {
            if pos >= total_frames {
                reached_end[idx] = true;
                break;
            }
            let i = pos as usize;
            let frame_base = i * r.in_channels;
            let (l, r_s) = if r.in_channels >= 2 {
                (r.samples[frame_base], r.samples[frame_base + 1])
            } else {
                let m = r.samples[frame_base];
                (m, m)
            };

            let out_base = f * oc;
            // Master pair → channels 0/1.
            if oc >= 2 {
                out[out_base] += l * master_gain;
                out[out_base + 1] += r_s * master_gain;
            } else if oc == 1 {
                out[out_base] += (l + r_s) * 0.5 * master_gain;
            }
            // Cue pair → channels 2/3 if available.
            if has_cue_pair && cue_gain > 0.0 {
                out[out_base + 2] += l * cue_gain;
                out[out_base + 3] += r_s * cue_gain;
            }

            pos += r.speed;
        }

        new_positions[idx] = Some(pos as u64);
    }

    // Write positions and clear `playing` on EOF in a second short critical
    // section.
    let rack_guard = rack.lock();
    for (idx, deck_mtx) in rack_guard.decks.iter().enumerate() {
        let mut deck = deck_mtx.lock();
        if let Some(p) = new_positions[idx] {
            deck.position_frames = p;
        }
        if reached_end[idx] {
            deck.playing = false;
            deck.cue_held = false;
        }
    }
}

/// Decode an audio file to interleaved stereo f32 @ TARGET_RATE.
/// Sample-rate conversion is naive linear; good enough for M1 and most files
/// will already be 44.1k or 48k.
pub fn decode_file(path: &Path) -> Result<LoadedTrack> {
    let file = std::fs::File::open(path).with_context(|| format!("open {:?}", path))?;
    let mss = MediaSourceStream::new(Box::new(file), Default::default());

    let mut hint = Hint::new();
    if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
        hint.with_extension(ext);
    }

    let probed = symphonia::default::get_probe().format(
        &hint,
        mss,
        &FormatOptions::default(),
        &MetadataOptions::default(),
    )?;

    let mut format = probed.format;
    let track = format
        .default_track()
        .ok_or_else(|| anyhow!("no default audio track"))?;
    let track_id = track.id;

    let codec_params = track.codec_params.clone();
    let mut decoder = symphonia::default::get_codecs()
        .make(&codec_params, &DecoderOptions::default())?;

    let src_rate = codec_params.sample_rate.unwrap_or(TARGET_RATE);
    let src_channels = codec_params
        .channels
        .map(|c| c.count() as u16)
        .unwrap_or(2);

    // Pull metadata title/artist if present.
    let (title, artist) = read_title_artist(&mut format);

    let mut interleaved: Vec<f32> = Vec::new();

    loop {
        let packet = match format.next_packet() {
            Ok(p) => p,
            Err(symphonia::core::errors::Error::IoError(e))
                if e.kind() == std::io::ErrorKind::UnexpectedEof =>
            {
                break;
            }
            Err(e) => return Err(e.into()),
        };
        if packet.track_id() != track_id {
            continue;
        }
        let decoded = match decoder.decode(&packet) {
            Ok(d) => d,
            Err(symphonia::core::errors::Error::DecodeError(_)) => continue,
            Err(e) => return Err(e.into()),
        };

        let spec = *decoded.spec();
        let mut sb = SampleBuffer::<f32>::new(decoded.capacity() as u64, spec);
        sb.copy_interleaved_ref(decoded);
        interleaved.extend_from_slice(sb.samples());
    }

    // Force stereo: if mono, duplicate; if >2, take first two.
    let interleaved = match src_channels {
        1 => {
            let mut out = Vec::with_capacity(interleaved.len() * 2);
            for s in &interleaved {
                out.push(*s);
                out.push(*s);
            }
            out
        }
        2 => interleaved,
        n => {
            let n = n as usize;
            let frames = interleaved.len() / n;
            let mut out = Vec::with_capacity(frames * 2);
            for f in 0..frames {
                out.push(interleaved[f * n]);
                out.push(interleaved[f * n + 1]);
            }
            out
        }
    };

    // Resample to TARGET_RATE if needed (naive linear).
    let interleaved = if src_rate == TARGET_RATE {
        interleaved
    } else {
        resample_linear_stereo(&interleaved, src_rate, TARGET_RATE)
    };

    let duration_samples = (interleaved.len() / TARGET_CHANNELS as usize) as u64;

    Ok(LoadedTrack {
        path: path.to_path_buf(),
        title,
        artist,
        samples: Arc::new(interleaved),
        sample_rate: TARGET_RATE,
        channels: TARGET_CHANNELS,
        duration_samples,
    })
}

fn read_title_artist(
    format: &mut Box<dyn symphonia::core::formats::FormatReader>,
) -> (Option<String>, Option<String>) {
    let mut title = None;
    let mut artist = None;
    if let Some(metadata) = format.metadata().current() {
        for tag in metadata.tags() {
            let key = tag.std_key.map(|k| format!("{:?}", k)).unwrap_or_default();
            let val = tag.value.to_string();
            match key.as_str() {
                "TrackTitle" => title.get_or_insert(val),
                "Artist" | "AlbumArtist" => artist.get_or_insert(val),
                _ => continue,
            };
        }
    }
    (title, artist)
}

fn resample_linear_stereo(input: &[f32], src_rate: u32, dst_rate: u32) -> Vec<f32> {
    if src_rate == dst_rate || input.is_empty() {
        return input.to_vec();
    }
    let in_frames = input.len() / 2;
    let ratio = dst_rate as f64 / src_rate as f64;
    let out_frames = (in_frames as f64 * ratio) as usize;
    let mut out = Vec::with_capacity(out_frames * 2);

    for i in 0..out_frames {
        let src_pos = i as f64 / ratio;
        let i0 = src_pos.floor() as usize;
        let i1 = (i0 + 1).min(in_frames - 1);
        let t = (src_pos - i0 as f64) as f32;
        let l = input[i0 * 2] * (1.0 - t) + input[i1 * 2] * t;
        let r = input[i0 * 2 + 1] * (1.0 - t) + input[i1 * 2 + 1] * t;
        out.push(l);
        out.push(r);
    }
    out
}
