use serde::Serialize;
use serde_json::{Map, Value};
use sha2::{Digest, Sha256};

#[derive(Debug, thiserror::Error)]
pub enum IdempotencyError {
    #[error(transparent)]
    Json(#[from] serde_json::Error),
}

pub fn canonical_params_hash<T: Serialize>(params: &T) -> Result<String, IdempotencyError> {
    let value = serde_json::to_value(params)?;
    let canonical = canonicalize_value(value);
    let bytes = serde_json::to_vec(&canonical)?;
    Ok(sha256_hex(&bytes))
}

pub fn import_sessions_input_version<I, K, F>(source_fingerprints: I) -> String
where
    I: IntoIterator<Item = (K, F)>,
    K: Into<String>,
    F: Into<String>,
{
    let mut keys = Vec::new();
    let mut fingerprints = Vec::new();
    for (key, fingerprint) in source_fingerprints {
        keys.push(key.into());
        fingerprints.push(fingerprint.into());
    }
    keys.sort();
    fingerprints.sort();
    sha256_hex(format!("{}|{}", keys.join("\n"), fingerprints.join("\n")).as_bytes())
}

pub fn rescan_sources_input_version<I, R>(scanner_config_version: &str, roots: I) -> String
where
    I: IntoIterator<Item = R>,
    R: Into<String>,
{
    let mut roots = roots.into_iter().map(Into::into).collect::<Vec<_>>();
    roots.sort();
    sha256_hex(format!("{}|{}", scanner_config_version, roots.join("\n")).as_bytes())
}

pub fn sha256_hex(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn canonicalize_value(value: Value) -> Value {
    match value {
        Value::Array(values) => Value::Array(values.into_iter().map(canonicalize_value).collect()),
        Value::Object(map) => {
            let mut pairs = map.into_iter().collect::<Vec<_>>();
            pairs.sort_by(|left, right| left.0.cmp(&right.0));
            let mut sorted = Map::with_capacity(pairs.len());
            for (key, value) in pairs {
                sorted.insert(key, canonicalize_value(value));
            }
            Value::Object(sorted)
        }
        scalar => scalar,
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::{
        canonical_params_hash, import_sessions_input_version, rescan_sources_input_version,
    };

    #[test]
    fn canonical_params_hash_ignores_object_key_order() {
        let left = json!({
            "session_keys": ["b", "a"],
            "nested": { "z": 1, "a": true }
        });
        let right = json!({
            "nested": { "a": true, "z": 1 },
            "session_keys": ["b", "a"]
        });

        assert_eq!(
            canonical_params_hash(&left).unwrap(),
            canonical_params_hash(&right).unwrap()
        );
    }

    #[test]
    fn canonical_params_hash_preserves_array_order() {
        let left = json!({ "session_keys": ["a", "b"] });
        let right = json!({ "session_keys": ["b", "a"] });

        assert_ne!(
            canonical_params_hash(&left).unwrap(),
            canonical_params_hash(&right).unwrap()
        );
    }

    #[test]
    fn import_input_version_sorts_keys_and_fingerprints() {
        let left = import_sessions_input_version([
            ("codex:two", "fingerprint-b"),
            ("claude_code:one", "fingerprint-a"),
        ]);
        let right = import_sessions_input_version([
            ("claude_code:one", "fingerprint-a"),
            ("codex:two", "fingerprint-b"),
        ]);

        assert_eq!(left, right);
    }

    #[test]
    fn rescan_input_version_sorts_roots_and_includes_scanner_version() {
        let left = rescan_sources_input_version("scanner-v1", ["/z", "/a"]);
        let right = rescan_sources_input_version("scanner-v1", ["/a", "/z"]);
        let changed_version = rescan_sources_input_version("scanner-v2", ["/a", "/z"]);

        assert_eq!(left, right);
        assert_ne!(left, changed_version);
    }
}
