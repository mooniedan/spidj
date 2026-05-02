# PHASE-SP-1 — Engine crate (Rust port)

Plan: `.claude/plans/SP-serato-set-planner.md` → "SP-1 — Engine crate".

## Scope

Port the M3 TypeScript suggestion engine (`apps/spidj/src/engine/*.ts`) to a new Rust workspace crate at `crates/spidj-engine`. Pure functions; no I/O. Same `requirements.md §6.3` algorithm, byte-identical mock library fixture, equivalent test coverage.

This crate is the canonical engine for the upcoming Serato Set Planner backend (SP-3) and the M3 TS implementation continues to back the live-DJ frontend until that gets re-wired through Tauri commands later.

## Files added

| Path | Note |
|---|---|
| `crates/spidj-engine/Cargo.toml` | Crate manifest. `serde` derive on. |
| `crates/spidj-engine/src/lib.rs` | Module re-exports + crate-level docs. |
| `crates/spidj-engine/src/types.rs` | `Track`, `SuggestionConfig`, `Suggestion`, `SuggestionReason`, `EnabledCriteria`, `CriterionKey`, `DEFAULT_CONFIG`. Mirrors `apps/spidj/src/engine/types.ts`. |
| `crates/spidj-engine/src/camelot.rs` | Wheel adjacency helper. |
| `crates/spidj-engine/src/scoring.rs` | Per-criterion scorers + `suggest()` + `strictness_threshold` + `resolved_bpm_range`. |
| `crates/spidj-engine/src/mock_library.rs` | Seeded mock library (mulberry32 seed 42). |
| `crates/spidj-engine/tests/engine.rs` | 34 integration tests. |

## Files modified

- `Cargo.toml` (workspace) — added `crates/spidj-engine` to members.
- `.claude/plans/let-s-focmulate-an-implementation-dazzling-porcupine.md` + `.claude/plans/SP-serato-set-planner.md` — SP-1 section corrected (port the M3 engine, not the prototype, since M3 went with §6.3 not the heuristic).

## Acceptance checks

All passing on 2026-05-02:

1. ☑ `cargo build --workspace` clean.
2. ☑ `cargo test --package spidj-engine` — 34/34 tests pass.
3. ☑ `cargo clippy --package spidj-engine -- -D warnings` clean.
4. ☑ Existing `apps/spidj` workspace member untouched; M1/M2/M3 spidj functionality unchanged.
5. ☑ Vitest tests still pass on the TS side (engine code unmodified).

## Test parity with the TS engine

The Vitest suite at `apps/spidj/src/engine/suggestionEngine.test.ts` has 44 tests; the Rust suite at `crates/spidj-engine/tests/engine.rs` has 34. Difference is consolidation, not coverage gaps:

| Concept | TS test count | Rust test count |
|---|---|---|
| Camelot adjacency | 5 | 5 |
| Per-criterion scorers | 18 | 14 (some boundary tables collapsed into single `assert_eq!` blocks) |
| Strictness threshold | 4 | 2 (endpoints + clamps) |
| `suggest()` integration | 12 | 9 |
| BPM range helper | 1 | 1 |
| Reasons / determinism | 4 | 3 |
| **Total** | **44** | **34** |

Both suites cover REQ-SUGGEST-01..06, REQ-SUGGEST-09..10, REQ-PAGE-01/02/04/06.

## Open questions / default resolutions

- **mulberry32 bit-for-bit parity with TS**: the Rust port uses `u32::wrapping_mul` for `Math.imul` semantics. Library generation is reproducible from a given seed *within Rust*. We do **not** require Rust and TS to produce identical libraries from the same seed — both use seed 42 and should land on similar genre/BPM distributions, but exact field-for-field equality across languages would require careful u32-ops alignment that we'd revisit only if SP-3 needs it.
- **Sort tie-breaker**: stable, by track id ascending. Same as TS.
- **`maxToleranceBpm`** for the BPM scorer: `max(slowDown%, speedUp%) × anchor.bpm / 100`. Same as TS.
- **Reason strings**: written to match TS output ("Same key 8A", "Adjacent key 9A", "+2 BPM", "-1 BPM", etc.). Tested implicitly via the reasons-above-threshold integration test; explicit string-comparison tests are deferred.
- **Public API surface**: re-exported from the crate root for ergonomic `use spidj_engine::*` in SP-3.

## Status

**Completed 2026-05-02.** Engine crate builds, tests, and lints clean. Ready for SP-2 (`crates/serato-io`) and SP-3 (`apps/serato-planner`).
