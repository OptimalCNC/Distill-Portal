# Distill Portal Phase 3: TypeScript + React + Bun Frontend

## Objective

Phase 3 migrates only the frontend from Rust to TypeScript + React + Bun while keeping the Phase 2 backend and component boundaries intact.

The main outcomes are:

- replace the Rust frontend app with a Bun-managed React + TypeScript app
- preserve the current inspection-surface behavior during the migration
- keep the backend as the only owner of machine-consumable HTTP routes and raw-content access
- establish a safe contract-sharing path between the Rust backend and the TypeScript frontend
- add frontend-native build, test, and e2e workflows without expanding the product scope

Phase 3 is a frontend technology migration phase, not a backend rewrite phase.

## Current Problems

The Phase 2 frontend split solved ownership, but the current frontend is still optimized around Rust delivery rather than frontend iteration speed.

Current issues:

- `apps/frontend/src/app.rs` still renders the page through Rust string assembly rather than reusable UI components
- `apps/frontend/src/backend_client.rs` and the HTML form routes in the frontend app mirror backend behavior that a browser client can call directly
- UI changes require Rust edit/compile cycles rather than a frontend-native toolchain
- `components/ui-api-contracts` is Rust-only today, so a TypeScript frontend would otherwise need to duplicate API types by hand
- the current e2e flow in `tests/e2e/tests/inspection_surface.rs` assumes a Rust frontend server and should evolve toward browser-level frontend coverage

## Phase 3 Goals

### 1. Replace the frontend runtime, not the backend

- keep `apps/backend` in Rust
- replace `apps/frontend` with a Bun-managed React + TypeScript app
- keep the frontend responsible for the inspection page, styling, rendering, and interaction flow

### 2. Preserve the Phase 2 architecture boundary

- frontend talks to the backend only over HTTP
- frontend must not depend directly on storage, ingest, or collector crates
- backend continues to own the API routes and raw session download routes
- backend still does not render end-user HTML

### 3. Make the HTTP contract safe across Rust and TypeScript

- `components/ui-api-contracts` remains the backend-side contract source of truth
- Phase 3 adds a generated TypeScript output path for the frontend
- handwritten duplicate frontend contract definitions are not allowed

### 4. Establish a practical frontend toolchain

- Bun is the package manager and task runner
- React + TypeScript own the browser UI
- Vite is the recommended dev/build layer unless a simpler Bun-native option proves equally reliable
- frontend tests and browser e2e live with the frontend app

## Non-Goals

Phase 3 does not include:

- rewriting `apps/backend` in TypeScript or Bun
- changing backend storage, ingest, collector, or raw-session-store internals
- broad backend API redesign beyond minimal contract-stabilization work required for the frontend migration
- a broad feature redesign of the inspection surface
- a large client-state architecture unless the migrated UI proves it necessary
- multi-page frontend routing unless the product scope changes later

## Target Repository Shape

Phase 3 keeps the repository as a Rust workspace for backend and component code, while `apps/frontend` becomes a Bun frontend app.

Recommended target shape:

```text
/
├── Cargo.toml                      # Rust workspace for backend/components/tests
├── Cargo.lock
├── apps/
│   ├── backend/                    # unchanged Rust backend app
│   └── frontend/                   # Bun + React + TypeScript app
│       ├── package.json
│       ├── bun.lock
│       ├── tsconfig.json
│       ├── vite.config.ts
│       ├── index.html
│       ├── src/
│       │   ├── main.tsx
│       │   ├── App.tsx
│       │   ├── components/
│       │   ├── features/
│       │   ├── lib/
│       │   │   ├── api.ts
│       │   │   ├── config.ts
│       │   │   └── contracts.ts
│       │   └── styles/
│       ├── public/
│       └── tests/
│           ├── unit/
│           └── e2e/
├── components/
│   └── ui-api-contracts/           # Rust contract source + TS generation hook
├── tests/
│   └── e2e/                        # Rust backend integration tests that still make sense
└── working/
    ├── phase-1.md
    ├── phase-2.md
    └── phase-3.md
```

The exact frontend subfolder names may vary slightly, but these rules must remain true:

- `apps/backend` stays a Rust app
- `apps/frontend` is no longer a Cargo crate
- the frontend remains independent from backend internals
- the repo still has one clear `apps/frontend` ownership path for the inspection UI

## Current Codebase Mapping

Current Rust frontend files should map roughly as follows:

- `apps/frontend/src/main.rs` -> `apps/frontend/src/main.tsx`
- `apps/frontend/src/app.rs` -> `apps/frontend/src/App.tsx` plus feature components
- `apps/frontend/src/backend_client.rs` -> `apps/frontend/src/lib/api.ts`
- `apps/frontend/Cargo.toml` -> `apps/frontend/package.json`

Contract ownership should map as follows:

- `components/ui-api-contracts/src/lib.rs` stays the canonical Rust contract definition
- generated TypeScript contracts are consumed from the frontend app
- `apps/backend/src/http_api.rs` remains the owner of backend route behavior

Testing should move as follows:

- backend API contract tests remain in Rust where appropriate
- frontend browser behavior moves into frontend-native tests and browser e2e
- Rust tests that assume a Rust frontend server should be rewritten or retired once equivalent browser coverage exists

## Frontend / Backend Boundary Rules

Phase 3 must enforce these rules:

- browser UI calls backend HTTP endpoints through one typed frontend API layer
- frontend does not reimplement backend business logic
- frontend does not create a second handwritten app-layer copy of backend routes just to proxy requests
- dev-time proxying belongs in `vite.config.ts` or equivalent tooling config, not in application logic
- raw session download continues to use the backend-owned raw-content route
- if an API payload changes, update `components/ui-api-contracts`, generated TypeScript types, backend code, frontend client code, frontend UI, and relevant tests together

Dependency direction should look like this:

```text
apps/frontend -> generated contracts from components/ui-api-contracts
apps/frontend -> backend HTTP endpoints only

apps/backend  -> components/*
apps/backend  -> components/ui-api-contracts

components/ui-api-contracts -> no frontend app dependency
components/raw-session-store -> no frontend dependency
components/ingest-service -> no frontend dependency
components/collector-runtime -> no frontend dependency
```

## Contract Strategy

Phase 3 needs a single-source contract workflow for Rust and TypeScript.

Preferred approach:

1. Keep the Rust structs and enums in `components/ui-api-contracts` as the source of truth.
2. Generate TypeScript types from that Rust contract definition into the frontend app.
3. Add verification so generated TypeScript output cannot silently go stale.

Requirements:

- enums such as `Tool` and `SessionSyncStatus` map cleanly into TypeScript
- current inspection-surface request and response types are generated, not copied by hand
- generation output is deterministic
- local verification fails if generated contract files are stale

Pragmatic candidate tools:

- `ts-rs` if derive-driven TypeScript generation is enough
- `typeshare` if broader cross-language generation is cleaner

Implementation should choose one codegen path, not multiple competing ones.

## Delivery Decisions

Phase 3 should keep delivery simple.

Recommended decisions:

- use a single-page React app without introducing a router library yet
- default local development to backend on `127.0.0.1:4000` and frontend dev server on `127.0.0.1:4100`
- use a dev-time proxy so browser code can call `/api/v1/**` without ad hoc CORS workarounds
- build the frontend into static assets under `apps/frontend/dist`
- use a tiny Bun-based preview or static-serve command for manual testing if needed, but do not move frontend serving back into the Rust backend

The current Rust-only `/rescan` and `/import` form-post routes should disappear. In Phase 3, those become browser actions that call backend APIs directly.

## UI Migration Scope

The migrated frontend must preserve the current inspection workflow:

- render the inspection page at the frontend root
- list discovered source sessions
- trigger a rescan
- allow the user to select source sessions and save them
- list stored sessions with freshness status
- expose raw session download links
- display persisted scan errors

Out of scope for this phase:

- new product pages
- large visual redesign unrelated to the migration
- client-side search, summaries, tags, or distill features

## Documentation Deliverables

Phase 3 must update the docs that describe ownership and commands.

Minimum required documentation changes:

### 1. `docs/README.md`

Must describe:

- that the frontend now lives in a Bun + React + TypeScript app
- that the backend remains Rust
- where frontend tests and commands now live

### 2. `docs/dependency-rules.md`

Must describe:

- the TypeScript frontend boundary
- that generated contract types come from `components/ui-api-contracts`
- that the frontend still must not reach into backend internals directly

### 3. `docs/dev-commands.md`

Must describe:

- `bun install`
- `bun run dev`
- `bun run build`
- `bun run test`
- frontend browser e2e commands
- the Rust backend and workspace commands that still apply

### 4. `docs/features/inspection-surface.md`

Must describe:

- the new frontend file ownership
- the backend endpoints still involved
- the tests covering the migrated inspection flow

### 5. `docs/playbooks/modify-frontend-page.md`

Must describe:

- where the React page code lives
- how to update generated contract types when API shapes change
- which backend files must stay aligned

### 6. `components/ui-api-contracts/README.md`

Must describe:

- how Rust contract definitions generate TypeScript output
- how to verify or refresh the generated types

## Migration Plan

Phase 3 should be implemented in small, reviewable chunks.

### Milestone 1: Contract Stabilization and Tooling Choice

Choose the Rust-to-TypeScript contract generation path and make it verifiable before the UI migration begins.

Definition of done:

- one codegen path is selected
- current inspection-surface payloads generate usable TypeScript types
- stale generated files are detectable in verification
- backend API behavior remains unchanged

### Milestone 2: Bun Frontend Skeleton

Replace the Rust frontend crate with a minimal Bun + React + TypeScript app shell.

Definition of done:

- `apps/frontend` has Bun, React, and TypeScript scaffolding
- local dev server configuration exists
- build output works
- one typed API client layer exists
- the app shell loads and can reach the backend

### Milestone 3: Inspection Surface Port

Port the current inspection UI behavior into React components.

Definition of done:

- the inspection page renders from React
- source sessions, stored sessions, and scan errors display correctly
- rescan and import flows work through browser API calls
- raw download links still work
- no Rust HTML rendering remains

### Milestone 4: Frontend Test Migration

Move user-facing frontend verification into frontend-native tests.

Definition of done:

- frontend unit tests cover key UI and data-formatting behavior
- browser e2e covers the inspection workflow against the Rust backend
- Rust tests that only existed to drive the old Rust frontend are removed or reduced

### Milestone 5: Cleanup and Documentation

Remove obsolete Rust frontend structure and align repository docs.

Definition of done:

- Cargo workspace no longer references a Rust frontend crate
- obsolete Rust frontend files are removed
- docs match the new toolchain and ownership rules
- final verification commands are documented and runnable

## Acceptance Criteria

Phase 3 is complete when all of the following are true:

- `apps/frontend` is a Bun-managed React + TypeScript app
- the backend remains a Rust app and still does not render end-user HTML
- the frontend does not depend directly on storage, ingest, or collector crates
- the inspection surface still lets a user:
  - open the page
  - list discovered sessions
  - rescan
  - select sessions to save
  - view stored metadata and freshness status
  - download raw session content
  - inspect scan errors
- TypeScript contract types are generated from a single backend-owned source rather than copied manually
- frontend build, test, and e2e commands run under Bun
- Rust backend tests and workspace checks still pass
- repository docs accurately describe the new frontend toolchain and file ownership

## Risks

- Rust and TypeScript contract drift can break the UI silently if codegen is weak
- switching from a Rust frontend proxy layer to browser requests can introduce base-URL or proxy confusion
- raw download and import flows can regress if only API-level tests exist
- introducing too much frontend framework or state-management machinery can slow the migration and obscure the actual goal

## Mitigations

- require generated TypeScript contracts from the Rust source of truth
- keep the frontend data layer small and explicit
- use dev proxy configuration instead of application-level proxy handlers
- add browser e2e coverage before deleting the old frontend path completely
- preserve current backend endpoint shapes until the React frontend is stable

## Recommended Next Step

Start with Milestone 1 only:

- choose the Rust-to-TypeScript contract generation tool
- generate TypeScript types for the current inspection-surface payloads
- define the frontend dev proxy and environment strategy
- do not begin the full UI port until the cross-language contract boundary is reliable
