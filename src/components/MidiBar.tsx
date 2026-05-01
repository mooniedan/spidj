import { useEffect, useState } from "react";
import { ipc, onMidiMessage } from "../ipc/tauri";
import type { MidiMessage } from "../types";

const hex = (n: number) => n.toString(16).padStart(2, "0").toUpperCase();

export function MidiBar() {
  const [inputs, setInputs] = useState<string[]>([]);
  const [selected, setSelected] = useState<number>(0);
  const [connected, setConnected] = useState(false);
  const [last, setLast] = useState<MidiMessage | null>(null);
  const [recent, setRecent] = useState<MidiMessage[]>([]);
  const [showSpy, setShowSpy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    ipc.midiListInputs().then(setInputs).catch((e) => setError(String(e)));
  }, []);

  useEffect(() => {
    const unlistenPromise = onMidiMessage((m) => {
      setLast(m);
      setRecent((prev) => [m, ...prev].slice(0, 50));
    });
    return () => {
      unlistenPromise.then((u) => u());
    };
  }, []);

  const connect = async () => {
    try {
      await ipc.midiConnect(selected);
      setConnected(true);
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  };

  return (
    <div className="bg-[#1a1d22] border-b border-white/5 px-4 py-2">
      <div className="flex items-center gap-3 text-sm">
        <span className="text-white/60">MIDI</span>
        <select
          className="bg-[#22262c] text-white text-sm px-2 py-1 rounded outline-none"
          value={selected}
          onChange={(e) => setSelected(Number(e.target.value))}
        >
          {inputs.length === 0 ? (
            <option value={0}>(no MIDI inputs)</option>
          ) : (
            inputs.map((name, i) => (
              <option key={`${i}-${name}`} value={i}>
                {i}: {name}
              </option>
            ))
          )}
        </select>
        <button
          className="px-3 py-1 rounded bg-[#c8302e] hover:bg-[#a02220] text-white text-sm"
          onClick={connect}
          disabled={inputs.length === 0}
        >
          {connected ? "Reconnect" : "Connect"}
        </button>
        <span className="font-mono text-xs text-white/60 ml-auto">
          {last ? last.data.map(hex).join(" ") : "—"}
        </span>
        <button
          className="text-xs text-white/60 underline"
          onClick={() => setShowSpy((s) => !s)}
        >
          {showSpy ? "hide spy" : "show spy"}
        </button>
      </div>
      {error && <div className="text-xs text-[#c8302e] mt-1">{error}</div>}
      {showSpy && (
        <>
          <div className="flex items-center gap-2 mt-2">
            <button
              className="text-xs px-2 py-0.5 rounded bg-[#22262c] hover:bg-[#2c3036] text-white/80"
              onClick={() => setRecent([])}
            >
              Clear
            </button>
            <span className="text-xs text-white/40">
              {recent.length} message{recent.length === 1 ? "" : "s"}
            </span>
          </div>
          <div className="mt-1 max-h-48 overflow-auto bg-[#0a0a0a] border border-white/5 rounded p-2 font-mono text-[11px] text-white/70">
            {recent.length === 0 ? (
              <div className="text-white/40">no messages yet — press a control</div>
            ) : (
              recent.map((m, i) => (
                <div key={i}>
                  <span className="text-white/40">{m.timestamp_ms}</span>{" "}
                  {m.data.map(hex).join(" ")}
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
