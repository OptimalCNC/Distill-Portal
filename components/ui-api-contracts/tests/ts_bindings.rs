//! TypeScript binding integration tests.
//!
//! These tests are only compiled when the `ts-bindings` cargo feature is
//! enabled. They intentionally do nothing when the feature is off so that
//! `cargo test -p distill-portal-ui-api-contracts` with default features
//! continues to succeed without pulling in the codegen dependency.
//!
//! Run with:
//!
//! ```text
//! # verify checked-in TS files are up to date (fails on drift)
//! cargo test -p distill-portal-ui-api-contracts --features ts-bindings
//!
//! # regenerate the checked-in TS files from the current Rust contracts
//! cargo test -p distill-portal-ui-api-contracts --features ts-bindings \
//!     -- --ignored regenerate_ts_bindings
//! ```
//!
//! The generator uses `TS::export_all(Config)` into an explicit output
//! directory, not the `#[ts(export)]` auto-export hook, so the staleness
//! check can diff a temp directory against the checked-in files without
//! the staleness check itself racing against an auto-writer.

#![cfg(feature = "ts-bindings")]

use std::{
    fs, io,
    path::{Path, PathBuf},
    sync::atomic::{AtomicU64, Ordering},
    time::{SystemTime, UNIX_EPOCH},
};

use distill_portal_ui_api_contracts::{
    ImportReport, ImportSourceSessionsRequest, PersistedScanError, RescanReport,
    SessionSyncStatus, SourceSessionView, StoredSessionRecord, StoredSessionView, Tool,
};
use ts_rs::{Config, TS};

/// Files expected to appear in the `bindings/` directory after generation.
/// Kept in a sorted, explicit list so a reviewer can read this file and
/// immediately verify that every in-scope contract type is covered.
const EXPECTED_BINDING_FILES: &[&str] = &[
    "ImportReport.ts",
    "ImportSourceSessionsRequest.ts",
    "PersistedScanError.ts",
    "RescanReport.ts",
    "SessionSyncStatus.ts",
    "SourceSessionView.ts",
    "StoredSessionRecord.ts",
    "StoredSessionView.ts",
    "Tool.ts",
];

fn bindings_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("bindings")
}

fn unique_temp_dir(prefix: &str) -> PathBuf {
    static COUNTER: AtomicU64 = AtomicU64::new(0);
    let pid = std::process::id();
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let seq = COUNTER.fetch_add(1, Ordering::SeqCst);
    std::env::temp_dir().join(format!("{prefix}-{pid}-{nanos}-{seq}"))
}

fn remove_dir_if_exists(dir: &Path) -> io::Result<()> {
    match fs::remove_dir_all(dir) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error),
    }
}

/// Emit all nine in-scope contract types into `out_dir` by explicitly
/// calling `TS::export_all` with a configured output directory. Calling
/// `export_all` on every type is redundant for dependency resolution but
/// harmless — each call is idempotent — and keeps the coverage list in
/// one visible place.
fn export_all_contracts(out_dir: &Path) {
    fs::create_dir_all(out_dir).expect("create output dir");
    let config = Config::new().with_out_dir(out_dir);
    Tool::export_all(&config).expect("export Tool");
    SessionSyncStatus::export_all(&config).expect("export SessionSyncStatus");
    SourceSessionView::export_all(&config).expect("export SourceSessionView");
    StoredSessionRecord::export_all(&config).expect("export StoredSessionRecord");
    StoredSessionView::export_all(&config).expect("export StoredSessionView");
    PersistedScanError::export_all(&config).expect("export PersistedScanError");
    RescanReport::export_all(&config).expect("export RescanReport");
    ImportReport::export_all(&config).expect("export ImportReport");
    ImportSourceSessionsRequest::export_all(&config).expect("export ImportSourceSessionsRequest");
}

fn read_dir_file_names_sorted(dir: &Path) -> Vec<String> {
    let mut names: Vec<String> = fs::read_dir(dir)
        .unwrap_or_else(|e| panic!("read_dir {}: {}", dir.display(), e))
        .map(|entry| {
            entry
                .expect("dir entry")
                .file_name()
                .to_string_lossy()
                .into_owned()
        })
        .filter(|name| !name.starts_with('.'))
        .collect();
    names.sort();
    names
}

/// Staleness-detection test. Regenerates TS bindings into a temporary
/// directory, then compares every expected file against the checked-in
/// copy under `components/ui-api-contracts/bindings/`. Fails loudly on
/// any mismatch so a developer who changes the Rust contract without
/// regenerating gets a clear error.
#[test]
fn ts_bindings_match_checked_in_files() {
    let temp = unique_temp_dir("distill-portal-ts-bindings-freshness");
    remove_dir_if_exists(&temp).expect("clean temp dir");
    export_all_contracts(&temp);

    let checked_in = bindings_dir();

    // 1. The expected-file list is the source of truth for coverage.
    let generated = read_dir_file_names_sorted(&temp);
    let mut expected = EXPECTED_BINDING_FILES
        .iter()
        .map(|s| (*s).to_string())
        .collect::<Vec<_>>();
    expected.sort();
    assert_eq!(
        generated, expected,
        "generated file set differs from EXPECTED_BINDING_FILES; if you added \
         a new contract type, update this list and regenerate the bindings"
    );

    // 2. The checked-in directory must contain exactly the same filenames.
    let checked_in_names = read_dir_file_names_sorted(&checked_in);
    assert_eq!(
        checked_in_names, expected,
        "checked-in bindings directory {} is missing or has extra files; run \
         `cargo test -p distill-portal-ui-api-contracts --features ts-bindings \
         -- --ignored regenerate_ts_bindings` to refresh",
        checked_in.display()
    );

    // 3. Byte-for-byte comparison per file, normalizing line endings so
    //    Windows checkouts do not produce false-negatives.
    for name in &expected {
        let fresh = fs::read_to_string(temp.join(name))
            .unwrap_or_else(|e| panic!("read fresh {name}: {e}"));
        let stored = fs::read_to_string(checked_in.join(name))
            .unwrap_or_else(|e| panic!("read stored {name}: {e}"));
        let fresh_norm = fresh.replace("\r\n", "\n");
        let stored_norm = stored.replace("\r\n", "\n");
        assert_eq!(
            stored_norm,
            fresh_norm,
            "checked-in TS binding `{name}` is stale. Regenerate with \
             `cargo test -p distill-portal-ui-api-contracts --features \
             ts-bindings -- --ignored regenerate_ts_bindings`."
        );
    }

    // Best-effort cleanup; ignore failure so a leaked temp dir never
    // masks a real test failure above.
    let _ = fs::remove_dir_all(&temp);
}

/// Regenerator. Marked `#[ignore]` so it is *not* part of the default
/// `cargo test --features ts-bindings` run — the default run must only
/// read the filesystem, not modify it. Invoke explicitly with:
///
/// ```text
/// cargo test -p distill-portal-ui-api-contracts --features ts-bindings \
///     -- --ignored regenerate_ts_bindings
/// ```
#[test]
#[ignore = "writes to components/ui-api-contracts/bindings/; invoke explicitly when refreshing TS output"]
fn regenerate_ts_bindings() {
    let out = bindings_dir();
    remove_dir_if_exists(&out).expect("clean bindings dir");
    export_all_contracts(&out);
}
