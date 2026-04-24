use std::{env, ffi::OsString, net::SocketAddr, path::PathBuf, time::Duration};

use thiserror::Error;

#[derive(Clone, Debug)]
pub struct BackendConfig {
    pub data_dir: PathBuf,
    pub bind_addr: SocketAddr,
    pub poll_interval: Duration,
    pub claude_roots: Vec<PathBuf>,
    pub codex_roots: Vec<PathBuf>,
}

impl BackendConfig {
    pub fn new(
        data_dir: PathBuf,
        bind_addr: SocketAddr,
        poll_interval: Duration,
        claude_roots: Vec<PathBuf>,
        codex_roots: Vec<PathBuf>,
    ) -> Self {
        Self {
            data_dir,
            bind_addr,
            poll_interval,
            claude_roots,
            codex_roots,
        }
    }

    pub fn load() -> Result<Self, ConfigurationError> {
        let home = dirs::home_dir();
        let bind_addr = read_socket_addr(
            &["DISTILL_PORTAL_BACKEND_BIND", "DISTILL_PORTAL_BIND"],
            "127.0.0.1:4000",
        )?;
        let poll_interval = match env::var("DISTILL_PORTAL_POLL_INTERVAL_SECS") {
            Ok(raw) => {
                let seconds = raw
                    .parse::<u64>()
                    .map_err(|_| ConfigurationError::InvalidPollInterval(raw.clone()))?;
                Duration::from_secs(seconds)
            }
            Err(_) => Duration::from_secs(30),
        };
        let data_dir = env::var_os("DISTILL_PORTAL_DATA_DIR")
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from("./var/distill-portal"));
        let claude_roots = read_path_list("DISTILL_PORTAL_CLAUDE_ROOTS").unwrap_or_else(|| {
            home.as_ref()
                .map(|path| vec![path.join(".claude").join("projects")])
                .unwrap_or_default()
        });
        let codex_roots = read_path_list("DISTILL_PORTAL_CODEX_ROOTS").unwrap_or_else(|| {
            home.as_ref()
                .map(|path| vec![path.join(".codex").join("sessions")])
                .unwrap_or_default()
        });

        Ok(Self::new(
            data_dir,
            bind_addr,
            poll_interval,
            claude_roots,
            codex_roots,
        ))
    }
}

fn read_socket_addr(keys: &[&str], default: &str) -> Result<SocketAddr, ConfigurationError> {
    let raw = keys
        .iter()
        .find_map(|key| env::var(key).ok())
        .unwrap_or_else(|| default.to_string());
    raw.parse()
        .map_err(|_| ConfigurationError::InvalidBindAddr(raw))
}

fn read_path_list(key: &str) -> Option<Vec<PathBuf>> {
    let raw: OsString = env::var_os(key)?;
    let paths = env::split_paths(&raw).collect::<Vec<_>>();
    if paths.is_empty() {
        None
    } else {
        Some(paths)
    }
}

#[derive(Debug, Error)]
pub enum ConfigurationError {
    #[error("invalid bind address: {0}")]
    InvalidBindAddr(String),
    #[error("invalid DISTILL_PORTAL_POLL_INTERVAL_SECS: {0}")]
    InvalidPollInterval(String),
}
