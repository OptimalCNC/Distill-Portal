# Wireframe 12 — Task lifecycle (chapter marker)

Spec ref: `working/phase-7c.md` §Goal & Scope line 28 +
§Milestone 3 line 211 (every 🎨 deferred row lands on a specific,
not generic, render treatment).

Matrix rows this wireframe satisfies:
- [`codex-event-msg-task-started`](../../../docs/features/parser-event-support.md#codex-event-msg-task-started)
  (parser: `apps/frontend/src/features/sessions/parsers/codex.ts:473`)
- [`codex-event-msg-task-complete`](../../../docs/features/parser-event-support.md#codex-event-msg-task-complete)
  (parser: `apps/frontend/src/features/sessions/parsers/codex.ts:492`)

What the parser emits today, verbatim:

```ts
// codex.ts:482 (task_started case)
text: `task_started · turn ${turn}`,
kind: "system",

// codex.ts:500 (task_complete case)
text: `task_complete · turn ${turn}`,
kind: "system",
```

`MessageKind` stays `system` (Resolved Decision #2 freezes it). The
visual differentiator is carried by a NEW `RenderHint` attribute —
not a new MessageKind, and not a new RenderHint variant either —
an optional `taskLifecycle?: "started" | "complete"` field on the
existing `standalone` RenderHint shape.

## Visual recipe

```
.transcript-stream                                  max-inline-size 70ch
+--------------------------------------------------------------+
|                                                              |
|  +--------------------------------------------------------+  |
|  | gap: var(--space-2)                                    |  |
|  | gap: var(--space-2)                                    |  |
|  | ── ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ── (1 px border, --color-border)
|  |                                                        |  |
|  |   Task started   ·   turn abc123                       |  |
|  |   ─────────      ─   ─────────────                     |  |
|  |   Fraunces       chrome  mono --color-ink-muted        |  |
|  |   italic SC      "·"     --text-xs                     |  |
|  |   --font-display          turn label                   |  |
|  |   --color-ink-muted                                    |  |
|  |   --text-xs                                            |  |
|  |   letter-spacing 0.12em                                |  |
|  |                                                        |  |
|  | ── ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ── (1 px border, --color-border)
|  +--------------------------------------------------------+  |
|     gap: var(--space-4) — same rhythm as other cards         |
|  +--------------------------------------------------------+  |
|  |                                                        |  |
|  | ── ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ── |
|  |                                                        |  |
|  |   Task complete  ·   turn abc123                       |  |
|  |   ──────────────                                       |  |
|  |   Fraunces italic SC  · chrome  mono                   |  |
|  |                                                        |  |
|  | ── ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ── |
|  +--------------------------------------------------------+  |
+--------------------------------------------------------------+
```

The recipe is a **chapter-marker pair**: top + bottom hairline
borders, no left/right border, no corner radius, no background tint.
The Fraunces italic small-caps label sits centered; the mono turn
id trails it with a chrome middle-dot separator. Both spans are
`--color-ink-muted` so the row reads as marginalia in editorial
register.

## Vocabulary placement vs neighbors

| Card                | Border       | Background                  | Label register                | Discriminator                                |
|---------------------|--------------|-----------------------------|-------------------------------|----------------------------------------------|
| `.msg-boundary`     | full chapter | bare (chapter break)        | Fraunces italic display       | inherited from M4                            |
| `.msg-task-lifecycle` | hairline pair (top + bottom) | bare              | Fraunces italic small-caps    | NEW — Phase 7c                               |
| `.msg-system`       | none         | bare (chrome text only)     | chrome-text uppercase         | inherited from M4                            |

The task-lifecycle card sits BETWEEN `.msg-system` (a quiet chrome-
text marker) and `.msg-boundary` (a loud chapter break). A Codex
turn opens and closes 1× each, so the pair brackets the work-
history naturally — quieter than a boundary, more specific than
"system".

## Copy

| RenderHint attribute       | Visible label (Fraunces italic SC) | Mono trailing span     |
|----------------------------|-------------------------------------|------------------------|
| `taskLifecycle: "started"` | `Task started`                      | `turn {turn-id}`       |
| `taskLifecycle: "complete"`| `Task complete`                     | `turn {turn-id}`       |

Both label strings cap at "Task started" / "Task complete" (not
"TASK STARTED" — the small-caps font-variant handles the uppercase
optical, while the underlying string stays mixed-case for
screen-reader friendliness).

The trailing turn id is rendered verbatim from the parser-emitted
text segment `· turn {turn}` (codex.ts:482/:500). When the turn
field is missing, the parser already emits `(unknown turn)` —
that string renders unchanged.

## Hover / focus / reduced-motion

The card is **non-interactive**. No hover state; no focus ring;
no `<details>`; no expand/collapse; no inline warning chip (the
parser does not attach `messageIndex` warnings to these rows).
Reduced-motion is a no-op — the recipe is static by construction.

## Accessibility

- The card is an `<article>` with an `aria-label` of the form
  `Task started for turn abc123` (or `Task complete for turn abc123`).
  Screen readers announce it as a discrete unit.
- The middle-dot `·` is `aria-hidden="true"` (decorative).
- The label and turn id are plain text in `--color-ink-muted` on
  `--color-surface`. Light: 7.04 : 1. Dark: 7.36 : 1. Both clear
  AA (4.5 : 1).
- The two hairline borders are decorative reinforcement (the
  chapter-break visual cue); the card's discrimination from the
  surrounding stream is carried by the typography contrast, not
  the border.

## Load-bearing CSS class

`.msg-task-lifecycle` — this matches the existing `assertTreatment`
selector at
`apps/frontend/src/features/sessions/TranscriptView.event-coverage.test.tsx:195`.
The test lift for the `task_lifecycle` treatment passes when the
rendered tree contains this selector.
