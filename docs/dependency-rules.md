# Dependency Rules

## Allowed Directions

- `apps/backend` may depend on:
  - `components/collector-runtime`
  - `components/configuration`
  - `components/ingest-service`
  - `components/observability`
  - `components/raw-session-store`
  - `components/ui-api-contracts`
- `apps/frontend` (Bun + Vite + React + TypeScript) may depend on:
  - `components/ui-api-contracts/bindings/*.ts` (generated TypeScript types; one-way import only)
  - external npm packages managed via Bun for UI, HTTP fetch, and test tooling. Phase 4 adopted a strict 2-package escape-hatch budget for browser-only concerns native APIs cannot meet; **1 of 2 slots consumed** at Phase 5 close (`focus-trap-react@^11`, originally introduced in Phase 4 M4 to fix a native `<dialog>` Tab-cycling gap; now ORPHAN-INSTALLED after Phase 5 M2b retired the drawer and Phase 5 M6 deleted `Drawer.tsx` + `SessionDetail.tsx` from disk — the package stays in `package.json` per planner recommendation since the cost is negligible (~35 KB JS + 2 transitive deps) and a future modal need may revive it; `rg -n 'focus-trap' apps/frontend/src/` returns zero hits). **Slot 2 reserved + UNUSED at Phase 5 close** (`@tanstack/react-virtual`, gated on documented evidence that pagination plus `useMemo` cannot keep render time bounded; Phase 5 M4 long-corpus measurement on a 5k-message synthetic fixture posted median 16.7 ms / 0 dropped frames so the slot did NOT fire). Adding a third escape-hatch package requires a fresh planning round.
  - all backend communication is over HTTP to `apps/backend`
- `components/ingest-service` may depend on:
  - `components/collector-runtime`
  - `components/raw-session-store`
- `components/raw-session-store` may depend on:
  - `components/ui-api-contracts`
- `components/collector-runtime` may depend on:
  - `components/ui-api-contracts`
- `components/configuration`, `components/observability`, and `components/ui-api-contracts` should not depend on app crates

## Forbidden Directions

- `apps/frontend` must not depend on:
  - `components/collector-runtime`
  - `components/ingest-service`
  - `components/raw-session-store`
- No component crate may depend on `apps/backend` or `apps/frontend`
- `apps/backend` must not render end-user HTML
- `apps/frontend` must not reach into storage or ingest internals directly

## Contract Handling

- Shared page and JSON payloads live in `components/ui-api-contracts`
- `components/ui-api-contracts/src/lib.rs` is the single source of truth for the contract. The TypeScript declarations under `components/ui-api-contracts/bindings/` are checked-in generated artifacts derived from `src/lib.rs` by the `ts-bindings` cargo feature — they are the canonical downstream output and must stay in sync with the Rust source: regenerate and commit them together with any Rust contract change, never hand-edited
- The Bun frontend consumes contract types via one-way TypeScript imports from `components/ui-api-contracts/bindings/*.ts`, using the `@contracts/*` path alias wired in `apps/frontend/tsconfig.json` (or a direct relative path). The frontend MUST NOT re-declare contract types by hand; the thin barrel at `apps/frontend/src/lib/contracts.ts` re-exports the generated types for internal consumption
- If a backend JSON shape changes, update:
  - `components/ui-api-contracts/src/lib.rs`
  - `components/ui-api-contracts/bindings/*.ts` (regenerate via `cargo test -p distill-portal-ui-api-contracts --features ts-bindings -- --ignored regenerate_ts_bindings`; see `docs/dev-commands.md`)
  - `apps/backend/src/http_api.rs`
  - the typed API layer in `apps/frontend/src/lib/` (`api.ts`, `contracts.ts`)
  - any impacted frontend rendering under `apps/frontend/src/App.tsx`, the unified session feature at `apps/frontend/src/features/sessions/`, or the shared React primitives under `apps/frontend/src/components/`
  - the relevant tests in `apps/backend/tests/http_api.rs`, `apps/frontend/src/App.test.tsx`, `apps/frontend/e2e/inspection.spec.ts`, and `tests/e2e/tests/inspection_surface.rs`

## Layer Ownership

- Storage writes and reads belong to `components/raw-session-store`
- Replace-on-sync ingest rules belong to `components/ingest-service`
- Source discovery and parsing belong to `components/collector-runtime`
- Environment variable mapping belongs to `components/configuration`
- HTTP routes belong to the app crates only

## Frontend Dev-Time Topology

- `apps/frontend/` is a Bun-managed package (`package.json`, `bun.lock`, `vite.config.ts`, `index.html`, `src/*.tsx`).
- Frontend dev-time proxying of `/api/v1/**` and `/health` to the backend belongs in `apps/frontend/vite.config.ts`, not in any application code path.
- The Bun app must continue to honor the frontend-boundary rules above: no direct dependency on `components/collector-runtime`, `components/ingest-service`, or `components/raw-session-store`; all backend communication goes over HTTP to the Rust backend.

### Phase 5 M2a notes — Fraunces self-hosted as static asset

Phase 5 introduces a single self-hosted variable serif (Fraunces) for the Archive-room display layer (empty-pane preface, future M5 chapter-break labels, future app title). The font ships as two `.woff2` files at `apps/frontend/public/fonts/Fraunces-subset.woff2` (Roman) and `apps/frontend/public/fonts/Fraunces-Italic-subset.woff2` (Italic), referenced by two `@font-face` blocks in `apps/frontend/src/styles/tokens.css`. Per Phase 5 §Resolved Decision #15, **a self-hosted font file is a static asset, not a runtime dependency** — the 2-package escape-hatch budget (currently 1/2 consumed by `focus-trap-react@^11`) is **not affected**. No bundler plugin, font-loading library, or JS dep is involved; Vite serves the woff2 files directly from `public/`. To regenerate (only when upstream Fraunces revs, ~yearly per Google Fonts cadence): download both variable fonts from `https://github.com/undercasetype/Fraunces` (`fonts/variable/Fraunces[SOFT,WONK,opsz,wght].ttf` + the Italic counterpart), run `fonttools varLib.instancer <input.ttf> SOFT=50 WONK=0 -o <pinned.ttf>` to drop the design-time-only SOFT and WONK axes (saves ~70 KB per file), then `pyftsubset <pinned.ttf> --output-file=apps/frontend/public/fonts/Fraunces-subset.woff2 --unicodes='U+0020-007E,U+00A0-00FF,U+2010-2027,U+2030-2052' --layout-features='kern,liga,smcp,onum' --flavor=woff2 --desubroutinize`. Target file size: ~80 KB per file. Reversibility: deleting both `@font-face` blocks AND both woff2 files yields a still-cohesive system-serif aesthetic (Charter / Iowan Old Style / Georgia at ~99% of Fraunces's visual size via the `size-adjust` override, no broken layout).
