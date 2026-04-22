use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| EnvFilter::new("distill_portal=info,info")),
        )
        .with_target(false)
        .compact()
        .init();

    if let Err(error) = distill_portal::app::run().await {
        eprintln!("{error}");
        std::process::exit(1);
    }
}
