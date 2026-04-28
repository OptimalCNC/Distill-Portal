# Phase 5: Session Views & Master-Detail Inspection Layout

## Status

Frozen at the Chunk A commit on `main`. Subsequent chunks reference this commit's SHA. Phase 4 (the unified-list inspection surface) shipped at `f97181d` (2026-04-27) and is the baseline this phase mutates.

## Why this phase exists

Phase 4 shipped a unified inspection list that solved per-row search/filter/sort/pagination and surfaced an 18-field metadata drawer over a 20-line raw NDJSON preview. The list is correct but layout-heavy: eight content-driven columns (Select / Status / Tool / Title / Project / Updated / Stored Copy / Source Path) consume 1100–1200 px of the 1400 px main, and the modal drawer (`width: min(92vw, 640px)`) overlays the table rather than coexisting. This leaves no surface room to mount the session-content features the PRD describes (transcript in chronological order, skim view with the four block kinds, expand-block-into-raw, derived metadata, eventually summaries / notes / tags / highlights).

Phase 5 restructures the inspection page into a **persistent split-pane master-detail** surface: compact session list on the left, real session-content view on the right. The list compresses from eight columns to four essentials; dropped fields move to a Metadata tab in the right pane. The right pane gains four tabs — Transcript / Skim / Raw / Metadata — backed by per-tool client-side parsers that turn the existing raw NDJSON stream into a typed message timeline plus skim-block boundaries. LLM summary generation and user annotations are explicitly deferred; SkimView renders the disabled-summary placeholder copy mandated by `PRD.md` line 223 instead of generating text.

Reference research (Singularity, Agentlytics, Code Insights — AIDE Memory / Pieces LTM / XHawk are behind marketing pages) converged on this same shape: compact 4-essentials list + right-side detail pane with tabs.

## Design Language

Phase 5 commits to a single intentional aesthetic — **Archive-room** — and threads it through every visible surface. The mental model is a quiet, well-lit reading room: you are reviewing your own past correspondence with AI collaborators, not refreshing a feed. The dominant verbs are *read*, *consult*, *recall*. Restraint, ink-on-paper rhythm, and editorial discipline carry the weight that animations and gradients carry in generic SaaS UIs.

This is a load-bearing decision. Every Phase 5 chunk implements it; Phase 4 components inherit it via token + global-CSS swap (no Phase 4 component is rewritten — only its tokens shift).

### Aesthetic principles

- **Editorial, not dashboard.** Reading content (transcript, skim, raw) gets generous gutters and a comfortable measure (~70–80ch). List chrome stays dense.
- **Hush over hustle.** Motion under 250 ms; no entrance animations longer than a single-paint frame budget; reduced-motion fully zeroes durations.
- **Hairline over shadow.** Separators are 1 px hairlines at `--color-border`; chrome carries no drop shadows except the existing Phase 4 sticky action bar / toast surfaces.
- **Sharp over soft.** Panels, tabs, the split-pane shell, and the table itself use square corners. Buttons + status pills retain the existing 4 px radius for tactile cues.
- **One accent, used surgically.** A warm sienna/amber accent (`--color-accent`) tints selected row backgrounds, the active tab indicator, and the deep-link pulse — nothing else. Status colors stay distinct and reserved (success / warning / danger) per Phase 4.
- **Texture over flat.** The right-pane reading surface carries a 1 px inline-SVG noise overlay (~1 KB data URL) at ~3% opacity for paper-grain warmth in light mode. Suppressed under `prefers-reduced-motion: reduce` and in dark mode (where the warm ink already carries the mood).

### Typography stack

Three fonts. Two are system stacks; one is a single self-hosted variable font for the editorial display layer. No JS dep, no font-loading library.

| Role | Stack | Used for |
|------|-------|----------|
| **Display** | `"Fraunces", Charter, "Iowan Old Style", Georgia, serif` | App title, session-pane title, empty-pane preface, skim chapter-break labels |
| **Chrome** | `-apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto, sans-serif` | Table cells, filters, buttons, badges, tab labels, metadata `<dt>` / `<dd>` |
| **Mono** | `"JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace` | Code segments, raw NDJSON, rowKey, sourcePath, line/message position markers, tool argument JSON |

Fraunces is a variable serif with optical sizing — playful at display sizes, formal at body. Self-hosted via a single ~80 KB woff2 in `apps/frontend/public/fonts/` (subset to Latin + small caps + italic axis only; full file would be ~250 KB unsubsetted). The @font-face rule declares `size-adjust` and `ascent-override` so the system-serif fallback (`Charter / Georgia`) takes over without layout shift if the file fails to load. M2 ships the @font-face rule + fallback wiring; M5 adds the chapter-break labels + empty-pane preface that exercise the display layer.

Self-hosting a font file is *not* a runtime dependency under the spec's dep policy — it is a static asset. Documented explicitly in `docs/dependency-rules.md` at M2 to avoid future confusion. If a maintainer wants to drop Fraunces entirely, deleting the @font-face rule + the woff2 file yields a still-cohesive system-serif aesthetic; tokens make this reversible.

### Color philosophy

- **Light mode** is warm-paper. Surface ≈ `oklch(98% 0.01 70)` (creamy white); ink ≈ `oklch(20% 0.02 70)` (deep warm gray). Subtler than pure white-on-black; reads like printed paper under indoor light.
- **Dark mode** is deep-ink, slightly warm. Surface ≈ `oklch(15% 0.01 70)`; text ≈ `oklch(92% 0.01 70)`. Avoids the cold steel feel of `#000` / `#fff`.
- **Accent**: sienna/amber, ≈ `oklch(60% 0.15 50)`. Identical hue light + dark; lightness/chroma tuned for AA on each surface.
- **Status colors** (success / warning / danger) inherit from Phase 4 baseline; only the surface + ink + accent shift. WCAG AA must hold for every status pill on each new surface.
- **All color literals stay in `tokens.css`.** The Phase 4 baseline of 24 `#`-prefixed literals grows only with documented WCAG-driven additions per the M6 hex audit.
- **`oklch()` is the source-of-truth color space.** Chromium 111+ ships native support; the e2e target is current Chromium. Where a hex fallback is needed for non-target browsers, `tokens.css` declares an `@supports not (color: oklch(0% 0 0))` block — the existing 24 hex literals form that fallback layer.

### Spatial rhythm

4 px base unit, spacing scale 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 (existing Phase 4 tokens, made explicit here for cross-section reference).

- **List panel:** dense. Row min-height 36 px (8 px vertical padding × 2 + chrome line-height). Cell gutter 8 px. Filter strip vertical padding 12 px. Selected row subtly tinted; hovered row subtly tinted (different intensity).
- **Reading content (right pane):** generous. Transcript message panel padding 16 px 24 px, max-inline-size 70ch for the body content. Skim user-message panel padding 24 px 32 px. Skim chapter-break vertical breathing 32 px above + below.
- **Tab strip:** 12 px gap between tabs; 2.5 rem strip height; hairline indicator 1 px high spanning the active tab's text width (not the full cell).
- **Split-pane gutter:** a single 1 px vertical hairline at `--color-border`. No 16 px gap. The two panes belong to one document.

### Signature details

The moments a returning user remembers. Each is small; together they make the surface feel intentional. Each is enumerated so M6 reviewers can verify.

1. **The chapter break.** Skim view `boundary` blocks render as a full-width 1 px hairline with a centered small-caps Fraunces italic label ("SESSION RESUMED" / "CONVERSATION COMPACTED"). 32 px vertical breathing room above + below. Reads like a chapter break in a printed book — reinforces the archive metaphor without a single icon.

2. **The page-turn fade.** Selecting a session: right-pane content cross-fades over 200 ms (opacity 0 → 1) combined with a 4 px translate-from-right. Subtle. Combined with the URL update + the list-row deep-link pulse, it feels like opening a folder rather than clicking a tab.

3. **The deep-link pulse.** Arriving via `?session=<rowKey>` URL: the matched list row pulses warm-amber for 600 ms (background `color-mix(in srgb, var(--color-accent) 22%, transparent)` → transparent) so the URL → row binding is immediately legible. **One-shot** animation on URL-driven mount only — never on click-driven selection.

4. **The hairline gutter.** The split-pane divider is a single 1 px line, not a styled rail. Visual statement: one document, two views.

5. **The tab indicator slide.** When the user moves between tabs, the 1 px ink-stroke indicator slides between tabs with 120 ms ease-out (instead of teleporting). Implementation: a single absolutely-positioned indicator inside the tablist, with `transform: translateX` driven by an active-tab `data-active-tab` attribute. Pure compositor animation (no layout). Suppressed under `prefers-reduced-motion`.

6. **The reading wash.** Right-pane reading surface carries a 1 px inline-SVG noise overlay at ~3% opacity (light-mode only). The texture is invisible at a glance but adds the warmth that distinguishes a reading surface from a chrome surface.

These six are explicitly enumerated so reviewers can verify them at M6 close.

## Motion & Micro-interactions

A single motion budget governs all of Phase 5. Reduced-motion users never see any of it; the table below is the comprehensive enumeration so reviewers can audit at chunk close.

| Surface | Property animated | Duration | Easing | Trigger |
|---------|--------------------|----------|--------|---------|
| Tab strip indicator | `transform: translateX` | 120 ms | `cubic-bezier(0.4, 0, 0.2, 1)` | active-tab change |
| Tab panel cross-fade | `opacity` | 120 ms | `ease-out` | active-tab change |
| Disclosure (`<details>`) expand/collapse | `block-size` (via `interpolate-size: allow-keywords`) | 200 ms | `ease-in-out` | user toggle |
| Row hover tint | `background-color` | 80 ms | `linear` | pointer enter |
| Selected row tint | `background-color` | 120 ms | `ease-out` | selection change |
| **Deep-link pulse** | `background-color` (one-shot) | 600 ms | `ease-out` | URL-driven selection on mount only |
| Session-pane content fade | `opacity` + `translateX(4px → 0)` | 200 ms | `ease-out` | `selectedRowKey` change |
| Skim-block stagger on first paint | `opacity` + `translateY(4px → 0)` per block | 40 ms × N (max 8 blocks) | `ease-out` | first paint per session |
| Truncation banner appearance | `opacity` | 120 ms | `ease-out` | `parsed.truncated` becomes true |
| Toast queue (existing Phase 4) | unchanged | unchanged | unchanged | n/a |

### Reduced-motion

A single rule in `global.css`:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

This zero-out is testable in M6's WCAG checklist: with reduced-motion on, every transition completes within one paint frame. The signature noise-overlay also disappears under this query (the wash texture is decorative).

### Performance budget

Most animations are `transform` and `opacity` only — both compositor-cheap.

**Documented exemption: disclosure (`<details>`) expand/collapse.** This animates `block-size` via the modern `interpolate-size: allow-keywords` CSS feature — a layout-touching transition. The exemption is intentional: disclosures are central to Skim view ("Agent reaction" toggle, oversized-message expansion, agent-only expansion) and instant or transform-based reveal hurts the editorial reading flow. The cost is bounded:

- A disclosure animation reflows only its own subtree, not the rest of the page (the parent layout absorbs the height delta).
- Skim has at most 1 disclosure animation in flight at a time (user toggles one at a time).
- 200 ms duration with `ease-in-out` gives ~12 frames at 60 Hz; even worst-case agent-reaction subtree (50 long messages) lays out within budget on a 2017+ machine.

If a future browser drops `interpolate-size`, the disclosure falls back to instant snap (acceptable degradation; functionality preserved). M5 verifies the fallback works.

The skim-block first-paint stagger is capped at 8 visible blocks (later blocks reveal without stagger) so even a 200-block session paints in under 400 ms total animation budget. The page-turn fade applies to the entire right pane container — exactly one composite layer transitions per selection change.

No `width` / `top` / `padding` animations elsewhere in the spec.

## Goal & Scope

### In scope (must close in Phase 5)

- Split-pane master-detail layout at `<main>` (CSS Grid `minmax(300px, 380px) 1fr` above 900 px; stacked with explicit narrowMode toggle below).
- Compact list rows showing four essentials per row: Title (with inline tool badge + muted rowKey + statusConflict refresh marker), Status pill, Project (truncated with title= hover), Updated relative-time. Phase 4's Source Path / Stored Copy / Tool columns move to the Metadata tab.
- Right-pane four-tab `SessionView`: Transcript / Skim / Raw / Metadata (left-to-right). Tab state is component-local React state (NOT URL-synced; see §Routing). Default active tab progression per Resolved Decision #11 (M2 = Metadata; M4 = Transcript onward).
- Per-tool client-side message parsers for Claude Code and Codex in `apps/frontend/src/features/sessions/parsers/{claude_code,codex}.ts`. Pure, total (failures land in `warnings[]`, never throw), synchronous; consume the existing `/api/v1/sessions/:uid/raw` stream with a 5 MB safety cap.
- Typed `Message`, `MessageKind`, `SkimBlock`, `BlockKind`, `ParsedSession` data model in `parsers/types.ts`.
- `buildSkim.ts` pure function emitting `SkimBlock[]` from `Message[]`.
- TranscriptView: chronological message list with per-kind rendering (`user`, `assistant`, `tool_use`, `tool_result`, `system`, `boundary`, `unknown`), absolute + relative timestamps, collapsible long tool_result (>2 KB), truncation banner when the 5 MB cap fired.
- SkimView: renders all four PRD block kinds (`user_turn`, `boundary`, `agent_only`, `oversized_user_message`); `user_turn` shows the user message verbatim plus a collapsible "Agent reaction" disclosure carrying the disabled-summary placeholder copy "Summary disabled — generation deferred to a later phase" plus an "Expand to raw messages" affordance reusing TranscriptView scoped to the turn's messageIndex range; `boundary` renders as a horizontal divider with explicit "Session resumed" / "Conversation compacted" copy and is NEVER merged into a neighbor; `agent_only` and `oversized_user_message` collapsed by default; `oversized_user_message` is NEVER summarized (PRD line 257).
- Raw tab: byte-equivalent to Phase 4's drawer raw-preview block (`streamSessionRaw` + `consumeRawPreview` with the 20-line OR 256 KB cap, AbortController on tab unmount).
- Metadata tab: relocates the 18 SessionRow fields verbatim from the Phase 4 drawer body, plus the subagent sidecar badge (PRD line 226 — flag exists in `SessionRow.hasSubagentSidecars`), the sourcePathIsStale "Last seen source path" label, and the statusConflict badge.
- URL-synced selection: `?session=<rowKey>` via `window.history.replaceState`. `popstate` listener restores selection on Back/Forward. Direct-link missing-row case shows recoverable "Session not found" copy with a "Clear selection" button. No router dependency.
- Accessible Tabs primitive at `apps/frontend/src/components/Tabs.tsx` (ARIA `tablist` / `tab` / `tabpanel` + Left/Right/Home/End keyboard nav).
- Empty-pane state when no session selected; "Back to list" affordance in the session header on stacked-narrow viewports.
- Phase 4 invariants preserved verbatim: filter / sort / search persistence, the click-time intersection rule (filter + pagination variants), the importability rule, per-fetch error isolation, the four documented empty states (no_sessions_at_all / no_matches_after_filter / nothing_to_import / partial_fetch_failure), action-bar selection invariants.
- **Design Language delivery (Archive-room aesthetic)**: typography stack (display + chrome + mono) wired in M2 via @font-face + tokens; oklch-based color tokens with hex `@supports` fallback; six enumerated signature details (chapter break, page-turn fade, deep-link pulse, hairline gutter, tab indicator slide, reading wash); motion budget table observed across all chunks; reduced-motion zero-out in `global.css`.
- Eight-doc sweep + WCAG AA contrast measurements for every new visible foreground/background pair (light + dark) + final progress-log entry.

### Out of scope (deferred to Phase 6+)

- LLM summary generation, first-run consent, provider configuration, per-tool/per-project/per-session summary opt-out (PRD lines 247–253). Phase 5 only renders the disabled-state placeholder per PRD line 223.
- Annotations: notes (session-level + block-level), tags, bookmarks, highlights, quality marks (PRD lines 234–235, 309–311). No data persistence layer; backend has no annotation endpoints in v1.
- Orphaned-annotations surface (PRD line 235). Depends on annotations.
- Distill / lens / skill-draft curation (PRD §4 + §5). Larger surface; its own phase.
- Archive / Purge / tombstones / `do_not_send_to_llm` flag UI (PRD lines 405–415, 244, 251). Backend mutations not in v1; UI follows backend.
- Browse-mode views per PRD lines 193–198: Recent activity, Timeline (day/week/month), Project, Tool, Search results. Phase 5 keeps the unified inspection list as the single browse mode.
- Search-within-transcript inside the session view (deferred until annotations land).
- Multi-page routing / router dependency (`react-router-dom` etc.). URL state uses History API directly.
- Transcript virtualization (`@tanstack/react-virtual` — escape-hatch slot 2). Reserved; only fires if Milestone 4's measurement on a 5k-message synthetic fixture shows > 16 ms per frame on Chromium.
- New backend HTTP routes, contract types, or component crates. The existing `/api/v1/sessions/:uid/raw` endpoint suffices.
- Cleaning the small remaining set of stale "three panels" test names from Phase 4 (test bodies still describe the 3-GET network behavior accurately; renaming would only reduce documentation drift).

## Dependency Policy

Inherits Phase 4's policy verbatim:

- At most TWO new runtime dependencies allowed across all of Phase 4 + Phase 5, each only under a documented escape-hatch clause with concrete reproducer evidence.
- Slot 1 consumed: `focus-trap-react@^11` in Phase 4 Milestone 4 E1 (native `<dialog>` Tab #3 escaped focus trap on Chromium 1217). Phase 5 retires the drawer; the dep becomes orphan-installed (negligible cost; future modal needs may revive it). Documented in `docs/dependency-rules.md`.
- Slot 2 reserved: `@tanstack/react-virtual` for transcript virtualization. Only fires after Milestone 4 measures > 16 ms per frame on a 5k-message synthetic fixture on real Chromium.
- Forbidden: Tailwind, MUI/Chakra/Radix/Mantine/shadcn, CSS Modules, CSS-in-JS runtimes (emotion, styled-components, vanilla-extract), state managers (Zustand, Redux, Jotai), data-fetching libraries (TanStack Query, SWR), icon libraries (lucide, heroicons), Bun→Node shims, `npm` / `node` / `child_process` / `jest.fn()` (Bun-first per `feedback_bun_not_node.md`).
- No new escape-hatch dep without a documented reproducer (a JSDoc comment in the consumer's header citing the failing scenario).

## Target Repository Shape

No new apps. No new component crates. No Rust changes.

```text
apps/frontend/
├── package.json                    # at most 2 escape-hatch runtime deps total (Phase 4 + 5)
├── src/
│   ├── main.tsx                     # cascade: reset → tokens → global → feature-local sibling sheets
│   ├── App.tsx                      # split-pane shell + selectedRowKey ownership + URL sync
│   ├── features/
│   │   └── sessions/
│   │       ├── SessionsView.tsx     # NARROWED to compact list panel (no longer hosts drawer)
│   │       ├── SessionsTable.tsx    # 4-column compressed; row-click sets selection
│   │       ├── SessionFilters.tsx   # compact horizontal strip + <details> on narrow viewports
│   │       ├── SessionView.tsx      # NEW — right-pane shell + tab strip
│   │       ├── SkimView.tsx         # NEW — four block kinds renderer
│   │       ├── TranscriptView.tsx   # NEW — chronological message renderer
│   │       ├── SessionMetadata.tsx  # NEW — extracted from SessionDetail.tsx (18-field <dl>)
│   │       ├── RawTab.tsx           # NEW — extracted from RawPreviewBlock
│   │       ├── useSelectedSession.ts # NEW — ?session=<rowKey> via History API
│   │       ├── useParsedSession.ts  # NEW — fetch + parser dispatch + per-(storedSessionUid,tool) LRU(5) cache + epoch invalidation
│   │       ├── streamRawText.ts     # NEW — full-document fetch with 5 MB cap
│   │       ├── parsers/
│   │       │   ├── types.ts         # NEW — Message / MessageKind / SkimBlock / BlockKind / ParserOutput / ParsedSession / StreamMeta
│   │       │   ├── claude_code.ts   # NEW — Claude Code per-tool parser (returns ParserOutput)
│   │       │   ├── codex.ts         # NEW — Codex per-tool parser (returns ParserOutput)
│   │       │   ├── buildSkim.ts     # NEW — Message[] → SkimBlock[] + USER_MSG_OVERSIZE_THRESHOLD
│   │       │   └── index.ts         # NEW — PARSERS registry + dispatchParser entry
│   │       ├── mergeSessions.ts     # unchanged
│   │       ├── filterSessions.ts    # unchanged
│   │       ├── applyPagination.ts   # unchanged
│   │       ├── relativeTime.ts      # unchanged
│   │       ├── useSessionFilters.ts # unchanged
│   │       ├── useToastQueue.ts     # unchanged
│   │       ├── lastRescan.ts        # unchanged
│   │       ├── rawPreview.ts        # unchanged (consumed by RawTab)
│   │       └── types.ts             # unchanged (SessionRow + isImportable)
│   ├── components/
│   │   ├── ActionBar.tsx            # moved to bottom of list panel
│   │   ├── Pagination.tsx           # moved into list panel
│   │   ├── ScanErrorsCallout.tsx    # unchanged
│   │   ├── Tabs.tsx                 # NEW — accessible tablist primitive
│   │   ├── Toast.tsx                # unchanged
│   │   └── (StatusBadge, Drawer, SessionDetail RETIRED in M2/M6 — see below)
│   ├── lib/
│   │   ├── api.ts                   # unchanged
│   │   ├── config.ts                # unchanged
│   │   └── contracts.ts             # unchanged
│   └── styles/
│       ├── reset.css                # unchanged
│       ├── tokens.css               # M2 adds Phase 5 color/typography/motion/surface tokens (oklch + hex @supports fallback) per §Design Tokens
│       └── global.css               # <main> becomes CSS Grid; @media (max-width: 900px) stacks; reduced-motion zero-out rule
└── e2e/                             # extended specs
```

Files removed in this phase (M6): `apps/frontend/src/features/sessions/SessionDetail.tsx` (split into `SessionMetadata.tsx` + `RawTab.tsx` in M2; deleted in M6 once both extractions land), `apps/frontend/src/components/Drawer.tsx` (no modal in Phase 5; deleted in M6).

## Data Model in the Browser

The unified inspection-list data model from Phase 4 is unchanged: `SessionRow` (18 fields), `isImportable`, `mergeSessions` join, filter/sort/pagination pipeline.

Phase 5 adds a per-tool typed-message data model in `apps/frontend/src/features/sessions/parsers/types.ts`:

```ts
export type MessageKind =
  | "user" | "assistant" | "tool_use"
  | "tool_result" | "system" | "unknown"
  | "boundary";   // Codex session_resumed / compacted markers; carried through to buildSkim

export type Message = {
  /** 0-indexed line number in the raw NDJSON. Multiple messages can share the same lineOrdinal when a single line splits into N message rows (e.g., Claude Code assistant content array with text + tool_use). */
  lineOrdinal: number;
  /** 0-indexed sequential position in messages[]. STABLE identity used by skim ranges and "Expand to raw messages" scoping. */
  messageIndex: number;
  timestamp: string | null;
  kind: MessageKind;
  text: string;
  toolName?: string;      // populated when kind === "tool_use" or "tool_result"
  /** Populated when kind === "boundary". buildSkim consumes this to label the chapter break. */
  boundarySubtype?: "session_resumed" | "compacted";
  raw: string;            // verbatim NDJSON line for "Expand to raw" affordances
  bytes: number;          // approximate UTF-8 byte size for oversize detection
};

export type BlockKind =
  | "user_turn" | "boundary" | "agent_only" | "oversized_user_message";

export type SkimBlock = {
  kind: BlockKind;
  /** Inclusive messageIndex range (NOT lineOrdinal). The "Expand to raw messages" affordance slices messages[start..=end] to render a scoped TranscriptView. */
  start: number;
  end: number;
  meta?: Record<string, string | number>;
};

export type ParseWarning = {
  lineOrdinal: number;
  reason: string;         // human-readable; surfaced as a small dismissible banner
};

/** What a per-tool parser returns. Pure of stream metadata. */
export type ParserOutput = {
  messages: Message[];
  warnings: ParseWarning[];
};

/** What the dispatcher assembles by wrapping ParserOutput with stream metadata + buildSkim. Consumed by Skim/Transcript views. */
export type ParsedSession = {
  tool: Tool;
  messages: Message[];
  skim: SkimBlock[];
  totalBytes: number;
  truncated: boolean;     // true when the 5 MB cap fired during streamRawText
  warnings: ParseWarning[];
};

/** Stream metadata produced by streamRawText. Passed into dispatchParser. */
export type StreamMeta = {
  totalBytes: number;
  truncated: boolean;
};
```

Per-tool parsers are pure, total, synchronous functions. They consume only `rawText` and emit `ParserOutput` (`{messages, warnings}`) — they have no knowledge of stream caps, byte counts, or truncation. The dispatcher wraps their output with stream metadata + `buildSkim` to produce the consumable `ParsedSession`.

```ts
export function parseClaudeCode(rawText: string): ParserOutput;
export function parseCodex(rawText: string): ParserOutput;
```

Dispatch is a registry, not a switch — adding a third tool in a future phase is one record entry, not a control-flow edit:

```ts
// parsers/index.ts
import type { Tool } from "../../../lib/contracts";
import { parseClaudeCode } from "./claude_code";
import { parseCodex } from "./codex";
import { buildSkim, USER_MSG_OVERSIZE_THRESHOLD } from "./buildSkim";
import type { ParserOutput, ParsedSession, StreamMeta } from "./types";

export type ParserFn = (rawText: string) => ParserOutput;

export const PARSERS: Record<Tool, ParserFn> = {
  claude_code: parseClaudeCode,
  codex: parseCodex,
};

export function dispatchParser(
  tool: Tool,
  rawText: string,
  streamMeta: StreamMeta,
): ParsedSession {
  const parser = PARSERS[tool];
  const output: ParserOutput = parser
    ? parser(rawText)
    : {
        messages: [],
        warnings: [
          { lineOrdinal: 0, reason: `No parser registered for tool "${tool}"` },
        ],
      };
  return {
    tool,
    messages: output.messages,
    skim: buildSkim(output.messages, USER_MSG_OVERSIZE_THRESHOLD),
    totalBytes: streamMeta.totalBytes,
    truncated: streamMeta.truncated,
    warnings: output.warnings,
  };
}
```

The registry typechecks via `Record<Tool, ParserFn>` — if the `Tool` union grows without a corresponding `PARSERS` entry, TypeScript fails the build. Tests assert exhaustiveness over `Object.keys(PARSERS)`.

Note: `Tool` is imported from `apps/frontend/src/lib/contracts.ts` (the existing Phase 4 re-export of the generated `@contracts/Tool`), matching the import pattern already used in `features/sessions/types.ts:19`.

The parsers re-walk the NDJSON field paths independently. They reference (do NOT share code with) the Rust adapters at `components/collector-runtime/src/adapters/{claude_code,codex}.rs`:

- Claude Code: `/message/role` distinguishes user vs assistant; `/message/content` is either a string OR an array (assistant content arrays split into separate `Message` rows for `text` and `tool_use` shapes); `/timestamp` is RFC3339.
- Codex: top-level `type` field tags each line; `session_meta` becomes the first `system` message (a second mid-stream becomes a `boundary` Message of subtype `session_resumed`, which buildSkim converts to a `boundary` SkimBlock); `event_msg` carries `payload.type` (e.g., `user_message`, `agent_message`, `task_started`, `agent_reasoning`) and `payload.timestamp`.
- Both: a malformed line lands in `warnings[]` with `{lineOrdinal, reason}`; the message stream skips that line entirely and continues.

The four `BlockKind` values are assigned exclusively in `buildSkim.ts` from the `Message[]` produced by the parsers. Parsers only assign `MessageKind`. This separation prevents a parser bug from corrupting block grouping.

### User-turn boundary algorithm

`buildSkim(messages, threshold)` walks the message stream once with **two explicit open-region trackers** (no shared `currentTurnStart` variable):

```ts
let openUserTurnStart: number | null = null;
let openAgentOnlyStart: number | null = null;
const blocks: SkimBlock[] = [];
```

All `start` / `end` values index into `messages[]` (`messageIndex`), NOT raw line numbers (`lineOrdinal`).

1. Empty stream → return one `agent_only` block with `start: 0, end: -1, meta: {empty: 1}`.
2. For each message at `messageIndex i` in order, dispatch on `kind`:
   - **`boundary`**: close any open region (user_turn AND/OR agent_only) at `i-1`, then emit `{kind: "boundary", start: i, end: i, meta: {subtype: msg.boundarySubtype}}`. Both trackers reset to null.
   - **`user`** with `bytes > USER_MSG_OVERSIZE_THRESHOLD`: close any open region at `i-1`, then emit `{kind: "oversized_user_message", start: i, end: i, meta: {sizeBytes: msg.bytes}}`. Both trackers reset to null.
   - **`user`** (normal): close any open agent_only at `i-1` (the system prelude / agent_only run is finished as soon as the user speaks); close any open user_turn at `i-1`; start a new user_turn: `openUserTurnStart = i`.
   - **`assistant` / `tool_use` / `tool_result` / `system` / `unknown`**:
     - If `openUserTurnStart !== null`: extend the current user_turn (no state change; the message belongs to the agent's reaction within the turn).
     - Else if `openAgentOnlyStart !== null`: extend the current agent_only (no state change).
     - Else: start a new agent_only: `openAgentOnlyStart = i`.
3. End of stream (let `last = messages.length - 1`; `last === -1` for empty stream is handled by step 1):
   - If `openUserTurnStart !== null`: close it as `{kind: "user_turn", start: openUserTurnStart, end: last}`.
   - Else if `openAgentOnlyStart !== null`: close it as `{kind: "agent_only", start: openAgentOnlyStart, end: last}`.

Notes:

- The dual-tracker structure means a Codex stream beginning with `session_meta` (system) → user message → agent reply produces: one `agent_only` block for the system prelude `[0, 0]`, then one `user_turn` block for the user message + agent reply `[1, 2]`. Two distinct blocks, no spurious merging of the system prelude into the user turn.
- Boundary blocks are NEVER merged into a neighbor (the `boundary` clause closes any open region before emitting).
- "Expand to raw messages" in SkimView renders a scoped TranscriptView. The slice depends on block kind:
  - `user_turn`: `messages.slice(block.start + 1, block.end + 1)` — the **agent reaction only** (the user message at `block.start` is already shown inline ABOVE the disclosure).
  - `agent_only`: `messages.slice(block.start, block.end + 1)` — the whole block (no user message to skip).
  - `oversized_user_message`: no scoped TranscriptView; expansion shows the verbatim text of `messages[block.start]`.
  - `boundary`: no expansion (boundary is a single divider, no nested content).
  Because `messageIndex` is sequential and stable, every slice above is well-defined even when multiple messages share a `lineOrdinal`.

### Streaming + 5 MB safety cap

```ts
export type StreamRawTextResult = {
  /** Accumulated text up to the byte cap (or full payload if smaller). */
  text: string;
  /** Bytes accepted into `text` (UTF-8). When `truncated` is true, this equals STREAM_RAW_TEXT_BYTE_CAP. When false, this equals the actual payload size. */
  totalBytes: number;
  /** True when the byte cap fired and `reader.cancel()` was called. */
  truncated: boolean;
};

export const STREAM_RAW_TEXT_BYTE_CAP = 5 * 1024 * 1024; // 5 MB

export function streamRawText(
  storedSessionUid: string,
  signal: AbortSignal,
): Promise<StreamRawTextResult>;
```

Consumes `streamSessionRaw(uid, signal)` (the existing `/api/v1/sessions/:uid/raw` exporter from `apps/frontend/src/lib/api.ts`), accumulates chunks via `TextDecoder`, and short-circuits via `reader.cancel()` once the byte cap fires. `STREAM_RAW_TEXT_BYTE_CAP` is exported for a future configuration phase.

`totalBytes` semantics: the size of `text` (UTF-8 byte length). When `truncated` is true, `totalBytes === STREAM_RAW_TEXT_BYTE_CAP` exactly (the cap is a hard limit). When false, `totalBytes` is the full payload size. The spec deliberately does NOT report the actual full payload size when truncated, because computing it would require draining the stream past the cap.

When `truncated: true`, the SkimView/TranscriptView render a small banner: "Truncated at 5 MB — full payload not parsed. Use the **Open raw** anchor in the session header to inspect the full payload." (The Raw tab is also capped — at 256 KB / 20 lines, byte-equivalent to Phase 4 — so it is not the right escape hatch for > 5 MB payloads. The header's "Open raw" anchor opens the full `/api/v1/sessions/<storedSessionUid>/raw` endpoint in a new tab with no client-side cap.)

### useParsedSession hook

```ts
export type UseParsedSessionState =
  | { state: "idle" }                                                // row === null
  | { state: "no_raw"; reason: "source_only" }                       // row.storedSessionUid === null
  | { state: "loading" }
  | { state: "success"; parsed: ParsedSession }
  | { state: "truncated"; parsed: ParsedSession }                    // parsed.truncated === true
  | { state: "error"; error: Error };

export type UseParsedSessionResult = UseParsedSessionState & {
  /** Callable in the "error" state to re-trigger the fetch (skips cache; uses the same row). No-op in other states. */
  retry: () => void;
};

export function useParsedSession(row: SessionRow | null): UseParsedSessionResult;
```

The `retry` function is always present on the result (no-op except in the "error" state) so consumers can pass it to a button without conditional rendering. Internally, `retry()` increments a component-local `retryNonce` state value; the `useEffect` that drives fetching depends on `retryNonce` so bumping it triggers a fresh fetch (without cache lookup, since the previous error is what we want to retry).

The hook takes a full `SessionRow` because the **raw endpoint identity is `storedSessionUid`, not `rowKey`** (a source-only row has no `storedSessionUid` and CANNOT serve raw bytes — the user must Import first). The Phase 4 raw URL builder (`apps/frontend/src/lib/api.ts:132`) already enforces this: it only renders a raw link when `storedSessionUid !== null`.

**Invocation rules:**

- Skim and Transcript tabs invoke this hook (they need `parsed.skim` / `parsed.messages`).
- Raw tab does NOT invoke this hook — it uses its own `streamSessionRaw` + `consumeRawPreview` consumer (256 KB cap, independent state). Raw tab MUST also handle `row.storedSessionUid === null` by rendering a "Not yet imported" state.
- Metadata tab does NOT invoke this hook — it reads only the `SessionRow` already in `App.tsx` state.

This means selecting a session and going straight to Metadata never triggers any fetch.

When `storedSessionUid === null`:
- Skim and Transcript receive `state: "no_raw", reason: "source_only"` from `useParsedSession` and render the copy: "This session has not been imported yet — only the source-side metadata is available. Click Import to fetch the raw payload."
- Raw renders its own equivalent "Not yet imported" state directly (it never calls `useParsedSession`; the check is local to `RawTab.tsx`). Same copy for visual consistency.
- Metadata renders normally — the SessionRow's source-side fields are present.

**Cache (LRU + epoch + in-flight coalescing):**

- Module-scoped `cache: Map<string, ParsedSession>` keyed by `${storedSessionUid}::${tool}` → `ParsedSession`. (Source-only rows are never cached because they have no fetch.)
- Module-scoped `inFlight: Map<string, Promise<ParsedSession>>` keyed identically. **When a fetch for a given key is already in flight, a second invocation awaits the SAME Promise instead of starting a duplicate fetch.** This is the in-flight-coalescing layer — without it, switching from Skim to Transcript while the first 5 MB fetch is in progress would start a second fetch.
- Cap: `USE_PARSED_SESSION_CACHE_MAX = 5` most-recently-used entries (constant exported from `useParsedSession.ts`). Applies to the resolved `cache` only; `inFlight` entries are removed on settle (success or error).
- Eviction policy: on every cache write, if size > cap, evict the least-recently-used entry. Reads bump recency.
- **Module-scoped epoch counter `cacheEpoch: number`**, incremented on:
  - Rescan click (the user explicitly asked for fresh data)
  - Successful Import completion (raw bytes may have been replaced)
- Each in-flight fetch captures `epochAtStart = cacheEpoch` at fetch dispatch. On resolve, **only writes to cache if `cacheEpoch === epochAtStart`**; otherwise drops the result (a Rescan or Import bumped the epoch mid-fetch and the bytes might be stale). Coalesced consumers awaiting the same Promise see the same drop semantics.
- Hard reset: clear-all `cache` AND `inFlight` AND increment `cacheEpoch` on Rescan and on Import success. (Aborting `inFlight` requests on hard reset prevents the dropped result from spuriously settling.)
- Cache survives tab switches and selectedRowKey changes — selecting Session A → B → A returns the cached A without re-fetching, until A is evicted by 5 newer selections or Rescan/Import fires.

**Order of operations on hook invocation** (per render):
1. If `row === null` → state `idle`. Skip everything.
2. If `row.storedSessionUid === null` → state `no_raw`. Skip fetch.
3. Build `key = ${storedSessionUid}::${tool}`. Look up `cache.get(key)`. If hit → bump LRU recency, return `state: "success" | "truncated"`.
4. Look up `inFlight.get(key)`. If hit → return `state: "loading"`; the existing Promise resolves both the original consumer and this one.
5. Otherwise → start a fresh fetch + parse, register the Promise in `inFlight`, return `state: "loading"`.

**Lifecycle:**

- `row === null` → `state: "idle"`, no fetch.
- `row.storedSessionUid === null` → `state: "no_raw", reason: "source_only"`, no fetch.
- `row.storedSessionUid !== null` AND cache hit → return `{state: "success" | "truncated", parsed}` synchronously.
- Cache miss → enter `"loading"`, capture `epochAtStart = cacheEpoch`, fire `streamRawText(row.storedSessionUid, signal)` with a fresh `AbortController`.
- `row` change (different `storedSessionUid`) before completion → `signal.abort()`, transition to new fetch. The aborted in-flight fetch's `.then` no-ops (the post-abort resolution returns nothing useful).
- Resolve → call `dispatchParser(row.tool, rawText, {totalBytes, truncated})` (synchronous; pure) → if `cacheEpoch === epochAtStart` write cache + bump LRU recency → state `"success"` (or `"truncated"` if `parsed.truncated`).
- Reject (network error other than abort) → state `"error"`. NOT cached.
- Component unmount → `signal.abort()`. Cache survives in module-scoped Map.

The Map is module-scoped, not React-state-scoped, so it survives component unmount + remount cycles within a single page session. It does NOT persist to storage; reload = empty cache, epoch resets to 0.

**Worst-case memory ceiling**: 5 cached entries × (5 MB raw text + parsed structures ≈ 1.5× raw) = ~37.5 MB worst case. Comfortable on a developer machine; documented for future tuning.

## Inspection Surface Layout

### Split-pane shell

`<main>` becomes `display: grid; grid-template-columns: minmax(300px, 380px) 1fr; gap: 0; max-width: 1400px; margin: 0 auto`. The two panes are joined by a single 1 px hairline divider drawn as a `border-right` on the list panel (color `--color-border`); no grid-gap, no styled rail, no shadow — the hairline is the only visual separation, per §Spatial rhythm. **Above 900 px both panes render side by side.** Below 900 px, a single-column layout with a `narrowMode = "list" | "session"` component-local state toggle (the hairline disappears in stacked layout; only one pane is visible at a time). All three layouts are pure CSS via media queries — no JS resize listener.

(The 1280 px reference earlier in §Goal & Scope is the M1 *fit-check* viewport — it is the width at which the compact 4-essentials list must render without horizontal scroll inside the 300–380 px pane. Side-by-side rendering itself activates at ≥ 900 px.)

```css
/* Default: stacked (narrow viewports). */
main { grid-template-columns: 1fr; }

/* Split-pane activates at >= 900 px (matches Acceptance Criteria). */
@media (min-width: 900px) {
  main { grid-template-columns: minmax(300px, 380px) 1fr; }
}

/* Below 900 px, narrowMode "list" hides .session-pane; "session" hides .list-pane; transitions purely visual. */
@media (max-width: 899.98px) {
  /* narrowMode-driven visibility rules go here */
}
```

(Using `min-width: 900px` for the split layout means a viewport at exactly 900 px IS split-pane, matching the acceptance criterion. The stacked-layout rules use `max-width: 899.98px` to avoid the inclusive-vs-exclusive ambiguity at the boundary.)

The narrowMode toggle is set when the user clicks a list row (→ `"session"`) or the in-session-header "Back to list" button (→ `"list"`). On wide viewports, narrowMode is meaningless because both panes always render.

### Compact list rows (4 essentials)

The `SessionsTable` shrinks from 8 columns to 4:

| Column      | What renders                                                                                                                         |
|-------------|--------------------------------------------------------------------------------------------------------------------------------------|
| **Title**   | Bold `row.title || "(untitled)"` on top line in `--font-chrome`; muted `row.tool` badge + `row.rowKey` (`--font-mono`, `--text-xs`) below; `(refresh)` marker if `statusConflict` |
| **Status**  | Same status pill (badge.up-to-date / not-stored / outdated / source-missing) as Phase 4                                              |
| **Project** | `row.projectPath || "—"` truncated with `text-overflow: ellipsis`; full path on `title=` hover                                       |
| **Updated** | `relativeTimeFrom(now, row.sourceUpdatedAt)`; absolute ISO on `title=` hover                                                         |

The Select column from Phase 4 stays (importability rule). Phase 4's Source Path / Stored Copy columns move to the Metadata tab; the Tool column merges into the Title cell. Total visible columns post-compression: Select + Title + Status + Project + Updated = 5 (4 content + 1 select).

### Row visual treatment (Archive-room)

| State | Background | Other treatment |
|-------|------------|-----------------|
| Default | transparent (inherits `--color-surface`) | hairline bottom border `--color-border` |
| Hover (pointer) | `color-mix(in srgb, var(--color-ink) 4%, transparent)` | cursor: pointer; transition `--motion-fast` |
| Selected (`aria-current="true"`) | `color-mix(in srgb, var(--color-accent) 8%, transparent)` | left edge: 2 px solid `--color-accent` (vertical inset rule); transition `--motion-base` |
| Selected + hover | `color-mix(in srgb, var(--color-accent) 12%, transparent)` | (selected wins; hover deepens) |
| Deep-link pulse (one-shot on URL-driven mount) | keyframe peak `color-mix(in srgb, var(--color-accent) 22%, transparent)` | `--motion-pulse` ease-out animation, then settles to selected state |

Row anatomy: `min-height: 36px`; vertical padding `8px`; horizontal padding `12px`; cell gutter `8px`. Title line + subline (tool badge + rowKey) stack with `4px` gap. The whole row is a single `<tr>` — clicking anywhere except the Select cell mounts the session in the right pane (Phase 4 pattern preserved).

Selected row also carries `aria-current="true"` for assistive tech. Keyboard navigation: `↑` / `↓` move focus between rows (focus visible via `:focus-visible` outline); `Enter` selects; `Esc` clears selection (and clears the URL `?session=` param).

### Filter bar placement

The existing `<SessionFilters>` strip (5 filter rows from Phase 4) stays at the top of the list panel. Below 1100 px, the strip wraps inside a `<details>` element with summary "Filters" and the row count of active filters as a hint. Default open state: open above 1100 px, closed below.

### Action bar placement

`<ActionBar>` moves from the `<section>` footer to the bottom of the list panel; `position: sticky; bottom: 0; z-index: 1`. Same selection invariants and "last rescan from this browser X ago" caption.

### Pagination placement

Pagination strip lives between the table and the action bar inside the list panel. Defaults stay 50 / 100 / 200; behavior unchanged.

### URL state via History API

`?session=<rowKey>` synced via `window.history.replaceState`. **React state is the single source of truth; the URL is a mirror.** Selection lives in `App.tsx` state. Mount reads `URLSearchParams(window.location.search).get("session")` and pre-selects.

**Coordination rules** (so `popstate`, click, and `Esc` never race):

- **Click on row**: `setSelectedRowKey(rowKey)` AND `replaceState(buildUrl(rowKey))`. Both are idempotent.
- **`popstate` event** (browser Back / Forward): re-read URL, call `setSelectedRowKey(urlValue)`. Does NOT call `replaceState` — that would create a feedback loop.
- **`Esc` key**: `setSelectedRowKey(null)` AND `replaceState(buildUrl(null))`. Same as click flow with `null` argument. **Scope:** Esc fires only when (a) focus is in the session pane (any descendant of the right pane), or (b) focus is on a selected row in the list. Esc is IGNORED when focus is in any editable control (`<input>`, `<textarea>`, `[contenteditable]`, the filter strip's search field, or any `role="combobox"`). Standard convention: editable controls get to consume Esc themselves (clear search, dismiss combobox, etc.) before the global Esc handler fires.
- **`buildUrl(key)`**: reads the entire current `URLSearchParams`, mutates only the `session` key (sets it to `key` or removes it if `null`), serializes back. Preserves all other query params for forward-compat with future filter URL state.

**Direct-link missing-row case** (URL has `?session=foo` but no row matches):

- While the source + stored + scan-errors GETs are still in flight, the right pane renders a generic "Loading session…" placeholder. The merged-rows list is empty until at least the source GET settles, so resolving "missing row" too early would flash spurious copy.
- Once **all three GETs have settled** AND `mergedRows.find(r => r.rowKey === urlSession) === undefined`, the right pane renders "Session not found in current view" copy with two buttons: "Clear selection" (removes URL param) and "Try Rescan" (calls `refetchAll`).
- The URL is NOT auto-cleared on missing-row — preserves the user's deep link in case Rescan finds the row.

`replaceState` (not `pushState`) avoids back-stack pollution as the user clicks through the list. The trade-off: browser Back doesn't navigate between sessions, only between filter changes / out-of-app history. Mitigation listed in §Risks.

**Deep-link arrival behavior** (signature detail #3 — the deep-link pulse):

- On initial mount, if `URLSearchParams.get("session")` is non-null, set `pendingDeepLinkPulseRowKey` in App state alongside `selectedRowKey`.
- When the matching row first renders in the list, it reads `pendingDeepLinkPulseRowKey` and applies a `data-deep-link="true"` attribute that triggers a CSS keyframe animation (600 ms warm-amber background → transparent, settles to the resting selected-row tint).
- Cleanup options (whichever fires first):
  - The row's `onAnimationEnd` handler clears `pendingDeepLinkPulseRowKey`.
  - A 2-second timeout from initial mount clears it unconditionally (safety net for slow fetches or session_not_found case where the row never renders).
- Click-driven selection NEVER fires the pulse (the user already knows which row they clicked). The pulse only marks URL-driven arrivals.

### Empty pane state

Right pane with no `selectedRowKey` renders:

> Select a session from the list to view its content.
>
> The session view shows the full Transcript chronologically, a Skim outline (one block per user message), the Raw NDJSON for verification, and the session's Metadata.

Plus a small subtle illustration or icon (text-only is fine; no icon library).

### Mobile / narrow viewport (< 900 px)

Stacked layout: list panel renders full-width when `narrowMode === "list"`; session pane renders full-width when `narrowMode === "session"`. Switching uses pure visibility/grid-area changes — both panes stay mounted to preserve scroll position and tab state.

**"← Back to list" semantics:**

- Sets `narrowMode = "list"` only.
- Does NOT clear `selectedRowKey` and does NOT clear the URL `?session=` param.
- The list panel still shows the selected row with `aria-current="true"` styling, so the user knows where to tap to come back.
- Re-tapping the same row (or any row) sets `narrowMode = "session"` and brings the right pane forward — the SessionView component is still mounted, so tab + scroll + disclosure state are preserved exactly as the user left them.
- This is the desktop/wide-viewport equivalent of "I'm consulting the list while keeping the session open" — preserved on narrow viewports via the explicit toggle.

**`Esc` semantics on narrow viewports**: identical to wide — `setSelectedRowKey(null)` plus URL clear. This DOES unmount SessionView (no selected session to render) and resets `narrowMode = "list"` (no session pane to switch to). For users who want to fully clear the session, Esc is the explicit gesture. "Back to list" is the lighter "step back without losing the session" gesture.

The Transcript / Skim tabs render at full reading width on mobile.

## Session View (Right Pane)

### Header

Layout: two-row composition. **Top row** = session title (left) + utility actions (right). **Bottom row** = badges + secondary metadata. Both rows live above the tab strip; total header height ≈ 88 px on wide viewports, ≈ 120 px on narrow (back-to-list button adds a row).

- **Title** in `--font-display` italic OR upright (test both at M5; pick the one that reads better against Fraunces' optical sizing) at `--text-xl`, `--color-ink`. `row.title || "(untitled)"`. Untitled state renders the parenthetical in `--color-ink-muted` italic.
- **Tool badge** in `--font-mono` `--text-xs` to the right of (or below, on narrow) the title. Subtle chip with hairline border, no background.
- **Status pill** (same recipe as the list-row pill).
- **Conflict badge** if `row.statusConflict` ("Source ↔ stored disagreed"). Status warning color recipe.
- **Subagent sidecar badge** if `row.hasSubagentSidecars` ("Has Claude Code subagent sidecars on disk — not ingested in v1"). Muted info recipe.
- **"Last seen source path"** hint inline near sourcePath if `row.sourcePathIsStale`. `--font-mono` `--text-xs` `--color-ink-muted`.
- **Copy-to-clipboard button** for `row.sourcePath`. Quiet icon-less text button "Copy path".
- **"Open raw" anchor** (target=`_blank`, identical href to Phase 4 — `/api/v1/sessions/<storedSessionUid>/raw`). Quiet text link. **Rendered only when `row.storedSessionUid !== null`**; source-only rows replace it with the same "Not yet imported — click Import to fetch raw" copy used in the Raw tab.
- **On narrow viewports**: a "← Back to list" button row above everything else. Quiet text-link styling, not a chunky button — preserves the editorial mood. **"Back to list" only sets `narrowMode = "list"`** (preserves selection + URL + tab state — see §Mobile / narrow viewport). `Esc` is a *different* gesture: it fully clears selection (and resets to list), per §Routing/URL State.

The header carries no surface chrome (no border, no background fill different from `--color-surface`) — it sits above the tab strip's hairline boundary which provides the visual anchor. Consistent with hairline-over-shadow principle.

### Tab strip

Four tabs: **Transcript** / **Skim** / **Raw** / **Metadata** (left-to-right). Default active tab on first selection at Phase 5 close: **Transcript** — revised from the planner's initial "Skim" recommendation.

**Per-milestone default-tab progression** (per Resolved Decision #11):

- **M2 close** → default = **Metadata** (only fully-functional parsed-content-free tab; Skim + Transcript still placeholder)
- **M3 close** → default = **Metadata** (no UI consumer of parsers yet)
- **M4 close** → default shifts to **Transcript** (Transcript becomes functional)
- **M5 close** → default stays **Transcript** (Skim becomes functional but Transcript is the better landing surface until LLM summaries land in a future phase)

The default-tab choice is a single constant `DEFAULT_TAB_ON_SELECTION` exported from `SessionView.tsx`; the M4 shift is a one-line edit + one test update.

Rationale for not landing on Skim: Skim's `user_turn` blocks render the disabled-summary placeholder until LLM summaries land in a future phase; landing a user on a screen full of "Summary disabled — generation deferred" placeholders feels broken at first glance. Transcript shows real content immediately. Skim becomes the value-add when summaries generate.

Tab state is component-local React state, NOT URL-synced (deferred decision #2). The active-tab value lives on `SessionView` and resets to the `DEFAULT_TAB_ON_SELECTION` constant on every `selectedRowKey` change. Per Resolved Decision #11, that constant is `"metadata"` until M4 ships Transcript, then `"transcript"` from M4 onward.

Tab switching does NOT re-fetch raw bytes — the `useParsedSession` cache hit serves the Skim and Transcript tabs; Raw uses its own independent streaming consumer (`rawPreview.ts`); Metadata bypasses parser fetch entirely (it only reads the SessionRow already in `App.tsx` state).

**Panel mounting strategy:** lazy-on-first-activation + keep-mounted-after.

- `SessionView` tracks `visitedTabs: Set<TabId>` in component-local state, initialized to `new Set([defaultTab])` on every `selectedRowKey` change.
- A tab panel is rendered (React-mounted) only if it is the active tab OR has been visited before (i.e., `visitedTabs.has(tabId)`).
- When the user activates a tab for the first time, it is added to `visitedTabs` and remains mounted for the rest of the selection. Inactive-but-visited panels carry the `hidden` attribute (`display: none` semantics + accessibility-tree exclusion).
- This avoids the contradiction of mounting heavy parsed-content tabs (Skim, Transcript) before they're visited — their `useParsedSession` `useEffect` would otherwise fire and trigger the 5 MB full-document fetch even when the user lands on Metadata.
- On `selectedRowKey` change, `visitedTabs` resets and all panels unmount cleanly. The cache (in `useParsedSession`) persists across selection changes, so re-selecting the same session re-mounts a panel that finds a cache hit.

This preserves transcript scroll position + skim disclosure expansion state across tab switches WITHIN a single selection, while ensuring Skim/Transcript do not preemptively fetch when the user only intends to see Metadata or Raw.

The Tabs primitive at `apps/frontend/src/components/Tabs.tsx` implements ARIA `tablist` / `tab` / `tabpanel` with Left/Right keyboard nav, Home/End to first/last, automatic activation (selection follows focus per [WAI-ARIA Authoring Practices](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/)), and `aria-controls` / `aria-labelledby` linkage.

**Visual treatment (Archive-room):** the tab strip is a flush row of text labels separated by 12 px gaps. The active tab carries a 1 px `--color-accent` ink-stroke indicator beneath its label, animated with `transform: translateX` over `--motion-base` (`120ms ease-standard`) so the indicator slides between tabs rather than teleporting. Implementation: a single absolutely-positioned `<span class="indicator">` inside the `<div role="tablist">`, positioned via `transform` driven by an active-tab data attribute (CSS `:has()` selector OR a `data-active-tab` attribute on the tablist). Inactive tab labels use `--color-ink-muted`; active uses `--color-ink` and `font-weight: 600`. No background fills; no rounded pills. Reduced-motion zeroes the slide.

### State handling for parsed-content tabs (Skim + Transcript)

Both Skim and Transcript invoke `useParsedSession(row)` and switch on its state union. Each non-success state has a dedicated panel; the "success" / "truncated" states render the real content per the per-tab specs below.

| State | Panel content |
|-------|---------------|
| `idle` | Not reachable — Skim/Transcript only mount after a row is selected. (If reached: render the empty-pane copy from §Inspection Surface Layout.) |
| `no_raw` (source-only row) | "This session has not been imported yet — only the source-side metadata is available. Click Import in the action bar to fetch the raw payload." Plus a quiet copy that suggests switching to the Metadata tab to see what IS available. |
| `loading` | Centered text "Reading session…" in `--color-ink-muted`. No spinner (the visual quietness fits the editorial aesthetic better than a spinner; long-load risk is bounded by the 5 MB cap). |
| `error` | "Could not load session: {error.message}." Retry button is wired to the `retry()` function on the hook result (bumps internal `retryNonce`, fires a fresh fetch skipping cache). |
| `success` | Per-tab content (see Skim and Transcript subsections below). |
| `truncated` | Per-tab content + a top-of-pane warning banner: "Truncated at 5 MB — full payload not parsed. Use the **Open raw** anchor in the session header to inspect the full payload." (Raw tab is also capped; the unconditional escape hatch is the header anchor.) |

Both panels also surface `parsed.warnings` (when non-empty) as a small dismissible banner per the Transcript tab spec — even when state is "success" or "truncated".

### Skim tab

Renders `parsed.skim` (the `SkimBlock[]` from `buildSkim`). The skim layout is editorial: blocks stack vertically with 24 px breathing room between same-kind blocks, 32 px between different kinds. Block content respects the 70ch reading measure. First-paint stagger animation per the motion budget (max 8 blocks staggered).

For each block kind:

- **`user_turn`**: renders the user message inline (verbatim text in `--font-chrome` `--text-base`, code-fenced segments swap to `--font-mono` with `--color-surface-raised` background). Panel padding 24 px 32 px. Below it, a collapsible `<details>` element with summary "Agent reaction (N messages)" and body containing the disabled-summary placeholder copy:

  > Summary disabled — generation deferred to a later phase. Use "Expand to raw messages" to read the agent's response inline.

  The disabled placeholder is set in `--color-ink-muted` with a 4 px left-border in `--color-border` (visual cue: this is a placeholder, not real content). Followed by an "Expand to raw messages" affordance (button styled as a quiet text link): clicking renders a scoped `<TranscriptView>` component restricted to the messageIndex range `[block.start+1, block.end]` (the agent reaction).

- **`boundary`** (signature treatment — chapter break): rendered as a full-width 1 px hairline at `--color-border-strong` with a centered label in `--font-display` italic small-caps at `--text-sm`, `--color-ink-muted`. 32 px vertical breathing top + bottom. Copy: "SESSION RESUMED" for `meta.subtype === "session_resumed"`; "CONVERSATION COMPACTED" for `meta.subtype === "compacted"`. Implemented as `<hr role="separator">` + adjacent `<span>` overlaid via CSS Grid. NEVER merged into a neighbor. This is signature detail #1 — verified at M5 close.

- **`agent_only`**: collapsed by default. Summary line in `--font-chrome` `--text-sm` `--color-ink-muted`: "Agent-only session ({count} messages)". Expanding reveals a scoped TranscriptView spanning `[block.start, block.end]`. PRD line 256 mandates collapsed default. Visual treatment: muted panel with hairline border, no accent tint.

- **`oversized_user_message`**: collapsed by default. Header in `--font-chrome` `--text-sm`: "Oversized user message ({sizeKB} KB) — collapsed by default". Expanding shows the verbatim message text in `--font-mono` (since these are typically pasted-in dumps). NEVER summarized (PRD line 257). Visual treatment: warning-tinted left border (status warning color) so the user notices the size signal.

The Skim view NEVER renders silently blank for any state — the disabled placeholder always carries copy per PRD line 223.

### Transcript tab

Flat chronological render of `parsed.messages`. Reading-content layout: max-inline-size 70ch, generous vertical rhythm (16 px between messages, 24 px between adjacent same-kind messages with a kind-change gap of 32 px). All message bodies use `--font-chrome` `--text-base` `--leading-comfortable` except code segments which swap to `--font-mono`.

Per kind:

- **`user`**: panel with attribution row ("User · {relativeTime}", small caps, `--color-ink-muted`, `--text-xs`), body in `--color-ink`. Background `color-mix(in srgb, var(--color-accent) 5%, var(--color-surface))` (mirrors selected-row recipe). Code-fenced segments render as inline `<code>` (single-line) or `<pre>` (multi-line) at `--color-surface-raised` with `--font-mono`.
- **`assistant`**: panel with attribution row ("Assistant · {relativeTime}"), body in `--color-ink`. Background `--color-surface` (default). Visually distinct from user via the tint differential — this differential MUST pass WCAG AA against `--color-ink` in both light and dark modes (M4 measurement gate).
- **`tool_use`**: monospace block. Header line "Tool · {toolName}" in `--font-chrome` `--text-xs` `--color-ink-muted`; body is a collapsible `<details>` summary "Arguments" + `<pre>` of `JSON.stringify(input, null, 2)` in `--font-mono` `--text-sm`.
- **`tool_result`**: header "Tool result · {toolName}" identical typography to `tool_use`. First 2 KB of body rendered; rest behind a quiet "Expand ({N more bytes})" text-link if larger. `<details>` element wraps the overflow.
- **`system`**: single line in `--color-ink-muted` `--text-sm`, prefixed with a small `system ·` label. No panel chrome.
- **`boundary`**: full-width 1 px hairline at `--color-border-strong` with a centered label in `--font-display` italic small-caps `--text-sm` `--color-ink-muted`. Copy: "SESSION RESUMED" (boundarySubtype === "session_resumed") or "CONVERSATION COMPACTED" (boundarySubtype === "compacted"). Same chapter-break treatment as Skim's boundary blocks (signature detail #1) — verified at M4 close. NEVER merged with neighbors.
- **`unknown`**: muted single line "Unrecognized line: {first 80 chars}…" in `--font-mono` `--text-xs` — fallback for unparseable shapes.

Each message panel carries a timestamp display: relative time as visible label (`relativeTimeFrom(now, msg.timestamp)`), absolute ISO via `<time dateTime="...">` and on `title=` hover. Timestamps with `null` value render as "—" (preserved from Phase 4 contract).

If `parsed.truncated`, a small banner at the top of the Transcript: "Truncated at 5 MB — full payload not parsed. Use the **Open raw** anchor in the session header to inspect the full payload." Banner styled with warning status color and a `--motion-base` opacity entrance.

If `parsed.warnings` is non-empty, a small dismissible banner: "{N} parse warnings — click to view." Expanding reveals the warnings list with `line {lineOrdinal} · {reason}` in `--font-mono` `--text-xs`; the messages stream still renders (warnings are non-blocking). Dismissing the banner is component-local state (re-arrives on next session selection).

### Raw tab

Byte-equivalent to Phase 4's drawer raw-preview block. Mounts `RawTab.tsx` (extracted from `SessionDetail.tsx`'s `RawPreviewBlock`): `streamSessionRaw` + `consumeRawPreview` (20-line OR 256 KB cap, AbortController on tab unmount). The full-document fetch used by Skim/Transcript is a SEPARATE consumer (`streamRawText.ts`, 5 MB cap) — they don't share state.

Raw tab is the verifiability hatch: when transcript/skim look wrong, the user inspects the actual on-disk NDJSON.

### Metadata tab

The 18-field `<dl>` extracted verbatim from `apps/frontend/src/features/sessions/SessionDetail.tsx` (lines 160–256 in Phase 4 close), plus the subagent sidecar badge if `row.hasSubagentSidecars`, the sourcePathIsStale label, the statusConflict badge, the copy-to-clipboard button for sourcePath, and the "Open raw" anchor (also present in the header — both surfaces keep the affordance for discoverability). **The "Open raw" anchor is rendered only when `row.storedSessionUid !== null`** (Phase 4 invariant; preserved verbatim).

Phase 5 does NOT add new metadata fields; it relocates the existing 18 fields from drawer to Metadata tab.

## Per-tool Message Parsers (Detail)

### File layout

```text
apps/frontend/src/features/sessions/parsers/
├── types.ts          # Message / MessageKind / SkimBlock / BlockKind / ParserOutput / ParsedSession / StreamMeta / ParseWarning
├── claude_code.ts    # parseClaudeCode (returns ParserOutput)
├── codex.ts          # parseCodex (returns ParserOutput)
├── buildSkim.ts      # Message[] → SkimBlock[] (separate from per-tool parsing) + USER_MSG_OVERSIZE_THRESHOLD constant
└── index.ts          # PARSERS registry + dispatchParser(tool, rawText, streamMeta) → ParsedSession
```

Tests sit alongside as `claude_code.test.ts`, `codex.test.ts`, `buildSkim.test.ts`.

### Claude Code field paths (parser uses these; the Rust adapter at `components/collector-runtime/src/adapters/claude_code.rs` reads the same top-level shape for metadata extraction; see `tests/fixtures/claude_code/sample_session.jsonl` for canonical examples)

The Claude Code JSONL has a **top-level `"type"`** field tagging each line (`"user"` / `"assistant"` / `"summary"` / `"custom-title"` / `"permission-mode"` / etc.). The Rust adapter discriminates via `string_field(record, "type")` (claude_code.rs:151, 161).

| Top-level `type` | Parser action |
|------------------|---------------|
| `"user"` | Walk `/message/content`. If string → emit one `Message` of kind `"user"` with `text` = the string. If array → emit one `Message` per item: items with `{type: "text", text}` → `MessageKind = "user"` with `text`; items with `{type: "tool_result", tool_use_id, content}` → `MessageKind = "tool_result"` with `text` = the content (string or `JSON.stringify(content)`). All split-content emissions share the same `lineOrdinal` but get sequential `messageIndex` values. |
| `"assistant"` | Walk `/message/content`. If string → emit one `Message` of kind `"assistant"`. If array → emit one `Message` per item: `{type: "text", text}` → `MessageKind = "assistant"`; `{type: "tool_use", name, input, id}` → `MessageKind = "tool_use"` with `toolName: name` and `text: JSON.stringify(input, null, 2)`. |
| `"summary"` | `MessageKind = "system"` with `text: leafUuid + ": " + summary` (matches Phase 4 adapter handling). |
| `"system"` | `MessageKind = "system"` with `text: /content` or short tag if absent. |
| `"custom-title"` / `"permission-mode"` | No message emitted (these are session-level metadata; carried by the Rust adapter for indexing, not part of the message timeline). |
| (any other top-level `type`) | `MessageKind = "unknown"` with `text: JSON.stringify(record).slice(0, 240)` and a `warnings[]` entry. |

Top-level `/timestamp` → `Message.timestamp` (RFC3339; `null` if missing or unparseable). Top-level `/message/role` is consulted as a sanity check against top-level `type` (mismatch → `warnings[]` entry, but the parser still emits using top-level `type` as authoritative).

Lines whose JSON fails to parse → `warnings.push({lineOrdinal, reason})` and skipped from `messages` entirely.

### Codex field paths (parser uses these; `components/collector-runtime/src/adapters/codex.rs` reads the same top-level shape; see `tests/fixtures/codex/sample_session.jsonl` for canonical examples)

Codex JSONL records have a **top-level `"type"`** field tagging the record kind. The Rust adapter walks `string_field(record, "type")` (codex.rs:85, 137, 144); the client parser does the same. **There is no `record_type` field** — that name was incorrect in earlier drafts.

**Anchor principle (resolves response_item ↔ event_msg duplication):** The Codex stream emits BOTH an API-layer `response_item` AND a UI-layer `event_msg` for the same logical user/assistant message. The fixture at `tests/fixtures/codex/sample_session.jsonl` shows the prompt "Introduce omx and its subcommands." appearing in both. To avoid duplicate `Message` rows in the timeline, **`event_msg` is the canonical anchor for user/assistant turns**; `response_item` of role user/assistant is SKIPPED (its information is captured in the matching event_msg). `response_item` is consulted only when it carries information NOT present in event_msg (e.g., explicit `tool_call` / `function_call` payloads in some Codex versions); M3 planner refines based on inspected fixtures.

| Top-level `type` | `payload.type` | Parser action |
|------------------|----------------|---------------|
| `session_meta` | (none) | First occurrence in stream → `Message.kind = "system"` with `text` summarizing `payload.cwd / cli_version / model_provider`. **Subsequent occurrence in the same stream** → emit a `Message.kind = "boundary"` with `boundarySubtype: "session_resumed"`. (buildSkim then converts this to a `boundary` SkimBlock.) |
| `response_item` | `message` (role: user/assistant) | **SKIP** — duplicate of the matching `event_msg.user_message` / `agent_message`. The anchor principle above. No message emitted. |
| `response_item` | `function_call` / other non-message payloads | `Message.kind = "tool_use"` with `toolName: payload.name` (or fallback "function_call") and `text: JSON.stringify(payload.arguments)`. Emitted because event_msg might not carry this. M3 planner verifies. |
| `turn_context` | (none) | No message emitted; the field is for adapter metadata (project_path) and not part of the message timeline. |
| `event_msg` | `user_message` | `Message.kind = "user"` with `text: payload.message` (CANONICAL user turn anchor) |
| `event_msg` | `agent_message` | `Message.kind = "assistant"` with `text: payload.message` (CANONICAL assistant message anchor) |
| `event_msg` | `agent_reasoning` | `Message.kind = "assistant"` with `text: payload.text` (if present). Inline with the surrounding assistant text; no special discrimination at the typed-message layer (the Raw tab is the verifiability hatch if a consumer needs to distinguish reasoning from final output). |
| `event_msg` | `task_started` / `task_complete` | `Message.kind = "system"` with brief description |
| `event_msg` | `exec_command` / `exec_command_output` | `Message.kind = "tool_use"` / `tool_result` with `toolName: "exec"` and `text: JSON.stringify(payload.command)` / `payload.output` |
| `event_msg` | `error` | `Message.kind = "system"` with `text: payload.message` and a `warnings[]` entry citing the line |
| `event_msg` | other | `Message.kind = "unknown"` with `text` = `JSON.stringify(payload).slice(0, 240)` and a `warnings[]` entry citing the unknown payload.type |
| (any other top-level `type`) | n/a | `Message.kind = "unknown"` with a `warnings[]` entry |

Top-level `/timestamp` → `Message.timestamp`. `payload.timestamp` is used as fallback when top-level is missing.

**Important**: the table above lists known shapes from the Phase 4-era fixture and Rust adapter coverage. The Codex tool emits more `event_msg` payload types (active development); the M3 planner widens the table by inspecting:
- `tests/fixtures/codex/sample_session.jsonl` (canonical short session)
- `tests/parsers.rs` `CODEX_FORKED_FIXTURE` + `CODEX_UNRELATED_LATER_META_FIXTURE` constants
- The upstream Codex CLI changelog if any new event types have shipped since Phase 4 spec time

Unknown payload types fall through to `MessageKind = "unknown"` with a `warnings[]` entry — the parser is total (never throws). The Raw tab is the verifiability hatch when the user encounters unknown shapes.

### buildSkim algorithm (formal)

Defined in §Data Model "User-turn boundary algorithm" above.

### Truth tables (test fixtures must cover)

- Empty file → `messages: []`, `skim: [{kind: "agent_only", start: 0, end: -1, meta: {empty: 1}}]`
- Single user message (string content) → one `user_turn` block
- User → assistant → user → assistant → two `user_turn` blocks of disjoint `messageIndex` ranges
- User → assistant → tool_use → tool_result → user → ... → still two `user_turn` blocks (tool calls extend the current turn)
- Boundary mid-stream (Codex `session_resumed`) → `user_turn` / `boundary` / `user_turn`
- Agent-only run (no user msg, only assistant + tool messages) → all messages flattened into one `agent_only` block
- Single oversize user message (text > 64 KB) → one `oversized_user_message` block; no `user_turn`
- Malformed line in middle (invalid JSON) → message stream skips that line entirely (no `Message` emitted with that `lineOrdinal`), warning lands in `warnings[]` with `{lineOrdinal, reason}`
- Tool_use + tool_result inside an assistant turn → both rendered as separate Messages within the same `user_turn` block
- Codex `session_meta` followed by `turn_context` → first message is `system`; project_path NOT extracted by parser (different concern from indexing)
- Codex embedded parent meta (second `session_meta` mid-stream) → `boundary` block of subtype `session_resumed`
- Mixed Claude Code content array (text + tool_use in one message) → splits into two adjacent Messages sharing the same `lineOrdinal` (the underlying NDJSON line) but with sequential `messageIndex` values (so skim ranges and "Expand to raw messages" affordances stay well-defined).

## Filters / Sort / Search / Pagination (Carry-Over)

All Phase 4 filter / sort / search / persistence behavior is preserved verbatim. `useSessionFilters.ts`, `filterSessions.ts`, `applyPagination.ts`, `relativeTime.ts` — none change. The pipeline still runs at `App.tsx`: `mergeSessions → applyFilters → applySort → applyPagination → render`. The action bar and pagination strip move to the list panel's footer but remain controlled components driven by `App.tsx` state.

The **click-time intersection rule** is preserved verbatim. The Phase 4 regression test in `App.test.tsx` (`"M5: cross-page bulk-select"` and `"M5: pagination-cross-page click-time intersection"`) MUST still pass after the layout move. Phase 5 does not introduce new click-time-derivation paths.

The four documented empty states from Phase 4 (`no_sessions_at_all`, `no_matches_after_filter`, `nothing_to_import`, partial fetch failure with scan-errors Retry) all render identically in the list panel.

## Routing / URL State

No router dependency.

`apps/frontend/src/features/sessions/useSelectedSession.ts`:

```ts
export type UseSelectedSession = {
  selectedRowKey: string | null;
  selectRow: (rowKey: string | null) => void;
};

export function useSelectedSession(): UseSelectedSession;
```

Behavior:

- **On mount**: read `URLSearchParams(window.location.search).get("session")`; set initial state.
- **`selectRow(key)`**: update React state AND `window.history.replaceState(null, "", buildUrl(key))`.
- **`buildUrl(key)`**: preserves all other query params (future-compat with eventual filter URL state); `null` removes the `session` key entirely.
- **`popstate` listener**: re-reads URL and syncs `selectedRowKey`.

Why `replaceState` not `pushState`: casual scanning (clicking through 20 sessions) shouldn't pollute the back stack. Direct-link bookmarkability still works because the URL reflects the current selection; back navigates out of the app, not between sessions.

Direct-link missing-row case: handled in the right pane (renders recoverable empty state, not an error).

Tab state is NOT URL-synced in Phase 5 (deferred — would only land if needed for shareable deep-links to a specific tab).

## Sort Semantics (Carry-Over from Phase 4)

Unchanged. ASC nulls first, DESC nulls last. Tiebreaker chain: `source_updated_at → ingested_at → created_at → title (case-insensitive ASCII) → rowKey`.

## localStorage Persistence (Carry-Over from Phase 4)

Unchanged. `distill-portal:inspection-filters:v1` (filter state) and `distill-portal:last-manual-rescan:v1` (last rescan caption). Total decoder pattern preserved (corrupt input falls back to defaults).

Phase 5 does NOT add new localStorage keys. Selection state lives only in URL + React; it is intentionally not persisted across browser closes.

## Empty States (Carry-Over + 1 New)

Inherits the four Phase 4 empty states unchanged. Adds:

5. **session_not_found**: when URL `?session=foo` has no matching row in the merged set, the right pane renders "Session not found in current view" with "Clear selection" + "Try Rescan" buttons.

The list panel can also show its existing 4 empty states; the right pane's empty-pane copy ("Select a session…") renders independently.

## Design Tokens

The token philosophy (warm-paper + deep-ink, sienna accent, hairlines, sharp corners) lives in §Design Language. This section enumerates the concrete tokens + structural literals so reviewers can audit at chunk close.

### Color tokens (added or revised in M2)

All values land in `tokens.css`. `oklch()` is the source-of-truth; the existing 24 hex literals form a `@supports not (color: oklch(0% 0 0))` fallback layer.

| Token | Light | Dark | Notes |
|-------|-------|------|-------|
| `--color-surface` | `oklch(98% 0.01 70)` | `oklch(15% 0.01 70)` | warm-paper / deep-ink; not pure white/black |
| `--color-surface-raised` | `oklch(96% 0.01 70)` | `oklch(18% 0.01 70)` | filter strip, action bar background |
| `--color-ink` | `oklch(20% 0.02 70)` | `oklch(92% 0.01 70)` | body text |
| `--color-ink-muted` | `oklch(45% 0.02 70)` | `oklch(70% 0.01 70)` | secondary text, timestamps |
| `--color-border` | `oklch(85% 0.01 70)` | `oklch(28% 0.01 70)` | hairline default |
| `--color-border-strong` | `oklch(70% 0.02 70)` | `oklch(40% 0.02 70)` | sticky bar top edge, table header divider |
| `--color-accent` | `oklch(60% 0.15 50)` | `oklch(65% 0.15 50)` | sienna/amber, single accent |
| Status colors | inherited from Phase 4 | inherited from Phase 4 | WCAG AA must hold against new surfaces |

Default rule: **reuse before invent.** Run a WCAG AA contrast check on every new visible foreground/background pair (transcript user-message tint, transcript assistant-message background, tab strip indicator color, skim block boundary hairline, "Back to list" button, deep-link pulse fully-faded edge) in BOTH light and dark modes. Only add a token if AA fails for an unavoidable pair AND no existing token suffices. Documented in the M6 progress-log entry per Phase 4 precedent.

### Typography tokens (added in M2)

```css
--font-display: "Fraunces", Charter, "Iowan Old Style", Georgia, serif;
--font-chrome: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto, sans-serif;
--font-mono: "JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace;

--text-xs: 0.75rem;     /* 12px — timestamps, captions */
--text-sm: 0.875rem;    /* 14px — table cells, badges */
--text-base: 1rem;      /* 16px — body */
--text-lg: 1.125rem;    /* 18px — session header sub */
--text-xl: 1.5rem;      /* 24px — session title */
--text-2xl: 2rem;       /* 32px — empty-pane preface, app title */

--leading-tight: 1.25;
--leading-comfortable: 1.55;  /* reading content */

--measure: 70ch;  /* max-inline-size for transcript body */
```

### Motion tokens (added in M2)

```css
--motion-fast: 80ms;
--motion-base: 120ms;
--motion-disclosure: 200ms;
--motion-pulse: 600ms;
--ease-standard: cubic-bezier(0.4, 0, 0.2, 1);
--ease-out: cubic-bezier(0.0, 0.0, 0.2, 1);
--ease-in-out: cubic-bezier(0.4, 0, 0.6, 1);
```

### Surface treatment tokens (added in M2)

```css
--noise-overlay-light: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='80' height='80'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/><feColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.03 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>");
/* applied to .session-pane background-image only in light mode; suppressed in reduced-motion */
```

### Structural literals (enumerated per chunk's CSS file headers per design-balloon mitigation)

- `grid-template-columns: minmax(300px, 380px) 1fr` on `<main>` (M1)
- `@media (min-width: 900px)` for split-pane activation (≥ 900 px); `@media (max-width: 899.98px)` for narrowMode visibility rules (M1)
- `@media (max-width: 1100px)` filter strip wrap breakpoint (M1)
- `1px solid var(--color-border)` split-pane hairline gutter (M1)
- Selected row tint: `color-mix(in srgb, var(--color-accent) 8%, transparent)` (M1)
- Hovered row tint: `color-mix(in srgb, var(--color-ink) 4%, transparent)` (M1)
- Deep-link pulse keyframe peak: `color-mix(in srgb, var(--color-accent) 22%, transparent)` (M1)
- `2.5rem` tab strip height; `1px` indicator height (M2)
- Tab indicator color: `var(--color-accent)` (M2)
- `var(--space-3) var(--space-4)` transcript message panel padding (M4)
- User message background: `color-mix(in srgb, var(--color-accent) 5%, var(--color-surface))` (M4 — mirrors `.chip.active` recipe)
- Assistant message background: `var(--color-surface)` (M4)
- Code block background inside a message: `var(--color-surface-raised)` (M4)
- Skim chapter-break: `1px solid var(--color-border-strong)` hairline + 32 px breathing top + bottom (M5)
- Skim chapter-break label: `var(--font-display)` italic small-caps, `var(--text-sm)` (M5)
- 16rem max-height inherited from M4 raw-preview block (now in RawTab.css)
- 64 KB `USER_MSG_OVERSIZE_THRESHOLD` constant (exported from `parsers/buildSkim.ts`) (M3)
- 5 MB `STREAM_RAW_TEXT_BYTE_CAP` constant (exported from `streamRawText.ts`) (M3)
- LRU cache cap: 5 (`USE_PARSED_SESSION_CACHE_MAX`, exported from `useParsedSession.ts`) (M3)

## Documentation

**Eight-doc sweep + progress log** (matching Phase 4 §Documentation pattern). Lockstep with the chunk that introduces the change.

The eight docs:

1. `docs/README.md` — refresh frontend bullet to reflect split-pane layout + parsers/ subdirectory.
2. `docs/dependency-rules.md` — reaffirm 2-package escape-hatch budget (1 of 2 consumed; slot 2 unused unless M4 measurement fires); note `focus-trap-react` orphan-installed status post-drawer-retirement; document Fraunces self-hosted woff2 as a static asset (NOT a runtime dep).
3. `docs/dev-commands.md` — extend test-surface paragraph with new test files (parsers, useSelectedSession, useParsedSession, Tabs, SessionView, SkimView, TranscriptView, SessionMetadata, RawTab, streamRawText).
4. `docs/features/inspection-surface.md` — REWRITE to describe master-detail split-pane layout, list compression to 4 essentials, URL-state mechanics, "Back to list" affordance.
5. `docs/features/session-view.md` — NEW. Document the four tabs, the four block kinds, parser approach (per-tool), 5 MB cap behavior, oversize threshold, expansion semantics.
6. `docs/features/session-store.md` — minor update; replace any "drawer" references with "right pane".
7. `docs/playbooks/modify-frontend-page.md` — update file paths; add a new "How per-tool parsers fit" section.
8. `apps/frontend/README.md` — refresh Entry Points to add SessionView/Skim/Transcript/parsers/ subdirectory + Tabs primitive; remove deleted Drawer.

Plus the progress log (separate from the doc sweep, but updated each chunk):

- `progress/phase-5.progress.md` — created at Chunk A; appended per chunk through M6.

## Milestones

Each milestone is reviewable on its own and leaves `main` green. Two-commit pattern per chunk (impl + log update) per Phase 4 precedent. Three-reviewer rule (backend-protection Claude + normal Claude + Codex external) applies per chunk.

### Milestone 1: Layout shell + URL sync + compact list

- Split-pane CSS Grid in `App.tsx` and `global.css`; sub-900px stacked layout via media query + `narrowMode` toggle.
- `useSelectedSession.ts` + tests; `?session=<rowKey>` syncing via `window.history.replaceState`; `popstate` listener; missing-row recoverable state.
- `SessionsTable.tsx` compressed to 4 columns (Title with inline tool badge + muted rowKey; Status; Project; Updated). Select column preserved (importability rule). Row-click sets `selectedRowKey`. `aria-current="true"` on selected row.
- `SessionView.tsx` placeholder mounted as right pane; renders empty-pane copy when no `selectedRowKey`; renders a single "coming soon" message when a row is selected (tabs land in M2).
- Vestigial drawer link in the empty session pane: a small "Open detail" button reachable when a row is selected, pointing at the existing Phase 4 `<Drawer>` (still mounted). Removed in M2 once Metadata tab is functional.
- `<ActionBar>` and `<Pagination>` move into the list panel footer.
- `<SessionFilters>` stays at top of list panel; below 1100 px wraps in `<details>`.

Definition of done:

- Click row → URL updates → vestigial drawer reachable.
- Reload restores the URL-driven selection; the `popstate` listener correctly restores selection when the user navigates back into the app from out-of-app history; deep-link to missing row shows recoverable empty (after the source/stored fetches have settled — see §URL state for loading semantics). **Browser Back/Forward does NOT navigate between session selections by design** — Resolved Decision #1 picks `replaceState` over `pushState` to avoid back-stack pollution.
- Compact 4-column list renders within the 300–380 px pane on 1280 px+ viewports without horizontal scroll.
- Sub-900 px viewport stacks correctly; "Back to list" works.
- Phase 4 unit + Playwright e2e tests still green (especially the click-time intersection regressions in `App.test.tsx`).
- `cargo` gates / `bun test src` / `bun run build` / `bun run test:e2e` all green.

### Milestone 2: Tabs primitive + SessionView shell + Metadata tab

- `apps/frontend/src/components/Tabs.tsx` + `.css` + `.test.tsx`: ARIA `tablist` / `tab` / `tabpanel` + arrow-key nav (Left/Right/Home/End); selection follows focus.
- `SessionView.tsx` + `SessionView.css` + `SessionView.test.tsx` rewire to a four-tab shell using the Tabs primitive. Default active tab AT M2: **Metadata** (the only fully-functional parsed-content tab at M2; shifts to **Transcript** at M4). Per Resolved Decision #11.
- `SessionMetadata.tsx` + `.css` + `.test.tsx`: extracted from `SessionDetail.tsx`'s `<dl>` body verbatim. All 18 SessionRow fields preserved.
- `RawTab.tsx` + `.test.tsx`: extracted from `SessionDetail.tsx`'s `RawPreviewBlock`. Byte-equivalent behavior to Phase 4 (20-line OR 256 KB cap, AbortController on tab unmount). The existing `rawPreview.ts` consumer is reused unchanged.
- Vestigial M1 drawer link removed; clicking a row now opens SessionView with **Metadata** tab active (the M2-close default per Resolved Decision #11). Skim renders "coming soon" copy until M5; Transcript "coming soon" until M4; Raw + Metadata fully functional.

Definition of done:

- Metadata tab renders all 18 fields exactly as Phase 4 drawer.
- Tab strip keyboard-navigable (Left/Right/Home/End, focus follows selection).
- Raw tab byte-equivalent to Phase 4 drawer raw preview (same caption strings, same cancel-on-unmount).
- Skim/Transcript tabs render "Coming in Phase 5 Milestone 4/5" copy.
- All previous tests still green.
- `Drawer.tsx` + `SessionDetail.tsx` still on disk but no longer reachable from the UI.

### Milestone 3: Per-tool parsers + buildSkim + truth tables

- `parsers/types.ts` (Message, MessageKind, SkimBlock, BlockKind, ParseWarning, ParserOutput, ParsedSession, StreamMeta).
- `parsers/claude_code.ts` + `parsers/codex.ts` + `parsers/buildSkim.ts` + tests; parsers return `ParserOutput`, not `ParsedSession`.
- `parsers/index.ts`: `PARSERS` registry + `dispatchParser(tool, rawText, streamMeta): ParsedSession` entry.
- `streamRawText.ts` + `.test.ts`: `streamRawText(storedSessionUid, signal): Promise<{text, totalBytes, truncated}>` with 5 MB cap, AbortSignal, truncation flag.
- `useParsedSession.ts` + `.test.ts`: lazy fetch + parser dispatch + per-`(storedSessionUid, tool)` LRU(5) cache + module-scoped `cacheEpoch` invalidation + abort on `storedSessionUid` change. Returns the state union including `no_raw` for source-only rows.

Definition of done:

- Both parsers produce a correct `ParserOutput` (`{messages, warnings}`) for every truth-table fixture (see §Per-tool Message Parsers → Truth tables). Parsers are pure of stream metadata.
- `dispatchParser(tool, rawText, streamMeta)` correctly assembles `ParsedSession` from parser output + stream metadata + `buildSkim`. Unknown tool falls through to empty session + warning (total).
- `buildSkim` 100% branch coverage on the algorithm above (with the dual-tracker explicit test fixtures: empty / one-user-msg / system-then-user / boundary-mid-stream / agent-only / oversized / mixed kinds).
- `useParsedSession` correctly aborts in-flight fetches on `storedSessionUid` change; correctly drops in-flight results when `cacheEpoch` changes mid-fetch.
- `useParsedSession` correctly returns `no_raw` for `row.storedSessionUid === null` (source-only rows) without firing a fetch.
- Tab switching does NOT re-fetch raw bytes (cache hit serves the two parsed-content tabs — Skim and Transcript; Raw uses its own consumer; Metadata bypasses parser fetch entirely).
- `streamRawText` mirrors `rawPreview.test.ts` patterns: hand-built ReadableStreams, abort-mid-loop, byte-cap fires (`reader.cancel()` proven by spy), body-less response. Returns `totalBytes === STREAM_RAW_TEXT_BYTE_CAP` exactly when truncated.
- No new dependencies; no backend or contract changes.
- All gates green.

### Milestone 4: TranscriptView

- `TranscriptView.tsx` + `.css` + `.test.tsx`: chronological message list with per-kind rendering (user / assistant / tool_use / tool_result / system / boundary / unknown), absolute + relative timestamps via `relativeTimeFrom`, monospace for code-fenced segments, collapsible long tool_result body (>2 KB), truncation banner when `parsed.truncated`, parse-warnings dismissible banner. Boundary case renders the chapter-break treatment (full-width hairline + small-caps Fraunces label) matching Skim's signature detail #1.
- Wire into `SessionView`; **Transcript** tab now functional (Skim still placeholder until M5).
- Shift `DEFAULT_TAB_ON_SELECTION` constant in `SessionView.tsx` from `"metadata"` to `"transcript"` (per Resolved Decision #11); update the corresponding `SessionView.test.tsx` assertion. One-line code change + one-line test change.
- Long-corpus measurement step: synthetic 5k-message fixture; Playwright frame-timing capture or manual perf measurement on real Chromium. If > 16 ms per frame for scroll → escape-hatch slot 2 fires (`@tanstack/react-virtual` lands per documented spec policy). Otherwise virtualization stays deferred and the measurement is recorded in the progress log.

Definition of done:

- Every `MessageKind` renders with correct visual distinction; user-vs-assistant tint passes WCAG AA.
- Truncation banner renders when `parsed.truncated`.
- Parser warnings surface as a small dismissible banner without blocking the message stream.
- Long-corpus measurement recorded in progress log; if escape-hatch slot 2 fires, the documented Chromium reproducer is captured per spec.
- All gates green; no regression in M3 parser tests.

### Milestone 5: SkimView with four block kinds

- `SkimView.tsx` + `.css` + `.test.tsx`: renders all four block kinds.
- `user_turn`: user message inline + collapsible "Agent reaction" disclosure with the disabled placeholder copy + "Expand to raw messages" affordance reusing TranscriptView scoped to messageIndex range.
- `boundary`: divider with "Session resumed" / "Conversation compacted" copy; NEVER merged into a neighbor.
- `agent_only`: collapsed by default; expanding reveals scoped TranscriptView.
- `oversized_user_message`: collapsed by default; expanding reveals verbatim text; NEVER summarized.
- Wire into `SessionView`; **Skim** tab now functional. All four tabs operational.

Definition of done:

- No-user-msg session shows single collapsed `agent_only` block.
- Single-oversize-user-msg session shows single `oversized_user_message` block (no other content).
- Boundary blocks render between turns when present in fixtures.
- Disabled-summary placeholder copy renders verbatim under every `user_turn` (text matches PRD intent).
- "Expand to raw messages" reveals scoped TranscriptView restricted to the turn's messageIndex range.
- WCAG AA on every new visible color pair.
- All gates green.

### Milestone 6: Cleanup, retire drawer, doc sweep, WCAG, log

- Delete `apps/frontend/src/features/sessions/SessionDetail.tsx` + `SessionDetail.test.tsx` + `SessionDetail.css`.
- Delete `apps/frontend/src/components/Drawer.tsx` + `Drawer.test.tsx` + `Drawer.css`.
- Decide `focus-trap-react` orphan status: KEEP installed (recommended; future modal needs may revive; cost is negligible). Document the orphan in `docs/dependency-rules.md`.
- Eight-doc sweep per §Documentation.
- Hex audit: `rg -n '#[0-9a-fA-F]{3,8}' apps/frontend/src/ | wc -l = 24` (or documented delta if WCAG forced new tokens).
- WCAG AA measurements for every new visible foreground/background pair across light + dark modes; record table in progress log per Phase 4 precedent.
- All gates green: `cargo check --workspace`, `cargo test --workspace`, `cargo test -p distill-portal-ui-api-contracts --features ts-bindings`, `bun test src`, `bun run build`, `bun run test:e2e`.
- Final progress log entry recording the close of Phase 5.

Definition of done:

- Retired files gone from disk and from doc cross-references (verify via `rg`).
- No drawer modal in the running app (Playwright happy path passes; no `<dialog>` opens).
- All gates green; no contract drift.
- Comprehensive WCAG table in progress log.
- Phase 5 progress log records every chunk including the three-reviewer trail per chunk.

## Acceptance Criteria

Phase 5 is complete when all of the following are true:

- Split-pane master-detail layout works on viewports ≥ 900 px; stacked layout below; both modes preserve every Phase 4 invariant.
- Compact list shows 4 essentials per row (Title + tool badge inline; Status; Project; Updated) plus the Select column. Phase 4's dropped columns (Source Path, Stored Copy, Tool as a column) reachable in the Metadata tab.
- Right pane has Transcript / Skim / Raw / Metadata tabs backed by the Tabs accessibility primitive (ARIA tablist + Left/Right/Home/End nav).
- Per-tool parsers cover the truth-table matrix; both `parseClaudeCode` and `parseCodex` are pure / total / synchronous (never throw).
- `buildSkim` produces correct `SkimBlock[]` for every fixture in the truth table.
- TranscriptView renders messages chronologically with per-kind visual distinction; collapsible long tool_result; truncation banner when applicable.
- SkimView renders all four block kinds with the disabled-summary placeholder per PRD line 223; never silently blank; never summarizes oversized user messages or agent-only sequences.
- Raw tab byte-equivalent to Phase 4 drawer raw preview block.
- Metadata tab carries all 18 SessionRow fields + subagent sidecar badge + sourcePathIsStale label + statusConflict badge + copy-to-clipboard.
- URL state survives reload + Back/Forward; deep-link missing-row shows recoverable empty state.
- WCAG AA contrast verified on every new visible foreground/background pair, light + dark.
- No new runtime dependency beyond Phase 4 baseline unless escape-hatch slot 2 fires with documented evidence.
- All Phase 4 invariants preserved (filters / sort / persistence / click-time intersection / importability rule / per-fetch error isolation / four empty states).
- All verification gates pass: `cargo check --workspace`, `cargo test --workspace`, `cargo test -p distill-portal-ui-api-contracts --features ts-bindings`, `bun test src`, `bun run build`, `bun run test:e2e`.
- **Archive-room aesthetic delivered**: warm-paper / deep-ink color tokens in `tokens.css`; Fraunces self-hosted with system-serif fallback; chrome / mono stacks declared; `oklch()` source-of-truth with hex `@supports` fallback. Hex literal count in `apps/frontend/src/` = 24 baseline + documented WCAG-driven additions only.
- **Six signature details verified** in M6 close: chapter break (skim boundary), page-turn fade (right-pane content), deep-link pulse (URL-driven row arrival), hairline gutter (split-pane divider), tab indicator slide, reading wash (noise overlay).
- **Motion budget honored**: every animated surface listed in §Motion table; allowed animatable properties are `transform`, `opacity`, and `background-color` (background-color only on the surfaces that explicitly list it in §Motion: row hover, row selection, deep-link pulse). The documented `<details>` `block-size` exemption (§Performance budget) is the only layout-touching animation. No `width` / `height` / `top` / `padding` animations anywhere. Skim-block stagger capped at 8 blocks.
- **Reduced-motion zero-out works**: with `prefers-reduced-motion: reduce` set, every transition completes in one paint frame; noise overlay suppressed; one M6 manual verification.
- 8-doc sweep complete; phase-5 progress log records every chunk.

## Testing

Per-chunk test obligations (additive — Phase 4 tests remain green throughout):

- **Per-tool parser unit tests** with truth tables (M3): pattern follows `mergeSessions.test.ts`. Fixture matrix in §Per-tool Message Parsers → Truth tables.
- **`buildSkim.test.ts`** (M3): exhaustive matrix per the algorithm.
- **`streamRawText.test.ts`** (M3): mirrors `rawPreview.test.ts` — hand-built ReadableStreams, abort-mid-loop, byte-cap fires (`reader.cancel()` proven by spy), body-less response, pre-aborted signal.
- **`useParsedSession.test.ts`** (M3): idle / no_raw / loading / success / error / truncated; abort-on-storedSessionUid-change; cache-hit-on-tab-switch; LRU eviction at cap=5; epoch invalidation on Rescan AND on Import-success drops in-flight result; cache survives selectedRowKey churn within cap.
- **`useSelectedSession.test.ts`** (M1): initial URL read / `selectRow` updates URL via `replaceState` / `popstate` syncs back / null clears param.
- **`Tabs.test.tsx`** (M2): keyboard nav (Left/Right/Home/End), ARIA roles, panel switching, focus model, automatic activation.
- **`SessionView.test.tsx`** (M2 + M5): empty-pane copy when no selection; tab switching; header rendering with subagent sidecar badge; missing-row recoverable copy.
- **`SkimView.test.tsx`** (M5): render of each block kind; expand/collapse; "Expand to raw messages" reveals scoped TranscriptView; disabled-summary placeholder copy renders.
- **`TranscriptView.test.tsx`** (M4): per-kind rendering; timestamps; collapse-long-tool_result; truncation banner; parse-warnings banner.
- **`SessionMetadata.test.tsx`** + **`RawTab.test.tsx`** (M2): verbatim Phase 4 drawer tests adapted to extracted components.
- **`SessionsTable.test.tsx`** extended (M1): 4-column compression renders correctly; row-click sets URL via `useSelectedSession`; `aria-current` styling on selected row; checkbox-cell propagation guard preserved.
- **`App.test.tsx`** extended (M1): split-pane mounts; URL-on-mount reads `?session=`; `popstate` round trip; click-time intersection still passes (M5 cross-page bulk-select test, M5 pagination-cross-page test).
- **Playwright e2e** extended (M1 + M2 + M5): seeded session opens via row click → URL updates via `replaceState` → tab strip navigable → Skim tab renders blocks for the seeded fixture → reload preserves selection → deep-link to `?session=` opens session pane on load with the deep-link pulse animation. (Browser Back/Forward intentionally does NOT navigate between session selections — see Resolved Decision #1.)
- **Accessibility** (M1 + M2 + M5): keyboard nav through list (Up/Down + Enter selects); tab strip (Left/Right/Home/End); skim disclosures (Tab + Enter to expand); landmarks `<aside>` for list, `<article>` for session pane; `aria-current="true"` on selected row.
- **WCAG AA contrast** (M4 + M5 + M6): script extension to cover transcript message tints, tab strip indicator, skim block boundary divider, "Back to list" button. M6 produces the comprehensive table for the progress log.

## Risks

- **Per-tool message format drift**: tool authors change shape between versions. Mitigation: `MessageKind = "unknown"` fallback + `warnings[]` stream + Raw tab as verifiability hatch. Same risk + mitigation pattern as the Rust adapters in `components/collector-runtime/src/adapters/`.
- **Long transcripts (> 5k messages) cause render jank**: most sessions are short; M4 includes a measurement step on a synthetic fixture; escape-hatch slot 2 fires only on documented evidence. If slot 2 fires, the dep budget reaches 2/2 — Phase 6+ has no further escape-hatch slots without spec amendment.
- **5 MB full-document cap too low**: PRD doesn't specify a corpus ceiling; truncation banner + Raw tab cover larger sessions. Lift in a future configuration phase if real corpora exceed 5 MB.
- **Split-pane on narrow viewports**: below 900 px panes stack; "Back to list" affordance must be discoverable in the session header (and Esc as the keyboard equivalent for fully clearing). Browser Back does NOT navigate between session selections per Resolved Decision #1 (`replaceState`); the right gestures for returning to the list are "Back to list" (preserves selection) or Esc (clears selection).
- **URL state collision with future filter URL state**: Phase 5 owns only `?session=`. `useSelectedSession`'s `buildUrl` mutates only that key (preserves all other query params).
- **`replaceState` vs `pushState` UX regret**: if users frequently want to "go back to the previous session" via browser Back, `replaceState` doesn't support that. Mitigation: revisit if user feedback asks; the History API distinction is a one-line change.
- **Drawer retirement breaks user muscle memory**: M1 ships the layout AND a vestigial "Open detail" link to the still-mounted drawer; M2 removes both once SessionView shell + Metadata tab are functional. Users discover the new shape via the persistent right-pane.
- **Hex isolation regression**: M6 hex audit MUST equal Phase 4 baseline (24) plus any documented WCAG-driven additions. Codex routinely re-runs this check.
- **Parser correctness drift**: truth tables in M3 are exhaustive against documented fixtures; warnings banner surfaces parse failures; Raw tab is the verifiability hatch when a fixture surprises us.
- **Click-time intersection regression**: M1 DoD explicitly requires the Phase 4 regression tests to still pass after the layout move. Selection ownership moves from `SessionsView` to `App.tsx` (or stays in `SessionsView` — M1 planner decides) without changing the importability-derivation point.
- **Codex catches Claude blind spots (precedent confirmed across all M1–M6 chunks of Phase 4)**: every chunk had at least one Codex-driven fix-up round. Expect the same for Phase 5; M6 of Phase 4 needed three Codex rounds. Plan time for ≥ 2 Codex rounds per chunk.

## Resolved Decisions (from planner)

These decisions are resolved; future planners/reviewers should treat them as load-bearing assumptions, not as open questions:

1. **`replaceState` over `pushState`** for `?session=` sync (no back-stack pollution; revisit only on user feedback).
2. **`?tab=...` NOT URL-synced** in Phase 5 (deferred; tab state is component-local React state).
3. **No search-within-transcript** in Phase 5 (deferred until annotations land in a future phase).
4. **Oversized-user-message threshold = 64 KB** (constant `USER_MSG_OVERSIZE_THRESHOLD`).
5. **Full-document fetch cap = 5 MB** (constant `STREAM_RAW_TEXT_BYTE_CAP`); truncation banner directs users to the session-header **"Open raw"** anchor (which opens the full uncapped `/api/v1/sessions/<storedSessionUid>/raw` endpoint in a new tab) as the escape hatch for > 5 MB payloads. The Raw tab itself remains capped at 256 KB / 20 lines (byte-equivalent to Phase 4) and is the verifiability hatch for *small-to-medium* payloads.
6. **`Drawer.tsx` + `SessionDetail.tsx` DELETED in M6** (no future modal in Phase 5).
7. **`focus-trap-react` left installed** as orphan after drawer retirement (negligible cost; future modal needs may revive).
8. **Subagent sidecar badge appears in the session header AND the Metadata tab** (header for at-a-glance discovery, Metadata for canonical record); row stays at 4 essentials (no badge in the compact list).
9. **Skim "Expand to raw messages" reuses TranscriptView** scoped to messageIndex range (typed messages, not raw NDJSON; Raw tab is the verifiability hatch for raw bytes).
10. **Aesthetic direction = "Archive-room"** (warm-paper / deep-ink / sienna accent / hairlines / sharp corners / restrained motion). Documented in §Design Language.
11. **Default active tab progression** (revised from initial "Skim always" recommendation):
    - M2 close → default = **Metadata** (the only fully-functional parsed-content-free tab at M2; Skim + Transcript still render "Coming soon" copy).
    - M4 close → default shifts to **Transcript** (Transcript becomes functional; shows real content immediately).
    - M5 close → default stays **Transcript** (Skim becomes functional but Transcript is the better landing surface until LLM summaries land in a future phase).
    The default-tab choice is a single constant `DEFAULT_TAB_ON_SELECTION` exported from `SessionView.tsx`; shifts at M4 are a one-line edit + one test update. Skim's disabled-summary placeholders would otherwise feel broken at first glance.
12. **Tab panel mounting strategy = lazy on first activation, then keep mounted** (`visitedTabs: Set<TabId>` tracked in `SessionView` state). Inactive-but-visited panels carry the `hidden` attribute. Avoids the contradiction of mounting heavy parsed-content tabs (Skim/Transcript) before they're visited (which would prematurely trigger the 5 MB fetch). Resets on `selectedRowKey` change.
13. **`useParsedSession` cache = LRU bounded at 5 entries** keyed by `${storedSessionUid}::${tool}` (`USE_PARSED_SESSION_CACHE_MAX = 5`). Module-scoped epoch counter `cacheEpoch` is bumped on Rescan AND successful Import; in-flight fetches drop their result if the epoch changed mid-flight. Hard cache clear also fires on both Rescan and Import.
14. **Per-tool parser dispatch = registry, not switch** (`PARSERS: Record<Tool, ParserFn>` in `parsers/index.ts`). Typechecks for exhaustiveness; adding a third tool is one record entry.
15. **Display font = Fraunces (variable, self-hosted woff2 ~80 KB subsetted)** with system-serif fallback. Self-hosting a static font asset is NOT a runtime dependency under the spec's dep policy; documented in `docs/dependency-rules.md` at M2. Reversible via single @font-face deletion.
16. **Color space = `oklch()`** as source-of-truth with `@supports not (color: oklch(0% 0 0))` hex fallback layer (the existing 24 hex literals).
17. **`Esc` key vs "← Back to list" button are DISTINCT gestures**: Esc fully clears selection (calls `setSelectedRowKey(null)` + URL `?session=` clear + resets `narrowMode = "list"`); Back to list only sets `narrowMode = "list"` (preserves selection + URL + tab/scroll state, so re-tapping the row brings the user back exactly where they left off). Esc is scoped: ignored when focus is in editable controls (`<input>`, `<textarea>`, `[contenteditable]`, `role="combobox"`).
18. **Metadata + Raw tabs do NOT trigger `useParsedSession` fetch.** Selecting a session and going straight to Metadata or Raw never triggers the 5 MB full-document fetch. Only Skim/Transcript trigger it.
19. **Deep-link arrival fires the deep-link pulse animation**; click-driven selection does not. Distinguishes the two paths visually for a returning user who pasted a URL.
20. **Selection ownership in `App.tsx`** (`useSelectedSession` hook lives there). `SessionsView.tsx` is presentational — receives `selectedRowKey` + `onSelectRow` as props. Matches the existing Phase 4 pattern for `pageIndex` ownership. Closes the M1-planner question.

## Open Considerations

(Selection ownership resolved — see Resolved Decision #20.)
- **Long-corpus measurement methodology**: M4 needs a concrete protocol — synthetic fixture generator? Playwright frame-timing? `performance.now()` markers in the render path? M4 planner picks; document in M4 dispatch brief.
(`focus-trap-react` orphan-install resolved — see Resolved Decision #7. Listed here only as a reminder for a *future-phase* spec author who may want to revisit and uninstall to free escape-hatch slot accounting if the dep budget needs reclaiming.)
- **Fraunces subset preparation**: M2 planner picks the trade-off:
  - Option A (recommended): subset the Fraunces variable woff2 ONCE locally (using e.g. `pyftsubset` or fonttools), commit the resulting ~80 KB woff2 to `apps/frontend/public/fonts/` as a static asset. **No CI build step**, no runtime dep, no per-build subsetting cost. The subset file is regenerated only when Fraunces upstream changes (rare — Phase 5 timeline, almost never).
  - Option B: ship the full ~250 KB variable file as-downloaded. Simpler one-time setup; larger payload.
  Default: Option A. Documented in `docs/dependency-rules.md` at M2 with a one-line "regenerate via `pyftsubset` if upstream Fraunces revs". Subsetting is a one-time author-side step, NOT a build step.
- **Truth-table additions for future tool versions**: M3 planner reviews the truth-table fixture matrix against any new Claude Code or Codex output shapes since Phase 4 spec time. If new shapes exist, expand the matrix at M3 (not Phase 6+); the parsers themselves are point-in-time correct only against the documented matrix.
- **i18n of chapter-break + empty-pane copy**: "SESSION RESUMED" / "CONVERSATION COMPACTED" / empty-pane preface are English-only in Phase 5. Defer to a future i18n phase. Hardcoded strings stay in component source for M5.
- **Light/dark mode toggle UI**: Phase 5 honors `@media (prefers-color-scheme)` automatically but ships no manual toggle. M6 may decide to add one if user feedback during chunk reviews asks; otherwise defer.
