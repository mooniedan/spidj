//! Convert classical key notation (e.g. "Fm", "F#m") into Camelot notation
//! (e.g. "4A", "11A") so spidj-engine's adjacency helper can match.
//!
//! Serato stores `tkey` in whichever notation the user has configured. The
//! user's library showed both `Fm`/`F#m` and `4A`/`11A` style. Without
//! conversion, scoreKey() returns 0 for any non-Camelot pair.

/// Returns Camelot string if `key` looks like classical notation, otherwise
/// returns the input unchanged. None inputs / unparseable strings → None.
pub fn normalize(key: Option<&str>) -> Option<String> {
    let raw = key?.trim();
    if raw.is_empty() {
        return None;
    }
    if is_camelot(raw) {
        return Some(raw.to_string());
    }
    classical_to_camelot(raw).map(str::to_string)
}

fn is_camelot(s: &str) -> bool {
    if !(2..=3).contains(&s.len()) {
        return false;
    }
    let last = s.chars().last().unwrap();
    if last != 'A' && last != 'B' {
        return false;
    }
    s[..s.len() - 1].parse::<u8>().is_ok_and(|n| (1..=12).contains(&n))
}

/// Map classical notation to Camelot. Tolerates flat/sharp synonyms and
/// "min"/"maj"/"m" suffixes.
fn classical_to_camelot(s: &str) -> Option<&'static str> {
    let cleaned: String = s.chars().filter(|c| !c.is_whitespace()).collect();
    let lower = cleaned.to_lowercase();

    // Strip suffix; what remains is the root.
    let (root, is_minor) = strip_quality(&lower);

    let pitch = match root {
        "c" => 0,
        "c#" | "db" => 1,
        "d" => 2,
        "d#" | "eb" => 3,
        "e" | "fb" => 4,
        "f" | "e#" => 5,
        "f#" | "gb" => 6,
        "g" => 7,
        "g#" | "ab" => 8,
        "a" => 9,
        "a#" | "bb" => 10,
        "b" | "cb" => 11,
        _ => return None,
    };

    Some(if is_minor {
        MINOR_CAMELOT[pitch]
    } else {
        MAJOR_CAMELOT[pitch]
    })
}

fn strip_quality(lower: &str) -> (&str, bool) {
    // Order matters: longer suffixes first.
    for suffix in ["minor", "maj", "min", "m"] {
        if let Some(stripped) = lower.strip_suffix(suffix) {
            // "m" alone is ambiguous with C/D/E/F/G/A/B major when input is
            // something like "C". We special-case: "m" only counts as minor
            // if the remaining root is non-empty.
            if !stripped.is_empty() {
                let is_minor = match suffix {
                    "maj" => false,
                    _ => true,
                };
                return (stripped, is_minor);
            }
        }
    }
    (lower, false)
}

/// Indexed by pitch class 0..11 (C, C#, D, D#, E, F, F#, G, G#, A, A#, B).
const MAJOR_CAMELOT: [&str; 12] = [
    "8B", "3B", "10B", "5B", "12B", "7B", "2B", "9B", "4B", "11B", "6B", "1B",
];
const MINOR_CAMELOT: [&str; 12] = [
    "5A", "12A", "7A", "2A", "9A", "4A", "11A", "6A", "1A", "8A", "3A", "10A",
];

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn already_camelot_passes_through() {
        assert_eq!(normalize(Some("8A")).as_deref(), Some("8A"));
        assert_eq!(normalize(Some("12B")).as_deref(), Some("12B"));
    }

    #[test]
    fn classical_minor_to_camelot() {
        assert_eq!(normalize(Some("Am")).as_deref(), Some("8A"));
        assert_eq!(normalize(Some("Fm")).as_deref(), Some("4A"));
        assert_eq!(normalize(Some("F#m")).as_deref(), Some("11A"));
        assert_eq!(normalize(Some("Cm")).as_deref(), Some("5A"));
        assert_eq!(normalize(Some("Bm")).as_deref(), Some("10A"));
    }

    #[test]
    fn classical_major_to_camelot() {
        assert_eq!(normalize(Some("C")).as_deref(), Some("8B"));
        assert_eq!(normalize(Some("F#")).as_deref(), Some("2B"));
        assert_eq!(normalize(Some("Bb")).as_deref(), Some("6B"));
    }

    #[test]
    fn invalid_returns_none() {
        assert_eq!(normalize(None), None);
        assert_eq!(normalize(Some("")), None);
        assert_eq!(normalize(Some("garbage")), None);
        assert_eq!(normalize(Some("13A")), None);
    }
}
