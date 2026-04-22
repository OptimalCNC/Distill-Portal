use distill_portal_configuration::BackendConfig;

#[tokio::main]
async fn main() {
    distill_portal_observability::init("distill_portal_backend=info,info");

    let config = match BackendConfig::load() {
        Ok(config) => config,
        Err(error) => {
            eprintln!("{error}");
            std::process::exit(1);
        }
    };

    if let Err(error) = distill_portal_backend::run(config).await {
        eprintln!("{error}");
        std::process::exit(1);
    }
}
