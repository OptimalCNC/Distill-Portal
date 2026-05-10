# M4 — TranscriptView (Phase 5 / Milestone 4)

Design artifact for **Phase 5 / Milestone 4 / TranscriptView**.
Spec frozen at `working/phase-5.md` @ `05467ad` on `main`.
Implementation predecessors: M1a closed at `a59b3f6`; M1b at `e8d80c5`; M2a at `c1602e5`; M2b at `6068d6f`; M3a at `959becb`; M3b at `6563495`.
Designer: UI/UX subagent dispatched 2026-05-10.

This is a **reference artifact**. The developer subagent re-implements
against the production stack (Bun + Vite + React + TS + per-component
sibling CSS). Nothing in this folder ships to `apps/frontend/`; the
prototype's hex-fallback literals do not contaminate the
`apps/frontend/src/` audit count.

---

## 1. Brief

**M4 is the chunk where the right pane finally speaks.** M2a landed
the language (Fraunces, oklch ramp, motion tokens, noise overlay).
M2b landed the chrome (tab strip + minimal header + Metadata + Raw +
two placeholders). M3a / M3b landed the silent machinery (parsers,
useParsedSession, cacheEpoch). M4 is the chunk where parsed messages
become readable text on the screen.

The Transcript tab is the **default landing surface from M4 onward**
(per Resolved Decision #11): on every fresh selection, the user lands
here unless they were on a different tab when the previous selection
finished. So this surface carries the first-impression weight for
every session click. It must read as quiet, finished, editorial — not
chatty, not chunky, not loud. Six restraints carry the weight:

1. **Ink-on-paper rhythm.** Reading content lives at 70ch with
   comfortable leading. Messages stack vertically with a
   three-magnitude rhythm: 16 px default between any two adjacent
   messages, 24 px override between adjacent same-kind messages
   (user→user, assistant→assistant, etc.), and 32 px around chapter
   breaks (boundary messages). The scroll surface reads like a printed
   transcript, not a chat log.

2. **One tint, used surgically.** User messages carry a 5 % accent
   tint over the surface (mirrors the selected-row recipe — same
   recipe, different surface). Assistant messages sit on the bare
   warm-paper surface. The tint differential IS the user/assistant
   discrimination. No avatars. No icons. No labelled rails.

3. **The chapter break as page furniture.** Boundary messages
   render as a full-width 1 px hairline with a centered Fraunces
   italic small-caps label ("SESSION RESUMED" / "CONVERSATION
   COMPACTED"). 32 px breathing on either side. This is signature
   detail #1 from §Design Language; M4 is the chunk that lands it
   first (M5's Skim view will reuse the recipe verbatim).

4. **Banners that whisper, not shout.** The truncation banner
   carries a 3 px warn stripe on the inline-start edge plus an 8 %
   warn-tinted background. It does NOT carry an icon, an emoji, or a
   close button. The parse-warnings banner is a `<details>` element
   that disappears entirely when dismissed; warnings re-arrive on
   next session selection per spec.

5. **Tools fold quietly.** `tool_use` and oversized `tool_result`
   messages collapse behind native `<details>` disclosures with the
   spec's exact summary copy ("Arguments", "Expand (N more bytes)").
   The `<pre>` blocks sit on `--color-surface-raised` so they read
   as machinery — distinct from the body prose without being loud.

6. **Timestamps as marginalia.** The relative-time label is the
   visible affordance; the absolute ISO is the `dateTime` attribute
   plus the `title` hover tooltip. Null timestamps render as a
   single em-dash. Timestamps NEVER appear on boundary messages —
   the chapter break is editorial, not chronological.

The aesthetic vision: a returning user opens a session, sees the
right pane fade in, and reads the conversation the way they would
read a printed memo. The left rail of subtle accent tint marks user
turns. Tools collapse inside disclosures — present but not
demanding. The chapter break, when it appears, slows the eye for a
breath. Banners advise without interrupting. There is no chrome
between the user and the words.

### 1.1 What M4 ships

- TranscriptView: chronological message list with per-kind rendering
  for all 7 MessageKinds (`user`, `assistant`, `tool_use`,
  `tool_result`, `system`, `boundary`, `unknown`).
- Truncation banner (top-of-pane, warn stripe, opacity entrance).
- Parse-warnings banner (top-of-pane, dismissible `<details>`).
- Long-tool_result collapse (first 2 KB visible, rest behind `<details>`).
- All five non-success state branches (idle, no_raw, loading, error,
  empty-stream).
- Code-fenced segment detection at render time (triple-backtick →
  `<pre>`, single-backtick → `<code>`).
- `DEFAULT_TAB_ON_SELECTION` shifts from `"metadata"` to `"transcript"`
  in `SessionView.tsx` (one-line edit + one test update).

### 1.2 What M4 does NOT do

- It does NOT introduce new tokens. The 83-token tokens.css set is
  reused verbatim. If implementation finds itself reaching for a new
  token, it pauses and reuses; if a WCAG pair fails with all
  available tokens, it escalates to coordinator before adding.
- It does NOT introduce new motion authorizations beyond what the
  spec table at `working/phase-5.md:84-95` already permits. The
  truncation banner's opacity entrance is the row-9 authorization;
  the disclosure animations are the row-3 authorization. Nothing
  else animates.
- It does NOT touch the Skim placeholder. M5 will replace it.
- It does NOT touch the Raw or Metadata tabs. M2b's wiring stands.
- It does NOT introduce search-within-transcript, annotations,
  highlights, summary generation, or LLM calls. All deferred to
  Phase 6+.

---

## 2. Component tree

The TranscriptView tree is a single state-discriminator at the top
followed by a flat per-kind render. No nested feature components, no
context, no hooks beyond the one `useParsedSession` call already
contracted by M3b.

```text
<TranscriptView row={row} now={now}>
  ├── (state === "idle") → <p class="transcript-empty">…</p>
  ├── (state === "no_raw") → <p class="transcript-not-imported">…</p>
  ├── (state === "loading") → <p class="transcript-loading">…</p>
  ├── (state === "error") → <p class="transcript-error">…</p>
  │                          + <button class="transcript-retry">Retry</button>
  └── (state === "success" | "truncated")
       └── <TranscriptBody parsed={…} now={…} truncated={…}>
            ├── (truncated) → <TruncationBanner />
            ├── (warnings.length > 0 && !dismissed) → <ParseWarningsBanner />
            └── <ol class="transcript-stream">
                 ├── (messages.length === 0) → <li class="transcript-empty-stream">…</li>
                 └── messages.map(msg => <MessageRow msg={msg} now={now} />)
                      ├── kind="user"        → <UserMessage />
                      ├── kind="assistant"   → <AssistantMessage />
                      ├── kind="tool_use"    → <ToolUseMessage />
                      ├── kind="tool_result" → <ToolResultMessage />
                      ├── kind="system"      → <SystemMessage />
                      ├── kind="boundary"    → <BoundaryMessage />
                      └── kind="unknown"     → <UnknownMessage />
```

### 2.1 Per-kind component shells (selectors + DOM)

| Kind          | DOM shell                                                                                                       | Selector(s)                                                |
|---------------|-----------------------------------------------------------------------------------------------------------------|------------------------------------------------------------|
| `user`        | `<article class="msg msg-user"><header class="msg-attr">User · <time>{rel}</time></header><div class="msg-body">…</div></article>` | `.msg.msg-user`, `.msg-attr`, `.msg-body`                  |
| `assistant`   | identical to `user` with `.msg-assistant` modifier                                                              | `.msg.msg-assistant`                                       |
| `tool_use`    | `<article class="msg msg-tool-use"><header class="msg-tool-head">Tool · <span class="msg-tool-name">{name}</span></header><details class="msg-tool-disclosure"><summary>Arguments</summary><pre class="msg-tool-pre">{text}</pre></details></article>` | `.msg-tool-use`, `.msg-tool-head`, `.msg-tool-name`, `.msg-tool-disclosure`, `.msg-tool-pre` |
| `tool_result` | `<article class="msg msg-tool-result"><header class="msg-tool-head">Tool result · <span class="msg-tool-name">{name}</span></header><pre class="msg-tool-pre msg-tool-result-head">{firstChunk}</pre>{overflow ? <details class="msg-tool-disclosure msg-tool-overflow"><summary>Expand ({Nmore} more bytes)</summary><pre class="msg-tool-pre msg-tool-result-tail">{tail}</pre></details> : null}</article>` | `.msg-tool-result`, `.msg-tool-result-head`, `.msg-tool-result-tail`, `.msg-tool-overflow` |
| `system`      | `<p class="msg msg-system"><span class="msg-system-glyph" aria-hidden="true">system ·</span> {text}</p>`        | `.msg-system`, `.msg-system-glyph`                         |
| `boundary`    | `<li class="msg msg-boundary" role="separator" aria-orientation="horizontal"><span aria-hidden="true" class="msg-boundary-rule msg-boundary-rule-start"></span><span class="msg-boundary-label">{LABEL}</span><span aria-hidden="true" class="msg-boundary-rule msg-boundary-rule-end"></span></li>` | `.msg-boundary`, `.msg-boundary-rule`, `.msg-boundary-label` |
| `unknown`     | `<p class="msg msg-unknown">Unrecognized line: {text.slice(0, 80)}…</p>`                                        | `.msg-unknown`                                             |

### 2.2 Banners and stream wrappers

| Element                    | DOM                                                                                                                           | Selector(s)                                                |
|----------------------------|-------------------------------------------------------------------------------------------------------------------------------|------------------------------------------------------------|
| Transcript body wrapper    | `<section class="transcript-body" aria-label="Session transcript">…</section>`                                                | `.transcript-body`                                          |
| Truncation banner          | `<div class="transcript-banner transcript-banner-truncation" role="status">…</div>`                                          | `.transcript-banner`, `.transcript-banner-truncation`      |
| Parse-warnings banner      | `<details class="transcript-banner transcript-banner-warnings"><summary>…</summary><ul>…</ul><button>Dismiss</button></details>` | `.transcript-banner-warnings`, `.transcript-banner-dismiss` |
| Stream container           | `<ol class="transcript-stream" role="list">…</ol>`                                                                            | `.transcript-stream`                                        |

The `<ol>` choice is intentional: messages are an ordered chronological
sequence, screen readers announce a count, and the implicit
`role="list"` is reaffirmed for tools that strip `list-style: none`.

### 2.3 The keep-mounted contract

TranscriptView's React subtree carries **no `key=` on its root**. Per
M2b's Resolved Decision #12 (spec lines 650-658), tab switches must
NOT remount the panel content. The only natural state-reset point is
a `selectedRowKey` change, which is handled at the SessionView layer
via `<SessionView key={selectedRowKey}>`.

Component-local state that persists across tab switches:

- `warningsBannerDismissed` (`useState<boolean>`).
- Native `<details>` open/closed state (browser-managed; survives
  reparenting because the element instance is stable).
- Scroll position (browser-managed; survives `display: none` toggles).

Defensive belt-and-suspenders:

```tsx
useEffect(() => setDismissed(false), [row.rowKey]);
```

This `useEffect` resets the dismissed banner when the row changes,
even though the parent's `key={selectedRowKey}` already destroys and
recreates the component on selection change. The defensive reset
matches the SessionView pattern at `SessionView.tsx:223-226`.

The only place a React `key=` is used inside TranscriptView is on
`<MessageRow key={msg.messageIndex} />` — that's content keying, not
tab keying, and is required for stable React reconciliation.

---

## 3. Per-kind visual recipe

Each section below specifies one MessageKind. Every rule is anchored
to a spec line range so a future codex round can verify the recipe
against the source-of-truth.

### 3.1 `user` — accent-tinted reading panel

Spec anchor: `working/phase-5.md:705`.

> "panel with attribution row ('User · {relativeTime}', small caps,
> `--color-ink-muted`, `--text-xs`), body in `--color-ink`. Background
> `color-mix(in srgb, var(--color-accent) 5%, var(--color-surface))`
> (mirrors selected-row recipe). Code-fenced segments render as inline
> `<code>` (single-line) or `<pre>` (multi-line) at
> `--color-surface-raised` with `--font-mono`."

**Container.** `<article>` with class `msg msg-user`. Background
`color-mix(in srgb, var(--color-accent) 5%, var(--color-surface))`.
Padding `var(--space-4) var(--space-6)` (16 px / 24 px). Border-radius
`var(--radius-md)`. Max-inline-size `var(--measure)` (70ch). NO border;
the tint differential carries the discrimination.

**Attribution row.** `<header class="msg-attr">`. `--font-chrome
--text-xs --color-ink-muted`. `text-transform: uppercase`. `letter-spacing:
0.06em`. Layout flex with `gap: var(--space-2)`. Composition:
`User · <time dateTime="…" title="…">{relativeTime}</time>`. The
middle dot is U+00B7 plain-text Unicode — confirmed in the
`--font-chrome` glyph subset (system sans always has it).

**Body.** `<div class="msg-body">`. `--font-chrome --text-base
--leading-comfortable --color-ink`. White-space `pre-wrap` so embedded
newlines preserve. Inline `<code>` segments: `--font-mono --text-sm`,
background `--color-surface-raised`, padding `0 var(--space-1)`,
border-radius `var(--radius-sm)`. Code-block `<pre>` segments: same
background, padding `var(--space-3) var(--space-4)`, margin
`var(--space-3) 0`, border-radius `var(--radius-sm)`, `overflow-x:
auto`, `--font-mono --text-sm`.

**Vertical rhythm.** See §4.

**WCAG anchor.** Pair T01 in colors.md — `--color-ink` over `color-mix
(--color-accent 5%, --color-surface)`. Light 16.42:1. Dark 14.92:1.

### 3.2 `assistant` — bare reading panel

Spec anchor: `working/phase-5.md:706`.

> "panel with attribution row ('Assistant · {relativeTime}'), body in
> `--color-ink`. Background `--color-surface` (default). Visually
> distinct from user via the tint differential — this differential
> MUST pass WCAG AA against `--color-ink` in both light and dark
> modes (M4 measurement gate)."

Identical structure to `user` with two changes:

1. Class `msg msg-assistant`.
2. Background `var(--color-surface)` (no accent tint).

The user/assistant distinction lives entirely in the background tint.
The 5 % accent tint vs. bare surface differential is approximately
**ΔL ≈ 1.5** in oklch terms — small enough to read as restful rather
than alternating, large enough that an attentive reader can scan
turn-taking without reading the attribution row. WCAG holds for both
backgrounds: pair T01 (16.42:1 / 14.92:1) and T02 (17.10:1 / 15.52:1)
both pass AAA.

### 3.3 `tool_use` — disclosure-collapsed argument block

Spec anchor: `working/phase-5.md:707`.

> "monospace block. Header line 'Tool · {toolName}' in `--font-chrome`
> `--text-xs` `--color-ink-muted`; body is a collapsible `<details>`
> summary 'Arguments' + `<pre>` of `JSON.stringify(input, null, 2)` in
> `--font-mono` `--text-sm`."

**Container.** `<article class="msg msg-tool-use">`. Background
`var(--color-surface)`. Border `1px solid var(--color-border)`.
Border-radius `var(--radius-sm)`. Padding `var(--space-3)
var(--space-4)`. Max-inline-size `var(--measure)`. The hairline
border distinguishes machinery from prose — tool messages read as
structural, not editorial.

**Header.** `<header class="msg-tool-head">`. `--font-chrome --text-xs
--color-ink-muted`. `text-transform: uppercase`. `letter-spacing: 0.06em`.
Composition: `Tool · <span class="msg-tool-name">{toolName}</span>`.
`.msg-tool-name` is `--font-mono --text-xs` (same size as the chrome
text but mono-flavored to mark the name as machine-supplied).

**Disclosure.** `<details class="msg-tool-disclosure">`. The
`<summary>` carries the literal text "Arguments" (spec line 707).
Summary typography: `--font-chrome --text-sm --color-ink`.
`cursor: pointer`. `padding: var(--space-1) 0`. The default browser
disclosure triangle is preserved (don't list-style:none — the triangle
is a quiet affordance and matches the editorial vocabulary).

**Pre body.** `<pre class="msg-tool-pre">`. Background
`var(--color-surface-raised)`. Padding `var(--space-3) var(--space-4)`.
Margin `var(--space-2) 0 0`. `--font-mono --text-sm --color-ink`.
`overflow-x: auto`. `white-space: pre`. The text is the parser's
already-stringified `msg.text` — NEVER re-stringified at render time
(see Q1 in m4-plan §5).

**Note on `msg.text`.** The Claude Code parser emits
`text: JSON.stringify(input, null, 2)` for `tool_use`. The Codex
parser emits `text: JSON.stringify(payload.arguments)` (or per-event
shape). M4 trusts the parser-prepared string and renders it verbatim.

### 3.4 `tool_result` — head + collapsible tail

Spec anchor: `working/phase-5.md:708`.

> "header 'Tool result · {toolName}' identical typography to
> `tool_use`. First 2 KB of body rendered; rest behind a quiet 'Expand
> ({N more bytes})' text-link if larger. `<details>` element wraps
> the overflow."

**Container.** Same as `tool_use` but `class="msg msg-tool-result"`.

**Header.** Same typography as `tool_use` header. Composition:
`Tool result · <span class="msg-tool-name">{toolName}</span>`.

**Head pre.** `<pre class="msg-tool-pre msg-tool-result-head">{firstChunk}</pre>`.
`firstChunk` is the first 2 KB of `msg.text` (UTF-8 byte-counted),
walked back to a UTF-8 codepoint boundary. Always rendered (even if
under-threshold; the `<pre>` hosts the entire body when no overflow).

**Overflow disclosure.** Rendered only when `msg.bytes > 2048`.
`<details class="msg-tool-disclosure msg-tool-overflow">`. Summary:
literal "Expand ({Nmore} more bytes)" where `Nmore = msg.bytes - 2048`.
Summary typography: `--font-chrome --text-sm --color-accent` (the
accent here is a non-text-emphasis affordance — it reads as a quiet
text link). Padding `var(--space-2) 0`. The disclosure body is a
second `<pre class="msg-tool-pre msg-tool-result-tail">{tail}</pre>`
with no top margin so the tail flows visually-continuous with the
head.

**Threshold.** `TOOL_RESULT_OVERFLOW_BYTES = 2048` (declared in
`TranscriptView.tsx`; not exported; not a token). Per Q2 in m4-plan §5
the parser-computed `msg.bytes` is the discriminator, not
`msg.text.length`.

**WCAG anchors.** Pairs T06, T07, T14, T15, T16 in colors.md.

### 3.5 `system` — single muted line, no chrome

Spec anchor: `working/phase-5.md:709`.

> "single line in `--color-ink-muted` `--text-sm`, prefixed with a
> small `system ·` label. No panel chrome."

**Container.** `<p class="msg msg-system">`. NO background, NO
border, NO padding (beyond the body inset that comes from the wrapping
`<ol>`). `--font-chrome --text-sm --color-ink-muted`.
`max-inline-size: var(--measure)`.

**Glyph.** `<span class="msg-system-glyph" aria-hidden="true">system ·</span>`.
`--font-chrome --text-xs --color-ink-muted`. `text-transform: uppercase`.
`letter-spacing: 0.06em`. The `aria-hidden="true"` means screen readers
don't read the dot; assistive tech announces the message body
directly.

**Body.** Inline-flow text after the glyph.

### 3.6 `boundary` — chapter break (signature detail #1)

Spec anchor: `working/phase-5.md:710` + `working/phase-5.md:66`.

> Spec line 710: "full-width 1 px hairline at `--color-border-strong`
> with a centered label in `--font-display` italic small-caps
> `--text-sm` `--color-ink-muted`. Copy: 'SESSION RESUMED'
> (boundarySubtype === 'session_resumed') or 'CONVERSATION COMPACTED'
> (boundarySubtype === 'compacted'). Same chapter-break treatment as
> Skim's boundary blocks (signature detail #1) — verified at M4 close.
> NEVER merged with neighbors."

> Spec line 66: "Skim view `boundary` blocks render as a full-width
> 1 px hairline with a centered small-caps Fraunces italic label
> ('SESSION RESUMED' / 'CONVERSATION COMPACTED'). 32 px vertical
> breathing room above + below. Reads like a chapter break in a
> printed book — reinforces the archive metaphor without a single
> icon."

**Container.** `<li class="msg msg-boundary" role="separator"
aria-orientation="horizontal">`. The `<li>` itself carries
`role="separator"` (flat shape — no nested `<div>`); the `<ol>`
ancestor only accepts `<li>` children, so the boundary IS an `<li>`
that re-roles itself as a separator. CSS Grid with three columns
`1fr auto 1fr`. Column gap `var(--space-4)`. Align-items `center`.
Margin-block `var(--space-8)` (32 px above + below — the breathing).
Max-inline-size: full width of the stream container (NOT 70ch — the
chapter break extends rule-to-rule across the reading column).

**Rules.** Two `<span aria-hidden="true">` elements with classes
`msg-boundary-rule-start` and `msg-boundary-rule-end`. Each carries
`block-size: 1px`, `inline-size: 100%`, `background:
var(--color-border-strong)`. The `1fr 1fr` grid expansion gives them
identical visual length.

**Label.** `<span class="msg-boundary-label">`. `--font-display
--text-sm --color-ink-muted`. `font-style: italic`.
`font-variant: small-caps`. `letter-spacing: 0.18em`. `padding: 0
var(--space-3)`. The label content is the literal "SESSION RESUMED"
or "CONVERSATION COMPACTED" string per `msg.boundarySubtype`.

**ARIA.** `role="separator"` + `aria-orientation="horizontal"` on
the wrapper. The label is in document order so screen readers
announce the boundary text along with the separator role.

**Critical:** boundary messages NEVER carry `<time>` elements (per
Q7 in m4-plan §5). The chapter break is editorial, not chronological.
The next user message after the boundary carries its own timestamp,
giving the chronological signal where the user expects it.

**M5 verification.** Skim's M5 boundary block must use this exact
recipe — same selector class, same Grid layout, same Fraunces label.
Any drift between M4's boundary and M5's boundary is a regression
against signature detail #1.

### 3.7 `unknown` — fallback line

Spec anchor: `working/phase-5.md:711`.

> "muted single line 'Unrecognized line: {first 80 chars}…' in
> `--font-mono` `--text-xs` — fallback for unparseable shapes."

**Container.** `<p class="msg msg-unknown">`. NO background, NO
border. `--font-mono --text-xs --color-ink-muted`. `font-style: italic`.
`max-inline-size: var(--measure)`. `word-break: break-all`.

**Composition.** Literal "Unrecognized line: " prefix in chrome font,
then `msg.text.slice(0, 80)` in mono, then (conditionally) a single
ellipsis character U+2026 (NOT three dots). The prefix fixed at chrome
to read as operator commentary; the slice in mono to read as raw
payload.

**Ellipsis rule (IMPORTANT-4 resolution).** Spec line 711 says
"Unrecognized line: {first 80 chars}…". The trailing ellipsis is
appended by the renderer **only when the original text was actually
truncated** — i.e., only when the input length exceeds 80 chars.
Specifically:

- If `msg.text.length > 80`: slice to 80 chars THEN append U+2026
  ellipsis. Output is `{slice (≤ 80 chars)}…`.
- If `msg.text.length <= 80`: use `msg.text` as-is, NO trailing
  ellipsis. Output is `{msg.text}` verbatim.
- The U+2026 ellipsis character (`…`) is **appended by the
  renderer**, not part of the slice. If the original payload already
  contains a U+2026 at byte 75, slicing the first 80 chars preserves
  that embedded ellipsis, then the renderer appends ONE additional
  trailing U+2026, yielding `{slice including the embedded U+2026}…`
  (two ellipses visible — one inside the slice, one trailing).

```tsx
function unknownLine(text: string): string {
  if (text.length > 80) return text.slice(0, 80) + "…";
  return text;
}
```

Implementation note: the chrome/mono mix inside a single `<p>`
requires inner spans, e.g. `<span class="msg-unknown-prefix">Unrecognized
line:</span> <span class="msg-unknown-payload">{slice}…</span>` (where
the trailing `…` is conditional per the rule above). Both spans
inherit the muted color and italic style; the spans only re-declare
`font-family` to flip the typeface.

**Test obligation propagated to m4-plan.md §8** (developer-side; the
developer's `TranscriptView.test.tsx` should cover): payload longer
than 80 chars produces exactly one trailing ellipsis; payload shorter
than or equal to 80 chars has NO trailing ellipsis; payload that
already contains U+2026 at byte 75 produces "{slice including the
embedded U+2026}{single trailing U+2026}" (two ellipses visible).

---

## 4. Spacing rhythm

Spec anchor: `working/phase-5.md:701`.

> "Reading-content layout: max-inline-size 70ch, generous vertical
> rhythm (16 px between messages, 24 px between adjacent same-kind
> messages with a kind-change gap of 32 px)."

The rhythm has three magnitudes, each anchored to an existing token:

| Distance | Token              | Resolved | Used between                                                              |
|----------|--------------------|----------|---------------------------------------------------------------------------|
| 16 px    | `var(--space-4)`   | `1rem`   | DEFAULT — any two adjacent messages where no other override fires (e.g. user → assistant, assistant → tool_use) |
| 24 px    | `var(--space-6)`   | `1.5rem` | Same-kind override: adjacent same-kind messages (user → user, assistant → assistant, tool_use → tool_use, etc.) |
| 32 px    | `var(--space-8)`   | `2rem`   | Boundary breathing — above AND below every `.msg-boundary` (overrides both the 16 px default and the 24 px override) |

### 4.1 The CSS expression

The rhythm uses adjacent-sibling selectors on the wrapping `<ol>`:

```css
/* Default: 16 px between any two adjacent messages */
.transcript-stream > .msg + .msg {
  margin-top: var(--space-4);
}

/* 24 px between adjacent same-kind messages */
.transcript-stream > .msg-user      + .msg-user      { margin-top: var(--space-6); }
.transcript-stream > .msg-assistant + .msg-assistant { margin-top: var(--space-6); }
.transcript-stream > .msg-tool-use  + .msg-tool-use  { margin-top: var(--space-6); }
.transcript-stream > .msg-tool-result + .msg-tool-result { margin-top: var(--space-6); }
.transcript-stream > .msg-system    + .msg-system    { margin-top: var(--space-6); }

/* 32 px around boundary messages */
.transcript-stream > .msg-boundary,
.transcript-stream > .msg-boundary + .msg {
  margin-top: var(--space-8);
}
.transcript-stream > .msg + .msg-boundary {
  margin-top: var(--space-8);
}
```

The CSS implements a **three-magnitude rule** verbatim:

1. **16 px (default)** — every adjacent message pair, applied via
   `.msg + .msg { margin-top: var(--space-4); }`. This is the floor
   that fires for adjacent-different-kind pairs (e.g. user → assistant,
   assistant → tool_use, tool_result → assistant). NOT a "kind-change"
   rule — it is the default between any two messages where no other
   override fires.
2. **24 px (same-kind override)** — adjacent-sibling selectors per
   kind (`.msg-user + .msg-user`, `.msg-assistant + .msg-assistant`,
   `.msg-tool-use + .msg-tool-use`, etc.). These tighten same-kind
   stacks because they group editorially.
3. **32 px (boundary breathing)** — applied above AND below every
   `.msg-boundary`. This is the chapter-break breathing room; it
   overrides both the 16 px default and the 24 px same-kind rule.

**Final decision**: M4 ships this three-magnitude rule. Spec line 701's
"kind-change gap of 32 px" is interpreted as a ceiling that applies
specifically to **boundary** transitions (which ARE kind-changes by
construction — boundary is the only kind that triggers 32 px). The
16 px default IS the kind-change rhythm for non-boundary pairs; the
24 px override IS the same-kind rhythm. There is no separate
"kind-change = 32 px" rule for non-boundary adjacencies — that
reading would be inconsistent with the CSS the prototype ships.

The previous round-1 designer interpretation that "kind-change = 32 px
on every adjacent-different-kind pair" is REJECTED. Wireframes and
copy are aligned to the CSS in round 2 (BLOCKING-1 resolution).

### 4.2 Reading measure

Every text-bearing message panel carries `max-inline-size:
var(--measure)` (= 70ch). Tool messages (which contain `<pre>` blocks
with their own `overflow-x: auto`) also cap at 70ch — the `<pre>`
internal scroll handles long lines without forcing the panel wider.

The boundary message is the ONE exception: its grid expands to the
full inline-size of the `transcript-stream` container so the rules
visually reach edge-to-edge of the reading column. The reading column
itself is constrained to `var(--measure)` at the `.transcript-stream`
level.

### 4.3 First and last spacing

The `transcript-stream` wrapper carries `padding-block: var(--space-6)
0` (top inset only) so the first message is not flush against the
tab strip's hairline. No bottom inset — the panel's natural bottom
edge handles the cutoff. Banners (when present) sit ABOVE the stream's
top inset, with their own `margin-bottom: var(--space-6)` to separate
them from the first message.

---

## 5. Timestamp display

Spec anchor: `working/phase-5.md:713`.

> "Each message panel carries a timestamp display: relative time as
> visible label (`relativeTimeFrom(now, msg.timestamp)`), absolute ISO
> via `<time dateTime='…'>` and on `title=` hover. Timestamps with
> `null` value render as '—' (preserved from Phase 4 contract)."

### 5.1 The `<time>` element

```tsx
function MessageTime({ iso, now }: { iso: string | null; now: string }) {
  if (iso === null) {
    return <time>—</time>;
  }
  const rel = relativeTimeFrom(now, iso);
  return <time dateTime={iso} title={iso}>{rel}</time>;
}
```

- Visible text: the relative-time label (e.g. "3 minutes ago", "2
  days ago"). Computed via `relativeTimeFrom(now, iso)` which is
  already wired in Phase 4 / M2b.
- `dateTime={iso}` attribute: the absolute ISO 8601 string.
  Machine-readable for browser tooltips, copy-paste, screen readers,
  and search-engine indexing.
- `title={iso}` attribute: the absolute ISO string also surfaced on
  hover (browser default tooltip).
- Null: a single em-dash character (U+2014) inside a `<time>` with no
  `dateTime` attribute. Rendering still uses the `<time>` shell so
  the surrounding CSS (which targets `time` with the muted-italic
  rule) treats null timestamps consistently.

### 5.2 No timestamp on boundary messages

Per Q7 in m4-plan §5, boundary messages do NOT carry a `<time>`. The
chapter-break treatment is editorial. The user message that follows
the boundary carries its own timestamp, giving the chronological
signal where the user expects it.

### 5.3 Where timestamps appear

Timestamps render INSIDE the attribution row (`.msg-attr`) for
`user`, `assistant`, `tool_use`, `tool_result`. They do NOT render on
`system` (single-line muted prose; timestamp would clutter), `boundary`
(editorial), or `unknown` (fallback diagnostic; no useful chronology).

---

## 6. Truncation banner

Spec anchor: `working/phase-5.md:715`.

> "If `parsed.truncated`, a small banner at the top of the Transcript:
> 'Truncated at 5 MB — full payload not parsed. Use the **Open raw**
> anchor in the session header to inspect the full payload.' Banner
> styled with warning status color and a `--motion-base` opacity
> entrance."

### 6.1 Copy (verbatim from spec line 715)

> Truncated at 5 MB — full payload not parsed. Use the **Open raw**
> anchor in the session header to inspect the full payload.

The "Open raw" word is bolded text only — there is NO anchor element
embedded inside the banner. The banner copy is a **reference** to the
"Open raw" anchor that lives in the session header (see §6.1.1 below).

The banner copy is now spec-verbatim because §6.1.1 lands the
session-header anchor in the same M4 chunk; the dangling-reference
concern raised in round 1 (Q-DESIGN-5) is resolved.

```tsx
<div className="transcript-banner transcript-banner-truncation" role="status">
  Truncated at 5 MB — full payload not parsed. Use the <strong>Open raw</strong> anchor in the session header to inspect the full payload.
</div>
```

### 6.1.1 Session header expansion in M4 (BLOCKING-2 resolution)

Spec line 626 enumerates "Open raw" as a session-header element. M2b
shipped a minimal header without it (deferred). The truncation banner
copy at spec line 715 is load-bearing — it points users to a
session-header anchor that does NOT yet exist. Round-2 coordinator
resolution: M4 scope EXPANDS to include landing the "Open raw" anchor
in the session header.

**Where it lands.** `apps/frontend/src/features/sessions/SessionView.tsx`
header. The header currently renders title + tool badge + status pill
+ conflict badge from M2b; M4 appends "Open raw" to the right-side
action group, AFTER the conflict badge.

**Visibility rule.** Visible only when `row.storedSessionUid !== null`
(matches `SessionMetadata.tsx`'s "View raw" anchor visibility rule
from M2b). When the row is source-only (`storedSessionUid === null`),
the anchor is omitted entirely — it would 404 anyway, and the
truncation banner only fires for parsed sessions which by definition
have a stored UID.

**Anchor copy.** `Open raw` — verbatim per spec line 626. NOT "View
raw" (which is the Metadata-tab precedent); the spec uses "Open raw"
specifically for the header position to differentiate from the
Metadata tab's variant.

**Anchor URL.** `/api/v1/sessions/${row.storedSessionUid}/raw` via the
existing `RAW_SESSION_PATH` builder in `apps/frontend/src/lib/api.ts`.
Reuses the same path as Metadata's "View raw"; the difference is the
copy and the position, not the destination.

**Anchor attributes.** `target="_blank"` + `rel="noreferrer"` —
matches the Phase 4 pattern at `SessionMetadata.tsx`. No `download`
attribute (the user inspects the raw payload in a new tab; downloading
is opt-in via the browser's UI).

**Position.** Right-side action group of the session header, AFTER the
conflict badge. The order top-to-bottom (in the flex row): title (left
flex-grow), tool badge (left), then on the right: status pill →
conflict badge → "Open raw".

**Typography.** `--font-chrome --text-sm`. Color `--color-accent` (link
styling per the existing "View raw" precedent at `SessionMetadata.tsx`).
Hover: underline. Focus-visible: 2 px accent outline + 2 px offset.

**State variants.** Hidden when `state === "no_raw"` (anchor would 404
since `storedSessionUid` is null). Visible otherwise (`success`,
`truncated`, `loading`, `error`, `idle`). The anchor's position in the
header is structural — it does not jump around as state changes.

**Truncation banner relationship.** When `state === "truncated"` the
"Open raw" anchor in the header IS the destination the banner copy
points to. They co-render: banner in the transcript top, anchor in
the session header. The user follows the prose hint "Use the Open
raw anchor in the session header" → eye flies up to the header →
clicks the anchor → opens raw payload in new tab.

**Developer task at M4 implementation time** (documented here because
m4-plan.md is frozen for this design loop): the developer's modified
files list at m4-plan §3 must be expanded to include
`apps/frontend/src/features/sessions/SessionView.tsx` (for the header
anchor) and `apps/frontend/src/features/sessions/SessionView.test.tsx`
(for a regression test that asserts the anchor renders when
`storedSessionUid !== null` and is omitted when null). The CSS
modifications belong in `SessionView.css` (existing per-component
sibling). Reuse existing tokens; no new token additions for this
expansion.

### 6.2 Visual recipe

- **Container.** `<div class="transcript-banner transcript-banner-truncation"
  role="status">`. The `role="status"` makes screen readers announce
  the banner without interrupting; assistive tech treats it as a
  polite live region.
- **Background.** `color-mix(in srgb, var(--color-warn) 8%, var(--color-surface))`.
  A warm wash; reads as a soft warn tint without screaming.
- **Inline-start stripe.** `border-inline-start: 3px solid var(--color-warn)`.
  3 px is the SC 1.4.11 non-text bar; the warn color holds against
  surface (pair B02 in colors.md).
- **Padding.** `var(--space-3) var(--space-4)` (12 px / 16 px).
- **Border-radius.** `var(--radius-sm)`.
- **Typography.** `--font-chrome --text-sm --color-ink`. Body weight.
  `<strong>Open raw</strong>` carries `font-weight: 600` (the chrome
  bold weight).
- **Margin-bottom.** `var(--space-6)` (24 px) to separate from the
  warnings banner (if both present) or the first message.

### 6.3 Motion

- **Property.** `opacity` ONLY (NOT `background-color`, NOT `transform`).
- **Duration.** `var(--motion-base)` (120 ms).
- **Easing.** `var(--ease-out)`.
- **Trigger.** `parsed.truncated` becomes true → component mounts.
- **Implementation.** `animation: transcript-banner-fade
  var(--motion-base) var(--ease-out) both;` where:

  ```css
  @keyframes transcript-banner-fade {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
  ```

The `both` fill mode keeps opacity at 1 after the animation completes
(matches M2b's tab-fade-in pattern). Reduced-motion zeroes the
duration via the global rule.

### 6.4 What the banner does NOT do

- It does NOT carry an icon. The warm tint + the inline-start stripe
  + the prose are enough.
- It does NOT carry a close button. The truncation is a state of the
  parsed session; dismissing the banner without dismissing the
  underlying truth would be misleading. (Contrast with the
  parse-warnings banner, which IS dismissible because warnings are
  diagnostic noise.)
- It does NOT animate `background-color` or `transform`. Codex M2b
  r1 #2 caught a `background-color` transition on a non-enumerated
  surface; M4's banner uses opacity-only entrance to comply with the
  motion budget.

---

## 7. Parse-warnings banner

Spec anchor: `working/phase-5.md:717`.

> "If `parsed.warnings` is non-empty, a small dismissible banner: '{N}
> parse warnings — click to view.' Expanding reveals the warnings list
> with `line {lineOrdinal} · {reason}` in `--font-mono` `--text-xs`;
> the messages stream still renders (warnings are non-blocking).
> Dismissing the banner is component-local state (re-arrives on next
> session selection)."

### 7.1 Copy (verbatim from spec line 717)

- **Summary**: `{N} parse warnings — click to view.` for ALL N
  including N=1. The N=1 case reads grammatically odd ("1 parse
  warnings — click to view.") but ships verbatim per IMPORTANT-3
  resolution. The spec literal is the contract — paraphrasing the
  surface copy was the M3a r1 false-positive trigger; M4 deliberately
  ships the spec string byte-for-byte.

  ```jsx
  // JSDoc rationale (so the implementing developer doesn't "fix" the grammar):
  // The spec at working/phase-5.md:717 is treated as a literal string.
  // For N=1 this reads as "1 parse warnings — click to view." which is
  // grammatically odd in English but spec-precedent compliant. Codex
  // verified spec literals beat English grammar in M3a r1; do NOT swap
  // in a singular form. If editorial concerns arise, raise via Q-DESIGN
  // and re-resolve at coordinator level — do not unilaterally edit.
  <summary>{n} parse warnings — click to view.</summary>
  ```

  Trade-off documented: spec literal beats English grammar for
  codex-precedent compliance.

- **List items**: `line {lineOrdinal} · {reason}` per warning.
- **Dismiss button label**: `Dismiss`.

### 7.2 Element choice — native `<details>`

Per Q9 in m4-plan §5, the banner is a native `<details>` element.
Three reasons:

1. Native focus management (Enter/Space toggles; arrow keys move
   focus naturally).
2. The M2b `<details>` block-size animation exemption (spec line 88)
   already covers this surface — reusing the native element gets
   the smooth disclosure animation for free.
3. Matches `tool_use`'s "Arguments" disclosure and `tool_result`'s
   overflow disclosure — same vocabulary across the surface.

```tsx
<details
  className="transcript-banner transcript-banner-warnings"
  onToggle={(e) => /* optional analytics or future state */}
>
  <summary>{n} parse warnings — click to view.</summary>
  <ul className="transcript-warnings-list">
    {warnings.map((w) => (
      <li key={`${w.lineOrdinal}-${w.reason}`}>
        line {w.lineOrdinal} · {w.reason}
      </li>
    ))}
  </ul>
  <button
    type="button"
    className="transcript-banner-dismiss"
    onClick={onDismiss}
  >
    Dismiss
  </button>
</details>
```

### 7.3 Visual recipe

- **Container.** `<details class="transcript-banner transcript-banner-warnings">`.
- **Background.** `var(--color-surface-raised)`. NO accent tint, NO warn
  tint — warnings are diagnostic, not capacity. The raised surface
  marks them as machinery.
- **Border.** `1px solid var(--color-border)`.
- **Border-radius.** `var(--radius-sm)`.
- **Padding.** `var(--space-2) var(--space-3)` on the `<details>`
  shell. The `<summary>` carries its own padding (see below).
- **Margin-bottom.** `var(--space-6)` to separate from the stream.

- **Summary.**
  - `--font-chrome --text-sm --color-ink`.
  - Padding `var(--space-1) 0`.
  - `cursor: pointer`. Native disclosure marker preserved on the
    inline-start side via `list-style: revert` (Vite + happy-dom
    sometimes strip it; explicit revert keeps the affordance).

- **List.**
  - `<ul class="transcript-warnings-list">`.
  - `--font-mono --text-xs --color-ink-muted`.
  - Margin `var(--space-2) 0 var(--space-3)`.
  - Padding-inline-start `var(--space-4)`.
  - Each `<li>`: `padding-block: var(--space-1)`. `word-break: break-all`
    (warnings often quote raw record fragments).

- **Dismiss button.**
  - `<button class="transcript-banner-dismiss">`.
  - Quiet text-button: `appearance: none`, `background: transparent`,
    `border: 1px solid var(--color-border)`, `border-radius:
    var(--radius-sm)`, `padding: var(--space-1) var(--space-2)`,
    `--font-chrome --text-xs --color-ink`.
  - `:hover`: `border-color: var(--color-border-strong)`.
  - `:focus-visible`: `outline: 2px solid var(--color-accent);
    outline-offset: 2px`.

### 7.4 Dismissal semantics

Spec line 717: "Dismissing the banner is component-local state
(re-arrives on next session selection)."

- Click "Dismiss" → parent's `onDismiss` setter sets
  `warningsBannerDismissed = true`.
- On `selectedRowKey` change → defensive `useEffect` resets to `false`
  (the parent's `key={selectedRowKey}` already destroys the component,
  but the defensive belt is in place per m4-plan §6 catch #2).
- The banner re-arrives on the next session selection that has
  warnings. Per spec.

### 7.5 Motion

The disclosure animation is the M2b `<details>` block-size exemption
(spec line 88): 200 ms `--motion-disclosure` `--ease-in-out`. M4 adds
no new motion authorization; it inherits the global `interpolate-size:
allow-keywords` rule from `global.css`. If the rule is missing, the
disclosure snaps without animation — acceptable per spec line 124
fallback.

---

## 8. Boundary chapter-break (signature detail #1)

Already covered in §3.6. This section reiterates the cross-chunk
contract: the same recipe is shared with M5's Skim view boundary
block. Any drift is a regression.

### 8.1 Shared recipe specification

Both M4 and M5 must implement:

1. Wrapper element: `<div role="separator" aria-orientation="horizontal">`.
2. Class name `msg-boundary` (M4) / `skim-boundary` (M5). The
   visual rules can live in either feature CSS; the recipe must be
   byte-equivalent.
3. CSS Grid `1fr auto 1fr`, `align-items: center`, gap `var(--space-4)`.
4. Two `<span aria-hidden="true">` 1 px hairlines at
   `var(--color-border-strong)`.
5. One `<span>` label: `--font-display`, `--text-sm`,
   `--color-ink-muted`, italic, `font-variant: small-caps`,
   `letter-spacing: 0.18em`, padding `0 var(--space-3)`.
6. Margin-block `var(--space-8)` (32 px above + below).
7. Copy: `"SESSION RESUMED"` for `subtype === "session_resumed"`;
   `"CONVERSATION COMPACTED"` for `subtype === "compacted"`. The
   strings are uppercase in source, NOT relying on `text-transform`,
   because Fraunces' small-caps glyph set is exercised on uppercase
   input (the OpenType font feature handles the rest).

### 8.2 M5 deferral note

When M5 lands, the SkimView component will need a similar
`BoundaryBlock` sub-component. M5's developer should reuse the
selectors above (renamed `skim-boundary*`) AND consider extracting
both into a shared `<ChapterBreak>` component at
`apps/frontend/src/components/ChapterBreak.tsx`. M4 does NOT
preemptively extract; the component lives inline in TranscriptView
and SkimView until M5 confirms the byte-equivalence.

---

## 9. Long tool_result collapse

Spec anchor: `working/phase-5.md:708`.

### 9.1 Threshold

`TOOL_RESULT_OVERFLOW_BYTES = 2048` bytes. Discriminator:
`msg.bytes > 2048` (NOT `msg.text.length`; per Q2 in m4-plan §5).

### 9.2 Split-point algorithm

```ts
function splitToolResult(text: string): { head: string; tail: string | null } {
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  const all = enc.encode(text);
  if (all.length <= 2048) return { head: text, tail: null };
  // Walk back from byte 2048 to a UTF-8 codepoint boundary.
  // UTF-8 continuation bytes start with bits 10xxxxxx.
  let cut = 2048;
  while (cut > 0 && (all[cut] & 0xC0) === 0x80) cut--;
  const head = dec.decode(all.slice(0, cut));
  const tail = dec.decode(all.slice(cut));
  return { head, tail };
}
```

Test obligations (m4-plan §8):
- 2048-byte body: no overflow.
- 2049-byte body: overflow with 1-byte tail.
- Multi-byte UTF-8 (emoji, CJK) at the cut point: cut walks back to
  a clean codepoint boundary; head + tail concatenate to the original.

### 9.3 Disclosure

Wrapper: `<details class="msg-tool-disclosure msg-tool-overflow">`.
Summary: `Expand ({Nmore} more bytes)` where `Nmore = msg.bytes - 2048`.

The summary text is `--font-chrome --text-sm --color-accent`. This is
the M4 surface that consumes `--color-accent` as an emphasis
affordance (NOT a clickable hyperlink — the disclosure mechanism is
the affordance; the color reads as "yes, this is interactive").
Hover: `text-decoration: underline`.

### 9.4 Animation

Same as the parse-warnings disclosure: M2b `<details>` block-size
exemption inherited via global CSS.

---

## 10. Reading-content layout

### 10.1 Max-inline-size

The reading column carries `max-inline-size: var(--measure)` (= 70ch).
This applies to:

- `.msg-user`, `.msg-assistant`: the panel itself.
- `.msg-tool-use`, `.msg-tool-result`: the panel itself; the inner
  `<pre>` blocks have their own `overflow-x: auto`.
- `.msg-system`, `.msg-unknown`: the line block.
- The `transcript-stream` container itself ALSO carries
  `max-inline-size: var(--measure)` so messages flow within the
  reading column. The boundary message overrides this with `max-inline-size:
  none` and `inline-size: 100%` so the rules reach the column edges.

### 10.2 Centering vs. inline-start

The transcript stream sits flush to the panel's inline-start padding
— it does NOT center within the reading column. Editorial vocabulary:
left-aligned reading columns feel more like manuscripts than
centered-text marketing pages. Spec doesn't prescribe; designer
choice; flagged for reviewer trio in §13 Q-DESIGN-2.

Actually re-checking — the M2b `.session-pane` has padding `var(--space-8)
var(--space-6)` on the right pane, and the `.transcript-stream` is
inside that. Inside the stream we want messages to read as a column;
they should NOT be centered (which would float them away from the
inline-start edge). Inline-start alignment matches the metadata `<dl>`
pattern.

### 10.3 Vertical leading

All body text uses `--leading-comfortable` (1.55). Attribution rows
(small chrome text) use the default leading. The `<pre>` blocks use
`line-height: 1.4` (slightly tighter — mono is denser visually, and
1.55 over mono looks airy).

---

## 11. State variants

### 11.1 `idle` — no row selected

```tsx
<p className="transcript-empty">Select a session to read its transcript.</p>
```

This branch is unreachable in practice (TranscriptView only mounts
once a row is selected). The branch exists as a defensive total
function. Typography: `--font-chrome --text-sm --color-ink-muted
italic`.

### 11.2 `no_raw` — source-only row

Spec anchor: `working/phase-5.md:454` + `:671`.

> Spec line 454: source-only rows have not been imported.
> Spec line 671: "This session has not been imported yet — only the
> source-side metadata is available. Click Import in the action bar
> to fetch the raw payload."

```tsx
<p className="transcript-not-imported">
  This session has not been imported yet — only the source-side metadata is available. Click <strong>Import</strong> in the action bar to fetch the raw payload.
</p>
```

Typography: `--font-chrome --text-sm --color-ink-muted`. Italic prose.
Plus a quiet pointer to the Metadata tab: `<p>You can still review
the source-side details in the <strong>Metadata</strong> tab.</p>`.

### 11.3 `loading` — fetch in flight

Spec anchor: `working/phase-5.md:672`.

> "Centered text 'Reading session…' in `--color-ink-muted`. No spinner
> (the visual quietness fits the editorial aesthetic better than a
> spinner; long-load risk is bounded by the 5 MB cap)."

```tsx
<p className="transcript-loading">Reading session…</p>
```

Typography: `--font-chrome --text-sm --color-ink-muted italic`.
Centered (`text-align: center`). Padding `var(--space-8) 0`. The
ellipsis is U+2026 (single character).

### 11.4 `error` — fetch / parse failed

Spec anchor: `working/phase-5.md:673`.

> "'Could not load session: {error.message}.' Retry button is wired
> to the `retry()` function on the hook result."

```tsx
<>
  <p className="transcript-error">Could not load session: {state.error.message}.</p>
  <button type="button" className="transcript-retry" onClick={state.retry}>Retry</button>
</>
```

Typography of error prose: `--font-chrome --text-sm --color-error`.
Padding around block: `var(--space-6) 0`. Retry button: same recipe
as RawTab's `.raw-retry` (transparent background, border-strong
hairline, focus-visible outline at accent).

### 11.5 `success` / `truncated` — content branches

Already covered in §2 + §3 + §6. Note that `truncated` IS a success
state — the parser returned a parsed session, just stopped early.
Both branches render `<TranscriptBody>`; `truncated` additionally
mounts the truncation banner.

### 11.6 Empty stream — `parsed.messages.length === 0`

```tsx
<p className="transcript-empty-stream">No messages parsed.</p>
```

Inside the `<TranscriptBody>` after any banners. Typography:
`--font-chrome --text-sm --color-ink-muted italic`. Padding
`var(--space-8) 0`. Centered.

---

## 12. Accessibility

### 12.1 Roles and landmarks

- `<section class="transcript-body" aria-label="Session transcript">`:
  the surface's semantic anchor. Screen readers announce "Session
  transcript region" when focus enters.
- `<ol class="transcript-stream">`: implicit `role="list"`. Each
  `<MessageRow>` is an `<li>`. For `boundary`, the `<li>` itself
  carries `role="separator"` directly (no nested `<div>`) per
  Q-DESIGN-3 round-2 resolution in §12.2 — the flat shape matches
  the prototype and wireframes.
- `<article>` wrappers on user/assistant/tool messages: implicit
  `role="article"`. Screen readers announce each turn as a discrete
  unit.
- `<header>` inside each message: implicit `role="banner"` for the
  first one in the document; subsequent are unnamed but still
  navigable.
- `<details>` inside tool/warnings disclosures: native disclosure
  semantics, keyboard-supported.

### 12.2 Q-DESIGN-3: `<ol>` containing separators — RESOLVED (round 2)

The spec calls for `role="separator"` on boundary messages. The
wrapping container is `<ol>`, which expects only `<li>` children.
Round-1 designer flagged two options (Option A: `<li>` wrapper with
internal `<div role="separator">`; Option B: switch container to
`<div>` and lose the list count).

**Coordinator resolution (round 2): the flat shape on the `<li>`
itself.** The boundary message ships as
`<li class="msg msg-boundary" role="separator" aria-orientation="horizontal">`.
The `<li>` element carries `role="separator"` directly — no nested
`<div>`. This is valid: ARIA allows overriding the implicit role of
`<li>` (which is `listitem`) with `role="separator"` because the
boundary is semantically a separator, not a list item. The visual
content (rule + label + rule via CSS Grid) lives directly inside the
`<li>`.

Screen readers announce the element as a separator with the label
text ("separator: SESSION RESUMED" or "separator: CONVERSATION
COMPACTED"), bypassing the list-item count. Adjacent message `<li>`s
on either side keep their listitem role and announce normally
("message 47 of 312"). The boundary is not counted in the listitem
sequence — which matches the editorial intent (chapter break is
between turns, not a turn itself).

This is the shape the prototype already ships at
`prototype.html:991-995` and the wireframe at
`wireframes/04-boundary-mid-stream.txt:67-71`. Round-1 design.md drift
to a nested-`<div>` shape is corrected in round 2.

### 12.3 Focus order

Tab order on a fully-rendered transcript:

1. Tab strip (active tab via tabindex=0, others via roving tabindex).
2. The active tabpanel `<div role="tabpanel" tabindex={0}>` (per M2b's
   contract). The user's first Tab from the tabs lands here.
3. Inside the panel: each focusable child in document order.
   - Truncation banner: NOT focusable (it's `role="status"`, no
     focusable children inside).
   - Parse-warnings banner: `<summary>` is focusable; expanding
     surfaces the `<button>Dismiss</button>`.
   - Per message: tool_use / tool_result / tool_overflow `<summary>`
     elements are focusable.
   - Retry button (in error state) is focusable.

### 12.4 `tabIndex={0}` on the active tabpanel — IMPORTANT-5 resolution

M2b r1 #5 caught Skim/Transcript placeholder tabpanels lacking
`tabIndex={0}`. The Tabs primitive in `apps/frontend/src/components/`
applies `tabIndex={isActive && (id === "skim" || id === "transcript"
|| id === "raw") ? 0 : undefined}` per the M2b motion.md §"Surface 2"
recipe. M4's tabpanel inherits this — its `tabIndex={0}` survives even
though the panel now has focusable children (the `<summary>` elements,
the Retry button, the Dismiss button).

**Round-2 resolution (IMPORTANT-5).** Per WAI-ARIA APG, a tabpanel
WITH focusable descendants does NOT strictly need `tabIndex={0}`.
M4's TranscriptView has focusable children (Retry button, Dismiss
button, `<details>` summaries on tool messages and the parse-warnings
banner), so APG would technically allow stripping `tabIndex={0}` from
the active Transcript tabpanel.

**Coordinator decision: keep `tabIndex={0}` unconditional on the
active Transcript tabpanel for consistency with M2b's Option-A,
even though APG would technically allow stripping it.** Rationale:
the cost of an extra tab stop is one extra Tab keypress (the user
tabs from the tab strip into the tabpanel, then again to reach the
first focusable child); the benefit is **rule simplicity** — every
active tabpanel gets `tabIndex={0}` regardless of whether it has
focusable descendants, with no per-tab logic. Codex M2b r1 #5 +
r2 #1 precedent verified.

The rule M4 ships, restated: "Every active tabpanel of the
distill-portal Tabs primitive carries `tabIndex={0}`. No exceptions
based on whether the panel has focusable descendants." This rule
survives M4's expansion of TranscriptView from a placeholder (no
focusable descendants) to a full transcript (multiple focusable
descendants). Cross-reference: M2b Resolved Decision Option-A.

### 12.5 ARIA live regions

- Truncation banner: `role="status"`. Polite announcement on mount.
- Parse-warnings banner: NOT a live region. The user discovers it
  visually; expanding it doesn't trigger an announcement (the
  disclosure animation is cosmetic, not informational).
- Retry button outcome: NOT announced via aria-live. The state
  transition (loading → success/error) handles announcement via the
  loading/error prose itself.

### 12.6 Reduced motion

The global rule at `apps/frontend/src/styles/global.css` zeroes:
- `animation-duration` (truncation banner opacity entrance → instant).
- `transition-duration` (any transitions; M4 has none on message
  panels per the motion budget).
- `<details>` `block-size` interpolation → snap.

The reading-wash noise overlay on `.session-pane` is suppressed
under reduced-motion via the M2a CSS rule (already in place);
TranscriptView does not need to add anything.

### 12.7 Screen reader copy hygiene

- The middle-dot glyph (`·`, U+00B7) in attribution rows is wrapped
  in plain text — screen readers pronounce it as "middle dot" or
  pause briefly depending on the SR. Acceptable.
- The `system ·` glyph in system messages is wrapped in `aria-hidden=
  "true"` so screen readers skip the glyph and announce only the
  message body.
- The boundary label is plain text (`SESSION RESUMED` / `CONVERSATION
  COMPACTED`) — screen readers announce it as part of the separator,
  giving full context.
- The "Open raw" `<strong>` in the truncation banner is regular text
  with bold weight — screen readers read "Open raw" inline; the
  bolding is a visual cue, not a semantic one.

---

## 13. Open questions for the reviewer trio

### Q-DESIGN-1: Spacing rhythm interpretation — RESOLVED (round 2)

Spec line 701 says "16 px between messages, 24 px between adjacent
same-kind messages with a kind-change gap of 32 px". Round-1 designer
proposed a two-magnitude reading (24 px same-kind / 32 px on every
kind-change). Coordinator resolution (round 2): ship the
**three-magnitude rule** the prototype CSS already implements:

- **16 px (default)** — any two adjacent messages where no override
  fires (the floor for non-boundary adjacent-different-kind pairs).
- **24 px (same-kind override)** — adjacent same-kind messages.
- **32 px (boundary breathing)** — above and below every
  `.msg-boundary` (the only kind that triggers the 32 px ceiling).

Spec line 701's "kind-change gap of 32 px" is read as the ceiling for
boundary transitions specifically, NOT as a rule that fires on every
adjacent-different-kind pair. This is the simplest reading consistent
with both the editorial intent (boundary = chapter break = wider
breathing) and the CSS the prototype ships at `prototype.html:323-342`.
Wireframes updated in round 2 to match.

### Q-DESIGN-2: Reading column alignment

The transcript stream aligns to the panel's inline-start edge (NOT
centered within the reading column). Editorial vocabulary; spec
doesn't prescribe. Designer recommends inline-start; flagged for
reviewer trio.

### Q-DESIGN-3: `<ol>` containing `<div role="separator">`

Boundary messages inside the ordered-list container. Designer
recommends Option A (boundary wrapped in `<li>`, internal
`role="separator"` div). Flagged for reviewer trio.

### Q-DESIGN-4: Code-fence detection edge cases — 5 test obligations

The render-time helper detects triple-backtick fenced blocks and
single-backtick inline code. Documented behaviors:

1. **Triple-backtick fenced block (happy path).** ` ```lang\n…\n``` `
   renders as `<pre class="msg-code-block">{body}</pre>`. The optional
   language hint after the opening fence is preserved as a data
   attribute (or stripped — designer recommends stripping for now;
   no syntax highlighting in M4).
2. **Unterminated fence.** Text is ` ```foo\nbar` with no closing
   fence: renders as plain text; documented behavior, no warning. The
   parser-warnings banner is the surface for parse anomalies, not
   render anomalies.
3. **Nested backticks inside a fenced block.** Inner ` ` ` ` pairs
   render as literal characters — the `<pre>` content is opaque to
   inline-code detection. The outer fence delimits the boundary; once
   inside the `<pre>`, no further inline-code rewriting fires.
4. **Empty fence.** ` ```\n``` ` renders as an empty `<pre>`
   (zero-height; CSS may add a min-height to avoid the disappearing
   block). Acceptable.
5. **Truncated mid-fence.** When the upstream parser truncates and
   the truncation lands inside an open fence (e.g. ` ```foo\nbar`
   followed by EOF because the 5 MB cap fired): renders as plain
   text (case 2 above subsumes this). The truncation banner at the
   top of the transcript carries the truncation signal; the orphan
   fence does not need a separate cue.
6. **Single-backtick spanning a newline.** Renders as plain text
   (the inline-code detector requires both backticks on the same
   line). Documented; not a warning.

**Test obligations propagated to m4-plan §8 (developer-side; the
developer's `TranscriptView.test.tsx` should cover all 5 + 1 cases
above, expanding the m4-plan §8 test obligations from 3 cases to 5+
cases per IMPORTANT-NIT round-2 resolution):**

- Happy-path triple-backtick → `<pre class="msg-code-block">`.
- Unterminated fence → plain text (no warning).
- Nested backticks inside a fenced block → literal characters in `<pre>`.
- Empty fence → empty `<pre>`.
- Truncated mid-fence → plain text (no orphan `<pre>`).
- (Bonus) Single-backtick spanning a newline → plain text.

Designer ships these as documented behaviors. None of the edge cases
warrant a parse-warning banner entry; they are render-time decisions,
not parse-time anomalies.

### Q-DESIGN-5: Truncation banner copy "Open raw" reference — RESOLVED (round 2)

Round-1 designer flagged: spec line 715 banner copy points to an
"Open raw" anchor in the session header that did not yet exist (M2b
deferred it). Coordinator resolution (round 2): M4 scope EXPANDS to
land the session-header anchor in the same chunk as the truncation
banner. See §6.1.1 for the full anchor specification (visibility
rule, copy, URL, position, typography, state variants). The banner
copy is now spec-verbatim because the destination anchor exists
co-temporally.

### Q-DESIGN-6: Empty-stream copy

The "No messages parsed." copy is terse. Alternative: "No messages
in this session — the file parsed successfully but contained no
recognizable messages." More verbose but more diagnostic. Designer
recommends the spec-anchored terse copy for now; flagged for
reviewer trio.

---

## 14. Token consumption set

The complete list of tokens M4 consumes from `tokens.css`. M4 introduces
ZERO new tokens. The total token count remains 83 (post-M2a).

### Color tokens (8)

- `--color-ink` — body text.
- `--color-ink-muted` — attribution rows, system messages, unknown
  fallback, banners' diagnostic text.
- `--color-surface` — assistant message panel background, page wash.
- `--color-surface-raised` — tool `<pre>` backgrounds, parse-warnings
  banner background, inline `<code>`.
- `--color-accent` — user message tint (5 % mix), tool_result
  "Expand" affordance text.
- `--color-border` — tool message hairline border, parse-warnings
  banner border, dismiss button border.
- `--color-border-strong` — boundary chapter-break rules.
- `--color-warn` — truncation banner stripe + 8 % mix background.

### Typography tokens (8)

- `--font-display` — boundary label only.
- `--font-chrome` — body text, attribution rows, summaries, banners.
- `--font-mono` — `<pre>` blocks, inline `<code>`, unknown payload
  slice, warnings list items.
- `--text-xs` — attribution rows, tool headers, unknown line,
  warnings list items.
- `--text-sm` — `<pre>` content, summary text, system body, banner
  body, dismiss button.
- `--text-base` — user/assistant body text.
- `--leading-comfortable` — body text leading.
- `--measure` — reading-column max-inline-size (70ch).

### Spacing tokens (6)

- `--space-1` (0.25rem / 4 px).
- `--space-2` (0.5rem / 8 px).
- `--space-3` (0.75rem / 12 px).
- `--space-4` (1rem / 16 px) — the 16 px rhythm rule.
- `--space-6` (1.5rem / 24 px) — same-kind rhythm + reading-column
  side padding inheritance.
- `--space-8` (2rem / 32 px) — kind-change rhythm + boundary breathing
  + state-branch padding.

NOT used: `--space-5`, `--space-10`, `--space-12` (these tokens DO
NOT EXIST in tokens.css; M2b r1 #3 codex catch). All 32 px values
use `var(--space-8)`; 24 px uses `var(--space-6)`; 16 px uses
`var(--space-4)`.

### Radius tokens (2)

- `--radius-sm` (4 px) — inline `<code>`, `<pre>` corners on
  fenced-code segments, dismiss button, banners.
- `--radius-md` (6 px) — user / assistant message panel corners.

### Motion tokens (4)

- `--motion-base` (120 ms) — truncation banner opacity entrance.
- `--motion-disclosure` (200 ms) — `<details>` block-size animation
  (inherited via global rule).
- `--ease-out` — banner entrance easing.
- `--ease-in-out` — disclosure animation easing (inherited).

### Total

- 8 color + 8 typography + 6 spacing + 2 radius + 4 motion = **28 tokens
  consumed**, all from the existing 83-token set.

---

## 15. Cross-chunk verification matrix

What M4 must NOT regress against earlier chunks:

| Chunk | Surface | M4 obligation                                                                |
|-------|---------|------------------------------------------------------------------------------|
| M1a   | Split-pane shell, deep-link pulse, empty pane | Untouched; TranscriptView mounts inside `.session-pane` |
| M1b   | Sticky pagination footer | Untouched                                                                    |
| M2a   | Token canon (83), Fraunces wiring, noise overlay | Consumed only; no token additions; no @font-face additions |
| M2b   | Tab strip, minimal header, Metadata, Raw, two placeholders | Replaces TranscriptPlaceholder with TranscriptView; default-tab shifts to "transcript"; SkimPlaceholder kept |
| M3a   | Parsers + types | Pure consumer; no parser shape changes                                       |
| M3b   | useParsedSession + cacheEpoch | Pure consumer of the discriminated state union                               |

Specifically:

- The keep-mounted contract (M2b spec lines 650-658): TranscriptView
  has NO `key=` on its root. State persists across tab switches.
- The page-turn fade (M2b motion.md surface 3): unchanged. The outer
  `<SessionView key={selectedRowKey}>` still drives the page-turn
  animation; TranscriptView is a passive child.
- The Tabs primitive's accessibility contract (M2b motion.md): the
  active tabpanel still carries `tabIndex={0}` and the `inline
  animation: tab-fade-in` toggle.
- The Phase 4 timestamp contract (`null → "—"`): preserved verbatim.
- The hex-isolation invariant (24 hex literals in
  `apps/frontend/src/`): TranscriptView uses zero hex; only the
  prototype.html in this folder uses hex for theme-toggle scaffolding.
- The token-count invariant (83): no additions.

---

## 16. Acceptance checklist (developer running M4)

Cross-checked against m4-plan §9 verification commands.

- [ ] All 7 MessageKind branches render correctly per §3.
- [ ] User-vs-assistant tint differential passes WCAG AA in light
      AND dark (colors.md T01 + T02).
- [ ] Truncation banner: opacity-only entrance, warn stripe,
      verbatim copy.
- [ ] Parse-warnings banner: native `<details>`, dismissible,
      re-arrives on row change.
- [ ] Boundary chapter-break: shared recipe with §3.6 / §8.
- [ ] Long tool_result: 2 KB UTF-8 split with codepoint walkback.
- [ ] Code-fence detection: triple-backtick → `<pre>`, single-backtick
      → `<code>`, unterminated → plain text.
- [ ] Reading measure: 70ch on all body-bearing panels.
- [ ] Spacing rhythm: 24 px same-kind, 32 px kind-change, 32 px
      around boundaries.
- [ ] Timestamp display: `<time dateTime title>`, null → "—", no
      timestamp on boundary.
- [ ] State branches: idle, no_raw, loading, error (with Retry),
      empty-stream all rendered.
- [ ] Keep-mounted: no `key=` on TranscriptView root; warnings-banner
      dismissed survives tab switch.
- [ ] `tabIndex={0}` on the active Transcript tabpanel preserved
      (M2b contract).
- [ ] Token consumption: only the 28 tokens enumerated in §14.
      `rg -n 'var\(--' TranscriptView.css | sort -u` cross-checks
      against tokens.css.
- [ ] Hex isolation: no `#` literals in TranscriptView.{tsx,css,test.tsx}.
- [ ] Motion budget: zero `transition: color | border-color | width
      | height | top | padding`. Zero `transition: background-color`
      on `.msg*` selectors.
- [ ] Reduced-motion: opacity entrance and disclosure animations
      zero out via global rule.
- [ ] WCAG AA: every text-on-surface pair in colors.md passes in
      both modes.
- [ ] `DEFAULT_TAB_ON_SELECTION` shifts from `"metadata"` to
      `"transcript"` in SessionView.tsx.
- [ ] SessionView.test.tsx default-tab assertion updated.
- [ ] Long-corpus measurement (5k synthetic fixture, Playwright
      Chromium): p95 < 16 ms / frame. Slot 2 NOT fired.

---

## 17. Designer self-audit

Before handing off to the reviewer trio, the designer ran the codex
catch precedents against this artifact:

| Precedent | Surface check | Status |
|-----------|---------------|--------|
| CSS unitless transforms | NO inline transforms on TranscriptView; truncation banner uses opacity only | OK |
| `key=` on tab-keyed content | Zero `key=` on TranscriptView root; only `<MessageRow key={messageIndex}>` (content key) | OK |
| Undefined token references | All 28 tokens cross-checked against tokens.css; no `--space-5/10/12` | OK |
| WCAG light AND dark | colors.md enumerates 22 contrast pairs in both modes | OK |
| Motion budget violation | Banner uses opacity; disclosures use block-size; nothing else animates | OK |
| Background-color exemption misuse | Truncation banner has STATIC color-mix background (no animation); opacity only animates | OK |
| Spec-literal violation | All copy verbatim, anchored to line ranges in spec | OK |
| `tabIndex={0}` on active panel | M2b contract preserved (active panel has `tabIndex={0}` even with focusable children) | OK |
| Runtime-shape bug (`undefined.length`) | TypeScript exhaustiveness on MessageKind switch; `msg.text: string` non-nullable | OK |
| Status-color misuse | Truncation uses `--color-warn` (not `--color-error`); truncation IS a non-fatal capacity boundary | OK |
| Hex isolation regression | Zero hex in any production file; prototype.html has hex only in theme-toggle scaffolding (not shipped) | OK |
| Asymmetric tool transformation | Reads `msg.text` verbatim; no re-stringification | OK |
| Silent-skip vs total-fallthrough | Switch's default uses `const _: never = msg.kind` exhaustiveness check | OK |

All 13 precedents pass. The designer expects the reviewer trio to
land 0-2 BLOCKING findings on the FIRST round (M2b had 8; M4's
artifact deliberately defends against each one).

### 17.1 Round-2 fix-up audit (BLOCKING + IMPORTANT + NIT)

Round 1 returned `needs changes` from the Claude UI/UX reviewer with
2 BLOCKING + 3 IMPORTANT + 4 NIT findings. Codex external review was
deferred due to classifier outage. Coordinator resolutions applied
in round 2:

| Finding | Resolution location | Status |
|---------|---------------------|--------|
| BLOCKING-1: spacing rhythm three-magnitude rule | §1 brief, §4 spacing, §13 Q-DESIGN-1, wireframes 01/04/09 | Applied — all docs match the CSS the prototype ships |
| BLOCKING-2: M4 scope expands to land "Open raw" anchor | §6.1.1 (new), §13 Q-DESIGN-5 | Applied — anchor specified end-to-end + prototype demo |
| IMPORTANT-3: plural-aware copy → spec literal | §7.1, §7.2 JSX example, prototype.html line ~934 | Applied — N=1 ships "1 parse warnings" verbatim |
| IMPORTANT-4: unknown ellipsis edge cases | §3.7 | Applied — three-case rule + test obligation |
| IMPORTANT-5: tabIndex={0} matrix | §12.4 | Applied — unconditional per M2b Option-A |
| NIT: colors.md T11/T13 dark re-derivation | colors.md (script committed) | Applied — wcag_m4.py committed, dark T11/T13 = 13.74:1 |
| NIT: Q-DESIGN-3 boundary kind shell | §2.1 table, §3.6 container, §12.1, §12.2 | Applied — flat `<li role="separator">` shape |
| NIT: T12 derivation in colors.md | colors.md T12 prose | Applied — line-by-line math added |
| NIT: code-fence edge cases (Q-DESIGN-4) | §13 Q-DESIGN-4 | Applied — 5+1 cases enumerated for developer tests |

---

End of design.md.
