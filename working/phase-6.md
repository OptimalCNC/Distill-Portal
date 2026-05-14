# Phase 6: Title Resolution Provenance

## Status

Frozen at the first commit landing this spec on `main`. Subsequent milestones reference that commit's SHA. Phase 5 closed at `a08ee79` (impl) + `076b119` (log) on 2026-05-11 and is the baseline this phase mutates.

## Why this phase exists

Today the inspection list renders each session row's `title` field directly. For Claude Code sessions whose JSONL contains a `customTitle` record, this reads cleanly (e.g. "Refactor auth middleware"). For sessions without one — the common case — the parser already falls back to the first user message, which can be hundreds of characters. The list column truncates with `text-overflow: ellipsis`, but the underlying string is whatever the parser extracted, with no consistency check, no signal of where it came from, and no path to replace it later with a better source (e.g. AI-generated summaries, planned for a later phase).

Phase 6 does NOT introduce title editing, title generation, or a second persisted column. It captures **which source produced the title** as a sibling field. With that one signal in place, three later capabilities become trivial: render-time consumers can distinguish high-signal titles (a tool-authored `customTitle`) from weak heuristic fallbacks; a future title-generation feature can skip rows whose `title_source` is already `generated` unless explicitly forced; the metadata surface can show the provenance so users understand why a given title looks the way it does.

The existing `title` field stays in place with its current resolution priority. Storage stays full-length. Truncation moves to the render layer.

## Goal & Scope

### In scope (must close in Phase 6)

- A new `title_source: Option<TitleSource>` field on stored + source session contract types.
- A `TitleSource` enum with four values: `custom` / `first_user_message` / `slug` / `generated` (last reserved; never emitted in Phase 6).
- Parser emission of `title_source` alongside the existing `title` for both Claude Code and Codex. Resolution priority for `title` itself is **unchanged**: `customTitle` → first user message → slug fallback (Claude Code); first user message only (Codex).
- Forward migration adding a NULLable `title_source` column to the persisted sessions table. No backfill; existing rows remain `NULL` until rescan + re-ingest naturally repopulates them.
- `ui-api-contracts` exposes `title_source` on `SourceSessionView` and `StoredSessionRecord`; ts-rs regenerates the bindings.
- Frontend list-panel title cell truncates at render time via CSS (single line, ellipsis) with a `title=` HTML attribute carrying the full text for hover and assistive tech.
- Metadata tab gains one caption row labelling the title source in plain English (e.g. "Title from: first user message").
- Eight-doc sweep and progress-log entry per Phase 5 precedent (scoped to the surfaces this phase actually touches).

### Out of scope (deferred)

- AI title generation, model wiring, generation jobs, force-regenerate UI. Reserved enum value `generated` documents intent only.
- User-editable titles, inline rename affordances, title-history audit trail. Explicitly rejected by the user as needless complexity.
- A separate `summary` column on the sessions table. Empty reserved columns age badly; deferred to whenever the first real writer (AI summarization) actually arrives.
- Backfilling `title_source` for existing imported rows via heuristic. We cannot reliably know which path produced an existing title; users who want repopulation rescan and re-import.
- Render-time truncation cap negotiation (max chars, ellipsis position, multi-line clamp). Single-line CSS truncation with full-text tooltip is the only mechanism this phase introduces.
- Job-center / async-execution model. That is Phase 9.
- Transcript / Skim / Raw rendering changes. Those are Phase 7 / Phase 8 territory.

## Dependency Policy

Inherits Phase 5's policy. No new runtime dependencies — this phase is plumbing.

- 24 hex literals in `apps/frontend/src/` and 83 tokens in `tokens.css` stay constant. Adding a single caption row in the Metadata tab does not require a new token; reuse existing chrome/typography tokens.
- Bun-first invariant: no `jest.fn()`, no `child_process`, no `node:fs` in `apps/frontend/src/`.
- ORPHAN: `focus-trap-react` stays installed per Phase 5 close decision.

## Target Repository Shape

This phase edits both backend and frontend. The Phase 5 protected-path freeze is released for the specific files listed below; all other Phase 5 invariants hold.

```text
components/
├── collector-runtime/
│   └── src/
│       ├── claude_code.rs      # parser emits title_source alongside title
│       ├── codex.rs            # parser emits title_source alongside title
│       └── normalize.rs        # if title_source plumbing lives here, no length change
├── raw-session-store/
│   └── src/
│       ├── migrations.rs       # new forward migration adds title_source column
│       └── sqlite.rs           # SELECT/INSERT include title_source
├── ingest-service/
│   └── src/
│       └── service.rs          # StoredSessionInput.title_source plumbed end-to-end
└── ui-api-contracts/
    └── src/
        └── lib.rs              # TitleSource enum + field on SourceSessionView + StoredSessionRecord
apps/
├── backend/
│   └── src/
│       └── http_api.rs         # NO route changes; serde flows the new field automatically
└── frontend/
    └── src/
        ├── features/sessions/
        │   ├── SessionsTable.tsx   # render-time truncation (CSS + title= attribute)
        │   ├── SessionsTable.css   # single-line ellipsis on the Title cell
        │   ├── SessionMetadata.tsx # new caption row "Title from: <source>"
        │   ├── SessionMetadata.css # caption row styling (no new tokens)
        │   └── types.ts            # SessionRow gains title_source field
        └── lib/contracts.ts        # TitleSource type re-export from generated bindings
```

Files removed in this phase: none.

## Data Model

### Backend enum + field

```rust
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
#[cfg_attr(feature = "ts-bindings", derive(ts_rs::TS))]
#[cfg_attr(feature = "ts-bindings", ts(export_to = "TitleSource.ts"))]
pub enum TitleSource {
    Custom,
    FirstUserMessage,
    Slug,
    Generated,
}
```

`SourceSessionView` and `StoredSessionRecord` each gain `pub title_source: Option<TitleSource>`. Invariant: `title.is_some() == title_source.is_some()` at the storage boundary; the ingest mapper enforces this. The reverse direction (consumer code) treats `None` as "unknown source; render no caption."

### SQLite migration

A new forward migration adds `title_source TEXT` to the persisted sessions table:

```sql
ALTER TABLE stored_sessions ADD COLUMN title_source TEXT;
```

Stored as the snake_case serde representation (`custom` / `first_user_message` / `slug` / `generated`). Backwards compatibility: existing rows yield `NULL`; the read path maps `NULL` → `None`. No `CHECK` constraint — invalid future values surface as parser errors in the deserializer, which is the correct boundary.

No backfill migration. Re-ingesting a session (via rescan + import) freshly extracts both `title` and `title_source` via the parser; that is the supported repopulation path.

### Parser emission

Both parsers already compute a resolution priority. Phase 6 extends the return signature to surface the winning path.

**Claude Code** (current order preserved):

| Source | Condition | Resulting `title_source` |
|---|---|---|
| `customTitle` field on a `"custom-title"` record | Present and non-empty after `normalize_title` | `Custom` |
| First user message body | No usable `customTitle`; a user record exists | `FirstUserMessage` |
| `slug` field | Both above failed | `Slug` |
| (none) | All three empty | `None` |

**Codex** (single path):

| Source | Condition | Resulting `title_source` |
|---|---|---|
| First `event_msg` with `type: user_message` payload | Non-empty after normalization | `FirstUserMessage` |
| (none) | Empty / missing | `None` |

The existing `normalize_title()` whitespace-collapse helper is untouched. No new length cap, no UI-driven truncation in the parser.

## Frontend Rendering

### List panel — Title cell

`SessionsTable.tsx` already emits the `title` text into a `<td>`. Phase 6 adds:

- The cell's CSS rule sets `overflow: hidden; text-overflow: ellipsis; white-space: nowrap;` so the cell truncates at column width.
- The cell renders `title={row.title ?? ""}` as an HTML attribute so the full text appears in the native browser tooltip on hover. Screen readers receive the full string via the same path.
- No JS truncation, no character-count constant, no second display field. The visible width is determined by the column's CSS, not the parser.

### Metadata tab — title source caption

`SessionMetadata.tsx` renders the existing 18-field `<dl>`. Phase 6 inserts one new `<dt>` / `<dd>` pair after the existing `Title` field. The label reads "Title source"; the value is a terse caption paired with a longer explanatory tooltip carried on the `<dd>` via the native HTML `title=` attribute (same mechanism as the list-panel truncation pattern, no new component, no JS):

| `title_source` value | Terse caption | Tooltip (HTML `title=`) |
|---|---|---|
| `custom` | "Origin" | "Title brought in from the original coding session (e.g. Claude Code's customTitle record)." |
| `first_user_message` | "Opening message" | "Extracted from the first user message in this session." |
| `slug` | "Path slug" | "Derived from the session's source path as a fallback when no usable message text was found." |
| `generated` | "Generated" | "AI-generated title (reserved for a later phase; not produced in Phase 6)." |
| `None` (NULL or absent) | "Unknown" | "This session was imported before title-source tracking was added; rescan to populate." |

The caption row is purely informational. No interactive affordances.

## Documentation

Sweep the documents whose surfaces this phase touches:

- `docs/README.md` — task table gains a row for "Change title resolution behavior".
- `docs/features/inspection-surface.md` — title cell render-time truncation + tooltip behavior added to the list-panel section.
- `docs/features/session-view.md` — Metadata tab now documents the title-source caption row.
- `docs/features/session-store.md` — schema migration + the new field.
- `docs/playbooks/modify-frontend-page.md` — short reference to truncation pattern (CSS-only).
- `docs/playbooks/modify-backend-api.md` — example: adding a small enum + field through the contract → parser → ingest → store chain.
- `apps/frontend/README.md` — Entry Points list mentions the title_source caption.
- `components/raw-session-store/README.md` — schema documents the new column.

## Milestones

Each milestone is reviewable on its own and leaves `main` green. Two-commit pattern per chunk (impl + log update). Three-reviewer rule (backend-protection Claude + normal Claude + Codex external) applies per chunk.

### Milestone 1: Backend + contract + parser emission

- New `TitleSource` enum in `components/ui-api-contracts/src/lib.rs`; `title_source: Option<TitleSource>` on both `SourceSessionView` and `StoredSessionRecord`. ts-rs binding regenerates cleanly.
- Forward migration in `components/raw-session-store/src/migrations.rs` adds the column. `sqlite.rs` SELECT/INSERT paths include it. Round-trip preserves `Custom` / `FirstUserMessage` / `Slug` / `Generated` and `None`.
- `components/collector-runtime` parsers (Claude Code + Codex) emit `(title, title_source)` from the same resolution code path that previously produced just `title`. No change to priority order. Existing parser truth-table fixtures gain `title_source` assertions.
- `components/ingest-service/src/service.rs` plumbs the new field from `ParsedSession` into `StoredSessionInput`. Invariant check: if `title.is_some()`, then `title_source.is_some()`.
- Backend HTTP API surface is unchanged structurally; serde carries the new field automatically. Existing integration tests gain assertions that the new field appears in responses.

Definition of done:

- `cargo check --workspace` clean.
- `cargo test --workspace` green; parser truth tables + store round-trip + ingest mapping all assert `title_source`.
- `cargo test -p distill-portal-ui-api-contracts --features ts-bindings` green; TS bindings updated and committed.
- Migration up + (manual) down path documented in the progress log.
- ts-rs-generated `TitleSource.ts` file lands in the bindings export path.

### Milestone 2: Frontend rendering + docs

- `SessionsTable.tsx` + `SessionsTable.css`: title cell truncates via CSS; `title=` attribute carries full text.
- `SessionMetadata.tsx` + `SessionMetadata.css`: one new `<dt>` / `<dd>` pair (label + readable caption per the table above). No new tokens.
- `apps/frontend/src/features/sessions/types.ts` extends `SessionRow` with `titleSource: TitleSource | null` (camelCase per existing TS convention; map at the contract boundary).
- `apps/frontend/src/lib/contracts.ts` re-exports the generated `TitleSource` type.
- `mergeSessions.ts` carries the field through the source ↔ stored row union (no logic change, only field propagation).
- Eight-doc sweep per §Documentation.
- Progress log entry recording the Phase 6 close.

Definition of done:

- `bun run test` green; new tests cover each `title_source` rendering path in `SessionMetadata.test.tsx` and the CSS truncation contract in `SessionsTable.test.tsx`.
- `bunx tsc --noEmit` clean.
- `bun run build` green; bundle size stays in the Phase-5 close envelope (no new runtime deps).
- `bun run test:e2e` green; e2e gains a single assertion that the Metadata tab shows the title-source caption.
- Hex audit: `rg -n '#[0-9a-fA-F]{3,8}' apps/frontend/src/ | wc -l = 24`.
- Token audit: `rg -c '^\s*--' apps/frontend/src/styles/tokens.css = 83`.
- Documented + crossed-referenced in eight docs.

## Acceptance Criteria

A Phase 6 close is achieved when ALL of the following hold:

1. `TitleSource` enum exists in `ui-api-contracts` with exactly four values (`custom`, `first_user_message`, `slug`, `generated`) and ts-rs binding exports cleanly.
2. `SourceSessionView.title_source` and `StoredSessionRecord.title_source` exist and are `Option<TitleSource>`.
3. Migration adds the column; existing rows return `NULL`; new ingests populate the field.
4. Both parsers emit `title_source` consistent with the resolution priority documented above. Truth-table tests assert each enum value for at least one fixture.
5. The ingest layer enforces the `title.is_some() == title_source.is_some()` invariant.
6. The list-panel Title cell truncates at column width via CSS only, with a `title=` HTML attribute carrying the full text.
7. The Metadata tab shows the human-readable title-source caption.
8. The eight documentation surfaces are updated.
9. Hex literal count and token count are unchanged. No new runtime deps. Bun-first invariant holds.
10. Phase 5 protected paths are now legitimately edited only in the files this spec names; no others.
11. Three-reviewer trail per milestone recorded in `progress/phase-6.progress.md`.

## Testing

- **Backend unit**: parser truth tables in `components/collector-runtime/tests/parsers/` extend with one fixture per `title_source` outcome (Claude Code: 3 fixtures + 1 None; Codex: 1 fixture + 1 None).
- **Backend store**: `raw-session-store` round-trip test asserts the field survives INSERT / SELECT for each enum value and for NULL.
- **Backend ingest**: `ingest-service` unit test asserts the invariant `title.is_some() == title_source.is_some()` holds for representative inputs.
- **Backend HTTP**: `apps/backend/tests/http_api.rs` asserts the new field appears in the JSON responses for `/api/v1/sessions` and `/api/v1/source-sessions`.
- **Contract bindings**: `cargo test -p distill-portal-ui-api-contracts --features ts-bindings` passes; the generated `TitleSource.ts` lands in source control.
- **Typed e2e**: `tests/e2e/tests/inspection_surface.rs` asserts `title_source` deserialises and matches expectations for the fixture session.
- **Frontend unit**: `SessionsTable.test.tsx` asserts the truncating CSS class is present on the title cell and the `title=` attribute equals the full string. `SessionMetadata.test.tsx` asserts each title_source value renders the correct terse caption ("Origin" / "Opening message" / "Path slug" / "Generated") with the matching `title=` tooltip text, and that `null` renders "Unknown" with the legacy-row tooltip.
- **Browser e2e**: `apps/frontend/e2e/inspection.spec.ts` gains one assertion that the Metadata tab shows the caption.

## Risks

| Risk | Mitigation |
|---|---|
| Migration applied on an existing populated database leaves all rows with `NULL` title_source; users may notice missing captions for older sessions. | Document explicitly in `docs/features/session-store.md`. Note that rescan + re-import naturally repopulates. |
| ts-rs binding regeneration drifts in a way that breaks the frontend type import path. | The contract-bindings cargo test gates this; ALWAYS run it after enum changes. |
| Parser change accidentally alters the `title` resolution priority while adding the source emission. | Existing parser truth-table fixtures pin the current priority. Reviewer specifically asserts no diff in extracted titles for the existing fixtures. |
| Frontend caption renders "Unknown" indefinitely on legacy rows and looks like a bug. | Caption row is muted-secondary styling so it reads as informational, not as an error state. |

## Resolved Decisions

These are pre-decided. Planner does not re-litigate.

1. **Two milestones, not one.** Backend lands cleanly first; frontend depends on its contracts. Reviewable in isolation.
2. **Title resolution priority unchanged.** `customTitle` → first user message → slug (Claude Code); first user message only (Codex). Phase 6 is purely additive on the provenance field.
3. **Four enum values: `custom`, `first_user_message`, `slug`, `generated`.** `generated` is reserved but never emitted in this phase. Keeping `slug` distinct from `first_user_message` lets a future generation policy treat slug-derived titles as definitely-regenerate-me.
4. **No `summary` column.** Empty reserved columns rot. Add it when the first real writer arrives.
5. **No `display_title` column.** The existing `title` field already encodes our resolution heuristic; a parallel field would only duplicate it.
6. **Store full-length titles. Truncate at render time.** No new storage-side length cap; the existing `normalize_title()` whitespace collapse is the only string transformation at the storage boundary.
7. **CSS-only truncation in the list panel.** No JS character-count constants. The `title=` HTML attribute carries full text for hover and assistive tech.
8. **No backfill migration.** Existing rows remain `title_source = NULL`; frontend renders "Unknown" caption; users rescan to repopulate.
9. **No user-editable titles.** Out of scope, out of intent.
10. **No UI/UX design gate.** This phase is plumbing + a single new caption row. The visible change is small enough that the design language inherited from Phase 5 covers it without a separate design pass.
11. **`title_source` carried on both `SourceSessionView` and `StoredSessionRecord`.** Contract symmetry: a single `TitleSource.ts` ts-rs export serves both source-side (un-ingested) rows and stored rows. The frontend reads the same field shape regardless of which path produced the row.
12. **Terse caption + HTML `title=` tooltip.** Each title_source value renders as a one- or two-word caption paired with a longer explanatory tooltip on the `<dd>`. No new component, no JS, no custom popover. Wording per the table in §Frontend Rendering → "Metadata tab — title source caption".

## Open Considerations

These are flagged for the planner / reviewer to validate during M1 but are not pre-resolved.

- **Where exactly does the parser emit `title_source` in the current code?** The pre-spec trace identified `normalize_title()` as the shared utility but did not confirm whether the resolution-priority logic lives in the per-tool parsers or in a shared helper. M1 starts by reading `components/collector-runtime/src/claude_code.rs` and `codex.rs` and chooses the smallest surgical change to emit a tuple. If both parsers share a helper, refactor the helper; if not, emit at each parser's resolution site.
- **Migration ordering on a fresh database vs. an existing one.** Confirm the existing `migrations.rs` pattern handles "ALTER TABLE ADD COLUMN" cleanly across both creation paths (initial schema + sequential migrations). If the initial-schema path already includes the new column verbatim, the migration becomes a no-op there.
- **Contract serialisation symmetry across source + stored views.** `SourceSessionView.title_source` IS carried (Resolved Decision #11 below). The source view's value comes directly from the collector parser without going through SQL storage; the stored view's value round-trips through the new SQLite column. M1 confirms the serde output shape matches across both paths and that ts-rs emits a single `TitleSource.ts` shared by both.
