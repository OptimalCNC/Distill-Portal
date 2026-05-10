# Phase 5 M5 Implementation Plan

> Source-of-truth: `working/phase-5.md` frozen at `05467ad`. M4 closed cleanly. Test/build baseline post-M4: `bun run test` 491 pass / 0 fail / 1729 expects across 30 files; `bun run build` CSS 28.58 kB · JS 260.79 kB; `bunx tsc --noEmit` clean; hex 24; tokens 83.

## 1. Brief context

**M5 ships SkimView**, the second editorial reading surface in Phase 5 — and the chunk that makes the Skim tab functional, completing all four tabs (Transcript, Skim, Raw, Metadata). M4 already shifted `DEFAULT_TAB_ON_SELECTION` to `"transcript"`; M5 keeps that default (Resolved Decision #11 step 3: "M5 close → default stays Transcript"). M5 only flips the placeholder slot.

What M5 composes (does NOT refactor):

- **`useParsedSession`** (M3b, with M4 patch) — discriminated state union; M5 consumes `state in {success, truncated}` and reads `parsed.skim` / `parsed.messages`.
- **`TranscriptView`** (M4) — M5 reuses it scoped to a messageIndex range to render the "Expand to raw messages" affordance under each `user_turn` and the body of `agent_only` blocks. Per Resolved Decision #9: "Skim 'Expand to raw messages' reuses TranscriptView scoped to messageIndex range (typed messages, not raw NDJSON)."
- **`buildSkim`** (M3a) — `SkimBlock[]` already produced from the truth-table matrix; M5 walks the array.
- **`Tabs`** primitive (M2b) and `<SessionView>` shell (M2b + M4) — wiring point.
- **27-token consumption set** from M4 — M5 introduces ZERO new tokens.

M5 is the **second visible UI family** (M4 was the first). The codex catch density across visible-surface chunks in Phase 5 is high: M2b ran 5 designer rounds with 8 BLOCKING design defects; M4 ran multiple designer rounds + a codex external review. M5 is similar scope (new visible-surface family + WCAG measurement gate + composition with M4's TranscriptView) and should expect a comparable design loop — see §11.

## 2. Verbatim spec quotes

**Lines 679-697 — Skim tab (verbatim):**

> ### Skim tab
>
> Renders `parsed.skim` (the `SkimBlock[]` from `buildSkim`). The skim layout is editorial: blocks stack vertically with 24 px breathing room between same-kind blocks, 32 px between different kinds. Block content respects the 70ch reading measure. First-paint stagger animation per the motion budget (max 8 blocks staggered).
>
> For each block kind:
>
> - **`user_turn`**: renders the user message inline (verbatim text in `--font-chrome` `--text-base`, code-fenced segments swap to `--font-mono` with `--color-surface-raised` background). Panel padding 24 px 32 px. Below it, a collapsible `<details>` element with summary "Agent reaction (N messages)" and body containing the disabled-summary placeholder copy:
>
>   > Summary disabled — generation deferred to a later phase. Use "Expand to raw messages" to read the agent's response inline.
>
>   The disabled placeholder is set in `--color-ink-muted` with a 4 px left-border in `--color-border` (visual cue: this is a placeholder, not real content). Followed by an "Expand to raw messages" affordance (button styled as a quiet text link): clicking renders a scoped `<TranscriptView>` component restricted to the messageIndex range `[block.start+1, block.end]` (the agent reaction).
>
> - **`boundary`** (signature treatment — chapter break): rendered as a full-width 1 px hairline at `--color-border-strong` with a centered label in `--font-display` italic small-caps at `--text-sm`, `--color-ink-muted`. 32 px vertical breathing top + bottom. Copy: "SESSION RESUMED" for `meta.subtype === "session_resumed"`; "CONVERSATION COMPACTED" for `meta.subtype === "compacted"`. Implemented as `<hr role="separator">` + adjacent `<span>` overlaid via CSS Grid. NEVER merged into a neighbor. This is signature detail #1 — verified at M5 close.
>
> - **`agent_only`**: collapsed by default. Summary line in `--font-chrome` `--text-sm` `--color-ink-muted`: "Agent-only session ({count} messages)". Expanding reveals a scoped TranscriptView spanning `[block.start, block.end]`. PRD line 256 mandates collapsed default. Visual treatment: muted panel with hairline border, no accent tint.
>
> - **`oversized_user_message`**: collapsed by default. Header in `--font-chrome` `--text-sm`: "Oversized user message ({sizeKB} KB) — collapsed by default". Expanding shows the verbatim message text in `--font-mono` (since these are typically pasted-in dumps). NEVER summarized (PRD line 257). Visual treatment: warning-tinted left border (status warning color) so the user notices the size signal.
>
> The Skim view NEVER renders silently blank for any state — the disabled placeholder always carries copy per PRD line 223.

**Lines 1042-1059 — Milestone 5 DoD (verbatim):**

> ### Milestone 5: SkimView with four block kinds
>
> - `SkimView.tsx` + `.css` + `.test.tsx`: renders all four block kinds.
> - `user_turn`: user message inline + collapsible "Agent reaction" disclosure with the disabled placeholder copy + "Expand to raw messages" affordance reusing TranscriptView scoped to messageIndex range.
> - `boundary`: divider with "Session resumed" / "Conversation compacted" copy; NEVER merged into a neighbor.
> - `agent_only`: collapsed by default; expanding reveals scoped TranscriptView.
> - `oversized_user_message`: collapsed by default; expanding reveals verbatim text; NEVER summarized.
> - Wire into `SessionView`; **Skim** tab now functional. All four tabs operational.
>
> Definition of done:
>
> - No-user-msg session shows single collapsed `agent_only` block.
> - Single-oversize-user-msg session shows single `oversized_user_message` block (no other content).
> - Boundary blocks render between turns when present in fixtures.
> - Disabled-summary placeholder copy renders verbatim under every `user_turn` (text matches PRD intent).
> - "Expand to raw messages" reveals scoped TranscriptView restricted to the turn's messageIndex range.
> - WCAG AA on every new visible color pair.
> - All gates green.

**Lines 84-95 — Motion budget table (load-bearing — only `transform`/`opacity`/`background-color` enumerated; verbatim):**

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
> | Toast queue (existing Phase 4) | unchanged | unchanged | unchanged | n/a |

**Spec line 1100 (acceptance criteria):**

> Allowed animatable properties are `transform`, `opacity`, and `background-color` (background-color only on the surfaces that explicitly list it in §Motion …). The documented `<details>` `block-size` exemption (§Performance budget) is the only layout-touching animation. No `width` / `height` / `top` / `padding` animations anywhere. Skim-block stagger capped at 8 blocks.

**Lines 233-269 — Data Model (verbatim, abridged for the load-bearing types):**

> ```ts
> export type MessageKind = "user" | "assistant" | "tool_use" | "tool_result" | "system" | "unknown" | "boundary";
> export type Message = { lineOrdinal: number; messageIndex: number; timestamp: string | null; kind: MessageKind; text: string; toolName?: string; boundarySubtype?: "session_resumed" | "compacted"; raw: string; bytes: number };
> export type BlockKind = "user_turn" | "boundary" | "agent_only" | "oversized_user_message";
> export type SkimBlock = { kind: BlockKind; start: number; end: number; meta?: Record<string, string | number> };
> ```

`start` and `end` are inclusive `messageIndex` values (NOT `lineOrdinal`). The `oversized_user_message` block carries `meta.sizeBytes`. The `agent_only` empty-stream sentinel carries `meta.empty: 1`. The `boundary` block carries `meta.subtype: "session_resumed" | "compacted"`.

**Lines 422-491 — useParsedSession contract (abridged):**

> Discriminated state union: `idle | no_raw | loading | success | truncated | error`; `retry: () => void` always present. Cache LRU(5) keyed by `${storedSessionUid}::${tool}`; epoch invalidation on Rescan / Import; in-flight coalescing.

**Resolved Decision #9 (verbatim, line 1150):**

> 9. **Skim "Expand to raw messages" reuses TranscriptView** scoped to messageIndex range (typed messages, not raw NDJSON; Raw tab is the verifiability hatch for raw bytes).

**Resolved Decision #11 (verbatim, lines 1152-1156):**

> M5 close → default stays **Transcript** (Skim becomes functional but Transcript is the better landing surface until LLM summaries land in a future phase). The default-tab choice is a single constant `DEFAULT_TAB_ON_SELECTION` exported from `SessionView.tsx`; shifts at M4 are a one-line edit + one test update.

**Resolved Decision #16 (line 691, signature detail #1, byte-equivalent recipe):**

> Boundary chapter-break treatment shared between Transcript boundary kind (M4) and Skim boundary block (M5). "This is signature detail #1 — verified at M5 close."

**Spec line 1100 (signature details verification):**

> Six signature details verified in M6 close: chapter break (skim boundary)…

## 3. File list

**New files:**

- `/home/huwei/ai_codings/distill-portal/apps/frontend/src/features/sessions/SkimView.tsx` (~450-650 lines projected; per-block-kind sub-renders + scoped TranscriptView wiring + state-branch dispatch)
- `/home/huwei/ai_codings/distill-portal/apps/frontend/src/features/sessions/SkimView.test.tsx` (~700-1000 lines; ~35-50 bun:test cases)
- `/home/huwei/ai_codings/distill-portal/apps/frontend/src/features/sessions/SkimView.css` (~250-400 lines; reuses M4 motion + token discipline)

**Modified files:**

- `/home/huwei/ai_codings/distill-portal/apps/frontend/src/features/sessions/SessionView.tsx` — replace `<SkimPlaceholder />` in `panelContent` with `<SkimView row={row} now={now} />`; remove `SkimPlaceholder` function (no longer reachable). NO change to `DEFAULT_TAB_ON_SELECTION` (stays `"transcript"` per Resolved Decision #11 step 3).
- `/home/huwei/ai_codings/distill-portal/apps/frontend/src/features/sessions/SessionView.test.tsx` — update the assertion at line 255-291 (`'Coming in Milestone 5'` → assertion that SkimView mounts on Skim activation; verify the disabled placeholder copy lands instead). New keep-mounted regression for Skim ↔ Transcript ↔ Skim flow.
- `/home/huwei/ai_codings/distill-portal/apps/frontend/src/features/sessions/TranscriptView.tsx` — additive prop: `messageRange?: { start: number; end: number }` (defaults to "all messages"). When supplied, the body slices `parsed.messages.slice(start, end + 1)` before rendering the `<ol>`. **No CSS or visual change**; only the projection logic. This is the minimal-touch composition path (Q1 below).
- `/home/huwei/ai_codings/distill-portal/apps/frontend/src/features/sessions/TranscriptView.test.tsx` — add ≥3 tests for the new prop: full range omitted = renders all messages (regression); range `{start: 1, end: 3}` renders only messages 1..3 inclusive; out-of-bounds range clamps gracefully (defensive).
- `/home/huwei/ai_codings/distill-portal/apps/frontend/e2e/inspection.spec.ts` — line 206: replace `await expect(skimPanel).toContainText("Coming in Milestone 5")` with an assertion against SkimView's rendered surface (e.g., `await expect(skimPanel).toHaveAttribute("aria-label", "Session skim outline")` or equivalent stable hook). One-line fix, plus optionally a small further interaction (expand a `<details>`).
- `/home/huwei/ai_codings/distill-portal/apps/frontend/src/App.test.tsx` — likely no changes (M4-era test landed at line 3276 stays correct: default tab is Transcript, M5 doesn't move it). Audit at implementation time; no new tests required unless one stale `Coming in Milestone 5` reference is found via `grep`.

**No backend changes. No new dependencies. No spec edits.**

## 4. Per-file specs

### 4.1 `SkimView.tsx`

**Props:**

```ts
export type SkimViewProps = {
  row: SessionRow;
  /** Pinned-now ISO; deterministic relative time in tests. */
  now: string;
};
```

**State machine (component-local React state):**

- `useParsedSession(row)` provides the data state machine — SkimView is a pure consumer (mirrors TranscriptView).
- The `<details>` per-block expanded state is **native `<details>` open** (browser-managed; persists across tab switches because the React node identity is stable). NO mirror state in React.
  - Spec line 88: `<details>` block-size animation is the documented exemption. Native element gets the animation for free.
  - Per M4 keep-mounted contract: never set `key=` on SkimView root or per-block tree based on tab. Block-rows ARE keyed by `block.start` (content-keyed, not tab-keyed) for React reconciliation across re-renders triggered by `now` prop change.
- "Expand to raw messages" toggle: ALSO native `<details>`. The user_turn body has nested disclosures: outer "Agent reaction (N messages)" `<details>`, inner sibling "Expand to raw messages" affordance. Q3 below resolves to: the affordance is a SIBLING of the disabled-placeholder block, NOT nested in the outer details — see Q3.
  - Decision: implement "Expand to raw messages" as a `<details>` whose `<summary>` reads "Expand to raw messages" and whose body contains `<TranscriptView row={row} now={now} messageRange={{ start: block.start + 1, end: block.end }} />`. This makes the affordance keyboard-accessible and inherits the `<details>` motion authorization without custom expanded-state-management.

**Render branches (one-to-one with `useParsedSession` discriminant — mirrors TranscriptView):**

```
state === "idle"        → <p className="skim-empty">Select a session to read its skim outline.</p>
state === "no_raw"      → <p className="skim-not-imported">This session has not been imported yet — only the source-side metadata is available. Click <strong>Import</strong> in the action bar to fetch the raw payload.</p>
state === "loading"     → <p className="skim-loading">Reading session…</p>
state === "error"       → <div className="skim-error-block"><p className="skim-error">Could not load session: {error.message}.</p><button>Retry</button></div>
state === "success" |
state === "truncated"   → <SkimBody parsed={state.parsed} now={now} truncated={state === "truncated"} row={row} />
```

State-branch copy is byte-equivalent to TranscriptView's (Q4 below). Only the section className family changes (`skim-*` not `transcript-*`).

**`<SkimBody>` structure:**

```tsx
<section className="skim-body" aria-label="Session skim outline">
  {truncated ? <TruncationBanner /> : null}
  {parsed.warnings.length > 0 && !warningsBannerDismissed ? <ParseWarningsBanner ... /> : null}
  {parsed.skim.length === 0 ? <p className="skim-empty-stream">No skim blocks parsed.</p> :
    <ol className="skim-stream">
      {parsed.skim.map((block, idx) => (
        <SkimBlockRow
          key={`${block.kind}-${block.start}-${block.end}`}
          block={block}
          parsed={parsed}
          now={now}
          row={row}
          staggerIndex={Math.min(idx, 8)}  /* max 8 blocks staggered per spec line 681 */
        />
      ))}
    </ol>
  }
</section>
```

**Empty-skim sentinel handling (Q6 below):**

The empty-stream sentinel from `buildSkim.ts` line 55: `{ kind: "agent_only", start: 0, end: -1, meta: { empty: 1 } }`. In this case `parsed.skim.length === 1` AND `block.end < block.start` → render the `agent_only` summary line "Agent-only session (0 messages)" with the body collapsed; expanding shows the spec-mandated empty-pane placeholder copy. Per spec line 697: "The Skim view NEVER renders silently blank for any state — the disabled placeholder always carries copy."

**`<SkimBlockRow>` (per-kind switch, exhaustiveness check):**

```ts
function SkimBlockRow({ block, parsed, now, row, staggerIndex }: SkimBlockRowProps) {
  switch (block.kind) {
    case "user_turn":               return <UserTurnBlock block={block} parsed={parsed} now={now} row={row} staggerIndex={staggerIndex} />;
    case "boundary":                return <BoundaryBlock block={block} staggerIndex={staggerIndex} />;
    case "agent_only":              return <AgentOnlyBlock block={block} parsed={parsed} now={now} row={row} staggerIndex={staggerIndex} />;
    case "oversized_user_message":  return <OversizedUserMessageBlock block={block} parsed={parsed} staggerIndex={staggerIndex} />;
    default: { const _e: never = block.kind; void _e; return null; }  // exhaustiveness: future BlockKind addition fails the build
  }
}
```

**Per-kind component specs (verbatim copy + selectors):**

#### `<UserTurnBlock>` (spec lines 685-689)

```tsx
<li
  className="skim-block skim-block-user-turn"
  style={{ animationDelay: `${staggerIndex * 40}ms` }}  /* spec line 681: 40ms × N max 8 */
>
  <article className="skim-user-panel">
    {/* User message inline. Reuses TranscriptView's renderBodyWithCode. Q5 below. */}
    <div className="skim-user-body">
      {renderBodyWithCode(parsed.messages[block.start].text)}
    </div>
  </article>
  <details className="skim-agent-reaction">
    <summary>Agent reaction ({block.end - block.start} messages)</summary>
    <div className="skim-agent-reaction-body">
      <p className="skim-summary-disabled">
        Summary disabled — generation deferred to a later phase. Use "Expand to raw messages" to read the agent's response inline.
      </p>
      <details className="skim-expand-raw">
        <summary>Expand to raw messages</summary>
        <div className="skim-expand-raw-body">
          <TranscriptView
            row={row}
            now={now}
            messageRange={{ start: block.start + 1, end: block.end }}
          />
        </div>
      </details>
    </div>
  </details>
</li>
```

**Critical literals (defended in §6):**

- Summary text MUST be `Agent reaction ({N} messages)` where N = `block.end - block.start` (the messages AFTER the user message at `block.start`). For `block.start === block.end` (a user message with NO agent reaction yet), N = 0 → renders `"Agent reaction (0 messages)"` per the spec literal (Q2 below — pluralization beats grammar).
- Disabled-placeholder copy renders verbatim per spec line 687, including the smart curly quotes around "Expand to raw messages" inside the placeholder paragraph. **If the smart quotes won't render reliably across editors, USE the spec's literal characters** (the spec quote in the file uses `"…"` straight quotes, but renders in markdown as smart quotes — confirm at test time which form appears in the rendered DOM and assert on that exact form).
- "Expand to raw messages" affordance SUMMARY text is a quiet text link styled via CSS — but it is a `<summary>` element, NOT a `<button>`. Q3 resolves: spec line 689 says "button styled as a quiet text link" — but rendering this as a true `<button>` would require custom expand-state management. Using `<summary>` inside `<details>` gives us native a11y + keyboard handling + the `<details>` motion authorization. The visual treatment is "styled as a quiet text link" → implemented via CSS (color: var(--color-accent); text-decoration; cursor: pointer). The button-vs-summary semantic distinction: spec author likely meant "looks like a link, not a button-with-chrome" — a styled `<summary>` inside `<details>` satisfies the visual requirement and the affordance behaviour (click to reveal). Tests verify the visible affordance text + the keyboard activation; they do NOT assert the tagName.
- The disabled placeholder visual cue: 4 px left-border in `--color-border` per spec line 689. Implemented via `border-inline-start: 4px solid var(--color-border)` on `.skim-summary-disabled`.
- Panel padding: 24 px 32 px = `var(--space-6) var(--space-8)` per spec line 685.

#### `<BoundaryBlock>` (spec line 691, signature detail #1, **byte-equivalent recipe to M4**)

Per Q4 below: extract a shared `<BoundaryRow>` component used by both TranscriptView AND SkimView. Lives at a NEW co-located file:

`/home/huwei/ai_codings/distill-portal/apps/frontend/src/features/sessions/BoundaryRow.tsx` (~30-50 lines)
`/home/huwei/ai_codings/distill-portal/apps/frontend/src/features/sessions/BoundaryRow.css` (~30-50 lines)

The shared component reads:

```tsx
export type BoundarySubtype = "session_resumed" | "compacted";

export function BoundaryRow({ subtype, staggerIndex }: { subtype?: BoundarySubtype; staggerIndex?: number }) {
  const label = subtype === "compacted" ? "CONVERSATION COMPACTED" : "SESSION RESUMED";
  const style = staggerIndex !== undefined
    ? { animationDelay: `${staggerIndex * 40}ms` }
    : undefined;
  return (
    <li
      className="boundary-row"
      role="separator"
      aria-orientation="horizontal"
      style={style}
    >
      <span aria-hidden="true" className="boundary-row-rule boundary-row-rule-start" />
      <span className="boundary-row-label">{label}</span>
      <span aria-hidden="true" className="boundary-row-rule boundary-row-rule-end" />
    </li>
  );
}
```

This is byte-equivalent to the `BoundaryMessage` component at `TranscriptView.tsx:362-384` — same DOM tree, same `role="separator"`, same Fraunces italic small-caps label. M5 refactors:

1. Extract `<BoundaryMessage>` body from `TranscriptView.tsx` into the new `BoundaryRow.tsx`.
2. Extract `.msg-boundary` + `.msg-boundary-rule*` + `.msg-boundary-label` declarations from `TranscriptView.css` into `BoundaryRow.css`.
3. `TranscriptView.tsx` imports `BoundaryRow` and renders `<BoundaryRow subtype={msg.boundarySubtype} />` from inside `BoundaryMessage`.
4. `SkimView.tsx` imports `BoundaryRow` and renders `<BoundaryRow subtype={block.meta?.subtype as BoundarySubtype | undefined} staggerIndex={staggerIndex} />` for `boundary` blocks.

**Why extract** (Q4 rationale): The spec at line 691 says "verified at M5 close" with the constraint "byte-equivalent" between Transcript boundary and Skim boundary. Extraction is the only way to GUARANTEE byte-equivalence — implementing twice invites drift (M2b r1 #2 codex catch precedent: "color/border-color animation drift between two CSS files"). A unit test asserts the rendered DOM is identical (modulo the optional `staggerIndex` style attribute).

**Class name choice**: rename `.msg-boundary*` to `.boundary-row*` so the selector is neutral between Transcript message context and Skim block context. Update TranscriptView's CSS rhythm rules at lines 168-172 to use the new class.

**M4 invariance**: this is a refactor of M4 code, but the EXTERNAL contract (rendered DOM tree + CSS visual output) is byte-equivalent. M4 tests still pass; one new test asserts `<BoundaryRow>` renders `role="separator"` + correct label.

#### `<AgentOnlyBlock>` (spec line 693)

```tsx
<li className="skim-block skim-block-agent-only" style={{ animationDelay: `${staggerIndex * 40}ms` }}>
  <details className="skim-agent-only">
    <summary className="skim-agent-only-summary">
      Agent-only session ({block.end - block.start + 1} messages)
    </summary>
    <div className="skim-agent-only-body">
      <TranscriptView
        row={row}
        now={now}
        messageRange={{ start: block.start, end: block.end }}
      />
    </div>
  </details>
</li>
```

**Empty-stream sentinel** (`block.end === -1`, `meta.empty === 1`): the count is `block.end - block.start + 1 = -1 - 0 + 1 = 0` → renders `"Agent-only session (0 messages)"`. The expanded body slices `parsed.messages.slice(0, 0)` (empty) → TranscriptView renders its "No messages parsed." copy. This satisfies spec line 697 ("never silently blank") + the M5 DoD line 1053 ("No-user-msg session shows single collapsed `agent_only` block").

#### `<OversizedUserMessageBlock>` (spec line 695)

```tsx
<li className="skim-block skim-block-oversized" style={{ animationDelay: `${staggerIndex * 40}ms` }}>
  <details className="skim-oversized">
    <summary className="skim-oversized-summary">
      Oversized user message ({Math.round((block.meta?.sizeBytes ?? 0) / 1024)} KB) — collapsed by default
    </summary>
    <div className="skim-oversized-body">
      <pre className="skim-oversized-pre">{parsed.messages[block.start].text}</pre>
    </div>
  </details>
</li>
```

**Critical literals:**

- Summary text per spec line 695: `"Oversized user message ({sizeKB} KB) — collapsed by default"` — note the em-dash with surrounding spaces.
- KB conversion: `Math.round(sizeBytes / 1024)`. Test fixture: `sizeBytes = 65537` → 64 KB. (Q11 below — rounding mode.)
- The body is rendered in `--font-mono` (spec line 695: "since these are typically pasted-in dumps"). Use a `<pre>` with `var(--font-mono)`, `--text-sm`, `--color-surface-raised` background.
- NEVER summarized (spec line 695 + PRD line 257). The oversized text is rendered VERBATIM, not truncated.
- Warning-tinted left border per spec line 695: `border-inline-start: 4px solid var(--color-warn)` on `.skim-block-oversized`.

**Code-fence detection helper sharing (Q5):**

The user_turn body needs `renderBodyWithCode` (same as TranscriptView). M5 has two paths:

(A) **Re-export `renderBodyWithCode` from TranscriptView** as a named export (it's currently NOT exported). Add a one-line `export` keyword to TranscriptView.tsx line 428 (`function renderBodyWithCode` → `export function renderBodyWithCode`). SkimView imports it.

(B) **Extract `renderBodyWithCode` to a shared module** at `apps/frontend/src/features/sessions/renderBodyWithCode.ts`.

**Decision: (A).** The function is intimately tied to the message-rendering surface and lives next to its CSS classes (`.msg-code-inline`, `.msg-code-block`). SkimView reuses those classes wholesale (NO new code-fence selectors). Path (A) is one-line. Path (B) is a cleaner module boundary but adds a file for a single shared function. M5 is composition, not refactor — choose (A).

**Note for tests**: SkimView's user_turn body must consume the `.msg-code-inline` + `.msg-code-block` classes. They're declared in `TranscriptView.css`. Either:
- Import `TranscriptView.css` from `SkimView.tsx` (cascade ordering preserved; mounting any TranscriptView already imports it transitively) — sufficient because `<TranscriptView>` is mounted as the scoped renderer in user_turn details.
- OR, extract the code-fence selectors to a shared `code-fence.css` file. Path (A) is fine — SkimView relies on the transitive cascade. Document this in SkimView.css's header comment.

**Truncation banner + parse-warnings banner (Q12 below):**

Spec line 677: "Both panels also surface `parsed.warnings` (when non-empty) as a small dismissible banner per the Transcript tab spec — even when state is 'success' or 'truncated'." So SkimView SHOULD render both banners. Reuse the same banner components from TranscriptView (extract them to a shared module or import + re-render). The minimal-touch path: **inline the banner JSX in SkimView with byte-equivalent class names** (`.skim-banner` / `.skim-banner-truncation` / `.skim-banner-warnings` / `.skim-banner-dismiss`) — the CSS recipe is byte-equivalent to `.transcript-banner*` but lives in `SkimView.css` to keep the surface independent. (Alternative: extract `<Banners>` to a shared module — defer to Q12 below; recommendation = inline with byte-equivalent CSS for now.)

### 4.2 `SkimView.css`

**Selectors owned (cross-checked against `tokens.css` for every `var(--…)`):**

```
/* state branches */
.skim-empty / .skim-not-imported / .skim-loading / .skim-error-block / .skim-error / .skim-retry / .skim-empty-stream
/* body */
.skim-body
.skim-stream
.skim-block / .skim-block + .skim-block (rhythm)
/* per-kind */
.skim-block-user-turn / .skim-user-panel / .skim-user-body
.skim-agent-reaction / .skim-agent-reaction-body
.skim-summary-disabled
.skim-expand-raw / .skim-expand-raw-body
.skim-block-agent-only / .skim-agent-only / .skim-agent-only-summary / .skim-agent-only-body
.skim-block-oversized / .skim-oversized / .skim-oversized-summary / .skim-oversized-body / .skim-oversized-pre
/* boundary block — animation only; visual recipe lives in BoundaryRow.css */
.skim-stream > .boundary-row /* margin override per rhythm rule */
/* banners */
.skim-banner / .skim-banner-truncation / .skim-banner-warnings / .skim-banner-dismiss / .skim-warnings-list
/* keyframes */
@keyframes skim-block-fade-in   /* opacity 0 → 1 + translateY(4px → 0) per spec line 93 */
@keyframes skim-banner-fade     /* opacity 0 → 1 only (mirrors transcript-banner-fade) */
```

**Token consumption set (M5 introduces ZERO new tokens):**

- Color: `--color-ink`, `--color-ink-muted`, `--color-surface`, `--color-surface-raised`, `--color-accent`, `--color-border`, `--color-border-strong`, `--color-warn`
- Typography: `--font-chrome`, `--font-display`, `--font-mono`, `--text-xs`, `--text-sm`, `--text-base`, `--leading-comfortable`, `--measure`
- Spacing: `--space-1`, `--space-2`, `--space-3`, `--space-4`, `--space-6`, `--space-8`
- Radius: `--radius-sm`, `--radius-md`
- Motion: `--motion-base`, `--motion-disclosure`, `--ease-out`, `--ease-in-out`

This is the SAME 27-token consumption set M4 used. Spec lines 866 + 885 + Resolved Decision #16: "reuse before invent". Cross-check command in §9.

**Three-magnitude rhythm rules (spec line 681 — 24 px between same-kind, 32 px between different kinds):**

```css
/* Default 24 px between any two adjacent skim blocks */
.skim-stream > .skim-block + .skim-block,
.skim-stream > .skim-block + .boundary-row,
.skim-stream > .boundary-row + .skim-block {
  margin-top: var(--space-6); /* 24 px */
}

/* 32 px override between DIFFERENT-KIND adjacent blocks */
.skim-stream > .skim-block-user-turn + .skim-block-agent-only,
.skim-stream > .skim-block-agent-only + .skim-block-user-turn,
.skim-stream > .skim-block-user-turn + .skim-block-oversized,
.skim-stream > .skim-block-oversized + .skim-block-user-turn,
.skim-stream > .skim-block-agent-only + .skim-block-oversized,
.skim-stream > .skim-block-oversized + .skim-block-agent-only {
  margin-top: var(--space-8); /* 32 px */
}

/* 32 px around boundary blocks (spec line 691: "32 px breathing top + bottom") */
.skim-stream > .boundary-row,
.skim-stream > .boundary-row + .skim-block,
.skim-stream > .skim-block + .boundary-row {
  margin-top: var(--space-8);
}
```

**Note on rule precedence**: CSS source order resolves these. The boundary rule comes LAST so it overrides the same-kind 24 px rule when boundaries are adjacent. This mirrors TranscriptView.css's three-magnitude rhythm pattern at lines 156-172.

**Stagger animation (spec line 93 — opacity + translateY only, max 8 blocks):**

```css
.skim-block,
.boundary-row {
  opacity: 0;
  animation: skim-block-fade-in var(--motion-disclosure) var(--ease-out) both;
  /* animationDelay set inline per block via React style prop, capped at 8 × 40 = 320 ms. */
}

@keyframes skim-block-fade-in {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
```

**Stagger cap (Q7)**: SkimView passes `staggerIndex={Math.min(idx, 8)}` to each block; the CSS uses `animation-delay: calc(var(--stagger-idx) * 40ms)`. Blocks 9+ all get `staggerIndex = 8` → all animate at 320 ms. After that, they share the same delay (so the perception is the first 9 cascade and the rest snap in together). This satisfies spec line 681 ("max 8 blocks staggered") and spec line 1100 ("Skim-block stagger capped at 8 blocks").

**Reduced-motion zero-out** comes from `global.css`'s `@media (prefers-reduced-motion: reduce)` rule (existing M2a infrastructure). M5 adds NOTHING to that rule.

**User-turn panel (spec line 685 — padding 24 px 32 px, accent tint mirrors selected-row recipe):**

```css
.skim-user-panel {
  padding: var(--space-6) var(--space-8);  /* 24 px 32 px per spec line 685 */
  background: color-mix(in srgb, var(--color-accent) 5%, var(--color-surface));
  border-radius: var(--radius-md);
  max-inline-size: var(--measure);  /* 70ch reading measure per spec line 681 */
}

.skim-user-body {
  font-family: var(--font-chrome);
  font-size: var(--text-base);
  line-height: var(--leading-comfortable);
  color: var(--color-ink);
  white-space: pre-wrap;
}
```

The 5 % accent-mix mirrors `.msg-user` in TranscriptView.css line 300 — same recipe, same surface.

**Disabled-placeholder visual cue (spec line 689 — 4 px left-border + muted ink):**

```css
.skim-summary-disabled {
  border-inline-start: 4px solid var(--color-border);
  padding-inline-start: var(--space-4);
  margin: var(--space-3) 0;
  color: var(--color-ink-muted);
  font-family: var(--font-chrome);
  font-size: var(--text-sm);
  line-height: var(--leading-comfortable);
  font-style: italic;  /* visual cue: "this is placeholder, not real content" */
}
```

**Oversized warning border (spec line 695 — warning status color):**

```css
.skim-block-oversized {
  border-inline-start: 4px solid var(--color-warn);
  padding-inline-start: var(--space-4);
}

.skim-oversized-pre {
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  background: var(--color-surface-raised);
  color: var(--color-ink);
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-sm);
  white-space: pre;
  overflow-x: auto;
  /* NEVER summarize (spec line 695); body is rendered verbatim */
}
```

**Agent-only muted panel (spec line 693 — muted panel with hairline border, no accent tint):**

```css
.skim-block-agent-only {
  /* Container only — no panel chrome on the <li>; the <details> below carries it. */
}

.skim-agent-only {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-3) var(--space-4);
  background: var(--color-surface);  /* default surface, no accent tint */
}

.skim-agent-only-summary {
  cursor: pointer;
  list-style: revert;
  font-family: var(--font-chrome);
  font-size: var(--text-sm);
  color: var(--color-ink-muted);
}
```

**Motion authorizations (spec lines 84-95 + 1100):**

PROHIBITED on every selector in this file:
- `transition: color`
- `transition: border-color`
- `transition: width`
- `transition: height`
- `transition: top`
- `transition: padding`
- `transition: margin`
- `transition: font-size`
- `transition: letter-spacing`
- `transition: line-height`

PROHIBITED on `.skim-block*` (message-panel-equivalent surfaces): `transition: background-color`. Codex M2b r1 #2 precedent enforced.

ALLOWED:
- `animation: skim-block-fade-in` (opacity + transform: translateY) — per spec line 93.
- `animation: skim-banner-fade` (opacity only) — mirrors M4's truncation banner.
- Native `<details>` block-size via the M2b `interpolate-size: allow-keywords` global rule.

### 4.3 `SkimView.test.tsx`

Test obligations enumerated in §8.

**Mock pattern**: same as TranscriptView.test.tsx (`mock.module("./useParsedSession", ...)`). Process-wide module mock; restored in `afterAll`.

**Fixture builder helpers (Q6 below)**: hand-rolled fixtures per block kind. Existing `transcript-5k.builder.ts` is for performance measurement — too large for unit tests. Each test constructs a minimal `ParsedSession` literal:

```ts
function makeMessage(overrides: Partial<Message>): Message { /* … */ }
function makeBlock(overrides: Partial<SkimBlock>): SkimBlock { /* … */ }
function makeParsed(messages: Message[], skim: SkimBlock[], extras?: Partial<ParsedSession>): ParsedSession { /* … */ }
function mockUseParsedSession(state: HookState): void { mockedHookState = state }
```

### 4.4 `SessionView.tsx` (modification)

**Single-line change A** (line 250 in `panelContent`):

```diff
- skim: <SkimPlaceholder />,
+ skim: <SkimView row={row} now={now} />,
```

**Cleanup change B**: Remove the `SkimPlaceholder` function (lines 365-372) since it's no longer reachable.

**Add import:**

```diff
+ import { SkimView } from "./SkimView";
```

NO change to `DEFAULT_TAB_ON_SELECTION` (stays `"transcript"` per Resolved Decision #11 step 3).

### 4.5 `SessionView.test.tsx` (modification)

- Update test at line 255-291 (`'SessionView ready: Skim placeholder reads "Coming in Milestone 5"; Transcript renders TranscriptView (M4 functional state)'`):
  - Rename test (e.g., `'M5 functional state: Skim renders SkimView, Transcript renders TranscriptView, no placeholders remain'`).
  - Replace the assertion `expect(...).toContain("Coming in Milestone 5")` with an assertion against SkimView's rendered surface: e.g., `expect(...).toContain("This session has not been imported yet")` (source-only row → SkimView lands on the `no_raw` branch — same copy as TranscriptView).
  - Optionally add a positive assertion: e.g., `expect(container.querySelector('[aria-label="Session skim outline"]')).toBeNull()` (the `no_raw` branch doesn't render the SkimBody). For a stored row with mock data, the `aria-label="Session skim outline"` selector should land.
- Add a new test: "SkimView mounts when Skim tab is activated" — render with a stored row + mocked `success` state with a small skim block array; activate Skim; assert SkimView's per-block-row hooks render.
- Add a new test: "Tab state survives Transcript → Skim → Transcript flip (keep-mounted regression)" — mirrors the existing M4 keep-mounted test for Raw at line 358; assert the Skim panel reference is identical before and after the round-trip.
- Add a new test: assert no DOM still contains "Coming in Milestone 5" anywhere in the SessionView tree (regression guard against the spec-literal placeholder leaking into the codebase).

### 4.6 `TranscriptView.tsx` (modification — additive `messageRange` prop)

**Props update:**

```ts
export type TranscriptViewProps = {
  row: SessionRow;
  now: string;
  /**
   * Optional inclusive [start, end] messageIndex range. When provided,
   * the body renders only `parsed.messages.slice(start, end + 1)`.
   * Used by SkimView's "Expand to raw messages" affordance + agent_only
   * block expansion to mount a scoped TranscriptView per Resolved
   * Decision #9. Out-of-bounds values clamp to [0, parsed.messages.length - 1].
   * Omitting this prop renders the full transcript (M4 default behaviour).
   */
  messageRange?: { start: number; end: number };
};
```

**Body slice logic** (only changed line in `<TranscriptBody>`):

```diff
- {parsed.messages.length === 0 ? (
+ const slicedMessages = (() => {
+   if (!messageRange) return parsed.messages;
+   const lo = Math.max(0, messageRange.start);
+   const hi = Math.min(parsed.messages.length - 1, messageRange.end);
+   if (hi < lo) return [];
+   return parsed.messages.slice(lo, hi + 1);
+ })();
+ {slicedMessages.length === 0 ? (
    <p className="transcript-empty-stream">No messages parsed.</p>
  ) : (
    <ol className="transcript-stream">
-     {parsed.messages.map((msg) => (
+     {slicedMessages.map((msg) => (
        <MessageRow key={msg.messageIndex} msg={msg} now={now} />
      ))}
    </ol>
  )}
```

**Critical**: pass `messageRange` from `TranscriptView` → `<TranscriptBody>`. The state-branch dispatch (idle / no_raw / loading / error) is unaffected — those branches don't touch parsed messages.

**Edge cases (defensive, Q10):**
- `messageRange.start > parsed.messages.length - 1` → empty slice → renders "No messages parsed." copy.
- `messageRange.end < 0` (e.g., from buildSkim's empty-stream sentinel `start: 0, end: -1`) → `hi < lo` → empty slice → renders "No messages parsed." copy.
- `messageRange.start < 0` → clamped to 0.
- All cases satisfy the spec line 697 invariant: never silently blank.

**No CSS or visual change to TranscriptView**.

### 4.7 `TranscriptView.test.tsx` (modification — additive tests for `messageRange`)

Add ≥3 new bun:test cases:

1. "TranscriptView with no `messageRange` renders all messages (regression for M4 contract)"
2. "TranscriptView with `messageRange={{ start: 1, end: 3 }}` renders only messages 1, 2, 3 (inclusive both ends)"
3. "TranscriptView with out-of-bounds `messageRange` clamps gracefully (defensive)"
4. (Bonus) "TranscriptView with empty-stream sentinel range `{ start: 0, end: -1 }` renders the empty-stream placeholder (no crash)"

### 4.8 `BoundaryRow.tsx` + `BoundaryRow.css` (NEW shared component, extracted from M4)

Co-located in `apps/frontend/src/features/sessions/`. Tests at `BoundaryRow.test.tsx` (~80-150 lines, ~6-8 cases):

1. Renders `role="separator"` + `aria-orientation="horizontal"`.
2. Renders "SESSION RESUMED" for `subtype === "session_resumed"`.
3. Renders "CONVERSATION COMPACTED" for `subtype === "compacted"`.
4. Renders "SESSION RESUMED" for `subtype === undefined` (default).
5. Sets `style={{ animationDelay: ... }}` only when `staggerIndex` is provided.
6. Carries the three-element grid (`<span>` rule + `<span>` label + `<span>` rule).
7. Boundary label uses Fraunces italic small-caps (assert via class name + computed style smoke).

**Migration steps** (M5 implementation):

1. Create `BoundaryRow.tsx` + `BoundaryRow.css` with the body lifted from `TranscriptView.tsx:362-384` and `TranscriptView.css:425-450`.
2. Update `TranscriptView.tsx`'s `BoundaryMessage` to render `<BoundaryRow subtype={msg.boundarySubtype} />` (no staggerIndex — Transcript doesn't stagger).
3. Update `TranscriptView.css` to remove the `.msg-boundary*` declarations (they migrate to `BoundaryRow.css` as `.boundary-row*`).
4. Update `TranscriptView.css` rhythm rules at lines 168-172: replace `.msg-boundary` with `.boundary-row` (the wrapper class on the new component matches).
5. Update `TranscriptView.test.tsx` boundary test (existing #11): may need to adjust class-name selectors from `.msg-boundary*` → `.boundary-row*` (or rely on `getByRole("separator")` + accessible-name assertions, which are class-agnostic).
6. SkimView imports `BoundaryRow` directly.

**Regression risk**: M4 acceptance tests + e2e snapshot of the Transcript tab boundary rendering must remain byte-equivalent. The M4 `inspection.spec.ts` does NOT currently inspect boundary rendering — but the SkimView e2e (added in M5) WILL exercise the same DOM tree.

## 5. Open questions resolved

### Q1 — Where does the scoped TranscriptView live? Inline import + props-based filter, or a new `<TranscriptViewScoped>` wrapper?

**Decision: inline import + additive `messageRange` prop on TranscriptView.**

**Rationale**: a wrapper component would add a file for a one-prop-narrowing behaviour. The additive prop is the minimal-touch composition path (per Resolved Decision #9: "Skim 'Expand to raw messages' reuses TranscriptView scoped to messageIndex range"). M4's contract is preserved (when prop omitted, behaviour is identical). Cost: one diff in TranscriptView.tsx body slice + 3-4 new tests.

### Q2 — Does the "Agent reaction" `<details>` start open or closed?

**Decision: closed (default).**

**Rationale**: spec line 685 says "a collapsible `<details>` element" — the natural HTML default for `<details>` is closed. Spec line 693 explicitly says "collapsed by default" for `agent_only` and line 695 for `oversized_user_message`; the `user_turn` "Agent reaction" disclosure follows the same disclosure-default principle (the user must opt-in to read). PRD line 256 mandates "collapsed default" for the disclosable surfaces.

### Q3 — How does the "Expand to raw messages" affordance render?

**Decision: NESTED `<details>` element inside the "Agent reaction" body, as a SIBLING of the disabled placeholder paragraph.**

**Rationale**: Spec line 689: "Followed by an 'Expand to raw messages' affordance (button styled as a quiet text link): clicking renders a scoped TranscriptView". "Followed by" + "sibling of" the disabled placeholder. **NOT nested in the placeholder** — the placeholder is a `<p>` element, the affordance is a separate `<details>`. The spec's "button styled as a quiet text link" is a VISUAL specification — implemented with a `<summary>` element styled to look like a link (color: var(--color-accent), text-decoration: underline on hover, cursor: pointer). Using `<details>`/`<summary>` rather than a custom `<button>` gets:
- Native keyboard handling (Enter/Space toggle).
- The M2b `interpolate-size: allow-keywords` block-size animation for free.
- Native focus management.
- No expanded-state mirror in React state (Q1 resolves this).

The visible affordance text is "Expand to raw messages" verbatim (spec line 689). Tests assert the visible text + the activation behaviour, NOT the tagName.

### Q4 — Should the boundary chapter-break be extracted into a shared `<BoundaryRow>` component?

**Decision: YES — extract to a new `BoundaryRow.tsx` + `BoundaryRow.css` co-located in `apps/frontend/src/features/sessions/`.**

**Rationale**: Spec line 691: "verified at M5 close" with the constraint that the M5 boundary rendering must be byte-equivalent to M4's. Extracting guarantees byte-equivalence (impossible to drift). Implementing twice invites drift — codex precedent M2b r1 #2 (motion budget) showed exactly this drift class. The extraction is a **refactor of M4 code with zero external behaviour change** (M4 tests still pass). Plan: extract → update TranscriptView.tsx + TranscriptView.css to use the new component → SkimView consumes it directly. See §4.8.

### Q5 — Code-fence detection sharing.

**Decision: re-export `renderBodyWithCode` from TranscriptView.tsx as a named export.** SkimView imports it.

**Rationale**: see §4.1's discussion. One-line change (`function` → `export function`) preserves M4 layout. Helper is intimately tied to its CSS classes (`.msg-code-inline`, `.msg-code-block`). Path (B) of extracting is cleaner module-architecture-wise but adds a file for a single shared function — defer until a third consumer arrives.

### Q6 — Test fixture strategy.

**Decision: hand-rolled fixtures per block kind in `SkimView.test.tsx` via local builder helpers.**

**Rationale**: The existing `transcript-5k.builder.ts` is a 5000-message generator for the M4 perf spec — too large + non-targeted for unit tests. Hand-rolled minimal `ParsedSession` literals give per-test control over edge cases (empty-stream sentinel, single-block, two-block boundary, oversize threshold edge cases). Pattern matches TranscriptView.test.tsx's `makeMessage` / `makeParsed` helpers.

### Q7 — Skim's first-paint stagger animation: implementation pattern.

**Decision: inline `style={{ animationDelay: ... }}` per block, with `staggerIndex` capped at 8.**

**Rationale**: Spec line 93: "40 ms × N (max 8 blocks) | ease-out | first paint per session". Per spec line 1100: "Skim-block stagger capped at 8 blocks." Implementation:
- React passes `staggerIndex={Math.min(idx, 8)}` to each block.
- The block sets `style={{ animationDelay: `${staggerIndex * 40}ms` }}`.
- CSS: `animation: skim-block-fade-in var(--motion-disclosure) var(--ease-out) both;` (200 ms duration; spec line 88 reuses the disclosure motion for similar UX feel).
- Reduced-motion: zero-out via global.css existing rule.

The keyframe MUST animate `opacity` AND `transform: translateY(4px → 0)` ONLY (per spec line 93). NOT `top`, NOT `padding`, NOT `width`/`height` (motion budget rule).

### Q8 — Does M5 retain the M4 patch to `useParsedSession`?

**Decision: YES — M5 consumes the same hook with no changes.**

**Rationale**: M3b shipped the cache + epoch invariants; M4 patched any bug-fix details (already in codebase). M5 is a pure consumer. Verify at implementation time: `git log --oneline apps/frontend/src/features/sessions/useParsedSession.ts | head` should show no surprises.

### Q9 — 70ch reading measure on user_turn body.

**Decision: same `--measure` (= 70ch) as TranscriptView.**

**Rationale**: Spec line 681: "Block content respects the 70ch reading measure." Token already exists; reuse. Apply via `max-inline-size: var(--measure)` on `.skim-user-panel` AND `.skim-summary-disabled` (so the disabled-placeholder paragraph also respects the measure).

### Q10 — Scoped TranscriptView avoiding double-rendering / off-by-one.

**Decision: inclusive `[start, end]` slice via `messages.slice(start, end + 1)`.**

**Rationale**: Per data-model spec line 265: "Inclusive `messageIndex` range." Per spec line 689: `[block.start+1, block.end]` for user_turn agent reaction (excludes the user message at `block.start` itself, which is rendered separately). For agent_only: `[block.start, block.end]` (full range). Defensive clamping in TranscriptView guards against the empty-stream sentinel `{ start: 0, end: -1 }` and any OOB values.

### Q11 — KB rounding mode for oversized_user_message summary.

**Decision: `Math.round(sizeBytes / 1024)` (round-half-up).**

**Rationale**: Spec line 695: "({sizeKB} KB)" — no rounding mode specified. `Math.round` is the natural-language KB conversion. Edge cases:
- Threshold = 65 536 bytes → 64 KB.
- 65 537 bytes → 64 KB (`Math.round(65537/1024) = Math.round(64.0009) = 64`).
- 66 048 bytes → 65 KB (`Math.round(66048/1024) = Math.round(64.5) = 65` per banker's rounding in V8 for half-even, but `Math.round` in JS rounds half-up to 65). Test fixture: 70 000 bytes → 68 KB.

Document the rule in SkimView.tsx header comment so a maintainer doesn't "fix" it to floor/ceil.

### Q12 — Does SkimView render the truncation banner + parse-warnings banner?

**Decision: YES — both banners are part of the SkimView state-branch contract per spec line 677.**

**Rationale**: Spec line 677: "Both panels also surface `parsed.warnings` (when non-empty) as a small dismissible banner per the Transcript tab spec — even when state is 'success' or 'truncated'." Spec line 675: "truncated" state renders "Per-tab content + a top-of-pane warning banner". M5 ships byte-equivalent banners to M4's (mirrors the chapter-break sharing pattern but at smaller scope — the banner CSS is short enough to inline).

**Implementation path**: inline the banner JSX in SkimView with byte-equivalent class names (`.skim-banner-truncation` / `.skim-banner-warnings` / `.skim-banner-dismiss` / `.skim-warnings-list`). The CSS recipe is byte-equivalent to `.transcript-banner*` declarations in TranscriptView.css. NO shared component extraction here — the banner CSS is ~30-40 lines and extracting would be over-engineering for a two-consumer case.

**Banner-dismissed state**: same component-local React state pattern as TranscriptView. Reset on `row.rowKey` change via `useEffect`.

### Q13 — Should SkimView mount the scoped TranscriptView eagerly (closed `<details>` body still rendered) or lazily (only when expanded)?

**Decision: native `<details>` element semantics — body IS rendered into the DOM but is hidden via `display: none` until expanded.**

**Rationale**: Native `<details>` body always exists in the DOM but the browser styles its hidden state via the user-agent stylesheet. React renders the children unconditionally. This is the simplest path. Alternative: conditional render based on `<details>`'s `onToggle` event + a `useState` mirror — adds React state for what is browser state. Reject.

**Performance note**: a 100-message agent_only block expanded would mount a TranscriptView with 100 MessageRows. M4 already validated 5k-message rendering at p95 < 16 ms; SkimView's worst case is bounded by the same constraint. Long-corpus measurement at §13.

### Q14 — ARIA labelling for SkimView root.

**Decision: `<section className="skim-body" aria-label="Session skim outline">`.**

**Rationale**: Mirrors TranscriptView's `aria-label="Session transcript"`. Distinct label so a11y consumers can disambiguate the two panels. Tests assert via `getByRole("region", { name: "Session skim outline" })`.

### Q15 — Should the user_turn `<article>` carry a `role` for a11y?

**Decision: NO custom `role`; let the `<article>` ARIA semantics carry.**

**Rationale**: `<article>` has implicit ARIA role "article". Mirrors TranscriptView's `<article className="msg-panel msg-user">` pattern (spec line 705 calls it a "panel"). No explicit `role` needed.

## 6. Codex catch precedents this plan defends against

Cumulative Phase 5 codex catches across M0…M4 enumerated below. Plan defends against each.

| # | Codex catch | Where caught | Surface in M5 | Plan defense |
|---|---|---|---|---|
| 1 | Spec literal violation (paraphrasing introduces drift) | M3a r1, r2, r4; coordinator-paraphrase r1 | Disabled placeholder copy at spec line 687 | **Plan §2 quotes spec verbatim** with line numbers. Implementor reads the verbatim block, never the prose summary. Disabled placeholder copy MUST exactly match: `Summary disabled — generation deferred to a later phase. Use "Expand to raw messages" to read the agent's response inline.` Test: assert via `expect(container.textContent).toContain(SPEC_DISABLED_COPY)` where `SPEC_DISABLED_COPY` is a top-of-file constant. |
| 2 | `key={anything-tab-related}` content remount breaks keep-mounted contract | M2b r1 #4 | SkimView root + per-block tree | **Plan mandates zero `key=` on SkimView root.** Per-block `<SkimBlockRow key={`${block.kind}-${block.start}-${block.end}`}>` (content-keyed, not tab-keyed). New SessionView.test.tsx case asserts the same DOM node persists across Skim → Transcript → Skim. |
| 3 | Undefined token references (`--space-5/10/12`) | M2b r1 #3 | SkimView.css | **Plan §9 includes `rg -n 'var\(--' SkimView.css \| sort -u` cross-checked against `tokens.css` declarations.** §4.2 lists the allowed 27-token set. Forbidden values: `--space-5`, `--space-10`, `--space-12`. |
| 4 | WCAG fails one mode but passes the other | M2a r1, r2; M2b r1 #1 | New visible foreground/background pairs in SkimView | **Design artifact `colors.md` (under `working/phase-5/designs/m5-skim/`) enumerates BOTH light + dark contrast for every text-on-surface pair.** §11 requires the M4 `wcag_m4.py` script template to be reused as `wcag_m5.py` with M5 surfaces. M5 measurement gate per spec line 1058. |
| 5 | Motion budget violation — animated `color`/`border-color`/unlisted `background-color` transitions | M2b r1 #2 | SkimView panels, `<details>` summaries, banner | **Plan explicitly forbids any `transition: color/border-color/background-color` on `.skim-block*` selectors.** §4.2 explicit prohibition list. Reviewer command: `rg -n 'transition: (color|border-color)' SkimView.css` must be empty. |
| 6 | `background-color` exemption misuse on a non-enumerated surface | M2b r1 #2 | SkimView banners, stagger animation | **Plan: stagger animation = `opacity` + `transform: translateY` ONLY** (per spec line 93). Truncation banner = `opacity` only. The "warning status color" on `.skim-block-oversized` is a STATIC `border-inline-start` declaration — NOT animated. |
| 7 | Spec-literal copy verbatim — pluralization beats grammar | M3a r1 (`{N} parse warnings` for N=1) | "Agent reaction (N messages)" + "Agent-only session (N messages)" | **Plan: ship the verbatim spec literal even when grammatically odd.** N=1 → "Agent reaction (1 messages)"; N=0 → "Agent reaction (0 messages)". Spec at lines 685, 693 uses `({count} messages)` — interpret as English string interpolation, NOT a smart pluralizer. JSDoc rationale at the top of SkimView.tsx documenting the M3a precedent so codex doesn't "fix" it. |
| 8 | Boundary signature-detail #1 must be byte-equivalent across M4 + M5 | spec line 691 verification at M5 close | BoundaryRow rendering | **Plan extracts `<BoundaryRow>` to a shared component** (Q4). Test: snapshot the rendered DOM tree from both `TranscriptView` (via M4 boundary message fixture) AND `SkimView` (via M5 boundary block fixture) — assert identical tree (modulo the optional `style` attribute for stagger). |
| 9 | tabIndex matrix on active panel | M2b r1 #5 | SkimView's panel via SessionView's existing wrapper | **No SkimView change needed.** SessionView.tsx already applies `tabIndex={0}` to active Skim panel per Option A (lines 332-353). M5 verifies via the existing test at SessionView.test.tsx line 293-356. |
| 10 | Status-color misuse (`--color-error` vs `--color-warn` semantic boundary) | M2b r1 #2 (.session-conflict-badge) | Oversized warning border | **Spec line 695: "warning status color".** Plan uses `--color-warn` (NOT `--color-error`). Oversized-user-message is a non-fatal capacity boundary, not an error. |
| 11 | Hex isolation regression (developer JSDoc tripped rg) | M2b dev self-catch | SkimView source comments | **Plan: zero hex literals anywhere in SkimView.{tsx,css,test.tsx}.** Comment IDs use word form. Developer pre-commit: `rg -n '#[0-9a-fA-F]{3,8}' apps/frontend/src/features/sessions/SkimView*` must be empty. |
| 12 | Exhaustiveness check on per-kind switch | M3a r2 (silent skip vs total fallthrough) | `<SkimBlockRow>` switch on `block.kind` | **`default` branch uses TypeScript exhaustiveness check (`const _: never = block.kind`).** Adding a future BlockKind without rendering it = build failure. |
| 13 | Off-by-one in inclusive ranges | spec line 265 + buildSkim line 32 | scoped TranscriptView slice | **Plan §4.6 documents `messages.slice(start, end + 1)` for INCLUSIVE both ends.** Tests assert: range `{start: 1, end: 1}` → exactly one message; range `{start: 0, end: 2}` → exactly three messages; empty-stream sentinel `{start: 0, end: -1}` → zero messages (no crash). |
| 14 | Three-magnitude rhythm rule precedence (`:has()` selectors) | M4's TranscriptView.css lines 156-172 | SkimView.css rhythm rules | **Plan §4.2 documents source-order precedence**: 24 px default → 32 px override for different-kind adjacency → 32 px override for boundary-adjacent. Boundary rule comes LAST. Mirrors M4's pattern — same CSS technique. |
| 15 | `<details>` block-size animation only fires when `interpolate-size: allow-keywords` is in `global.css` | M2b finding | All `<details>` in SkimView | **Plan verifies `apps/frontend/src/styles/global.css` declares `interpolate-size: allow-keywords` on `:root` at implementation start.** If missing (regression), the disclosure snaps without animation — acceptable per spec line 124 fallback. NO M5-local re-declaration. |
| 16 | `bun:test` isolation: process-wide `mock.module` not reset by `mock.restore()` | M4 test pattern | SkimView.test.tsx mocking useParsedSession | **Plan reuses M4's pattern verbatim** — `mock.module("./useParsedSession", ...)` at top of file; `afterAll` restores via re-mocking with the real implementation captured at file load. Mirrors `TranscriptView.test.tsx` lines 52-72. |

## 7. Design artifact obligations

**Path:** `/home/huwei/ai_codings/distill-portal/working/phase-5/designs/m5-skim/`

**Reference precedent:** `working/phase-5/designs/m4-transcript/` — same artifact shape.

### 7.1 `design.md`

Component tree (SkimView → state branches → SkimBody → SkimBlockRow → per-kind sub-renders). Per-block-kind visual recipe (typography token, color token, padding, border, vertical rhythm, motion). Three-magnitude rhythm rules with `:has()` source-order precedence. Motion (stagger animation + `<details>` block-size + truncation banner opacity). Copy verbatim (disabled placeholder; "Agent reaction (N messages)"; "Oversized user message ({sizeKB} KB) — collapsed by default"; etc.). A11y (each panel's role, label, focus order). Each rule anchored to spec line range. **Also**: an explicit "what M5 does NOT touch" section (DEFAULT_TAB_ON_SELECTION stays "transcript"; existing M4 boundary recipe extracted to BoundaryRow but visually byte-equivalent; truncation banner visual byte-equivalent to M4).

### 7.2 `prototype.html`

Self-contained HTML demonstrating ALL four block kinds + scoped TranscriptView reveal + truncation banner + warnings banner. Both light + dark themes via `data-theme` toggle. NO React; vanilla HTML/CSS so codex can `curl` and parse standalone. Must include:

- A user_turn block with a short user message + the closed `<details>` "Agent reaction (3 messages)" disclosure.
- The same expanded — showing the disabled placeholder + the closed "Expand to raw messages" disclosure.
- The "Expand to raw messages" expanded — showing 3 mocked agent messages (user/assistant/tool_use shells).
- A boundary block in BOTH "SESSION RESUMED" and "CONVERSATION COMPACTED" forms, between two user_turn blocks.
- An agent_only block collapsed (the muted summary "Agent-only session (5 messages)").
- The same expanded — showing 5 mocked agent messages.
- An oversized_user_message block collapsed ("Oversized user message (78 KB) — collapsed by default" with the warn-tinted left border).
- The same expanded — showing the verbatim mono-font dump.
- A truncation-banner-at-top variant.
- A warnings-banner-at-top variant (expanded).
- An empty-stream variant (single agent_only block with "Agent-only session (0 messages)" — never silently blank).
- A side-by-side light/dark theme demonstration (toggle button + `data-theme` swap).

### 7.3 `motion.md`

Every animation enumerated with token references + reduced-motion behaviour:

| Surface | Property animated | Duration token | Easing token | Trigger | Reduced-motion |
|---|---|---|---|---|---|
| `.skim-block` (first-paint stagger) | `opacity` (0 → 1) + `transform: translateY(4px → 0)` | `--motion-disclosure` (200 ms) | `--ease-out` | first paint per session, capped at 8 blocks | zero-out via global.css |
| `.skim-banner-truncation` | `opacity` (0 → 1) | `--motion-base` (120 ms) | `--ease-out` | mount when `parsed.truncated` | zero-out via global.css |
| `<details>` (Agent reaction; agent-only; oversized; expand-raw; warnings) | `block-size` | `--motion-disclosure` (200 ms) | `--ease-in-out` | user toggle | snap to fully open/closed |

**Plus** an explicit "PROHIBITED" section listing properties M5 MUST NOT animate (color, border-color, width, height, top, padding, transform on message panels, background-color on message panels). Codex M2b r1 #2 catch precedent demands this enumeration.

### 7.4 `colors.md` + `wcag_m5.py`

WCAG-AA contrast table covering EVERY text-on-surface pair the M5 surface introduces. Methodology: reuse `working/phase-5/designs/m4-transcript/wcag_m4.py` as `wcag_m5.py` template — same oklch → linear sRGB → relative luminance pipeline. Update the surfaces dict with M5's specific pairs.

Required table rows (minimum):

| # | Foreground | Background | Light ratio | Dark ratio | AA pass (light) | AA pass (dark) |
|---|---|---|---|---|---|---|
| S01 | user-turn body `--color-ink` | `color-mix(--color-accent 5%, --color-surface)` | (script) | (script) | required | required |
| S02 | `<summary>` "Agent reaction" `--color-ink` | `--color-surface` | (script) | (script) | required | required |
| S03 | disabled-placeholder `--color-ink-muted` (italic) on `--color-surface` | `--color-surface` | (script) | (script) | required (4.5:1 for italic body) | required |
| S04 | "Expand to raw messages" link `--color-accent` on `--color-surface` | `--color-surface` | (script) | (script) | required | required |
| S05 | "Expand to raw messages" link 4 px left border (non-text) `--color-border` on `--color-surface` | n/a | (script) | (script) | required (3:1 non-text) | required |
| S06 | agent_only summary `--color-ink-muted` on `--color-surface` (with hairline border) | `--color-surface` | (script) | (script) | required | required |
| S07 | agent_only border `--color-border` (non-text) on `--color-surface` | n/a | (script) | (script) | required (3:1) | required |
| S08 | oversized summary `--color-ink` on `--color-surface` | `--color-surface` | (script) | (script) | required | required |
| S09 | oversized warn border `--color-warn` (non-text) on `--color-surface` | n/a | (script) | (script) | required (3:1) | required |
| S10 | oversized body `--color-ink` (mono) on `--color-surface-raised` | `--color-surface-raised` | (script) | (script) | required | required |
| S11 | boundary label (Fraunces italic small-caps `--color-ink-muted`) on `--color-surface` | `--color-surface` | (script) | (script) | required (4.5:1 for small-caps body-size) | required |
| S12 | truncation banner copy `--color-ink` on `color-mix(--color-warn 8%, --color-surface)` | n/a | (script) | (script) | required | required |
| S13 | truncation banner accent border `--color-warn` (non-text) on `--color-surface` | n/a | (script) | (script) | required (3:1) | required |
| S14 | parse-warnings banner copy `--color-ink-muted` on `--color-surface` | `--color-surface` | (script) | (script) | required | required |

Most of these pairs are byte-equivalent to M4's measurements (same tokens, same surfaces). The script output from M4 carries forward; M5's table re-runs the script for clarity. ZERO new tokens means the contrast table is largely confirmation — but the M4 catch "M2b r1 #1: contrast pair Claude reviewer approved despite a real ratio of 3.97:1 light" mandates re-measurement, not assumption.

### 7.5 `wireframes/` directory

Text-art ASCII wireframes (matching M4 precedent):

- `wireframes/01-standard-mixed.txt` — user_turn / boundary / user_turn / agent_only flow
- `wireframes/02-user-turn-collapsed.txt` — single user_turn with closed disclosure
- `wireframes/03-user-turn-agent-reaction-expanded.txt` — disclosure open, placeholder + expand-raw closed
- `wireframes/04-user-turn-expand-raw-expanded.txt` — full reveal: scoped TranscriptView mounted
- `wireframes/05-boundary-mid-stream.txt` — chapter break between two turns
- `wireframes/06-agent-only-collapsed.txt` — closed muted summary
- `wireframes/07-agent-only-expanded.txt` — scoped TranscriptView mounted
- `wireframes/08-oversized-user-message-collapsed.txt` — warn-tinted summary
- `wireframes/09-oversized-user-message-expanded.txt` — verbatim mono dump
- `wireframes/10-empty-stream.txt` — single agent_only(0 messages) block (never silently blank)
- `wireframes/11-truncated-with-banner.txt` — banner at top + 3-4 blocks beneath
- `wireframes/12-warnings-with-banner.txt` — banner at top + 3-4 blocks beneath

### 7.6 External design review (codex)

**Recommendation: INVOKE codex on the design artifact.**

**Rationale**: M5 is high-arch-design-risk parallel to M4 — new visible-surface family, new motion authorizations (skim-block stagger), boundary signature-detail #1 byte-equivalence verification, WCAG measurement gate at spec line 1058. M4's design loop ran multiple rounds; M5 should expect 2-3 codex design rounds.

**Iteration cadence**: up to 5 designer rounds (Claude UI/UX reviewer + codex pair). Convergence trajectory likely matches M4 — round 1 catches 2-5 BLOCKING; round 2 catches 1-2; round 3 ideally APPROVED.

## 8. Test obligations (`SkimView.test.tsx`)

Use Bun: `import { describe, it, expect, mock } from "bun:test"`. Use `@testing-library/react` + happy-dom. NO `jest.fn()`. NO `node:fs`. NO `child_process`. Mirror `TranscriptView.test.tsx` mock-pattern (process-wide `mock.module("./useParsedSession", ...)` + restoration in `afterAll`).

**Required test cases (≥ 35, projected ~40-50):**

### State machine (5 tests)
1. `state === "idle"` → empty-pane copy.
2. `state === "no_raw"` → "Not yet imported" copy.
3. `state === "loading"` → "Reading session…" copy.
4. `state === "error"` → error copy + Retry button; click Retry calls `result.retry()`.
5. `state === "success"` with empty messages → still renders single agent_only block (per the empty-stream sentinel) — verifies "never silently blank" invariant.

### `user_turn` rendering (8 tests)
6. user_turn renders the user message body inline.
7. user_turn renders code-fenced segments via `renderBodyWithCode` (assert `<pre class="msg-code-block">` for triple-backtick).
8. user_turn carries `<details>` summary "Agent reaction (N messages)" with N = `block.end - block.start`.
9. user_turn N=0 case (no agent reaction) → "Agent reaction (0 messages)".
10. user_turn N=1 case → "Agent reaction (1 messages)" — Q7 codex precedent: spec literal beats grammar.
11. Disabled placeholder copy renders verbatim per spec line 687.
12. "Expand to raw messages" affordance is present + activatable (click expands).
13. "Expand to raw messages" expanded mounts TranscriptView with `messageRange={{ start: block.start + 1, end: block.end }}` — assert via the rendered messageIndex range (e.g., expect only messages 1, 2, 3 rendered for `start:1 end:3`).

### `boundary` rendering (4 tests)
14. boundary block with `meta.subtype === "session_resumed"` renders "SESSION RESUMED".
15. boundary block with `meta.subtype === "compacted"` renders "CONVERSATION COMPACTED".
16. boundary block carries `role="separator"` + `aria-orientation="horizontal"`.
17. boundary block renders byte-equivalent DOM to TranscriptView's BoundaryMessage (snapshot-equivalent test using BoundaryRow shared component).

### `agent_only` rendering (4 tests)
18. agent_only summary text "Agent-only session ({count} messages)" with count = `block.end - block.start + 1`.
19. agent_only is collapsed by default (`<details>` without `open`).
20. agent_only expanded mounts TranscriptView with `messageRange={{ start: block.start, end: block.end }}`.
21. agent_only empty-stream sentinel (`block.end === -1`, `meta.empty === 1`) renders "Agent-only session (0 messages)" + expanded body shows TranscriptView's empty-stream copy.

### `oversized_user_message` rendering (5 tests)
22. oversized summary text "Oversized user message ({sizeKB} KB) — collapsed by default" with KB = `Math.round(sizeBytes / 1024)`.
23. oversized is collapsed by default.
24. oversized expanded shows verbatim text in `<pre>` with `--font-mono` (assert via class name `.skim-oversized-pre`).
25. oversized text is NOT summarized (assert the full message text is present in the DOM, not a truncation marker).
26. oversized has warning-tinted left border (assert via class name `.skim-block-oversized` + smoke-check the CSS rule includes `border-inline-start: ... var(--color-warn)`).

### Truncation + parse-warnings banners (5 tests)
27. Banner renders when `state === "truncated"` with verbatim spec copy.
28. Banner does NOT render when `state === "success"`.
29. Parse-warnings banner renders when `parsed.warnings.length > 0`.
30. Parse-warnings banner is dismissible (click Dismiss → banner unmounts).
31. Parse-warnings banner re-arrives after `row.rowKey` change (component-local state reset).

### Three-magnitude rhythm (3 tests, smoke-level)
32. Two adjacent same-kind user_turn blocks have the 24 px CSS rule applied (smoke-test via class adjacency, NOT computed-style assertion since happy-dom doesn't compute margins; the CSS source-string match via `Bun.file().text()` mirrors M4's pattern at SessionView.test.tsx line 465-477).
33. user_turn → agent_only adjacency has 32 px override (CSS source string test).
34. boundary adjacency has 32 px breathing (CSS source string test).

### Stagger animation (3 tests)
35. First block carries `style.animationDelay = "0ms"`.
36. Second block carries `style.animationDelay = "40ms"`.
37. 9th block (idx=8) and 10th block (idx=9) BOTH carry `style.animationDelay = "320ms"` — stagger cap test per spec line 1100.

### A11y (3 tests)
38. SkimView root carries `aria-label="Session skim outline"`.
39. `<details>` summaries are keyboard-focusable (assert via `tabIndex` not -1 + the native focusability of `<summary>`).
40. Boundary `role="separator"` is announced (`getByRole("separator")` succeeds).

### Keep-mounted regression (2 tests in SkimView.test.tsx; the cross-tab one in SessionView.test.tsx per §4.5)
41. SkimView does NOT remount on `now` prop change (stable identity check via `useRef` baked into a test helper).
42. Expanded `<details>` state survives a `now` prop change (spec invariant: keep-mounted contract).

### TranscriptView `messageRange` prop (3 new tests in TranscriptView.test.tsx per §4.7)
T1. No `messageRange` → renders all messages (regression for M4 contract).
T2. `messageRange={{ start: 1, end: 3 }}` renders messages with messageIndex 1, 2, 3 only.
T3. Out-of-bounds `messageRange={{ start: -5, end: 999 }}` clamps gracefully (no crash, renders the full available range).
T4. (Bonus) `messageRange={{ start: 0, end: -1 }}` (empty-stream sentinel) renders "No messages parsed." (no crash).

### BoundaryRow component (6-8 tests in BoundaryRow.test.tsx per §4.8)
B1. Renders `role="separator"` + `aria-orientation="horizontal"`.
B2. Default subtype renders "SESSION RESUMED".
B3. `subtype === "session_resumed"` renders "SESSION RESUMED".
B4. `subtype === "compacted"` renders "CONVERSATION COMPACTED".
B5. With `staggerIndex` prop, sets `style.animationDelay = "${idx * 40}ms"`.
B6. Without `staggerIndex` prop, no inline `animationDelay` style.
B7. Carries the three-element grid (`<span>` + `<span>` + `<span>`).
B8. Boundary label has class `.boundary-row-label` (used by Fraunces italic small-caps CSS).

**Total projected new test count: 35-50 in SkimView.test.tsx + 3-4 in TranscriptView.test.tsx + 6-8 in BoundaryRow.test.tsx + 3-4 in SessionView.test.tsx ≈ 47-66 new tests. Conservative estimate for §15: +40 tests.**

## 9. Verification commands

| Command | Baseline (M4 close) | Expected delta after M5 |
|---|---|---|
| `cargo check --workspace` | clean | clean (frontend-only chunk) |
| `cargo test -p distill-portal-ui-api-contracts --features ts-bindings` | 1 passed / 1 ignored | unchanged |
| `bun run test` | 491 pass / 0 fail / 1729 expects across 30 files | **~530-540 pass / 0 fail / +120-180 expects across 32-33 files** (SkimView.test.tsx +35-50; BoundaryRow.test.tsx +6-8; +3-4 in TranscriptView.test.tsx; +3-4 in SessionView.test.tsx) |
| `bun run build` | 28.58 kB CSS / 260.79 kB JS | **CSS ~32-34 kB (SkimView.css adds ~4-5 kB; BoundaryRow.css adds ~0.5 kB; TranscriptView.css shrinks ~0.5 kB after boundary extraction)** / **JS ~275-280 kB (SkimView.tsx adds ~10-15 kB; BoundaryRow.tsx adds ~0.5 kB)** |
| `bun run test:e2e` | 1 passed in 3.2s + transcript-perf.spec.ts (M4 added) | passing (inspection.spec.ts updated to assert SkimView surface; transcript-perf still passes) |
| `bunx tsc --noEmit` | clean | clean (BlockKind exhaustiveness `never` check enforces this) |
| `rg -n '#[0-9a-fA-F]{3,8}' apps/frontend/src/ \| wc -l` | 24 | 24 (NO new hex literals) |
| `grep -cE '^\s*--' apps/frontend/src/styles/tokens.css` | 83 | 83 (NO new tokens) |
| `rg -n 'var\(--' apps/frontend/src/features/sessions/SkimView.css \| sort -u` | n/a | every var must exist in tokens.css; no `--space-5/10/12` |
| `rg -n 'var\(--' apps/frontend/src/features/sessions/BoundaryRow.css \| sort -u` | n/a | every var must exist in tokens.css |
| `rg -n 'transition: (color\|border-color\|width\|height\|top\|padding)' apps/frontend/src/features/sessions/SkimView.css` | n/a | empty (motion budget) |
| `rg -n 'transition: background-color' apps/frontend/src/features/sessions/SkimView.css` | n/a | empty unless on enumerated surface |
| `rg -n 'jest\.fn\(\|node:fs\|child_process\|require\(' apps/frontend/src/features/sessions/SkimView*.test.tsx` | n/a | empty (Bun-first invariant) |
| `rg -n 'Coming in Milestone 5' apps/frontend/` | non-empty (in tests + e2e) | empty (placeholder retired) |
| `rg -nE 'Summary disabled — generation deferred' apps/frontend/src/features/sessions/SkimView.tsx` | n/a | exactly one match (the spec-literal placeholder) |
| `rg -nE 'Agent reaction \(' apps/frontend/src/features/sessions/SkimView.tsx` | n/a | exactly one match |
| `rg -nE 'Agent-only session \(' apps/frontend/src/features/sessions/SkimView.tsx` | n/a | exactly one match |
| `rg -nE 'Oversized user message \(' apps/frontend/src/features/sessions/SkimView.tsx` | n/a | exactly one match |
| `rg -nE 'SESSION RESUMED\|CONVERSATION COMPACTED' apps/frontend/src/features/sessions/BoundaryRow.tsx` | n/a | both literals present (subtype switch) |
| `rg -nE '"Expand to raw messages"' apps/frontend/src/features/sessions/SkimView.tsx` | n/a | exactly one match |

## 10. Hex / token invariants

**Baselines (M4 close):** Hex 24, tokens 83.

**Expected delta after M5: ZERO.**

**Rationale:** Spec line 866 + 885 + Resolved Decision #16: "reuse before invent". M2a + M2b shipped the design-language tokens; M4 + M5 consume them. The user_turn panel (5% accent tint), agent_only muted panel (default surface + hairline border), oversized warning border (`--color-warn`), boundary chapter-break (Fraunces italic small-caps) ALL achievable from existing tokens — confirmed against the M4 token consumption set. The only delta possibility is a WCAG fail forcing a token bump (rare; documented escalation path mirrors M4 plan §10).

**If escalation fires**: developer halts implementation, returns to coordinator with the failing pair + measured ratio; coordinator decides whether to amend tokens (rare; precedent: M2a r2 retint of `--color-warn` introduced the 4.21:1 `.title-cell-refresh` regression — a token bump must always come with a hex-isolation re-audit).

## 11. UI/UX gate decision

**Recommend `needs UI/UX work`.**

**Dispatch:** `frontend-design:frontend-design` skill into `working/phase-5/designs/m5-skim/`.

**Rationale:** M5 is the SECOND visible UI surface family in Phase 5. Introduces 4 new block-kind visual treatments (user_turn, boundary, agent_only, oversized_user_message), the nested-disclosure UX pattern (user_turn → Agent reaction → Expand to raw messages), the skim-block stagger animation (new motion authorization), and the WCAG measurement gate at spec line 1058. Boundary signature-detail #1 byte-equivalence verification at M5 close (spec line 691). Designer + Claude UI/UX reviewer + codex external review (per §7.6).

**Convergence expectation:** 2-5 designer rounds (codex precedent for visible-surface chunks). M2b had 5 rounds with 8 BLOCKING; M4 was similar.

**Artifact path:** `working/phase-5/designs/m5-skim/{design.md, prototype.html, motion.md, colors.md, wcag_m5.py, wireframes/}`

## 12. Recommended chunk split decision

**Recommendation: SINGLE-CHUNK (NOT split).**

**Rationale:**

The split candidates analyzed:

- **M5a (BoundaryRow extraction)** + **M5b (SkimView core)**: superficially appealing because BoundaryRow is a distinct refactor of M4 code. BUT:
  - BoundaryRow extraction's only consumer at M5a close would be `TranscriptView` (which already has the inline implementation working). Shipping M5a alone gives ZERO user-facing change — the work is dead until M5b lands SkimView. Chunk-padding for low signal.
  - The byte-equivalence verification (spec line 691) requires BOTH consumers to be present. Splitting forces a separate verification step at M5a close that has nothing to verify (only one consumer).
  - The design loop touches both surfaces simultaneously (the prototype.html + colors.md tables include boundary alongside the four block kinds). Splitting forces TWO design loops with overlap.

- **M5a (SkimView core)** + **M5b (long-corpus measurement)**: M4 spec mandates a long-corpus measurement step; M5 spec at lines 1042-1059 does NOT explicitly mandate one. Skim view is per-session bounded (session has at most ~thousands of skim blocks; spec line 681 caps stagger at 8). M4's perf measurement at p95 < 16 ms applies transitively to SkimView's expanded scoped TranscriptView (it uses the same component). M5 SHOULD record a perf observation in the progress log but does NOT need a separate Playwright spec. See §13.

- **Spec line 1042-1059 enumerates Milestone 5 as a single DoD list**; spec author's intent is one chunk.

**Estimated total footprint** (matching M4 ratio ~600-800 TSX + 250-400 CSS + 700-1000 test):
- SkimView.tsx ~500 lines
- SkimView.css ~300 lines
- SkimView.test.tsx ~900 lines
- BoundaryRow.tsx ~50 lines
- BoundaryRow.css ~50 lines
- BoundaryRow.test.tsx ~150 lines
- SessionView.tsx delta ~5 lines
- SessionView.test.tsx delta ~50 lines
- TranscriptView.tsx delta ~15 lines
- TranscriptView.test.tsx delta ~80 lines
- TranscriptView.css delta ~−40 lines (boundary extraction)
- e2e/inspection.spec.ts delta ~5 lines
- **Total: ~600-800 lines TSX + 300-400 CSS + 900-1100 test = comparable to M4 (~600-800 + 400-500 + 800-900).**

The chunk is large but coherent. Single-chunk recommended.

## 13. Long-corpus measurement

**M5 reuses M4's `transcript-5k.builder.ts` + observation, with a new variant.**

Spec line 1042-1059 does NOT explicitly require an M5 perf measurement. But the scoped TranscriptView mounted from inside an expanded user_turn `<details>` is a new render path — when a user expands "Expand to raw messages" on a long agent reaction (e.g., 20-message conversation), the scoped TranscriptView mounts and renders 20 MessageRows. The 5k-scenario applies if a single session has many blocks each with many agent reactions.

**Recommended observation step** (NOT a Playwright spec — just a manual measurement noted in the progress log):

1. Use the same 5k fixture from `transcript-5k.builder.ts`.
2. Open the seeded session → activate Skim tab.
3. Expand 3-4 user_turn `<details>` (each agent reaction has 5-20 messages).
4. Manual scroll on the SkimView surface; observe FPS in DevTools.
5. Acceptance: scrolling is smooth; first-paint under 200 ms (the stagger cap at 8 × 40 = 320 ms means visible-block stagger should not exceed 320 ms).

**If perf regresses**: M4's escape-hatch slot 2 reasoning carries forward — `@tanstack/react-virtual` would land for SkimView too, but the same instance (one slot consumes both surfaces). Document in progress log if observed.

**No new fixture needed.** No new Playwright spec. The progress log entry records the observation.

## 14. Open dependencies

What does M5 depend on?

- **`useParsedSession`** (M3b at `6563495`, with M4 patch at the M4 close commit) — discriminated state union; in-codebase; no expected change. Cache + epoch invariants preserved.
- **`TranscriptView`** (M4 close commit) — must accept additive `messageRange` prop. M5 modifies TranscriptView.tsx in a backward-compatible way (prop optional; defaults to "all messages").
- **`parsed.skim`** (M3a `buildSkim`) — at-`959becb` shape preserved. Includes empty-stream sentinel `{ kind: "agent_only", start: 0, end: -1, meta: { empty: 1 } }`.
- **`Tabs`** primitive (M2b at `6068d6f`) — in-codebase; no change.
- **`SessionView`** (M2b + M4) — M5 modifies one line + removes `SkimPlaceholder` function.
- **27-token consumption set** from M4 — no expected change. Tokens/hex baselines preserved.
- **Bun-first runtime invariants** — `bun:test`, `mock.module`, no `jest.fn()`, no `child_process`, no `node:fs`. No `npm`. No `node`.
- **Protected paths** — NO edits to `apps/backend/`, `components/`, `tests/e2e/` (Rust), root `Cargo.{toml,lock}`. M5 stays in `apps/frontend/`.

## 15. Expected outcomes

- **Test count delta**: M5 adds ~40-65 unit tests across 4 files (SkimView.test.tsx +35-50; BoundaryRow.test.tsx +6-8; TranscriptView.test.tsx +3-4; SessionView.test.tsx +3-4). e2e gets a one-line update (existing inspection.spec.ts) — no new e2e file.
- **Build size delta**: CSS 28.58 → ~32-34 kB (+4-5 kB); JS 260.79 → ~275-280 kB (+15-20 kB).
- **`bunx tsc --noEmit`**: clean (BlockKind exhaustiveness preserved; new TranscriptView prop typechecks; BoundaryRow types).
- **All 491 existing tests still pass** (additive M5 tests; M4 tests unaffected — boundary extraction is byte-equivalent).
- **Hex isolation invariant**: 24 → 24.
- **Token count invariant**: 83 → 83.
- **Dependency budget**: 1/2 → 1/2 (no new runtime dep; no slot 2 fire under expected path).
- **Skim tab functional** at M5 close. All four tabs operational. Spec line 1049 satisfied.
- **Boundary signature-detail #1 byte-equivalence verified**: BoundaryRow shared component renders the same DOM tree from both Transcript and Skim contexts. Spec line 691 satisfied.
- **Disabled-summary placeholder copy renders verbatim under every `user_turn`**. Spec line 687 satisfied.
- **No-user-msg session shows single collapsed `agent_only` block**. Spec line 1053 satisfied.
- **Single-oversize-user-msg session shows single `oversized_user_message` block**. Spec line 1054 satisfied.
- **WCAG AA on every new visible color pair** — verified via `wcag_m5.py` script in design artifact, both light + dark.

### Critical Files for Implementation

- /home/huwei/ai_codings/distill-portal/apps/frontend/src/features/sessions/SkimView.tsx
- /home/huwei/ai_codings/distill-portal/apps/frontend/src/features/sessions/SkimView.css
- /home/huwei/ai_codings/distill-portal/apps/frontend/src/features/sessions/SkimView.test.tsx
- /home/huwei/ai_codings/distill-portal/apps/frontend/src/features/sessions/BoundaryRow.tsx
- /home/huwei/ai_codings/distill-portal/apps/frontend/src/features/sessions/TranscriptView.tsx

---

## Summary (under 200 words; per dispatch instructions)

**UI/UX gate decision:** `needs UI/UX work` — M5 is the second visible UI surface family in Phase 5; introduces four new block-kind visual treatments, nested-disclosure UX (user_turn → Agent reaction → Expand to raw messages), and the skim-block stagger animation. Codex external review recommended; expect 2-3 design rounds.

**Single-chunk vs split:** Single-chunk. BoundaryRow extraction alone has zero user-facing value; spec enumerates Milestone 5 as one DoD list; total footprint comparable to M4.

**Open questions resolved (15):** scoped TranscriptView via additive `messageRange` prop (Q1); details closed by default (Q2); "Expand to raw messages" as nested `<details>` sibling of placeholder (Q3); BoundaryRow extracted as shared component for byte-equivalence (Q4); `renderBodyWithCode` re-exported from TranscriptView (Q5); hand-rolled fixtures (Q6); inline `style` for stagger with cap at 8 (Q7); `useParsedSession` invariant (Q8); 70ch measure (Q9); inclusive slice `slice(start, end+1)` with defensive clamping (Q10); `Math.round` for KB (Q11); both banners present in SkimView (Q12); native `<details>` semantics for body rendering (Q13); `aria-label="Session skim outline"` (Q14); no custom role on `<article>` (Q15).

**Unresolved questions for coordinator:** None blocking — all 15 questions resolved with rationale. Optional coordinator decision: whether to mandate the manual long-corpus observation step (§13) be recorded in the progress log even though M5 spec is silent on perf measurement.

