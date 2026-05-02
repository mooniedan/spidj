//! Engine types — verbatim from `requirements.md §6.1`.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum CriterionKey {
    Bpm,
    Key,
    Genre,
    Tags,
    Artist,
    Year,
    Energy,
}

impl CriterionKey {
    /// Iteration order — matches the order reasons get sorted in tie-breaks
    /// and matches the JS engine's `EnabledCriteria` field order.
    pub const ALL: [CriterionKey; 7] = [
        CriterionKey::Bpm,
        CriterionKey::Key,
        CriterionKey::Genre,
        CriterionKey::Tags,
        CriterionKey::Artist,
        CriterionKey::Year,
        CriterionKey::Energy,
    ];
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Track {
    pub id: String,
    pub title: String,
    pub artist: String,
    pub bpm: f32,
    pub key: Option<String>,
    pub genre: String,
    pub tags: Vec<String>,
    pub year: i32,
    pub energy: u8,
    pub album_art_color: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub duration: Option<f64>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnabledCriteria {
    pub bpm: bool,
    pub key: bool,
    pub genre: bool,
    pub tags: bool,
    pub artist: bool,
    pub year: bool,
    pub energy: bool,
}

impl EnabledCriteria {
    pub fn all_off() -> Self {
        Self {
            bpm: false,
            key: false,
            genre: false,
            tags: false,
            artist: false,
            year: false,
            energy: false,
        }
    }

    pub fn all_on() -> Self {
        Self {
            bpm: true,
            key: true,
            genre: true,
            tags: true,
            artist: true,
            year: true,
            energy: true,
        }
    }

    pub fn is_enabled(&self, k: CriterionKey) -> bool {
        match k {
            CriterionKey::Bpm => self.bpm,
            CriterionKey::Key => self.key,
            CriterionKey::Genre => self.genre,
            CriterionKey::Tags => self.tags,
            CriterionKey::Artist => self.artist,
            CriterionKey::Year => self.year,
            CriterionKey::Energy => self.energy,
        }
    }

    pub fn enabled_count(&self) -> usize {
        CriterionKey::ALL.iter().filter(|k| self.is_enabled(**k)).count()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SuggestionConfig {
    pub enabled_criteria: EnabledCriteria,
    /// REQ-SUGGEST-04: 0 = Loose, 100 = Strict.
    pub strictness: f32,
    /// REQ-SUGGEST-03: percent allowed below anchor. Default 4.
    pub bpm_slow_down_percent: f32,
    /// REQ-SUGGEST-03: percent allowed above anchor. Default 6.
    pub bpm_speed_up_percent: f32,
    /// REQ-SUGGEST-05: 5..12, default 7.
    pub suggestions_per_page: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Suggestion {
    pub track: Track,
    pub reasons: Vec<SuggestionReason>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SuggestionReason {
    /// `type` is reserved in Rust; use `r#type` in code, serialise as "type".
    #[serde(rename = "type")]
    pub r#type: CriterionKey,
    pub detail: String,
    /// Per-criterion score in [0, 1]. Highest is the primary reason
    /// (REQ-SUGGEST-06).
    pub strength: f32,
}

/// Defaults per REQ-SUGGEST-02..05.
pub const DEFAULT_CONFIG: SuggestionConfig = SuggestionConfig {
    enabled_criteria: EnabledCriteria {
        bpm: true,
        key: true,
        genre: true,
        tags: true,
        artist: true,
        year: true,
        energy: true,
    },
    strictness: 50.0,
    bpm_slow_down_percent: 4.0,
    bpm_speed_up_percent: 6.0,
    suggestions_per_page: 7,
};
