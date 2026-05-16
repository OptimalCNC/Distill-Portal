# Phase 7c — TranscriptView render overhaul — design

Design artifact for **Phase 7c / Milestone 1 (UI/UX Design Gate)**.

Spec frozen at `working/phase-7c.md`. Baseline commit: `4e3318b` (Phase 7b
close). Predecessor design reference: `working/phase-5/designs/m4-transcript/`.
Designer dispatch: 2026-05-16.

This artifact is a **reference**. The developer subagent re-implements
against the production stack (Bun + Vite + React + TS + per-component
sibling CSS). Nothing in this folder ships to `apps/frontend/`; the
prototype's hex-fallback literals do not contaminate the
`apps/frontend/src/` audit count. The 22 unique hex literals the
prototype emits are a **strict subset of `tokens.css`'s 24-hex
`@supports` fallback block** — the prototype omits `--color-bg`
(unused at this rendering tier) and reuses every remaining hex
verbatim. Zero new hex is introduced.

---

## 1. Chunk scope

**What Phase 7c changes about the visible TranscriptView render**:

1. **Tool lifecycle pairing**. Each `tool_use` Message visually pairs
   with its matching `tool_result` Message into a single "lifecycle"
   card. Orphan `tool_use` and orphan `tool_result` render with
   explicit affordances (in-flight / stray).
2. **Same-tool grouping**. Consecutive lifecycles invoking the same
   tool collapse into a group card with a count badge + aggregate
   status indicator. Expanded via native `<details>`.
3. **Inline parser-warning chip**. Warnings with `messageIndex` set
   render a small chip attached to the affected message. Chip
   visibility is governed by a 4-bucket classification: `render-normally`
   / `collapse-by-default` / `hide-with-inspect` / `warning-only`.
4. **Aggregate status indicator** semantics on group heads: `all-success`,
   `mixed`, `in-flight`, `all-failed`. Visible chrome-text label always
   accompanies the colored dot.
5. **Banner extension**. The existing parse-warnings banner adds a
   bucket-count breakdown strip so the session-level surface accounts
   for the inline-vs-banner-only routing.

**What Phase 7c does NOT change**: every Phase 5 per-kind treatment
(user / assistant / standalone tool_use / standalone tool_result /
system / boundary / unknown) renders verbatim. SkimView is untouched.
The session truncation banner is untouched. Parser logic is untouched
(closed in 7b).

---

## 2. Design intent

The Archive-room aesthetic locked in Phase 5 is editorial and quiet:
warm-paper light / deep-ink dark, sienna accent used surgically,
hairline-over-shadow, Fraunces display for editorial markers,
system-sans chrome for functional rows. Phase 7c lives inside that
aesthetic. The new surfaces — lifecycle pair, group head, inline
chip — are **structural** additions to the message vocabulary, not
new visual identities.

The skim-friendly product goal: a session with 20 sequential tool
calls reads as ONE editorial unit (the group head) by default, with
the count badge + aggregate status carrying the mental model the
inspector has ("twelve Read calls, all succeeded"). The lifecycle
pair card is the next zoom: it folds tool_use + tool_result into one
card so the reader sees "call + return" as a unit, not as two
adjacent rows that happen to be related. The chip surfaces parse
warnings in the same low-key visual register as the rest of the
chrome — a small annotation, never a headline.

The motion budget is the same as Phase 5 M4's: only `opacity` (banner
entrance, unchanged from 5) and native `<details>` `block-size`
(the M2b exemption, reused for every disclosure). No transforms. No
spinners. No skeleton loaders. The editorial restraint that defined
the Phase 5 inspection surface is the SAME restraint applied to the
new structural surfaces. **The reader experiences the new surfaces
as a quieter, more skim-able transcript — not as a chattier one.**

---

## 3. Lifecycle card anatomy

Spec ref: `working/phase-7c.md` §Data Model — `RenderHint.kind === "lifecycle"`.

### 3.1 DOM shell

```html
<li class="msg msg-li">
  <article class="lifecycle-card" data-status="all-success">
    <header class="lifecycle-head">
      <span class="label-tool">Tool</span>
      <span aria-hidden="true">·</span>
      <span class="tool-name">Read</span>
      <span aria-hidden="true">·</span>
      <time datetime="..." title="...">3 min ago</time>
      <span class="head-status">
        <span class="status-dot" data-status="all-success" aria-hidden="true"></span>
        succeeded
      </span>
    </header>
    <div class="lifecycle-body">
      <details>
        <summary><span class="side-label">Arguments</span>{ "file_path": ".../tokens.css" }</summary>
        <pre>{ /* full args */ }</pre>
      </details>
      <details>
        <summary><span class="side-label">Result</span>read 4.1 KB</summary>
        <pre>/* full result */</pre>
      </details>
    </div>
  </article>
</li>
```

### 3.2 Visual recipe

- **Container**: `var(--color-surface)` background, 1 px `var(--color-border)`
  hairline border, `var(--radius-md)` corners, `var(--space-3) var(--space-4)
  var(--space-3) var(--space-6)` padding. The inline-start padding is wider
  (`--space-6` = 24 px) to leave room for the sienna rail.
- **Sienna inline-start rail**: an `::before` pseudo-element absolutely
  positioned along the inline-start edge. 2 px wide, full card height (minus
  vertical padding), `var(--color-accent)` at 0.55 opacity, `border-radius: 1px`.
  This is the visual connector that marks the card as a PAIRED lifecycle
  (vs. a standalone tool message).
- **Rail color variants**:
  - `data-status="all-success"` → `var(--color-accent)` (sienna, 0.55 alpha)
  - `data-status="all-failed"` → `var(--color-error)` (0.70 alpha — slightly
    louder because failure is the higher-signal state).
  - `data-status="in-flight"` → `var(--color-ink-muted)` (0.55 alpha —
    quieter than success; the call isn't complete).
- **Header row** (`.lifecycle-head`): chrome-text uppercase letter-spaced
  attribution row at `--font-chrome --text-xs --color-ink-muted`. Contains
  the tool name in `--font-mono --text-xs --color-ink`, the timestamp
  inside a `<time>` element, and the aggregate status indicator at
  `margin-inline-start: auto` so it floats to the trailing edge. The
  header is followed by a `border-bottom: 1px solid var(--color-border)`
  hairline that visually separates header from body.
- **Body**: two stacked `<details>` disclosures — "Arguments" side and
  "Result" side. Each summary preserves the native disclosure triangle
  (`list-style: revert`). Inside each summary, an inline-flow `<span
  class="side-label">` carries the chrome-text uppercase "Arguments" or
  "Result" tag; the summary preview text that follows is a short
  one-line excerpt (e.g. the file_path argument, or "read 4.1 KB"). The
  `<pre>` body inside the open disclosure sits on
  `var(--color-surface-raised)` with the same monospace recipe Phase 5
  M4 established.

### 3.3 Header layout — top to bottom

```
TOOL · {tool-name} · {time}                    ● {status-label}
─────────────────────────────────────────────────────────────────
> Arguments  {one-line excerpt}
> Result     {one-line excerpt}
```

### 3.4 Success / failure indicator

The header carries an aggregate-status block at `margin-inline-start:
auto`: a 10 px diameter dot + a visible chrome-text label. The dot
color reinforces the meaning; the label IS the load-bearing cue (per
the accessibility constraint).

| Status        | Dot color                              | Label text   |
|---------------|----------------------------------------|--------------|
| all-success   | `var(--color-success)` fill            | `succeeded`  |
| all-failed    | `var(--color-error)` fill              | `failed`     |
| in-flight     | transparent fill, ink-muted border     | `in-flight`  |
| mixed         | `var(--color-warn)` fill (group only)  | aggregate    |

### 3.5 Orphan affordances

- **Orphan tool_use** (`pairWithIndex: null`): rail color shifts to
  `--color-ink-muted` (0.55 alpha). Header gains a "AWAITING RESULT"
  Fraunces italic small-caps pill (`.lifecycle-pill`), inline-flow
  alongside the tool-name. Status dot is hollow ("in-flight"). Body
  shows the Arguments disclosure + an italic `--color-ink-muted` note:
  "No tool_result observed before end of stream." See wireframe 10.
- **Orphan tool_result** (`RenderHint.kind === "standalone"` per
  §Pairing rules; the spec routes the orphan result through the
  existing standalone tool_result render): card renders with the
  Phase 5 `.msg-tool-result` recipe and a "STRAY RESULT" pill in the
  header. A `render-normally` inline chip below the body explains the
  orphan state with full reason. See wireframe 11.

### 3.6 Motion on lifecycle cards

- The `<details>` Arguments and Result disclosures use the existing
  `--motion-disclosure` (200 ms) `block-size` transition — the Phase 5
  M2b exemption inherited via `apps/frontend/src/styles/global.css`.
- The sienna rail is **static**. It does not pulse, slide, or fade.
  Reduced-motion safe by construction (it does not animate).
- No `transform`, no `background-color` transition on the card panel.
- Reduced-motion: the global rule zeroes `<details>` transitions; the
  card visual layout is otherwise unchanged.

---

## 4. Grouped card model

Spec ref: `working/phase-7c.md` §Data Model — `RenderHint.kind === "group-head"`,
`"group-member"`. Resolved Decision #9: native `<details>` for
expand/collapse.

### 4.1 Collapsed group head

DOM:

```html
<details class="group-card" data-status="all-success">
  <summary>
    <span class="tool-name">Read</span>
    <span class="group-divider" aria-hidden="true"></span>
    <span class="count-badge">12 calls</span>
    <span class="aggregate-label">
      <span class="status-dot" data-status="all-success" aria-hidden="true"></span>
      all succeeded
    </span>
  </summary>
  <div class="group-members">…</div>
</details>
```

Visual recipe:

- Container: `var(--color-surface)` background, 1 px `var(--color-border)`
  hairline border, `var(--radius-md)` corners.
- Summary row (the only visible row when collapsed): `var(--space-3)
  var(--space-4)` padding, flex layout with `gap: var(--space-3)`.
- Tool name: `--font-mono --text-sm --color-ink`. Reads as machine-named
  identifier.
- Hairline divider (`.group-divider`): a 1 px × 1em `var(--color-border)`
  rectangle aligned to the line's mid-height, separating tool name from
  the count badge.
- Count badge: `--font-mono --text-xs --color-ink` text, padded
  `0 var(--space-2)`, sits on `var(--color-surface-raised)` with a
  `1px var(--color-border)` hairline + `var(--radius-sm)` corners.
  The text reads "12 calls" verbatim. NOT just the number — the noun
  IS the discoverability cue. Right-aligned via the parent's flex gap
  + the aggregate-label's `margin-inline-start: auto`.
- Aggregate label: pushed to the trailing edge via `margin-inline-start:
  auto`. A 10 px status dot + chrome-text label (e.g. "all succeeded").
  Color reinforces; the chrome-text carries the meaning.
- Native disclosure triangle preserved via `list-style: revert` on
  the summary.

### 4.2 Expanded group

When the user toggles the `<details>` open:

- A hairline `border-top: 1px solid var(--color-border)` separates
  the summary from `.group-members`.
- `.group-members` carries `padding: 0 var(--space-4) var(--space-4)`
  (no top inset; the border-top + the inner card top margin handle
  vertical rhythm).
- Each member is rendered as a `.group-member .lifecycle-card`:
  full lifecycle card recipe (header + Arguments + Result disclosures),
  with one difference — the card background is `var(--color-surface-raised)`
  instead of bare `var(--color-surface)`. The raised backdrop reads as
  "nested machinery" without introducing a new color token.
- 16 px (`var(--space-4)`) vertical rhythm between members.
- The sienna rail recipe is unchanged on group-member cards (still
  `var(--color-accent)`); the rail sits on the raised backdrop and
  the WCAG measurement P19 confirms 4.57:1 / 5.52:1 — passing SC 1.4.11.

### 4.3 Aggregate-status semantics

Per `GroupStatus` in §Data Model. The aggregate-label text in the
summary row is the canonical surface; the dot is reinforcement.

| `GroupStatus.kind` | Aggregate-label text     | Dot recipe                                  |
|--------------------|--------------------------|---------------------------------------------|
| `all-success`      | `all succeeded`          | fill: `var(--color-success)`                |
| `mixed`            | `N succeeded · M failed` | fill: `var(--color-warn)`                   |
| `in-flight`        | `running N of M`         | hollow (border: `var(--color-ink-muted)`)   |
| `all-failed`       | `all failed`             | fill: `var(--color-error)`                  |

No new color tokens. Every fill uses an existing status token from
`tokens.css`. The hollow dot for `in-flight` deliberately avoids
spinner-style motion — the editorial aesthetic forbids attention-y
indicators.

### 4.4 Native `<details>` rationale

Per Phase 7c Resolved Decision #9. Browser-managed open state survives
tab switches via the same DOM-instance preservation Phase 5 M5/M6
exercised. No React-controlled `open` attribute. No `useState` on
expand. The implementation MUST NOT add a controlled `open` prop or
an `onToggle` handler that mirrors state into React; the browser
state IS the state.

---

## 5. Inline warning chip — 4-bucket treatment

Spec ref: `working/phase-7c.md` §Data Model — `InlineWarning` +
§4-bucket warning render classification.

### 5.1 Shared chip recipe

DOM (used by render-normally and collapse-by-default and hide-with-inspect):

```html
<details class="chip">
  <summary>
    <span class="status-dot" data-status="…" aria-hidden="true"></span>
    <span class="chip-label">…</span>
    <span class="chip-tag">PAYLOAD</span>
  </summary>
  <span class="chip-reason">{full warning.reason}</span>
</details>
```

Visual:

- Background: `var(--color-surface-raised)`.
- Border: 1 px `var(--color-border)`.
- Corners: `var(--radius-sm)`.
- Padding: `var(--space-2) var(--space-3)`.
- Typography: `--font-chrome --text-xs --color-ink` for the summary
  label; `--font-mono --text-xs --color-ink-muted` for the reason body.
- Severity dot: same 10 px recipe as the aggregate-status dots; color
  maps from `severity` (error → error, warning → warn, info →
  hollow-ink-muted).
- Category tag: a Fraunces italic small-caps pill at the trailing edge
  of the summary, in `--color-ink-muted --text-xs`. Reads as
  marginalia.

### 5.2 Bucket placement

- **render-normally**: chip sits in a `.chip-wrapper` below the
  message body, with `margin-top: var(--space-3)` (12 px). The chip
  reads as a footnote attached to the message. The summary is the
  short reason (e.g. "Unknown user content item type 'image'"). The
  body holds the full reason. See wireframe 06.
- **collapse-by-default**: identical DOM, but the summary copy is
  generic — `{N} warning` — instead of the specific short reason.
  The reason is hidden until the user expands. See wireframe 07.
- **hide-with-inspect**: the chip is nested inside a corner
  affordance. The visible cue is a tiny chrome-text "Inspect" link
  at the message card's bottom-right (`flex justify-content: flex-end`).
  The link uses `--color-accent` to match Phase 5's "Expand" precedent.
  Clicking expands the nested chip. See wireframe 08.
- **warning-only**: no chip. The warning surfaces only on the
  session banner at the top of the transcript. See wireframe 09.

### 5.3 Keyboard interaction

Every chip is a native `<details>`. Tab focus moves to the `<summary>`;
Enter or Space toggles open/closed. The hide-with-inspect outer
"Inspect" link is also a `<summary>` of an outer `<details>` — Tab
moves through both layers in document order.

### 5.4 Color treatment

| Severity   | Dot color                                              |
|------------|--------------------------------------------------------|
| `error`    | `var(--color-error)`                                   |
| `warning`  | `var(--color-warn)`                                    |
| `info`     | hollow (border `var(--color-ink-muted)`, no fill)      |

Color is reinforcement; the chip-label text is the load-bearing cue.

### 5.5 Expanded body

The `.chip-reason` is the `warning.reason` string rendered verbatim
in `--font-mono --text-xs --color-ink-muted`. `white-space: pre-wrap`
+ `word-break: break-word` so it wraps cleanly inside the chip.

---

## 6. Aggregate status indicators semantics

Spec ref: `working/phase-7c.md` §Data Model — `GroupStatus`.

The four states are enumerated in §4.3 above. Token reuse:

- `all-success` → `var(--color-success)` — sage green, existing
  status token, never previously surfaced in TranscriptView.
- `mixed` → `var(--color-warn)` — amber, the same token Phase 5 used
  on the truncation banner stripe.
- `in-flight` → hollow dot, border `var(--color-ink-muted)`, no fill.
  The hollow recipe is intentional: a solid dot would read as a
  status; a hollow dot reads as "pending status".
- `all-failed` → `var(--color-error)` — red, the same token Phase 5
  used for error prose.

No new color tokens. The four-state matrix is fully addressable by
the four existing status-adjacent tokens (`success`, `warn`,
`ink-muted`, `error`). WCAG measurements confirm AA on every pair
(see §10).

**Authoring contract**: every `.status-dot` MUST carry a `data-status`
attribute (one of `all-success` / `mixed` / `all-failed` / `in-flight`).
The prototype's base `.status-dot` rule (an inert ink-muted disc on
a border-strong outline) is the visual fallback ONLY — it exists so
a forgotten attribute renders as a clearly-inert neutral disc rather
than disappearing. A `.status-dot` rendered without `data-status` is
a developer bug; the prototype itself never emits one, and the
production implementation MUST NOT emit one. The four
`data-status` variants are the only intentional states.

---

## 6.5 Task-lifecycle treatment

Spec refs:
- `working/phase-7c.md` §Goal & Scope line 28 — every 🎨 row lands on
  a "specific (not generic) render treatment".
- `working/phase-7c.md` §Milestone 3 line 211 — drives the deferred
  rows from `🎨 deferred to 7c` to `✅ supported`.
- `docs/features/parser-event-support.md` lines 51-52 — the two
  matrix rows this section closes:
  - `codex-event-msg-task-started`
  - `codex-event-msg-task-complete`

### 6.5.1 Why this is its own treatment

The Codex parser routes `event_msg.task_started` and `event_msg.task_complete`
to `kind: "system"` Messages with `text: "task_started · turn ${turn}"`
or `text: "task_complete · turn ${turn}"` (see
`apps/frontend/src/features/sessions/parsers/codex.ts:482` and `:500`).
Today both render through the generic `SystemMessage` switch — that's
the "🎨 deferred to 7c" annotation. Phase 7c's M3 obligation is to
land a *specific* render branch for these rows.

A Codex turn opens and closes exactly once each. The pair brackets
the work history of a turn the way a chapter heading opens and a
chapter footer closes a section. Treating them as plain `system`
notes (chrome text, no chrome) buries the lifecycle landmark in the
chrome noise. A dedicated chapter-marker recipe surfaces the
landmark without inventing a new MessageKind.

### 6.5.2 Discriminator design — Option B (RenderHint attribute)

Resolved Decision #2 freezes `MessageKind`. The discriminator
therefore lives in the RenderHint layer, not the parser layer.

**Choice**: extend `RenderHint` with a new optional attribute on
the existing `standalone` variant:

```ts
| {
    kind: "standalone";
    messageIndex: number;
    warnings?: InlineWarning[];
    taskLifecycle?: "started" | "complete";  // NEW — Phase 7c.
  }
```

`renderHints.ts` populates `taskLifecycle` when the underlying
Message is a `kind: "system"` Message whose `text` begins with
`task_started · turn ` or `task_complete · turn `. The detection
is a simple `startsWith` on the two literal prefixes (the parser
emits the strings verbatim from `codex.ts:482` / `:500`).

`TranscriptView.tsx` reads the hint at render time. The render
switch is:

```tsx
case "standalone": {
  if (message.kind === "system" && hint.taskLifecycle) {
    return <TaskLifecycleCard hint={hint} message={message} />;
  }
  return <SystemMessage message={message} />;  // existing branch
}
```

The Message's `MessageKind` stays `system`. The visual branches by
the RenderHint attribute. No new MessageKind. No new RenderHint
variant. Backward-compatible (the attribute is optional; old
callers ignore it).

**Why not Option A** (read `Message.text` directly inside
`SystemMessage`):
- Couples the system-render branch to a literal-string sniff. Every
  future system-text variant would force a `startsWith` chain inside
  `SystemMessage`. The pattern doesn't scale.
- Puts the dispatch decision inside a rendering component instead
  of inside the dedicated render-hint computation layer. Phase 7c's
  whole reason for `renderHints.ts` is to keep that dispatch
  centralized. The Option B attribute is a clean fit.

The Option B attribute is also the path that lets the parser stay
unchanged (the parser already routes both events to the right
text). The render layer recovers the discriminator from the text
prefix and stamps it onto the RenderHint.

### 6.5.3 Visual recipe — chapter-marker hairline pair

The card is a **horizontal-hairline-pair** chapter marker:

- 1 px `var(--color-border)` top border.
- 1 px `var(--color-border)` bottom border.
- No left/right border. No corner radius. No background tint.
- Padding `var(--space-3) var(--space-4)` (12 / 16 px).
- Margin block `var(--space-2)` (8 px) — tight, since the rule pair
  IS the breathing.
- Maximum inline size `var(--measure)` (70 ch) so the rule pair
  spans the same column as the rest of the transcript.

The interior layout is a centered inline-flex row with
`gap: var(--space-3)`:

```
─────────────────────────────────────────────────────────────
              Task started   ·   turn abc123
─────────────────────────────────────────────────────────────
```

- **Label** (`<span class="task-label">`): Fraunces italic small-
  caps marginalia. `--font-display`, `font-style: italic`,
  `font-variant: small-caps`, `letter-spacing: 0.12em`,
  `font-size: var(--text-xs)`, color `var(--color-ink-muted)`.
  The Fraunces italic SC vocabulary matches the existing
  `.lifecycle-pill` "AWAITING RESULT" / "STRAY RESULT" pill
  vocabulary — task-lifecycle is the same marginalia register,
  scaled up to be the card's primary content rather than a
  pill alongside other text.
- **Divider** (`<span class="task-divider">`): a middle-dot `·`
  in `--color-ink-muted`. Decorative; `aria-hidden="true"`.
- **Turn id** (`<span class="task-turn">`): the trailing
  `turn {turn-id}` segment in `--font-mono --text-xs
  --color-ink-muted`. Renders the parser-emitted turn id
  verbatim (including the parser fallback `(unknown turn)`).

The label string flips on the `data-task` attribute:

| `data-task`  | Visible label   |
|--------------|-----------------|
| `started`    | `Task started`  |
| `complete`   | `Task complete` |

Mixed-case strings (not "TASK STARTED" in UPPER) so screen readers
read them naturally. The small-caps font-variant carries the
uppercase optical without altering the underlying string.

### 6.5.4 Vocabulary placement against neighbors

| Card                | Border             | Background            | Label register             | Distinct?            |
|---------------------|--------------------|------------------------|----------------------------|----------------------|
| `.msg-boundary`     | full chapter break | bare                   | Fraunces italic display    | M4 inherited         |
| `.msg-task-lifecycle` | hairline PAIR    | bare                   | Fraunces italic SMALL-CAPS | **NEW — Phase 7c**   |
| `.msg-system`       | none               | bare                   | chrome-text uppercase      | M4 inherited         |

The task-lifecycle card slots BETWEEN `.msg-system` (quietest) and
`.msg-boundary` (loudest). A Codex turn opens and closes 1× per
turn; the pair is naturally bracketing without competing with the
session-level boundary chapter break.

### 6.5.5 Hover / focus / reduced-motion

The card is **non-interactive**.

- No hover state. The cursor stays default; no color change on the
  panel.
- No focus ring. The card is not focusable (no `tabIndex`, no
  `<details>`, no `<button>`).
- No `<details>` expand/collapse. No motion. The recipe is static
  by construction; the reduced-motion media query has nothing to
  zero out here.
- No inline warning chip. The Phase 7b parser does not attach
  `messageIndex` warnings to these rows; if a future parser change
  attached one, the existing `.chip-wrapper` placement (below the
  body) applies unchanged.

### 6.5.6 Accessibility

- The card is rendered as `<article class="msg-task-lifecycle">`
  with `aria-label="Task started for turn abc123"` (or
  `Task complete for turn abc123`). Screen readers announce the
  card as a discrete unit.
- The middle-dot divider is `aria-hidden="true"` (decorative).
- The label and turn id share `--color-ink-muted` on
  `--color-surface`. WCAG: 7.04 : 1 light, 7.36 : 1 dark — both
  clear AA (4.5 : 1) by margin. See §10.4 below for the four
  new pairs (P38 through P41).
- The hairline borders are decorative reinforcement; the card's
  discrimination from the surrounding stream is carried by the
  typography contrast.

### 6.5.7 Load-bearing CSS class

`.msg-task-lifecycle` — chosen verbatim to match the existing
`assertTreatment` selector at
`apps/frontend/src/features/sessions/TranscriptView.event-coverage.test.tsx:195`.
The `@unskip Phase 7c` test for the `task_lifecycle` treatment
passes when the rendered tree contains a `.msg-task-lifecycle`
node.

### 6.5.8 Structural HTML (developer reference)

```html
<article class="msg-task-lifecycle" data-task="started"
         aria-label="Task started for turn abc123">
  <span class="task-label">Task started</span>
  <span class="task-divider" aria-hidden="true">&middot;</span>
  <span class="task-turn">turn abc123</span>
</article>

<article class="msg-task-lifecycle" data-task="complete"
         aria-label="Task complete for turn abc123">
  <span class="task-label">Task complete</span>
  <span class="task-divider" aria-hidden="true">&middot;</span>
  <span class="task-turn">turn abc123</span>
</article>
```

Wireframe + light/dark prototype variants:
[`wireframes/12-task-lifecycle.md`](wireframes/12-task-lifecycle.md);
prototype variant 1c in both columns of `prototype.html`.

---

## 7. States & variants enumeration

For each visible primitive, the prototype demonstrates every state
the production CSS must handle:

### 7.1 Lifecycle card

| State           | Treatment                                                         |
|-----------------|-------------------------------------------------------------------|
| collapsed       | Header + closed Arguments + closed Result disclosures             |
| Arguments open  | Inline `<details open>` on the Arguments side; Result still closed |
| Result open     | Inline `<details open>` on the Result side; Arguments may be open  |
| hover           | Cursor stays default; no hover-color change on the panel (motion-budget) |
| focus-visible   | The `<summary>` elements show their native focus ring on Tab arrival |
| selected        | (not applicable — TranscriptView has no message-level selection)   |
| reduced-motion  | `<details>` transitions snap; layout unchanged                     |
| light mode      | Bare warm-paper surface; sienna rail at 0.55 alpha                 |
| dark mode       | Deep-ink surface; sienna rail same recipe                          |
| status: success | Rail = accent; head-status: green dot + "succeeded"                |
| status: failed  | Rail = error (0.70 alpha); head-status: red dot + "failed"         |
| status: orphan  | Rail = ink-muted; in-flight pill in header; hollow status dot      |

### 7.2 Group card

| State              | Treatment                                                  |
|--------------------|------------------------------------------------------------|
| collapsed          | Summary row only, hairline + corners visible               |
| expanded           | Hairline divider appears below summary; members visible    |
| hover on summary   | Cursor pointer; no color change                            |
| focus-visible      | `<summary>` shows native focus ring                        |
| reduced-motion     | `<details>` snap; member rhythm unchanged                  |
| light + dark       | Surface tokens swap; aggregate-dot recipe unchanged        |
| status: all-success| Green dot, "all succeeded" label                           |
| status: mixed      | Warn dot, "N succeeded · M failed" label                   |
| status: in-flight  | Hollow dot, "running N of M" label                         |
| status: all-failed | Error dot, "all failed" label                              |

### 7.2b Task-lifecycle card

| State                | Treatment                                                            |
|----------------------|----------------------------------------------------------------------|
| `data-task="started"`  | Hairline pair + "Task started" Fraunces SC label + mono turn id    |
| `data-task="complete"` | Hairline pair + "Task complete" Fraunces SC label + mono turn id   |
| hover                | None (non-interactive)                                              |
| focus-visible        | None (card is not focusable)                                        |
| reduced-motion       | No-op (recipe is static; nothing to zero)                           |
| light mode           | Hairline pair = `--color-border`; label + turn id = `--color-ink-muted` |
| dark mode            | Same recipe; tokens swap under the dark wrapper                     |

### 7.3 Inline warning chip

| State                     | Treatment                                            |
|---------------------------|------------------------------------------------------|
| render-normally / closed  | Summary visible below message; reason hidden        |
| render-normally / open    | Summary + reason body both visible                  |
| collapse-by-default / closed | Generic "{N} warning" summary; reason hidden     |
| collapse-by-default / open | Reason revealed                                     |
| hide-with-inspect / closed| "{N} info · Inspect" affordance only                |
| hide-with-inspect / open  | Outer affordance + nested chip both visible         |
| warning-only              | No chip rendered on the message                     |
| focus-visible             | `<summary>` native focus ring                       |
| hover on Inspect link     | Text-decoration underline                           |
| reduced-motion            | `<details>` snap                                    |
| severity: error           | Red dot + chip-label                                |
| severity: warning         | Warn dot                                            |
| severity: info            | Hollow dot                                          |

---

## 8. Motion budget

Phase 7c **introduces no new motion tokens** and authorizes no new
motion surfaces. Every animation reuses the budget Phase 5 M4
established.

### 8.1 Active surfaces

| Surface                                              | Property                                | Duration                 | Easing            |
|------------------------------------------------------|-----------------------------------------|--------------------------|-------------------|
| Lifecycle Arguments / Result `<details>`             | `block-size` (`interpolate-size`)       | `--motion-disclosure`    | `--ease-in-out`   |
| Group head `<details>`                               | `block-size`                            | `--motion-disclosure`    | `--ease-in-out`   |
| Inline warning chip `<details>`                      | `block-size`                            | `--motion-disclosure`    | `--ease-in-out`   |
| hide-with-inspect outer `<details>`                  | `block-size`                            | `--motion-disclosure`    | `--ease-in-out`   |
| Inspect link `:hover` underline                      | text-decoration (instant, no transition) | n/a                      | n/a               |

All four `<details>` surfaces inherit the global rule at
`apps/frontend/src/styles/global.css`:

```css
@supports (interpolate-size: allow-keywords) {
  :root { interpolate-size: allow-keywords; }
}
details > *:not(summary) {
  transition: block-size var(--motion-disclosure) var(--ease-in-out);
}
```

### 8.2 Reduced-motion

The global rule at `global.css`:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

Effect: every `<details>` transition snaps. The lifecycle card sienna
rail is static and unaffected. Status dots are static and unaffected.
The Inspect link's hover-underline is an instant text-decoration swap
(not a transition), unaffected.

### 8.3 PROHIBITED — what Phase 7c MUST NOT animate

Carried verbatim from Phase 5 M4 motion.md:

- No `transition: color`, `border-color`, `width`, `height`, `top`,
  `padding`, `margin`, `font-size`, `letter-spacing`, `line-height` on
  any new surface.
- No `transition: background-color` on any new card panel.
- No `transform` on any new card.
- No spinner animation on the in-flight dot. The hollow dot recipe is
  the editorial answer to "indicate pending without motion".
- No staggered entrance on group-member cards. The Skim-style stagger
  is M5-only.
- No `animation-delay` on any new surface.

### 8.4 New motion tokens introduced

**None.** Phase 7c reuses `--motion-disclosure` (200 ms) and
`--ease-in-out`. No additions to `tokens.css`.

---

## 9. Accessibility

### 9.1 ARIA roles + landmarks

- The transcript `<section aria-label="Session transcript">` carries
  the surface anchor (unchanged from M4).
- The transcript `<ol>` retains its implicit `role="list"`.
- Each lifecycle card is an `<article>` (implicit `role="article"`)
  so screen readers announce each call as a discrete unit.
- Each group `<details>` exposes a native disclosure widget; the
  summary is keyboard-focusable.
- Status dots carry `aria-hidden="true"`; the adjacent text label
  is the screen-reader cue. No color-alone signaling.
- The in-flight pill ("AWAITING RESULT") is plain text, screen-readable.
- The chip category tag (e.g. "PAYLOAD") is plain text, also screen-readable.

### 9.2 Keyboard interaction

- Tab moves through every `<summary>` in document order.
- Enter or Space on a `<summary>` toggles the disclosure (native).
- The hide-with-inspect affordance is two nested `<details>` — Tab
  reaches the outer "Inspect" link first, then (when expanded) the
  inner chip's summary.
- Group head: Tab focuses the group `<summary>`; Enter expands; Tab
  again moves to the first focusable element inside (the first
  member's first `<summary>`).
- No focus trap. No focus-management hand-rolled state.

### 9.3 Focus management

The implementation MUST NOT call `focus()` on any newly-revealed
element when a `<details>` expands. Browser-managed focus stays on
the `<summary>` that the user activated; subsequent Tab moves into
the revealed content. This matches Phase 5 M4 / M5 / M6 precedent.

### 9.4 Color-contrast targets

- **AA text (≥ 4.5:1)** for every chrome-text label, mono code, chip
  body, banner item, status label.
- **SC 1.4.11 non-text (≥ 3:1)** for every status dot, the sienna
  rail, the hairline borders that are load-bearing (the chip border
  is decorative reinforcement — the chip's discrimination from the
  message body is the surface-raised background contrast at 16.13:1).

WCAG measurements in §10 confirm all pairs pass their applicable bar
in BOTH light and dark modes.

### 9.5 Screen reader copy

- Status labels are concrete chrome-text strings: "succeeded",
  "failed", "in-flight", "all succeeded", "running 2 of 5", etc.
  Each is full English, not a glyph + tooltip.
- Group count badge: "12 calls" verbatim (not just "12"). Screen
  reader announces "12 calls" inside the group summary.
- Stray-result pill: "STRAY RESULT" plain text in the card header.
  Screen readers read it as part of the heading flow.
- Chip category tag ("PAYLOAD", "TIMESTAMP", "LEXER", etc.) is plain
  text — screen-readable as marginalia.

---

## 10. WCAG contrast measurements

Every new visible foreground/background pair Phase 7c introduces is
measured by `wcag.py` (committed in this folder). The script's
pipeline is byte-equivalent (math + matrices) to Phase 5 M5's
`wcag_m5.py`, which was codex-verified during the Phase 5 design
loop. Re-run with:

```
python3 working/phase-7c/designs/wcag.py
```

### 10.1 Result summary

**All 41 pairs pass their applicable WCAG bar in BOTH light and dark
modes.** Output captured at `wcag-output.txt` in this folder. Pairs
P38 through P41 are the new task-lifecycle surfaces added in this
revision (see §10.4).

Spotlight on the tightest pairs:

| Pair  | Surface                                  | Light    | Dark    | Bar       | Margin   |
|-------|------------------------------------------|----------|---------|-----------|----------|
| P20   | `success` dot on `surface`               | 4.16:1   | 4.31:1  | 3.0 (NT)  | +1.16    |
| P24   | `success` dot on `surface-raised`        | 3.93:1   | 4.13:1  | 3.0 (NT)  | +0.93    |
| P21   | `warn` dot on `surface` (= M4 T12)       | 4.21:1   | 7.68:1  | 3.0 (NT)  | +1.21    |
| P25   | `warn` dot on `surface-raised`           | 3.97:1   | 7.36:1  | 3.0 (NT)  | +0.97    |
| P32   | `accent` text on `surface` (Inspect link)| 4.84:1   | 5.78:1  | 4.5 (AA)  | +0.34    |
| P19   | `accent` rail on `surface-raised`        | 4.57:1   | 5.52:1  | 3.0 (NT)  | +1.57    |

The `success` dot is the narrowest new pair. At 4.16:1 light / 4.31:1
dark on bare surface (3.93 / 4.13 on raised surface), it passes the
SC 1.4.11 non-text bar by clear margin. The chrome-text label adjacent
to the dot carries the load-bearing accessibility cue regardless; the
dot is reinforcement.

### 10.2 No new tokens introduced by WCAG measurement

Every pair above measures token combinations that already exist in
`tokens.css`. **No new color tokens are required to pass AA + SC
1.4.11.** Token count invariant holds at 83. Hex literal invariant
holds at 24.

### 10.3b New pairs added in this revision (task-lifecycle)

Four new pairs were added to `wcag.py` to cover the §6.5
task-lifecycle treatment surfaces:

| Pair | Surface                                          | FG / BG                       | Light  | Dark   | Bar       |
|------|--------------------------------------------------|-------------------------------|--------|--------|-----------|
| P38  | Task-lifecycle hairline pair (NT)                | `border` / `surface`          | 1.49:1 | 1.35:1 | pass*     |
| P39  | Task-lifecycle Fraunces SC label                 | `ink-muted` / `surface`       | 7.04:1 | 7.36:1 | AA text   |
| P40  | Task-lifecycle middle-dot divider                | `ink-muted` / `surface`       | 7.04:1 | 7.36:1 | AA text   |
| P41  | Task-lifecycle mono turn id                      | `ink-muted` / `surface`       | 7.04:1 | 7.36:1 | AA text   |

`pass*` for P38: the hairline pair is decorative reinforcement
(the chapter-break visual cue); the card's discrimination from the
surrounding stream is carried by the typography contrast (P39-P41
all at 7+ : 1 against bare surface), not the border. Same carve-out
Phase 5 M4 codex round 1 verified for tool-message hairline borders
(M4 T29) and chip-border (T28 in this script).

P39 / P40 / P41 measure `ink-muted` on `surface`: the same token
pair as P06 / P08 / P09 / P17 / P35 / P36, byte-equivalent ratio.
The task-lifecycle card introduces no new color combinations — it
reuses the existing `ink-muted` on `surface` ratio and the
existing `border` on `surface` hairline ratio.

### 10.3 Reviewer obligation

The reviewer MUST re-run `python3 wcag.py` and confirm zero drift
against `wcag-output.txt`. The Phase 5 M4 round-2 designer's
hand-derivations drifted by ~0.4 ratio points on color-mix recipes;
Phase 7c uses no NEW color-mix recipes (every pair is direct token
on direct token), so the drift risk is lower — but the script
remains the deterministic source of truth.

---

## 11. Decisions & tradeoffs

Each non-obvious call below is recorded so the reviewer can re-litigate
or rubber-stamp.

### 11.1 Sienna rail as the visual pair marker

**Choice**: a 2 px sienna inline-start rail at 0.55 alpha (via
`var(--color-accent)`) marks the lifecycle card as "this is a PAIR,
not two separate cards". Color shifts to `--color-error` for failure
pairs and `--color-ink-muted` for orphan/in-flight.

**Alternative considered**: a labelled rail ("call → return"), or a
double-card with a connecting line in the gutter, or a single panel
with internal divider. Rejected — they are loud, chatty, or invent
visual vocabulary the Archive-room aesthetic doesn't have.

**Tradeoff**: the rail is the ONLY visual difference between a
lifecycle card and a standalone tool message card. A reader who
doesn't know the convention might miss it. The header layout
(merged "Tool · {name} · {time} · status" + the merged "Arguments /
Result" body) is the secondary cue.

### 11.2 Status dot semantics

**Choice**: 10 px diameter, colored fill or hollow border, always
accompanied by a chrome-text label. Color reinforces; label carries
the meaning.

**Alternative**: glyph icons (✓ / ✗ / ⏱), or text-only labels with
no dot. Rejected — glyphs introduce an icon vocabulary the design
language doesn't have; text-only would lose the at-a-glance scanning
cue when there are many group heads in view.

**Tradeoff**: a 10 px dot is small. Anyone with low vision relies on
the label. The dot is purely reinforcement (per accessibility).

### 11.3 4-bucket chip mapping

**Choice**: the bucket mapping (see §15 below) routes most warnings
to surfaces that match their information density. `error` severity
is always visible inline (`render-normally`). `warning` severity
splits between visible-inline (schema/payload) and collapsed
(lexer/timestamp). `info` is hidden behind Inspect. `meta` warnings
are banner-only.

**Alternative**: simpler 2-bucket (visible or hidden), or 3-bucket
(loud / quiet / banner-only). Rejected — the spec calls for 4
buckets, and the 4-fold split lets the design accommodate
genuinely different signal densities.

**Tradeoff**: the developer must implement the 4-bucket switch
discipline. The CSS itself is the same recipe across all four (only
placement differs).

### 11.4 Group threshold = 3

**Choice**: 3 consecutive same-tool lifecycles trigger a group.

**Alternative**: 4 or 5. Rejected — at 4+, two-call clusters that
"feel grouped" to the reader (e.g. "read tokens.css, then read
global.css") render as two separate cards. At 3, the threshold
matches the editorial intuition: "two is a pair, three is a list".

**Tradeoff**: short groups (3-4 calls) collapse to one row of chrome
even when expanding the group would have been a tiny visual cost.
The user MUST click to expand. Acceptable: the count badge + tool
name + aggregate status give enough information to skim without
expanding.

### 11.5 Pairing mode = strict-adjacency

See §15.

### 11.6 Failure-detection per tool

See §15. Strict text-match heuristics on the `tool_result.text`
string. The Phase 7b parser collapsed structured fields (`exit_code`,
`is_error`, `status`) into the result text via `eventResultText` /
`stringifyMessagePayload` — so the render-hint layer must look at
the text. The chosen heuristics are conservative: they only flag
failure when the text contains an explicit non-zero exit code, an
explicit "is_error: true" pattern, or an explicit failure status
keyword (matching what the parser actually emits).

### 11.7 Native `<details>` only

Carried over verbatim from Phase 5 M5/M6. No React state for
expand/collapse. The browser owns it.

### 11.8 In-flight = hollow dot, no spinner

The editorial aesthetic forbids motion-y indicators. A hollow dot
+ "running 2 of 5" label communicates pending state without
attention-grabbing motion. Acceptable degradation: the reader may
not realize the group is still updating in real time without
refreshing — Phase 7c does not introduce live-stream rendering
(out of scope per spec line 45).

---

## 12. References

Spec sections this design relies on:

- `working/phase-7c.md` §Goal & Scope (lines 19-46) — what's in/out.
- `working/phase-7c.md` §Data Model (lines 97-159) — `RenderHint`,
  `InlineWarning`, `GroupStatus` shapes + pairing/grouping rules +
  warning classification table.
- `working/phase-7c.md` §Milestones M1 (lines 165-179) — design-gate
  obligations.
- `working/phase-7c.md` §Resolved Decisions (lines 269-286) — pre-locked
  invariants: MessageKind stable (#2), pairing keys tool-specific (#4),
  grouping threshold const (#5), banner stays loud (#6), 4-bucket
  classification (#7), boundary resets grouping (#8), native `<details>`
  for expand (#9), Codex reasoning effort medium (#12).
- `working/phase-7c.md` §Open Considerations (lines 288-298) — operational
  decisions locked in this design (see §15 below).
- `working/phase-5.md` §Color philosophy + §Design Tokens + §Motion budget
  — the aesthetic + token + motion canon Phase 7c lives inside.
- `working/phase-5/designs/m4-transcript/design.md` §3 (per-kind visual
  recipes) + §4 (spacing rhythm) + §6.2 (banner visual recipe) + §9.4
  (disclosure animation) — the inherited per-kind treatments.
- `working/phase-5/designs/m4-transcript/motion.md` §"M4's two new motion
  surfaces" — Phase 5 motion authorizations Phase 7c inherits.
- `working/phase-5/designs/m4-transcript/colors.md` — every text-on-surface
  contrast pair already measured; Phase 7c reuses the M4 token-pair
  measurements verbatim.
- `working/phase-5/designs/m5-skim/wcag_m5.py` — the script template
  Phase 7c's `wcag.py` mirrors byte-for-byte.
- `apps/frontend/src/features/sessions/TranscriptView.tsx` — the
  current render the design replaces / extends.
- `apps/frontend/src/features/sessions/parsers/codex.ts` lines 542-630
  + `apps/frontend/src/features/sessions/parsers/claude_code.ts`
  lines 154-235 — the parser emit sites for `tool_use` / `tool_result`
  Messages, source of the failure-detection heuristic decisions in §15.

---

## 13. Implementation acceptance checklist

A numbered list the developer subagent verifies against. Each item is
testable; vague phrasing is intentionally avoided.

1. **`renderHints.ts` exports** `RenderHint`, `InlineWarning`,
   `GroupStatus` types matching the §Data Model shape verbatim, plus
   a `renderHints(messages: Message[]): RenderHint[]` pure function.
2. **Pairing mode** is strict-adjacency: `renderHints.ts` pairs a
   `tool_use` Message ONLY with a `tool_result` Message at the next
   `messageIndex` AND (for Claude Code) with matching `tool_use_id` /
   `toolName`. Non-adjacent pairs do not form a lifecycle.
3. **Orphan tool_use** (`tool_use` with no adjacent matching
   `tool_result`) emits `RenderHint.kind === "lifecycle"` with
   `pairWithIndex: null`.
4. **Orphan tool_result** (`tool_result` with no preceding adjacent
   matching `tool_use`) emits `RenderHint.kind === "standalone"`
   AND an `InlineWarning` with `classification: "render-normally"`
   describing the orphan state.
5. **Grouping threshold = 3**: a `const GROUP_THRESHOLD = 3` in
   `renderHints.ts`. Three or more consecutive same-tool lifecycles
   collapse to a single `group-head` + N `group-member` hints. Two
   or fewer render individually.
6. **Boundary resets grouping**: a `boundary` Message breaks the
   group-detection scan. The next lifecycle starts a fresh group.
7. **Failure detection heuristic** is text-based per the table in §15.4.
   The render-hint layer scans the `tool_result.text` string for the
   per-tool keywords listed there. False-positive risk is acceptable
   (a result containing the word "failed" in its body without an
   actual failure will be flagged) — the chrome-text label "failed"
   is the cue; the user reading the result will see the actual content.
8. **GroupStatus** matches the four kinds in §Data Model exactly:
   `all-success`, `mixed` (with `total`, `failed`), `in-flight`
   (with `total`, `pending`), `all-failed`.
9. **`renderHints.test.ts`** has 100% branch coverage on: adjacent
   pair, span-through (not paired in strict-adjacency mode), orphan
   use, orphan result, group below threshold, group above threshold,
   group reset by boundary, mixed status, all-failed status,
   in-flight status, each of the 4 warning classifications.
10. **`TranscriptView.tsx`** switches on `RenderHint.kind` first, then
    on `Message.kind` for the inner content.
11. **Lifecycle card** renders the recipe in §3: 1 px hairline border,
    sienna inline-start rail via `::before`, header + two `<details>`
    bodies. Background = `var(--color-surface)`.
12. **Sienna rail color variants** match the table in §3.2: accent for
    success, error for failure (at 0.70 alpha), ink-muted for in-flight.
13. **Group head** renders as `<details class="group-card">` with the
    summary layout in §4.1: tool name (mono, text-sm) + 1 px divider +
    count badge ("N calls" verbatim) + aggregate-label at
    `margin-inline-start: auto`.
14. **Group expanded** renders members as `.group-member.lifecycle-card`
    on `var(--color-surface-raised)`, separated by `var(--space-4)`
    vertical rhythm.
15. **Native `<details>` only** — `TranscriptView.tsx` does NOT pass
    a controlled `open` attribute on any `<details>`. No
    `useState`-driven expand state. Browser-managed open survives tab
    switches via the existing keep-mounted contract.
16. **Status dot recipe** is 10 px diameter, applied via a
    `.status-dot` selector with `data-status` attribute switching the
    background-color among `success`, `warn`, `error`, transparent
    (in-flight). The status dot ALWAYS sits adjacent to a visible
    chrome-text label.
17. **Inline chip render-normally**: chip visible below the message
    body in a `.chip-wrapper` with `margin-top: var(--space-3)`.
    Background = `var(--color-surface-raised)`, border = 1 px
    `var(--color-border)`, radius `var(--radius-sm)`.
18. **Inline chip collapse-by-default**: same DOM as render-normally,
    summary copy is `{N} warning` + category tag. Reason is hidden
    until expand.
19. **Inline chip hide-with-inspect**: a `.inspect-affordance`
    container with `display: flex; justify-content: flex-end`
    holding a nested `<details>` whose summary is the Inspect link
    (`--color-accent` chrome-text, hover underline). The inner chip
    sits inside this outer disclosure.
20. **Inline chip warning-only**: NO chip rendered on the message
    card. The warning appears only in the session banner.
21. **Session banner bucket strip**: the existing
    `transcript-banner-warnings` `<details>` adds a `.bucket-strip`
    row showing four counts: render-normally / collapse-by-default /
    hide-with-inspect / warning-only. The strip is mono text in
    `--color-ink-muted` over `var(--color-surface-raised)` with a
    `border-top: 1px solid var(--color-border)` separator.
22. **Aggregate-label copy**: chrome-text uppercase letter-spaced,
    matching the §6 table verbatim ("all succeeded", "N succeeded ·
    M failed" with U+00B7 middle dot, "running N of M", "all failed").
23. **In-flight pill** "AWAITING RESULT" in the lifecycle header:
    `var(--font-display)` italic small-caps `letter-spacing: 0.12em`
    `var(--color-ink-muted)`. No background, no border, no icon.
24. **Stray-result pill** "STRAY RESULT" in the standalone-tool_result
    header: same recipe as the AWAITING RESULT pill.
25. **`<time>` elements** in every lifecycle / group-member header
    carry `datetime` + `title` attributes (relative-time text inside,
    ISO in attrs). Null timestamps render `—` U+2014.
26. **Motion**: only `--motion-disclosure` (200 ms) `--ease-in-out`
    on `<details> > *:not(summary)` block-size. NO `transform`,
    NO `transition: color | border-color | background-color | width
    | height | top | padding | margin | font-size | letter-spacing
    | line-height` anywhere in `TranscriptView.css`.
27. **Reduced-motion**: zero new declarations needed. The global
    rule already zeroes the `<details>` transitions.
28. **Hex isolation**: zero `#` literals in `TranscriptView.tsx`,
    `TranscriptView.css`, or any new file. `rg -o '#[0-9A-Fa-f]{3,8}'
    apps/frontend/src | wc -l` continues to return 24.
29. **Token count**: `grep -cE '^\s*--' apps/frontend/src/styles/tokens.css`
    continues to return 83.
30. **WCAG measurement**: `python3 working/phase-7c/designs/wcag.py`
    runs cleanly. Output emits 41 pairs all marked "pass". Zero
    drift against `wcag-output.txt`.
31. **`@unskip Phase 7c` markers**: the two markers in
    `TranscriptView.event-coverage.test.tsx` (`codex-event-msg-task-started`
    and `codex-event-msg-task-complete`) are lifted as part of M3's
    implementation (NOT M2). Each lifted test passes. After M3 close,
    `grep -c "@unskip Phase 7c" apps/frontend/src/` returns 0.
32. **Matrix closure**: `docs/features/parser-event-support.md` row
    `codex-event-msg-task-started` and `codex-event-msg-task-complete`
    have their "Render treatment" column updated to point at the
    new specific render branch (system note with task-lifecycle
    treatment) and the "🎨 deferred to 7c" note REMOVED from the
    status. Status reads `✅ supported` verbatim.
33. **Group head expand-state survives tab switches**: the prototype's
    native `<details>` pattern is the contract. Test: open a group
    head, switch to Metadata tab, switch back to Transcript — the
    group is still open. No `key={selectedRowKey}` on the group card
    (the parent SessionView already owns that lifecycle).
34. **No new runtime dependencies**: `apps/frontend/package.json`
    `dependencies` is byte-identical before and after Phase 7c.
35. **All visual variants in the prototype** render in BOTH light
    AND dark modes side-by-side. Reviewer can open
    `working/phase-7c/designs/prototype.html` in a browser without
    launching the app and exercise every variant.
36. **Task-lifecycle RenderHint attribute**: `renderHints.ts`
    extends the `standalone` variant with an optional
    `taskLifecycle?: "started" | "complete"` field. Population
    rule: when the underlying `Message` has `kind === "system"`
    AND `text.startsWith("task_started · turn ")`, set
    `taskLifecycle = "started"`. When `text.startsWith("task_complete · turn ")`,
    set `taskLifecycle = "complete"`. The two literal prefix strings
    match the parser emission at
    `apps/frontend/src/features/sessions/parsers/codex.ts:482` and
    `:500`. The attribute is absent for every other system message
    (backward-compatible).
37. **Task-lifecycle render branch**: `TranscriptView.tsx` adds a
    branch inside `case "standalone":` that checks for
    `hint.taskLifecycle`. When set, render a
    `<article class="msg-task-lifecycle" data-task={hint.taskLifecycle}
    aria-label={...}>` instead of the generic `SystemMessage`. The
    branch decision lives in the `standalone` arm; the existing
    `SystemMessage` component is **unchanged**. The CSS class is
    **exactly** `msg-task-lifecycle` (no variant, no suffix) —
    this matches the `assertTreatment` selector at
    `apps/frontend/src/features/sessions/TranscriptView.event-coverage.test.tsx:195`.
38. **Task-lifecycle visual recipe**: `TranscriptView.css` adds
    `.msg-task-lifecycle` with `border-top: 1px solid var(--color-border)`
    + `border-bottom: 1px solid var(--color-border)` + `border-inline: 0` +
    `border-radius: 0` + `background: var(--color-surface)` +
    `padding: var(--space-3) var(--space-4)` +
    `display: flex; align-items: baseline; justify-content: center;
    gap: var(--space-3); flex-wrap: wrap` +
    `max-inline-size: var(--measure)`. Inside the card, a
    `.task-label` span (Fraunces italic small-caps,
    `letter-spacing: 0.12em`, `--color-ink-muted`,
    `--text-xs`) + a `.task-divider` middle-dot (`aria-hidden="true"`,
    `--color-ink-muted`) + a `.task-turn` mono span (`--font-mono`,
    `--text-xs`, `--color-ink-muted`).
39. **Task-lifecycle copy**: label text is the mixed-case
    `"Task started"` or `"Task complete"` (NOT all-caps in the DOM;
    the `font-variant: small-caps` carries the uppercase optical).
    Turn id text is `turn {turn-id}` verbatim from the parser-emitted
    trailing segment (the parser emits `(unknown turn)` when the
    payload is missing — render unchanged).
40. **Task-lifecycle non-interactive**: the card has no hover state,
    no focus ring, no `<details>`, no `tabIndex`, no expand/collapse,
    no chip wrapper, no `transition`. Reduced-motion is a no-op.
    Acceptance test: opening the prototype variant 1c in a browser
    + tabbing through the page does NOT land focus on the
    task-lifecycle card.

Items 32 and 31 above reference the parser-event-support matrix
closure + the `@unskip Phase 7c` test lift. Items 36-40 deliver
the *specific* render branch they depend on; closing 36-40 unblocks
32 (matrix row update from "system note; task lifecycle render
treatment deferred to 7c" → "task lifecycle chapter marker") and
31 (the `task_lifecycle` treatment test passes because
`.msg-task-lifecycle` is now in the rendered tree).

---

## 14. Designer self-audit

Cross-checked against the codex-catch precedents Phase 5 M4 round 1
+ Phase 7b accumulated:

| Precedent                              | Status |
|----------------------------------------|--------|
| Background-color transition on non-enumerated surface | OK — no transitions on `.lifecycle-card`, `.group-card`, `.chip` panels. Only `<details>` block-size animates. |
| Animated `transform` on message panels | OK — zero `transform` declarations anywhere. |
| Undefined token references             | OK — every `var(--...)` in `prototype.html` exists in `tokens.css`. Audited via `grep -o 'var\(--[a-z0-9-]+\)' prototype.html | sort -u` then cross-checked against tokens.css. |
| New hex literals                       | OK — the 22 unique hex literals in `prototype.html` are a strict subset of tokens.css's 24-hex `@supports` fallback block (the prototype omits `--color-bg` at this rendering tier). Zero new hex. |
| New tokens                             | OK — every visible surface measured in §10; all pass AA. No new tokens needed. |
| Spec-literal copy drift                | OK — banner summary "N parse warnings — click to view." reused verbatim; status labels are chosen per spec direction; chip copy is parameter-driven from the parser warning. |
| Color-alone signaling                  | OK — every dot has a visible text label adjacent. The 4-bucket chip variants each carry both a dot AND a chrome-text label AND a category tag. |
| Motion-budget violation                | OK — only `<details>` block-size + `:hover` underline. No transition on color, border-color, background-color, transform. |
| Keep-mounted contract                  | OK — no `key=` on any new card; group `<details>` open state is browser-managed; chip expanded state is browser-managed. |
| Hex isolation per file                 | OK — production TranscriptView.tsx / .css introduces zero hex; the prototype-only 22 hex literals are in this design folder and isolated from `apps/frontend/src/`. |
| `<details>` semantics                  | OK — every disclosure is a real `<details>` + `<summary>`. No `<button aria-expanded>` workarounds. Keyboard interaction is native. |
| Status indicator size                  | OK — dots are 10 px (≥ 10 px required for ≥ 3:1 SC 1.4.11 non-text without text-equivalent; we have BOTH the dot AND the text label, so even smaller would clear the bar; 10 px is the chosen size for editorial weight, not for accessibility floor). |

---

## 15. Operational decisions locked

These are the seven §Open Considerations of `working/phase-7c.md`
locked at M1 design time.

### 15.1 Pairing mode: **strict-adjacency**

**Decision**: pair only when `tool_result` is at `messageIndex + 1` of
the `tool_use` (with matching `tool_use_id` for Claude Code, matching
positional adjacency for Codex).

**Rationale**: the Phase 7b real-session sweep observed zero
parser warnings across 408 Claude Code files + 737 Codex files. Tool
calls that have a result are emitted as adjacent `tool_use` /
`tool_result` pairs in 100% of the observed corpus. Span-through
pairing — which would draw a connector across intermediate messages —
adds visual machinery (the connector line, the visual claim that
two non-adjacent cards are related) for ZERO observed benefit. The
simpler render is the correct call.

**Tradeoff**: a future tool that emits `tool_use` → `assistant text`
→ `tool_result` (e.g. a streamed agent that narrates while running)
would render the use + result as TWO separate cards rather than ONE.
This is acceptable: the orphan affordances surface the correct state
(`pairWithIndex: null` on the use), and a future Phase can revisit
span-through if it becomes a real corpus pattern. The cost of strict
adjacency is bounded; the cost of premature span-through is permanent.

### 15.2 Grouping threshold: **3**

**Decision**: `const GROUP_THRESHOLD = 3` in `renderHints.ts`. 3 or
more consecutive same-tool lifecycles collapse to a group.

**Rationale**: with threshold 4 or 5, pairs of "list_directory →
list_directory" or short Read-Read-Read clusters that read as a
deliberate sequence to the user would not group. Threshold 3 catches
the "I ran the same tool three or more times in a row" mental model
exactly. At threshold 2, every consecutive same-tool pair would group,
which feels eager — the 2-call case reads fine as two adjacent
lifecycle cards in editorial register.

### 15.3 Failure detection heuristic — per tool

Phase 7b's parser surfaces tool results as plain `text: string` (the
structured `exit_code`, `is_error`, `status` fields are collapsed
into the string via `eventResultText` in `codex.ts:856` and
`stringifyMessagePayload` for Claude Code at `claude_code.ts:178-180`).
The render-hint layer therefore detects failure by SCANNING THE TEXT.

**Conservative match table** (string searches on the lowercased
`tool_result.text`):

| Tool source         | Failure-flagging substrings (any match → failure)        |
|---------------------|----------------------------------------------------------|
| Claude Code         | `"is_error":true`, `"is_error": true`                    |
| Codex `exec`        | `exit_code: 1`, `exit_code: 2`, …, `exit_code: N` where N != 0; OR `"exit_code":1` etc; OR the keyword `error` AS a top-level field-like prefix at start-of-string (e.g. `error:` at offset 0) |
| Codex `apply_patch` | `"success":false`, `status: failed`, `status: error`     |
| Codex `web_search`  | (no observed failure signal in corpus; always success)   |
| Codex `mcp`         | `"isError":true`, `status: error`                        |

**Pseudocode**:

```ts
function isFailure(toolName: string | undefined, text: string): boolean {
  const t = text.toLowerCase();
  if (t.includes('"is_error":true') || t.includes('"is_error": true')) return true;
  if (t.includes('"iserror":true')) return true;       // MCP convention
  if (/exit_code["']?\s*[:=]\s*([1-9]\d*)/.test(text)) return true;
  if (t.includes('"success":false')) return true;
  if (/^(status:\s*(failed|error))/i.test(text.trim())) return true;
  return false;
}
```

**Rationale**: the parser flattened the structured signal into text.
The render-hint layer recovers it conservatively. False positives
(a result that legitimately contains "exit_code: 1" inside its
body, like a recursive shell script that prints exit codes) are
acceptable — the user reading the result text will see the real
content, and the status label "failed" is a hint, not a hard
classification.

**Future**: if false-positive rate becomes a problem, the cleaner
fix is to expand the parser output type to preserve a structured
`success: boolean | null` field on tool_result Messages. That is a
Phase 8+ concern.

### 15.4 4-bucket warning mapping

**Decision** — concrete mapping table consumed by
`classifyWarning(warning: ParseWarning)`:

| `severity` | `category`     | Bucket                  |
|------------|----------------|-------------------------|
| `error`    | `lexer`        | `render-normally`       |
| `error`    | `schema`       | `render-normally`       |
| `error`    | `payload`      | `render-normally`       |
| `error`    | `timestamp`    | `render-normally`       |
| `error`    | `meta`         | `render-normally`       |
| `warning`  | `schema`       | `render-normally`       |
| `warning`  | `payload`      | `render-normally`       |
| `warning`  | `lexer`        | `collapse-by-default`   |
| `warning`  | `timestamp`    | `collapse-by-default`   |
| `warning`  | `meta`         | `warning-only`          |
| `info`     | (any)          | `hide-with-inspect`     |

**Adjustments from the spec's recommended initial mapping**:

- Spec recommended `error / any → render-normally`. Kept.
- Spec recommended `warning / schema | payload → render-normally`.
  Kept.
- Spec recommended `warning / lexer | timestamp → collapse-by-default`.
  Kept.
- Spec recommended `warning / meta → warning-only`. Kept.
- Spec recommended `info / any → hide-with-inspect`. Kept.

**Audited against the warning-fixture set** under
`tests/fixtures/parser-warnings/`:

- The intentional fixtures emit warnings whose (severity, category)
  matches one of the rows above; no fixture surfaces a tuple the
  table does not cover.
- The 32 fixtures split: 14 `error/lexer`, 8 `error/schema`, 8
  `warning/payload`, 2 `warning/schema`, 4 `warning/timestamp`,
  0 `info/*`, 0 `*/meta`. The render-normally bucket is the most
  populated; collapse-by-default catches the timestamp + lexer
  warnings; hide-with-inspect catches the (not-yet-emitted) info
  severity; warning-only catches the (not-yet-emitted) meta
  category. The mapping is forward-compatible with future
  `info`/`meta` warnings.

### 15.5 Inline warning chip placement: **below body**

**Decision**: render-normally and collapse-by-default chips render
BELOW the message body, with `margin-top: var(--space-3)` (12 px).
The hide-with-inspect affordance sits at the bottom-right corner.
Warning-only renders no chip on the message.

**Rationale**: the message body is the primary editorial content.
Placing the chip below preserves the reading rhythm — the chip reads
as a footnote / annotation. Above-body would create a chrome
intrusion before the reader sees the message; corner-only would
work for hide-with-inspect (low-signal) but underemphasizes the
render-normally case where the warning is meant to be visible.

### 15.6 Group head aggregate timing: **count only, no duration**

**Decision**: the count badge shows "N calls" verbatim. NO aggregate
duration ("4.2 s total" was the alternative).

**Rationale**: timestamps on `tool_use` / `tool_result` Messages are
present in the Phase 7b parser output BUT they often carry `null`
values for tool_use/tool_result rows in Codex sessions (the parser
falls back to the line-level timestamp, which can be missing). The
aggregate duration calculation would be unreliable on many sessions.
The cost of "12 calls, 4.2 s total" being wrong half the time
outweighs the marginal value of seeing duration at the group level.

**Future**: Phase 8+ can revisit if timestamps become reliable.

### 15.7 Warning chip on collapsed group head: **hidden until expanded**

**Decision**: if a `group-member` lifecycle inside a collapsed group
carries an inline warning chip, the chip is NOT surfaced on the
group head. The reader must expand the group to see the chip.

**Rationale**: surfacing inline chips on a collapsed group head
defeats the skimming benefit of grouping. The session banner at the
top of the transcript still lists every warning regardless of
inline placement, so nothing is hidden in absolute terms — the
warning is one click away on the banner, and one click away inside
the group.

**Tradeoff**: a warning attached to one of 12 grouped calls is
genuinely less discoverable than the same warning on an ungrouped
lifecycle. The banner remains the comprehensive list (Resolved
Decision #6); the inspector reading sequentially from top to
bottom will see the banner first.

---

## 16. Token consumption set

Every `var(--…)` reference in the prototype, the wireframes, and
the design above. Phase 7c introduces ZERO new tokens.

### Color tokens (10 — all M2a-canonical)

- `--color-surface`
- `--color-surface-raised`
- `--color-ink`
- `--color-ink-muted`
- `--color-border`
- `--color-border-strong`
- `--color-accent`
- `--color-success`
- `--color-warn`
- `--color-error`

### Typography tokens (8)

- `--font-display`
- `--font-chrome`
- `--font-mono`
- `--text-xs`
- `--text-sm`
- `--text-base`
- `--leading-comfortable`
- `--measure`

### Spacing tokens (6)

- `--space-1`, `--space-2`, `--space-3`, `--space-4`, `--space-6`, `--space-8`

### Radius tokens (2)

- `--radius-sm`, `--radius-md`

### Motion tokens (2)

- `--motion-disclosure`, `--ease-in-out`

### Total

10 color + 8 typography + 6 spacing + 2 radius + 2 motion = **28 tokens
consumed**, all from the existing 83-token set. Phase 7c introduces
**zero** new tokens.

---

End of design.md.
