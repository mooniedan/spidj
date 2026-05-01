import { useEffect, useState } from "react";
import { AudioBar } from "./components/AudioBar";
import { Deck } from "./components/Deck";
import { Library } from "./components/Library";
import { MidiBar } from "./components/MidiBar";
import { ipc, onDeckState } from "./ipc/tauri";
import type { DeckId, DeckSnapshot } from "./types";

export default function App() {
  const [snapshots, setSnapshots] = useState<DeckSnapshot[]>([]);

  useEffect(() => {
    ipc.deckSnapshot().then(setSnapshots).catch(() => {});
    const unlistenPromise = onDeckState(setSnapshots);
    // Position polling so the time readout updates while a deck is playing.
    const tick = setInterval(() => {
      ipc.deckSnapshot().then(setSnapshots).catch(() => {});
    }, 250);
    return () => {
      clearInterval(tick);
      unlistenPromise.then((u) => u());
    };
  }, []);

  const handleLoad = async (deckId: DeckId, path: string) => {
    try {
      await ipc.deckLoad(deckId, path);
    } catch (e) {
      // M1: surface load errors via console; UI toast is M2+.
      console.error("deck_load failed", e);
    }
  };

  const deckA = snapshots.find((s) => s.id === "A") ?? null;
  const deckB = snapshots.find((s) => s.id === "B") ?? null;

  return (
    <div className="h-full flex flex-col bg-[#0a0a0a] text-white">
      <AudioBar />
      <MidiBar />
      <div className="flex gap-3 p-3" style={{ flexBasis: "30%" }}>
        <Deck deckId="A" snapshot={deckA} />
        <Deck deckId="B" snapshot={deckB} />
      </div>
      <div className="flex-1 min-h-0">
        <Library onLoad={handleLoad} />
      </div>
    </div>
  );
}
