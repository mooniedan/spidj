//! Tag/length record container shared between `database V2` and `.crate`.

use anyhow::{anyhow, Result};

/// A single record: 4-byte ASCII tag + variable-length payload.
#[derive(Debug, Clone)]
pub struct Record {
    pub tag: [u8; 4],
    pub payload: Vec<u8>,
}

impl Record {
    pub fn new(tag: &[u8; 4], payload: Vec<u8>) -> Self {
        Self { tag: *tag, payload }
    }

    pub fn tag_str(&self) -> &str {
        // ASCII guaranteed by parser/writer.
        std::str::from_utf8(&self.tag).unwrap_or("????")
    }

    /// Encode this record (`tag + length + payload`) into a byte buffer.
    pub fn encode(&self, out: &mut Vec<u8>) {
        out.extend_from_slice(&self.tag);
        let len: u32 = self
            .payload
            .len()
            .try_into()
            .expect("record payload fits in u32 — single tracks should be tiny");
        out.extend_from_slice(&len.to_be_bytes());
        out.extend_from_slice(&self.payload);
    }
}

/// Parse a flat sequence of records from `bytes`. Returns an error if the
/// stream is malformed (declared length extends past EOF, or trailing bytes
/// after the final record). Tags are not validated — Serato uses
/// space-padded 4-byte tags (e.g. `tyr `) and we want to accept anything
/// the format actually contains.
pub fn parse_records(bytes: &[u8]) -> Result<Vec<Record>> {
    let mut out = Vec::new();
    let mut i = 0;
    while i + 8 <= bytes.len() {
        let mut tag = [0u8; 4];
        tag.copy_from_slice(&bytes[i..i + 4]);
        let len = u32::from_be_bytes([
            bytes[i + 4],
            bytes[i + 5],
            bytes[i + 6],
            bytes[i + 7],
        ]) as usize;
        i += 8;
        if i + len > bytes.len() {
            return Err(anyhow!(
                "record {} declared length {} extends past end (offset {}, total {})",
                String::from_utf8_lossy(&tag),
                len,
                i,
                bytes.len()
            ));
        }
        let payload = bytes[i..i + len].to_vec();
        i += len;
        out.push(Record { tag, payload });
    }
    if i != bytes.len() {
        return Err(anyhow!(
            "trailing {} bytes after final record",
            bytes.len() - i
        ));
    }
    Ok(out)
}

/// Parse a payload that is itself a sequence of records.
pub fn parse_nested(payload: &[u8]) -> Result<Vec<Record>> {
    parse_records(payload).map_err(|e| anyhow!("nested record payload: {e}"))
}

/// Decode a UTF-16 BE payload to `String`, returning `None` if the byte
/// length is odd (malformed). Replaces unpaired surrogates with U+FFFD.
pub fn decode_utf16_be(bytes: &[u8]) -> Option<String> {
    if !bytes.len().is_multiple_of(2) {
        return None;
    }
    let units: Vec<u16> = bytes
        .chunks_exact(2)
        .map(|c| u16::from_be_bytes([c[0], c[1]]))
        .collect();
    Some(String::from_utf16_lossy(&units))
}

/// Encode a `&str` into UTF-16 BE bytes for use as a record payload.
pub fn encode_utf16_be(s: &str) -> Vec<u8> {
    let mut out = Vec::with_capacity(s.len() * 2);
    for u in s.encode_utf16() {
        out.extend_from_slice(&u.to_be_bytes());
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trip_simple_records() {
        let mut buf = Vec::new();
        Record::new(b"vrsn", encode_utf16_be("hello")).encode(&mut buf);
        Record::new(b"otrk", b"\xDE\xAD\xBE\xEF".to_vec()).encode(&mut buf);

        let parsed = parse_records(&buf).unwrap();
        assert_eq!(parsed.len(), 2);
        assert_eq!(parsed[0].tag_str(), "vrsn");
        assert_eq!(decode_utf16_be(&parsed[0].payload).as_deref(), Some("hello"));
        assert_eq!(parsed[1].tag_str(), "otrk");
        assert_eq!(parsed[1].payload, vec![0xDE, 0xAD, 0xBE, 0xEF]);
    }

    #[test]
    fn parse_rejects_truncated_record() {
        let mut buf = Vec::new();
        // tag + length = 100 but no payload.
        buf.extend_from_slice(b"vrsn");
        buf.extend_from_slice(&100u32.to_be_bytes());
        assert!(parse_records(&buf).is_err());
    }

    #[test]
    fn parse_rejects_trailing_garbage() {
        let mut buf = Vec::new();
        Record::new(b"vrsn", encode_utf16_be("v")).encode(&mut buf);
        buf.push(0x00); // odd trailing byte
        assert!(parse_records(&buf).is_err());
    }

    #[test]
    fn utf16_round_trip() {
        let s = "spidj-spike — Beyoncé é";
        let bytes = encode_utf16_be(s);
        assert_eq!(decode_utf16_be(&bytes).as_deref(), Some(s));
    }
}
