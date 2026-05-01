import { useEffect, useState } from "react";
import { AudioBar } from "./components/AudioBar";
import { Crossfader } from "./components/Crossfader";
import { Deck } from "./components/Deck";
import { Library } from "./components/Library";
import { MidiBar } from "./components/MidiBar";
import { ipc, onAppState } from "./ipc/tauri";
import type { AppSnapshot, DeckId } from "./types";

const EMPTY_SNAPSHOT: AppSnapshot = { decks: [], crossfader: 0.5 };

export default function App() {
  const [snap, setSnap] = useState<AppSnapshot>(EMPTY_SNAPSHOT);

  useEffect(() => {
    ipc.appSnapshot().then(setSnap).catch(() => {});
    const unlistenPromise = onAppState(setSnap);
    // Position polling so the time readout updates while a deck is playing.
    const tick = setInterval(() => {
      ipc.appSnapshot().then(setSnap).catch(() => {});
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
      console.error("deck_load failed", e);
    }
  };

  const deckA = snap.decks.find((s) => s.id === "A") ?? null;
  const deckB = snap.decks.find((s) => s.id === "B") ?? null;

  return (
    <div className="h-full flex flex-col bg-[#0a0a0a] text-white">
      <AudioBar />
      <MidiBar />
      <div className="flex gap-3 p-3" style={{ flexBasis: "30%" }}>
        <Deck deckId="A" snapshot={deckA} />
        <Deck deckId="B" snapshot={deckB} />
      </div>
      <Crossfader value={snap.crossfader} />
      <div className="flex-1 min-h-0">
        <Library onLoad={handleLoad} />
      </div>
    </div>
  );
}
