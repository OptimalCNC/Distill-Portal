# Distill Portal Docs

Start here when you need to orient yourself in the Distill Portal workspace. The backend is Rust under `apps/backend`; the frontend is Bun + Vite + React + TypeScript under `apps/frontend`.

This file is both the docs entry point and the repo map.

## Start With Your Task

| I want to... | Start here |
| --- | --- |
| Modify the inspection UI | [`playbooks/modify-frontend-page.md`](playbooks/modify-frontend-page.md), [`../apps/frontend/README.md`](../apps/frontend/README.md) |
| Change a backend API or JSON payload | [`playbooks/modify-backend-api.md`](playbooks/modify-backend-api.md), [`dependency-rules.md`](dependency-rules.md) |
| Change session storage behavior | [`playbooks/modify-session-store.md`](playbooks/modify-session-store.md) |
| Run or test locally | [`dev-commands.md`](dev-commands.md) |
| Check dependency boundaries | [`dependency-rules.md`](dependency-rules.md) |
| Understand a feature | [`features/inspection-surface.md`](features/inspection-surface.md), [`features/session-store.md`](features/session-store.md) |
| Understand product + architecture intent | [`../PRD.md`](../PRD.md), [`../ARCHITECTURE.md`](../ARCHITECTURE.md) |
| Audit historical planning or delivery | [`../working/README.md`](../working/README.md), [`../progress/README.md`](../progress/README.md) |

## Apps

- `apps/backend` — Rust backend binary: runtime wiring, scan/ingest/store orchestration, machine-consumable HTTP routes. See [`../apps/backend/README.md`](../apps/backend/README.md).
- `apps/frontend` — Bun + Vite + React + TypeScript inspection UI. The unified session list (table, filters, view, drawer body, merge / filter / sort / paginate / persistence helpers) lives under `apps/frontend/src/features/sessions/`; shared React primitives (action bar, scan-errors callout, native-`<dialog>`-backed drawer shell, pagination strip, toast) live under `apps/frontend/src/components/`. CSS is co-located: each `.tsx`/`.ts` imports its sibling `.css` (no CSS Modules, no CSS-in-JS, no Tailwind); `src/styles/` carries only the three global sheets `reset.css`, `tokens.css`, `global.css`. See [`../apps/frontend/README.md`](../apps/frontend/README.md).

## Components

Reusable, app-independent crates. Each owns its own README:

- [`collector-runtime`](../components/collector-runtime/README.md) — source discovery, safe JSONL reads, tool-specific parsers (Claude Code, Codex)
- [`configuration`](../components/configuration/README.md) — backend runtime config loading
- [`ingest-service`](../components/ingest-service/README.md) — content-addressed ingest decisions, replace-on-sync
- [`observability`](../components/observability/README.md) — tracing subscriber bootstrap
- [`raw-session-store`](../components/raw-session-store/README.md) — SQLite metadata + blob-store persistence
- [`ui-api-contracts`](../components/ui-api-contracts/README.md) — shared HTTP payload types; source of truth for the Rust → TS bindings

## Feature Guides

- [`features/inspection-surface.md`](features/inspection-surface.md) — page ownership, API touchpoints, and tests for the inspection workflow
- [`features/session-store.md`](features/session-store.md) — storage ownership, backend touchpoints, and tests for persisted session behavior

## Playbooks

Short recipes for common changes:

- [`playbooks/modify-frontend-page.md`](playbooks/modify-frontend-page.md) — shortest safe path for UI changes
- [`playbooks/modify-backend-api.md`](playbooks/modify-backend-api.md) — shortest safe path for backend API changes
- [`playbooks/modify-session-store.md`](playbooks/modify-session-store.md) — shortest safe path for storage changes

## Verification Map

| Surface | Command |
| --- | --- |
| Workspace compile | `cargo check --workspace` |
| Full Rust test suite | `cargo test --workspace` |
| Backend HTTP API | `cargo test -p distill-portal-backend --test http_api` |
| Collector parsers | `cargo test -p distill-portal-collector-runtime --test parsers` |
| Typed Rust-client HTTP smoke | `cargo test -p distill-portal-e2e --test inspection_surface` |
| TypeScript contract bindings freshness | `cargo test -p distill-portal-ui-api-contracts --features ts-bindings` |
| Frontend unit tests | `bun run test` (from `apps/frontend/`) |
| Browser e2e (Playwright) | `bun run test:e2e` (from `apps/frontend/`) |

## Repo Map

- `apps/backend` — backend binary and its tests
- `apps/frontend` — Bun/React frontend
- `components/*` — reusable implementation crates
- `docs/` — this tree (dependency rules, commands, features, playbooks)
- `tests/e2e` — real HTTP-boundary Rust integration tests
- `tests/fixtures` — sample Claude Code and Codex sessions used by parser and backend tests
- `working/` — historical planning specs for completed phases (see [`../working/README.md`](../working/README.md))
- `progress/` — historical delivery logs for completed phases (see [`../progress/README.md`](../progress/README.md))

## Historical Material

- [`../working/`](../working/) — frozen planning specs. Not current-state instructions. See [`working/README.md`](../working/README.md).
- [`../progress/`](../progress/) — frozen delivery logs. Not current-state instructions. See [`progress/README.md`](../progress/README.md).
