# AGENTS

This repo is a Rust workspace for the backend plus reusable components, with a Bun + Vite + React + TypeScript frontend under `apps/frontend`.

## Read First

- `docs/README.md` — task-oriented navigation
- `docs/dependency-rules.md` — ownership boundaries between apps and components
- `docs/dev-commands.md` — how to run and test

## Hard Rules

- Backend owns machine-consumable HTTP routes; do not reintroduce backend-owned end-user HTML.
- Frontend talks to the backend only over HTTP and only consumes generated contract types from `components/ui-api-contracts/bindings/*.ts`.
- `apps/frontend` must not import from `components/collector-runtime`, `components/ingest-service`, or `components/raw-session-store`.
- HTTP payload changes must update `components/ui-api-contracts`, the Rust and TS sides of both apps, and relevant tests together.
- Keep docs aligned with any layout, command, dependency, or payload-shape change.

## Core Checks

```bash
cargo check --workspace
cargo test --workspace
cd apps/frontend && bun run test
```

Full command reference: `docs/dev-commands.md`.
