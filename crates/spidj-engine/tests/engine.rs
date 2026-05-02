//! Integration tests for spidj-engine. Mirror the test plan in
//! apps/spidj/src/engine/suggestionEngine.test.ts so the two engines stay
//! in lockstep with the spec.

use std::collections::HashSet;

use spidj_engine::{
    camelot_adjacent, camelot_is_adjacent, mock_library::build_mock_library,
    resolved_bpm_range, score_artist, score_bpm, score_energy, score_genre, score_key,
    score_tags, score_year, strictness_threshold, suggest, EnabledCriteria,
    SuggestOptions, SuggestionConfig, Track, DEFAULT_CONFIG,
};

fn cfg() -> SuggestionConfig {
    DEFAULT_CONFIG.clone()
}

fn cfg_with(mutate: impl FnOnce(&mut SuggestionConfig)) -> SuggestionConfig {
    let mut c = DEFAULT_CONFIG.clone();
    mutate(&mut c);
    c
}

fn track(overrides: impl FnOnce(&mut Track)) -> Track {
    let mut t = Track {
        id: "test".into(),
        title: "Test".into(),
        artist: "X".into(),
        bpm: 124.0,
        key: Some("8A".into()),
        genre: "Melodic Techno".into(),
        tags: Vec::new(),
        year: 2024,
        energy: 7,
        album_art_color: "#000".into(),
        duration: None,
    };
    overrides(&mut t);
    t
}

fn approx(actual: f32, expected: f32, eps: f32) -> bool {
    (actual - expected).abs() < eps
}

// ── Camelot ────────────────────────────────────────────────────────────

#[test]
fn camelot_8a_returns_8a_9a_7a_8b() {
    let mut keys = camelot_adjacent(Some("8A"));
    keys.sort();
    assert_eq!(keys, vec!["7A", "8A", "8B", "9A"]);
}

#[test]
fn camelot_12a_wraps_to_1a() {
    let keys = camelot_adjacent(Some("12A"));
    assert!(keys.contains(&"1A".to_string()));
    assert!(keys.contains(&"11A".to_string()));
    assert!(keys.contains(&"12B".to_string()));
}

#[test]
fn camelot_1b_wraps_to_12b() {
    let keys = camelot_adjacent(Some("1B"));
    assert!(keys.contains(&"12B".to_string()));
    assert!(keys.contains(&"2B".to_string()));
    assert!(keys.contains(&"1A".to_string()));
}

#[test]
fn camelot_invalid_returns_empty() {
    assert!(camelot_adjacent(None).is_empty());
    assert!(camelot_adjacent(Some("")).is_empty());
    assert!(camelot_adjacent(Some("13A")).is_empty());
    assert!(camelot_adjacent(Some("garbage")).is_empty());
}

#[test]
fn camelot_is_adjacent_matches() {
    assert!(camelot_is_adjacent(Some("8A"), Some("9A")));
    assert!(camelot_is_adjacent(Some("8A"), Some("8A")));
    assert!(camelot_is_adjacent(Some("8A"), Some("8B")));
    assert!(!camelot_is_adjacent(Some("8A"), Some("4A")));
    assert!(!camelot_is_adjacent(None, Some("8A")));
}

// ── Per-criterion scorers ─────────────────────────────────────────────

#[test]
fn score_bpm_identical() {
    let a = track(|t| t.bpm = 120.0);
    let b = track(|t| t.bpm = 120.0);
    let c = cfg_with(|c| {
        c.bpm_slow_down_percent = 4.0;
        c.bpm_speed_up_percent = 4.0;
    });
    assert_eq!(score_bpm(&a, &b, &c), 1.0);
}

#[test]
fn score_bpm_max_tolerance_is_zero() {
    let a = track(|t| t.bpm = 120.0);
    let b = track(|t| t.bpm = 124.8);
    let c = cfg_with(|c| {
        c.bpm_slow_down_percent = 4.0;
        c.bpm_speed_up_percent = 4.0;
    });
    assert!(approx(score_bpm(&a, &b, &c), 0.0, 1e-4));
}

#[test]
fn score_bpm_halfway_is_half() {
    let a = track(|t| t.bpm = 120.0);
    let b = track(|t| t.bpm = 122.4);
    let c = cfg_with(|c| {
        c.bpm_slow_down_percent = 4.0;
        c.bpm_speed_up_percent = 4.0;
    });
    assert!(approx(score_bpm(&a, &b, &c), 0.5, 1e-4));
}

#[test]
fn score_bpm_clamps_below_zero() {
    let a = track(|t| t.bpm = 120.0);
    let b = track(|t| t.bpm = 200.0);
    let c = cfg();
    assert_eq!(score_bpm(&a, &b, &c), 0.0);
}

#[test]
fn score_bpm_uses_larger_asymmetric_side() {
    let a = track(|t| t.bpm = 120.0);
    let b = track(|t| t.bpm = 123.6);
    let c = cfg_with(|c| {
        c.bpm_slow_down_percent = 4.0;
        c.bpm_speed_up_percent = 6.0;
    });
    // maxTol = 6% of 120 = 7.2; delta = 3.6 → 1 - 3.6/7.2 = 0.5
    assert!(approx(score_bpm(&a, &b, &c), 0.5, 1e-4));
}

#[test]
fn score_key_same_is_one() {
    let a = track(|t| t.key = Some("8A".into()));
    let b = track(|t| t.key = Some("8A".into()));
    assert_eq!(score_key(&a, &b), 1.0);
}

#[test]
fn score_key_adjacent_is_seven_tenths() {
    let a = track(|t| t.key = Some("8A".into()));
    for k in ["9A", "7A", "8B"] {
        let b = track(|t| t.key = Some(k.into()));
        assert!(approx(score_key(&a, &b), 0.7, 1e-6), "key={k}");
    }
}

#[test]
fn score_key_non_adjacent_is_zero() {
    let a = track(|t| t.key = Some("8A".into()));
    let b = track(|t| t.key = Some("4A".into()));
    assert_eq!(score_key(&a, &b), 0.0);
}

#[test]
fn score_key_missing_is_zero() {
    let a = track(|t| t.key = Some("8A".into()));
    let b = track(|t| t.key = None);
    assert_eq!(score_key(&a, &b), 0.0);
    assert_eq!(score_key(&b, &a), 0.0);
}

#[test]
fn score_genre_matches() {
    let a = track(|t| t.genre = "Melodic Techno".into());
    let b1 = track(|t| t.genre = "Melodic Techno".into());
    let b2 = track(|t| t.genre = "Deep House".into());
    assert_eq!(score_genre(&a, &b1), 1.0);
    assert_eq!(score_genre(&a, &b2), 0.0);
}

#[test]
fn score_tags_both_empty_is_zero() {
    let a = track(|t| t.tags = Vec::new());
    let b = track(|t| t.tags = Vec::new());
    assert_eq!(score_tags(&a, &b), 0.0);
}

#[test]
fn score_tags_one_empty_is_zero() {
    let a = track(|t| t.tags = vec!["a".into()]);
    let b = track(|t| t.tags = Vec::new());
    assert_eq!(score_tags(&a, &b), 0.0);
}

#[test]
fn score_tags_identical_is_one() {
    let a = track(|t| t.tags = vec!["a".into(), "b".into()]);
    let b = track(|t| t.tags = vec!["a".into(), "b".into()]);
    assert_eq!(score_tags(&a, &b), 1.0);
}

#[test]
fn score_tags_partial_is_jaccard() {
    let a = track(|t| t.tags = vec!["a".into(), "b".into()]);
    let b = track(|t| t.tags = vec!["b".into(), "c".into()]);
    assert!(approx(score_tags(&a, &b), 1.0 / 3.0, 1e-6));
}

#[test]
fn score_artist_matches() {
    let a = track(|t| t.artist = "A".into());
    let b1 = track(|t| t.artist = "A".into());
    let b2 = track(|t| t.artist = "B".into());
    assert_eq!(score_artist(&a, &b1), 1.0);
    assert_eq!(score_artist(&a, &b2), 0.0);
}

#[test]
fn score_year_distance() {
    let a = track(|t| t.year = 2024);
    assert_eq!(score_year(&a, &track(|t| t.year = 2024)), 1.0);
    assert!(approx(
        score_year(&a, &track(|t| t.year = 2019)),
        0.5,
        1e-6
    ));
    assert_eq!(score_year(&a, &track(|t| t.year = 2014)), 0.0);
    assert_eq!(score_year(&a, &track(|t| t.year = 1990)), 0.0);
}

#[test]
fn score_energy_distance() {
    let a = track(|t| t.energy = 7);
    assert_eq!(score_energy(&a, &track(|t| t.energy = 7)), 1.0);
    assert_eq!(score_energy(&track(|t| t.energy = 1), &track(|t| t.energy = 10)), 0.0);
    assert!(approx(
        score_energy(&track(|t| t.energy = 7), &track(|t| t.energy = 4)),
        1.0 - 3.0 / 9.0,
        1e-6
    ));
}

// ── Strictness threshold ───────────────────────────────────────────────

#[test]
fn strictness_threshold_endpoints() {
    assert!(approx(strictness_threshold(0.0), 0.3, 1e-6));
    assert!(approx(strictness_threshold(50.0), 0.5, 1e-6));
    assert!(approx(strictness_threshold(100.0), 0.7, 1e-6));
}

#[test]
fn strictness_threshold_clamps() {
    assert!(approx(strictness_threshold(-100.0), 0.3, 1e-6));
    assert!(approx(strictness_threshold(999.0), 0.7, 1e-6));
}

// ── Integration: suggest() against the seeded mock library ─────────────

#[test]
fn suggest_returns_results_at_default_config() {
    let bundle = build_mock_library(42);
    let r = suggest(
        &bundle.anchor,
        &bundle.library,
        &cfg(),
        SuggestOptions::default(),
    );
    assert!(!r.suggestions.is_empty());
    assert!(r.total_pages >= 1);
}

#[test]
fn suggest_never_includes_anchor() {
    let bundle = build_mock_library(42);
    let r = suggest(
        &bundle.anchor,
        &bundle.library,
        &cfg(),
        SuggestOptions::default(),
    );
    for s in &r.suggestions {
        assert_ne!(s.track.id, bundle.anchor.id);
    }
}

#[test]
fn suggest_is_deterministic() {
    let bundle = build_mock_library(42);
    let a = suggest(
        &bundle.anchor,
        &bundle.library,
        &cfg(),
        SuggestOptions::default(),
    );
    let b = suggest(
        &bundle.anchor,
        &bundle.library,
        &cfg(),
        SuggestOptions::default(),
    );
    let ids_a: Vec<_> = a.suggestions.iter().map(|s| &s.track.id).collect();
    let ids_b: Vec<_> = b.suggestions.iter().map(|s| &s.track.id).collect();
    assert_eq!(ids_a, ids_b);
}

#[test]
fn suggest_respects_per_page() {
    let bundle = build_mock_library(42);
    let r = suggest(
        &bundle.anchor,
        &bundle.library,
        &cfg_with(|c| c.suggestions_per_page = 3),
        SuggestOptions::default(),
    );
    assert!(r.suggestions.len() <= 3);
}

#[test]
fn suggest_disabling_all_returns_empty() {
    let bundle = build_mock_library(42);
    let r = suggest(
        &bundle.anchor,
        &bundle.library,
        &cfg_with(|c| c.enabled_criteria = EnabledCriteria::all_off()),
        SuggestOptions::default(),
    );
    assert!(r.suggestions.is_empty());
}

#[test]
fn suggest_pagination_disjoint() {
    let bundle = build_mock_library(42);
    let config = cfg_with(|c| c.suggestions_per_page = 5);
    let p0 = suggest(
        &bundle.anchor,
        &bundle.library,
        &config,
        SuggestOptions { page: 0, already_shown: HashSet::new() },
    );
    if p0.total_pages > 1 {
        let shown: HashSet<String> =
            p0.suggestions.iter().map(|s| s.track.id.clone()).collect();
        let p1 = suggest(
            &bundle.anchor,
            &bundle.library,
            &config,
            SuggestOptions { page: 1, already_shown: shown.clone() },
        );
        for s in &p1.suggestions {
            assert!(!shown.contains(&s.track.id));
        }
    }
}

#[test]
fn suggest_bpm_range_asymmetric() {
    let bundle = build_mock_library(42);
    let r = suggest(
        &bundle.anchor,
        &bundle.library,
        &cfg_with(|c| {
            c.bpm_slow_down_percent = 4.0;
            c.bpm_speed_up_percent = 6.0;
        }),
        SuggestOptions::default(),
    );
    assert_eq!(r.bpm_range.min, 119);
    assert_eq!(r.bpm_range.max, 131);
}

#[test]
fn suggest_reasons_above_threshold_primary_first() {
    let bundle = build_mock_library(42);
    let r = suggest(
        &bundle.anchor,
        &bundle.library,
        &cfg_with(|c| c.strictness = 0.0),
        SuggestOptions::default(),
    );
    assert!(!r.suggestions.is_empty());
    for s in &r.suggestions {
        for window in s.reasons.windows(2) {
            assert!(window[0].strength >= window[1].strength);
        }
        for reason in &s.reasons {
            assert!(reason.strength >= 0.6);
        }
    }
}

#[test]
fn suggest_strict_returns_at_most_loose_count() {
    let bundle = build_mock_library(42);
    let loose = suggest(
        &bundle.anchor,
        &bundle.library,
        &cfg_with(|c| c.strictness = 0.0),
        SuggestOptions::default(),
    );
    let strict = suggest(
        &bundle.anchor,
        &bundle.library,
        &cfg_with(|c| c.strictness = 100.0),
        SuggestOptions::default(),
    );
    assert!(strict.suggestions.len() <= loose.suggestions.len());
}

// ── BPM range helpers ─────────────────────────────────────────────────

#[test]
fn resolved_bpm_range_124_4_6() {
    let a = track(|t| t.bpm = 124.0);
    let r = resolved_bpm_range(
        &a,
        &cfg_with(|c| {
            c.bpm_slow_down_percent = 4.0;
            c.bpm_speed_up_percent = 6.0;
        }),
    );
    assert_eq!(r.min, 119);
    assert_eq!(r.max, 131);
}
