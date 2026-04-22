use std::sync::Arc;

use thiserror::Error;
use time::OffsetDateTime;
use tracing::warn;

use crate::{
    ingest::{sha256_hex, ParsedSession},
    store::{BlobStore, LocalFsBlobStore, SqliteStore, StoreError},
};

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
                &parsed,
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
                .insert_session(&parsed, &content_addr, OffsetDateTime::now_utc())?;
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
