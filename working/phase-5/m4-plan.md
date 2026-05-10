# Phase 5 M4 Implementation Plan

> Source-of-truth: `working/phase-5.md` frozen at `05467ad`. Progress log HEAD: `27b0939`. M3a delivered at `959becb`; M3b at `6563495`. M3 fully closed.

## 1. Brief context

**M4** ships the **TranscriptView** — the first visible UI surface in Phase 5 that consumes the M3 parser output. Closing M4 makes the **Transcript** tab functional and shifts `DEFAULT_TAB_ON_SELECTION` from `"metadata"` → `"transcript"` per Resolved Decision #11. Skim remains a placeholder until M5; the other two tabs (Raw, Metadata) are unchanged from M2b.

Upstream that M4 consumes:

- **M3a** (`959becb`): pure parsers `parseClaudeCode` / `parseCodex`, `dispatchParser` + `PARSERS` registry, `buildSkim`, the `Message` / `MessageKind` / `ParseWarning` / `ParsedSession` types in `apps/frontend/src/features/sessions/parsers/types.ts`. Parsers are total — never throw.
- **M3b** (`6563495`): `streamRawText` + `useParsedSession(row): UseParsedSessionResult` (LRU(5) cache, `cacheEpoch` invalidation, AbortController on `storedSessionUid` change, in-flight coalescing). Discriminated state union: `idle | no_raw | loading | success | truncated | error`. `retry: () => void` always present.
- **M2b** primitives: keep-mounted Tabs shell at `SessionView.tsx`, sibling-CSS pattern, `RawTab` reference for tab-panel structure, `SessionMetadata` reference for typography rhythm, `relativeTimeFrom(now, iso)` already wired.

M4 is **brand-new visible surface** — codex catch density across Phase 5 is 25 cumulative blockers; M2b's design loop took 5 designer rounds (8 BLOCKING design defects from codex). M4 is similar in scope (new visible-surface family + WCAG measurement gate + new motion authorizations + long-corpus measurement). Plan defends against every documented codex precedent; see §6.

## 2. Spec source quotes (verbatim from `working/phase-5.md` at `05467ad`)

**Lines 699-717 — Transcript tab body:**

> Flat chronological render of `parsed.messages`. Reading-content layout: max-inline-size 70ch, generous vertical rhythm (16 px between messages, 24 px between adjacent same-kind messages with a kind-change gap of 32 px). All message bodies use `--font-chrome` `--text-base` `--leading-comfortable` except code segments which swap to `--font-mono`.
>
> Per kind:
>
> - **`user`**: panel with attribution row ("User · {relativeTime}", small caps, `--color-ink-muted`, `--text-xs`), body in `--color-ink`. Background `color-mix(in srgb, var(--color-accent) 5%, var(--color-surface))` (mirrors selected-row recipe). Code-fenced segments render as inline `<code>` (single-line) or `<pre>` (multi-line) at `--color-surface-raised` with `--font-mono`.
> - **`assistant`**: panel with attribution row ("Assistant · {relativeTime}"), body in `--color-ink`. Background `--color-surface` (default). Visually distinct from user via the tint differential — this differential MUST pass WCAG AA against `--color-ink` in both light and dark modes (M4 measurement gate).
> - **`tool_use`**: monospace block. Header line "Tool · {toolName}" in `--font-chrome` `--text-xs` `--color-ink-muted`; body is a collapsible `<details>` summary "Arguments" + `<pre>` of `JSON.stringify(input, null, 2)` in `--font-mono` `--text-sm`.
> - **`tool_result`**: header "Tool result · {toolName}" identical typography to `tool_use`. First 2 KB of body rendered; rest behind a quiet "Expand ({N more bytes})" text-link if larger. `<details>` element wraps the overflow.
> - **`system`**: single line in `--color-ink-muted` `--text-sm`, prefixed with a small `system ·` label. No panel chrome.
> - **`boundary`**: full-width 1 px hairline at `--color-border-strong` with a centered label in `--font-display` italic small-caps `--text-sm` `--color-ink-muted`. Copy: "SESSION RESUMED" (boundarySubtype === "session_resumed") or "CONVERSATION COMPACTED" (boundarySubtype === "compacted"). Same chapter-break treatment as Skim's boundary blocks (signature detail #1) — verified at M4 close. NEVER merged with neighbors.
> - **`unknown`**: muted single line "Unrecognized line: {first 80 chars}…" in `--font-mono` `--text-xs` — fallback for unparseable shapes.
>
> Each message panel carries a timestamp display: relative time as visible label (`relativeTimeFrom(now, msg.timestamp)`), absolute ISO via `<time dateTime="...">` and on `title=` hover. Timestamps with `null` value render as "—" (preserved from Phase 4 contract).
>
> If `parsed.truncated`, a small banner at the top of the Transcript: "Truncated at 5 MB — full payload not parsed. Use the **Open raw** anchor in the session header to inspect the full payload." Banner styled with warning status color and a `--motion-base` opacity entrance.
>
> If `parsed.warnings` is non-empty, a small dismissible banner: "{N} parse warnings — click to view." Expanding reveals the warnings list with `line {lineOrdinal} · {reason}` in `--font-mono` `--text-xs`; the messages stream still renders (warnings are non-blocking). Dismissing the banner is component-local state (re-arrives on next session selection).

**Lines 84-95 — Motion budget table (load-bearing rules):**

> | Surface | Property animated | Duration | Easing | Trigger |
> |---------|--------------------|----------|--------|---------|
> | Tab strip indicator | `transform: translateX` | 120 ms | `cubic-bezier(0.4, 0, 0.2, 1)` | active-tab change |
> | Tab panel cross-fade | `opacity` | 120 ms | `ease-out` | active-tab change |
> | Disclosure (`<details>`) expand/collapse | `block-size` (via `interpolate-size: allow-keywords`) | 200 ms | `ease-in-out` | user toggle |
> | Row hover tint | `background-color` | 80 ms | `linear` | pointer enter |
> | Selected row tint | `background-color` | 120 ms | `ease-out` | selection change |
> | **Deep-link pulse** | `background-color` (one-shot) | 600 ms | `ease-out` | URL-driven selection on mount only |
> | Session-pane content fade | `opacity` + `translateX(4px → 0)` | 200 ms | `ease-out` | `selectedRowKey` change |
> | Skim-block stagger on first paint | `opacity` + `translateY(4px → 0)` per block | 40 ms × N (max 8 blocks) | `ease-out` | first paint per session |
> | Truncation banner appearance | `opacity` | 120 ms | `ease-out` | `parsed.truncated` becomes true |

> Allowed animatable properties are `transform`, `opacity`, and `background-color` (background-color only on the surfaces that explicitly list it in §Motion: row hover, row selection, deep-link pulse). The documented `<details>` `block-size` exemption (§Performance budget) is the only layout-touching animation. No `width` / `height` / `top` / `padding` animations anywhere.

**Lines 1027-1040 — Milestone 4 DoD:**

> - `TranscriptView.tsx` + `.css` + `.test.tsx`: chronological message list with per-kind rendering (user / assistant / tool_use / tool_result / system / boundary / unknown), absolute + relative timestamps via `relativeTimeFrom`, monospace for code-fenced segments, collapsible long tool_result body (>2 KB), truncation banner when `parsed.truncated`, parse-warnings dismissible banner. Boundary case renders the chapter-break treatment (full-width hairline + small-caps Fraunces label) matching Skim's signature detail #1.
> - Wire into `SessionView`; **Transcript** tab now functional (Skim still placeholder until M5).
> - Shift `DEFAULT_TAB_ON_SELECTION` constant in `SessionView.tsx` from `"metadata"` to `"transcript"` (per Resolved Decision #11); update the corresponding `SessionView.test.tsx` assertion. One-line code change + one-line test change.
> - Long-corpus measurement step: synthetic 5k-message fixture; Playwright frame-timing capture or manual perf measurement on real Chromium. If > 16 ms per frame for scroll → escape-hatch slot 2 fires (`@tanstack/react-virtual` lands per documented spec policy). Otherwise virtualization stays deferred and the measurement is recorded in the progress log.
>
> Definition of done:
>
> - Every `MessageKind` renders with correct visual distinction; user-vs-assistant tint passes WCAG AA.
> - Truncation banner renders when `parsed.truncated`.
> - Parser warnings surface as a small dismissible banner without blocking the message stream.
> - Long-corpus measurement recorded in progress log; if escape-hatch slot 2 fires, the documented Chromium reproducer is captured per spec.
> - All gates green; no regression in M3 parser tests.

**Lines 1152-1156 — Resolved Decision #11 (default-tab):**

> M2 close → default = **Metadata** … M4 close → default shifts to **Transcript** (Transcript becomes functional; shows real content immediately). … The default-tab choice is a single constant `DEFAULT_TAB_ON_SELECTION` exported from `SessionView.tsx`; shifts at M4 are a one-line edit + one test update.

**Resolved Decision #16 (`oklch()` source-of-truth + 24 hex `@supports` fallback)**: tokens unchanged at M4.

**Spec line 66 (signature detail #1, chapter-break — referenced by M4's boundary case):**

> **The chapter break.** Skim view `boundary` blocks render as a full-width 1 px hairline with a centered small-caps Fraunces italic label ("SESSION RESUMED" / "CONVERSATION COMPACTED"). 32 px vertical breathing room above + below. Reads like a chapter break in a printed book — reinforces the archive metaphor without a single icon.

M4 must use the SAME visual recipe (so when M5 lands the user can compare). The treatment is shared between the Transcript boundary kind (M4) and the Skim boundary block (M5).

## 3. File list (exact paths)

**New files:**

- `apps/frontend/src/features/sessions/TranscriptView.tsx` (~280-360 lines projected)
- `apps/frontend/src/features/sessions/TranscriptView.test.tsx` (~600-800 lines; ~25-40 new bun:test cases)
- `apps/frontend/src/features/sessions/TranscriptView.css` (~220-300 lines)
- `apps/frontend/tests/fixtures/transcript-5k.builder.ts` — synthetic 5k-message fixture **builder** (NOT a checked-in JSONL); imported by the e2e measurement spec at runtime to keep `apps/frontend/src/` free of test-fixture bytes (decision Q5 — see §5)
- `apps/frontend/e2e/transcript-perf.spec.ts` — long-corpus measurement Playwright spec (Chromium-only frame-timing capture). Separate file (NOT extension of `inspection.spec.ts`) so the existing inspection happy path stays scoped.

**Modified files:**

- `apps/frontend/src/features/sessions/SessionView.tsx` (one-line constant change `"metadata"` → `"transcript"`; replace the `<TranscriptPlaceholder />` element in `panelContent` with `<TranscriptView row={row} now={now} />`; pass `now` through into the `panelContent` map)
- `apps/frontend/src/features/sessions/SessionView.test.tsx` (one-line assertion update for the default tab; new test asserting TranscriptView mounts on first selection; new test asserting tab state survives switching back to Transcript after Metadata visit — keep-mounted regression)

**No backend changes. No new dependencies (unless slot-2 fires per §9).**

## 4. Per-file specification

### 4.1 `TranscriptView.tsx`

**Props:**

```ts
export type TranscriptViewProps = {
  row: SessionRow;
  /** Pinned-now ISO. Required so relativeTime is deterministic in tests. */
  now: string;
};
```

**State machine (component-local React state):**

- `useParsedSession(row)` provides the data state machine — TranscriptView is a pure consumer.
- `warningsBannerDismissed: boolean` — component-local. Resets when `row.rowKey` changes (handled by `<SessionView key={selectedRowKey}>` parent remount; defensive `useEffect(() => setDismissed(false), [row.rowKey])` belt-and-suspenders, mirroring SessionView lines 223-226).
- NO `key={anything-tab-related}` on root or any child. Tab keep-mounted contract enforced at SessionView; TranscriptView's internal state must persist across tab switches (warnings banner stays dismissed; long-tool_result `<details>` stays expanded). The ONLY natural reset is `row.rowKey` change → outer parent remount → fresh state.

**Render branches (one-to-one with `useParsedSession` discriminant):**

```
state === "idle"        → <p className="transcript-empty">Select a session…</p>
state === "no_raw"      → <p className="transcript-not-imported">Not yet imported. Import in the action bar to fetch raw payload.</p>
state === "loading"     → <p className="transcript-loading">Reading session…</p>
state === "error"       → <p className="transcript-error">Failed to parse: {state.error.message}</p> + <button>Retry</button>
state === "success" |
state === "truncated"   → <TranscriptBody parsed={state.parsed} now={now} truncated={state === "truncated"} />
```

**`<TranscriptBody>` structure:**

```
<section className="transcript-body" aria-label="Session transcript">
  {truncated ? <TruncationBanner /> : null}
  {parsed.warnings.length > 0 && !warningsBannerDismissed
    ? <ParseWarningsBanner warnings={parsed.warnings} onDismiss={...} />
    : null}
  {parsed.messages.length === 0
    ? <p className="transcript-empty-stream">No messages parsed.</p>
    : parsed.messages.map((msg) => <MessageRow key={msg.messageIndex} msg={msg} now={now} />)
  }
</section>
```

**`<MessageRow>` (per-kind switch, single component returns one of seven sub-renders):**

```ts
switch (msg.kind) {
  case "user":         return <UserMessage msg={msg} now={now} />;
  case "assistant":    return <AssistantMessage msg={msg} now={now} />;
  case "tool_use":     return <ToolUseMessage msg={msg} now={now} />;
  case "tool_result":  return <ToolResultMessage msg={msg} now={now} />;
  case "system":       return <SystemMessage msg={msg} now={now} />;
  case "boundary":     return <BoundaryMessage msg={msg} />;       // no timestamp by Q7 below
  case "unknown":      return <UnknownMessage msg={msg} />;
  default:             { const _e: never = msg.kind; return null; } // exhaustiveness
}
```

**Per-kind render specs (selectors, semantics, copy verbatim from spec):**

| Kind | Element tree | Selectors | Notes |
|---|---|---|---|
| `user` | `<article class="msg msg-user"><header class="msg-attr">User · <time>{relativeTime}</time></header><div class="msg-body">{body w/ code-fence detection}</div></article>` | `.msg.msg-user`, `.msg-attr`, `.msg-body`, `.msg-code-inline`, `.msg-code-block` | Background = `color-mix(in srgb, var(--color-accent) 5%, var(--color-surface))` per spec line 705 + structural literal at line 938 |
| `assistant` | identical structure with `.msg-assistant` modifier | Background = `var(--color-surface)` | M4 WCAG measurement gate |
| `tool_use` | `<article class="msg msg-tool-use"><header>Tool · {toolName}</header><details><summary>Arguments</summary><pre>{JSON.stringify(parsedInput, null, 2)}</pre></details></article>` | `.msg-tool-use` | Header `--font-chrome --text-xs --color-ink-muted`; `<pre>` `--font-mono --text-sm` at `--color-surface-raised`. **Critical**: spec says "JSON.stringify(input, null, 2)" but the M3a parser already stringifies on emit (per parser table for Claude Code: `text: JSON.stringify(input, null, 2)`). M4 RE-RENDERS as `<pre>{msg.text}</pre>` (no double-stringify). See Q1 + Q10 below. |
| `tool_result` | `<article class="msg msg-tool-result"><header>Tool result · {toolName}</header><pre class="msg-tool-result-head">{firstChunk}</pre>{overflow ? <details><summary>Expand ({Nmore} more bytes)</summary><pre class="msg-tool-result-tail">{tail}</pre></details> : null}</article>` | `.msg-tool-result-head`, `.msg-tool-result-tail` | Threshold = `msg.bytes > 2048`; split point = first 2048 UTF-8 bytes (use `TextEncoder.encode(msg.text).slice(0, 2048)` to find the boundary, then walk back to a UTF-8 codepoint boundary so we never split mid-codepoint). See Q2 + Q8 below for `bytes` field rationale. |
| `system` | `<p class="msg msg-system"><span class="msg-system-glyph" aria-hidden="true">system ·</span> {msg.text}</p>` | `.msg-system` | No panel chrome per spec line 709 |
| `boundary` | `<div role="separator" class="msg msg-boundary"><span class="msg-boundary-label">{label}</span></div>` | `.msg-boundary` + `.msg-boundary-label` | Full-width 1 px hairline + centered Fraunces italic small-caps label per spec line 710. Copy: `"SESSION RESUMED"` for `boundarySubtype === "session_resumed"`; `"CONVERSATION COMPACTED"` for `"compacted"`. **Implementation**: CSS Grid with three columns `1fr auto 1fr`; first + third are 1 px `border-block-end` on a `<span aria-hidden="true">`; middle is the label. ARIA: `role="separator"` on the wrapper; the label remains in DOM order so screen readers announce the boundary. |
| `unknown` | `<p class="msg msg-unknown">Unrecognized line: {msg.text.slice(0, 80)}…</p>` | `.msg-unknown` | `--font-mono --text-xs` per spec line 711. Use `…` (single ellipsis char U+2026) not three dots. |

**Code-fenced segment detection (Q1 — render-time, see §5):**

A small helper inside TranscriptView:

```ts
function renderBodyWithCode(text: string): ReactNode[] {
  // Split on fenced code (```\n...\n```), preserve order, alternate text + <pre> nodes.
  // Inline code (single-backtick) detection: same algorithm, finer granularity inside text spans.
  // Detection runs at render time — parsers do NOT tag code spans (see Q1 rationale).
}
```

The detector handles three cases:
1. Triple-backtick fenced block → `<pre class="msg-code-block">{inner}</pre>`
2. Single-backtick inline code → `<code class="msg-code-inline">{inner}</code>`
3. Plain text → text node directly

The detector is **pure / deterministic / order-preserving** + small ( ~30-50 LOC ). Has its own unit tests covering: no fence; one fence; two fences; nested backticks (the inner pair becomes inline code); unterminated fence (renders as plain text — defensive).

**Timestamp display:**

```ts
function MessageTime({ iso, now }: { iso: string | null; now: string }) {
  if (iso === null) {
    return <time>—</time>;
  }
  const rel = relativeTimeFrom(now, iso);
  return <time dateTime={iso} title={iso}>{rel}</time>;
}
```

Spec line 713: "relative time as visible label … absolute ISO via `<time dateTime="...">` and on `title=` hover. Timestamps with `null` value render as `—`."

**`<TruncationBanner>`:**

```tsx
<div className="transcript-banner transcript-banner-truncation" role="status">
  Truncated at 5 MB — full payload not parsed. Use the <strong>Open raw</strong> anchor in the session header to inspect the full payload.
</div>
```

CSS animation: `animation: transcript-banner-fade var(--motion-base) var(--ease-out) both;` where the keyframe animates `opacity: 0 → 1` ONLY (not background-color — see codex precedent). Banner is rendered with the warning status color via `border-inline-start: 3px solid var(--color-warn)` + warm tint background `color-mix(in srgb, var(--color-warn) 8%, var(--color-surface))`. The "Open raw" word is **bolded text only** — there is no anchor element; the actual link lives in the session header per Resolved Decision #16.

**`<ParseWarningsBanner>`:**

Decision Q9: use `<details>`. Native disclosure inherits the M2b `<details>` block-size animation per spec line 88 (the documented exemption); accessible without custom focus management; matches M2b's RawTab + future M5 SkimView pattern.

```tsx
<details className="transcript-banner transcript-banner-warnings" onToggle={...}>
  <summary>{warnings.length} parse warning{warnings.length === 1 ? "" : "s"} — click to view.</summary>
  <ul>
    {warnings.map((w) => (
      <li key={`${w.lineOrdinal}-${w.reason}`}>line {w.lineOrdinal} · {w.reason}</li>
    ))}
  </ul>
  <button type="button" className="transcript-banner-dismiss" onClick={onDismiss}>Dismiss</button>
</details>
```

Dismissal: clicking "Dismiss" calls the parent's `onDismiss` which sets `warningsBannerDismissed: true`. Spec line 717: "Dismissing the banner is component-local state (re-arrives on next session selection)." Reset is automatic via the `<SessionView key={selectedRowKey}>` parent remount.

### 4.2 `TranscriptView.css`

**Selectors owned (cross-checked against `tokens.css` for every `var(--…)`):**

```
.transcript-body
.transcript-empty / .transcript-not-imported / .transcript-loading / .transcript-error / .transcript-empty-stream
.transcript-banner
.transcript-banner-truncation
.transcript-banner-warnings
.transcript-banner-dismiss
.msg                            (base panel)
.msg + .msg                     (16 px stack rhythm)
.msg-user + .msg-user, .msg-assistant + .msg-assistant, ...   (24 px same-kind rhythm)
.msg-user / .msg-assistant      (panel chrome + tint)
.msg-attr                       (attribution row, small caps)
.msg-body
.msg-code-inline / .msg-code-block
.msg-tool-use / .msg-tool-result
.msg-system
.msg-boundary / .msg-boundary-label
.msg-unknown
@keyframes transcript-banner-fade   (opacity 0 → 1 only)
```

**Token consumption set (M4 must NOT introduce new tokens — token count stays 83):**

- Color: `--color-ink`, `--color-ink-muted`, `--color-surface`, `--color-surface-raised`, `--color-accent`, `--color-border`, `--color-border-strong`, `--color-warn`
- Typography: `--font-chrome`, `--font-display`, `--font-mono`, `--text-xs`, `--text-sm`, `--text-base`, `--leading-comfortable`, `--measure`
- Spacing: `--space-1`, `--space-2`, `--space-3`, `--space-4`, `--space-6`, `--space-8`
- Radius: `--radius-sm`, `--radius-md`
- Motion: `--motion-base`, `--motion-disclosure`, `--ease-out`, `--ease-in-out`

The plan **forbids** `--space-5`, `--space-10`, `--space-12` (M2b r1 codex catch — these tokens DO NOT EXIST in `tokens.css`). Any spacing literal not in {1, 2, 3, 4, 6, 8} must be a multiple combination (e.g., 16 px = `var(--space-4)`, 24 px = `var(--space-6)`, 32 px = `var(--space-8)`).

**Motion authorizations (spec lines 84-95 + 1100):**

- `.transcript-banner-truncation` — `opacity` only (`animation: transcript-banner-fade var(--motion-base) var(--ease-out) both;`). NO `background-color` transition.
- `<details>` (warnings banner; long-tool_result expand) — relies on the global M2b `interpolate-size: allow-keywords` rule (verify it lives in `global.css`; if not, the disclosure snaps without animation — acceptable per spec line 124 fallback).
- NO transitions on `.msg`, `.msg-user`, `.msg-assistant`, `.msg-code-block`, `.msg-tool-use`, `.msg-tool-result`. NO hover background-color transitions on message bodies (transcript message bodies are NOT in the §Motion enumerated list).
- NO `:hover` transitions on `.msg`, `.msg-tool-use`, `.msg-tool-result` `<pre>` blocks. The hover state for `<details>` summary may show a `background-color` swap WITHOUT a `transition` declaration (instant on hover — acceptable; transition would violate the budget).
- Reduced-motion zero-out comes from the global rule in `global.css` (spec lines 101-110). M4 adds NOTHING to that rule.

**Light/dark mode:**

The user-vs-assistant tint passes through tokens automatically. `color-mix` on `--color-accent` 5% over `--color-surface` resolves differently in dark mode (deep-ink surface + amber-leaning accent) — measure both. See §6 + §7.

### 4.3 `TranscriptView.test.tsx`

Test obligations enumerated in §8.

### 4.4 `SessionView.tsx` (modification)

**Single-line change A:**

```diff
- export const DEFAULT_TAB_ON_SELECTION: TabId = "metadata";
+ export const DEFAULT_TAB_ON_SELECTION: TabId = "transcript";
```

**Single-line change B (in `panelContent` map at lines 243-248):**

```diff
- transcript: <TranscriptPlaceholder />,
+ transcript: <TranscriptView row={row} now={now} />,
```

**Cleanup change C:** Remove the `TranscriptPlaceholder` function (lines 341-348) since it's no longer reachable. Keep `SkimPlaceholder` until M5.

### 4.5 `SessionView.test.tsx` (modification)

- Replace the existing `expect(...).toBe("metadata")` style assertion against `DEFAULT_TAB_ON_SELECTION` with `expect(...).toBe("transcript")`.
- Add: "TranscriptView mounts when default tab activates" — render with a row, assert the transcript body section appears (look for `aria-label="Session transcript"` since the title might be ambiguous against the page title).
- Add: "Tab state survives switching to Metadata and back to Transcript" — keep-mounted regression. Mount, read TranscriptView's state-baked DOM (e.g. an expanded `<details>` triggered programmatically), switch to Metadata, switch back, assert the same DOM node (same `data-testid` or stable child) is still mounted (NOT remounted).

## 5. Open questions resolved

### Q1 — Code-fenced segment detection: parser-tagged or render-time?

**Decision: render-time.**

**Rationale:** (a) Parsers in M3a are total + spec-anchored to per-tool field paths; the spec's code-fence rule (line 705: "code-fenced segments swap to `--font-mono`") is a **rendering** concern, not a tool-format concern; making parsers tag code spans expands their type surface (`Message.text` becomes `Message.body: TextSpan[]`) and the M3 truth tables don't cover code-fence shapes — tagging would force a parser-test rewrite + a new contract type. (b) Render-time detection keeps the parser surface stable, lives next to the renderer's typography, is unit-testable in isolation, and respects the spec's silence about WHERE the detection runs. (c) The detection helper can be re-used by M5's user_turn block which also swaps fenced segments to mono per spec line 685.

### Q2 — Long tool_result threshold: `Message.bytes` or rendered string length?

**Decision: `Message.bytes` (the parser-computed UTF-8 byte length).**

**Rationale:** Spec line 708 says ">2 KB body". The parser already computes `bytes: number` per `Message` (M3a `types.ts` line 64) using approximate UTF-8 byte size during parsing. Using the parser-computed value is byte-count fidelity; the renderer doesn't re-encode. Constant: declare `TOOL_RESULT_OVERFLOW_BYTES = 2048` at the top of `TranscriptView.tsx` (private; not exported; no need to surface it as a tokens.css literal — it's a structural literal documented in the file header per the design-balloon mitigation pattern).

**For the rendered split-point**, use the same byte-counted scheme: `TextEncoder.encode(msg.text)` once, find the first 2048 bytes, walk back to a UTF-8 codepoint boundary (high bits != `10xxxxxx`), then `TextDecoder.decode` the first chunk + the tail. Test: "tool_result body of 2049 bytes splits cleanly with no codepoint mid-split" + "tool_result body of multi-byte UTF-8 (e.g. CJK or emoji) splits at a codepoint boundary".

### Q3 — Warnings banner dismiss: component-local or persistent?

**Decision: component-local (per spec line 717).**

**Rationale:** Spec verbatim: "Dismissing the banner is component-local state (re-arrives on next session selection)." Reset path = `<SessionView key={selectedRowKey}>` parent remount automatically destroys this component. Defensive belt: `useEffect(() => setDismissed(false), [row.rowKey])` inside TranscriptView. Test: "Warnings banner re-arrives after switching sessions and back."

### Q4 — When does the `"metadata"` → `"transcript"` shift happen?

**Decision: in this M4 chunk, at the same moment TranscriptView lands.**

**Rationale:** Per Resolved Decision #11 + spec line 1031: "shift `DEFAULT_TAB_ON_SELECTION` constant in `SessionView.tsx` from `"metadata"` to `"transcript"` ... One-line code change + one-line test change." Doing it earlier would default users to a non-functional Coming-soon placeholder (regression). Doing it later defers the spec-enumerated DoD item.

### Q5 — Synthetic 5k-message fixture: checked-in or generated?

**Decision: generated at runtime via a builder module; NOT checked-in.**

**Rationale:** A 5k-message JSONL would be ~1-3 MB committed. Existing fixture pattern (`tests/fixtures/claude_code/sample_session.jsonl` etc.) is for stable canonical fixtures consumed by Rust + frontend; M4's 5k fixture is purely for performance measurement (no truth-table contract). A builder module at `apps/frontend/tests/fixtures/transcript-5k.builder.ts` exports a deterministic generator (`buildTranscript5k(seed?: number): { tool: "claude_code"; jsonl: string }`) that produces 5,000 alternating user/assistant messages with interspersed `tool_use` + `tool_result` pairs and 3-5 boundaries. The Playwright spec invokes the builder at `beforeAll`. **Determinism**: the builder uses a seeded RNG (linear-congruential PRNG with `seed = 0x1234ABCD` default); each run produces byte-identical output so the trace is reproducible.

### Q6 — Long-corpus measurement: Playwright frame-timing or manual?

**Decision: Playwright e2e at `apps/frontend/e2e/transcript-perf.spec.ts`.**

**Rationale:** The repo already has a Chromium e2e infra at `apps/frontend/e2e/inspection.spec.ts` with backend startup harness; reusing that pattern produces a reproducible Chromium-against-real-React measurement that codex can run in its sandbox to verify. Manual measurement is non-reproducible.

**Methodology:**

1. `beforeAll`: start backend with `transcript-5k.builder.ts` output as the seeded fixture (writing the synthetic JSONL into the backend's temp dir before startup, mirroring `inspection.spec.ts` lines 47-58).
2. Test body: navigate to the seeded session, click Transcript tab, wait for `aria-label="Session transcript"` to render.
3. **Frame-timing capture**: use `page.evaluate` to wire a `requestAnimationFrame` callback that records `performance.now()` deltas across 100 consecutive frames during a programmatic `window.scrollBy(0, 100)` loop (one `scrollBy` per frame).
4. Compute median + p95 over the 100-frame array.
5. Acceptance criterion: **p95 < 16 ms per frame**. The median is more lenient (commodity Chromium can often hit 8 ms median while p95 spikes to 25 ms during layout passes); p95 < 16 ms is the spec-reasonable interpretation of "no jank".
6. Output: the spec writes the {median, p95, frame-count, fixture-seed, Chromium version} record to a deterministic JSON file (`apps/frontend/e2e/perf-results/transcript-5k.json`) which the developer copies into the M4 progress-log entry. The file is git-ignored (or written to `working/phase-5/perf/` if git-tracked is preferred — coordinator decides at landing time).
7. **Slot 2 trigger**: ONLY if p95 ≥ 16 ms — see §9.

### Q7 — Boundary `<time>` element: should the second `session_meta` boundary carry a timestamp?

**Decision: NO timestamp on `boundary` messages.**

**Rationale:** (a) Spec line 710 lists no timestamp affordance for the boundary kind — only the centered Fraunces label. (b) The chapter-break treatment (signature detail #1) is editorial, not chronological; adding a "session resumed at 14:23" line undermines the printed-book metaphor. (c) The actual timestamp is recoverable via the Raw tab (verifiability hatch). (d) The user-message-just-after-the-boundary will carry its own timestamp, providing the "when did the new session start" signal at the next message. M5's boundary-block treatment will follow the same rule.

### Q8 — Tool result rendering: define "body" for byte counting

**Decision: `Message.text` UTF-8 byte length (= `Message.bytes` since the parser computes the same).**

**Rationale:** `Message.text` is always a string by parser contract (M3a types.ts line 55). The parser computes `Message.bytes` as the approximate UTF-8 byte size during parsing (M3a types.ts line 64). M4 trusts that value rather than re-encoding for the threshold check; the rendered split-point uses `TextEncoder.encode(msg.text)` once. (The double-buffer cost is one encode per oversize tool_result; negligible in practice.)

### Q9 — Parse warnings expand: `<details>` or custom button?

**Decision: native `<details>` element.**

**Rationale:** (a) Native focus management (built-in keyboard support: Enter/Space toggles; arrow keys move focus naturally). (b) The M2b `<details>` exemption (spec line 88) already covers block-size animation; reusing the native element gets the animation for free without re-authorizing motion. (c) Matches the spec's own pattern for `tool_use`'s "Arguments" block (line 707) and `tool_result`'s overflow expand (line 708). (d) Avoids a custom expanded-state-management bug class.

### Q10 — Per-kind glyphs: Unicode or SVG?

**Decision: plain-text Unicode.**

**Rationale:** (a) Existing M2b chrome (`session ·` separators in attribution rows, badges) uses plain-text Unicode middle-dot (U+00B7). (b) SVG icons would re-introduce icon-library temptation (spec forbids icon library deps; see `forbidden_scope` in progress log). (c) The spec line 709 literal "system ·" already specifies the glyph as text. (d) The `<aside aria-hidden="true">system ·</aside>` pattern means screen readers don't speak the dot.

Per-kind text glyphs:

- `system` → `system ·` (spec verbatim line 709)
- `tool_use` → `Tool · {toolName}` (spec verbatim line 707)
- `tool_result` → `Tool result · {toolName}` (spec verbatim line 708)
- `user` → `User · {time}` (spec verbatim line 705)
- `assistant` → `Assistant · {time}` (spec verbatim line 706)

The middle dot character is U+00B7 (`·`); confirm it's in the `--font-display` and `--font-chrome` glyph subsets (Fraunces unicode-range U+00A0-00FF includes it; system sans always has it).

## 6. Codex catch precedents this plan defends against

| # | Phase 5 codex catch | Where caught | Surface in M4 | Plan defense |
|---|---|---|---|---|
| 1 | CSS unitless `scaleX(N)` violation — `scaleX(${width}px)` was invalid | M2b r1 #1 (invisible indicator) | Any inline `transform` in TranscriptView | **Plan forbids any inline `transform: ...(...px)` style for compositor-property functions.** The truncation banner uses keyframe `opacity` only (no transforms). Test: regression assertion that `TranscriptView.css` contains zero `scaleX(` / `scaleY(` / `rotate(` declarations (rg check in design artifact + a unit test that snapshots key CSS rules). |
| 2 | `key={anything-tab-related}` content remount breaks keep-mounted contract | M2b r1 #4 | TranscriptView root + children | **Plan mandates zero `key=` on TranscriptView root.** Only message-row `<MessageRow key={msg.messageIndex} />` (which is content-keyed, not tab-keyed). New SessionView.test.tsx case asserts the same DOM node persists across Transcript → Metadata → Transcript. |
| 3 | Undefined token references (`--space-5/10/12`) | M2b r1 #3 | TranscriptView.css | **Plan mandates `rg -n 'var\(--' TranscriptView.css \| sort -u` cross-checked against `tokens.css` declarations.** Developer command included in §9. The §4.2 token-consumption set is the allowed list. |
| 4 | WCAG fails one mode but passes the other (light vs dark asymmetry) | M2a r1 + r2; M2b r1 #1 | User-vs-assistant tint differential | **Design artifact `colors.md` enumerates BOTH light + dark contrast for every text-on-surface pair; M4 measurement gate per spec line 706.** See §7. |
| 5 | Motion budget violation — animated `color`/`border-color`/unlisted `background-color` transitions | M2b r1 #2 | Transcript message panels, `<details>` hover | **Plan explicitly forbids any `transition: color`, `transition: border-color`, `transition: background-color` on `.msg*` selectors.** The truncation banner uses `animation: opacity` only — never `transition: background-color`. Reviewer instruction: rg the new CSS for these patterns and BLOCK if found. |
| 6 | `background-color` exemption misuse on a non-enumerated surface | M2b r1 #2 | Truncation banner entrance | **Plan: truncation banner entrance is `opacity 0 → 1` only.** No `background-color` animation. The "warning status color" is statically applied via `border-inline-start` + `color-mix` — these are STATIC values, not animated. |
| 7 | Spec-literal violation (paraphrasing introduces semantic drift) | M3a r2 + r4 + coordinator-paraphrase r1 | Spec quotes in this plan | **Plan §2 quotes spec line 699-717 + 84-95 + 1027-1040 verbatim** with line numbers — no paraphrasing. Implementor reads the verbatim block, never the prose summary. |
| 8 | `tabIndex={0}` missing on focusable-childless active panel (WAI-ARIA APG) | M2b r1 #5 | TranscriptView's active panel | **TranscriptView's panel ALREADY has focusable children** (the `<details>` summary is focusable; the Retry button in error state is focusable). HOWEVER, the SessionView contract at lines 312-339 still applies `tabIndex={0}` on active Transcript panel unconditionally per the M2b Option-A decision. The plan does NOT change this. New test: assert `<div role="tabpanel" hidden={false} ... tabIndex={0}>` on the active Transcript panel. |
| 9 | Runtime-shape bug (`JSON.stringify(undefined) === undefined`) | M3a r3 | Tool-call body rendering | **Plan reads `msg.text` directly** (which the parser type-contracts as `string` per types.ts line 55). Test: a fixture where `tool_use.input === undefined` is reduced by the parser to `text: ""` (or whatever the parser outputs); TranscriptView never crashes on a `text === undefined` because the parser type contract forbids it. Defensive: TypeScript catches at compile time via `Message.text: string` non-nullable. |
| 10 | Status-color misuse (`--color-error` vs `--color-warn` semantic boundary) | M2b r1 #2 (.session-conflict-badge) | Truncation banner | **Spec line 715: "warning status color".** Plan uses `--color-warn` (NOT `--color-error`). The "Truncated" condition is a non-fatal capacity boundary, not an error. |
| 11 | Hex isolation regression (developer `#29a` JSDoc tripped rg) | M2b dev self-catch | TranscriptView source comments | **Plan: zero hex literals anywhere in TranscriptView.{tsx,css,test.tsx}.** Comment IDs use word form (`item 29a` not `#29a`). Developer pre-commit: `rg -n '#[0-9a-fA-F]{3,8}' apps/frontend/src/features/sessions/TranscriptView*` must be empty. |
| 12 | Asymmetric per-tool transformation (e.g. Codex `exec_command` stringifies, `exec_command_output` doesn't) | M3a r3 + r4 | Tool result rendering | **Plan reads `msg.text` as already-prepared by parser.** No re-stringification. M3a parser semantics are authoritative. |
| 13 | Silent-skip vs total-fallthrough confusion | M3a r2 | Unknown kind rendering | **Plan: `default` branch in MessageRow switch uses TypeScript exhaustiveness check (`const _: never = msg.kind`).** Adding a future MessageKind (e.g. `"thinking"`) fails the build until rendered. |

## 7. Design artifact obligations

**Path:** `working/phase-5/designs/m4-transcript/`

**Required files:**

### 7.1 `design.md`

Component tree (TranscriptView → branches → MessageRow → per-kind sub-renders), per-kind visual recipe (typography token, color token, padding, border, vertical rhythm), spacing rhythm (16 px stack + 24 px same-kind + 32 px kind-change + boundary 32 px breathing), motion (truncation banner opacity entrance + `<details>` block-size exemption), copy (verbatim spec strings for every visible label), a11y (each panel's role, label, focus order). Each rule anchored to spec line range.

### 7.2 `prototype.html`

Self-contained HTML demonstrating ALL 7 message kinds + truncation banner + parse-warnings banner + boundary chapter-break + long-tool_result expand interaction. Both light + dark themes via a CSS toggle (e.g. `data-theme="light|dark"` on `<html>`). NO React; vanilla HTML/CSS so codex can `curl` and parse it standalone. Must include:

- A standard mixed transcript (user → assistant → tool_use → tool_result → assistant → user)
- A truncated transcript (banner at top, ~10 messages then "...")
- A warnings-present transcript (banner at top, expandable list of warnings, dismiss button)
- A boundary-mid-stream transcript (assistant → boundary → user)
- A long-tool_result-collapsed (~3 KB body, collapsed showing first ~2 KB + "Expand (1024 more bytes)" affordance)
- A long-tool_result-expanded (same but `<details open>`)
- A side-by-side light/dark theme demonstration (toggle button + `data-theme` swap)

### 7.3 `motion.md`

Every animation enumerated:

| Surface | Property animated | Duration token | Easing token | Trigger | Reduced-motion behavior |
|---|---|---|---|---|---|
| `.transcript-banner-truncation` | `opacity` (0 → 1) | `--motion-base` (120 ms) | `--ease-out` | mount when `parsed.truncated` | zero-out via `global.css` |
| `<details>` (warnings + tool_result + tool_use Arguments) | `block-size` | `--motion-disclosure` (200 ms) | `--ease-in-out` | user toggle | snap to fully open/closed |
| `<details>` summary :hover (no transition; instant state swap if any) | n/a | — | — | pointer enter | n/a |

Plus an explicit "PROHIBITED" section listing properties M4 MUST NOT animate (color, border-color, width, height, top, padding, transform on message panels, background-color on message panels). Codex M2b r1 #2 catch precedent demands this enumeration.

### 7.4 `colors.md`

WCAG-AA contrast table covering EVERY text-on-surface pair the M4 surface introduces. Methodology: oklch → linear sRGB → relative luminance per CSS Color L4 §10 + WCAG 2.1 §1.4.3. The repo already maintains a contrast script for the M2a/M6 measurement; reuse it. If no script exists, the design artifact must include a step-by-step manual computation OR invoke the existing `colors.md` template from M2b's `working/phase-5/designs/m2b-shell/colors.md`.

Table rows (minimum):

| # | Foreground | Background | Light ratio | Dark ratio | AA pass (light) | AA pass (dark) |
|---|---|---|---|---|---|---|
| T01 | user message body `--color-ink` | `color-mix(--color-accent 5%, --color-surface)` | ≥ 7:1 | ≥ 7:1 | ✓ | ✓ |
| T02 | assistant message body `--color-ink` | `--color-surface` | ≥ 14:1 | ≥ 12:1 | ✓ | ✓ |
| T03 | attribution row `--color-ink-muted` on user tint | `color-mix(--color-accent 5%, --color-surface)` | ≥ 4.5:1 | ≥ 4.5:1 | required | required |
| T04 | attribution row `--color-ink-muted` on `--color-surface` | `--color-surface` | ≥ 4.5:1 | ≥ 4.5:1 | required | required |
| T05 | tool_use header `--color-ink-muted` on `--color-surface-raised` | `--color-surface-raised` | ≥ 4.5:1 | ≥ 4.5:1 | required | required |
| T06 | tool_use `<pre>` body `--color-ink` on `--color-surface-raised` | `--color-surface-raised` | ≥ 7:1 | ≥ 7:1 | ✓ | ✓ |
| T07 | tool_result expand affordance — quiet text-link styled with `--color-accent` on `--color-surface-raised` | `--color-surface-raised` | ≥ 4.5:1 (for non-text emphasis at `--text-sm`) | ≥ 4.5:1 | required | required |
| T08 | system label `--color-ink-muted` on `--color-surface` | `--color-surface` | ≥ 4.5:1 | ≥ 4.5:1 | required | required |
| T09 | boundary label (Fraunces italic small-caps `--color-ink-muted`) on `--color-surface` | `--color-surface` | ≥ 4.5:1 | ≥ 4.5:1 | required | required |
| T10 | warning banner copy `--color-ink` on `color-mix(--color-warn 8%, --color-surface)` | `color-mix(--color-warn 8%, --color-surface)` | ≥ 7:1 | ≥ 7:1 | ✓ | ✓ |
| T11 | warning banner accent border `--color-warn` (3 px stripe — non-text, AA non-text 3:1) on `--color-surface` | n/a | ≥ 3:1 | ≥ 3:1 | required | required |
| T12 | parse-warnings banner copy `--color-ink-muted` (italic, `<= --text-sm`) on `--color-surface` | `--color-surface` | ≥ 4.5:1 | ≥ 4.5:1 | required | required |
| T13 | unknown line `--color-ink-muted` on `--color-surface` | `--color-surface` | ≥ 4.5:1 | ≥ 4.5:1 | required | required |
| T14 | inline `<code>` body `--color-ink` on `--color-surface-raised` | `--color-surface-raised` | ≥ 7:1 | ≥ 7:1 | ✓ | ✓ |
| T15 | code block `<pre>` body `--color-ink` on `--color-surface-raised` | `--color-surface-raised` | ≥ 7:1 | ≥ 7:1 | ✓ | ✓ |
| T16 | tool_result first-2KB body `--color-ink` on default panel `--color-surface` | `--color-surface` | ≥ 14:1 | ≥ 12:1 | ✓ | ✓ |

**Critical**: M2b r1 #1 codex catch was a contrast pair the Claude reviewer approved despite a real ratio 3.97:1 light. Numerical rigor: the table must show actual ratios, not "✓" or "passes".

### 7.5 `wireframes/` directory

Text-art ASCII wireframes (matching M2b precedent):

- `wireframes/01-standard-mixed.txt` — user / assistant / tool_use / tool_result / assistant flow
- `wireframes/02-truncated.txt` — banner at top; "..." ellipsis at bottom indicating cap fired
- `wireframes/03-warnings-present.txt` — banner expanded showing warning list
- `wireframes/04-boundary-mid-stream.txt` — assistant → boundary chapter break → user
- `wireframes/05-long-tool-result-collapsed.txt` — first 2 KB visible, "Expand (1024 more bytes)" link
- `wireframes/06-long-tool-result-expanded.txt` — same but `<details open>` showing tail
- `wireframes/07-empty-stream.txt` — `parsed.messages.length === 0` "No messages parsed." copy
- `wireframes/08-error-state.txt` — `state === "error"` with Retry button
- `wireframes/09-system-message.txt` — sandwich of system message between assistant turns

### 7.6 External design review (codex)

**Recommendation: INVOKE codex on the design artifact.**

**Rationale:** M4 is high-arch-design-risk (parallel to M2b): new visible-surface family, new motion authorizations (truncation banner opacity entrance + `<details>` block-size on tool_result), WCAG measurement gate at spec line 706, signature-detail #1 chapter-break first-ship at the Transcript layer. M2b's design loop took 5 designer rounds with 8 BLOCKING design defects from codex. M4 should expect at least 2-3 codex design rounds (M3a M3b's gentler trajectories were logic-only).

**Iteration cadence:** Up to 5 designer rounds (Claude UI/UX reviewer + codex pair). Convergence trajectory matches M2b: codex round 1 likely catches 2-5 BLOCKING; round 2 catches 1-2; round 3 ideally APPROVED. If round 5 still has BLOCKING, escalate to coordinator (this would suggest spec ambiguity, not design weakness).

## 8. Test fixture obligations (`TranscriptView.test.tsx`)

Use Bun: `import { describe, it, expect, mock } from "bun:test"`. Use `@testing-library/react` + happy-dom. NO `jest.fn()`. NO `node:fs` (Bun-first invariant).

**Required test cases (≥ 25, projected ~30-40):**

### State machine

1. `state === "idle"` (row null) → empty-pane copy
2. `state === "no_raw"` (storedSessionUid null) → "Not yet imported" copy
3. `state === "loading"` → "Reading session…" copy
4. `state === "error"` → error message + Retry button; click Retry calls `result.retry()` (mock useParsedSession)
5. `state === "success"` (empty messages) → "No messages parsed." copy

### Per-kind rendering (one test per MessageKind = 7 tests)

6. Renders a `user` message with attribution row + body + relative time
7. Renders an `assistant` message with assistant-tinted background
8. Renders a `tool_use` message with `<details>` containing `<pre>` of args
9. Renders a `tool_result` message UNDER 2 KB without expand affordance
10. Renders a `system` message as muted single-line with `system ·` glyph
11. Renders a `boundary` message with `role="separator"` + Fraunces label "SESSION RESUMED"
12. Renders an `unknown` message with "Unrecognized line: …" prefix

### Boundary subtypes

13. boundarySubtype === "compacted" → label "CONVERSATION COMPACTED"
14. boundary message has NO `<time>` element (Q7)

### Timestamp display

15. Renders `<time dateTime title>` for non-null timestamp
16. Renders "—" for `null` timestamp
17. Relative time uses `relativeTimeFrom(now, iso)` deterministically

### Truncation banner

18. Banner renders when `state === "truncated"` with verbatim spec copy
19. Banner has `--color-warn` border per CSS classname
20. Banner does NOT render when `state === "success"`

### Parse warnings banner

21. Banner renders when `parsed.warnings.length > 0`
22. Banner is dismissible (click Dismiss → banner unmounts)
23. Banner re-arrives after `row.rowKey` change (component-local state reset)
24. Warnings list shows `line {N} · {reason}` format per warning

### Tool result expand

25. tool_result body of exactly 2048 bytes does NOT show expand affordance
26. tool_result body of 2049 bytes shows expand affordance
27. Expand affordance shows "Expand (N more bytes)" with correct N
28. Multi-byte UTF-8 tool_result body splits at codepoint boundary (defensive)

### Code-fence detection (helper unit tests)

29. Triple-backtick block becomes `<pre class="msg-code-block">`
30. Single-backtick inline becomes `<code class="msg-code-inline">`
31. Unterminated fence renders as plain text (no crash)

### Keep-mounted regression

32. Component does NOT remount on `now` prop change (stable identity check via `useRef` baked into a test helper)
33. Warnings-banner-dismissed state survives a `now` prop change

### Truth table coverage (cross-reference spec lines 797-810)

34. Empty messages array → "No messages parsed." copy (NOT a crash)
35. Single user message renders one panel
36. Mixed user → assistant → tool_use → tool_result renders four panels in order

### A11y

37. `<section>` has `aria-label="Session transcript"`
38. `<details>` summary is keyboard-focusable
39. Boundary `role="separator"` is announced (test via `getByRole("separator")`)

### Exhaustiveness

40. Adding a future MessageKind without rendering it = TypeScript build failure (compile-time check, not runtime test)

**Truth-table fixture matrix (each test should construct minimal `ParsedSession` literals):**

```ts
function makeMessage(overrides: Partial<Message>): Message { ... }
function makeParsed(messages: Message[], extras: Partial<ParsedSession>): ParsedSession { ... }
function mockUseParsedSession(state: UseParsedSessionState) { ... }  // bun:test mock module
```

## 9. Verification commands (developer must run; baselines from M3b close `6563495`)

| Command | Baseline (M3b close) | Expected delta after M4 |
|---|---|---|
| `cargo check --workspace` | clean | clean (frontend-only chunk) |
| `cargo test -p distill-portal-ui-api-contracts --features ts-bindings` | 1 passed / 1 ignored | unchanged |
| `bun run test` | 447 pass / 0 fail / 1619 expects across 29 files | **~470-490 pass / 0 fail / +50-100 expects across 30 files** (TranscriptView.test.tsx adds ~25-40 tests; SessionView.test.tsx +1-3 tests for default-tab + keep-mounted; one new file = transcript-5k builder counts only if its sanity tests live alongside) |
| `bun run build` | 21.34 kB CSS / 239.91 kB JS / 509ms | **CSS ~26-29 kB (TranscriptView.css adds 4-7 kB)** / **JS ~244-250 kB (TranscriptView.tsx adds 4-10 kB)** / build time within 1 SD of 509 ms |
| `bun run test:e2e` | 1 passed in 3.2s | **2 passed** (new `transcript-perf.spec.ts`); duration ~5-12s depending on 5k fixture scroll |
| `bunx tsc --noEmit` | clean | clean (exhaustiveness `never` check on MessageKind switch enforces this) |
| `rg -n '#[0-9a-fA-F]{3,8}' apps/frontend/src/ \| wc -l` | 24 | 24 (NO new hex literals) |
| `grep -cE '^\s*--' apps/frontend/src/styles/tokens.css` | 83 | 83 (NO new tokens) |
| `rg -n 'var\(--' apps/frontend/src/features/sessions/TranscriptView.css \| sort -u` | n/a | every var must exist in tokens.css (developer cross-checks; no `--space-5/10/12`) |
| `rg -n 'transition: (color\|border-color\|width\|height\|top\|padding)' apps/frontend/src/features/sessions/TranscriptView.css` | n/a | empty (motion budget) |
| `rg -n 'jest\.fn\\(\|node:fs\|child_process\|require\\(' apps/frontend/src/features/sessions/TranscriptView*.test.tsx` | n/a | empty (Bun-first invariant) |

## 10. Hex / token invariants

**Baselines (M3b close, `6563495`):** Hex 24, tokens 83.

**Expected delta after M4: ZERO.**

**Rationale:** Spec line 866 + 885 + Resolved Decision #16: "reuse before invent". M2a + M2b shipped the design-language tokens in bulk; M4 consumes them. The user-vs-assistant tint differential MUST be achievable from existing tokens; if WCAG fails for an unavoidable pair AND no existing token suffices, M4 escalates to the coordinator before adding a token (spec line 885: "Documented in the M6 progress-log entry"). The plan's prediction is that ALL pairs in §7.4's table T01-T16 pass with current tokens — confirmed in the design artifact's `colors.md` numerical measurement.

**If escalation fires:** the developer halts implementation, returns to coordinator with the failing pair + measured ratio; coordinator decides whether to amend tokens (rare; precedent: M2a r2 retint of `--color-warn` introduced the 4.21:1 `.title-cell-refresh` regression — a token bump must always come with a hex-isolation re-audit).

## 11. UI/UX gate decision

**Recommend `needs UI/UX work`.**

**Dispatch:** `frontend-design:frontend-design` skill into `working/phase-5/designs/m4-transcript/`.

**Rationale:** M4 is the FIRST visible UI surface in Phase 5 that consumes parsed data; introduces the per-kind visual treatment for 7 MessageKinds; the WCAG measurement gate at spec line 706; signature-detail #1 first-ship at the Transcript layer; new motion authorizations (truncation banner opacity entrance). Designer + Claude UI/UX reviewer + codex external review (per §7.6).

**Convergence expectation:** 2-5 designer rounds (codex precedent for visible-surface chunks: M2b = 5 rounds; M2a = 2 rounds; M1a = 2 rounds; M1b = 1 round).

**Artifact path:** `working/phase-5/designs/m4-transcript/{design.md, prototype.html, motion.md, colors.md, wireframes/}`

## 12. Recommended chunk split decision

**Recommendation: SINGLE-CHUNK (NOT split).**

**Rationale:**

The split candidates analyzed:

- **M4a (TranscriptView core)** + **M4b (truncation banner + parse-warnings banner + long-corpus measurement)**: superficially appealing because M4b has independent surface area. BUT:
  - The truncation banner copy + warning banner copy share design-artifact authority with the per-kind rendering (one `colors.md`, one `prototype.html`). Splitting forces two design loops + two codex passes + two progress-log chunks of design-loop overhead. M4 already has 5-round-codex risk; doubling the design loop count amplifies that.
  - The long-corpus measurement is a **closing step** that depends on the full TranscriptView being implemented and rendering 5k messages. It cannot run before TranscriptView lands. Putting it in a separate "M4b" chunk creates a chunk whose only deliverable is a measurement + maybe-one-dep-add — chunk-padding for low signal.
  - M3 was split into M3a/M3b because **the surfaces were different in kind** (pure logic vs async/effect/cache); both had real DoD content. M4's "M4a/M4b" candidate has the same kind of work (visible UI) split arbitrarily.
  - Spec line 1027-1040 enumerates Milestone 4 as a single DoD list; spec author's intent is one chunk.

**However, there is a fallback split if measurement triggers slot 2 (rare path):**

If the developer reaches the measurement step and p95 ≥ 16 ms, the chunk grows by `@tanstack/react-virtual` runtime dep + virtualization rewrite. In that case the coordinator may retroactively classify the implementation work as M4a (close at TranscriptView landing without virtualization, with measurement noted as the trigger) and dispatch a follow-up M4b for the virtualization integration. **This is a defensive split, not a planned one.** Plan recommends single-chunk by default; the coordinator decides at measurement time whether to retro-split.

## 13. Long-corpus measurement detailed protocol (escape-hatch slot 2)

### 13.1 Synthetic 5k-message fixture (Q5)

`apps/frontend/tests/fixtures/transcript-5k.builder.ts`:

```ts
export function buildTranscript5k(seed = 0x1234ABCD): { tool: "claude_code"; jsonl: string } {
  // Deterministic LCG: state = (state * 1664525 + 1013904223) & 0xFFFFFFFF
  // Generate 5,000 records:
  //   - Alternating user/assistant top-level type ("user" / "assistant")
  //   - Every 200th record: a "summary" entry (system kind)
  //   - Every 500th record: insert a tool_use + tool_result pair within the assistant content array
  //   - Every 1500th record: simulate a boundary by emitting a 2nd `session_meta` for a Codex-flavored sub-stream (mark fixture as mixed-tool-flavored OR keep claude_code-only with synthetic boundary text — coordinator decides)
  //   - Each text body: 80-200 chars of pseudo-Lorem
  //   - Each timestamp: monotonically incrementing by random 1-30 seconds from a seeded Date
  // Returns `tool: "claude_code"` + concatenated `jsonl: string` (newline-separated).
}
```

The builder is co-located with tests (NOT under `apps/frontend/src/`) so the production bundle never imports it. The Playwright spec imports it via relative path under `apps/frontend/`.

### 13.2 Playwright measurement spec (Q6)

`apps/frontend/e2e/transcript-perf.spec.ts`:

```ts
// Pseudocode outline:
test.describe.serial("transcript long-corpus performance", () => {
  let backend: BackendHandle;
  test.beforeAll(async () => {
    const { jsonl } = buildTranscript5k();
    backend = await startBackend({ seed: { claudeProject: "...", claudeSessionId: "...", jsonl: Buffer.from(jsonl) } });
  });
  test.afterAll(async () => await backend?.stop());

  test("scrolls 5k transcript without per-frame jank", async ({ page }) => {
    await page.goto("/");
    await openSession(page);
    await activateTranscriptTab(page);
    await page.waitForSelector('[aria-label="Session transcript"]');

    // Frame timing capture
    const frames = await page.evaluate(async () => {
      const samples: number[] = [];
      let last = performance.now();
      let count = 0;
      return new Promise<number[]>((resolve) => {
        function tick() {
          const now = performance.now();
          samples.push(now - last);
          last = now;
          count += 1;
          if (count >= 100) return resolve(samples);
          window.scrollBy(0, 100);
          requestAnimationFrame(tick);
        }
        requestAnimationFrame(() => { last = performance.now(); requestAnimationFrame(tick); });
      });
    });

    const sorted = [...frames].sort((a, b) => a - b);
    const median = sorted[50];
    const p95 = sorted[95];
    const result = { median, p95, frameCount: frames.length, fixtureSeed: "0x1234ABCD" };
    // Write to JSON file or attach as test artifact for the progress log
    test.info().attach("transcript-5k-perf.json", { body: JSON.stringify(result), contentType: "application/json" });
    // Acceptance criterion (spec line 1032): p95 < 16ms (60 fps target)
    expect(p95).toBeLessThan(16);
  });
});
```

### 13.3 Slot 2 trigger paths

**Path A — slot 2 NOT fired (p95 < 16 ms; expected):**

- Developer runs the spec; it passes; the JSON output is captured.
- Progress log records the measurement: `transcript-5k median {X}ms / p95 {Y}ms — virtualization deferred. @tanstack/react-virtual slot 2 reserved for a future phase if real-corpus data demands it.`
- Dependency budget remains 1/2 (`focus-trap-react` orphan-installed only).
- M4 closes single-chunk.

**Path B — slot 2 FIRED (p95 ≥ 16 ms; rare):**

- Developer halts at the measurement step.
- Coordinator decides: retro-split into M4a (current TranscriptView unchanged, lands with the failing measurement noted) + M4b (`@tanstack/react-virtual` integration + remeasurement).
- M4b dispatch obligations:
  - `bun add @tanstack/react-virtual@^3` (NOT `npm` — Bun-first; spec forbids npm).
  - Refactor `<TranscriptBody>` to use `useVirtualizer` over `parsed.messages` with row-height estimation.
  - Re-run `transcript-perf.spec.ts`; assert p95 < 16 ms after virtualization.
  - Capture the Chromium reproducer: a Playwright trace file (via `await page.context().tracing.start({ screenshots: true, snapshots: true })` wrapping the failing scroll loop on the pre-virtualization commit) committed to `working/phase-5/perf/transcript-5k-pre-virt-trace.zip` so the reproducer is self-evident.
  - Update `docs/dependency-rules.md`: dep budget 2/2 — Phase 6+ has no further escape-hatch slots without spec amendment.
  - Update progress log + 8-doc sweep accordingly.

**The plan provides a concrete implementation path for both branches.**

## 14. Progress-log update obligations

After M4 lands (two-commit pattern: impl commit + log commit):

- Record three-reviewer rule rounds (codex + Claude UI/UX + backend-protection)
- Record codex catch density across the chunk (BLOCKING / NIT / approved)
- Record verification gate baselines + deltas (per §9 table)
- Record token / hex / dep-budget invariants (per §10)
- Record the long-corpus measurement result (per §13.3)
- Update `Resolved Decisions` if any new ones surface during the chunk
- Update `UI/UX Design Log` with the M4 design loop trail (designer rounds, codex rounds, blocking findings)

## 15. Architectural alignment summary

- **Bun-first**: `bun:test` + `mock` from `bun:test`; happy-dom + `@testing-library/react`; no `jest.fn()`, no `node:fs`, no `child_process`, no `npm` / `node`.
- **Protected paths**: zero touched. All M4 work under `apps/frontend/src/features/sessions/` + `apps/frontend/e2e/` + `apps/frontend/tests/fixtures/`.
- **Dep budget**: 1/2 → 1/2 (no slot 2 fire under expected path).
- **Token discipline**: 83 → 83.
- **Hex isolation**: 24 → 24.
- **Spec freeze**: `05467ad`. Plan quotes spec verbatim, not paraphrased.
- **Phase 4 invariants**: filters/sort/persistence unchanged; Phase 4 click-time intersection regression tests still pass (M4 doesn't touch `App.tsx` selection wiring).

### Critical Files for Implementation

- /home/huwei/ai_codings/distill-portal/apps/frontend/src/features/sessions/TranscriptView.tsx
- /home/huwei/ai_codings/distill-portal/apps/frontend/src/features/sessions/TranscriptView.css
- /home/huwei/ai_codings/distill-portal/apps/frontend/src/features/sessions/TranscriptView.test.tsx
- /home/huwei/ai_codings/distill-portal/apps/frontend/src/features/sessions/SessionView.tsx
- /home/huwei/ai_codings/distill-portal/apps/frontend/e2e/transcript-perf.spec.ts

---

## Summary

**M4 plan delivered.** The plan is self-contained: a developer + designer can execute without reading the spec — every load-bearing rule is anchored to spec line ranges, every Q1-Q10 has a recommendation + rationale, every Phase 5 codex precedent (13 catch classes) maps to a defense in §6.

**Key decisions:** single-chunk recommended (split is defensive only); `needs UI/UX work` gate with codex-invoked design review (per M2b precedent); render-time code-fence detection (Q1); `Message.bytes` for tool_result threshold (Q2/Q8); component-local warnings dismiss (Q3); generated 5k fixture via builder module (Q5); Playwright frame-timing at p95 < 16 ms acceptance (Q6); no boundary timestamp (Q7); native `<details>` for warnings expand (Q9); Unicode glyphs only (Q10).

**Read-only constraint note:** The planner runtime forbade Write/Edit tools. The complete plan content above must be persisted by the parent coordinator to `working/phase-5/m4-plan.md` verbatim. Critical files for implementation listed above.
