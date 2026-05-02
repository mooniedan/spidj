### M3 — Suggestion engine (DETAILED — approved scope)

**Goal:** ship a pure-function TypeScript suggestion engine that implements `requirements.md §6.3` to the letter, with Vitest unit tests covering each criterion + strictness threshold + pagination. No UI yet. M4 will wire it into the graph; SP-1 will port it to Rust for the side project.

**Out of scope for M3** (deferred): frontend integration of any kind, scanned-folder metadata enrichment (hash-stable random BPM/key for real files), real BPM/key analysis (M10), Rust port (SP-1), graph rendering (M5).

#### Why TypeScript here

The user picked "TS in `src/engine/` now; port to Rust later in SP-1." Reasoning: M4's graph UI iterates fastest when the engine runs in-process in the renderer, no Tauri IPC roundtrip per render. The duplication when SP-1 ports to Rust is small (~200 lines) and gives us two test suites pinning the same spec.

#### Algorithm contract

The spec (`requirements.md §6.3`) is canonical. The prototype `prototypes/data.jsx` implements an older heuristic (point-based with mandatory-fail gates); **we don't port it**. We implement the spec.

**Step 1 — Hard BPM filter** (when BPM criterion enabled): reject if `candidate.bpm` outside `[anchor.bpm × (1 - slowDown%), anchor.bpm × (1 + speedUp%)]`.

**Step 2 — Per-criterion scoring**, each returning [0, 1]:

| Criterion | Formula |
|---|---|
| BPM | `1 - abs(delta) / maxTol` where `maxTol = max(slowDown%, speedUp%) × anchor.bpm / 100` |
| Key | 1.0 if same Camelot key; 0.7 if adjacent on the wheel; 0 otherwise |
| Genre | 1.0 if same; 0 otherwise |
| Tags | Jaccard: `intersection.size / union.size` |
| Artist | 1.0 if same; 0 otherwise |
| Year | `1 - min(abs(diff) / 10, 1)` |
| Energy | `1 - abs(diff) / 9` |

**Step 3 — Aggregation**: total score = mean of enabled-criterion scores.

**Step 4 — Strictness threshold**: linear from `0.3` at strictness=0 (Loose) to `0.7` at strictness=100 (Strict). `threshold = 0.3 + 0.4 × (strictness/100)`.

**Step 5 — Reason inclusion**: for each candidate that survives the threshold, list the criteria that scored `≥ 0.6` as reasons. Highest-scoring criterion is primary.

**Step 6 — Pagination**: sort by score descending; split into pages of `suggestionsPerPage` (default 7).

REQ-IDs honored: REQ-SUGGEST-01..06, REQ-SUGGEST-09, REQ-PAGE-01, REQ-PAGE-02, REQ-PAGE-04, REQ-PAGE-06.

#### File / module layout

```
src/engine/
├── types.ts                   Track, SuggestionConfig, Suggestion,
│                              SuggestionReason — verbatim from REQ §6.1
├── camelot.ts                 Camelot wheel adjacency helper
│                              (port logic from prototypes/data.jsx::camelotAdjacent)
├── suggestionEngine.ts        Pure `suggest()` + per-criterion scorers
├── suggestionEngine.test.ts   Vitest unit tests (per checklist below)
└── mockLibrary.ts             Seeded PRNG library, ~40 tracks
                               (port from prototypes/data.jsx)
vitest.config.ts               Minimal Vitest config (node env)
phases/PHASE-3.md              Acceptance checklist
.claude/plans/M3-suggestion-engine.md
                               Copy of this section for in-repo persistence
```

`src/types.ts` will re-export the engine types so frontend code uses one source.

#### Public API of `suggestionEngine.ts`

```typescript
export function suggest(
  anchor: Track,
  library: Track[],
  config: SuggestionConfig,
  options?: {
    page?: number;             // 0-indexed; default 0
    alreadyShown?: ReadonlySet<string>;  // track ids excluded from this page
  },
): {
  suggestions: Suggestion[];
  totalPages: number;
  bpmRange: { min: number; max: number };  // for REQ-SUGGEST-10 "Range 119–131 BPM"
};

// Per-criterion scorers exposed for testing.
export function scoreBpm(anchor: Track, c: Track, config: SuggestionConfig): number;
export function scoreKey(anchor: Track, c: Track): number;
export function scoreGenre(anchor: Track, c: Track): number;
export function scoreTags(anchor: Track, c: Track): number;
export function scoreArtist(anchor: Track, c: Track): number;
export function scoreYear(anchor: Track, c: Track): number;
export function scoreEnergy(anchor: Track, c: Track): number;

// Threshold helper.
export function strictnessThreshold(strictness: number): number;
```

#### Test plan (`suggestionEngine.test.ts`)

Each scorer gets a small describe block; integration tests cover `suggest()` end-to-end against the seeded mock library.

1. **scoreBpm**: same → 1.0; halfway through tolerance → ~0.5; at the edge → ~0.0.
2. **scoreKey**: same → 1.0; adjacent (8A↔9A, 8A↔7A, 8A↔8B) → 0.7; non-adjacent → 0.0.
3. **scoreGenre**: equal → 1; differ → 0.
4. **scoreTags**: empty/empty → 0 (avoid divide-by-zero); full overlap → 1; partial → matches Jaccard math.
5. **scoreArtist**: same → 1; differ → 0.
6. **scoreYear**: same → 1; 5y → 0.5; 10y+ → 0.
7. **scoreEnergy**: same → 1; 9 diff → 0.
8. **strictnessThreshold**: 0→0.3, 50→0.5, 100→0.7.
9. **suggest() integration** using the seeded mock library (PRNG seed 42, anchor "Hidden Geometry"):
   - Default config returns ≥1 suggestion; all sorted by score desc.
   - All returned suggestions have score ≥ threshold (verified by re-scoring).
   - Anchor never appears in its own results.
   - BPM disabled → result count grows.
   - All criteria disabled → empty list (mean of empty set is undefined; we return []).
   - Pagination: page 1 returns next N items; `alreadyShown` excludes them.
   - `bpmRange` reflects the resolved tolerance window.
10. **Reasons**: primary reason is the highest-scoring criterion; only criteria scoring ≥ 0.6 appear; reason text is human-readable (e.g. `"+2 BPM"`, `"Shared key 8A"`, `"Same artist Mind Against"`).
11. **Determinism**: running `suggest()` twice against the same mock library + config returns identical output (REQ-SUGGEST-09).

#### Mock library (`mockLibrary.ts`)

Port `prototypes/data.jsx`'s seeded generator: `mulberry32(42)` PRNG, ~40 tracks biased toward Melodic Techno (120–126 BPM, keys 6A–9A) plus a tail of Deep House / Progressive House / Drum & Bass for variety. Anchor track "Hidden Geometry" by Mind Against (124 BPM, 8A, Melodic Techno) is hardcoded as part of the library.

The mock is the test fixture and the M4 dev fixture. Replacing it with real-folder-derived data (with hash-stable random BPM/key) is M4 work.

#### Wiring + tooling

- Add a top-level `vitest.config.ts` (defaults are fine; explicitly set `environment: 'node'` since we don't touch the DOM).
- `package.json` `"test"` already calls `vitest`. Add `"test:run"` for CI-style single-pass.
- Re-export engine types from `src/types.ts` so future frontend code sees one canonical `Track` type.

#### Open questions / default resolutions

- **Mean over zero enabled criteria**: return empty results (no possible suggestion). Document in test 9.
- **`maxToleranceBpm`**: defined as `max(slowDown%, speedUp%) × anchor.bpm / 100`. So at the far edge of the asymmetric tolerance window, BPM scores 0; the symmetric tolerance approach matches the spec's intent.
- **Reason text format**: helpers like `formatBpmReason`, `formatKeyReason`, etc. live next to scorers. Tested for the canonical cases.
- **Camelot wheel encoding**: 1A..12A, 1B..12B. Adjacency: same number ±1 wraparound (so 12A ↔ 1A), and the parallel relative (8A ↔ 8B). Same as prototype.
- **`albumArtColor` / `duration?`**: optional Track fields per §6.1; the engine ignores both. Mock library still emits them so types match.
- **PRNG seed**: 42 (matches prototype) for stable test fixtures.

#### Verification

1. `npx vitest run` — all tests pass.
2. `npx tsc -b` — clean (existing build still green; new files type-check).
3. Sanity check by hand: import `suggest` in a `node --eval` style script or a tiny one-shot test, anchor = "Hidden Geometry" with default config, eyeball that the top suggestions look "musically reasonable" — same/adjacent key, BPM within 4-6%, mostly Melodic Techno.
4. `phases/PHASE-3.md` checklist ticked.
5. **No commit until the user reviews PHASE-3.md and the test output.**

