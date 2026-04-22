use std::{collections::HashSet, io, path::PathBuf};

use thiserror::Error;

#[derive(Clone, Debug, serde::Serialize)]
pub struct BlobStat {
    pub content_addr: String,
    pub size_bytes: u64,
    pub created: bool,
}

pub trait BlobStore {
    fn put(&self, content_addr: &str, bytes: &[u8]) -> Result<BlobStat, StoreError>;
    fn get(&self, content_addr: &str) -> Result<Vec<u8>, StoreError>;
    fn delete(&self, content_addr: &str) -> Result<(), StoreError>;
    fn list_content_addrs(&self) -> Result<HashSet<String>, StoreError>;
    fn sweep_temp_files(&self) -> Result<Vec<PathBuf>, StoreError>;
    fn delete_orphan_blobs(&self, referenced: &HashSet<String>) -> Result<Vec<String>, StoreError>;
}

#[derive(Debug, Error)]
pub enum StoreError {
    #[error(transparent)]
    Io(#[from] io::Error),
    #[error(transparent)]
    Sqlite(#[from] rusqlite::Error),
    #[error("lock poisoned")]
    LockPoisoned,
    #[error("session not found: {0}")]
    SessionNotFound(String),
    #[error("invalid content address: {0}")]
    InvalidContentAddr(String),
}
