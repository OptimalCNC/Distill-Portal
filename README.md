# Distill Portal

Distill Portal is a local-first portal for collecting, storing, and analyzing coding sessions produced by AI coding tools.

Read [PRD.md](PRD.md) for the product summary and functional requirements.

For developers, please read [docs/README.md](docs/README.md) for documentation on the repository structure, component ownership, features, and development commands.

## Contributing

- Read [PRD.md](PRD.md) for the product summary and functional requirements.
- Read [ARCHITECTURE.md](ARCHITECTURE.md) for the architecture.
- Read [docs/README.md](docs/README.md) for the repository structure, component ownership, features, and development commands.

### Verification

```bash
cargo check --workspace
cargo test --workspace
```

Targeted tests:

```bash
cargo test -p distill-portal-collector-runtime --test parsers
cargo test -p distill-portal-backend --test http_api
cargo test -p distill-portal-e2e --test inspection_surface
```

## Quick Start

Run the backend:

```bash
cargo run -p distill-portal-backend
```

Run the frontend (from `apps/frontend/`):

```bash
bun install
bun run dev
```

Then open the frontend address. By default:

- backend: `http://127.0.0.1:4000`
- frontend (Vite dev server): `http://127.0.0.1:4100`

See `docs/dev-commands.md` for the full list of frontend and test commands.
