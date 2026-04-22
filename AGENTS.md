# AGENTS

This repository is a Rust workspace.

Repository shape:

- `apps/backend` owns backend runtime wiring and machine-consumable HTTP routes
- `apps/frontend` owns the inspection page and talks to the backend over HTTP
- `components/ui-api-contracts` owns shared frontend/backend contract types
- `components/*` own reusable internal implementation boundaries
- `docs/*` must stay aligned with any structural or command changes

Working rules:

- Do not reintroduce backend-owned end-user HTML
- Do not make `apps/frontend` depend directly on storage, ingest, or collector crates
- Update `components/ui-api-contracts`, both apps, and relevant tests together when changing HTTP payload shapes
- Keep `docs/README.md`, `docs/dependency-rules.md`, and `docs/dev-commands.md` accurate when layout or commands change
- Keep `progress/phase-2.progress.md` current for durable handoff when doing Phase 2 coordination work

Useful commands:

```bash
cargo check --workspace
cargo test --workspace
cargo test -p distill-portal-backend --test http_api
cargo test -p distill-portal-e2e --test inspection_surface
```
