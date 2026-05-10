# M5 — SkimView (Phase 5 / Milestone 5)

Design artifact for **Phase 5 / Milestone 5 / SkimView**.
Spec frozen at `working/phase-5.md` @ `05467ad` on `main`.
Implementation predecessors: M1a closed at `a59b3f6`; M1b at `e8d80c5`;
M2a at `c1602e5`; M2b at `6068d6f`; M3a at `959becb`; M3b at `6563495`;
M4 closed at the M4 commit landing TranscriptView.tsx + the Open-raw
header anchor.
Designer: UI/UX subagent dispatched 2026-05-10.

This is a **reference artifact**. The developer subagent re-implements
against the production stack (Bun + Vite + React + TS + per-component
sibling CSS). Nothing in this folder ships to `apps/frontend/`; the
prototype's hex-fallback literals do not contaminate the
`apps/frontend/src/` audit count.

---

## 1. Brief

**M5 is the chunk where the second editorial reading surface lands.**
M2a established the Archive-room language (Fraunces display + Inter
chrome + JetBrains Mono code + oklch-driven warm-paper palette + 83
tokens + the noise overlay). M2b shipped the chrome (tab strip +
header + Metadata + Raw + two placeholders). M3a / M3b shipped the
silent machinery (per-tool parsers, `useParsedSession`, `cacheEpoch`,
`buildSkim`). M4 turned parsed messages into chronological transcript
prose. **M5 turns `parsed.skim` into the editorial outline** — the
second visible UI family in Phase 5.

The Skim tab is **not the default landing surface** at M5 close
(per Resolved Decision #11 step 3): Transcript stays default until
LLM summaries land in a future phase. Skim becomes functional
this chunk: clicking the tab now lands a real outline of the session
with four block kinds — `user_turn`, `boundary`, `agent_only`,
`oversized_user_message` — instead of the M2b placeholder copy
"Coming in Milestone 5".

The aesthetic carries forward, untouched. M5 introduces ZERO new
tokens, ZERO new motion vocab, ZERO new fonts, ZERO new hex literals.
Every visible decision in this artifact is a **principled
composition** of the M2a / M2b / M4 tokens, motion, and DOM idioms.

### 1.1 What M5 ships

- `SkimView.tsx` + `.css` + `.test.tsx`: the editorial outline
  surface for the Skim tab. State-machine consumer of
  `useParsedSession` (idle / no_raw / loading / error / success /
  truncated). Renders `parsed.skim` (the `SkimBlock[]` from
  `buildSkim`) as a vertical stream of typed blocks.
- `BoundaryRow.tsx` + `.css` + `.test.tsx`: a SHARED component
  extracted from M4's TranscriptView boundary recipe. Both
  TranscriptView (refactored, byte-equivalent DOM) and SkimView
  consume it. This is signature detail #1 — verified at M5 close.
- A skim-block first-paint stagger animation: `opacity 0->1` +
  `translateY(4px -> 0)` per block, 40 ms x min(idx, 8) delay,
  `--motion-disclosure` (200 ms) ease-out duration. Authorized by
  spec §Motion budget row 9 (`working/phase-5.md:93`).
- Truncation banner + parse-warnings banner reused at byte-equivalent
  visual recipe to M4's banners (per planner Q12).
- TranscriptView gains an additive optional `messageRange={start,
  end}` prop (per planner Q1). When supplied, the body slices
  `parsed.messages.slice(start, end + 1)` before rendering. Default
  behavior unchanged (renders all messages). M4 tests must still
  pass — the prop is BACKWARD-COMPATIBLE.
- `SessionView.tsx` swaps the `<SkimPlaceholder />` for `<SkimView />`.
  `DEFAULT_TAB_ON_SELECTION` stays `"transcript"`.

### 1.2 What M5 does NOT do

- It does NOT introduce new tokens. The 83-token canon is reused
  verbatim. If a WCAG pair were to fail with all available tokens,
  implementation halts and escalates to coordinator before adding —
  same protocol M4 documented.
- It does NOT introduce new motion authorizations beyond the spec
  table at `working/phase-5.md:84-95`. The skim-block stagger is
  spec-row 9 (verbatim). Disclosure animations are spec-row 3
  (verbatim). Banner appearance is spec-row 9 (truncation) /
  spec-row 3 (parse-warnings disclosure).
- It does NOT touch Metadata or Raw tabs. M2b + M4's wiring stands.
- It does NOT change `DEFAULT_TAB_ON_SELECTION`. Stays `"transcript"`.
- It does NOT introduce LLM summaries, search, annotations,
  highlights, or virtualization. All deferred to Phase 6+.
- It does NOT modify `useParsedSession`, `buildSkim`, or any
  parser. M5 is a pure consumer of the data layer.
- It does NOT introduce a new motion budget surface. The skim-block
  stagger is spec-table row 9 — already authorized.

### 1.3 What M5 composes

| Predecessor surface              | M5 consumption                                                                               |
|----------------------------------|----------------------------------------------------------------------------------------------|
| **TranscriptView** (M4)          | Re-mounted under user_turn "Expand to raw messages" disclosures + agent_only block expansion |
| **`useParsedSession`** (M3b)     | Discriminated state-union dispatch; same five non-success state branches                     |
| **`buildSkim`** (M3a)            | `SkimBlock[]` consumed; per-kind switch with TS exhaustiveness on `BlockKind`                |
| **`Tabs`** primitive (M2b)       | SkimView mounts inside the Skim tab panel                                                    |
| **`SessionView`** shell (M2b/M4) | Wiring point; the skim slot in `panelContent` switches from placeholder to SkimView          |
| **27-token consumption set** (M4)| Same tokens reused; ZERO new                                                                 |
| **`renderBodyWithCode`** (M4)    | Re-exported from TranscriptView; SkimView calls it on user_turn body text                    |

### 1.4 The four block kinds at a glance

| Block kind                  | Visual signature                                                                                                                              | Disclosure default |
|-----------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------|--------------------|
| `user_turn`                 | Accent-tinted reading panel (5 % accent + surface mix). Below it: closed `<details>` "Agent reaction (N messages)". Inside: disabled placeholder + nested `<details>` "Expand to raw messages" mounting a scoped TranscriptView. | Outer + inner `<details>` both CLOSED. |
| `boundary`                  | Full-width 1 px hairline at `--color-border-strong` + centered Fraunces italic small-caps label. 32 px breathing top + bottom. NEVER merged with neighbors. **BYTE-EQUIVALENT to M4's chapter break (signature detail #1).** | n/a (no disclosure). |
| `agent_only`                | Muted bordered panel (hairline at `--color-border`, NO accent tint). Summary: "Agent-only session (N messages)". Expanding mounts scoped TranscriptView spanning `[block.start, block.end]`. | CLOSED. |
| `oversized_user_message`    | Warning-tinted left border in `--color-warn` (4 px). Summary: "Oversized user message (N KB) — collapsed by default". Expanding shows verbatim text in `<pre>` at `--font-mono`. NEVER summarized. | CLOSED. |

---

## 2. Aesthetic recap

M5 inherits the Archive-room language from M2a + M2b + M4. NO new
aesthetic decisions. Six restraints carry the weight, identical to
M4's design.md §1:

1. **Ink-on-paper rhythm.** Reading content lives at 70ch
   (`var(--measure)`) with `--leading-comfortable` (1.55). Skim
   blocks stack vertically with a three-magnitude rhythm: 24 px
   between same-kind adjacent blocks, 32 px between different-kind
   adjacent blocks, 32 px around boundary blocks. The rhythm token
   set is the same `--space-6` / `--space-8` pair M4 used.

2. **One tint, used surgically.** User_turn blocks carry a 5 %
   accent tint over the surface — same `color-mix(in srgb,
   var(--color-accent) 5%, var(--color-surface))` recipe M4's
   `.msg-user` panel uses. Agent_only blocks sit on the bare warm
   paper surface with a `--color-border` hairline (no accent tint;
   spec line 693). Oversized blocks carry a 4 px `--color-warn`
   left border (no background tint). Truncation banner carries an
   8 % warn tint with a 3 px `--color-warn` stripe (byte-equivalent
   to M4's banner). Parse-warnings banner sits on
   `--color-surface-raised` with a hairline (also byte-equivalent
   to M4).

3. **Chapter breaks as page furniture.** `boundary` blocks render
   identically to M4's recipe — 1 px hairlines flanking a Fraunces
   italic small-caps label ("SESSION RESUMED" / "CONVERSATION
   COMPACTED"). 32 px breathing top + bottom. **Byte-equivalent
   between M4 and M5 (signature detail #1).** M5 ships the shared
   `BoundaryRow` component to GUARANTEE byte-equivalence; both
   TranscriptView (refactored, no behavior change) and SkimView
   import the shared component.

4. **Banners that whisper.** Truncation banner = opacity-only
   entrance + warn stripe + 8 % warn-tinted background, identical
   recipe to M4. Parse-warnings banner = `<details>` element with
   block-size disclosure, identical recipe to M4. Both copy strings
   match M4's verbatim.

5. **Nested disclosure as the user_turn motif.** Each `user_turn`
   carries TWO `<details>` elements: outer "Agent reaction (N
   messages)" closed by default; inside its body lives the disabled
   placeholder + an inner `<details>` whose summary is "Expand to
   raw messages". Clicking the inner summary mounts the scoped
   TranscriptView. This nested-disclosure shape is editorial: the
   user opts in to read the agent reaction (level 1), then opts in
   AGAIN to see the raw message content (level 2). The placeholder
   sits between levels 1 and 2 carrying the spec-mandated copy.

6. **First-paint stagger as the only new motion surface.** Skim
   blocks fade in with a 40 ms x min(idx, 8) staggered delay on
   first paint per session. `opacity 0->1` + `transform:
   translateY(4px -> 0)` ONLY. NEVER on `top`, NEVER on
   `padding/width/height`, NEVER on `color/border-color`. Authorized
   by spec §Motion budget row 9 (working/phase-5.md line 75).
   Reduced-motion zeroes the stagger via the global rule.

The visual continuity statement: a returning user opens a session,
clicks the Skim tab, and sees the editorial outline: each user message
in its own accent-tinted panel; agent reactions folded behind quiet
chrome disclosures; oversized pastes flagged with a warning border;
chapter breaks acting as page furniture. NO new typography. NO new
colors. NO new motion. The outline reads as a printed table of
contents, not a feed.

References: M2a `apps/frontend/src/styles/tokens.css` lines 1-211 (the
83-token canon); M4 `working/phase-5/designs/m4-transcript/design.md`
lines 14-110 (§1 brief) + lines 478-570 (§4 spacing); M2b
`apps/frontend/src/components/Tabs.tsx` (the disclosure-friendly tab
panel).

---

## 3. Token consumption

M5 consumes exactly the tokens enumerated below. Every token MUST
exist in `apps/frontend/src/styles/tokens.css`. ZERO net additions.

The list is grouped by usage. Each entry includes (a) the token, (b)
where it's used (selector + block kind), (c) the rationale for
choosing this token over a near-neighbor.

### 3.1 Color tokens (8 — same set as M4)

| Token                      | Where                                                                                                                    | Why                                                                                                                                |
|----------------------------|--------------------------------------------------------------------------------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------|
| `--color-ink`              | user_turn body, oversized header, oversized verbatim `<pre>`, truncation banner copy, parse-warnings summary, retry text | Body-weight ink that hits AAA against `--color-surface` AND `--color-surface-raised` AND the warn-mix banner background.            |
| `--color-ink-muted`        | "Agent reaction" summary, disabled placeholder, agent-only summary, boundary label, system-style chrome rows             | The chrome muted ink. Reads as metadata, not body. Hits AAA against `--color-surface` per M4 T22.                                  |
| `--color-surface`          | agent_only panel, oversized panel, banner backgrounds, every state-branch root                                            | Default warm-paper surface. M2a canon.                                                                                              |
| `--color-surface-raised`   | inline `<code>` and code-fenced `<pre>` inside user_turn body, oversized verbatim `<pre>`, parse-warnings banner shell    | Marks machinery vs prose. Same recipe M4 uses for code-fenced + tool `<pre>`.                                                       |
| `--color-accent`           | user_turn 5 % tint, "Expand to raw messages" affordance, focus-visible outlines                                          | The single accent. M2a-codex-tuned to L=55 light / L=65 dark for AA at 4.5:1.                                                       |
| `--color-border`           | agent_only panel hairline, disabled placeholder 4 px left border, parse-warnings dismiss button, banner shells           | Hairline border for non-chrome shells. Decorative-grade; the SC 1.4.11 obligation lives on the focus outline (not the resting border). |
| `--color-border-strong`    | boundary chapter-break rules (the 1 px hairlines)                                                                         | The boundary's structural rules. M2a-cusp-documented (3.00:1 dark, accepted M4 risk).                                               |
| `--color-warn`             | oversized 4 px left border, truncation banner stripe + 8 % background mix                                                 | Capacity-warning status color. NOT `--color-error` (which is a fatal-state color). Matches M4 truncation banner.                    |

`--color-error` is NOT consumed by SkimView's success path. It IS
consumed by the `error` state branch (mirrors M4's `state === "error"`
prose) per planner §4.1.

### 3.2 Typography tokens (8 — same set as M4)

| Token                      | Where                                                                                          |
|----------------------------|------------------------------------------------------------------------------------------------|
| `--font-display`           | boundary label only (Fraunces italic small-caps).                                              |
| `--font-chrome`            | every other text surface (summaries, body prose, banner copy, state-branch prose).             |
| `--font-mono`              | code-fenced segments inside user_turn body, oversized verbatim `<pre>`.                         |
| `--text-xs`                | none in M5 (M4 uses it on attribution rows, which SkimView does not render — block summaries replace per-message attribution). |
| `--text-sm`                | every summary (agent reaction / agent-only / oversized / boundary label / banners), state-branch prose. |
| `--text-base`              | user_turn body (the user message text itself).                                                  |
| `--leading-comfortable`    | user_turn body, banner body.                                                                   |
| `--measure`                | user_turn panel max-inline-size, agent_only panel max-inline-size, body text columns.           |

Note: M4 used `--text-xs` for attribution rows (e.g., "USER · 12
minutes ago"). M5's user_turn block does NOT have an attribution row —
the user message stands as its own panel without per-message
metadata at the Skim level (the Skim view is the editorial outline;
chronology lives in the Transcript tab). The `--text-xs` token is
NOT consumed by M5's surface; the M5 token consumption count is
27 (M4 was 28; the difference is `--text-xs` removal).

### 3.3 Spacing tokens (6 — same set as M4)

| Token        | Resolved        | Where                                                                                |
|--------------|-----------------|--------------------------------------------------------------------------------------|
| `--space-1`  | `0.25rem` / 4 px | inline `<code>` padding, summary inline padding.                                    |
| `--space-2`  | `0.5rem` / 8 px  | summary block padding, list-item padding, dismiss button padding.                   |
| `--space-3`  | `0.75rem` / 12 px | banner outer padding, agent_only panel inner padding, code block inset.            |
| `--space-4`  | `1rem` / 16 px   | banner padding, banner outer padding, disabled-placeholder inline-start padding.    |
| `--space-6`  | `1.5rem` / 24 px | user_turn panel block-padding, **same-kind block rhythm**, banner margin-bottom.    |
| `--space-8`  | `2rem` / 32 px   | user_turn panel inline-padding, **kind-change block rhythm**, **boundary breathing**, state-branch padding. |

Forbidden: `--space-5`, `--space-10`, `--space-12` (DO NOT EXIST in
tokens.css; M2b r1 #3 codex catch precedent).

### 3.4 Radius tokens (2 — same set as M4)

| Token         | Where                                                                |
|---------------|----------------------------------------------------------------------|
| `--radius-sm` | inline `<code>`, code block `<pre>`, banner shells, dismiss button.  |
| `--radius-md` | user_turn panel, agent_only panel.                                   |

### 3.5 Motion tokens (4 — same set as M4)

| Token                  | Resolved      | Where                                                                                                    |
|------------------------|---------------|----------------------------------------------------------------------------------------------------------|
| `--motion-base`        | `120 ms`      | truncation banner opacity entrance.                                                                     |
| `--motion-disclosure`  | `200 ms`      | `<details>` block-size animation (inherited via global rule); **skim-block stagger keyframe duration**. |
| `--ease-out`           | `cubic-bezier(0, 0, 0.2, 1)` | banner entrance, skim-block stagger.                                                                  |
| `--ease-in-out`        | `cubic-bezier(0.4, 0, 0.6, 1)` | disclosure animation easing (inherited).                                                               |

`--motion-fast` (80 ms) is NOT consumed (no hover-tint in M5;
hover-states-instant matches M4).
`--motion-pulse` (600 ms) is NOT consumed (M1a deep-link pulse;
not an M5 surface).
`--ease-standard` is NOT consumed (M2b tab-strip indicator only).

### 3.6 Total token consumption

- 8 color + 8 typography + 6 spacing + 2 radius + 4 motion = **28 distinct tokens**
  (NOT counting `--color-error` which is consumed only on the error
  branch; including it gives 29). M5 introduces ZERO new tokens; all
  consumed are M2a-canonical.

Cross-check command (run at implementation close):

```
rg -no 'var\(--[a-z0-9-]+\)' apps/frontend/src/features/sessions/SkimView.css \
  | sort -u
```

Expected: every name in the output appears in
`apps/frontend/src/styles/tokens.css`. NO `--space-5/10/12`. NO new
tokens.

---

## 4. Block-kind visual treatments

Each subsection specifies one BlockKind. Every rule is anchored to a
spec line range so a future codex round can verify the recipe against
the source-of-truth.

### 4.1 `user_turn` — accent-tinted reading panel + nested disclosures

Spec anchor: `working/phase-5.md:685-689` (verbatim).

#### 4.1.1 Outer panel

**Container.** `<li class="skim-block skim-block-user-turn">` with the
inner content tree:

```html
<li class="skim-block skim-block-user-turn">
  <article class="skim-user-panel">
    <div class="skim-user-body">{user message body, with code-fence rewriting}</div>
  </article>
  <details class="skim-agent-reaction">
    <summary class="skim-agent-reaction-summary">Agent reaction (N messages)</summary>
    <div class="skim-agent-reaction-body">
      <p class="skim-summary-disabled">Summary disabled — generation deferred to a later phase. Use "Expand to raw messages" to read the agent's response inline.</p>
      <details class="skim-expand-raw">
        <summary class="skim-expand-raw-summary">Expand to raw messages</summary>
        <div class="skim-expand-raw-body">
          <TranscriptView row={row} now={now} messageRange={{start: block.start+1, end: block.end}} />
        </div>
      </details>
    </div>
  </details>
</li>
```

**`<article class="skim-user-panel">`.** Background `color-mix(in
srgb, var(--color-accent) 5%, var(--color-surface))` — byte-equivalent
to M4 `.msg-user` background. Padding `var(--space-6) var(--space-8)`
= 24 px / 32 px (spec line 685: "Panel padding 24 px 32 px"). Border-
radius `var(--radius-md)`. Max-inline-size `var(--measure)` (= 70ch;
spec line 681: "Block content respects the 70ch reading measure").
NO border (the tint differential carries the discrimination).

**`<div class="skim-user-body">`.** `--font-chrome --text-base
--leading-comfortable --color-ink`. White-space `pre-wrap` so embedded
newlines preserve.

**Code-fenced segments inside the body.** Reuse M4's
`renderBodyWithCode` helper, re-exported from TranscriptView per
planner Q5. Inline `<code>`: `--font-mono --text-sm` background
`--color-surface-raised` padding `0 var(--space-1)` border-radius
`--radius-sm`. Code block `<pre>`: same background, padding
`var(--space-3) var(--space-4)`, margin `var(--space-3) 0`,
border-radius `--radius-sm`, `overflow-x: auto`, `--font-mono
--text-sm`. The CSS classes (`.msg-code-inline`, `.msg-code-block`)
are inherited from `TranscriptView.css` via the cascade — SkimView
does not redeclare them.

#### 4.1.2 "Agent reaction (N messages)" disclosure

Spec literal: `Agent reaction (N messages)` for ALL N (M4
parse-warnings precedent: spec literal beats English grammar).
N = `block.end - block.start` (the messages AFTER the user message
at `block.start`). Examples:

- N = 0 (user message with no following agent reaction): `Agent reaction (0 messages)`.
- N = 1: `Agent reaction (1 messages)` (grammatically odd; spec literal).
- N = 5: `Agent reaction (5 messages)`.

**`<details class="skim-agent-reaction">`.** CLOSED by default
(planner Q2). The `<details>` block-size animation inherited via
global `details > *:not(summary)` rule (M2b authorization).

**`<summary class="skim-agent-reaction-summary">`.**
- Typography: `--font-chrome --text-sm --color-ink-muted`.
- Padding: `var(--space-2) 0`.
- `cursor: pointer`. `list-style: revert` (preserve native disclosure
  triangle).
- NO `text-transform`, NO `letter-spacing` (this is body chrome,
  not an attribution row).
- The summary is the accessible label for the disclosure (a11y §9).

#### 4.1.3 Disabled placeholder paragraph

Spec literal (verbatim, spec line 687):

> Summary disabled — generation deferred to a later phase. Use "Expand to raw messages" to read the agent's response inline.

**`<p class="skim-summary-disabled">`.**
- Typography: `--font-chrome --text-sm --color-ink-muted`.
- `font-style: italic` (visual cue: this is placeholder, not real content).
- 4 px left border in `--color-border` (spec line 689: "4 px left-border in `--color-border`").
- Padding-inline-start: `var(--space-4)`.
- Margin-block: `var(--space-3) 0`.
- Max-inline-size: `var(--measure)` (the placeholder respects the 70ch
  reading measure too — placed inside the agent-reaction body which
  flows under the user_turn panel).

The "Expand to raw messages" inside the placeholder text is plain text
with double quotes (matches the spec literal exactly). It is NOT a
hyperlink in the placeholder paragraph; the actual affordance is the
adjacent `<summary>` (next).

#### 4.1.4 "Expand to raw messages" nested affordance

Spec line 689: "Followed by an 'Expand to raw messages' affordance
(button styled as a quiet text link): clicking renders a scoped
TranscriptView restricted to the messageIndex range
`[block.start+1, block.end]`."

Per planner Q3, the affordance is a NESTED `<details>` element
whose `<summary>` reads "Expand to raw messages". The visual
"button styled as a quiet text link" requirement is satisfied via
CSS on the `<summary>`. The semantics of `<details>` give us:

- Native keyboard handling (Enter / Space toggles).
- Native focus management.
- The block-size disclosure animation (motion-budget authorized).
- No React expanded-state mirror.

**`<details class="skim-expand-raw">`.** CLOSED by default.

**`<summary class="skim-expand-raw-summary">`.**
- Typography: `--font-chrome --text-sm`.
- Color: `--color-accent` (the quiet-link recipe; matches M4's
  tool_result "Expand" affordance exactly).
- `cursor: pointer`. `list-style: revert` (preserve disclosure
  triangle so the affordance reads unambiguously as expandable).
- Padding-block: `var(--space-2)`.
- Hover: `text-decoration: underline` (instant — no transition;
  matches M4's `<summary>` hover behavior).

**`<div class="skim-expand-raw-body">`.** Hosts the scoped
`<TranscriptView />` mount. NO additional padding (TranscriptView
brings its own). Margin-block-start: `var(--space-3)` to separate
from the summary.

#### 4.1.5 Spec-literal copy invariants

Each of these strings MUST appear verbatim in `SkimView.tsx`:

```
Agent reaction (${count} messages)
Summary disabled — generation deferred to a later phase. Use "Expand to raw messages" to read the agent's response inline.
Expand to raw messages
```

Verification (run at implementation close):

```
rg -nE 'Agent reaction \(' apps/frontend/src/features/sessions/SkimView.tsx
rg -nE 'Summary disabled — generation deferred' apps/frontend/src/features/sessions/SkimView.tsx
rg -nE '"Expand to raw messages"' apps/frontend/src/features/sessions/SkimView.tsx
```

Each command should match exactly once.

### 4.2 `boundary` — chapter break (signature detail #1, byte-equivalent to M4)

Spec anchor: `working/phase-5.md:691` + `:66` + Resolved Decision #16
(line 691: "verified at M5 close").

**This is signature detail #1.** The boundary recipe MUST render the
SAME DOM tree (modulo the optional `style` attribute for stagger) in
both TranscriptView (M4) and SkimView (M5). Per planner Q4, M5
extracts a SHARED `<BoundaryRow>` component to GUARANTEE
byte-equivalence.

#### 4.2.1 Shared component shape

```tsx
// apps/frontend/src/features/sessions/BoundaryRow.tsx
export type BoundarySubtype = "session_resumed" | "compacted";

export function BoundaryRow({
  subtype,
  staggerIndex,
}: {
  subtype?: BoundarySubtype;
  staggerIndex?: number;
}) {
  const label = subtype === "compacted" ? "CONVERSATION COMPACTED" : "SESSION RESUMED";
  const style = staggerIndex !== undefined ? { animationDelay: `${staggerIndex * 40}ms` } : undefined;
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

Rendered DOM tree (both contexts):

```html
<li class="boundary-row" role="separator" aria-orientation="horizontal">
  <span aria-hidden="true" class="boundary-row-rule boundary-row-rule-start"></span>
  <span class="boundary-row-label">SESSION RESUMED</span>
  <span aria-hidden="true" class="boundary-row-rule boundary-row-rule-end"></span>
</li>
```

The only context-specific difference: SkimView passes `staggerIndex`
so the wrapping `<li>` carries `style="animation-delay: ${idx*40}ms"`;
TranscriptView omits the prop. The flat `<li role="separator">` shape
matches M4's design.md §2.1 + §3.6 + §12.2 verbatim.

#### 4.2.2 BoundaryRow.css recipe (extracted from M4)

```css
/* apps/frontend/src/features/sessions/BoundaryRow.css */

.boundary-row {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: var(--space-4);
  margin-block: var(--space-8);  /* 32 px breathing top + bottom */
  list-style: none;
  inline-size: 100%;
  /* NO max-inline-size: rules reach edge-to-edge of the stream container,
     while the stream itself is constrained to var(--measure). */
}

.boundary-row-rule {
  block-size: 1px;
  inline-size: 100%;
  background: var(--color-border-strong);
}

.boundary-row-label {
  font-family: var(--font-display);
  font-size: var(--text-sm);
  color: var(--color-ink-muted);
  font-style: italic;
  font-variant: small-caps;
  letter-spacing: 0.18em;
  padding: 0 var(--space-3);
}
```

**Byte-equivalent to M4's `.msg-boundary*` declarations** (cite
`working/phase-5/designs/m4-transcript/design.md:384-406`). The
class-name change `.msg-boundary` -> `.boundary-row` makes the
selector neutral between Transcript-message and Skim-block contexts.

#### 4.2.3 BoundaryRow extraction surface

The M4 refactor:

1. Lift the `BoundaryMessage` body from `TranscriptView.tsx` lines
   362-384 (the inline `<li role="separator">` recipe) into the new
   `BoundaryRow.tsx`.
2. Lift the `.msg-boundary*` declarations from `TranscriptView.css`
   into `BoundaryRow.css` as `.boundary-row*`.
3. Update `TranscriptView.tsx`'s `BoundaryMessage` to render
   `<BoundaryRow subtype={msg.boundarySubtype} />` (no
   `staggerIndex` — Transcript doesn't stagger).
4. Update `TranscriptView.css` rhythm rules at lines 168-172:
   replace `.msg-boundary` with `.boundary-row`.
5. SkimView imports `BoundaryRow` directly.

**M4 invariance:** the rendered DOM tree is byte-equivalent.
TranscriptView's existing boundary tests (existence test ID #11 per
M4 plan §8) still pass; the assertions either target
`getByRole("separator")` (class-agnostic) or update from
`.msg-boundary*` to `.boundary-row*` (one-line selector edit).

#### 4.2.4 Spec-literal copy

Boundary subtype mapping:
- `subtype === "session_resumed"` -> `SESSION RESUMED`
- `subtype === "compacted"` -> `CONVERSATION COMPACTED`
- `subtype === undefined` -> `SESSION RESUMED` (default, defensive).

Strings are uppercase in source (NOT relying on `text-transform`).
Fraunces' small-caps glyph set is exercised on uppercase input — the
OpenType font feature handles the rest.

Verification (run at implementation close):

```
rg -nE 'SESSION RESUMED|CONVERSATION COMPACTED' apps/frontend/src/features/sessions/BoundaryRow.tsx
```

Both literals must appear (one in the ternary).

### 4.3 `agent_only` — muted bordered panel + scoped TranscriptView reveal

Spec anchor: `working/phase-5.md:693`.

#### 4.3.1 Panel shape

```html
<li class="skim-block skim-block-agent-only">
  <details class="skim-agent-only">
    <summary class="skim-agent-only-summary">Agent-only session (N messages)</summary>
    <div class="skim-agent-only-body">
      <TranscriptView row={row} now={now} messageRange={{start: block.start, end: block.end}} />
    </div>
  </details>
</li>
```

#### 4.3.2 Visual recipe

**`<details class="skim-agent-only">`.** CLOSED by default (spec line
693: "collapsed by default"; PRD line 256). Border `1px solid
var(--color-border)`. Border-radius `var(--radius-md)`. Padding
`var(--space-3) var(--space-4)` (12 px / 16 px — tight chrome
disclosure padding, NOT the user_turn 24/32 reading-panel padding).
Background `var(--color-surface)` (default surface; spec line 693:
"NO accent tint"). Max-inline-size `var(--measure)` (the disclosure
respects the reading column).

**`<summary class="skim-agent-only-summary">`.**
- `--font-chrome --text-sm --color-ink-muted` (spec line 693: "summary
  line in `--font-chrome` `--text-sm` `--color-ink-muted`").
- `cursor: pointer`. `list-style: revert`.
- NO uppercasing or letter-spacing.

**`<div class="skim-agent-only-body">`.** Hosts the scoped
`<TranscriptView />`. Margin-block-start `var(--space-3)`. NO inner
padding (TranscriptView brings its own stream-container padding).

#### 4.3.3 Spec-literal pluralization

Count formula: `block.end - block.start + 1` (inclusive both ends).
Spec literal for ALL N (matches "Agent reaction" precedent):

- N = 0 (empty-stream sentinel: `block.start = 0, block.end = -1`):
  `Agent-only session (0 messages)`.
- N = 1: `Agent-only session (1 messages)` (spec literal beats grammar).
- N = 12: `Agent-only session (12 messages)`.

#### 4.3.4 Empty-stream sentinel handling

Per `buildSkim.ts` line 55: when `parsed.messages` is empty,
`buildSkim` emits `{ kind: "agent_only", start: 0, end: -1, meta: {
empty: 1 } }`. The count formula gives N = 0, summary text "Agent-only
session (0 messages)". Expanding the disclosure mounts a scoped
TranscriptView with `messageRange={{start: 0, end: -1}}`. Per planner
Q10, TranscriptView's body slice clamps `hi < lo` to an empty slice
and renders the spec-anchored "No messages parsed." copy. This
satisfies spec line 697 ("never silently blank"): both the summary
line ("Agent-only session (0 messages)") and the expanded body
("No messages parsed.") carry copy.

Verification (run at implementation close):

```
rg -nE 'Agent-only session \(' apps/frontend/src/features/sessions/SkimView.tsx
```

Must match exactly once (the JSX template).

### 4.4 `oversized_user_message` — warning-tinted left border + verbatim mono dump

Spec anchor: `working/phase-5.md:695`.

#### 4.4.1 Panel shape

```html
<li class="skim-block skim-block-oversized">
  <details class="skim-oversized">
    <summary class="skim-oversized-summary">Oversized user message ({sizeKB} KB) — collapsed by default</summary>
    <div class="skim-oversized-body">
      <pre class="skim-oversized-pre">{verbatim message text}</pre>
    </div>
  </details>
</li>
```

#### 4.4.2 Visual recipe

**`<li class="skim-block skim-block-oversized">`.**
- Border-inline-start: `4px solid var(--color-warn)` (spec line 695:
  "warning-tinted left border ... so the user notices the size signal").
- Padding-inline-start: `var(--space-4)` (so the body content does
  not flush against the warn stripe).
- NO background tint (the stripe is the only color signal).
- Max-inline-size `var(--measure)`.

**`<details class="skim-oversized">`.** CLOSED by default (spec line
695: "collapsed by default"; PRD line 257).

**`<summary class="skim-oversized-summary">`.**
- `--font-chrome --text-sm --color-ink` (NOT `--color-ink-muted` —
  the oversized header is a warning signal, not muted chrome).
- `cursor: pointer`. `list-style: revert`.
- The em-dash inside the summary copy is U+2014 EM DASH (single
  Unicode character). The literal:
  `Oversized user message (${sizeKB} KB) — collapsed by default`.

**`<pre class="skim-oversized-pre">`.**
- `--font-mono --text-sm`.
- Background `var(--color-surface-raised)` (matches the M4 tool `<pre>`
  recipe).
- Padding `var(--space-3) var(--space-4)`.
- Border-radius `--radius-sm`.
- `white-space: pre`. `overflow-x: auto`.
- NEVER summarized (spec line 695: "NEVER summarized"; PRD line 257).
  The full `parsed.messages[block.start].text` is rendered verbatim.

#### 4.4.3 KB conversion

Per planner Q11: `Math.round(meta.sizeBytes / 1024)`.

- `meta.sizeBytes = 65537` -> `Math.round(64.0009)` = `64` -> "64 KB".
- `meta.sizeBytes = 70000` -> `Math.round(68.359)` = `68` -> "68 KB".
- `meta.sizeBytes = 102400` -> `Math.round(100.0)` = `100` -> "100 KB".
- `meta.sizeBytes = undefined` -> defensive `0` -> "0 KB".

#### 4.4.4 Spec-literal copy

Verbatim:

```
Oversized user message (${sizeKB} KB) — collapsed by default
```

Verification (run at implementation close):

```
rg -nE 'Oversized user message \(' apps/frontend/src/features/sessions/SkimView.tsx
```

Must match exactly once (the JSX template).

---

## 5. Spacing rhythm

Spec anchor: `working/phase-5.md:681`:

> "blocks stack vertically with 24 px breathing room between same-kind blocks, 32 px between different kinds. Block content respects the 70ch reading measure."

The rhythm has three magnitudes (mirrors M4's three-magnitude rule
but rebalanced for skim blocks; M4 used 16/24/32, M5 uses 24/32/32):

| Distance | Token            | Resolved   | Used between                                                                |
|----------|------------------|------------|------------------------------------------------------------------------------|
| 24 px    | `var(--space-6)` | `1.5rem`   | DEFAULT — same-kind adjacent skim blocks (e.g. user_turn -> user_turn)        |
| 32 px    | `var(--space-8)` | `2rem`     | KIND-CHANGE — different-kind adjacent skim blocks (e.g. user_turn -> agent_only) |
| 32 px    | `var(--space-8)` | `2rem`     | BOUNDARY BREATHING — above and below every boundary block (overrides above)  |

### 5.1 The CSS expression

The rhythm uses adjacent-sibling selectors plus `:has()` for
kind-change:

```css
/* Default 24 px between same-kind adjacent skim blocks */
.skim-stream > .skim-block + .skim-block {
  margin-top: var(--space-6); /* 24 px — same-kind floor */
}

/* 32 px override between DIFFERENT-kind adjacent blocks.
 * Enumerate every pair explicitly so source-order precedence is
 * deterministic. */
.skim-stream > .skim-block-user-turn + .skim-block-agent-only,
.skim-stream > .skim-block-agent-only + .skim-block-user-turn,
.skim-stream > .skim-block-user-turn + .skim-block-oversized,
.skim-stream > .skim-block-oversized + .skim-block-user-turn,
.skim-stream > .skim-block-agent-only + .skim-block-oversized,
.skim-stream > .skim-block-oversized + .skim-block-agent-only {
  margin-top: var(--space-8); /* 32 px — kind-change override */
}

/* 32 px around boundary blocks (spec line 691: "32 px breathing top + bottom").
 * Boundary rule comes LAST so it overrides both above. */
.skim-stream > .boundary-row,
.skim-stream > .boundary-row + .skim-block,
.skim-stream > .skim-block + .boundary-row {
  margin-top: var(--space-8);
}
```

### 5.2 Source-order precedence

CSS source order resolves overrides:

1. **Default 24 px** (`.skim-block + .skim-block`) — same-kind floor.
2. **32 px kind-change** (enumerated pairs) — overrides 24 px when
   adjacent blocks differ in kind.
3. **32 px boundary** — overrides both 1 and 2 when either neighbor
   is a `.boundary-row`.

The boundary rule comes LAST so it always wins over the kind-change
rule.

### 5.3 Why explicit kind-change enumeration vs `:has()`

An alternative `:has()`-based rule would read:

```css
.skim-stream > .skim-block:has(+ .skim-block:not([class*="${same-kind}"])) {
  margin-top: var(--space-8);
}
```

But `:has()` cannot reference the previous sibling's class via
parent-selector syntax in any current CSS Selectors level. The
explicit enumeration is more verbose but unambiguous. There are 6
distinct kind-change pairs (3 non-boundary kinds choose 2 directed =
6 ordered pairs, since user_turn->agent_only differs from agent_only
->user_turn). Boundary adjacencies are handled by the boundary rule
(rule #3) regardless of direction.

### 5.4 `:has()` browser baseline

The skim rhythm rules do NOT actually require `:has()`. The
adjacent-sibling selectors used above are standard CSS Selectors L4
and supported back to IE 7+. The `:has()` fallback is mentioned only
because the planner § lists it as a baseline:

- Chromium 105+ (released Aug 2022).
- Firefox 121+ (released Dec 2023).
- Safari 15.4+ (released Mar 2022).

This matches M2a's oklch + Fraunces baseline. `:has()` is NOT used in
M5's CSS but the baseline carries forward.

### 5.5 Reading measure

Every text-bearing skim block carries `max-inline-size: var(--measure)`
(= 70ch):

- `.skim-user-panel`
- `.skim-agent-only`
- `.skim-block-oversized`
- `.skim-summary-disabled` (the placeholder paragraph)

The `.boundary-row` is the ONE exception: its grid expands to 100 %
inline-size of the stream container (rules reach edge-to-edge of the
reading column). The reading column itself is constrained to
`var(--measure)` at the `.skim-stream` level.

### 5.6 First and last spacing

The `.skim-stream` wrapper carries `padding-block: var(--space-6) 0`
(top inset; mirrors M4's TranscriptView). Banners (when present) sit
ABOVE the stream's top inset; their own `margin-bottom: var(--space-6)`
separates them from the first block.

---

## 6. Motion authorizations

M5 adds ONE new motion surface to Phase 5: the **skim-block
first-paint stagger**. Authorized by spec §Motion budget row 9
(`working/phase-5.md:93`). All other animations are M4-inherited or
M2b-inherited.

### 6.1 Skim-block first-paint stagger (NEW for M5)

Spec table row (verbatim from `working/phase-5.md:93`):

> | Skim-block stagger on first paint | `opacity` + `translateY(4px → 0)` per block | 40 ms × N (max 8 blocks) | `ease-out` | first paint per session |

M5 implements `translateY(4px → 0)` verbatim per the spec. No
deviation. The stagger cap (`Math.min(idx, 8) * 40` ms) yields nine
distinct delays 0/40/80/.../320 ms; spec literal "max 8 blocks
staggered" is interpreted as the cap on the multiplier (idx ≤ 8 →
beyond-eight share the 320 ms ceiling). Coordinator-confirmed at
planner Q7.

#### 6.1.1 CSS

```css
/* Authorized by spec §Motion budget row 9. */
.skim-block,
.boundary-row {
  /* Apply stagger at mount; React passes inline animation-delay. */
  opacity: 0;
  animation: skim-block-fade-in var(--motion-disclosure) var(--ease-out) both;
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

`animation-fill-mode: both` keeps opacity at 1 + transform at 0
after the keyframe completes.

#### 6.1.2 Per-block delay

React sets the delay inline via `style={{ animationDelay:
`${Math.min(idx, 8) * 40}ms` }}` on each `<SkimBlockRow>`. Per spec
line 75 + 1100 ("Skim-block stagger capped at 8 blocks"), the cap
ensures:

- Block 0: 0 ms delay.
- Block 1: 40 ms.
- Block 2: 80 ms.
- ...
- Block 7: 280 ms.
- Block 8: 320 ms.
- Block 9, 10, ..., N: 320 ms (all share the cap; perception is "first
  9 cascade, the rest snap in together").

Total stagger duration = 320 ms (cap) + 200 ms (keyframe length) =
**520 ms maximum from first paint to last block fully visible**.

#### 6.1.3 Animated properties — STRICT motion-budget compliance

The keyframe animates ONLY:

- `opacity` (0 -> 1)
- `transform: translateY` (4 px -> 0)

It does NOT animate any of the FORBIDDEN properties:

- NOT `top` (would touch layout)
- NOT `padding` / `margin` (would touch layout)
- NOT `width` / `height` (would touch layout)
- NOT `color` / `border-color` / `background-color` (M2b r1 #2 codex
  catch precedent)
- NOT `font-size` / `letter-spacing` / `line-height`

Per spec line 1100: "Allowed animatable properties are `transform`,
`opacity`, and `background-color` (background-color only on the
surfaces that explicitly list it in §Motion ...)." `transform` and
`opacity` are universal allows; the keyframe uses both correctly.

#### 6.1.4 First-paint lifecycle

The stagger fires **once per session selection**:

- React keys at the SessionView wrapper level: `<SessionView
  key={selectedRowKey}>` (already in place per M2b — App.tsx:923).
  SkimView itself carries NO `key=` on its root (keep-mounted contract
  per design.md §7.4 + m5-plan.md §6 row 2). On a new session
  selection, `SessionView`'s remount unmounts + remounts the entire
  subtree (including SkimView), and the keyframes re-fire on the fresh
  SkimView mount.
- The stagger does NOT replay on `<details>` interaction (the
  `<details>` body uses its own `block-size` exemption, not the
  stagger).
- The stagger does NOT replay on `now` prop change (only `now`
  changes, the React subtree is stable; CSS animations fire only on
  selector match -> property addition, not on prop change).

#### 6.1.5 Reduced-motion

The global `@media (prefers-reduced-motion: reduce)` rule in
`apps/frontend/src/styles/global.css` zeroes both
`animation-duration` AND `transition-duration`. The skim-block
stagger snaps to `opacity: 1, transform: translateY(0)` instantly
on first paint. NO M5-specific override needed.

### 6.2 `<details>` block-size disclosure (M2b inherited)

The four `<details>` elements in SkimView all inherit the M2b
`<details> > *:not(summary)` rule (200 ms, `--motion-disclosure`,
`--ease-in-out` per spec table row 3):

- `<details class="skim-agent-reaction">` (outer "Agent reaction" disclosure)
- `<details class="skim-expand-raw">` (inner "Expand to raw messages")
- `<details class="skim-agent-only">` (agent_only block disclosure)
- `<details class="skim-oversized">` (oversized block disclosure)
- `<details class="skim-banner-warnings">` (parse-warnings banner — M4 inherited)

NO M5-local declarations needed. The animation works because
`global.css` ships `interpolate-size: allow-keywords` on `:root` per
M2b authorization.

### 6.3 Truncation banner opacity entrance (M4 inherited)

M5's truncation banner is byte-equivalent to M4's:

```css
.skim-banner-truncation {
  /* (static recipe matches M4 .transcript-banner-truncation) */
  animation: skim-banner-fade var(--motion-base) var(--ease-out) both;
}

@keyframes skim-banner-fade {
  from { opacity: 0; }
  to   { opacity: 1; }
}
```

Same `--motion-base` (120 ms), same opacity-only entrance, same
`--ease-out`. The keyframe name is namespaced (`skim-banner-fade`)
so it doesn't collide with `transcript-banner-fade`; the recipe is
byte-equivalent.

### 6.4 PROHIBITED — what M5 must NOT animate

This section is the codex defense.

#### 6.4.1 Properties forbidden on ALL M5 surfaces

Identical to M4's forbidden list:

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

Audit (run at implementation close):

```
rg -nE 'transition: (color|border-color|width|height|top|padding|margin|font-size|letter-spacing|line-height)' apps/frontend/src/features/sessions/SkimView.css
```

Expected: empty.

#### 6.4.2 Properties forbidden on skim block panels

- `transition: background-color` on `.skim-block`, `.skim-block-user-turn`,
  `.skim-user-panel`, `.skim-block-agent-only`, `.skim-agent-only`,
  `.skim-block-oversized`, `.skim-oversized`, `.skim-summary-disabled`,
  `.boundary-row`. Per M2b r1 #2 codex precedent.
- `transform` on `.skim-block*` selectors (other than the inherited
  stagger keyframe target). The skim-block stagger uses inline
  `style={{animationDelay}}` to schedule when the keyframe fires;
  the keyframe itself targets `transform: translateY` but ONLY during
  the keyframe execution window, not as a `transition`.

#### 6.4.3 Properties forbidden inside disclosures

- NO `transition: background-color` on `<details>` shells.
- NO `transform` on `<summary>` elements.
- NO `transition: color` on summary hover (M4's quiet-link hover
  uses instant `text-decoration: underline`; M5 follows).

#### 6.4.4 Properties forbidden on banners (M5 inherited from M4)

Same recipe as M4 motion.md §"Properties FORBIDDEN inside the
truncation banner" + "FORBIDDEN inside parse-warnings banner".

#### 6.4.5 Properties forbidden on the entire skim stream

- NO additional stagger or per-block animation BEYOND the spec-row-9
  authorized stagger. M5 introduces ONE animation: the skim-block
  fade-in keyframe.
- NO `transform` rotations on disclosure markers. Native `<details>`
  triangle is preserved; M5 does NOT customize it.

---

## 7. Interaction patterns

### 7.1 user_turn nested-disclosure flow

Default state: outer `<details>` closed, inner `<details>` closed,
scoped `<TranscriptView />` mounted in the inner `<details>` body
(invisible because the parent `<details>` is closed; native browser
hides via `display: none` on the closed body).

User journey:

1. **Initial paint.** User sees the user_turn panel (the user
   message body) + a closed "Agent reaction (N messages)" disclosure
   beneath it.
2. **Click outer summary.** "Agent reaction (N messages)" expands.
   The disabled placeholder paragraph appears + a closed inner
   "Expand to raw messages" disclosure appears.
3. **Click inner summary.** "Expand to raw messages" expands. The
   scoped `<TranscriptView messageRange={{start: block.start+1, end: block.end}} />`
   becomes visible. Each message renders as a `<MessageRow>` inheriting
   M4's recipe; the user reads the agent reaction inline.
4. **Re-click outer summary.** Outer disclosure closes. Inner
   `<details>` open state is preserved natively (browser-managed; the
   `[open]` attribute on the inner `<details>` survives the parent
   closing). When the user reopens the outer disclosure, the inner
   stays open.

### 7.2 agent_only flow

Default state: outer `<details>` closed; scoped `<TranscriptView />`
mounted in the body but hidden.

User journey:

1. User sees "Agent-only session (N messages)" with the muted
   bordered shell.
2. Click summary -> body expands -> scoped TranscriptView spanning
   `[block.start, block.end]` becomes visible.
3. Re-click -> body collapses -> TranscriptView remains in the DOM
   (display: none).

### 7.3 oversized_user_message flow

Default state: outer `<details>` closed; verbatim `<pre>` mounted but
hidden.

User journey:

1. User sees "Oversized user message (NN KB) — collapsed by default"
   with the warn-tinted left border.
2. Click summary -> body expands -> verbatim `<pre>` text in
   monospace.
3. Re-click -> body collapses -> `<pre>` remains in the DOM.

### 7.4 Keep-mounted contract

Per M2b Resolved Decision #12 (spec lines 650-658), tab switches
must NOT remount panel content.

- SkimView's React subtree carries **NO `key=` on its root.**
- Per-block `<SkimBlockRow>` IS keyed by `${block.kind}-${block.start}-${block.end}`
  (content key, NOT tab key).
- `<details>` open/closed state is browser-managed; survives
  reparenting because the element instance is stable across tab
  switches.

The only natural state-reset point is a `selectedRowKey` change,
which is handled at the SessionView layer via `<SessionView
key={selectedRowKey}>` — that destroys the SkimView entirely and
all `<details>` reset to default closed state.

### 7.5 Stagger lifecycle

- Plays once per **session selection** (re-keyed via
  SessionView's `key={selectedRowKey}` at the wrapper level).
- Does NOT replay on tab switch (tab switch leaves `selectedRowKey`
  unchanged).
- Does NOT replay on `<details>` interaction.
- Does NOT replay on `now` prop change.

### 7.6 Banner dismissal

- Truncation banner: NOT dismissible (M4 inherited; truncation is a
  data invariant, not user-clearable).
- Parse-warnings banner: dismissible via the embedded `<button>` in
  the banner body. Dismissal is component-local React state. Reset
  on `row.rowKey` change via `useEffect` (matches M4's defensive
  belt-and-suspenders).

### 7.7 "Expand to raw messages" semantics

The affordance is a `<details>` element (per planner Q3), NOT a
`<button>`. The visible affordance behaves identically to a button
for keyboard users:

- Tab arrives at the `<summary>`.
- Enter or Space toggles open/close (native `<details>` behavior).
- Focus is preserved across toggle (browser-managed).

The styling makes the affordance read as "quiet text link":
`--color-accent` text + native disclosure triangle + hover underline.
The semantic semantics are `<details>`/`<summary>` — a disclosure
control, which is what the user_turn agent reaction needs.

---

## 8. Empty / edge states

### 8.1 No messages parsed (empty stream)

`buildSkim` returns `[{ kind: "agent_only", start: 0, end: -1, meta:
{empty: 1} }]` per spec line 799.

SkimView renders one `agent_only` block with summary "Agent-only
session (0 messages)". Expanding the disclosure mounts a scoped
TranscriptView with `messageRange={{start: 0, end: -1}}` -> body
slice clamps to empty -> renders "No messages parsed." (M4-anchored
copy).

Spec line 697: "The Skim view NEVER renders silently blank for any
state." Both the summary line AND the expanded body carry copy. Both
are reachable via the disclosure.

### 8.2 Single oversize user message

`buildSkim` may emit `[{ kind: "oversized_user_message", start: 0,
end: 0, meta: {sizeBytes: NNNNN} }]` for a single-message session
where the message is oversize.

SkimView renders one `oversized_user_message` block. NO preceding /
following content. The block is the entire stream.

### 8.3 Truncation banner

When `state === "truncated"`, the SkimView mounts a truncation banner
ABOVE the stream. Same copy as M4 TranscriptView (per planner Q12):

```
Truncated at 5 MB — full payload not parsed. Use the **Open raw** anchor in the session header to inspect the full payload.
```

The banner is BYTE-EQUIVALENT visually to M4's. Class names are
`.skim-banner.skim-banner-truncation` (the recipe is inlined in
SkimView.css, not extracted; the CSS shape mirrors M4's
`.transcript-banner.transcript-banner-truncation`).

### 8.4 Parse-warnings banner

When `parsed.warnings.length > 0` and `!warningsBannerDismissed`, the
SkimView mounts a parse-warnings banner ABOVE the stream (BELOW the
truncation banner if both present).

Same `<details>` shape as M4. Same summary copy:
`{N} parse warnings — click to view.` (verbatim spec literal for
all N including N=1).

### 8.5 Loading / error / no_raw / idle state branches

State-machine dispatch mirrors M4 TranscriptView:

| State                     | Render                                                                                                                |
|---------------------------|-----------------------------------------------------------------------------------------------------------------------|
| `idle`                    | `<p class="skim-empty">Select a session to read its skim outline.</p>`                                                |
| `no_raw`                  | `<p class="skim-not-imported">This session has not been imported yet — only the source-side metadata is available. Click <strong>Import</strong> in the action bar to fetch the raw payload.</p>` |
| `loading`                 | `<p class="skim-loading">Reading session…</p>`                                                                        |
| `error`                   | `<p class="skim-error">Could not load session: {error.message}.</p><button>Retry</button>`                            |
| `success` / `truncated`   | `<SkimBody parsed={...} now={...} truncated={...} row={...} />` — the full outline tree                                |

Copy is byte-equivalent to TranscriptView's per planner §4.1 (only the
className family swaps from `transcript-*` to `skim-*`).

### 8.6 Banners + state interaction

- `state === "truncated"` -> truncation banner renders.
- `parsed.warnings.length > 0` -> parse-warnings banner renders.
- BOTH banners can render simultaneously (truncation top,
  warnings under it, then the stream).

---

## 9. Accessibility

### 9.1 SkimView root landmark

```html
<section class="skim-body" aria-label="Session skim outline">
```

Per planner Q14. Mirrors TranscriptView's `aria-label="Session
transcript"`. The label distinguishes Skim from Transcript so a11y
consumers can disambiguate the two panels via `getByRole("region", {
name: "Session skim outline" })`.

### 9.2 Block list

```html
<ol class="skim-stream" role="list">
```

Implicit `role="list"` reaffirmed (some assistive tech strips
`list-style: none`-removed lists). The `<ol>` choice is intentional:
skim blocks have temporal ordering (the order they appear in the
session matters editorially).

### 9.3 Per-block list items

Each block: `<li class="skim-block skim-block-{kind}">`. The implicit
`role="listitem"` is preserved EXCEPT for `boundary` blocks (which
override to `role="separator"`).

The user_turn `<article>` inside the `<li>` carries NO custom
`role` per planner Q15. Default ARIA semantics: `<article>` -> implicit
`role="article"`.

### 9.4 Boundary list item

```html
<li class="boundary-row" role="separator" aria-orientation="horizontal">
```

Per planner Q4 + M4 §12.2 precedent. The flat shape on the `<li>`
itself (not a nested `<div>`). Screen readers announce as "separator:
SESSION RESUMED" / "separator: CONVERSATION COMPACTED", bypassing the
list-item count. Adjacent `<li>`s on either side keep their listitem
role and announce normally.

### 9.5 `<details>` summary as accessible label

The `<summary>` text IS the accessible label for each disclosure.
Screen readers announce the disclosure name + state ("Agent reaction
(3 messages), collapsed" / "Expand to raw messages, expanded").

Contrast for muted summary text on `--color-surface` is verified at
T03 (= M4 T22) in colors.md: 7.04:1 light / 7.36:1 dark — AAA.

### 9.6 "Expand to raw messages" affordance

Implemented as a `<summary>` element. Native focusable. Native
keyboard activation (Enter / Space). Visual treatment:

- Resting: `--color-accent` text + native triangle.
- Hover: instant underline (no `transition: text-decoration`; matches
  M4).
- Focus-visible: 2 px `--color-accent` outline + 2 px offset (matches
  M4 R09 / T17c).

The accessible label is the inner text "Expand to raw messages"
verbatim.

### 9.7 Scoped TranscriptView a11y inheritance

The scoped `<TranscriptView />` mounted inside an expanded `<details>`
body carries TranscriptView's a11y guarantees verbatim:

- `<section aria-label="Session transcript">` (NB: this CAN nest
  inside SkimView's `<section aria-label="Session skim outline">`;
  ARIA allows nested regions, and the labels disambiguate).
- `<ol class="transcript-stream">` -> implicit role="list".
- Per-message `<article>` semantics.
- Native `<details>` for tool messages.

### 9.8 Tab order

Within a fully-rendered SkimView at first-paint:

1. Tab strip (active tab via tabindex=0).
2. The active tabpanel `<div role="tabpanel" tabindex={0}>` (M2b
   contract; SessionView wires this).
3. SkimView landmarks/sections.
4. Inside the panel, document order:
   - Truncation banner: NOT focusable.
   - Parse-warnings banner: `<summary>` is focusable; expanding
     surfaces the `<button>Dismiss</button>`.
   - Per skim block:
     - user_turn: outer "Agent reaction" `<summary>` -> (when open)
       inner "Expand to raw messages" `<summary>` -> (when inner open)
       the scoped TranscriptView's tool `<summary>` elements in turn.
     - boundary: NOT focusable (separator role; no inherent
       interaction).
     - agent_only: outer `<summary>` -> (when open) the scoped
       TranscriptView's focusable children.
     - oversized: outer `<summary>` -> (when open) NO further
       focusable children (the `<pre>` body is not interactive).

### 9.9 ARIA live regions

- Truncation banner: `role="status"` (matches M4). Polite
  announcement on mount.
- Parse-warnings banner: NOT a live region (visual discovery).
- Skim-block stagger: NOT a live region (decorative).

### 9.10 Reduced-motion

Global `@media (prefers-reduced-motion: reduce)` rule zeroes all
animations. Skim-block stagger -> instant first-paint at full
opacity. `<details>` block-size animation -> snap.

### 9.11 Keyboard activation

All four `<details>` elements are keyboard-activatable via Enter or
Space when the `<summary>` has focus. Native browser behavior; M5
does NOT override.

---

## 10. Composition with M4

### 10.1 BoundaryRow shared component

(Detailed in §4.2.) M5 extracts the boundary recipe from
TranscriptView into `BoundaryRow.tsx` + `BoundaryRow.css`. Both
TranscriptView (refactored, no behavior change) and SkimView consume
it.

**M4 refactor surface:**

| File | Change | Lines affected |
|------|--------|----------------|
| `TranscriptView.tsx` | Replace inline `BoundaryMessage` body (lines 362-384) with `<BoundaryRow subtype={msg.boundarySubtype} />` import | ~22 lines deleted, ~3 lines added |
| `TranscriptView.css` | Remove `.msg-boundary*` declarations (lines 425-450) | ~25 lines deleted |
| `TranscriptView.css` | Update rhythm rules at lines 168-172: `.msg-boundary` -> `.boundary-row` | ~5 lines edited (selector swap) |
| `TranscriptView.test.tsx` | Boundary test #11: update `.msg-boundary*` selectors to `.boundary-row*` OR rely on `getByRole("separator")` | ~2-4 lines edited |

Net: TranscriptView.tsx loses ~30 lines (boundary inline -> import +
render); TranscriptView.css loses ~30 lines (boundary CSS -> moved to
BoundaryRow.css). Tests still pass via the new component composition.

### 10.2 `renderBodyWithCode` re-export

Per planner Q5, M4's `renderBodyWithCode` helper (currently a private
function in `TranscriptView.tsx`) gains a one-line `export` keyword.
SkimView imports it for user_turn body rendering. The helper's CSS
classes (`.msg-code-inline`, `.msg-code-block`) live in
`TranscriptView.css` and are inherited via the cascade — SkimView
relies on the transitive cascade (a TranscriptView is mounted as the
scoped renderer in user_turn details, which already imports
`TranscriptView.css`).

### 10.3 TranscriptView additive `messageRange` prop

Per planner Q1, TranscriptView gains an optional prop:

```ts
export type TranscriptViewProps = {
  row: SessionRow;
  now: string;
  /**
   * Optional inclusive [start, end] messageIndex range. When provided,
   * the body renders only `parsed.messages.slice(start, end + 1)`.
   * Used by SkimView's "Expand to raw messages" affordance + agent_only
   * block expansion to mount a scoped TranscriptView per Resolved
   * Decision #9. Out-of-bounds values clamp to [0, len-1]. Omitting
   * this prop renders the full transcript (M4 default behaviour).
   */
  messageRange?: { start: number; end: number };
};
```

When `messageRange` is OMITTED, body rendering is identical to M4's
contract. M4 tests must still pass: the prop is BACKWARD-COMPATIBLE.

When `messageRange` is PROVIDED:

```ts
const slicedMessages = (() => {
  if (!messageRange) return parsed.messages;
  const lo = Math.max(0, messageRange.start);
  const hi = Math.min(parsed.messages.length - 1, messageRange.end);
  if (hi < lo) return [];
  return parsed.messages.slice(lo, hi + 1);
})();
```

Defensive clamping handles:
- `start > parsed.messages.length - 1` -> empty -> "No messages parsed."
- `end < 0` (e.g., empty-stream sentinel `start: 0, end: -1`) -> empty.
- `start < 0` -> clamped to 0.
- All cases satisfy spec line 697 ("never silently blank").

### 10.4 M4 test count baseline preservation

Per planner §15: 491 baseline (M4 close: `bun run test` 491 pass / 0
fail / 1729 expects across 30 files). M5 adds ~40-65 unit tests
across 4 files (SkimView.test.tsx +35-50; BoundaryRow.test.tsx +6-8;
TranscriptView.test.tsx +3-4 for `messageRange`; SessionView.test.tsx
+3-4). Expected M5 close: ~530-540 pass / 0 fail / +120-180 expects.

**M4 test invariance:** the boundary extraction is byte-equivalent at
the rendered DOM level. M4's existing boundary test #11 still passes
either:

- via `getByRole("separator")` + accessible-name assertion
  (class-agnostic), OR
- via updated `.boundary-row*` selectors (one-line edit per test
  case).

The M4 refactor is a CSS-class rename + a component import — NO
behavior change at the rendered DOM level (same shape, same role,
same labels, same Fraunces typography).

---

## 11. WCAG-AA pairs

Exhaustive list of every visible foreground / background pair M5
introduces. Cross-reference `colors.md` for ratios. Pairs are anchored
to M4 IDs where the recipe is byte-equivalent.

| M5 ID | M4 equivalent | Surface                                                  | Foreground            | Background                                              | AA gate          |
|-------|---------------|----------------------------------------------------------|-----------------------|---------------------------------------------------------|------------------|
| S01   | T01           | user_turn body text                                      | `--color-ink`         | `color-mix(in srgb, --color-accent 5%, --color-surface)` | 4.5:1 (text)    |
| S02   | T20           | user_turn code-fence body (`.msg-code-block` inherited)  | `--color-ink`         | `--color-surface-raised`                                | 4.5:1 (text)    |
| S03   | T19           | user_turn inline `<code>` (`.msg-code-inline` inherited) | `--color-ink`         | `--color-surface-raised`                                | 4.5:1 (text)    |
| S04   | T22 / T05     | "Agent reaction" `<summary>` chrome                       | `--color-ink-muted`   | `--color-surface`                                       | 4.5:1 (text)    |
| S05   | T22           | Disabled placeholder prose                               | `--color-ink-muted`   | `--color-surface`                                       | 4.5:1 (text)    |
| S06   | T29 / T17     | Disabled placeholder 4 px left border                    | `--color-border`      | `--color-surface`                                       | n/a (decorative)|
| S07   | T28 / T07     | "Expand to raw messages" summary text                    | `--color-accent`      | `--color-surface`                                       | 4.5:1 (text)    |
| S08   | T28 / T07     | "Expand to raw messages" hover (text-decoration only)    | `--color-accent`      | `--color-surface`                                       | 4.5:1 (text)    |
| S09   | T09           | Boundary label                                            | `--color-ink-muted`   | `--color-surface`                                       | 4.5:1 (text)    |
| S10   | T10           | Boundary 1 px hairline rule                              | `--color-border-strong` | `--color-surface`                                     | 3:1 (NT)        |
| S11   | T22           | Agent-only summary text                                   | `--color-ink-muted`   | `--color-surface`                                       | 4.5:1 (text)    |
| S12   | T29           | Agent-only panel hairline border                         | `--color-border`      | `--color-surface`                                       | n/a (decorative)|
| S13   | T02           | Oversized header text                                     | `--color-ink`         | `--color-surface`                                       | 4.5:1 (text)    |
| S14   | T12           | Oversized warn 4 px left border                          | `--color-warn`        | `--color-surface`                                       | 3:1 (NT)        |
| S15   | T06           | Oversized verbatim `<pre>` body                          | `--color-ink`         | `--color-surface-raised`                                | 4.5:1 (text)    |
| S16   | T11           | Truncation banner copy                                   | `--color-ink`         | `color-mix(in srgb, --color-warn 8%, --color-surface)`  | 4.5:1 (text)    |
| S17   | T12           | Truncation banner stripe (3 px)                          | `--color-warn`        | `--color-surface`                                       | 3:1 (NT)        |
| S18   | T13           | "Open raw" `<strong>` in banner copy                     | `--color-ink`         | `color-mix(in srgb, --color-warn 8%, --color-surface)`  | 4.5:1 (text)    |
| S19   | T14           | Parse-warnings `<summary>`                               | `--color-ink`         | `--color-surface-raised`                                | 4.5:1 (text)    |
| S20   | T15           | Parse-warnings `<li>` items (mono `--text-xs`)           | `--color-ink-muted`   | `--color-surface-raised`                                | 4.5:1 (text)    |
| S21   | T16           | Dismiss button text                                      | `--color-ink`         | `--color-surface-raised`                                | 4.5:1 (text)    |
| S22   | T17c          | Dismiss button focus-visible outline                     | `--color-accent`      | `--color-surface-raised`                                | 3:1 (NT)        |
| S23   | T22           | "Reading session..." loading prose                       | `--color-ink-muted`   | `--color-surface`                                       | 4.5:1 (text)    |
| S24   | T23           | Error prose                                               | `--color-error`       | `--color-surface`                                       | 4.5:1 (text)    |
| S25   | T24           | Retry button text                                         | `--color-ink`         | `--color-surface`                                       | 4.5:1 (text)    |
| S26   | T25           | Retry button border                                       | `--color-border-strong` | `--color-surface`                                     | 3:1 (NT)        |
| S27   | T26           | Empty-stream prose                                        | `--color-ink-muted`   | `--color-surface`                                       | 4.5:1 (text)    |
| S28   | T27           | no_raw / idle prose                                       | `--color-ink-muted`   | `--color-surface`                                       | 4.5:1 (text)    |

**M5 introduces ZERO net new color-recipe combinations.** Every M5
pair maps to an existing M4 measurement. The contrast ratios in
colors.md are M4-script-authoritative; M5 re-runs `wcag_m5.py` to
verify byte-equivalence on shared pairs.

The single defensive pair S29 in `wcag_m5.py` (ink-muted on
accent-tinted mix, byte-equivalent to M4 T03) is documented but
NOT consumed by M5's surface — included in the script for
codex-pre-emption purposes only (future surfaces might need it).

---

## 12. Token / hex / motion compliance

### 12.1 Hex literal isolation

**Pre-condition (M4 close):** `rg -n '#[0-9a-fA-F]{3,8}'
apps/frontend/src/ | wc -l = 24`.

**Post-condition (M5 close):** UNCHANGED at `24`.

M5 introduces ZERO new hex literals in any production file under
`apps/frontend/src/`. The only hex literals in this design folder
appear in `prototype.html`'s @supports fallback layer (matches M2a
+ M4 pattern); the production CSS files (SkimView.css,
BoundaryRow.css) use ONLY `var(--*)` references.

Verification (run at implementation close):

```
rg -n '#[0-9a-fA-F]{3,8}' apps/frontend/src/features/sessions/SkimView.tsx apps/frontend/src/features/sessions/SkimView.css apps/frontend/src/features/sessions/SkimView.test.tsx apps/frontend/src/features/sessions/BoundaryRow.tsx apps/frontend/src/features/sessions/BoundaryRow.css apps/frontend/src/features/sessions/BoundaryRow.test.tsx
```

Expected: empty.

### 12.2 Token count invariant

**Pre-condition (M4 close):** `grep -cE '^\s*--'
apps/frontend/src/styles/tokens.css = 83`.

**Post-condition (M5 close):** UNCHANGED at `83`.

M5 introduces ZERO new tokens. All consumed are M2a-canonical.

### 12.3 Motion budget compliance

Animations enumerated:

1. `skim-block-fade-in` keyframe (opacity + transform: translateY).
   Authorized by spec table row 9.
2. `skim-banner-fade` keyframe (opacity only).
   Authorized by spec table row 9.
3. `<details> > *:not(summary)` block-size transition (M2b inherited).
   Authorized by spec table row 3.

Transitions enumerated: NONE in SkimView.css proper. (The
`<details>` transition is declared in `global.css` per M2b
authorization.)

Prohibited properties (verbatim list, repeated for codex defense):

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
- `transition: background-color` on `.skim-block*` and `.skim-user-panel`
  (M2b r1 #2 codex precedent)
- `transform` on `.skim-block*` (other than the stagger keyframe target)

### 12.4 BoundaryRow extraction = M4 refactor

Pre-condition: M4 boundary tests pass (existing in
`TranscriptView.test.tsx`).

Post-condition: M4 boundary tests STILL pass after extraction. The
rendered DOM tree is byte-equivalent at the visual level:

- Same `<li role="separator" aria-orientation="horizontal">` shape.
- Same three-element grid (rule + label + rule).
- Same Fraunces italic small-caps label.
- Same `--color-border-strong` rule color.
- Same `--color-ink-muted` label color.
- Same 32 px breathing top + bottom.

Class-name change: `.msg-boundary*` -> `.boundary-row*`. Tests that
use class-name selectors update with one-line edits; tests that use
`getByRole("separator")` need NO changes.

---

## 13. Open considerations / risks

### 13.1 Drift risk: BoundaryRow extraction touches M4

The boundary recipe is signature detail #1. Extraction guarantees
byte-equivalence (one component, one CSS file, one set of class
names). But the extraction itself is a refactor of M4 code. Mitigation:

- M4's existing boundary tests run against the new component without
  semantic change.
- A new `BoundaryRow.test.tsx` adds 6-8 cases (per planner §4.8) for
  the shared component invariants.
- Cross-reference test: at M5 close, snapshot the rendered DOM from
  both contexts (TranscriptView mounted with a boundary message +
  SkimView mounted with a boundary block) and assert byte-equivalence
  modulo the `style` attribute on the SkimView side.

### 13.2 :has() polyfill not authorized

The motion budget rule (spec line 1100) bans `:has()` polyfilling.
M5's CSS does NOT use `:has()` — adjacent-sibling selectors plus
explicit kind-change enumeration cover the rhythm rules. The browser
baseline (Chromium 105+, Firefox 121+, Safari 15.4+) matches the
oklch + Fraunces baseline; no polyfill needed.

### 13.3 Long-corpus performance observation

Spec lines 1042-1059 do NOT explicitly mandate a long-corpus
performance measurement for M5 (M4 had one). But the scoped
TranscriptView mounted from inside an expanded user_turn `<details>`
can mount many `<MessageRow>` elements (e.g., a 20-message agent
reaction). M4 already validated p95 < 16 ms / frame for 5k-message
rendering; the same component is reused in M5.

**Recommendation (per planner §13):** record a manual observation in
the M5 progress log:

1. Use the 5k fixture from `transcript-5k.builder.ts` (M4 plan §4.4).
2. Activate Skim tab.
3. Expand 3-4 user_turn `<details>` (each reaction has 5-20 messages).
4. Manual scroll; observe FPS in DevTools.
5. Acceptance: smooth scroll; first-paint under 500 ms (the stagger
   cap at 8 × 40 = 320 ms + 200 ms keyframe = 520 ms total).

NO new Playwright spec required. The progress log entry records the
observation. If performance regresses, M4's escape-hatch slot 2
reasoning carries forward (`@tanstack/react-virtual` for SkimView,
single instance shared with TranscriptView).

### 13.4 user_turn body of N=0 (no agent reaction)

When `block.end === block.start`, the user_turn block has NO agent
reaction (the user message is the last in the session). Render:

- The user_turn panel renders normally.
- The "Agent reaction (0 messages)" disclosure renders (the spec
  literal beats grammar).
- Expanding the disclosure shows the disabled placeholder + the
  "Expand to raw messages" inner disclosure.
- Expanding the inner disclosure mounts a scoped TranscriptView with
  `messageRange={{start: block.start+1, end: block.end}}` =
  `{start: N+1, end: N}` -> defensive clamp -> empty slice ->
  "No messages parsed." renders.

This satisfies spec line 697 (never silently blank) at every
disclosure level. Tested in SkimView.test.tsx case #9 (per planner
§8).

### 13.6 Risk: nested `<section>` landmarks

SkimView's root is `<section aria-label="Session skim outline">`. The
scoped TranscriptView mounted inside an expanded `<details>` is
itself `<section aria-label="Session transcript">`. ARIA permits
nested landmarks; both are reachable via different region-name
queries.

Screen reader behavior: when focus enters the inner TranscriptView,
the SR announces "Session transcript region"; when focus moves back
out, it announces "Session skim outline region". This is the desired
landmark behavior.

If a future codex round flags nested landmarks as confusing, the
mitigation is to add `aria-labelledby` to the scoped TranscriptView
that points to the parent's `<summary>` text — but this is a future
concern; M5 ships the nested-landmark shape per planner Q14.

### 13.7 Motion budget cusp: stagger 9th block onward

Per spec line 1100, the stagger is "capped at 8 blocks". M5 ships
`Math.min(idx, 8) * 40`. Block 8 and beyond all share the 320 ms
delay (the stagger CAP). Risk: a session with many small skim blocks
might present 50+ blocks all snapping at 320 ms simultaneously,
which could read as a janky "wave". Mitigation:

- Per-session block count is bounded by the 5 MB cap on the parser
  -> typical sessions have <20 skim blocks. The cap is not load-bearing
  for typical sessions.
- For pathological sessions (50+ blocks), the visible viewport
  shows only the first 5-10 blocks at first-paint; subsequent
  blocks are below the fold and the user does not perceive their
  staggered fade-in.

Acceptable risk. Recorded for future codex rounds.

---

## 14. Cross-chunk verification matrix

What M5 must NOT regress against earlier chunks:

| Chunk | Surface | M5 obligation |
|-------|---------|---------------|
| M1a   | Split-pane shell, deep-link pulse, empty pane | Untouched; SkimView mounts inside `.session-pane` |
| M1b   | Sticky pagination footer | Untouched |
| M2a   | Token canon (83), Fraunces wiring, noise overlay | Consumed only; ZERO token additions; ZERO `@font-face` additions |
| M2b   | Tab strip, header, Metadata, Raw, two placeholders | Replaces SkimPlaceholder with SkimView; default-tab unchanged (stays `transcript`) |
| M3a   | Parsers + types | Pure consumer of `SkimBlock[]`; NO parser shape changes |
| M3b   | useParsedSession + cacheEpoch | Pure consumer of the discriminated state union |
| M4    | TranscriptView | Reused as scoped renderer with new optional `messageRange` prop; `BoundaryMessage` body extracted to BoundaryRow |

Specifically:

- The keep-mounted contract (M2b spec lines 650-658): SkimView has
  NO `key=` on its root.
- The page-turn fade (M2b motion.md surface 3): unchanged. The outer
  `<SessionView key={selectedRowKey}>` drives the page-turn animation;
  SkimView is a passive child.
- The Tabs primitive's accessibility contract: the active tabpanel
  carries `tabIndex={0}`.
- The Phase 4 timestamp contract: preserved verbatim in the scoped
  TranscriptView reuse.
- The hex-isolation invariant (24 hex literals): UNCHANGED.
- The token-count invariant (83): UNCHANGED.
- The boundary recipe byte-equivalence (signature detail #1):
  GUARANTEED via shared component.

---

## 15. Acceptance checklist (developer running M5)

Cross-checked against m5-plan §9 verification commands.

- [ ] All 4 BlockKind branches render correctly per §4.
- [ ] user_turn body renders verbatim text (with code-fence
      rewriting via `renderBodyWithCode`) inside an accent-tinted
      reading panel.
- [ ] user_turn nested disclosure flow works: outer "Agent reaction
      (N messages)" -> placeholder + inner "Expand to raw messages"
      -> scoped TranscriptView with correct messageRange.
- [ ] boundary block renders BYTE-EQUIVALENT to M4's
      `.msg-boundary` (now `.boundary-row`) DOM tree (signature
      detail #1).
- [ ] agent_only block renders muted bordered shell + "Agent-only
      session (N messages)" summary; expanding reveals scoped
      TranscriptView.
- [ ] oversized_user_message block renders 4 px warn left border
      + "Oversized user message (NN KB) — collapsed by default"
      summary; expanding reveals verbatim mono `<pre>`.
- [ ] No-user-msg session shows single collapsed `agent_only` block
      with "Agent-only session (0 messages)".
- [ ] Single-oversize-user-msg session shows single
      `oversized_user_message` block.
- [ ] Truncation banner: byte-equivalent visual recipe to M4.
- [ ] Parse-warnings banner: byte-equivalent visual recipe to M4;
      dismissible; re-arrives on row change.
- [ ] Three-magnitude rhythm: 24 same-kind, 32 kind-change, 32
      around boundaries.
- [ ] Skim-block stagger: opacity + translateY ONLY; 40 ms × min(idx,
      8) delay; first-paint per session; reduced-motion zero-out.
- [ ] State branches: idle, no_raw, loading, error (with Retry),
      empty-stream all rendered; copy byte-equivalent to M4.
- [ ] Keep-mounted: NO `key=` on SkimView root; warnings-banner
      dismissed survives tab switch; `<details>` open state
      survives tab switch.
- [ ] `tabIndex={0}` on the active Skim tabpanel preserved (M2b
      contract; SessionView unchanged).
- [ ] Token consumption: only the 28 (or 29 with error-branch)
      tokens enumerated in §3. `rg -n 'var\(--' SkimView.css | sort
      -u` cross-checks against tokens.css.
- [ ] Hex isolation: NO `#` literals in
      SkimView.{tsx,css,test.tsx} or BoundaryRow.{tsx,css,test.tsx}.
- [ ] Motion budget: zero `transition: color | border-color | width
      | height | top | padding`. Zero `transition: background-color`
      on `.skim-block*` selectors.
- [ ] Reduced-motion: stagger and disclosure animations zero out via
      global rule.
- [ ] WCAG AA: every text-on-surface pair in colors.md passes in
      both modes (via `wcag_m5.py`).
- [ ] BoundaryRow byte-equivalence: M4 boundary tests still pass;
      new BoundaryRow.test.tsx covers the 6-8 invariants.
- [ ] TranscriptView `messageRange` prop: backward-compatible (M4
      default unchanged); new tests cover the slice + clamp.
- [ ] `DEFAULT_TAB_ON_SELECTION` stays `"transcript"`.
- [ ] SessionView.test.tsx: assertion at lines 255-291 updated
      from "Coming in Milestone 5" to a SkimView-surface assertion.
- [ ] Long-corpus observation: recorded in progress log.

---

## 16. Designer self-audit

Before handing off to the reviewer trio, the designer ran the codex
catch precedents from m5-plan §6 against this artifact:

| Precedent | Surface check | Status |
|-----------|---------------|--------|
| 1. Spec-literal violation | "Agent reaction (N messages)", "Agent-only session (N messages)", "Oversized user message (NN KB) — collapsed by default", "Summary disabled — generation deferred to a later phase. Use 'Expand to raw messages' to read the agent's response inline.", "SESSION RESUMED", "CONVERSATION COMPACTED" — all spec-anchored at line ranges in §4 | OK |
| 2. `key=` on tab-keyed content | SkimView root has NO `key=`; `<SkimBlockRow key={`${kind}-${start}-${end}`}>` is content key only | OK |
| 3. Undefined token references | All 28 tokens cross-checked against tokens.css; no `--space-5/10/12` | OK |
| 4. WCAG fails one mode | `colors.md` enumerates 28 contrast pairs in BOTH light + dark; reuses M4 measurements byte-equivalent | OK |
| 5. Motion budget violation | Stagger uses `opacity` + `transform: translateY` ONLY; banner uses `opacity` ONLY; `<details>` uses `block-size` (M2b authorization); explicit prohibition list at §6.4 | OK |
| 6. background-color exemption misuse | Skim panel backgrounds are STATIC (resolved at mount); the only `background-color` interpolation in M5 is the M4-inherited banner's STATIC tint (no animation). Stagger uses opacity + transform, not background-color. | OK |
| 7. Spec-literal pluralization | "Agent reaction (1 messages)", "Agent-only session (1 messages)" verbatim per spec literal beats grammar | OK |
| 8. Boundary signature-detail #1 byte-equivalence | Shared `BoundaryRow` component; same DOM tree from both contexts | OK |
| 9. tabIndex matrix on active panel | M2b SessionView unchanged; `tabIndex={0}` on active Skim panel preserved | OK |
| 10. Status-color misuse (`--color-error` vs `--color-warn`) | `--color-warn` for oversize (capacity boundary) and truncation banner; `--color-error` only for the `error` state branch | OK |
| 11. Hex isolation regression | ZERO hex in SkimView.{tsx,css,test.tsx} and BoundaryRow.{tsx,css,test.tsx}; prototype.html uses hex only in @supports fallback (not shipped) | OK |
| 12. Exhaustiveness check on per-kind switch | `<SkimBlockRow>` switch on `block.kind` has `default` branch with `const _: never = block.kind` (per planner §4.1) | OK |
| 13. Off-by-one in inclusive ranges | `messages.slice(start, end + 1)` documented at §10.3; defensive clamping handles the empty-stream sentinel `{start: 0, end: -1}` | OK |
| 14. Three-magnitude rhythm rule precedence | §5 explicit source-order rules: 24 same-kind -> 32 kind-change -> 32 boundary; boundary rule comes LAST | OK |
| 15. `<details>` block-size depends on `interpolate-size` | M2b global.css declaration assumed present; M5 does NOT redeclare | OK |
| 16. `bun:test` isolation | Test plan reuses M4's `mock.module` pattern verbatim (per planner §4.3) | OK |

All 16 precedents pass. The designer expects the reviewer trio to
land 0-2 BLOCKING findings on the FIRST round (M2b had 8 BLOCKING;
M4 had 2 BLOCKING + 3 IMPORTANT in round 1; M5's artifact
deliberately defends against each one).

---

End of design.md.
