# Distill Portal Docs

Start here when you need to orient yourself in the Phase 2 workspace.

This file is both the docs entry point and the practical repo map.

## Repo Map

### Top-Level Layout

- `apps/backend`: backend service binary and library; owns scanning orchestration, ingest wiring, storage wiring, and machine-consumable HTTP routes
- `apps/frontend`: frontend service binary and library; owns the inspection page, proxy routes, and backend HTTP client
- `components/collector-runtime`: source discovery, safe JSONL reads, and tool-specific adapters
- `components/configuration`: backend and frontend runtime config loading
- `components/ingest-service`: content-addressed ingest decisions and replace-on-sync behavior
- `components/observability`: tracing subscriber bootstrap
- `components/raw-session-store`: SQLite metadata and blob-store persistence
- `components/ui-api-contracts`: shared HTTP payload types and cross-app contract enums
- `docs`: developer-facing dependency rules, commands, feature notes, and playbooks
- `tests/e2e`: real frontend/backend HTTP-boundary integration tests
- `tests/fixtures`: sample Claude Code and Codex sessions used by parser and backend tests
- `working`: implementation plans and accepted architecture targets
- `progress`: durable execution logs for multi-session implementation work

### Frontend And Backend

- Frontend crate: `apps/frontend`
  - entrypoints: `src/main.rs`, `src/app.rs`
  - backend client: `src/backend_client.rs`
- Backend crate: `apps/backend`
  - entrypoints: `src/main.rs`, `src/app.rs`
  - JSON and raw-content routes: `src/http_api.rs`

### Implemented Architecture Components

- Collector runtime: `components/collector-runtime`
- Ingest service: `components/ingest-service`
- Raw session store: `components/raw-session-store`
- Configuration: `components/configuration`
- UI / API contracts: `components/ui-api-contracts`
- Observability: `components/observability`

### Tests

- Backend API behavior: `apps/backend/tests/http_api.rs`
- Collector parsing behavior: `components/collector-runtime/tests/parsers.rs`
- Frontend/backend integration: `tests/e2e/tests/inspection_surface.rs`

## Other Docs

- `dependency-rules.md`: allowed and forbidden dependency directions between apps and components
- `dev-commands.md`: how to run backend and frontend separately, together, and under verification
- `features/inspection-surface.md`: page ownership, API touchpoints, and tests for the inspection workflow
- `features/session-store.md`: storage ownership, backend touchpoints, and tests for persisted session behavior
- `playbooks/modify-frontend-page.md`: shortest safe path for UI changes
- `playbooks/modify-backend-api.md`: shortest safe path for backend API changes
- `playbooks/modify-session-store.md`: shortest safe path for storage changes

Component ownership docs live beside the code:

- `components/collector-runtime/README.md`
- `components/configuration/README.md`
- `components/ingest-service/README.md`
- `components/observability/README.md`
- `components/raw-session-store/README.md`
- `components/ui-api-contracts/README.md`
