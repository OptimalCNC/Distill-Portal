# Phase 7d — Marginalia hairlines for currently-silenced events — design

Design artifact for **Phase 7d / Milestone 1 (UI/UX Design Gate)**.

Predecessor: `working/phase-7c/designs/design.md` (committed at
prototype-reference baseline). The Archive-room aesthetic, the 83-token
surface, the 24-hex `@supports` fallback, the native `<details>`
contract, the motion budget, and the chip vocabulary are inherited
unchanged. This artifact specifies ONLY the new "metadata hairline"
treatment and the parser/render-hint hook that produces it.

This artifact is a **reference**. The developer subagent re-implements
against the production stack (Bun + Vite + React + TS + per-component
sibling CSS). Nothing in this folder ships to `apps/frontend/`. Every
`var(--...)` reference in the prototype resolves to an existing token
in `apps/frontend/src/styles/tokens.css`. No new tokens introduced.

> **Revision note (round 2)** — the user reviewed round 1 and ruled:
> (a) ALL 12 events MUST surface, including the 2 duplicate-anchor
> Codex rows ("no event hidden"), but the duplicates may render in a
> visually-even-quieter "echo" register that doesn't compete with the
> canonical row; (b) the cluster collapse threshold is **2**, not 3,
> matching Phase 7c polish-r2's lowered threshold; (c) **Path A** —
> a new `MessageKind = "metadata"` variant — is the chosen
> implementation path, which AMENDS Resolved Decision #2 ("MessageKind
> is stable"). The user has explicitly approved this amendment. Round
> 1's Path-B recommendation is superseded.

---

## 1. Problem statement

Today the parser silently skips **12** event variants — they never
emit a `Message` and the renderer never sees them. The user has
decided that **no event should be hidden entirely**: each silenced
event surfaces in the transcript, but in the **minimum-disrupting
way possible** so the row does not crowd out user prompts, assistant
text, or tool lifecycle cards.

The 12 silenced variants (verbatim from
`docs/features/parser-event-support.md`):

**Claude Code (8)** — currently routed through the explicit silent
skip block at `apps/frontend/src/features/sessions/parsers/claude_code.ts:413`:

| Event type               | Source path                                           | Payload of interest                                          |
|--------------------------|-------------------------------------------------------|--------------------------------------------------------------|
| `agent-name`             | `claude_code.ts:413`                                  | `name` (sub-agent identifier)                                |
| `ai-title`               | `claude_code.ts:414`                                  | `title` (auto-generated session title)                       |
| `attachment`             | `claude_code.ts:415`                                  | `fileName`, `mimeType`                                       |
| `custom-title`           | `claude_code.ts:416`                                  | `customTitle` (user-assigned)                                |
| `file-history-snapshot`  | `claude_code.ts:417`                                  | `files[]` array of `{path, status}` entries                  |
| `last-prompt`            | `claude_code.ts:418`                                  | `prompt` (last user submission for resume)                   |
| `permission-mode`        | `claude_code.ts:420`                                  | `permissionMode` (`default` / `bypassPermissions` / …)       |
| `queue-operation`        | `claude_code.ts:419`                                  | `operation`, optional `prompt`                               |

**Codex (4)**:

| Event type                                  | Source path                | Payload of interest                                              |
|---------------------------------------------|----------------------------|------------------------------------------------------------------|
| `event_msg.token_count`                     | `codex.ts:674`             | `input_tokens`, `output_tokens`, optional `cached_input_tokens`  |
| `turn_context`                              | `codex.ts:334`             | `cwd`, `current_date`, optional `model` / `sandbox` / `approval`  |
| `response_item.message role="assistant"`    | `codex.ts:197`             | (duplicate of canonical `event_msg.agent_message`)                |
| `response_item.message role="user"`         | `codex.ts:197`             | (duplicate of canonical `event_msg.user_message`)                 |

---

## 2. Decision up front — Path A (new MessageKind = "metadata")

**Chosen path: Path A.** The user reviewed round 1's Path-B
recommendation (one optional field on `Message`, discriminator on
`RenderHint`) and chose Path A instead: a new `MessageKind` variant.
This section documents the choice and the AMENDMENT to Resolved
Decision #2 that it requires.

### 2.1 Amendment to Resolved Decision #2

Resolved Decision #2 declared `MessageKind` stable across Phase 5, 6,
7a, 7b, 7c. The decision has been **amended by user instruction**
to permit one extension in Phase 7d: a new `"metadata"` variant.

After Phase 7d, the union has **8** variants:

```ts
export type MessageKind =
  | "user"
  | "assistant"
  | "tool_use"
  | "tool_result"
  | "system"
  | "boundary"
  | "unknown"
  | "metadata";        // Phase 7d — new.
```

The amendment is documented:

- here, in §2.1 + §2.2 + §11.0,
- in the implementation acceptance checklist §7.1,
- in `apps/frontend/src/features/sessions/parsers/types.ts` (the
  `MessageKind` JSDoc gains an item for `metadata`),
- in `docs/features/parser-event-support.md` (the matrix changelog
  cites Phase 7d as the amendment date).

### 2.2 Why Path A (in light of the user's choice)

The user chose Path A over Path B for **cleaner semantic
discrimination**. Path B routed metadata through `kind: "system"`
plus a `metaCategory` discriminator, which conflated true system
notes (task lifecycle, errors, session_meta) with session-level
chrome (titles, telemetry, attachments). Path A separates them.

Concrete advantages of Path A:

1. **Exhaustive switch coverage**: every per-kind dispatch in the
   codebase gains one new `case "metadata":` branch. TypeScript's
   exhaustiveness check surfaces every missing branch as a compile
   error. With Path B's optional discriminator the renderer's
   conditional was a runtime fall-through (`if (hint.metadata) …`)
   that did not fail loudly when forgotten.

2. **Skim and buildSkim isolation**: `buildSkim` walks `Message`
   stream and partitions by `kind`. Metadata messages should NOT
   contribute to user_turn / agent_only block ranges (they are
   chrome, not turn participants). With Path A, `buildSkim` adds a
   `case "metadata": continue;` skip and the partition is correct
   automatically. With Path B every `buildSkim` call site would have
   needed an `if (m.kind === "system" && m.metaCategory)` short-circuit
   — more error-prone.

3. **Future evolution**: separating the discriminator at MessageKind
   keeps `system` available for its actual semantic (task lifecycle,
   errors, session_meta). Adding a new system-note shape later does
   NOT collide with the metadata shape.

4. **The matrix doc is cleaner**: 10 events move from "silenced" to
   "supported via `kind: metadata` / hairline render". 2 duplicate-anchor
   events move from "silenced" to "supported via `kind: metadata` /
   echo render". No "kind: system, metaCategory: …" mixed-state row.

### 2.3 Concrete data-model deltas under Path A

**`parsers/types.ts` — `MessageKind` grows by one + `MetaCategory`
type added + `Message` gains two optional fields:**

```ts
export type MessageKind =
  | "user"
  | "assistant"
  | "tool_use"
  | "tool_result"
  | "system"
  | "boundary"
  | "unknown"
  | "metadata";        // Phase 7d — NEW.

/**
 * The metadata sub-category. Each value drives ONE visual recipe
 * (label text, separator, value typography). Set on every Message
 * with kind === "metadata".
 */
export type MetaCategory =
  | "control"     // permission-mode, queue-operation
  | "telemetry"   // event_msg.token_count
  | "title"       // ai-title, custom-title
  | "attachment"  // attachment, file-history-snapshot
  | "agent"       // agent-name
  | "prompt"      // last-prompt
  | "context"     // turn_context
  | "echo";       // response_item.message role=user/assistant (duplicate-anchor)

export type Message = {
  // ...existing fields verbatim...

  /**
   * Phase 7d — sub-category for kind === "metadata". Required on every
   * metadata-kind message. ABSENT for every other kind.
   */
  metaCategory?: MetaCategory;

  /**
   * Phase 7d — for metaCategory === "echo" only. The 0-indexed line
   * number of the canonical Message whose content this echo duplicates,
   * so the hover tooltip can point at the canonical row. ABSENT for
   * other metaCategory values.
   */
  echoOf?: { lineOrdinal: number; canonicalKind: "user" | "assistant" };
};
```

**`renderHints.ts` — three new variants and one helper type:**

```ts
export type MetadataHint = {
  category: MetaCategory;
  /** Compact line of payload text for the marginalia row.
   *  Pre-computed by the renderHints layer from the source Message;
   *  the renderer treats it as opaque display text. */
  display: string;
  /** Per-category structured fields for hover/tooltip + grouping. */
  fields?: Record<string, string>;
  /** Screen-reader-friendly aria-label. */
  ariaLabel: string;
};

export type RenderHint =
  // ...existing variants verbatim...
  | {
      kind: "metadata";
      messageIndex: number;
      metadata: MetadataHint;
    }
  | {
      kind: "metadata-cluster-head";
      /** All cluster members, in order. messageIndices[0] is the head's anchor. */
      messageIndices: number[];
      /** Hint contents copied verbatim from cluster members so the
       *  renderer doesn't re-derive. */
      members: MetadataHint[];
    }
  | {
      kind: "metadata-cluster-member";
      messageIndex: number;
      /** Index of the cluster head this member belongs to. Useful for
       *  test assertions and for hint-stream introspection; the renderer
       *  does NOT render cluster-member hints as top-level rows (they
       *  live inside the head's <details> body). */
      clusterHeadIndex: number;
      metadata: MetadataHint;
    };
```

The renderHints `clusterMetadata` pass walks the standalone stream
and replaces every adjacent run of N ≥ `METADATA_COLLAPSE_THRESHOLD`
metadata hints with one `metadata-cluster-head` followed by N-1
`metadata-cluster-member` hints. Single metadata rows pass through
unchanged as `kind: "metadata"`.

**Why three variants (not one)**: the head + members split lets
downstream consumers (e.g. test introspection, skim view future
extensions) reason about cluster membership without re-walking the
stream. The renderer renders the head; members are inert. This
mirrors the existing `group-head` / `group-member` / `group-text-member`
split in Phase 7c.

### 2.4 Per-event payload → metaCategory routing

| Source event                              | `metaCategory` | Surfaces? | Render path                                                                                              |
|-------------------------------------------|----------------|-----------|----------------------------------------------------------------------------------------------------------|
| Claude Code `agent-name`                  | `agent`        | YES       | hairline                                                                                                  |
| Claude Code `ai-title`                    | `title`        | YES       | hairline (italic display)                                                                                 |
| Claude Code `attachment`                  | `attachment`   | YES       | hairline                                                                                                  |
| Claude Code `custom-title`                | `title`        | YES       | hairline (italic display)                                                                                 |
| Claude Code `file-history-snapshot`       | `attachment`   | YES       | hairline                                                                                                  |
| Claude Code `last-prompt`                 | `prompt`       | YES       | hairline (italic display, truncated)                                                                      |
| Claude Code `permission-mode`             | `control`      | YES       | hairline                                                                                                  |
| Claude Code `queue-operation`             | `control`      | YES       | hairline                                                                                                  |
| Codex `event_msg.token_count`             | `telemetry`    | YES       | hairline                                                                                                  |
| Codex `turn_context`                      | `context`      | YES       | hairline (folds optional `model`, `sandbox`, `approval`)                                                  |
| Codex `response_item.message role=user`   | `echo`         | YES       | **echo** glyph row — single `↺` indicator, no label, no value, tooltip "duplicate of event_msg.user_message at line N" |
| Codex `response_item.message role=assistant` | `echo`      | YES       | **echo** glyph row — single `↺` indicator, no label, no value, tooltip "duplicate of event_msg.agent_message at line N" |

**Per-row policy rationale**:

- The 10 information-bearing variants render as marginalia hairlines
  (§3.2).
- The 2 duplicate-anchor `response_item.message` variants render in
  the **echo register** (§3.6) — even quieter than a hairline. They
  surface so "no event hidden" holds, but they do not compete with
  the canonical body-weight row that carries the same content. The
  hover tooltip points at the canonical row's line number.

---

## 3. Visual treatment

### 3.1 Design intent

The Archive-room aesthetic uses **marginalia** as a recognized
register: small annotations that sit alongside the editorial body
without competing for attention. Footnote numbers, sidenotes,
page-decoration glyphs — all communicate information at a sub-body
typographic weight, in a muted color, in a contained spatial
position.

Phase 5 reserved this register for two existing surfaces — the
empty-pane preface glyph (`SessionView.css`) and the chip category
tag inside warning chips (Phase 7c §5.1). Phase 7c extended it to
the task-lifecycle chapter marker (Fraunces italic small-caps).
Phase 7d **reuses the same register** for metadata, with **two
sub-registers**:

- **Hairline** (§3.2): single-line strip, Fraunces italic small-caps
  label + chrome-text or mono payload, all in `--color-ink-muted`,
  no card, no background, no border-radius. Used for the 10
  information-bearing categories. Reads as marginalia — a footnote
  attached to the transcript stream.

- **Echo** (§3.6): a single decorative `↺` glyph at the marginalia
  gutter position with NO label, NO value. Used for the 2
  duplicate-anchor categories. Reads as a presence marker — a
  reference indicator that says "this event existed; its content
  is on the canonical row". The hover tooltip resolves the back-
  pointer.

The five existing visual registers (Phase 7c) plus the two new
registers form a six-level hierarchy:

| Treatment           | Has card?        | Has background?         | Inline padding | Typography weight                  | Inline rail / hairline?              |
|---------------------|------------------|-------------------------|----------------|------------------------------------|--------------------------------------|
| User / assistant    | yes              | `--color-surface` panel | full           | body                               | left rail (assistant)                |
| Tool lifecycle      | yes              | `--color-surface` card  | full           | mono + chrome                      | sienna inline-start rail             |
| Group head          | yes              | `--color-surface` card  | full           | mono + chrome                      | (none, summary row)                  |
| `system` note       | yes (panel)      | `--color-surface` panel | full           | chrome                             | single glyph at start                |
| Task-lifecycle      | (hairline pair)  | bare                    | full           | Fraunces italic SC                 | hairline top+bottom (decorative)     |
| **Metadata-hairline** (NEW)  | no       | bare                    | inline only    | chrome + mono + Fraunces italic    | single decorative middle-dot prefix  |
| **Metadata-echo** (NEW)      | no       | bare                    | inline only    | (no text — glyph only)             | single decorative `↺` glyph, no body |

The metadata rows sit in the same flex flow as messages but have NO
panel chrome. The reader's eye passes over them the way it passes
over a footnote in a printed book — present, indexed, never the
main content. The echo row is even quieter — a single glyph that
says "this event happened" without claiming any of the reader's
attention beyond presence.

### 3.2 Hairline anatomy — single-row recipe

DOM:

```html
<li class="msg msg-li">
  <p class="msg-metadata" data-category="control" aria-label="Metadata: permission mode set to default">
    <span class="meta-prefix" aria-hidden="true">·</span>
    <span class="meta-label">permission mode</span>
    <span class="meta-sep" aria-hidden="true">→</span>
    <span class="meta-value">default</span>
  </p>
</li>
```

CSS recipe:

```css
.msg-metadata {
  /* Single-line strip, no card, no background, no border. */
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
  flex-wrap: wrap;
  max-inline-size: var(--measure);
  margin: 0;                       /* The <li>'s natural gap supplies vertical rhythm. */
  padding: var(--space-1) var(--space-3);
  border: 0;
  background: transparent;

  /* Indentation cue — sits 24 px in from the column edge so it visually
   * "hangs" from the body, like a marginalia annotation. */
  padding-inline-start: var(--space-6);

  /* Whole row is ink-muted; the inner spans inherit unless they
   * explicitly override. */
  color: var(--color-ink-muted);
  font-size: var(--text-xs);
  line-height: var(--leading-tight, 1.25);
}

.meta-prefix {
  /* Middle-dot decorative glyph — same vocabulary as the
   * task-lifecycle divider. Sits in the gutter to mark the row
   * as "annotation". */
  color: var(--color-ink-muted);
  font-family: var(--font-display);
  font-size: var(--text-base);
  line-height: 1;
}

.meta-label {
  /* The category label — what KIND of metadata this is. */
  font-family: var(--font-chrome);
  font-size: var(--text-xs);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--color-ink-muted);
}

.meta-sep {
  /* Arrow / pipe / colon — picks per category (see §3.4). */
  color: var(--color-ink-muted);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
}

.meta-value {
  /* Payload. Font choice flips on data-category (see §3.4). */
  color: var(--color-ink-muted);
  font-size: var(--text-xs);
}

/* Per-category value typography overrides. */
.msg-metadata[data-category="telemetry"] .meta-value,
.msg-metadata[data-category="control"] .meta-value,
.msg-metadata[data-category="context"] .meta-value,
.msg-metadata[data-category="attachment"] .meta-value,
.msg-metadata[data-category="agent"] .meta-value {
  font-family: var(--font-mono);
}

.msg-metadata[data-category="title"] .meta-value,
.msg-metadata[data-category="prompt"] .meta-value {
  font-family: var(--font-display);
  font-style: italic;
}
```

### 3.3 Inline placement

The metadata row sits **in-place** in the message stream where the
source event landed. It does NOT float to the gutter, NOT sit in a
sidebar, NOT collapse to a session-level summary. The point of
surfacing it is to preserve the temporal ordering with the actual
timeline — a `permission-mode → default` event that landed between
turn 3 and turn 4 of the transcript renders between turn 3 and
turn 4.

Vertical rhythm:

- Row height: 1 line of `--text-xs` content = ~16 px.
- `padding: var(--space-1) var(--space-3)` (4 px / 12 px) — the
  vertical padding gives the row a 24 px total height.
- The transcript `<ol>` already supplies `gap: var(--space-3)` (12 px)
  between `<li>` items; the metadata row inherits this same rhythm,
  so 12 px above + 24 px row + 12 px below = a 48 px slice of the
  column. By comparison a user message panel takes 80-120 px. The
  metadata row is roughly 1/3 the vertical footprint of a real
  message; that ratio is the "minimum disruption" guarantee.
- `padding-inline-start: var(--space-6)` (24 px) — the row hangs
  from the body column with a hairline left indent. The
  `.meta-prefix` middle-dot sits inside this indent, marking the
  row as marginalia.

### 3.4 Per-category recipe table

The 10 surfacing variants map to 7 hairline `metaCategory` values
(`control`, `telemetry`, `title`, `attachment`, `agent`, `prompt`,
`context`); each category picks its own separator + value
typography. The 2 duplicate-anchor variants map to the 8th
`metaCategory` value (`echo`) — covered in §3.6.

| Source event             | `metaCategory` | Label             | Separator | Value typography     | Display formula                                                                 |
|--------------------------|----------------|-------------------|-----------|----------------------|---------------------------------------------------------------------------------|
| `agent-name`             | `agent`        | `agent`           | `→`       | mono                 | `name`                                                                          |
| `ai-title`               | `title`        | `auto title`      | `:`       | Fraunces italic      | `"${title}"` (curly quotes preserved if present)                                |
| `custom-title`           | `title`        | `custom title`    | `:`       | Fraunces italic      | `"${customTitle}"`                                                              |
| `last-prompt`            | `prompt`       | `last prompt`     | `:`       | Fraunces italic      | `"${prompt}"`, truncated to ~80 chars with `…`                                  |
| `attachment`             | `attachment`   | `attachment`      | `→`       | mono                 | `${fileName} (${mimeType})`                                                     |
| `file-history-snapshot`  | `attachment`   | `file snapshot`   | `→`       | mono                 | `N files: ${path1}, ${path2}, …` (up to 2 paths shown; `…` for more)            |
| `permission-mode`        | `control`      | `permission mode` | `→`       | mono                 | `${permissionMode}`                                                             |
| `queue-operation`        | `control`      | `queue`           | `→`       | mono                 | `${operation}` (e.g. `enqueue`) + optional `: "${prompt-truncated}"` italic     |
| `event_msg.token_count`  | `telemetry`    | `tokens`          | `:`       | mono                 | `${input}↓ ${output}↑` (cached count appended if present: `${cached}≈`)        |
| `turn_context`           | `context`      | `turn context`    | `→`       | mono                 | `cwd ${shortCwd}` + ` · model ${model}` if present + ` · sandbox ${sandbox}` if present + ` · approval ${approval}` if present |

**Note on display values**: the display string is computed once in
`renderHints.ts` from the source Message and stored on
`MetadataHint.display`. The renderer treats it as opaque text. For
test stability the renderHints layer is the single point where the
formula is implemented; the renderer never re-parses payload fields.

**Truncation rule**: any value > 80 chars is truncated at 78 chars
with U+2026 `…`. The full payload is available on hover via the
`title` attribute (see §6.1).

**Approval policy folded into `turn_context`** (open question #3
from round 1, designer's call): when the source `turn_context`
payload carries an `approval` field (e.g. `read-only`, `on-request`,
`on-failure`, `never`), the display formula appends ` · approval
${approval}` after `sandbox` (or directly after the previous field
present). This avoids inventing a new metaCategory for a field that
ALWAYS appears alongside `cwd`/`model`/`sandbox` in a `turn_context`
event. The display reads: `cwd /workspace · model gpt-5 · sandbox
read-only · approval on-request`. Field order is fixed
(cwd → model → sandbox → approval); any field that is missing is
silently dropped from the strip. The aria-label mirrors the visible
text.

### 3.5 Color treatment

Every metadata row renders at `--color-ink-muted` on bare
`--color-surface`. **No category-specific color cue.** The label
text carries the discriminator; color is uniform marginalia tone.

This is intentional. A reader skimming the transcript sees a uniform
secondary-text register for ALL metadata — they cannot mistake any
metadata row for a real message, because the color tone is the same
across all of them and it is distinctly muted relative to message
text (`--color-ink` body vs `--color-ink-muted` marginalia). Adding
per-category color tints (e.g. green for telemetry, blue for
control) would introduce a new visual vocabulary the design language
does not currently have, and it would compete with the existing
status-dot vocabulary (success/warn/error/in-flight) — bad
discrimination, more chrome.

The `attachment` and `file-history-snapshot` categories MAY use a
small Fraunces italic display marker as a leading inline glyph in
a future polish round — but in M1 the recipe stays uniform.

### 3.6 Echo anatomy — duplicate-anchor recipe

The 2 `response_item.message` Codex variants render in the **echo**
register. They surface so the "no event hidden" rule holds, but they
must NOT compete with the canonical body-weight `event_msg.user_message`
/ `event_msg.agent_message` row that carries the same content. The
echo recipe is the quietest visible element in the TranscriptView
vocabulary: a single decorative glyph at the marginalia gutter, no
label, no value, native tooltip resolves to the canonical line
number.

DOM:

```html
<li class="msg msg-li">
  <p class="msg-metadata msg-metadata-echo"
     data-category="echo"
     title="duplicate of event_msg.user_message at line 42"
     aria-label="Echo: duplicate of canonical user message at line 42">
    <span class="meta-prefix meta-prefix-echo" aria-hidden="true">↺</span>
  </p>
</li>
```

CSS recipe (additive to `.msg-metadata`):

```css
.msg-metadata-echo {
  /* Same outer footprint as a hairline. Reuses .msg-metadata
   * indent and ink color. The body is a single glyph, so the row
   * collapses to <20 px wide; the rest of the column stays empty.
   * No flex children beyond the prefix; no label, no value. */
  gap: 0;
}

.meta-prefix-echo {
  /* The echo glyph — visually quieter than the middle-dot. */
  font-family: var(--font-chrome);     /* Looks lighter than display. */
  font-size: var(--text-xs);           /* Half the size of the hairline middle-dot. */
  color: var(--color-ink-muted);
  /* No additional opacity / weight overrides — same token as hairlines.
   * The quietness comes from glyph size + missing label, not from a
   * dimmer ink. WCAG measurement uses the same ink-muted/surface pair. */
}
```

**Visual outcome**: a `↺` glyph at 12 px, sitting at the 24 px
indent, against bare surface. Row total height ~16 px; total
horizontal footprint ~30 px. Roughly **half** the vertical
footprint of a hairline and ~1/10 the horizontal footprint. By
construction nothing in the row competes with text content above
or below.

**Why this treatment** (vs. the alternatives the coordinator
listed):

- **Tiny single-glyph indicator** (chosen): visible enough to honor
  "no event hidden"; quiet enough to NOT duplicate the canonical
  row's content. The reader sees something happened; the tooltip
  resolves the cross-reference. This is the most "Archive-room"-
  consistent option (single-glyph marginalia is the established
  vocabulary).
- **Hover-only reveal** (rejected): an invisible-by-default row
  violates the "no event hidden" rule's plain reading — a row the
  reader cannot see is hidden. Surfacing means visible.
- **Even-fainter ink** (rejected): using `--color-border` as text
  ink measures **1.49:1 light / 1.35:1 dark** on `--color-surface`
  (per Phase 7c P01/P02/P12/P13/P38 measurements of the same token
  pair). Fails WCAG AA text (4.5:1) and even SC 1.4.11 non-text
  (3:1) in both modes. Phase 7c uses this pair only for decorative
  1 px borders, where it is exempt under SC 1.4.11; using it for
  TEXT (the echo glyph carries information, however quietly) would
  fail the audit. Rejected.
- **Absolute-positioned marginalia** (rejected): a gutter element
  positioned outside the column flow would break the
  `padding-inline-start: var(--space-6)` indent the hairline
  register relies on; the message column already extends to its
  edge in narrow viewports. Layout fragility.

**Glyph choice** — `↺` (U+21BA ANTICLOCKWISE OPEN CIRCLE ARROW):
the recycling / loopback semantic is the closest unicode match
for "this event echoes another". Alternatives considered:

- `·` middle-dot: collides with the hairline prefix; reader cannot
  tell the difference.
- `⟲` (U+27F2): same semantic, slightly bigger glyph, more vertical
  weight — too loud for "quietest register".
- `⟳` (U+27F3): clockwise version; same problem.
- `※` (U+203B reference mark): closer to "see also" semantic, but
  weight-heavy in most fonts.
- `↺` chosen: lightweight stroke, recognizable "loopback"
  semantic, available in every system font, no font-fallback
  surprises.

**Tooltip resolution**: the hover `title` attribute on the `<p>`
reads exactly:

```
duplicate of event_msg.user_message at line 42
```

or

```
duplicate of event_msg.agent_message at line 42
```

The line number comes from `Message.echoOf.lineOrdinal` (set by the
parser when emitting the echo Message). The string is computed in
`renderHints.ts`; the renderer pastes it into the `title` attribute
verbatim.

**Aria-label**: the screen-reader-friendly version reads `"Echo:
duplicate of canonical user message at line 42"` / `"Echo: duplicate
of canonical assistant message at line 42"`. Screen readers
announce the row as a static paragraph with the aria-label; the
glyph is `aria-hidden`.

**Cluster behavior**: echo rows participate in clustering on the
same threshold as hairline rows (§4). An adjacent run of 2+
metadata rows — mixed echo + hairline OR all echo — collapses into
the cluster disclosure. The cluster summary says "N metadata
events" regardless of mix; the expanded body shows each row in its
own native register (hairlines as hairlines, echoes as echoes).

---

## 4. Adjacent-collapse policy

### 4.1 Decision: threshold-based collapse at N ≥ 2

When **two or more consecutive metadata rows** (hairline or echo)
appear in the stream with no intervening non-metadata hint, they
collapse into a single `<details>` disclosure:

```
·  2 metadata events  ▸
```

Click to expand and the two (or N) rows render in their normal
single-line form, indented inside the disclosure body. Below the
threshold (1 metadata row), the row renders individually.

**Threshold value: `METADATA_COLLAPSE_THRESHOLD = 2`** — exported as
a `const` from `renderHints.ts` so a documented change requires a
progress-log entry.

### 4.2 Rationale

Real Claude Code sessions often emit clusters of metadata at turn
boundaries:

- A `permission-mode` event when a tool needs elevated permission.
- An `attachment` event for each pasted file.
- A `last-prompt` event when the user submits a new prompt.
- A `queue-operation` event when the user enqueues a prompt while
  the agent is mid-response.

The **typical turn boundary** is a `permission-mode` + `last-prompt`
pair (2 rows). With threshold 2, this typical case collapses; one
disclosure carries both, instead of two adjacent hairlines.

The choice was reconsidered in revision: round 1 picked threshold 3
to keep the common 2-row pair inline. The user instructed threshold
2 instead, matching Phase 7c polish-r2's lowered `GROUP_THRESHOLD`
from 3 to 2. The justification is the same: **aggressive collapse
reduces visual noise**; the disclosure cost (one extra click for a
reader who wants the detail) is cheap; the inline cost (two adjacent
muted hairlines competing for vertical space at every turn boundary)
is paid on every transcript view.

Single-metadata-row cases still render inline. The "1 row visible"
case is the truly-rare event (a stray `permission-mode` change
mid-turn); leaving it inline preserves the temporal anchor without
forcing a click. Two or more is the common case and collapses.

### 4.3 Cluster definition

A "cluster" is a maximal run of adjacent **hints with
`kind === "metadata"`**. Any of the following breaks a cluster:

- A non-metadata hint of any other kind (user / assistant / system /
  unknown / orphan tool_result / lifecycle / group-head / group-member
  / group-text-member / boundary / warning-only).
- End of stream.

Mixed-category clusters DO collapse together. A `permission-mode +
last-prompt + queue-operation` cluster collapses into `· 3 metadata
events ▸` and expands to show all three rows in order. An
`echo + echo` cluster collapses to `· 2 metadata events ▸` and
expands to show two echo glyph rows. The label "events" is
intentionally generic — the expanded body carries the per-row
category.

### 4.4 Disclosure recipe

DOM:

```html
<li class="msg msg-li">
  <details class="msg-metadata-cluster">
    <summary aria-label="2 metadata events, click to expand">
      <span class="meta-prefix" aria-hidden="true">·</span>
      <span class="meta-cluster-count">2 metadata events</span>
    </summary>
    <ol class="meta-cluster-body" role="list">
      <li><p class="msg-metadata" data-category="control">…permission mode → default…</p></li>
      <li><p class="msg-metadata" data-category="prompt">…last prompt: "…"…</p></li>
    </ol>
  </details>
</li>
```

CSS recipe:

```css
.msg-metadata-cluster {
  /* Same outer footprint as a single .msg-metadata row. */
  margin: 0;
  padding: 0;
  background: transparent;
  border: 0;
}

.msg-metadata-cluster > summary {
  /* Native disclosure triangle preserved. */
  list-style: revert;
  cursor: pointer;
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
  padding: var(--space-1) var(--space-3);
  padding-inline-start: var(--space-6);
  color: var(--color-ink-muted);
  font-family: var(--font-chrome);
  font-size: var(--text-xs);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.msg-metadata-cluster > summary:focus-visible {
  /* Native focus ring — Phase 5 inherited. No override. */
  outline-offset: 2px;
}

.meta-cluster-body {
  /* Reset list inset; the inner rows carry their own padding. */
  list-style: none;
  margin: 0;
  padding: 0;
}

.meta-cluster-body > li {
  margin: 0;
}

/* Inside the cluster body, each row keeps its single-row recipe — but
 * we tighten the inline padding slightly so the nested rows
 * visually parent into the cluster summary. */
.meta-cluster-body .msg-metadata {
  padding-inline-start: calc(var(--space-6) + var(--space-3));
}
```

### 4.5 Motion

The cluster `<details>` inherits the global `--motion-disclosure`
(200 ms) `block-size` transition that Phase 5 M4 introduced — no new
motion token. Reduced-motion: the global rule zeroes the transition,
the summary toggles snap.

---

## 5. Grouping interaction — Phase 7c tool-batch passthrough

### 5.1 Decision: metadata rows are **DELIMITERS**, not passthrough

The polish-r2 rule at `renderHints.ts:703-712` defines
`isPassthroughStandalone`: only `assistant` standalones are passthrough
inside a tool-batch group; `system`, `user`, `unknown`, `tool_result`
orphans, and task-lifecycle stamped standalones are delimiters.

Phase 7d's metadata hints extend this list: a hint with
`kind === "metadata"` **flushes** the tool-batch buffer. The
metadata row renders at top level, not inside the group's expanded
body. Same rule applies to echo rows (which are also `kind:
"metadata"` with `metaCategory: "echo"`).

### 5.2 Rationale

The minimum-disruption principle could suggest the opposite — that
metadata should be passthrough so a `permission-mode` event between
two `Edit` calls doesn't split the batch. **But the design language
already encodes a clearer signal**: a metadata event landing mid-batch
is a turn-shape disturbance (the user changed permission mode while
the agent was running tools; the agent paused for user input; an
attachment was queued). That IS a structural break — surfacing it as
a top-level marginalia row, with the batch flush, gives the reader
the temporal cue.

Concretely:

- A batch of 5 `Edit` calls with no metadata mid-stream → one group
  head: `Edit · 5 calls`.
- The same batch with a `permission-mode` event between the 3rd and
  4th call → TWO group heads: `Edit · 3 calls` + a metadata row
  + `Edit · 2 calls` (if the trailing 2 calls re-clear threshold;
  otherwise 2 standalone lifecycles). The metadata row makes the
  pause visible.

This matches Phase 7c's existing handling of `system` errors: an
error mid-batch flushes the batch, the error renders loud at top
level, the trailing tool calls form a new batch. Same logic, same
visual outcome, same justification.

### 5.3 Implementation

In `renderHints.ts` `groupLifecycles` (currently at `:669`), extend
`isPassthroughStandalone` (`:703`):

```ts
function isPassthroughStandalone(
  hint: Extract<RenderHint, { kind: "standalone" }>,
): boolean {
  if (hint.taskLifecycle) return false;
  // No `hint.metadata` to check — metadata hints are no longer
  // `kind: "standalone"` under Path A. They are `kind: "metadata"`.
  // The outer dispatch in groupLifecycles checks `hint.kind !==
  // "standalone"` first, so a metadata hint flushes the buffer by
  // virtue of not being a standalone at all.
  const msg = messagesByIndex.get(hint.messageIndex);
  if (!msg) return false;
  return msg.kind === "assistant";
}
```

Under Path A the implementation is simpler than Path B because the
discriminator IS the RenderHint variant: any `kind !== "standalone"`
hint is a delimiter by construction. The `clusterMetadata` pass
runs separately (§7) and is layered on top.

### 5.4 Inside-cluster ordering

Adjacent metadata hints still cluster (per §4.1) at top level, not
inside a tool-batch group. The two passes are layered:

1. Pass 2 (Phase 7c) — `groupLifecycles` — collapses tool batches.
   Metadata hints flush the buffer and stay at top level.
2. Pass 3 (Phase 7d, new) — `clusterMetadata` — collapses adjacent
   top-level metadata hints into cluster-head + cluster-member
   triples.

The two passes don't interact: tool batches don't contain metadata
hints (delimiter rule), so the cluster pass doesn't need to know
about groups.

---

## 6. Anatomy details

### 6.1 Hover behavior

The metadata row carries a `title` attribute on the `<p>` element
holding payload-specific content:

- **Hairline rows**: `title` holds the **raw NDJSON line** (verbatim
  from `Message.raw`, truncated to 1024 chars with `…` if larger).
  Hover reveals the native browser tooltip.

- **Echo rows**: `title` holds the back-pointer string `"duplicate
  of event_msg.{user,agent}_message at line N"`. Hover reveals the
  native browser tooltip pointing at the canonical row.

```html
<p class="msg-metadata"
   data-category="control"
   title='{"type":"permission-mode","permissionMode":"default"}'>
  …
</p>

<p class="msg-metadata msg-metadata-echo"
   data-category="echo"
   title="duplicate of event_msg.agent_message at line 87">
  …
</p>
```

This is the cheapest possible "let me see what was actually there"
affordance. Native tooltip, browser-managed positioning,
keyboard-accessible via long-press / focus on touch & screen readers
(per browser conventions; not all browsers expose `title` to
keyboards uniformly but the row is also aria-labelled per §6.4).

No click-to-copy. No expand-to-show-raw. The session header's
existing **Open raw** anchor handles the "full transcript JSONL"
case; the per-row tooltip handles the "what did this one event
look like" case.

### 6.2 Focus behavior

Single-row metadata strips (hairline OR echo) are **non-focusable**
by default. They are static `<p>` elements with no interactive
children. Tab order skips them.

Cluster `<details>` summaries are focusable (native `<summary>`).
Tab moves to the summary; Enter / Space toggles open / closed.
Inside the expanded body, the nested rows are non-focusable.

Rationale: a transcript can carry dozens of metadata rows; making
every single one tab-stop is a screen-reader and keyboard-navigation
disaster. The cluster IS the focus stop; expand to inspect.

### 6.3 Reduced-motion

The single-row strip has no motion. The cluster `<details>` inherits
the global reduced-motion zero-out (200 ms → 0.01 ms). No new
motion declarations.

### 6.4 Accessibility

- The `<p>` carries `aria-label` set to a screen-reader-friendly
  rendering of the row content. For
  `permission-mode → default`, the label is `"Metadata: permission
  mode set to default"`. For an echo row, the label is
  `"Echo: duplicate of canonical user message at line 42"`. The
  label formula lives in `renderHints.ts` per category — same place
  as the `display` string.
- The cluster `<details>` `<summary>` carries
  `aria-label="N metadata events, click to expand"`. Screen readers
  announce the disclosure as a standard widget; expanding it surfaces
  the per-row labels inside.
- The `.meta-prefix` middle-dot is `aria-hidden="true"` (decorative).
- The `.meta-prefix-echo` `↺` glyph is `aria-hidden="true"` (decorative).
- The `.meta-sep` arrow / colon / pipe is `aria-hidden="true"`
  (decorative; the aria-label carries the semantic).
- Color contrast: `--color-ink-muted` on `--color-surface` measures
  **7.04 : 1 light / 7.36 : 1 dark** (Phase 7c WCAG pairs P39/P40/P41,
  re-measured in this folder's `wcag.py` as P42). Clears AA text
  (4.5:1) by margin. The echo glyph uses the SAME pair (ink-muted on
  surface) at `--text-xs` — covered by P42; no new pair introduced.

### 6.5 Empty / null payload handling

If a source event arrives with an empty payload (e.g. `last-prompt`
with an empty string, `attachment` with no `fileName`), the
renderHints layer:

- Computes `display = "(empty)"`.
- Sets `MetadataHint.fields = {}`.
- Renders normally; the row says `· last prompt: "(empty)"`.

The parser still emits the Message (no skip). A truly malformed
event (missing required field per schema) emits a warning AND a
metadata row with the best-effort display. The warning is banner-only
per the 4-bucket classification (`warning/meta` → `warning-only`).

For echo rows: if `Message.echoOf.lineOrdinal` is unset (an
unrecoverable parser state), the tooltip degrades to `"duplicate of
canonical {user,assistant} message (line unknown)"`. The aria-label
mirrors. The row still renders.

---

## 7. Implementation acceptance checklist

A numbered list the developer subagent verifies against. Each item is
testable.

7.0 **Open-question resolution** — three opens from round 1 are
    closed by the user / designer:
    - **Cluster threshold = 2** (user). All thresholds in the artifact
      reflect this.
    - **Duplicate-anchor rows surface** in the `echo` register
      (user; design per §3.6).
    - **`turn_context.approval` display** is folded into the existing
      `context` row's display formula (§3.4) — no new metaCategory;
      the field appears as ` · approval ${approval}` when present
      (designer's call).

7.1 **Resolved Decision #2 amendment** — the project-wide invariant
    "MessageKind is stable" is amended by this Phase 7d. A new
    variant `"metadata"` is added. The amendment is documented:
    - in `apps/frontend/src/features/sessions/parsers/types.ts`'s
      JSDoc on `MessageKind` (new bullet for `metadata`),
    - in `docs/features/parser-event-support.md` (matrix changelog
      entry citing Phase 7d),
    - here in this design.md (§2.1).
    The developer subagent MUST verify all three sites contain a
    cross-reference.

1. **`parsers/types.ts` — `MessageKind` grows to 8 variants** by
   adding `"metadata"`. **`MetaCategory` type added** as a
   string-literal union of exactly 8 values: `"control"`,
   `"telemetry"`, `"title"`, `"attachment"`, `"agent"`, `"prompt"`,
   `"context"`, `"echo"`. The `Message` type gains two optional
   fields: `metaCategory?: MetaCategory` (required on every
   `kind === "metadata"` message; absent on every other kind), and
   `echoOf?: { lineOrdinal: number; canonicalKind: "user" | "assistant" }`
   (set ONLY when `metaCategory === "echo"`).

2. **Claude Code parser — silent-skip block lifted**. The case block
   at `claude_code.ts:413-435` no longer `break`s silently for the
   8 metadata types. Each case emits a `Message` with
   `kind: "metadata"`, the `metaCategory` per the table in §2.4,
   and a `text` field carrying a parseable representation of the
   source payload (the parser does NOT pre-format display; the
   renderHints layer does).

3. **Codex parser — silent-skip blocks lifted**.
   - `codex.ts:334-339` (`turn_context`): emits a `kind: "metadata"`
     Message with `metaCategory: "context"`.
   - `codex.ts:674-679` (`event_msg.token_count`): emits a
     `kind: "metadata"` Message with `metaCategory: "telemetry"`.
   - `codex.ts:197-200` (`response_item.message` role user/assistant):
     **also lifted**. Emits a `kind: "metadata"` Message with
     `metaCategory: "echo"` and `echoOf` set to the canonical
     `event_msg.user_message` / `event_msg.agent_message` line on
     the same NDJSON record (Codex emits both anchors on the same
     line; the parser records the `lineOrdinal` for the back-
     pointer). The previous silent-skip-with-no-warning comment
     is replaced with a cross-reference to this design.md §3.6.

4. **Parser fixture tests** (`claude_code.test.ts`, `codex.test.ts`):
   for each of the 10 hairline variants, assert the parser emits
   one Message with `kind === "metadata"` and `metaCategory === <expected>`.
   For the 2 echo duplicate-anchor variants, assert the parser
   emits one Message with `kind === "metadata"`,
   `metaCategory === "echo"`, and `echoOf` populated with the right
   `lineOrdinal` and `canonicalKind`.

5. **`renderHints.ts` — `MetadataHint` type added** per §2.3.
   **Pass-1 renderHints** (the loop currently at `:375-538`)
   emits a `kind: "metadata"` RenderHint when the underlying
   Message has `kind: "metadata"`. The `display`, `fields`, and
   `ariaLabel` strings are computed per the table in §3.4 (for
   hairlines) and §3.6 (for echoes; display is the empty string
   but the aria-label and title carry the back-pointer).

6. **renderHints precedence**: task-lifecycle and metadata are
   carried on DIFFERENT MessageKinds under Path A (`system` vs
   `metadata`), so a message cannot carry both. The renderer's
   exhaustive switch does not need a tiebreaker.

7. **`isPassthroughStandalone` updated** at `renderHints.ts:703-712`:
   no `hint.metadata` check needed under Path A; the outer
   `groupLifecycles` dispatch flushes the buffer whenever the next
   hint is `kind !== "standalone"`. Metadata hints with `kind:
   "metadata"` flush by construction. The mixed-tool grouping pass
   treats metadata hints as delimiters per §5.

8. **`clusterMetadata` pass added** as a third pass in
   `renderHints.ts` after `groupLifecycles`. It walks the hint stream
   and replaces adjacent runs of N ≥ `METADATA_COLLAPSE_THRESHOLD`
   (= 2) `kind: "metadata"` hints with one
   `kind: "metadata-cluster-head"` carrying `messageIndices: number[]`
   and `members: MetadataHint[]`, followed by N-1
   `kind: "metadata-cluster-member"` hints (one per member, each
   carrying `clusterHeadIndex`).

9. **New `RenderHint` variants: `"metadata"`, `"metadata-cluster-head"`,
   `"metadata-cluster-member"`** per §2.3. The renderer's exhaustive
   switch gains three branches. Cluster-member is inert at the top
   level (the head's `<details>` body re-renders the members from
   `head.members`).

10. **`METADATA_COLLAPSE_THRESHOLD` exported as a `const`** at the
    top of `renderHints.ts`, alongside `GROUP_THRESHOLD`. Value is
    **2**. Phase 7c polish-r2 precedent cited in the comment.

11. **`TranscriptView.tsx` `HintRow` dispatch** gains:
    - A new `case "metadata"` branch that routes to
      `<MetadataRow hint={hint.metadata} msg={msg} />` for hairlines
      OR `<MetadataEchoRow hint={hint.metadata} msg={msg} />` for
      echoes (the component picks based on `hint.metadata.category`).
      For simplicity, ONE `<MetadataRow>` component handles both
      and switches internally on category.
    - A new `case "metadata-cluster-head"` branch that routes to
      `<MetadataCluster head={hint} />`.
    - A new `case "metadata-cluster-member"` branch that returns
      `null` (members are rendered inside the head, not at top level).

12. **`<MetadataRow>` component** renders the recipe in §3.2 (for
    hairline categories) or §3.6 (for the echo category): a `<p
    class="msg-metadata" data-category={...} title={...}
    aria-label={...}>` with either the 4 inner spans
    (prefix/label/sep/value) or the single `meta-prefix-echo` glyph
    span. No `<details>`, no interactivity.

13. **`<MetadataCluster>` component** renders the recipe in §4.4:
    a `<details class="msg-metadata-cluster">` with a `<summary>`
    showing the count and a body `<ol>` of nested `<MetadataRow>`s
    re-rendered from `head.members`.

14. **CSS recipe added** to `TranscriptView.css`: the rules in §3.2,
    §3.6, and §4.4. Per-category typography overrides at §3.2 bottom.

15. **No new tokens introduced**. `grep -cE '^\s*--'
    apps/frontend/src/styles/tokens.css` continues to return 83.

16. **No new hex literals**. `rg -o '#[0-9A-Fa-f]{3,8}' apps/frontend/src |
    wc -l` continues to return 24.

17. **No new motion declarations**. Cluster `<details>` inherits the
    existing global `--motion-disclosure` rule. Reduced-motion zero-out
    inherited.

18. **No new runtime dependencies**. `apps/frontend/package.json`
    `dependencies` is byte-identical.

19. **`docs/features/parser-event-support.md` matrix updated**:
    - All **12** rows (the 10 information-bearing variants AND the
      2 echo duplicate-anchor variants) update their "Render
      treatment" column from `silent` to `metadata-hairline` (10
      rows) or `metadata-echo` (2 rows). The matrix changelog cites
      Phase 7d and notes the Resolved Decision #2 amendment.

20. **renderHints tests** (`renderHints.test.ts`): one test per
    category proving the right `MetadataHint.display` and
    `ariaLabel` strings (including echo with `echoOf` populated).
    One test for cluster collapse at threshold 2 (N=2 collapses,
    N=1 does not). One test for mixed-category clustering
    (hairline + echo collapse together). One test for a metadata
    hint flushing a tool-batch buffer.

21. **TranscriptView render-coverage tests**
    (`TranscriptView.test.tsx`): one assertion per category proving
    the rendered tree contains `.msg-metadata[data-category={X}]`.
    For hairlines: assert `.meta-label` text matches the table,
    `.meta-value` text matches. For echoes: assert
    `.msg-metadata-echo` exists and `.meta-prefix-echo` content is
    `↺`. One assertion for `.msg-metadata-cluster > summary`
    rendering with the right count text (`2 metadata events`).

22. **WCAG**: `python3 working/phase-7d/designs/wcag.py` runs
    cleanly. Output emits exactly 1 pair (`ink-muted` on `surface`
    — re-measured from Phase 7c as P42). The echo register reuses
    the SAME token pair so no second pair is introduced. All pairs
    marked "pass".

23. **Hover tooltip**: the `<p class="msg-metadata">` element has
    its `title` attribute set per §6.1 (raw NDJSON for hairlines,
    back-pointer string for echoes). Manual acceptance: hovering
    over any metadata row in a real session shows the right tooltip
    in the browser.

24. **Aria labels**: the `<p>` carries `aria-label` per §6.4. The
    cluster summary carries `aria-label="N metadata events, click
    to expand"`. Screen reader walk-through during M3 acceptance.

25. **Accessibility audit**: keyboard navigation skips standalone
    metadata rows (no focus stop) and lands on cluster summaries
    (one focus stop per cluster). Tested manually: Tab through the
    transcript with a metadata-heavy fixture.

26. **Fixture sweep**: a new test under `apps/frontend/scripts/`
    (mirror of `parser-warning-sweep.ts`) loads the 12 metadata
    fixture files (10 hairline + 2 echo) and asserts each produces
    exactly one `kind: "metadata"` hint after `renderHints()`.

27. **Coexistence with task-lifecycle**: a synthetic fixture where a
    `task_started` row is followed by a metadata row asserts the
    task-lifecycle card renders for the task-started, and the
    metadata hairline renders for the metadata — they do not
    interfere. The metadata row flushes any preceding tool batch.

28. **Visual variants in prototype**: the
    `working/phase-7d/designs/prototype.html` page renders all 12
    surfacing variants in BOTH light and dark mode side-by-side,
    including the echo variant, the cluster-collapsed (N=2), and
    cluster-expanded states.

29. **Matrix doc clean-up**: at Phase 7d close,
    `docs/features/parser-event-support.md` is updated so the matrix
    "12 silenced events" row count drops to **0** — every silenced
    row gains a render treatment. The reviewer must verify this
    verbatim.

30. **Open-raw affordance preserved**: the session header's existing
    "Open raw" anchor still resolves to the raw NDJSON file. The
    per-row hover tooltip is supplementary, not a replacement.

31. **Exhaustiveness sweep — every per-kind switch gains a `case
    "metadata"`**. The developer subagent runs a grep for every
    `switch (msg.kind)` / `case "user":` / `case "assistant":`
    site in `apps/frontend/src/features/sessions/`. The expected
    sites (non-exhaustive list to seed the sweep):
    - `parsers/types.ts` — `MessageKind` union (definition site).
    - `renderHints.ts` — Pass-1 standalone classifier; metadata
      messages produce `kind: "metadata"` hints.
    - `TranscriptView.tsx` — `HintRow` dispatch (per item 11).
    - `SkimView.tsx` — if it switches on `Message.kind`, add a
      no-op `case "metadata": return null;` branch. Metadata rows
      do NOT participate in skim blocks.
    - `buildSkim.ts` — `case "metadata": continue;` to skip
      metadata rows when computing user_turn / agent_only ranges.
    - `parsers/event-support-coverage.test.ts` — the matrix
      assertion test gains 12 rows that now expect the metadata
      treatment.
    - Any other per-kind dispatch surfaces.
    TypeScript's exhaustiveness checker WILL flag missing cases as
    build errors; the developer subagent verifies all flagged
    sites are handled.

---

## 8. States & variants enumeration

| State                                  | Treatment                                                                  |
|----------------------------------------|----------------------------------------------------------------------------|
| standalone-single (hairline category)  | `<p class="msg-metadata" data-category={X}>` — single line, ink-muted      |
| standalone-single (echo category)      | `<p class="msg-metadata msg-metadata-echo" data-category="echo">` — single `↺` glyph, no label/value, tooltip back-pointer |
| adjacent-collapsed-collapsed (N ≥ 2)   | `<details class="msg-metadata-cluster">` with summary "N metadata events"  |
| adjacent-collapsed-expanded            | Same `<details>` open; nested `<ol>` of individual `.msg-metadata` rows    |
| mixed cluster (hairline + echo)        | Collapses together at N ≥ 2; expanded body renders each row in its native register |
| inside-tool-batch-group                | **Not possible** — metadata flushes the batch (§5). Renders at top level.  |
| dark mode                              | Same recipe; `--color-ink-muted` swaps to dark-mode token (7.36 : 1)        |
| reduced motion                         | Cluster `<details>` transition snaps; single-row strip is static (no-op)   |
| hover (hairline)                       | Native browser tooltip shows `Message.raw`. No CSS hover state.            |
| hover (echo)                           | Native browser tooltip shows "duplicate of event_msg.{user,agent}_message at line N" |
| focus-visible (single-row)             | **Not focusable** — Tab skips                                              |
| focus-visible (cluster summary)        | Native `<summary>` focus ring (Phase 5 inherited)                          |
| screen reader (hairline)               | Announces `aria-label`: "Metadata: <category> <display>"                    |
| screen reader (echo)                   | Announces `aria-label`: "Echo: duplicate of canonical <user/assistant> message at line N" |
| screen reader (cluster collapsed)      | Announces "Disclosure: N metadata events, click to expand"                 |
| screen reader (cluster expanded)       | Announces each nested row's aria-label in order                            |
| empty payload (hairline)               | `display = "(empty)"`; row renders normally                                |
| oversize payload (hairline)            | `display` truncated to 78 chars + U+2026 `…`; full payload in `title` tooltip |
| missing echoOf line                    | Tooltip degrades to "...(line unknown)". Row still renders.                |
| warning-only attached to metadata row  | The row renders normally; banner carries the warning (no inline chip)      |

---

## 9. Token consumption set

Every `var(--…)` reference in the prototype and the recipe above.
Phase 7d introduces **zero** new tokens.

### Color tokens (3)

- `--color-surface`
- `--color-ink-muted`
- `--color-border` (cluster summary native disclosure triangle inherits browser default; not load-bearing)

### Typography tokens (5)

- `--font-display` (italic small-caps for title/prompt values; middle-dot prefix glyph)
- `--font-chrome` (uppercase letter-spaced label; echo glyph)
- `--font-mono` (telemetry/control/attachment values)
- `--text-xs`
- `--leading-tight` (1.25 — already in tokens.css; the row is single-line and uses tight leading)

### Spacing tokens (4)

- `--space-1`, `--space-2`, `--space-3`, `--space-6`

### Radius tokens (0)

The metadata row has no panel and no border-radius. The cluster
`<details>` has no panel and no border-radius. Zero radius tokens
consumed.

### Motion tokens (2 inherited)

- `--motion-disclosure`, `--ease-in-out` (cluster `<details>`
  block-size transition; inherited from `global.css`)

### Total

3 color + 5 typography + 4 spacing + 0 radius + 2 motion = **14 tokens
consumed**, all from the existing 83-token set. **Zero new tokens.**

---

## 10. WCAG measurements

No NEW pairs are introduced. The metadata row (hairline OR echo)
uses `--color-ink-muted` on `--color-surface`, which is identical to
Phase 7c WCAG pairs P39, P40, P41 — re-measured here as P42 in
`wcag.py` for completeness.

| Pair  | Surface                                                | Light    | Dark    | Bar       | Margin   |
|-------|--------------------------------------------------------|----------|---------|-----------|----------|
| P42   | `.msg-metadata` text (ink-muted) on bare surface       | 7.04:1   | 7.36:1  | 4.5 (AA)  | +2.54    |

The pair covers BOTH the hairline category text (label / separator /
value) AND the echo glyph (`.meta-prefix-echo`), because the echo
glyph uses the SAME ink-muted/surface pair at `--text-xs`. No
second pair needed.

The decorative middle-dot `.meta-prefix` and the arrow/colon
`.meta-sep` are aria-hidden but visible; same token pair, same
measurement.

**Rejected alternatives** (documented for the audit trail; logged
in `wcag.py` as P43-R):

- `--color-border` on `--color-surface` as a "subdued ink" for the
  echo glyph: measures **1.49:1 light / 1.35:1 dark** (per Phase 7c
  same-pair measurements). Fails BOTH AA text (4.5:1) AND SC 1.4.11
  non-text (3:1) in both modes. Phase 7c uses this token pair only
  for decorative 1 px borders, where SC 1.4.11 exempts decorative
  hairlines; the echo glyph carries information (presence marker
  for a duplicate-anchor event), so the exemption does not apply.
  Rejected — the prompt requires AA for any user-readable text and
  SC 1.4.11 for the glyph indicator.

The pair clears AA text by margin in both modes. See `wcag.py` +
`wcag-output.txt`.

**No new color tokens. Token count invariant holds at 83. Hex
literal invariant holds at 24.**

---

## 11. Decisions & tradeoffs

### 11.0 Path A vs Path B — amendment to Resolved Decision #2

**Choice**: Path A — new `MessageKind = "metadata"` variant. The
amendment to Resolved Decision #2 is explicitly approved by the user
in round 2 of the design review.

**Round-1 recommendation**: Path B (one optional `metaCategory`
field on `Message`, discriminator on `RenderHint`). Rejected by
user.

**Trade-off**: Path A touches every per-kind switch site in the
codebase (parsers/types.ts, renderHints.ts, TranscriptView.tsx,
SkimView.tsx, buildSkim.ts, event-support-coverage tests, the matrix
doc). TypeScript's exhaustiveness checker surfaces every missing
branch as a build error; that mechanically enforces correctness but
expands the developer-side change surface. The user accepted that
cost for cleaner semantic discrimination (true system notes stay
in `kind: "system"`; session-level chrome moves to `kind:
"metadata"`).

### 11.1 Marginalia register (vs. badge / card / icon-row)

**Choice**: a single-line strip with no panel chrome, ink-muted
color, Fraunces italic small-caps label, indented 24 px from the
column edge.

**Alternative**: a small pill-shaped badge ("METADATA · permission
mode → default") matching the chip vocabulary. Rejected — the chip
register is reserved for parser-warnings (Phase 7c §5); reusing it
for metadata creates ambiguity ("is this a warning or just info?").

**Alternative**: a tiny card with a left rail at `--color-border`
(matching the lifecycle card's sienna rail at lower-intensity).
Rejected — adds chrome the row doesn't need; the row is text, not a
data card. A panel implies "click to expand the full payload" which
is not the intended affordance.

**Alternative**: an icon prefix (lock for control, hash for token
counts, paperclip for attachment, etc.). Rejected — the design
language does not have an icon vocabulary; introducing one for
12 silent events is a heavyweight precedent. The middle-dot is the
existing vocabulary.

**Tradeoff**: the marginalia row is visually quiet enough that some
readers may miss it on a quick skim. That IS the design intent —
metadata is footnote-level. The session-level "Open raw" anchor
remains the truth source for anyone auditing the full stream.

### 11.2 Hover tooltip vs. click-to-expand vs. click-to-copy

**Choice**: hover tooltip via native `title` attribute carrying
`Message.raw` (hairlines) or the back-pointer string (echoes).

**Alternative**: click expands the row to show raw JSON. Rejected —
a metadata-heavy session could have 50+ rows; making each one
independently expandable creates a tab-stop explosion and the
cluster-collapse feature loses its discoverability.

**Alternative**: click-to-copy the raw line to clipboard. Rejected —
no other surface in TranscriptView has copy-to-clipboard; introducing
it for one row type is inconsistent and adds JS interaction the
Archive-room aesthetic doesn't have elsewhere.

**Tradeoff**: native tooltips are not uniformly keyboard-accessible
across browsers. The aria-label carries the SR cue regardless, and
the cluster summary + the session-header Open-raw anchor provide
fallback paths.

### 11.3 Cluster threshold = 2

**Choice**: `METADATA_COLLAPSE_THRESHOLD = 2`.

User instruction in round 2. Matches Phase 7c polish-r2's lowered
`GROUP_THRESHOLD` (3 → 2).

**Round-1 recommendation**: threshold 3 (to keep 2-row turn-boundary
pairs inline). Rejected by user.

**Trade-off**: every 2-row turn boundary (the common
`permission-mode + last-prompt` pair) now hides behind a `<details>`
disclosure. A reader who wants to see the typical-case metadata
must click. The trade-off is acceptable because (a) the typical-case
metadata is usually predictable (the same `permission-mode = default`
and a `last-prompt` echoing the user's previous message), and (b)
the inline cost (two adjacent muted hairlines at every turn boundary)
is paid on every transcript view.

### 11.4 Metadata is a delimiter (flushes tool batches)

**Choice**: §5.1 — metadata hints flush the tool-batch buffer.

**Alternative**: metadata hints are passthrough inside groups.
Rejected — a `permission-mode` event mid-batch is a structural break
the reader should see; hiding it inside a collapsed group defeats the
honesty constraint.

**Tradeoff**: a `last-prompt` event between two batched tool calls
splits what would have been a single group of N into two groups of
(M, N-M-1). Acceptable — the temporal cue beats the visual
compactness.

### 11.5 Duplicate-anchor rows surface in the echo register

**Choice**: §3.6 — `response_item.message` role=user/assistant
surface as `↺` glyph rows. The matrix entries move from `silent`
to `metadata-echo`.

User instruction in round 2: "literally no event hidden." The echo
register is the designer's response to the second half of that
instruction — "but we may render in the minimally so that it won't
hurt reader's reading experience."

**Round-1 recommendation**: stay silenced because the canonical
`event_msg.{user,agent}_message` already renders the same content.
Rejected by user.

**Trade-off**: every Codex transcript gains 2N echo rows (one per
user turn + one per assistant turn). The cluster collapse rule
(§4) compresses adjacent runs of 2+ into disclosures, so the
visible footprint per turn is typically a single `↺` glyph or a
collapsed cluster. Worst-case overhead: ~16 px per N echo rows
where N ≥ 2.

**Trade-off**: a reader unfamiliar with the echo glyph may interpret
`↺` as a "retry" affordance (unicode anticlockwise arrow). The
hover tooltip + aria-label resolve the meaning; the design accepts
the brief glyph-recognition cost in exchange for using only existing
unicode (no icon font, no SVG).

### 11.6 Approval policy folded into `turn_context`

**Choice**: §3.4 — when `turn_context.approval` is present, the
display formula appends ` · approval ${approval}`.

**Alternative**: a separate `metaCategory = "approval"` row. Rejected
— `approval` is one of several optional fields on `turn_context`
(alongside `model` and `sandbox`); it never appears in isolation;
inventing a new metaCategory for it would split what the source
event treats as a unit.

**Alternative**: omit it from the display formula entirely. Rejected
— `approval` is a security-relevant control state; hiding it from
the marginalia row defeats the "no event hidden" rule.

**Tradeoff**: the `turn_context` row can grow to ~40-50 chars when
all four optional fields are present (cwd + model + sandbox +
approval). Acceptable — the truncation rule (§3.4) handles
oversize at 78 chars.

### 11.7 No per-category color

See §3.5. Single tone across all categories is intentional.

### 11.8 Single-row not focusable

See §6.2. The cluster IS the focus stop; expand to inspect.

---

## 12. References

Spec sections this design relies on:

- `working/phase-7c/designs/design.md` §6.5 — the task-lifecycle
  treatment that established the chapter-marker register Phase 7d
  reuses for tone (Fraunces italic small-caps marginalia).
- `working/phase-7c/designs/design.md` §15.7 + §15.4 — the warning
  classification + warning-on-collapsed-group precedent that Phase 7d
  reuses for `warning/meta → warning-only` metadata-attached warnings.
- `working/phase-7c/designs/design.md` polish-r2 — the
  `GROUP_THRESHOLD` lowered from 3 to 2; Phase 7d adopts the same
  threshold for `METADATA_COLLAPSE_THRESHOLD`.
- `working/phase-5.md` §Color philosophy + §Typography tokens — the
  Archive-room aesthetic + the Fraunces italic small-caps marginalia
  register Phase 7d reuses.
- `apps/frontend/src/features/sessions/parsers/claude_code.ts:413-435`
  — current silent-skip site for the 8 Claude Code variants.
- `apps/frontend/src/features/sessions/parsers/codex.ts:197-200`,
  `:334-339`, `:674-679` — current silent-skip sites for the 4 Codex
  variants.
- `apps/frontend/src/features/sessions/parsers/types.ts:30-65` — the
  `MessageKind` union (grows by one variant in Phase 7d) and the
  `Message` shape (gains two optional fields).
- `apps/frontend/src/features/sessions/renderHints.ts:117-180` — the
  existing `RenderHint` union; Phase 7d adds three new variants
  (`metadata`, `metadata-cluster-head`, `metadata-cluster-member`).
- `apps/frontend/src/features/sessions/renderHints.ts:703-712` — the
  `isPassthroughStandalone` helper Phase 7d touches.
- `apps/frontend/src/features/sessions/TranscriptView.tsx:414-433` —
  the existing `case "standalone"` branch; Phase 7d adds three new
  top-level cases adjacent to it.
- `docs/features/parser-event-support.md` — the matrix to update at
  Phase 7d close (12 rows touch the per-row "Render treatment"
  column; the silenced-count drops to 0).
- `tests/fixtures/parser-events/{claude_code,codex}/*` — the
  fixture files used to ground per-category display formulas.

---

End of design.md.
