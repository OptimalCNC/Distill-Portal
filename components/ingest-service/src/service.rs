use std::sync::Arc;

use distill_portal_collector_runtime::ParsedSession;
use distill_portal_raw_session_store::{
    BlobStore, LocalFsBlobStore, SqliteStore, StoreError, StoredSessionInput,
};
use thiserror::Error;
use time::OffsetDateTime;
use tracing::warn;

use crate::sha256_hex;

#[derive(Clone, Debug)]
pub struct IngestService {
    store: Arc<SqliteStore>,
    blob_store: Arc<LocalFsBlobStore>,
}

#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "snake_case")]
pub enum IngestDisposition {
    Inserted,
    Unchanged,
    Replaced,
}

#[derive(Clone, Debug, serde::Serialize)]
pub struct IngestOutcome {
    pub disposition: IngestDisposition,
    pub session_uid: String,
}

#[derive(Debug, Error)]
pub enum IngestManyError<E: std::error::Error + 'static> {
    #[error(transparent)]
    Ingest(#[from] IngestError),
    #[error(transparent)]
    Checkpoint(E),
}

#[derive(Debug, Error)]
pub enum IngestError {
    #[error(transparent)]
    Store(#[from] StoreError),
    #[error("parsed session fingerprint does not match raw bytes")]
    FingerprintMismatch,
}

impl IngestService {
    pub fn new(store: Arc<SqliteStore>, blob_store: Arc<LocalFsBlobStore>) -> Self {
        Self { store, blob_store }
    }

    pub fn ingest(&self, parsed: ParsedSession) -> Result<IngestOutcome, IngestError> {
        let content_addr = sha256_hex(&parsed.raw_bytes);
        if content_addr != parsed.source_fingerprint {
            return Err(IngestError::FingerprintMismatch);
        }
        let input = map_stored_session_input(&parsed);

        if let Some(existing) = self
            .store
            .get_session_by_source_key(parsed.tool, &parsed.source_session_id)?
        {
            if existing.source_fingerprint == parsed.source_fingerprint {
                return Ok(IngestOutcome {
                    disposition: IngestDisposition::Unchanged,
                    session_uid: existing.session_uid,
                });
            }

            self.blob_store.put(&content_addr, &parsed.raw_bytes)?;
            let replaced = self.store.replace_session(
                &existing,
                &input,
                &content_addr,
                OffsetDateTime::now_utc(),
            )?;
            if let Some(obsolete_blob) = replaced.obsolete_blob {
                if let Err(error) = self.blob_store.delete(&obsolete_blob) {
                    warn!(%obsolete_blob, ?error, "failed to delete obsolete blob; leaving cleanup to startup sweep");
                }
            }
            return Ok(IngestOutcome {
                disposition: IngestDisposition::Replaced,
                session_uid: replaced.session.session_uid,
            });
        }

        self.blob_store.put(&content_addr, &parsed.raw_bytes)?;
        let created =
            self.store
                .insert_session(&input, &content_addr, OffsetDateTime::now_utc())?;
        Ok(IngestOutcome {
            disposition: IngestDisposition::Inserted,
            session_uid: created.session_uid,
        })
    }

    pub fn ingest_many_with_checkpoint<I, C, E>(
        &self,
        sessions: I,
        mut checkpoint: C,
    ) -> Result<Vec<IngestOutcome>, IngestManyError<E>>
    where
        I: IntoIterator<Item = ParsedSession>,
        C: FnMut() -> Result<(), E>,
        E: std::error::Error + 'static,
    {
        let mut outcomes = Vec::new();
        for session in sessions {
            checkpoint().map_err(IngestManyError::Checkpoint)?;
            outcomes.push(self.ingest(session)?);
        }
        Ok(outcomes)
    }

    pub fn store(&self) -> &Arc<SqliteStore> {
        &self.store
    }

    pub fn blob_store(&self) -> &Arc<LocalFsBlobStore> {
        &self.blob_store
    }
}

fn map_stored_session_input(parsed: &ParsedSession) -> StoredSessionInput {
    // Phase 6 invariant: parsers must emit `title_source` iff they emit
    // `title`. This assertion documents that contract at the only mapping
    // site between `ParsedSession` and `StoredSessionInput`; a parser
    // change that breaks symmetry trips the panic in tests before the
    // mismatch can reach the store.
    debug_assert_eq!(
        parsed.title.is_some(),
        parsed.title_source.is_some(),
        "title and title_source must agree: title={:?}, title_source={:?}",
        parsed.title,
        parsed.title_source,
    );
    StoredSessionInput {
        tool: parsed.tool,
        source_session_id: parsed.source_session_id.clone(),
        source_path: parsed.source_path.clone(),
        source_fingerprint: parsed.source_fingerprint.clone(),
        created_at: parsed.created_at,
        source_updated_at: parsed.source_updated_at,
        project_path: parsed.project_path.clone(),
        title: parsed.title.clone(),
        title_source: parsed.title_source,
        has_subagent_sidecars: parsed.has_subagent_sidecars,
        raw_size_bytes: parsed.raw_bytes.len(),
    }
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use distill_portal_collector_runtime::ParsedSession;
    use distill_portal_ui_api_contracts::{TitleSource, Tool};

    use super::map_stored_session_input;

    fn parsed_session(title: Option<&str>, title_source: Option<TitleSource>) -> ParsedSession {
        ParsedSession {
            tool: Tool::ClaudeCode,
            source_session_id: "session-id".to_string(),
            source_path: PathBuf::from("/tmp/session.jsonl"),
            source_fingerprint: "fingerprint".to_string(),
            raw_bytes: vec![],
            created_at: None,
            source_updated_at: None,
            project_path: None,
            title: title.map(str::to_string),
            title_source,
            has_subagent_sidecars: false,
        }
    }

    #[test]
    fn map_propagates_title_source_when_title_is_present() {
        let parsed = parsed_session(Some("a title"), Some(TitleSource::Custom));
        let mapped = map_stored_session_input(&parsed);
        assert_eq!(mapped.title.as_deref(), Some("a title"));
        assert_eq!(mapped.title_source, Some(TitleSource::Custom));
    }

    #[test]
    fn map_propagates_none_when_no_title() {
        let parsed = parsed_session(None, None);
        let mapped = map_stored_session_input(&parsed);
        assert!(mapped.title.is_none());
        assert!(mapped.title_source.is_none());
    }

    #[test]
    fn map_propagates_first_user_message_variant() {
        let parsed = parsed_session(Some("first prompt"), Some(TitleSource::FirstUserMessage));
        let mapped = map_stored_session_input(&parsed);
        assert_eq!(mapped.title.as_deref(), Some("first prompt"));
        assert_eq!(mapped.title_source, Some(TitleSource::FirstUserMessage));
    }

    #[test]
    fn map_propagates_slug_variant() {
        let parsed = parsed_session(Some("slug-text"), Some(TitleSource::Slug));
        let mapped = map_stored_session_input(&parsed);
        assert_eq!(mapped.title_source, Some(TitleSource::Slug));
    }

    #[test]
    fn map_propagates_generated_variant() {
        // `generated` is reserved by Phase 6 parsers but the mapping layer
        // accepts it so a later phase can populate it without a second
        // contract change.
        let parsed = parsed_session(Some("ai title"), Some(TitleSource::Generated));
        let mapped = map_stored_session_input(&parsed);
        assert_eq!(mapped.title_source, Some(TitleSource::Generated));
    }

    #[test]
    #[should_panic(expected = "title and title_source must agree")]
    fn map_panics_when_invariant_violated_title_but_no_source() {
        let parsed = parsed_session(Some("orphan title"), None);
        let _ = map_stored_session_input(&parsed);
    }

    #[test]
    #[should_panic(expected = "title and title_source must agree")]
    fn map_panics_when_invariant_violated_source_but_no_title() {
        let parsed = parsed_session(None, Some(TitleSource::Custom));
        let _ = map_stored_session_input(&parsed);
    }
}
