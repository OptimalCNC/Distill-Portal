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

    pub fn store(&self) -> &Arc<SqliteStore> {
        &self.store
    }

    pub fn blob_store(&self) -> &Arc<LocalFsBlobStore> {
        &self.blob_store
    }
}

fn map_stored_session_input(parsed: &ParsedSession) -> StoredSessionInput {
    StoredSessionInput {
        tool: parsed.tool,
        source_session_id: parsed.source_session_id.clone(),
        source_path: parsed.source_path.clone(),
        source_fingerprint: parsed.source_fingerprint.clone(),
        created_at: parsed.created_at,
        source_updated_at: parsed.source_updated_at,
        project_path: parsed.project_path.clone(),
        title: parsed.title.clone(),
        has_subagent_sidecars: parsed.has_subagent_sidecars,
        raw_size_bytes: parsed.raw_bytes.len(),
    }
}
