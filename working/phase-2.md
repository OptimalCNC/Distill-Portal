# Distill Portal Phase 2: Workspace Split and Developer-First Architecture

## Objective

Phase 2 refactors the current Phase 1 implementation into a clearer long-term codebase without expanding product scope.

The main outcome is architectural clarity:

- separate frontend and backend into different Rust projects
- group implemented code by explicit architecture component boundaries
- add developer-facing documentation that explains structure, ownership, and change paths without requiring code archaeology
- preserve current Phase 1 user-visible behavior while making later phases easier to implement safely

Phase 2 is an architecture and documentation phase, not a feature-expansion phase.

## Current Problems

The current Phase 1 implementation works, but its structure is still optimized for speed of delivery rather than long-term maintainability.

Current issues:

- the frontend and backend are not truly separate; the HTML page is rendered inline inside the backend route layer
- one Rust crate owns API routes, orchestration, source inventory logic, and page rendering at the same time
- the implemented component boundaries are logical, but not explicit in the repo structure
- architecture terms in `ARCHITECTURE.md` are broader and more stable than the current file layout
- there is no developer-facing repo map or feature-to-files guide
- future developers would still need to read a large amount of code to answer basic questions such as:
  - where does frontend code live?
  - where should session-store behavior change?
  - what files define the source-session inventory flow?
  - what files are safe to modify for a given feature?

## Phase 2 Goals

### 1. Frontend / Backend Separation

The frontend and backend must become separate Rust projects under different folders.

Phase 2 target:

- `apps/backend` is the backend service
  - owns machine-consumable HTTP APIs and raw-content download endpoints
  - owns application orchestration
  - owns storage, ingest, and scanning runtime wiring
  - does not render end-user HTML
- `apps/frontend` is the frontend web application
  - owns HTML, CSS, UI handlers, page composition, and user interaction flow
  - consumes backend APIs through a typed client or a shared contract crate
  - does not directly access backend storage code

Decision for Phase 2:

- keep both frontend and backend in Rust
- frontend should be a separate Rust web app rather than inline HTML inside the backend
- prefer a simple Rust frontend approach that improves separation first; Phase 2 does not need to introduce a large WASM/SPA framework unless later requirements justify it

### 2. Explicit Component Grouping

Code should be grouped using the architecture vocabulary from `ARCHITECTURE.md`, not only by implementation accident.

Phase 2 must make implemented components explicit in the repo layout.

Implemented component groups in scope for Phase 2:

- collector runtime
- ingest service
- raw session store
- configuration
- UI / API contracts
- observability / shared runtime support

Not-yet-implemented architecture components should be represented in documentation, but Phase 2 should not create empty Rust crates for every future component unless there is real code to place there.

### 3. Developer-First Documentation

Phase 2 must generate documentation that answers practical developer questions quickly.

Documentation must make it easy to answer:

- what this repository contains
- what each top-level folder is for
- which files own a given feature
- which files to read before changing a given subsystem
- which files must stay aligned when a feature changes
- what dependency direction is allowed between components
- how to run, test, and verify frontend and backend separately

Documentation is successful only if a developer can locate the right files and edit boundaries without first reading broad sections of the codebase.

### 4. Additional Phase 2 Goals

Other goals for Phase 2:

- establish a Cargo workspace instead of a single application crate
- remove inline page rendering from the backend
- introduce shared API contract types for frontend/backend communication
- document dependency rules between apps and component crates
- add workspace-level verification commands
- keep current Phase 1 behavior stable while refactoring
- improve test structure so component tests and end-to-end tests are clearly distinguished

## Non-Goals

Phase 2 does not add new major product capabilities.

Out of scope:

- search
- summaries
- skim rendering beyond current minimal inspection surface
- distill
- annotations
- authentication redesign
- remote collector implementation
- collector protocol rollout beyond what is needed to preserve future architecture direction
- a full design-system project
- broad UI feature expansion beyond keeping current inspection functionality alive through the new frontend/backend split

## Target Repository Shape

Phase 2 should convert the repo into a Cargo workspace.

Recommended target shape:

```text
/
├── Cargo.toml                      # workspace manifest only
├── Cargo.lock
├── apps/
│   ├── backend/
│   │   ├── Cargo.toml
│   │   └── src/
│   │       ├── main.rs
│   │       ├── app.rs
│   │       ├── http_api.rs
│   │       └── runtime.rs
│   └── frontend/
│       ├── Cargo.toml
│       ├── src/
│       │   ├── main.rs
│       │   ├── app.rs
│       │   ├── pages/
│       │   ├── components/
│       │   └── backend_client.rs
│       ├── templates/             # if server-rendered frontend is chosen
│       └── static/
├── components/
│   ├── collector-runtime/
│   │   ├── Cargo.toml
│   │   ├── README.md
│   │   └── src/
│   ├── ingest-service/
│   │   ├── Cargo.toml
│   │   ├── README.md
│   │   └── src/
│   ├── raw-session-store/
│   │   ├── Cargo.toml
│   │   ├── README.md
│   │   └── src/
│   ├── configuration/
│   │   ├── Cargo.toml
│   │   ├── README.md
│   │   └── src/
│   ├── ui-api-contracts/
│   │   ├── Cargo.toml
│   │   ├── README.md
│   │   └── src/
│   └── observability/
│       ├── Cargo.toml
│       ├── README.md
│       └── src/
├── docs/
│   ├── README.md
│   ├── dependency-rules.md
│   ├── dev-commands.md
│   ├── architecture/
│   ├── components/
│   ├── features/
│   └── playbooks/
├── tests/
│   └── e2e/
├── working/
│   ├── phase-1.md
│   └── phase-2.md
└── references/
```

This exact naming may be adjusted slightly during implementation, but the separation goals must remain intact:

- apps are runnable binaries
- components are reusable internal packages grouped by architecture responsibility
- docs are a first-class top-level area

## Component Mapping from the Current Codebase

Current code should move as follows.

### Backend App

Current files:

- `src/main.rs`
- parts of `src/app.rs`
- backend API portions of `src/api.rs`

Target:

- `apps/backend`

Responsibilities:

- start the backend process
- wire component crates together
- expose machine-consumable HTTP APIs and raw-content download without rendering end-user HTML
- run polling and ingest orchestration

### Frontend App

Current files:

- HTML and CSS rendering currently embedded in `src/api.rs`
- frontend interaction flow currently mixed into form routes

Target:

- `apps/frontend`

Responsibilities:

- own the inspection page
- own page layout, templates, styling, and UI event flow
- call backend APIs rather than storage code directly

### Collector Runtime Component

Current files:

- `src/collect/**`

Target:

- `components/collector-runtime`

Responsibilities:

- source discovery
- safe JSONL read
- tool adapters
- scan batch creation

### Ingest Service Component

Current files:

- `src/ingest/**`

Target:

- `components/ingest-service`

Responsibilities:

- idempotent upsert decisions
- replace-on-sync behavior
- blob/store coordination during ingest

### Raw Session Store Component

Current files:

- `src/store/**`

Target:

- `components/raw-session-store`

Responsibilities:

- blob store
- SQLite metadata store
- migrations
- read/write session persistence APIs

### Configuration Component

Current files:

- `src/config.rs`

Target:

- `components/configuration`

Responsibilities:

- runtime config loading
- app-specific config models
- environment-variable mapping

### UI / API Contracts Component

Current files:

- shared request/response and view-model types currently mixed into `src/app.rs` and `src/api.rs`

Target:

- `components/ui-api-contracts`

Responsibilities:

- JSON payload types shared between frontend and backend
- route-level request/response models
- versioned API contract types for the inspection surface

### Observability Component

Current files:

- tracing setup and related shared runtime concerns currently spread across app startup

Target:

- `components/observability`

Responsibilities:

- tracing initialization helpers
- common logging / diagnostics helpers
- later room for metrics setup

## Frontend / Backend Boundary Rules

Phase 2 must enforce these rules:

- backend owns storage and scanning
- frontend does not import storage, collector, or ingest crates directly
- frontend talks to backend only through HTTP and shared contract types
- backend does not render end-user HTML
- component crates do not depend on frontend crates
- apps may depend on component crates, but not vice versa

Dependency direction should look like this:

```text
apps/frontend -> components/ui-api-contracts
apps/backend  -> components/*
apps/backend  -> components/ui-api-contracts

components/collector-runtime -> no frontend dependency
components/ingest-service -> components/raw-session-store
components/raw-session-store -> no app dependency
```

## Documentation Deliverables

Phase 2 must create a dedicated `docs/` area with developer-oriented documentation.

Minimum required docs:

### 1. `docs/README.md`

Entry point for all project documentation.

Must answer:

- what docs exist
- where to start
- which document is for repo structure, component ownership, features, and dev commands

It also serves as the practical repo map of the repository.

Must answer:

- what each top-level folder is for
- which crate is the frontend
- which crate is the backend
- where implemented architecture components live

### 2. `docs/dependency-rules.md`

Must describe:

- allowed crate dependency directions
- forbidden dependencies
- how shared contract types are handled
- which layers may talk to storage directly

### 3. `docs/dev-commands.md`

Must describe:

- how to run backend alone
- how to run frontend alone
- how to run both together
- how to run tests by app and by component
- workspace verification commands

### 4. Component Docs

Each implemented component folder must include its own `README.md`.

Each component `README.md` must answer:

- purpose
- owned files
- public API / entry points
- important internal files
- dependencies it may rely on
- files developers should read before modifying behavior
- tests covering that component

### 5. Feature Docs

At minimum, add:

- `docs/features/session-store.md`
- `docs/features/inspection-surface.md`

Each feature doc must answer:

- what the feature does
- frontend files to modify
- backend files to modify
- component files that must stay aligned
- API endpoints involved
- tests that cover the feature

### 6. Developer Playbooks

Add short playbooks such as:

- `docs/playbooks/modify-frontend-page.md`
- `docs/playbooks/modify-backend-api.md`
- `docs/playbooks/modify-session-store.md`

These should be short and operational, not philosophical.

## Migration Plan

Phase 2 should be implemented in small, reviewable chunks.

### Milestone 1: Workspace Skeleton

Create the Cargo workspace and move the current single crate into explicit apps/components.

Definition of done:

- root `Cargo.toml` is a workspace manifest
- `apps/backend` and `apps/frontend` exist
- implemented component crates exist under `components/`
- code still builds

### Milestone 2: Backend Extraction

Move backend-only runtime and JSON API responsibilities out of the current mixed crate.

Definition of done:

- backend compiles as its own app
- JSON APIs are still available
- backend no longer renders end-user HTML

### Milestone 3: Frontend Extraction

Move the current inspection page into the frontend project.

Definition of done:

- frontend compiles as its own app
- frontend calls backend through explicit APIs
- HTML/CSS/template code no longer lives in backend route code
- current Phase 1 inspection behavior remains available

### Milestone 4: Documentation Pass

Write the repo map, dependency rules, component READMEs, feature docs, and playbooks.

Definition of done:

- `docs/` entry points exist
- every implemented component has a `README.md`
- feature docs identify relevant files and tests

### Milestone 5: Verification and Cleanup

Stabilize tests and remove obsolete structure.

Definition of done:

- workspace tests pass
- end-to-end tests cover frontend/backend integration at the HTTP boundary
- old mixed-ownership code paths are removed
- documentation matches the final repo layout

## Acceptance Criteria

Phase 2 is complete when all of the following are true:

- frontend and backend live in separate Rust projects
- backend no longer contains inline end-user HTML rendering
- implemented code is grouped by explicit component folder names aligned with `ARCHITECTURE.md`
- the current Phase 1 inspection behavior still works:
  - open webpage
  - list discovered sessions
  - choose sessions to save
  - view metadata and freshness status
  - fetch stored raw content
- the repo has a `docs/` area that tells developers where to make changes for common work
- component READMEs document ownership and dependency rules
- a developer can identify the right files for a change without broad code reading
- tests pass at workspace level

## Risks

- splitting frontend and backend can accidentally break current inspection behavior if the API contract is not stabilized first
- creating too many empty component crates can add ceremony without clarity
- documentation can become stale unless it is written against the final moved structure rather than the old one
- choosing an overly complex frontend technology for Phase 2 could slow the architecture refactor and dilute the main goal

## Mitigations

- extract shared UI/API contract types before moving frontend behavior
- create code crates only for implemented components; represent future components in docs until real code exists
- finish structural moves before the main documentation pass
- choose the simplest frontend separation that gives a clean boundary

## Recommended Next Step

Start with Milestone 1 only:

- create the workspace
- choose exact crate names
- move current code into `apps/backend`, `apps/frontend`, and implemented `components/*` crates
- keep behavior parity before improving the frontend design further
