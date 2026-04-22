pub mod claude_code;
pub mod codex;

use std::{
    io,
    path::{Path, PathBuf},
    time::SystemTime,
};

use distill_portal_ui_api_contracts::Tool;
use serde_json::Value;
use sha2::{Digest, Sha256};
use time::{format_description::well_known::Rfc3339, OffsetDateTime};

use crate::{safe_read::SafeRead, types::ParsedSession};

pub use claude_code::ClaudeCodeAdapter;
pub use codex::CodexAdapter;

pub trait SessionAdapter {
    fn tool(&self) -> Tool;
    fn discover(&self, roots: &[PathBuf]) -> Result<Vec<PathBuf>, AdapterError>;
    fn parse(&self, path: &Path, safe_read: &SafeRead) -> Result<ParsedSession, AdapterError>;
}

#[derive(Debug, thiserror::Error)]
pub enum AdapterError {
    #[error("{path}: {message}")]
    InvalidData { path: PathBuf, message: String },
    #[error("{path}: line {line} is not valid JSON ({source})")]
    InvalidJsonLine {
        path: PathBuf,
        line: usize,
        #[source]
        source: serde_json::Error,
    },
    #[error("{path}: I/O error ({source})")]
    Io {
        path: PathBuf,
        #[source]
        source: io::Error,
    },
}

impl AdapterError {
    pub fn invalid(path: impl Into<PathBuf>, message: impl Into<String>) -> Self {
        Self::InvalidData {
            path: path.into(),
            message: message.into(),
        }
    }

    pub fn io(path: impl Into<PathBuf>, source: io::Error) -> Self {
        Self::Io {
            path: path.into(),
            source,
        }
    }
}

pub(crate) fn fingerprint_bytes(bytes: &[u8]) -> String {
    let digest = Sha256::digest(bytes);
    format!("{digest:x}")
}

pub(crate) fn parse_jsonl(path: &Path, bytes: &[u8]) -> Result<Vec<Value>, AdapterError> {
    let mut records = Vec::new();

    for (index, raw_line) in bytes.split(|byte| *byte == b'\n').enumerate() {
        if raw_line.is_empty() {
            continue;
        }

        let line = trim_trailing_carriage_return(raw_line);
        if line.is_empty() {
            return Err(AdapterError::invalid(
                path,
                format!("line {} is empty", index + 1),
            ));
        }

        let value =
            serde_json::from_slice(line).map_err(|source| AdapterError::InvalidJsonLine {
                path: path.to_path_buf(),
                line: index + 1,
                source,
            })?;
        records.push(value);
    }

    if records.is_empty() {
        return Err(AdapterError::invalid(
            path,
            "session file contains no complete JSONL records",
        ));
    }

    Ok(records)
}

pub(crate) fn parse_rfc3339_timestamp(
    path: &Path,
    line: usize,
    raw: &str,
) -> Result<OffsetDateTime, AdapterError> {
    OffsetDateTime::parse(raw, &Rfc3339).map_err(|_| {
        AdapterError::invalid(
            path,
            format!("line {line} has invalid RFC3339 timestamp: {raw}"),
        )
    })
}

pub(crate) fn file_mtime(path: &Path) -> Result<Option<OffsetDateTime>, AdapterError> {
    let metadata = std::fs::metadata(path).map_err(|source| AdapterError::io(path, source))?;
    match metadata.modified() {
        Ok(modified) => Ok(Some(system_time_to_offset(modified))),
        Err(error) if error.kind() == io::ErrorKind::Unsupported => Ok(None),
        Err(source) => Err(AdapterError::io(path, source)),
    }
}

pub(crate) fn normalize_title(raw: &str) -> Option<String> {
    let normalized = raw.split_whitespace().collect::<Vec<_>>().join(" ");
    if normalized.is_empty() {
        None
    } else {
        Some(normalized)
    }
}

pub(crate) fn string_field<'a>(value: &'a Value, key: &str) -> Option<&'a str> {
    value.get(key)?.as_str()
}

pub(crate) fn string_pointer<'a>(value: &'a Value, pointer: &str) -> Option<&'a str> {
    value.pointer(pointer)?.as_str()
}

fn system_time_to_offset(value: SystemTime) -> OffsetDateTime {
    value.into()
}

fn trim_trailing_carriage_return(line: &[u8]) -> &[u8] {
    line.strip_suffix(b"\r").unwrap_or(line)
}
