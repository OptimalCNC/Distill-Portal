# Backend

## Purpose

Rust backend service: runtime wiring, scanning orchestration, ingest coordination, and machine-consumable HTTP routes plus a raw-content download route. Owns no end-user HTML.

## Entry Points

- `src/main.rs` — binary entry; loads config and observability, then boots `App`
- `src/app.rs` — `AppState` wiring (scanner, ingest service, session store) and shared app error shape
- `src/http_api.rs` — axum `Router`, route handlers, `ApiError` mapping

## Owns / Does Not Own

- Owns `/health` and `/api/v1/**` JSON routes plus `/api/v1/sessions/{session_uid}/raw` raw-content streaming.
- Does not render end-user HTML. The browser UI lives in `apps/frontend`.
- Does not reach into storage, ingest, or collector internals directly; it composes the component crates.

## Configuration

Environment variables (defaults in parentheses):

- `DISTILL_PORTAL_BACKEND_BIND` / `DISTILL_PORTAL_BIND` (`127.0.0.1:4000`)
- `DISTILL_PORTAL_DATA_DIR` (`./var/distill-portal`)
- `DISTILL_PORTAL_POLL_INTERVAL_SECS` (`30`)
- `DISTILL_PORTAL_CLAUDE_ROOTS` (defaults to `~/.claude/projects`)
- `DISTILL_PORTAL_CODEX_ROOTS` (defaults to `~/.codex/sessions`)

See `../../docs/dev-commands.md` for the command reference and `../../components/configuration/src/lib.rs` for the canonical definitions.

## Commands

```bash
cargo run -p distill-portal-backend
cargo test -p distill-portal-backend --test http_api
```

## Change Checklist

- Adding or changing an HTTP payload → follow `../../docs/playbooks/modify-backend-api.md`.
- Adding a route → update `src/http_api.rs`, add a test in `tests/http_api.rs`, update `../../docs/features/inspection-surface.md` if user-facing.
- Changing configuration → update `../../components/configuration/src/lib.rs` and this README's env-var list.
- Crossing a component boundary → check `../../docs/dependency-rules.md`.
