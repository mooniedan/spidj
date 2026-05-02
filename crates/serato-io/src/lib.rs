//! Serato library reader + `.crate` writer.
//!
//! All Serato files we touch (the library `database V2` and the per-crate
//! `.crate` files in `Subcrates/`) share the same container format:
//! a sequence of records `[4-byte ASCII tag][4-byte u32 BE length N][N bytes]`,
//! with payloads that are either UTF-16 BE strings or further nested records.
//!
//! We hand-rolled the parser/writer rather than depending on `triseratops`
//! because the format is small enough to maintain ourselves and the spike
//! (see `spike/`) verified end-to-end that a fresh `.crate` we write loads
//! cleanly in Serato. See `.claude/plans/SP-serato-set-planner.md` for the
//! empirical findings.

pub mod crate_writer;
pub mod library;
pub mod record;

pub use crate_writer::{
    list_crates, read_crate, write_crate, CrateInfo, CrateWriteError,
};
pub use library::{open_serato_library, Library, LibraryError};
