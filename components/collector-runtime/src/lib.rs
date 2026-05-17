pub mod adapters;
pub mod safe_read;
pub mod scanner;
pub mod types;

/// Bump when scanner discovery, fingerprinting, or parse eligibility changes
/// enough that a rescan operation should no longer be idempotent with rows
/// created by the previous behavior.
pub const SCANNER_CONFIG_VERSION: &str = "scanner-v1";

pub use adapters::{AdapterError, ClaudeCodeAdapter, CodexAdapter, SessionAdapter};
pub use safe_read::{read_jsonl_file, safe_read_jsonl_bytes, SafeRead};
pub use scanner::{
    NoopScanCheckpoint, ScanBatch, ScanCheckpoint, ScanCheckpointError, ScanErrorRecord,
    ScanFailure, ScanReport, Scanner,
};
pub use types::ParsedSession;
