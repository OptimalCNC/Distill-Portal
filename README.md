# Distill Portal

Distill Portal is a local-first portal for collecting, storing, and analyzing coding sessions produced by AI coding tools.

Read [PRD.md](PRD.md) for the product summary and functional requirements.

For developers, please read [docs/README.md](docs/README.md) for documentation on the repository structure, component ownership, features, and development commands.

## Contributing

- Read [PRD.md](PRD.md) for the product summary and functional requirements.
- Read [ARCHITECTURE.md](ARCHITECTURE.md) for the architecture.
- Read [docs/README.md](docs/README.md) for the repository structure, component ownership, features, and development commands.

### Hard Rules

- Backend owns machine-consumable HTTP routes; do not reintroduce backend-owned end-user HTML.
- Frontend talks to the backend only over HTTP and only consumes generated contract types from `components/ui-api-contracts/bindings/*.ts`.
- `apps/frontend` must not import from `components/collector-runtime`, `components/ingest-service`, or `components/raw-session-store`.
- HTTP payload changes must update `components/ui-api-contracts`, the Rust and TS sides of both apps, and relevant tests together.
- Keep docs aligned with any layout, command, dependency, or payload-shape change.

### Quick Checks

Fast checks to run before committing:

```bash
cargo check --workspace
cargo test --workspace
```

From `apps/frontend/`:

```bash
bun run test
```

See [docs/dev-commands.md](docs/dev-commands.md) for the full reference, including targeted Rust suites, the TypeScript contract-drift check, and the browser e2e suite.

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
