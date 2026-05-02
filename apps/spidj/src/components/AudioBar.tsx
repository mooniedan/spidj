import { useEffect, useState } from "react";
import { ipc } from "../ipc/tauri";

export function AudioBar() {
  const [devices, setDevices] = useState<string[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<string>("(default)");

  useEffect(() => {
    ipc.audioListOutputs().then((list) => {
      setDevices(list);
      if (list[0]) setSelected(list[0]);
    });
  }, []);

  const apply = async () => {
    setBusy(true);
    setError(null);
    try {
      const name = selected.startsWith("(default) ")
        ? selected.slice("(default) ".length)
        : selected;
      await ipc.audioSetOutput(name);
      setActive(selected);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-[#1a1d22] border-b border-white/5 px-4 py-2">
      <div className="flex items-center gap-3 text-sm">
        <span className="text-white/60">Audio out</span>
        <select
          className="bg-[#22262c] text-white text-sm px-2 py-1 rounded outline-none flex-1 min-w-0"
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
        >
          {devices.length === 0 ? (
            <option value="">(no output devices)</option>
          ) : (
            devices.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))
          )}
        </select>
        <button
          className="px-3 py-1 rounded bg-[#c8302e] hover:bg-[#a02220] text-white text-sm disabled:opacity-50"
          onClick={apply}
          disabled={busy || !selected}
        >
          {busy ? "Switching…" : "Apply"}
        </button>
        <span className="text-xs text-white/50 truncate max-w-[20rem]">
          active: {active}
        </span>
      </div>
      {error && <div className="text-xs text-[#c8302e] mt-1">{error}</div>}
    </div>
  );
}
