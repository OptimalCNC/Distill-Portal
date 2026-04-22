use distill_portal_configuration::FrontendConfig;

#[tokio::main]
async fn main() {
    distill_portal_observability::init("distill_portal_frontend=info,info");

    let config = match FrontendConfig::load() {
        Ok(config) => config,
        Err(error) => {
            eprintln!("{error}");
            std::process::exit(1);
        }
    };

    if let Err(error) = distill_portal_frontend::run(config).await {
        eprintln!("{error}");
        std::process::exit(1);
    }
}
