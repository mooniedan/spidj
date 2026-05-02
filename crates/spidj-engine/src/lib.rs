//! spidj suggestion engine.
//!
//! Rust port of `apps/spidj/src/engine/` (M3 TypeScript implementation).
//! Implements `requirements.md §6.3` verbatim:
//!
//! 1. Hard BPM filter (when enabled).
//! 2. Per-criterion score in [0, 1].
//! 3. Total = mean of enabled-criterion scores.
//! 4. Strictness threshold linear: 0 → 0.3, 100 → 0.7.
//! 5. Reasons = criteria scoring ≥ 0.6, sorted primary first.
//! 6. Sort desc; paginate by `suggestions_per_page`.
//!
//! Behavior must stay in lockstep with the TS implementation —
//! `apps/spidj/src/engine/suggestionEngine.test.ts` and
//! `crates/spidj-engine/tests/engine.rs` test the same contract.

pub mod camelot;
pub mod mock_library;
pub mod scoring;
pub mod types;

pub use camelot::{camelot_adjacent, camelot_is_adjacent, CAMELOT_KEYS};
pub use scoring::{
    resolved_bpm_range, score_artist, score_bpm, score_energy, score_genre, score_key,
    score_tags, score_year, strictness_threshold, suggest, BpmRange, SuggestOptions,
    SuggestResult,
};
pub use types::{
    CriterionKey, EnabledCriteria, Suggestion, SuggestionConfig, SuggestionReason, Track,
    DEFAULT_CONFIG,
};
