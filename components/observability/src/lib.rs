use tracing_subscriber::EnvFilter;

pub fn init(default_filter: &str) {
    let _ = tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| EnvFilter::new(default_filter.to_string())),
        )
        .with_target(false)
        .compact()
        .try_init();
}
