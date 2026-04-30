// Mock track library + filter logic for the DJ graph wireframe.
// Camelot wheel adjacency: a key is "compatible" with itself, ±1 number same letter,
// and the parallel relative (same number, opposite letter).

const CAMELOT_KEYS = [
  "1A","2A","3A","4A","5A","6A","7A","8A","9A","10A","11A","12A",
  "1B","2B","3B","4B","5B","6B","7B","8B","9B","10B","11B","12B",
];

function camelotAdjacent(key) {
  if (!key) return [];
  const num = parseInt(key);
  const letter = key.slice(-1);
  const other = letter === "A" ? "B" : "A";
  const wrap = (n) => ((n - 1 + 12) % 12) + 1;
  return [
    `${num}${letter}`,
    `${wrap(num + 1)}${letter}`,
    `${wrap(num - 1)}${letter}`,
    `${num}${other}`,
  ];
}

const GENRES = ["Melodic Techno", "Deep House", "Progressive House", "Drum & Bass"];

const BPM_RANGE = {
  "Melodic Techno":   [118, 126],
  "Deep House":       [118, 124],
  "Progressive House":[120, 128],
  "Drum & Bass":      [168, 176],
};

const ARTIST_POOL = {
  "Melodic Techno":   ["Argy", "Kevin de Vries", "Mind Against", "Massano", "Anyma", "Adriatique", "Colyn", "Innellea"],
  "Deep House":       ["Ben Sterling", "Cinthie", "Mall Grab", "Folamour", "Honey Dijon", "Move D"],
  "Progressive House":["Yotto", "Cristoph", "Eli & Fur", "Tinlicker", "Nora En Pure", "Marsh"],
  "Drum & Bass":      ["Sub Focus", "Dimension", "Wilkinson", "Hybrid Minds", "Kanine", "Bou"],
};

const TAG_POOL = {
  "Melodic Techno":   ["rolling","hypnotic","peak time","driving","dark","emotional","cinematic","arpeggiated"],
  "Deep House":       ["groovy","jackin","warm","late night","raw","soulful","disco edge"],
  "Progressive House":["uplifting","sunset","euphoric","tribal","big room","atmospheric"],
  "Drum & Bass":      ["liquid","rolling","techy","jump up","minimal","vocal"],
};

const TITLE_PARTS_A = ["Hidden","Liminal","Glass","Iron","Velvet","Cinder","Halcyon","Mirror","Static","Phantom","Northern","Concrete","Salt","Echo","Brass","Slate","Distant","Black","Ancient","Slow"];
const TITLE_PARTS_B = ["Tides","Hours","Geometry","Pilgrim","Engine","Choir","Distance","Hours","Drift","Signal","Lights","Garden","Halo","Procession","Theory","Memory","Vow","Passage","Fever","Dial"];

// Deterministic PRNG so the library is stable across reloads
function mulberry32(a) {
  return function() {
    let t = a += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(42);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const pickN = (arr, n) => {
  const copy = [...arr];
  const out = [];
  for (let i = 0; i < n && copy.length; i++) {
    out.push(copy.splice(Math.floor(rand() * copy.length), 1)[0]);
  }
  return out;
};

function makeTrack(id, opts = {}) {
  const genre = opts.genre || pick(GENRES);
  const [lo, hi] = BPM_RANGE[genre];
  const bpm = opts.bpm ?? Math.round(lo + rand() * (hi - lo));
  const key = opts.key ?? pick(CAMELOT_KEYS);
  const artist = opts.artist ?? pick(ARTIST_POOL[genre]);
  const title = opts.title ?? `${pick(TITLE_PARTS_A)} ${pick(TITLE_PARTS_B)}`;
  const year = opts.year ?? 2018 + Math.floor(rand() * 8);
  const tags = opts.tags ?? pickN(TAG_POOL[genre], 1 + Math.floor(rand() * 3));
  const energy = opts.energy ?? 3 + Math.floor(rand() * 7);
  return { id, title, artist, bpm, key, genre, year, tags, energy };
}

// Anchor track from the spec
const ANCHOR_TRACK = makeTrack("t-anchor", {
  title: "Hidden Geometry",
  artist: "Mind Against",
  bpm: 124,
  key: "8A",
  genre: "Melodic Techno",
  year: 2024,
  tags: ["rolling","hypnotic","peak time"],
  energy: 7,
});

// Build the rest. Bias toward melodic techno so the default anchor has a rich pool.
const LIBRARY = [ANCHOR_TRACK];
for (let i = 0; i < 40; i++) {
  const genre = i < 18 ? "Melodic Techno" : pick(GENRES);
  // sprinkle in shared keys/tags/artists with the anchor for satisfying matches
  let opts = { genre };
  if (i < 6) opts.key = "8A";
  else if (i < 10) opts.key = pick(["7A","9A","8B"]);
  if (i % 7 === 0) opts.artist = "Mind Against";
  if (i % 5 === 0 && genre === "Melodic Techno") opts.tags = pickN(["rolling","hypnotic","peak time","driving"], 2);
  LIBRARY.push(makeTrack(`t-${i}`, opts));
}

// "Cued" deck B default
const DECK_B_DEFAULT = makeTrack("t-deckb", {
  title: "Slow Procession",
  artist: "Adriatique",
  bpm: 122,
  key: "9A",
  genre: "Melodic Techno",
  year: 2023,
  tags: ["emotional","cinematic"],
  energy: 6,
});
LIBRARY.push(DECK_B_DEFAULT);

// ─────────────────────────────────────────────────────────────────
// Suggestion engine (mocked but real filter logic)
// criteria: { bpm, key, genre, tags, artist, year, energy } booleans
// strictness: 0..1 (0 loose, 1 strict)
// bpmTolDown / bpmTolUp: percent
// ─────────────────────────────────────────────────────────────────
function scoreTrack(anchor, t, settings) {
  if (t.id === anchor.id) return null;
  const c = settings.criteria;
  const s = settings.strictness; // 0..1
  const reasons = [];
  let score = 0;
  let mandatoryFails = 0;

  // BPM
  if (c.bpm && anchor.bpm) {
    const lo = anchor.bpm * (1 - settings.bpmTolDown / 100);
    const hi = anchor.bpm * (1 + settings.bpmTolUp / 100);
    if (t.bpm >= lo && t.bpm <= hi) {
      const delta = Math.abs(t.bpm - anchor.bpm);
      score += 4 - Math.min(3, delta / 2);
      reasons.push({ kind: "bpm", text: delta === 0 ? "Same BPM" : `±${delta} BPM` });
    } else if (s > 0.5) {
      mandatoryFails++;
    }
  }

  // Key
  if (c.key && anchor.key && t.key) {
    const adj = camelotAdjacent(anchor.key);
    if (t.key === anchor.key) {
      score += 5; reasons.push({ kind: "key", text: `Shared key ${t.key}` });
    } else if (adj.includes(t.key)) {
      score += 3; reasons.push({ kind: "key", text: `Adjacent key ${t.key}` });
    } else if (s > 0.6) {
      mandatoryFails++;
    }
  }

  // Genre
  if (c.genre && anchor.genre === t.genre) {
    score += 2; reasons.push({ kind: "genre", text: "Genre match" });
  } else if (c.genre && s > 0.7) {
    mandatoryFails++;
  }

  // Tags
  if (c.tags && anchor.tags && t.tags) {
    const shared = t.tags.filter(tag => anchor.tags.includes(tag));
    if (shared.length) {
      score += shared.length * 1.5;
      reasons.push({ kind: "tag", text: `Tag: ${shared[0]}` });
    }
  }

  // Artist
  if (c.artist && anchor.artist === t.artist) {
    score += 4; reasons.push({ kind: "artist", text: "Same artist" });
  }

  // Year / era
  if (c.year && anchor.year) {
    const ydiff = Math.abs(t.year - anchor.year);
    if (ydiff <= 1) { score += 1.5; reasons.push({ kind: "year", text: "Same era" }); }
    else if (ydiff <= 3) { score += 0.5; }
  }

  // Energy
  if (c.energy && anchor.energy) {
    const ediff = Math.abs(t.energy - anchor.energy);
    if (ediff <= 1) { score += 2; reasons.push({ kind: "energy", text: "Energy match" }); }
    else if (ediff <= 2) { score += 1; }
    else if (s > 0.7) { mandatoryFails++; }
  }

  // Strictness gate: at high strictness, require multiple criteria to fire
  const minReasons = Math.ceil(s * 3); // 0,1,2,3
  if (reasons.length < minReasons) return null;
  if (mandatoryFails > 0 && s > 0.5) return null;
  if (score <= 0) return null;

  return { track: t, score, reasons };
}

function getSuggestions(anchor, settings) {
  if (!anchor) return [];
  const scored = LIBRARY
    .map(t => scoreTrack(anchor, t, settings))
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);
  return scored;
}

// expose to other Babel scripts
Object.assign(window, {
  LIBRARY, ANCHOR_TRACK, DECK_B_DEFAULT, CAMELOT_KEYS, GENRES,
  camelotAdjacent, getSuggestions, scoreTrack,
});
