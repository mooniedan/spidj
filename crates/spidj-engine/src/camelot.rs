//! Camelot wheel adjacency. Matches `apps/spidj/src/engine/camelot.ts`.

pub const CAMELOT_KEYS: [&str; 24] = [
    "1A", "2A", "3A", "4A", "5A", "6A", "7A", "8A", "9A", "10A", "11A", "12A",
    "1B", "2B", "3B", "4B", "5B", "6B", "7B", "8B", "9B", "10B", "11B", "12B",
];

fn parse_key(key: &str) -> Option<(u8, char)> {
    if key.len() < 2 || key.len() > 3 {
        return None;
    }
    let (num_part, letter_part) = key.split_at(key.len() - 1);
    let num: u8 = num_part.parse().ok()?;
    if !(1..=12).contains(&num) {
        return None;
    }
    let letter = letter_part.chars().next()?;
    if letter != 'A' && letter != 'B' {
        return None;
    }
    Some((num, letter))
}

fn wrap(n: i32) -> u8 {
    (((n - 1).rem_euclid(12)) + 1) as u8
}

/// Returns the four keys considered adjacent (or equal) to `key` on the
/// Camelot wheel: itself, ±1 number same letter (wrapping 12↔1), and the
/// parallel relative.
pub fn camelot_adjacent(key: Option<&str>) -> Vec<String> {
    let Some(k) = key else { return Vec::new(); };
    let Some((num, letter)) = parse_key(k) else { return Vec::new(); };
    let other = if letter == 'A' { 'B' } else { 'A' };
    let n = num as i32;
    vec![
        format!("{}{}", num, letter),
        format!("{}{}", wrap(n + 1), letter),
        format!("{}{}", wrap(n - 1), letter),
        format!("{}{}", num, other),
    ]
}

/// True if the two keys are equal or adjacent on the Camelot wheel.
pub fn camelot_is_adjacent(a: Option<&str>, b: Option<&str>) -> bool {
    let (Some(a), Some(b)) = (a, b) else { return false };
    camelot_adjacent(Some(a)).iter().any(|k| k == b)
}
