// Seeded mock library. Used as the test fixture for the suggestion engine
// and as the dev fixture for the M4 graph UI. Ported from
// prototypes/data.jsx so the data is deterministic and matches what the
// wireframes were demoing against.

import { CAMELOT_KEYS } from "./camelot";
import type { Track } from "./types";

const GENRES = [
  "Melodic Techno",
  "Deep House",
  "Progressive House",
  "Drum & Bass",
] as const;
type Genre = (typeof GENRES)[number];

const BPM_RANGE: Record<Genre, [number, number]> = {
  "Melodic Techno": [118, 126],
  "Deep House": [118, 124],
  "Progressive House": [120, 128],
  "Drum & Bass": [168, 176],
};

const ARTIST_POOL: Record<Genre, string[]> = {
  "Melodic Techno": [
    "Argy", "Kevin de Vries", "Mind Against", "Massano", "Anyma",
    "Adriatique", "Colyn", "Innellea",
  ],
  "Deep House": [
    "Ben Sterling", "Cinthie", "Mall Grab", "Folamour", "Honey Dijon", "Move D",
  ],
  "Progressive House": [
    "Yotto", "Cristoph", "Eli & Fur", "Tinlicker", "Nora En Pure", "Marsh",
  ],
  "Drum & Bass": [
    "Sub Focus", "Dimension", "Wilkinson", "Hybrid Minds", "Kanine", "Bou",
  ],
};

const TAG_POOL: Record<Genre, string[]> = {
  "Melodic Techno": [
    "rolling", "hypnotic", "peak time", "driving",
    "dark", "emotional", "cinematic", "arpeggiated",
  ],
  "Deep House": [
    "groovy", "jackin", "warm", "late night", "raw", "soulful", "disco edge",
  ],
  "Progressive House": [
    "uplifting", "sunset", "euphoric", "tribal", "big room", "atmospheric",
  ],
  "Drum & Bass": [
    "liquid", "rolling", "techy", "jump up", "minimal", "vocal",
  ],
};

const TITLE_PARTS_A = [
  "Hidden", "Liminal", "Glass", "Iron", "Velvet", "Cinder", "Halcyon",
  "Mirror", "Static", "Phantom", "Northern", "Concrete", "Salt", "Echo",
  "Brass", "Slate", "Distant", "Black", "Ancient", "Slow",
];
const TITLE_PARTS_B = [
  "Tides", "Hours", "Geometry", "Pilgrim", "Engine", "Choir", "Distance",
  "Hours", "Drift", "Signal", "Lights", "Garden", "Halo", "Procession",
  "Theory", "Memory", "Vow", "Passage", "Fever", "Dial",
];

const ALBUM_ART_PALETTE = [
  "#1a1d22", "#22262c", "#c8302e", "#a02220", "#3b3f47",
  "#1f2126", "#2c1f1f", "#1c2a2e",
];

/** Deterministic PRNG. Seed 42 matches the prototype. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface MakeTrackOpts {
  genre?: Genre;
  bpm?: number;
  key?: string;
  artist?: string;
  title?: string;
  year?: number;
  tags?: string[];
  energy?: number;
  albumArtColor?: string;
}

function makeFactory(rand: () => number) {
  const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)];
  const pickN = <T,>(arr: readonly T[], n: number): T[] => {
    const copy = [...arr];
    const out: T[] = [];
    for (let i = 0; i < n && copy.length > 0; i++) {
      out.push(copy.splice(Math.floor(rand() * copy.length), 1)[0]);
    }
    return out;
  };

  const makeTrack = (id: string, opts: MakeTrackOpts = {}): Track => {
    const genre = opts.genre ?? pick(GENRES);
    const [lo, hi] = BPM_RANGE[genre];
    const bpm = opts.bpm ?? Math.round(lo + rand() * (hi - lo));
    const key = opts.key ?? pick(CAMELOT_KEYS);
    const artist = opts.artist ?? pick(ARTIST_POOL[genre]);
    const title = opts.title ?? `${pick(TITLE_PARTS_A)} ${pick(TITLE_PARTS_B)}`;
    const year = opts.year ?? 2018 + Math.floor(rand() * 8);
    const tags = opts.tags ?? pickN(TAG_POOL[genre], 1 + Math.floor(rand() * 3));
    const energy = opts.energy ?? 3 + Math.floor(rand() * 7);
    const albumArtColor = opts.albumArtColor ?? pick(ALBUM_ART_PALETTE);
    return {
      id,
      title,
      artist,
      bpm,
      key,
      genre,
      year,
      tags,
      energy,
      albumArtColor,
    };
  };

  return { pick, pickN, makeTrack };
}

/** Build the canonical mock library. Deterministic for a given seed. */
export function buildMockLibrary(seed = 42): {
  library: Track[];
  anchor: Track;
  deckBDefault: Track;
} {
  const rand = mulberry32(seed);
  const { pick, pickN, makeTrack } = makeFactory(rand);

  const anchor = makeTrack("t-anchor", {
    title: "Hidden Geometry",
    artist: "Mind Against",
    bpm: 124,
    key: "8A",
    genre: "Melodic Techno",
    year: 2024,
    tags: ["rolling", "hypnotic", "peak time"],
    energy: 7,
  });

  const library: Track[] = [anchor];
  for (let i = 0; i < 40; i++) {
    const genre: Genre = i < 18 ? "Melodic Techno" : pick(GENRES);
    const opts: MakeTrackOpts = { genre };
    if (i < 6) opts.key = "8A";
    else if (i < 10) opts.key = pick(["7A", "9A", "8B"]);
    if (i % 7 === 0) opts.artist = "Mind Against";
    if (i % 5 === 0 && genre === "Melodic Techno") {
      opts.tags = pickN(["rolling", "hypnotic", "peak time", "driving"], 2);
    }
    library.push(makeTrack(`t-${i}`, opts));
  }

  const deckBDefault = makeTrack("t-deckb", {
    title: "Slow Procession",
    artist: "Adriatique",
    bpm: 122,
    key: "9A",
    genre: "Melodic Techno",
    year: 2023,
    tags: ["emotional", "cinematic"],
    energy: 6,
  });
  library.push(deckBDefault);

  return { library, anchor, deckBDefault };
}

/** Cached default library so callers don't rebuild. */
const DEFAULT = buildMockLibrary(42);
export const MOCK_LIBRARY: readonly Track[] = DEFAULT.library;
export const MOCK_ANCHOR: Track = DEFAULT.anchor;
export const MOCK_DECK_B: Track = DEFAULT.deckBDefault;
