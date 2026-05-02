//! Per-criterion scorers + `suggest()`.
//! Mirrors `apps/spidj/src/engine/suggestionEngine.ts`.

use std::collections::HashSet;

use serde::{Deserialize, Serialize};

use crate::camelot::camelot_is_adjacent;
use crate::types::{
    CriterionKey, Suggestion, SuggestionConfig, SuggestionReason, Track,
};

const REASON_THRESHOLD: f32 = 0.6;

#[derive(Debug, Clone, Default)]
pub struct SuggestOptions {
    /// 0-indexed page; default 0.
    pub page: usize,
    /// Track ids to exclude (already shown on previous pages for this anchor).
    pub already_shown: HashSet<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SuggestResult {
    pub suggestions: Vec<Suggestion>,
    pub total_pages: usize,
    pub bpm_range: BpmRange,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BpmRange {
    pub min: i32,
    pub max: i32,
}

// ── Public API ──────────────────────────────────────────────────────────

pub fn suggest(
    anchor: &Track,
    library: &[Track],
    config: &SuggestionConfig,
    options: SuggestOptions,
) -> SuggestResult {
    let bpm_range = resolved_bpm_range(anchor, config);
    let threshold = strictness_threshold(config.strictness);

    let mut survivors: Vec<(Track, ScoreResult)> = Vec::new();
    for candidate in library {
        if candidate.id == anchor.id {
            continue;
        }
        if config.enabled_criteria.bpm && !within_bpm_range(candidate.bpm as i32, bpm_range)
        {
            continue;
        }
        let score = score_candidate(anchor, candidate, config);
        if score.total >= threshold {
            survivors.push((candidate.clone(), score));
        }
    }

    survivors.sort_by(|a, b| {
        match b
            .1
            .total
            .partial_cmp(&a.1.total)
            .unwrap_or(std::cmp::Ordering::Equal)
        {
            std::cmp::Ordering::Equal => a.0.id.cmp(&b.0.id),
            other => other,
        }
    });

    let remaining: Vec<&(Track, ScoreResult)> = survivors
        .iter()
        .filter(|(t, _)| !options.already_shown.contains(&t.id))
        .collect();

    let per_page = config.suggestions_per_page.max(1);
    let total_pages = remaining.len().div_ceil(per_page).max(1);

    let start = options.page.saturating_mul(per_page);
    let slice: Vec<&(Track, ScoreResult)> = remaining
        .into_iter()
        .skip(start)
        .take(per_page)
        .collect();

    let suggestions: Vec<Suggestion> = slice
        .into_iter()
        .map(|(track, score)| Suggestion {
            track: track.clone(),
            reasons: score.reasons.clone(),
        })
        .collect();

    SuggestResult {
        suggestions,
        total_pages,
        bpm_range,
    }
}

// ── Per-criterion scoring (each returns [0, 1]) ────────────────────────

pub fn score_bpm(anchor: &Track, c: &Track, config: &SuggestionConfig) -> f32 {
    let max_tol_pct = config
        .bpm_slow_down_percent
        .max(config.bpm_speed_up_percent);
    if max_tol_pct <= 0.0 || anchor.bpm <= 0.0 {
        return if (c.bpm - anchor.bpm).abs() < f32::EPSILON {
            1.0
        } else {
            0.0
        };
    }
    let max_tol = (max_tol_pct / 100.0) * anchor.bpm;
    let delta = (c.bpm - anchor.bpm).abs();
    clamp01(1.0 - delta / max_tol)
}

pub fn score_key(anchor: &Track, c: &Track) -> f32 {
    match (anchor.key.as_deref(), c.key.as_deref()) {
        (Some(a), Some(b)) if a == b => 1.0,
        (Some(a), Some(b)) if camelot_is_adjacent(Some(a), Some(b)) => 0.7,
        _ => 0.0,
    }
}

pub fn score_genre(anchor: &Track, c: &Track) -> f32 {
    if anchor.genre == c.genre { 1.0 } else { 0.0 }
}

pub fn score_tags(anchor: &Track, c: &Track) -> f32 {
    if anchor.tags.is_empty() && c.tags.is_empty() {
        return 0.0;
    }
    let a: HashSet<&String> = anchor.tags.iter().collect();
    let b: HashSet<&String> = c.tags.iter().collect();
    let intersection = a.intersection(&b).count();
    let union = a.union(&b).count();
    if union == 0 {
        0.0
    } else {
        intersection as f32 / union as f32
    }
}

pub fn score_artist(anchor: &Track, c: &Track) -> f32 {
    if anchor.artist == c.artist { 1.0 } else { 0.0 }
}

pub fn score_year(anchor: &Track, c: &Track) -> f32 {
    let diff = (c.year - anchor.year).abs() as f32 / 10.0;
    clamp01(1.0 - diff.min(1.0))
}

pub fn score_energy(anchor: &Track, c: &Track) -> f32 {
    let diff = (c.energy as i32 - anchor.energy as i32).abs() as f32 / 9.0;
    clamp01(1.0 - diff)
}

// ── Strictness threshold ───────────────────────────────────────────────

/// Map strictness (0..100) to the score threshold (0.3..0.7) per §6.3.
pub fn strictness_threshold(strictness: f32) -> f32 {
    let clamped = strictness.clamp(0.0, 100.0);
    0.3 + 0.4 * (clamped / 100.0)
}

// ── BPM tolerance helpers ──────────────────────────────────────────────

pub fn resolved_bpm_range(anchor: &Track, config: &SuggestionConfig) -> BpmRange {
    let min = (anchor.bpm * (1.0 - config.bpm_slow_down_percent / 100.0)).round() as i32;
    let max = (anchor.bpm * (1.0 + config.bpm_speed_up_percent / 100.0)).round() as i32;
    BpmRange { min, max }
}

fn within_bpm_range(bpm: i32, range: BpmRange) -> bool {
    bpm >= range.min && bpm <= range.max
}

// ── Internals ──────────────────────────────────────────────────────────

#[derive(Debug, Clone)]
struct ScoreResult {
    total: f32,
    reasons: Vec<SuggestionReason>,
}

fn score_candidate(
    anchor: &Track,
    c: &Track,
    config: &SuggestionConfig,
) -> ScoreResult {
    let mut per_criterion: Vec<(CriterionKey, f32)> = Vec::new();

    for k in CriterionKey::ALL {
        if !config.enabled_criteria.is_enabled(k) {
            continue;
        }
        let score = match k {
            CriterionKey::Bpm => score_bpm(anchor, c, config),
            CriterionKey::Key => score_key(anchor, c),
            CriterionKey::Genre => score_genre(anchor, c),
            CriterionKey::Tags => score_tags(anchor, c),
            CriterionKey::Artist => score_artist(anchor, c),
            CriterionKey::Year => score_year(anchor, c),
            CriterionKey::Energy => score_energy(anchor, c),
        };
        per_criterion.push((k, score));
    }

    if per_criterion.is_empty() {
        return ScoreResult {
            total: 0.0,
            reasons: Vec::new(),
        };
    }

    let total: f32 =
        per_criterion.iter().map(|(_, v)| v).sum::<f32>() / per_criterion.len() as f32;

    let mut reasons: Vec<SuggestionReason> = per_criterion
        .iter()
        .filter(|(_, v)| *v >= REASON_THRESHOLD)
        .map(|(k, v)| SuggestionReason {
            r#type: *k,
            detail: format_reason(*k, anchor, c),
            strength: *v,
        })
        .collect();
    // Primary first (highest strength); stable order preserves criterion-list
    // order for ties.
    reasons.sort_by(|a, b| {
        b.strength
            .partial_cmp(&a.strength)
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    ScoreResult { total, reasons }
}

fn format_reason(k: CriterionKey, anchor: &Track, c: &Track) -> String {
    match k {
        CriterionKey::Bpm => {
            let delta = (c.bpm - anchor.bpm).round() as i32;
            if delta == 0 {
                "Same BPM".into()
            } else if delta > 0 {
                format!("+{} BPM", delta)
            } else {
                format!("{} BPM", delta)
            }
        }
        CriterionKey::Key => match (anchor.key.as_deref(), c.key.as_deref()) {
            (Some(a), Some(b)) if a == b => format!("Same key {}", b),
            (_, Some(b)) => format!("Adjacent key {}", b),
            _ => "Adjacent key ?".into(),
        },
        CriterionKey::Genre => format!("Genre {}", c.genre),
        CriterionKey::Tags => {
            let a: HashSet<&String> = anchor.tags.iter().collect();
            let shared: Vec<&String> = c.tags.iter().filter(|t| a.contains(t)).collect();
            if shared.is_empty() {
                "Shared tags".into()
            } else {
                format!(
                    "Shared tags: {}",
                    shared
                        .iter()
                        .take(2)
                        .map(|s| s.as_str())
                        .collect::<Vec<_>>()
                        .join(", ")
                )
            }
        }
        CriterionKey::Artist => format!("Same artist {}", c.artist),
        CriterionKey::Year => {
            let diff = (c.year - anchor.year).abs();
            if diff == 0 {
                format!("Same year {}", c.year)
            } else if diff == 1 {
                "Same era".into()
            } else {
                format!("{}y apart", diff)
            }
        }
        CriterionKey::Energy => {
            let diff = (c.energy as i32 - anchor.energy as i32).abs();
            if diff == 0 {
                "Same energy".into()
            } else {
                "Similar energy".into()
            }
        }
    }
}

fn clamp01(n: f32) -> f32 {
    if !n.is_finite() {
        return 0.0;
    }
    n.clamp(0.0, 1.0)
}
