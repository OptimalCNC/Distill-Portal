use std::path::PathBuf;

use serde::Serialize;

use crate::ingest::types::{ParsedSession, Tool};

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

#[derive(Debug, thiserror::Error)]
pub enum ScanFailure {
    #[error("failed to discover {tool:?} session files")]
    Discover {
        tool: Tool,
        #[source]
        source: AdapterError,
    },
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
        let mut batch = ScanBatch::default();
        self.scan_adapter(&self.claude, &self.claude_roots, &mut batch)?;
        self.scan_adapter(&self.codex, &self.codex_roots, &mut batch)?;
        batch.report.parsed_sessions = batch.sessions.len();
        batch.report.scan_errors = batch.scan_errors.len();
        Ok(batch)
    }

    fn scan_adapter<A: SessionAdapter>(
        &self,
        adapter: &A,
        roots: &[PathBuf],
        batch: &mut ScanBatch,
    ) -> Result<(), ScanFailure> {
        let discovered = adapter
            .discover(roots)
            .map_err(|source| ScanFailure::Discover {
                tool: adapter.tool(),
                source,
            })?;
        batch.report.discovered_files += discovered.len();

        for path in discovered {
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
