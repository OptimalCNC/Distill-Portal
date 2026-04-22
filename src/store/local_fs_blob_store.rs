use std::{
    collections::HashSet,
    fs::{self, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
};

use uuid::Uuid;
use walkdir::WalkDir;

use crate::store::blob_store::{BlobStat, BlobStore, StoreError};

#[derive(Clone, Debug)]
pub struct LocalFsBlobStore {
    root: PathBuf,
}

impl LocalFsBlobStore {
    pub fn new(root: PathBuf) -> Result<Self, StoreError> {
        ensure_dir_permissions(&root)?;
        Ok(Self { root })
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    fn blob_path(&self, content_addr: &str) -> Result<PathBuf, StoreError> {
        validate_content_addr(content_addr)?;
        Ok(self
            .root
            .join(&content_addr[0..2])
            .join(&content_addr[2..4])
            .join(content_addr))
    }
}

impl BlobStore for LocalFsBlobStore {
    fn put(&self, content_addr: &str, bytes: &[u8]) -> Result<BlobStat, StoreError> {
        let final_path = self.blob_path(content_addr)?;
        if final_path.exists() {
            return Ok(BlobStat {
                content_addr: content_addr.to_string(),
                size_bytes: bytes.len() as u64,
                created: false,
            });
        }

        let parent = final_path
            .parent()
            .ok_or_else(|| StoreError::InvalidContentAddr(content_addr.to_string()))?;
        ensure_dir_permissions(parent)?;

        let temp_path = parent.join(format!(".tmp-{}.blob", Uuid::new_v4()));
        let mut file = create_private_file(&temp_path)?;
        file.write_all(bytes)?;
        file.sync_all()?;

        if final_path.exists() {
            let _ = fs::remove_file(&temp_path);
            return Ok(BlobStat {
                content_addr: content_addr.to_string(),
                size_bytes: bytes.len() as u64,
                created: false,
            });
        }

        fs::rename(&temp_path, &final_path)?;
        set_file_permissions(&final_path)?;

        Ok(BlobStat {
            content_addr: content_addr.to_string(),
            size_bytes: bytes.len() as u64,
            created: true,
        })
    }

    fn get(&self, content_addr: &str) -> Result<Vec<u8>, StoreError> {
        Ok(fs::read(self.blob_path(content_addr)?)?)
    }

    fn delete(&self, content_addr: &str) -> Result<(), StoreError> {
        let path = self.blob_path(content_addr)?;
        match fs::remove_file(&path) {
            Ok(()) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(error.into()),
        }
        Ok(())
    }

    fn list_content_addrs(&self) -> Result<HashSet<String>, StoreError> {
        let mut addrs = HashSet::new();
        if !self.root.exists() {
            return Ok(addrs);
        }

        for entry in WalkDir::new(&self.root) {
            let entry = match entry {
                Ok(entry) => entry,
                Err(error) => {
                    return Err(std::io::Error::new(std::io::ErrorKind::Other, error).into())
                }
            };
            if !entry.file_type().is_file() {
                continue;
            }
            let name = entry.file_name().to_string_lossy();
            if name.starts_with(".tmp-") {
                continue;
            }
            if name.len() == 64 {
                addrs.insert(name.to_string());
            }
        }
        Ok(addrs)
    }

    fn sweep_temp_files(&self) -> Result<Vec<PathBuf>, StoreError> {
        let mut deleted = Vec::new();
        if !self.root.exists() {
            return Ok(deleted);
        }

        for entry in WalkDir::new(&self.root) {
            let entry = match entry {
                Ok(entry) => entry,
                Err(error) => {
                    return Err(std::io::Error::new(std::io::ErrorKind::Other, error).into())
                }
            };
            if entry.file_type().is_file()
                && entry.file_name().to_string_lossy().starts_with(".tmp-")
            {
                fs::remove_file(entry.path())?;
                deleted.push(entry.into_path());
            }
        }

        Ok(deleted)
    }

    fn delete_orphan_blobs(&self, referenced: &HashSet<String>) -> Result<Vec<String>, StoreError> {
        let mut deleted = Vec::new();
        for content_addr in self.list_content_addrs()? {
            if !referenced.contains(&content_addr) {
                self.delete(&content_addr)?;
                deleted.push(content_addr);
            }
        }
        Ok(deleted)
    }
}

#[cfg(unix)]
fn ensure_dir_permissions(path: &Path) -> Result<(), StoreError> {
    use std::os::unix::fs::{DirBuilderExt, PermissionsExt};

    std::fs::DirBuilder::new()
        .recursive(true)
        .mode(0o700)
        .create(path)?;
    fs::set_permissions(path, fs::Permissions::from_mode(0o700))?;
    Ok(())
}

#[cfg(not(unix))]
fn ensure_dir_permissions(path: &Path) -> Result<(), StoreError> {
    std::fs::create_dir_all(path)?;
    Ok(())
}

#[cfg(unix)]
fn create_private_file(path: &Path) -> Result<std::fs::File, StoreError> {
    use std::os::unix::fs::OpenOptionsExt;

    Ok(OpenOptions::new()
        .create_new(true)
        .write(true)
        .mode(0o600)
        .open(path)?)
}

#[cfg(not(unix))]
fn create_private_file(path: &Path) -> Result<std::fs::File, StoreError> {
    Ok(OpenOptions::new().create_new(true).write(true).open(path)?)
}

#[cfg(unix)]
fn set_file_permissions(path: &Path) -> Result<(), StoreError> {
    use std::os::unix::fs::PermissionsExt;

    fs::set_permissions(path, fs::Permissions::from_mode(0o600))?;
    Ok(())
}

#[cfg(not(unix))]
fn set_file_permissions(_path: &Path) -> Result<(), StoreError> {
    Ok(())
}

fn validate_content_addr(content_addr: &str) -> Result<(), StoreError> {
    if content_addr.len() == 64 && content_addr.chars().all(|ch| ch.is_ascii_hexdigit()) {
        Ok(())
    } else {
        Err(StoreError::InvalidContentAddr(content_addr.to_string()))
    }
}

#[cfg(test)]
mod tests {
    use tempfile::tempdir;

    use super::*;

    #[test]
    fn blob_writes_are_content_addressed() {
        let tempdir = tempdir().unwrap();
        let store = LocalFsBlobStore::new(tempdir.path().join("blobs")).unwrap();
        let addr = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
        let bytes = b"hello world\n";

        let first = store.put(addr, bytes).unwrap();
        let second = store.put(addr, bytes).unwrap();
        let final_path = store.root().join("01").join("23").join(addr);

        assert!(first.created);
        assert!(!second.created);
        assert_eq!(store.get(addr).unwrap(), bytes);
        assert!(final_path.exists());
    }
}
