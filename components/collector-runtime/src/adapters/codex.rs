use std::{
    ffi::OsStr,
    fs,
    path::{Path, PathBuf},
};

use distill_portal_ui_api_contracts::{TitleSource, Tool};
use serde_json::Value;
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

        let mut source_updated_at = None;
        let mut primary_meta = None;
        let mut has_embedded_parent_meta = false;

        for (index, record) in records.iter().enumerate() {
            let line_number = index + 1;

            if let Some(timestamp) = string_field(record, "timestamp") {
                let timestamp = parse_rfc3339_timestamp(path, line_number, timestamp)?;
                source_updated_at = Some(max_timestamp(source_updated_at, timestamp));
            }

            if string_field(record, "type") != Some("session_meta") {
                continue;
            }

            let Some(meta) = &primary_meta else {
                let meta = primary_session_meta(path, line_number, record, &source_session_id)?;
                primary_meta = Some(meta);
                continue;
            };

            if let Some(meta_id) = string_pointer(record, "/payload/id") {
                if meta_id == source_session_id {
                    continue;
                }

                if is_known_parent_id(meta, meta_id) {
                    has_embedded_parent_meta = true;
                    continue;
                }

                return Err(AdapterError::invalid(
                    path,
                    format!(
                        "line {line_number} has session_meta.payload.id {meta_id} but filename id is {source_session_id} and it is not a known parent session id"
                    ),
                ));
            }
        }

        let primary_body_start = if has_embedded_parent_meta {
            primary_meta
                .as_ref()
                .and_then(|meta| meta.timestamp)
                .and_then(|timestamp| primary_body_start_index(&records, timestamp))
        } else {
            Some(0)
        };

        let mut primary_body_created_at = None;
        let mut title = None;
        let mut turn_context_cwd = None;

        if let Some(start_index) = primary_body_start {
            for (index, record) in records.iter().enumerate().skip(start_index) {
                let line_number = index + 1;

                if let Some(timestamp) = string_field(record, "timestamp") {
                    let timestamp = parse_rfc3339_timestamp(path, line_number, timestamp)?;
                    primary_body_created_at =
                        Some(min_timestamp(primary_body_created_at, timestamp));
                }

                match string_field(record, "type") {
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
                            title = string_pointer(record, "/payload/message")
                                .and_then(normalize_title);
                        }
                    }
                    _ => {}
                }
            }
        }

        let project_path = primary_meta
            .as_ref()
            .and_then(|meta| meta.cwd.clone())
            .or(turn_context_cwd);
        let created_at = primary_meta
            .as_ref()
            .and_then(|meta| meta.timestamp)
            .or(primary_body_created_at)
            .or(file_timestamp);
        let source_updated_at = source_updated_at.or(file_timestamp);

        // Phase 6: Codex has only one title path (the first `event_msg` with
        // `payload.type == "user_message"`), so `title_source` is
        // `Some(FirstUserMessage)` iff `title.is_some()` — preserving the
        // contract invariant enforced by the ingest layer.
        let title_source = title.as_ref().map(|_| TitleSource::FirstUserMessage);

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
            title_source,
            has_subagent_sidecars: false,
        })
    }
}

#[derive(Clone, Debug)]
struct PrimarySessionMeta {
    timestamp: Option<OffsetDateTime>,
    cwd: Option<PathBuf>,
    parent_ids: Vec<String>,
}

fn primary_session_meta(
    path: &Path,
    line_number: usize,
    record: &Value,
    source_session_id: &str,
) -> Result<PrimarySessionMeta, AdapterError> {
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

    let timestamp = string_pointer(record, "/payload/timestamp")
        .map(|timestamp| parse_rfc3339_timestamp(path, line_number, timestamp))
        .transpose()?;
    let cwd = string_pointer(record, "/payload/cwd").map(PathBuf::from);
    let mut parent_ids = Vec::new();
    push_parent_id(
        &mut parent_ids,
        string_pointer(record, "/payload/forked_from_id"),
    );
    push_parent_id(
        &mut parent_ids,
        string_pointer(
            record,
            "/payload/source/subagent/thread_spawn/parent_thread_id",
        ),
    );

    Ok(PrimarySessionMeta {
        timestamp,
        cwd,
        parent_ids,
    })
}

fn push_parent_id(parent_ids: &mut Vec<String>, parent_id: Option<&str>) {
    if let Some(parent_id) = parent_id {
        if !parent_ids.iter().any(|known| known == parent_id) {
            parent_ids.push(parent_id.to_owned());
        }
    }
}

fn is_known_parent_id(meta: &PrimarySessionMeta, candidate: &str) -> bool {
    meta.parent_ids
        .iter()
        .any(|parent_id| parent_id == candidate)
}

fn primary_body_start_index(records: &[Value], primary_timestamp: OffsetDateTime) -> Option<usize> {
    let threshold = primary_timestamp.unix_timestamp().saturating_sub(1);

    records.iter().enumerate().find_map(|(index, record)| {
        if string_field(record, "type") != Some("event_msg")
            || string_pointer(record, "/payload/type") != Some("task_started")
        {
            return None;
        }

        let started_at = record.pointer("/payload/started_at")?.as_i64()?;
        if started_at >= threshold {
            Some(index)
        } else {
            None
        }
    })
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
