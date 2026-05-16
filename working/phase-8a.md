# Phase 8a: Raw View Polish

## Status

Frozen at the first commit landing this spec on `main`. Subsequent milestones reference that commit's SHA.

**Depends on Phase 9b closure.** Phase 9b lands a bespoke pretty-JSON `<pre>` block inside Job Center expanded cards for `result_json` / `error_json`. Phase 8a replaces both that simple pretty-JSON `<pre>` and the existing Raw-tab line-by-line plain-text renderer with a shared bespoke NDJSON inspector. Sequencing 8a after 9a/9b keeps the inspector landing as a single coherent piece rather than being introduced and immediately replaced.

**Followed by Phase 8b** (cross-tab Transcript ↔ Raw navigation). Phase 8b adds jump affordances between the Transcript and Raw tabs that scroll to + highlight the corresponding line/message. Phase 8a is purely about the visual + interaction polish of the Raw tab in isolation; Phase 8b is about the wiring between tabs and is grounded in 8a's collapsible-card semantics.

## Why this phase exists

The Raw tab today is the inspection surface's escape hatch: when the parser disagrees with the user about what's in a session file, or when the user wants to see the source of truth, they click Raw and get the JSONL stream. The Phase 5 implementation renders each NDJSON line as a single `<pre>` row of plain text. This works — every line is readable, the byte and line caps prevent runaway memory, the caption explains what was truncated — but it stops short of being *useful*.

A typical Claude Code session line is several kilobytes of JSON with three levels of nesting: a `message` envelope wrapping `content[]` arrays of typed items wrapping multi-line text bodies. Rendered as a single line of plain text, that structure is illegible: the reader sees an unbroken `{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"..."}, {"type":"tool_use","name":"...","input":{...}}]},"timestamp":"..."}` and has to manually find the boundaries between fields. The structure is there in the bytes; the renderer just doesn't show it.

Phase 8a closes the gap with a **bespoke NDJSON inspector**: each parseable line becomes a collapsible JSON-tree card with subtle syntax color and a per-line copy button. Malformed lines (lexer failures — what Phase 7b would flag as `severity: error / category: lexer`) keep their existing plain-text row treatment so the reader can still see the bad bytes verbatim. Existing caps (20-line / 256 KB) and caption behavior are preserved verbatim — Phase 8a polishes presentation, not protocol.

Per codex's review: **no library**. A general-purpose JSON viewer would add 20–80 KB to the bundle for a surface that needs four things — recursive render, collapse, syntax color, copy. A bespoke component fits the repo's existing token/hex/bundle discipline.

## Goal & Scope

### In scope (must close in Phase 8a)

- A new `JsonInspector` component (`apps/frontend/src/components/JsonInspector/`) rendering a single parsed JSON value with:
  - Recursive object / array / primitive rendering.
  - Native `<details>` collapse on every nested object and array (Phase 5 M5/M6 precedent for browser-managed open state).
  - Subtle syntax color: distinct visual treatments for strings, numbers, booleans, null, object keys.
  - Per-line copy button (copies the ORIGINAL raw JSON line as the parser received it — not the formatted version).
- RawTab integration:
  - Each `kind: "json"` line wraps its parsed value in `<JsonInspector />`.
  - Each `kind: "fallback"` (non-JSON) line keeps its existing plain-text row treatment verbatim. The Phase 5 `(non-JSON line)` marker stays.
  - Existing line-cap (20) and byte-cap (256 KB) behavior unchanged. Existing `describeCaption(...)` text unchanged.
- Long-line behavior: a JSON line whose pretty-printed form exceeds a threshold (~512 bytes, locked at M1 design) renders collapsed by default with the top-level keys visible (Claude Code style: top-level keys preview, click to expand). Short lines render expanded. Threshold value is a `const` in the inspector.
- JobCenter integration (Phase 9b's expanded card body): the temporary pretty-JSON `<pre>` block in the operations Job Center is replaced with `<JsonInspector />` configured to operate on a single value (the `result_json` or `error_json`) rather than a stream of NDJSON lines.
- Bidirectional reuse: the inspector is parameterised so RawTab and Job Center share the same component. RawTab passes one line at a time; Job Center passes the whole value.
- UI/UX design gate produces `working/phase-8a/designs/` (design.md, prototype.html, wireframes, wcag.py).
- Documentation sweep across 4 surfaces (see §Documentation).
- Progress log `progress/phase-8a.progress.md` records every chunk + three-reviewer trail.

### Out of scope (deferred)

- Cross-line aggregation (e.g. "show all tool_use across these 20 lines"). Each line is independent.
- Schema-aware formatting: no special treatment for known Claude Code or Codex shapes (e.g. no auto-highlighting `customTitle` or auto-collapsing `system-init` fields). The inspector is schema-agnostic.
- Inline search inside the Raw tab. Browser Cmd+F still works on the rendered text; no in-app search bar.
- Diff view between two raw lines. Deferred to a hypothetical "session compare" phase.
- Virtualization of the line list. The existing 20-line cap is the upper bound; virtualization is unnecessary.
- Protocol changes to support richer raw rendering. The `streamRawText` 5 MB cap, byte-cap, and line-cap behavior all stay verbatim.
- Per-node copy buttons (only per-line). Per-node copy is a future polish if user feedback demands.
- Edit / annotate / pin raw lines.
- JSON path navigation (e.g. `$.message.content[0].text`). Out of scope.
- Re-streaming the raw with different caps. Existing rawPreview consumer is untouched.
- Backend touch. No new HTTP routes; no contract changes.

## Dependency Policy

Inherits all prior phase invariants.

- **No new runtime dependencies.** The inspector is bespoke — codex's review specifically rejected general-purpose JSON viewers. Per-character syntax tokenisation happens in TS via a small recursive renderer; no `react-json-view`, no `react-json-tree`, no `prismjs` for syntax color.
- **Hex literal count** stays at 24 (or documented amendment per Phase 5 pattern). Syntax color may require new tokens (see below).
- **Token count budget**: M1 design measures the minimum-viable set of syntax-color tokens. Up to **4 new tokens** for JSON syntax color (strings, numbers, booleans/null, keys) — amendment is permitted under the Phase 5 amendment pattern with documented WCAG AA contrast measurements. M1 locks the exact additions.
- **Bun-first invariant**: holds. The inspector uses native `JSON.parse` for line parsing (already in RawTab) and native string slicing for the per-character render — no parser library.
- **focus-trap-react** remains orphan-installed.

## Target Repository Shape

```text
apps/frontend/
└── src/
    ├── components/
    │   └── JsonInspector/                # NEW component family
    │       ├── JsonInspector.tsx         # public component; takes a parsed value or raw text
    │       ├── JsonInspector.css         # syntax color tokens, collapse affordance, copy button
    │       ├── JsonInspector.test.tsx    # unit tests
    │       ├── JsonValue.tsx             # recursive renderer for one JSON value
    │       └── CopyButton.tsx            # inline per-line copy affordance
    ├── features/
    │   ├── sessions/
    │   │   ├── RawTab.tsx                # wraps parsed lines in <JsonInspector />
    │   │   ├── RawTab.css                # unchanged (existing pre / line / caption styles)
    │   │   └── RawTab.test.tsx           # extended with JsonInspector render assertions
    │   └── operations/                   # Phase 9b directory
    │       └── OperationCard.tsx         # expanded card body uses <JsonInspector /> for result/error
    └── styles/
        └── tokens.css                    # up to 4 new tokens for syntax color (M1 locks count)

working/
└── phase-8/
    └── designs/                          # design loop outputs
        ├── design.md
        ├── prototype.html
        ├── wireframes/
        └── wcag.py

docs/
├── README.md                             # task table cross-reference
├── features/
│   └── session-view.md                   # Raw tab section updates
├── playbooks/
│   └── modify-frontend-page.md           # JsonInspector extension pattern
└── dev-commands.md                       # mention JsonInspector tests if relevant

progress/
└── phase-8a.progress.md                   # NEW — chunk-by-chunk delivery log
```

No files deleted. No new component crates. No backend touch.

## Data Model

The inspector consumes a `JsonValue` (which is just `unknown` at the type system level, since JSON values are heterogeneous) plus the original source string for the copy operation.

```ts
type JsonInspectorProps = {
  /** The parsed JSON value. */
  value: unknown;
  /**
   * The original raw string the value was parsed from. Used by the
   * copy button so that the user gets byte-equivalent output of what
   * the parser actually saw, not the pretty-printed re-serialisation.
   */
  raw: string;
  /**
   * Default-collapsed when `raw.length > collapseThresholdBytes`.
   * Default-expanded otherwise. Locked at M1 design.
   */
  collapseThresholdBytes?: number;
  /**
   * Optional className for additional layout context (e.g. wider in
   * the Raw tab; narrower in the Job Center card body).
   */
  className?: string;
};
```

The inspector internally walks the `value` tree. For each level:
- **Object** `{ k1: v1, k2: v2 }` — rendered as a `<details>` element. Summary shows `{ k1: <preview>, k2: <preview>, ... }` with up to 3 preview keys + `…` if more. Open content shows full key-value list, one per line, indented.
- **Array** `[ v1, v2, v3 ]` — same pattern with `[ <preview>, <preview>, ... ]` summary.
- **Primitive** — single inline span with the syntax-color class for its type.
- **String** — quoted span with `--color-syntax-string`. Long strings (>120 chars) get a single-click "expand" affordance to wrap-or-truncate within the line.
- **Number** — `--color-syntax-number`.
- **Boolean** — `--color-syntax-boolean`.
- **Null** — `--color-syntax-null` (same token as boolean is also acceptable; M1 decides).
- **Object key** — `--color-syntax-key` (distinct from string value).

The recursive render is one component file (`JsonValue.tsx`) ~150 lines.

## Caps + caption (preserve verbatim)

The existing 20-line / 256 KB streaming caps and `describeCaption(...)` text are unchanged. Phase 8a only changes how each `kind: "json"` line renders. Specifically:

- Byte-cap caption ("Stopped at byte cap — full payload not [shown]") — unchanged.
- Line-cap caption ("Showing first N lines of the raw payload.") — unchanged.
- Both-caps fallback (byte-cap wins) — unchanged.
- Neither-cap caption ("Showing first N lines (full payload below the caps).") — unchanged.
- Non-JSON fallback row ("(non-JSON line)") — unchanged.

The line cap of 20 means the Raw tab has at most 20 inspector instances mounted. Each is small (one JSON value, parsed once). Render performance is bounded.

## UI/UX design gate

The design loop produces `working/phase-8a/designs/`:

- `design.md`:
  - Visual identity of the inspector: hairline borders, subtle syntax color, collapse affordances, copy-button placement.
  - Token additions: exact list (≤ 4) + WCAG AA contrast pairs measured for light + dark mode.
  - Long-string handling: wrap vs. truncate-with-expand; threshold value.
  - Long-line collapse threshold: byte count for default-collapsed JSON lines.
  - Object-summary preview: max keys shown (e.g. 3) and what " …" marker indicates remaining keys.
  - Aesthetic constraint: must read as an extension of the Phase 5 Archive-room aesthetic — restrained, hairline-based, mono-spaced where appropriate. Not a "developer tools" code-editor look.
- `prototype.html`: a single static HTML page showing the inspector against several synthetic JSON values:
  - Short flat object.
  - Long nested object (multi-page when expanded).
  - Array of mixed types.
  - String with embedded newlines / unicode escapes.
  - Top-level scalar (boolean, null, string).
  - Pathological case: deeply nested (5+ levels), large strings.
- `wireframes/`: per-state wireframes for collapsed-object, expanded-object, long-string-truncated, copy-hover.
- `wcag.py`: contrast measurement table for every new syntax-color token against the surface backgrounds (light + dark).

Design has its own external-reviewer round (codex `medium`).

## Documentation

Sweep 4 surfaces:

- `docs/README.md` — task table gains "Modify the Raw tab" (the playbook hop).
- `docs/features/session-view.md` — new "Raw tab JSON inspector" subsection: behavior, copy semantics, collapse thresholds, syntax color intent.
- `docs/playbooks/modify-frontend-page.md` — JsonInspector extension pattern: how to add a new syntax-color token within budget; how to override `collapseThresholdBytes` per consumer.
- `docs/dev-commands.md` — no substantive change unless inspector tests warrant a callout.

## Milestones

Two milestones. Two-commit pattern per chunk (impl + log). Three-reviewer rule applies. Codex reasoning effort `medium`.

### Milestone 1: UI/UX Design Gate

- Design loop produces `working/phase-8a/designs/` (design.md, prototype.html, wireframes, wcag.py).
- The four open design decisions get locked in `design.md`:
  - Exact syntax-color tokens (count and values).
  - Long-string handling (wrap vs. truncate-with-expand + threshold).
  - Long-line collapse threshold (default-collapsed byte count).
  - Object/array summary preview key count.
- `wcag.py` runs and emits the contrast table. All new tokens pass AA against both surfaces.
- External reviewer signs off on design.

Definition of done:
- Four design artifacts exist under `working/phase-8a/designs/`.
- The four operational decisions are recorded in `design.md`.
- WCAG AA holds for every new visible foreground/background pair.

### Milestone 2: Implementation + integration + tests + docs

- `apps/frontend/src/components/JsonInspector/`:
  - `JsonInspector.tsx` + `.css` + `.test.tsx`: public component, takes `value` + `raw` + optional `collapseThresholdBytes` + `className`. Wraps `JsonValue` with the copy button + collapse semantics.
  - `JsonValue.tsx`: recursive renderer. Handles objects, arrays, primitives. Native `<details>` for collapsibles.
  - `CopyButton.tsx`: inline copy affordance. Uses `navigator.clipboard.writeText(raw)`.
- `apps/frontend/src/styles/tokens.css`: up to 4 new syntax-color tokens per M1.
- `apps/frontend/src/features/sessions/RawTab.tsx`: wraps each `kind: "json"` line in `<JsonInspector />`. Fallback row treatment unchanged.
- `apps/frontend/src/features/operations/OperationCard.tsx` (Phase 9b file): the expanded-card pretty-JSON `<pre>` is replaced with `<JsonInspector />` configured for a single value (no NDJSON streaming context).
- Existing `RawTab.test.tsx`: extended to assert each parsed line renders an inspector + the copy button copies the original raw string.
- Documentation sweep (4 surfaces).
- Final progress log entry recording the close of Phase 8a.

Definition of done:
- All gates green (`cargo check --workspace`, `cargo test --workspace`, `bun test src`, `bunx tsc --noEmit`, `bun run build`, `bun run test:e2e`).
- Hex literal count stays at 24 (or documented amendment with WCAG justification).
- Token count: M1's locked additions land; documented in `tokens.css` and `progress/phase-8a.progress.md`.
- RawTab regression: every existing RawTab test still passes (caps, caption, fallback-row, abort-on-unmount).
- Job Center regression: every existing JobCenter test still passes; the result/error expanded body renders via JsonInspector.
- 4-surface doc sweep complete.
- Three-reviewer trail per milestone recorded.

## Acceptance Criteria

Phase 8a close is achieved when ALL of the following hold:

1. `apps/frontend/src/components/JsonInspector/` exists with `JsonInspector.tsx`, `JsonValue.tsx`, `CopyButton.tsx`, plus `.css` and `.test.tsx` siblings.
2. RawTab renders each `kind: "json"` line via `<JsonInspector />`. Fallback rows remain plain-text per Phase 5.
3. JobCenter OperationCard's expanded-body pretty-JSON `<pre>` is replaced with `<JsonInspector />`.
4. Each inspector instance: parses the value once; renders recursively; uses native `<details>` for collapse; honors `collapseThresholdBytes` (default-collapsed when `raw.length` exceeds the threshold).
5. Copy button copies the ORIGINAL raw string passed via the `raw` prop — not the pretty-printed re-serialisation.
6. Syntax color is applied via the tokens added in M1; AA contrast holds in both light and dark modes per `wcag.py`.
7. Existing RawTab caps + caption behavior is byte-equivalent to Phase 5 + Phase 7c state.
8. Four design artifacts exist under `working/phase-8a/designs/`.
9. Hex literal count stays at 24 (or documented amendment).
10. Token count: M1's locked additions land; total documented in `progress/phase-8a.progress.md`. Subsequent phases inherit the new token count.
11. No new runtime dependencies.
12. Bun-first invariant holds.
13. 4-surface doc sweep complete.
14. Three-reviewer trail per milestone recorded.
15. All prior-phase invariants preserved.

## Testing

- **JsonInspector unit**: render every primitive type; render flat object; render nested object (3+ levels); render mixed array; render top-level scalar; click copy + assert clipboard write; click collapse + assert `<details>` toggles; render long string + assert truncate-with-expand.
- **JsonValue branch coverage**: object / array / string / number / boolean / null / undefined-as-input (graceful render) / pathological key names (special characters, empty string).
- **RawTab regression**: every existing test passes (caps, captions, abort, fallback rows). New tests assert JsonInspector mounts for JSON lines + copy uses original raw.
- **OperationCard regression**: every existing JobCenter test passes. New test asserts result_json renders via JsonInspector.
- **WCAG**: `wcag.py` runs at M1 close and emits the contrast table; recorded in progress log.
- **Snapshot stability**: avoid full-DOM snapshots (they break on hash-suffix changes). Use targeted assertions (presence of key/value pairs, attribute values, CSS class names).

## Risks

| Risk | Mitigation |
|---|---|
| Bespoke inspector renders incorrectly on pathological JSON (deep nesting, extremely long strings, NUL bytes). | M1 prototype includes a pathological-case fixture. M2 unit tests cover deep nesting (5+ levels) and long strings explicitly. The recursive renderer uses React's reconciliation; no manual stack management. |
| Copy button writes the pretty-printed form instead of the original raw. | The component takes `raw: string` as a required prop and the button writes that prop verbatim. Tests assert byte-equivalence. |
| Syntax color tokens fail WCAG AA in dark mode. | M1's `wcag.py` measures both modes before any implementation lands. AA failures block M1 sign-off. |
| Inspector replaces JobCenter's pretty-JSON `<pre>` but the rendering format differs subtly (e.g. quote escaping). | OperationCard test compares the rendered output's textual content against the input value's `JSON.stringify(value, null, 2)` to assert structural equivalence. |
| `navigator.clipboard.writeText` requires user-gesture in some browser modes; test environment may not have it. | Use a mock in Bun's test environment; production browsers in the Playwright e2e environment provide it natively. The browser e2e exercises the copy path against real Chromium. |
| Bundle size grows due to the new component. | The component is small (~300 lines TS + ~100 lines CSS). Tree-shaking handles unused branches. M2 measures build output; documented in progress log. |
| Phase 7c's existing transcript rendering re-uses `<pre>` for code blocks; Phase 8a might tempt scope creep to apply JsonInspector there too. | Out-of-scope bans are explicit: no transcript changes in Phase 8a. Code-fence rendering in transcript stays as-is. |

## Resolved Decisions

These are pre-decided. Planner does not re-litigate.

1. **Two milestones**: design gate → implementation.
2. **Bespoke inspector — no library.** Codex's review specifically rejected general-purpose JSON viewers. Bundle + token discipline outweigh time savings.
3. **Native `<details>` for collapse.** Phase 5 M5/M6 precedent for browser-managed open state.
4. **Copy = original raw string.** The `raw` prop is required; the button writes it verbatim.
5. **Long-line default-collapsed** above a byte threshold locked at M1.
6. **RawTab caps + caption unchanged.** Existing 20-line / 256 KB streaming semantics are preserved verbatim.
7. **Schema-agnostic.** No tool-specific render branches (e.g. no special Claude Code shape recognition).
8. **No per-node copy.** Per-line copy only. Per-node is a future polish.
9. **Inspector is reused in JobCenter.** Phase 9b's pretty-JSON `<pre>` for `result_json` / `error_json` is replaced.
10. **Up to 4 new syntax-color tokens** permitted under the Phase 5 amendment pattern, with WCAG-AA documentation. M1 locks the count.
11. **UI/UX design gate is mandatory.** Phase 8a does not skip the design loop.
12. **Codex reasoning effort `medium`.** Carried from Phase 6 close.
13. **Pure frontend phase.** No backend touch. No new component crate.
14. **No new runtime dependencies.**

## Open Considerations

Flagged for M1 planner. Not pre-resolved.

- **Should `null` use its own token or share with boolean?** M1 design decides. Sharing saves a token; distinguishing reads better in dark mode.
- **Object-summary preview format**: `{ k1: …, k2: …, … }` versus `{ 4 keys }` versus a hybrid (show 3 keys, then count). M1 design picks one.
- **Long-string truncation indicator**: ellipsis (`…`), explicit `(truncated)` text, or a single click-affordance? M1 picks.
- **Whether the inspector should render typed shapes specially when the value happens to be a known parser type** (e.g. a recognised Claude Code envelope). Default is NO — schema-agnostic is a Resolved Decision. M1 may revisit if reviewers strongly push back, but doing so re-opens the schema-agnostic principle.
- **Bundle-size envelope.** M1 measures the prototype's contribution; M2 stays within. Documented in progress log.
- **Whether collapsed nested objects show a key-count badge** (e.g. `{ … 8 keys }`) or just `{ … }`. M1 design locks.
- **Copy-button placement**: persistent (always visible at right edge of the line) vs. hover-revealed. M1 design picks; persistent is more discoverable but adds visual weight.
