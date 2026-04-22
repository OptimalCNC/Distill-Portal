use std::{fs, io, path::Path};

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SafeRead {
    pub bytes: Vec<u8>,
}

impl SafeRead {
    pub fn line_count(&self) -> usize {
        self.bytes.iter().filter(|byte| **byte == b'\n').count()
    }
}

pub fn safe_read_jsonl_bytes(bytes: &[u8]) -> Option<SafeRead> {
    let last_newline = bytes.iter().rposition(|byte| *byte == b'\n')?;
    Some(SafeRead {
        bytes: bytes[..=last_newline].to_vec(),
    })
}

pub fn read_jsonl_file(path: &Path) -> Result<Option<SafeRead>, io::Error> {
    let bytes = fs::read(path)?;
    Ok(safe_read_jsonl_bytes(&bytes))
}
