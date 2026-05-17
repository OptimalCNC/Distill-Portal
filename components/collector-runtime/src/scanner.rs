use std::path::PathBuf;

use distill_portal_ui_api_contracts::Tool;
use serde::Serialize;

use crate::types::ParsedSession;

use super::{
    adapters::{fingerprint_bytes, AdapterError, ClaudeCodeAdapter, CodexAdapter, SessionAdapter},
    read_jsonl_file,
};

#[derive(Clone, Debug, Default, Serialize)]
pub struct ScanReport {
    pub discovered_files: usize,
    pub skipped_files: usize,
    pub parsed_sessions: usize,
    pub scan_errors: usize,
}

#[derive(Clone, Debug, Default, Serialize)]
pub struct ScanBatch {
    pub sessions: Vec<ParsedSession>,
    pub scan_errors: Vec<ScanErrorRecord>,
    pub report: ScanReport,
}

#[derive(Clone, Debug, Serialize)]
pub struct ScanErrorRecord {
    pub tool: Tool,
    pub source_path: PathBuf,
    pub fingerprint: Option<String>,
    pub message: String,
}

impl ScanErrorRecord {
    fn from_adapter_error(
        tool: Tool,
        source_path: PathBuf,
        fingerprint: Option<String>,
        error: AdapterError,
    ) -> Self {
        Self {
            tool,
            source_path,
            fingerprint,
            message: error.to_string(),
        }
    }

    fn from_io_error(tool: Tool, source_path: PathBuf, error: std::io::Error) -> Self {
        Self {
            tool,
            source_path,
            fingerprint: None,
            message: error.to_string(),
        }
    }
}

#[cfg(test)]
mod tests {
    use std::{
        path::Path,
        sync::{
            atomic::{AtomicUsize, Ordering},
            Arc,
        },
    };

    use tempfile::TempDir;

    use super::{ScanCheckpoint, ScanCheckpointError, ScanFailure, Scanner};

    #[derive(Clone)]
    struct CancelOnSecondFile {
        checks: Arc<AtomicUsize>,
    }

    impl ScanCheckpoint for CancelOnSecondFile {
        fn check(&mut self) -> Result<(), ScanCheckpointError> {
            let count = self.checks.fetch_add(1, Ordering::SeqCst) + 1;
            if count >= 2 {
                Err(ScanCheckpointError::Cancelled)
            } else {
                Ok(())
            }
        }
    }

    #[test]
    fn scan_with_checkpoint_stops_between_source_files() {
        let tempdir = TempDir::new().unwrap();
        let root = tempdir.path().join("claude/projects");
        write_file(
            &root.join("project").join("a.jsonl"),
            b"{\"type\":\"noop\"}\n",
        );
        write_file(
            &root.join("project").join("b.jsonl"),
            b"{\"type\":\"noop\"}\n",
        );
        let checks = Arc::new(AtomicUsize::new(0));
        let mut checkpoint = CancelOnSecondFile {
            checks: checks.clone(),
        };
        let scanner = Scanner::new(vec![root], vec![]);

        let error = scanner.scan_with_checkpoint(&mut checkpoint).unwrap_err();

        assert!(matches!(
            error,
            ScanFailure::Checkpoint(ScanCheckpointError::Cancelled)
        ));
        assert_eq!(checks.load(Ordering::SeqCst), 2);
    }

    fn write_file(path: &Path, bytes: &[u8]) {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).unwrap();
        }
        std::fs::write(path, bytes).unwrap();
    }
}

#[derive(Debug, thiserror::Error)]
pub enum ScanFailure {
    #[error("failed to discover {tool:?} session files")]
    Discover {
        tool: Tool,
        #[source]
        source: AdapterError,
    },
    #[error(transparent)]
    Checkpoint(#[from] ScanCheckpointError),
}

#[derive(Debug, thiserror::Error)]
pub enum ScanCheckpointError {
    #[error("scan cancelled")]
    Cancelled,
    #[error("scan checkpoint failed: {0}")]
    Failed(String),
}

pub trait ScanCheckpoint {
    fn check(&mut self) -> Result<(), ScanCheckpointError>;
}

#[derive(Debug, Default)]
pub struct NoopScanCheckpoint;

impl ScanCheckpoint for NoopScanCheckpoint {
    fn check(&mut self) -> Result<(), ScanCheckpointError> {
        Ok(())
    }
}

#[derive(Clone, Debug, Default)]
pub struct Scanner {
    claude_roots: Vec<PathBuf>,
    codex_roots: Vec<PathBuf>,
    claude: ClaudeCodeAdapter,
    codex: CodexAdapter,
}

impl Scanner {
    pub fn new(claude_roots: Vec<PathBuf>, codex_roots: Vec<PathBuf>) -> Self {
        Self {
            claude_roots,
            codex_roots,
            claude: ClaudeCodeAdapter,
            codex: CodexAdapter,
        }
    }

    pub fn scan(&self) -> Result<ScanBatch, ScanFailure> {
        let mut checkpoint = NoopScanCheckpoint;
        self.scan_with_checkpoint(&mut checkpoint)
    }

    pub fn scan_with_checkpoint<C: ScanCheckpoint>(
        &self,
        checkpoint: &mut C,
    ) -> Result<ScanBatch, ScanFailure> {
        let mut batch = ScanBatch::default();
        self.scan_adapter(&self.claude, &self.claude_roots, &mut batch, checkpoint)?;
        self.scan_adapter(&self.codex, &self.codex_roots, &mut batch, checkpoint)?;
        batch.report.parsed_sessions = batch.sessions.len();
        batch.report.scan_errors = batch.scan_errors.len();
        Ok(batch)
    }

    fn scan_adapter<A: SessionAdapter>(
        &self,
        adapter: &A,
        roots: &[PathBuf],
        batch: &mut ScanBatch,
        checkpoint: &mut impl ScanCheckpoint,
    ) -> Result<(), ScanFailure> {
        let discovered = adapter
            .discover(roots)
            .map_err(|source| ScanFailure::Discover {
                tool: adapter.tool(),
                source,
            })?;
        batch.report.discovered_files += discovered.len();

        for path in discovered {
            checkpoint.check()?;
            match read_jsonl_file(&path) {
                Ok(Some(safe_read)) => match adapter.parse(&path, &safe_read) {
                    Ok(session) => batch.sessions.push(session),
                    Err(error) => batch.scan_errors.push(ScanErrorRecord::from_adapter_error(
                        adapter.tool(),
                        path,
                        Some(fingerprint_bytes(&safe_read.bytes)),
                        error,
                    )),
                },
                Ok(None) => {
                    batch.report.skipped_files += 1;
                }
                Err(error) => batch.scan_errors.push(ScanErrorRecord::from_io_error(
                    adapter.tool(),
                    path,
                    error,
                )),
            }
        }

        Ok(())
    }
}
