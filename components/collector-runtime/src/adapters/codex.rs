use std::{
    ffi::OsStr,
    fs,
    path::{Path, PathBuf},
};

use distill_portal_ui_api_contracts::Tool;
use time::OffsetDateTime;
use uuid::Uuid;

use crate::{safe_read::SafeRead, types::ParsedSession};

use super::{
    file_mtime, fingerprint_bytes, normalize_title, parse_jsonl, parse_rfc3339_timestamp,
    string_field, string_pointer, AdapterError, SessionAdapter,
};

#[derive(Clone, Debug, Default)]
pub struct CodexAdapter;

impl SessionAdapter for CodexAdapter {
    fn tool(&self) -> Tool {
        Tool::Codex
    }

    fn discover(&self, roots: &[PathBuf]) -> Result<Vec<PathBuf>, AdapterError> {
        let mut discovered = Vec::new();

        for root in roots {
            if !root.exists() {
                continue;
            }
            if !root.is_dir() {
                return Err(AdapterError::invalid(
                    root,
                    "configured Codex root is not a directory",
                ));
            }

            for year in read_child_dirs(root)? {
                for month in read_child_dirs(&year)? {
                    for day in read_child_dirs(&month)? {
                        let session_entries =
                            fs::read_dir(&day).map_err(|source| AdapterError::io(&day, source))?;
                        for entry in session_entries {
                            let entry = entry.map_err(|source| AdapterError::io(&day, source))?;
                            let file_type = entry
                                .file_type()
                                .map_err(|source| AdapterError::io(entry.path(), source))?;
                            if !file_type.is_file()
                                || entry.path().extension() != Some(OsStr::new("jsonl"))
                            {
                                continue;
                            }
                            discovered.push(entry.path());
                        }
                    }
                }
            }
        }

        discovered.sort();
        discovered.dedup();
        Ok(discovered)
    }

    fn parse(&self, path: &Path, safe_read: &SafeRead) -> Result<ParsedSession, AdapterError> {
        let source_session_id = filename_session_id(path)?;
        let records = parse_jsonl(path, &safe_read.bytes)?;
        let file_timestamp = file_mtime(path)?;

        let mut created_at = None;
        let mut source_updated_at = None;
        let mut title = None;
        let mut session_meta_cwd = None;
        let mut turn_context_cwd = None;
        let mut saw_session_meta = false;

        for (line_number, record) in records.iter().enumerate() {
            let line_number = line_number + 1;

            if let Some(timestamp) = string_field(record, "timestamp") {
                let timestamp = parse_rfc3339_timestamp(path, line_number, timestamp)?;
                created_at = Some(min_timestamp(created_at, timestamp));
                source_updated_at = Some(max_timestamp(source_updated_at, timestamp));
            }

            match string_field(record, "type") {
                Some("session_meta") => {
                    saw_session_meta = true;
                    if let Some(meta_id) = string_pointer(record, "/payload/id") {
                        if meta_id != source_session_id {
                            return Err(AdapterError::invalid(
                                path,
                                format!(
                                    "line {line_number} has session_meta.payload.id {meta_id} but filename id is {source_session_id}"
                                ),
                            ));
                        }
                    }

                    if let Some(meta_timestamp) = string_pointer(record, "/payload/timestamp") {
                        let meta_timestamp =
                            parse_rfc3339_timestamp(path, line_number, meta_timestamp)?;
                        created_at = Some(min_timestamp(created_at, meta_timestamp));
                    }

                    if session_meta_cwd.is_none() {
                        session_meta_cwd =
                            string_pointer(record, "/payload/cwd").map(PathBuf::from);
                    }
                }
                Some("turn_context") => {
                    if turn_context_cwd.is_none() {
                        turn_context_cwd =
                            string_pointer(record, "/payload/cwd").map(PathBuf::from);
                    }
                }
                Some("event_msg") => {
                    if title.is_none()
                        && string_pointer(record, "/payload/type") == Some("user_message")
                    {
                        title =
                            string_pointer(record, "/payload/message").and_then(normalize_title);
                    }
                }
                _ => {}
            }
        }

        let project_path = session_meta_cwd.or(turn_context_cwd);
        let created_at = created_at.or(file_timestamp);
        let source_updated_at = source_updated_at.or(file_timestamp);

        if !saw_session_meta {
            // Missing session_meta is allowed for now; later ingest wiring can surface a warning if needed.
        }

        Ok(ParsedSession {
            tool: Tool::Codex,
            source_session_id,
            source_path: path.to_path_buf(),
            source_fingerprint: fingerprint_bytes(&safe_read.bytes),
            raw_bytes: safe_read.bytes.clone(),
            created_at,
            source_updated_at,
            project_path,
            title,
            has_subagent_sidecars: false,
        })
    }
}

fn read_child_dirs(root: &Path) -> Result<Vec<PathBuf>, AdapterError> {
    let mut directories = Vec::new();
    let entries = fs::read_dir(root).map_err(|source| AdapterError::io(root, source))?;
    for entry in entries {
        let entry = entry.map_err(|source| AdapterError::io(root, source))?;
        let file_type = entry
            .file_type()
            .map_err(|source| AdapterError::io(entry.path(), source))?;
        if file_type.is_dir() {
            directories.push(entry.path());
        }
    }
    directories.sort();
    Ok(directories)
}

fn filename_session_id(path: &Path) -> Result<String, AdapterError> {
    let stem = path
        .file_stem()
        .and_then(|value| value.to_str())
        .ok_or_else(|| AdapterError::invalid(path, "session filename is missing a UTF-8 stem"))?;

    if stem.len() < 36 {
        return Err(AdapterError::invalid(
            path,
            "Codex session filename is too short to contain a session id",
        ));
    }

    let candidate = &stem[stem.len() - 36..];
    Uuid::parse_str(candidate).map_err(|_| {
        AdapterError::invalid(
            path,
            "Codex session filename does not end with a UUID-like session id",
        )
    })?;

    Ok(candidate.to_owned())
}

fn max_timestamp(current: Option<OffsetDateTime>, candidate: OffsetDateTime) -> OffsetDateTime {
    match current {
        Some(current) if current > candidate => current,
        _ => candidate,
    }
}

fn min_timestamp(current: Option<OffsetDateTime>, candidate: OffsetDateTime) -> OffsetDateTime {
    match current {
        Some(current) if current < candidate => current,
        _ => candidate,
    }
}
