# PHASE-3 — M3 Suggestion Engine

Plan: `.claude/plans/let-s-focmulate-an-implementation-dazzling-porcupine.md` → "M3 — Suggestion engine" section. In-repo copy at `.claude/plans/M3-suggestion-engine.md`.

## Scope

Pure-function TypeScript suggestion engine implementing `requirements.md §6.3` verbatim, plus a deterministic seeded mock library and Vitest unit tests covering each criterion + threshold mapping + pagination + determinism + reason output.

REQ coverage:

- REQ-SUGGEST-01: seven criteria (BPM, key, genre, tags, artist, year, energy).
- REQ-SUGGEST-02: each criterion has on/off toggle; defaults to ON.
- REQ-SUGGEST-03: asymmetric BPM tolerance (defaults: slow 4%, speed 6%).
- REQ-SUGGEST-04: strictness slider; threshold linear from 0.3 (Loose) to 0.7 (Strict).
- REQ-SUGGEST-05: `suggestionsPerPage` setting; default 7.
- REQ-SUGGEST-06: each suggestion carries reasons; primary first.
- REQ-SUGGEST-09: deterministic for given anchor + config.
- REQ-SUGGEST-10: `bpmRange` exposed for "Range 119–131 BPM" UI chip.
- REQ-PAGE-01, REQ-PAGE-02, REQ-PAGE-04, REQ-PAGE-06: pagination shape supports the planned graph UI in M5.

## Out of scope (deferred)

- Frontend integration of any kind (M4+).
- Scanned-folder metadata enrichment with hash-stable random BPM/key (M4).
- Real BPM/key analysis (M10).
- Rust port of the engine (SP-1).
- Graph rendering, anchor-source switching, drag-drop (M5+).

## Files touched

| Path | Note |
|---|---|
| `src/engine/types.ts` | Track / SuggestionConfig / Suggestion / SuggestionReason types from §6.1 + DEFAULT_CONFIG. |
| `src/engine/camelot.ts` | Camelot wheel adjacency helper, ported from `prototypes/data.jsx::camelotAdjacent`. |
| `src/engine/mockLibrary.ts` | Seeded PRNG (mulberry32, seed 42), ~40 tracks Melodic-Techno-biased + anchor "Hidden Geometry". Ported from `prototypes/data.jsx`. |
| `src/engine/suggestionEngine.ts` | Pure `suggest()` + per-criterion scorers + threshold helper. Implements §6.3. |
| `src/engine/suggestionEngine.test.ts` | 44 Vitest tests. |
| `vitest.config.ts` | Minimal config (node env, `src/**/*.test.ts`). |
| `package.json` | New `test:run` script (CI-style single-pass). |
| `src/types.ts` | Re-exports engine types so frontend has one canonical `Track`. |

## Acceptance checks

All passing on 2026-05-01:

1. ☑ `npx tsc -b` clean (no TS errors).
2. ☑ `npx vitest run` — 44/44 tests pass in ~30 ms.
3. ☑ Camelot adjacency: 8A↔7A/9A/8B verified; 12A↔1A wraparound verified.
4. ☑ Each per-criterion scorer (BPM / Key / Genre / Tags / Artist / Year / Energy) tested at boundary cases (same, halfway, edge, beyond).
5. ☑ Strictness threshold: 0→0.3, 50→0.5, 100→0.7, clamps out-of-range.
6. ☑ Anchor never appears in its own results.
7. ☑ Default config returns ≥1 suggestion against the mock library.
8. ☑ Pagination: page 1 with `alreadyShown` excludes page-0 ids.
9. ☑ Disabling all criteria returns empty list.
10. ☑ Disabling BPM expands the candidate pool (Drum & Bass tracks become eligible).
11. ☑ `bpmRange` reflects asymmetric tolerance (124 BPM, 4%/6% → 119–131).
12. ☑ Determinism: two `suggest()` invocations with identical inputs return identical output.
13. ☑ Mock library reproducible from seed.
14. ☑ Reasons sorted with primary first; all listed reasons score ≥0.6.
15. ☑ Strict config returns ≤ Loose config's result count.

## Open questions / default resolutions

- **Mean over zero enabled criteria**: empty list (no candidates can be scored). Documented and tested.
- **`maxToleranceBpm`**: defined as `max(slowDown%, speedUp%) × anchor.bpm / 100`. Symmetric for scoring purposes; the asymmetric window only affects the hard filter.
- **Reason text format**: helper functions inline in `suggestionEngine.ts::formatReason`. Tested implicitly via reason inclusion tests.
- **Camelot encoding**: `1A..12A`, `1B..12B`. Wraparound at 12↔1 and parallel-relative adjacency.
- **PRNG seed**: 42 (matches prototype) for reproducible test fixtures.
- **`scoreBpm` when `maxTolPct = 0`**: returns 1 if exact match, else 0 (avoid divide-by-zero).
- **Sort tie-breaker**: stable, by track id ascending.

## Status

**Code complete 2026-05-01.** Engine + tests + mock library all green. No commit yet — awaiting user review of the test output and PHASE-3.md before pushing.
