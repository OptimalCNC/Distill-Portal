# Modify Frontend Page

1. Start in `apps/frontend/src/App.tsx` (the split-pane shell + URL-driven selection + fetch / mutation orchestration + toast queue) or the relevant feature module under `apps/frontend/src/features/sessions/` (unified session list, right-pane session view + four-tab shell, per-tool parsers + skim builder), or a shared React primitive under `apps/frontend/src/components/` (action bar / Tabs primitive / pagination / toast surface / scan-errors callout) for layout, forms, or rendering changes. Each component has a sibling `.css` file (e.g. `SessionsTable.tsx` ↔ `SessionsTable.css`, `SessionView.tsx` ↔ `SessionView.css`); add or revise selectors there rather than reopening the retired `apps/frontend/src/styles/app.css` (gone since Phase 4 M6). The three global sheets at `apps/frontend/src/styles/{reset,tokens,global}.css` own the cascade order, design tokens, and the four global utility classes (`.muted`, `.mono`, `.stack`, `.empty`).
2. If the change touches the right-pane content (Transcript / Skim / Raw / Metadata), see [`../features/session-view.md`](../features/session-view.md) for the tab architecture, the parser registry, and the keep-mounted contract before editing.
3. If the frontend needs different data, update `components/ui-api-contracts/src/lib.rs` first, then regenerate the TypeScript bindings with `cargo test -p distill-portal-ui-api-contracts --features ts-bindings -- --ignored regenerate_ts_bindings`.
4. Update the typed API layer in `apps/frontend/src/lib/` (`api.ts`, `contracts.ts`) and the matching backend route in `apps/backend/src/http_api.rs`.
5. From `apps/frontend/`, run `bun run test` for the unit suite and `bun run test:e2e` for the Playwright browser suite.
6. Run `cargo test -p distill-portal-e2e --test inspection_surface` for the typed-Rust-client HTTP smoke.
7. Run `cargo test --workspace` and `cargo test -p distill-portal-ui-api-contracts --features ts-bindings` before finishing if the contract changed.

## How per-tool parsers fit

The right-pane Transcript and Skim tabs consume `ParsedSession` produced by a per-tool parser dispatched by `useParsedSession`. The registry lives at `apps/frontend/src/features/sessions/parsers/index.ts` as `PARSERS: Record<Tool, ParserFn>`.

To add support for a new tool (a future `<tool>` discriminant in the `Tool` union):

1. Add `apps/frontend/src/features/sessions/parsers/<tool>.ts`. Implement `parse<Tool>(rawText: string): ParserOutput`. The parser MUST be pure (no I/O), total (never throw — failures land in `warnings[]`), and synchronous. Emit `MessageKind = "unknown"` paired with a warning for any line shape the parser does not recognize.
2. Co-locate `apps/frontend/src/features/sessions/parsers/<tool>.test.ts` covering the truth table. The pattern follows `claude_code.test.ts` and `codex.test.ts`.
3. Register the parser in `parsers/index.ts` by adding the `<tool>` entry to the `PARSERS` record. The runtime exhaustiveness test in `index.test.ts` will fail if the registry misses an enum value.
4. If the new tool introduces a new `JSON.stringify(payload.X)` site where `payload.X` may be `undefined`, guard with `?? null` to preserve the `Message.text: string` contract (cross-reference: `JSON.stringify(undefined) === undefined`, NOT a string).

The parser-dispatch path is entirely separate from the Raw tab's `consumeRawPreview` (256 KB / 20-line preview). Skim and Transcript share one cached `ParsedSession` via `useParsedSession`'s LRU(5); the Raw tab runs its own consumer.

## CSS-only truncation with full-text tooltip (Phase 6 worked example)

When a list cell holds a string that may exceed the column's available width, do NOT introduce a JS character-count constant or a separate "display title" field. Two ingredients suffice:

1. A pure CSS rule on the cell's text element:

   ```css
   .title-cell-title {
     overflow: hidden;
     text-overflow: ellipsis;
     white-space: nowrap;
     min-width: 0;
   }
   ```

2. The full string carried on the element's native `title=` attribute:

   ```tsx
   <span className="title-cell-title" title={row.title ?? ""}>
     {row.title ?? "(untitled)"}
   </span>
   ```

The browser's built-in tooltip exposes the full string on hover; assistive technologies read it via the same `title` attribute. No popover component, no event handlers, no `useState`. The same pattern is reused on the Metadata tab's "Title source" `<dd>` (Phase 6 M2) — the `<dd>` carries the longer explanatory tooltip on its `title=` attribute while the visible body stays at a two-word caption. Implementation lives at:

- `apps/frontend/src/features/sessions/SessionsTable.tsx` (the list-panel title cell — `title={row.title ?? ""}`)
- `apps/frontend/src/features/sessions/SessionsTable.css` (the `.title-cell-title` CSS rule)
- `apps/frontend/src/features/sessions/SessionMetadata.tsx` (the Metadata tab "Title source" caption row + the pure helper `titleSourceCaption(value)`)

## Verification commands

When auditing token usage in `apps/frontend/src/styles/tokens.css`, remember that token names start with a leading `--` (a double-dash). Use `grep -q -- "${tok}:"` (with the explicit `--` separator) when scripting per-token presence checks, otherwise `grep` may interpret `--color-foo` as a flag and fail silently.

Hex isolation gate (must remain at 24 unless a WCAG-driven addition is documented):

```bash
rg -n '#[0-9a-fA-F]{3,8}' apps/frontend/src/ | wc -l
```

Token count gate (must remain at 83 at Phase 5 close):

```bash
rg -c '^\s*--' apps/frontend/src/styles/tokens.css
```
