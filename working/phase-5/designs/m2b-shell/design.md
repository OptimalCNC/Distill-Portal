# M2b — Tabs primitive + SessionView shell rewire + SessionMetadata + RawTab + vestigial drawer-trigger collapse

Design artifact for **Phase 5 / Milestone 2 / Chunk b**.
Spec frozen at `working/phase-5.md` @ `05467ad` on `main`.
Implementation predecessors: M1a closed at `a59b3f6`; M1b closed at `e8d80c5`; M2a (token rollout + Fraunces + noise overlay) closed on `main` at `c1602e5` / log entry `e05a1ac`.
Designer: UI/UX subagent dispatched 2026-05-07.

This is a **reference artifact**. The developer subagent re-implements
against the production stack (Bun + Vite + React + TS + per-component
sibling CSS). Nothing in this folder ships to `apps/frontend/`; the
prototype's hex-fallback literals do not contaminate the
`apps/frontend/src/` audit count.

---

## 1. Chunk scope summary

M2b is the **structural rewire** that replaces the Phase 4 modal drawer
with the Phase 5 right-pane tab shell. Six new visible surfaces land
inside the existing M1a `<article class="session-pane">`; one
M1a-vestigial affordance (the "Open detail" trigger) is removed; the
M1a outer SessionView gains a 200 ms page-turn fade; and a new
accessible Tabs primitive lands at `apps/frontend/src/components/`.

The 8 visible surfaces this chunk touches (numbered against the brief):

1. **Tab strip** — `<div class="tabs" role="tablist">` with four
   `<button role="tab">` children plus a single absolutely-positioned
   `<span class="indicator">` that slides between active tabs over
   `--motion-base var(--ease-standard)`. Order: **Transcript / Skim /
   Raw / Metadata** left-to-right. Default active tab AT M2b =
   **Metadata** per Resolved Decision #11.

2. **Session-pane minimal header** — title (Fraunces italic at
   `--text-xl`) + tool badge + status pill + conflict badge.
   `Copy path`, header-side subagent badge, sourcePathIsStale hint,
   "Open raw" anchor all defer to M4. Narrow viewports (< 900 px)
   render an additional "← Back to list" quiet text-button row above.

3. **Tab panels (active + inactive states)** — active panel renders
   inside the M1a tab-shell scaffolding. Each panel's React subtree
   is **STABLE across tab switches** (NOT remounted): the outer
   `<div role="tabpanel" hidden={!isActive}>` toggles the `hidden`
   attribute on activation, and a 120 ms opacity-only cross-fade-IN
   is driven by **CSS `animation-name` re-trigger** (set
   `animation: tab-fade-in 120ms var(--ease-out) both` when
   `isActive=true`; set `animation: none` when `isActive=false`).
   Inactive-but-visited panels carry the `hidden` HTML attribute
   (display:none + accessibility-tree exclusion). Inactive-and-
   unvisited panels are not rendered at all (lazy-on-first-activation
   per Resolved Decision #12). On `selectedRowKey` change the
   `visitedTabs` set resets to `new Set([defaultTab])` and the
   unvisited panels drop their content entirely.

   **Do NOT use a React `key={activeTab}` on the panel content
   wrapper.** Remounting the panel content on every tab change would
   abort RawTab's in-flight `consumeRawPreview` consumer and refire
   the fetch, AND in M3+ would re-trigger `useParsedSession` for
   Skim/Transcript — this directly violates Resolved Decision #12's
   keep-mounted contract (spec lines 650–658). The cross-fade is
   driven by CSS animation re-trigger (above), NOT by React key
   remount. The page-turn fade at the OUTER `<SessionView
   key={selectedRowKey}>` layer DOES still remount (because a
   selection change SHOULD reset parser state); only the inner
   tab-panel cross-fade is non-remounting.

4. **Page-turn fade** — outer `<SessionView key={selectedRowKey}>`
   fades opacity 0→1 + translates `4px → 0` over 200 ms `--ease-out`
   on every selection change. Implemented as a CSS `@keyframes
   session-page-turn` on the `.session-pane` element; the React key
   remount fires the animation. This is signature detail #2 from
   §Design Language; M2b is the chunk that lands it.

5. **Metadata tab body** — `SessionMetadata.tsx` extracted from
   `SessionDetail.tsx` lines 160–256 verbatim. Same 18 fields, same
   labels, same `mono` class, same `<dt>` / `<dd>` layout. Plus the
   subagent sidecar badge (NEW for M2b per Resolved Decision #8 —
   header version defers to M4; Metadata version ships now), plus
   the sourcePathIsStale label swap, plus the statusConflict-derived
   "(disagreed during load)" muted note, plus the Copy path button,
   plus the "Open raw" anchor (rendered only when
   `row.storedSessionUid !== null`).

6. **Raw tab body** — `RawTab.tsx` extracted from `SessionDetail.tsx`'s
   `RawPreviewBlock`. Byte-equivalent to Phase 4. Same caption
   strings, same 256 KB / 20-line caps, same Retry semantics, same
   AbortController-on-unmount. Plus the "Not yet imported" branch
   when `row.storedSessionUid === null` per Resolved Decision #18.

7. **Skim tab placeholder** — `<SkimView>` not yet implemented; the
   tab renders an editorial "Coming in Milestone 5" muted line
   (small-font, italic Fraunces label + chrome-font subline). Subtle.
   NOT a chunky empty-state illustration.

8. **Transcript tab placeholder** — same treatment as #7 with
   "Coming in Milestone 4".

Out of M2b scope: full session header (Copy path, sourcePathIsStale
hint, header-side subagent badge, "Open raw" header anchor — all M4);
truncation banner / parser warnings banner (M4); SkimView block kinds
(M5); Transcript per-kind rendering (M4).

## 2. Design intent

### 2.1 How M2b serves the Archive-room aesthetic

M2a landed the **language** (Fraunces, oklch ramp, motion tokens, noise
overlay). M2b is the chunk where the **right pane becomes a reading
surface**. Three calibrations:

- **The minimal header is editorial, not navigational.** No surface
  chrome, no border-strong, no shadow. The session title sits in
  italic Fraunces at `--text-xl` over the warm-paper surface; the
  tool badge and status pill sit alongside as quiet annotations. The
  tab strip's hairline `border-bottom` provides the visual anchor
  below it; the header carries no border of its own. This is the
  "hairline over shadow" principle (spec line 25) at the level of an
  individual section header.

- **The tab strip is text, not chrome.** Four labels, 12 px gaps, no
  background fills, no rounded pills, no box shadow — just a
  hairline divider beneath and a 1 px ink-stroke `--color-accent`
  indicator that slides under the active label. The strip reads as
  "the table of contents of this folio", not as "browser tabs". This
  is signature detail #5 from §Design Language; M2b is the chunk that
  lands it.

- **Two layers of motion, neither heavy.** When the user selects a
  different session, the entire right pane fades in over 200 ms with
  a 4 px `translateX` — the page-turn fade. When the user switches
  tabs within a single session, only the panel content cross-fades
  over 120 ms (no transform). The two animations are distinct in
  feel: the page-turn says "I'm opening a different folio"; the
  cross-fade says "I'm consulting a different chapter of the same
  folio". A returning user reads the difference without naming it.

### 2.2 What M2b does NOT do

- It does not redesign the M1a split-pane shell or the M1b sticky
  footer. M2b mounts INSIDE M1a's `<article class="session-pane">`;
  the outer Grid + the list panel + the filter strip + the sticky
  pagination footer are unchanged.
- It does not introduce the M4 / M5 surfaces — the parser, the
  TranscriptView, the SkimView block kinds, the truncation banner,
  the parser-warnings banner, the chapter-break hairline. Those
  surfaces ship in their own chunks; M2b's job is to land the
  scaffolding that those chunks plug into.
- It does not introduce new tokens. The full M2a token set (83
  tokens post-M2a; this prototype touches none of them) is reused
  verbatim. If a developer finds themselves reaching for a new
  token at implementation time, they should pause and reuse before
  inventing — see §7 for the discussion.

## 3. Component anatomy

### 3.1 Tabs primitive (`apps/frontend/src/components/Tabs.tsx`)

```text
<div class="tabs" role="tablist" aria-label="…" data-active-tab="metadata">
  <button id="tab-transcript" role="tab" aria-controls="panel-transcript"
          aria-selected="false" tabindex="-1">Transcript</button>
  <button id="tab-skim"       role="tab" aria-controls="panel-skim"
          aria-selected="false" tabindex="-1">Skim</button>
  <button id="tab-raw"        role="tab" aria-controls="panel-raw"
          aria-selected="false" tabindex="-1">Raw</button>
  <button id="tab-metadata"   role="tab" aria-controls="panel-metadata"
          aria-selected="true"  tabindex="0">Metadata</button>
  <span class="indicator" aria-hidden="true"></span>
</div>
```

- **`data-active-tab`** mirrors `aria-selected` for CSS hooks. The
  indicator's transform is computed from the active tab's bounding
  box (the simplest implementation); a future refactor can drive it
  via a CSS `:has()` selector keyed off `data-active-tab` if we want
  to remove the JavaScript measurement.
- **`tabindex` discipline**: exactly one tab carries `tabindex="0"`
  at any time (the active one); the other three carry `tabindex="-1"`.
  This is the WAI-ARIA APG roving tabindex pattern. Tab from the
  list pane lands on the active tab; ArrowLeft/ArrowRight cycle
  through tabs; Tab from a focused tab moves to the active panel
  content (NOT to the next tab).
- **Indicator element**: a single `<span class="indicator">` inside
  the tablist, position:absolute, bottom:-1px, **width:1px**,
  height:1px, background `var(--color-accent)`. The indicator's CSS
  base size is **1×1 px**; the JS sets `transform: translateX(${x}px)
  scaleX(${width}px)` to grow the 1 px base extent to the active tab's
  measured width. Both transforms are written into a single
  `transform` declaration (one property, one transition); the
  transition only animates `transform` (compositor-cheap; no layout
  reflow). **Do not omit `width: 1px`** — an empty absolutely-
  positioned span resolves to `width: auto` (= 0); `scaleX(N) × 0 = 0`
  would render an invisible indicator.
- **Disabled state pinned for future**: `aria-disabled="true"` on a
  tab makes it `opacity: 0.4; cursor: not-allowed; pointer-events:
  none;`. M2b ships no disabled tabs but the recipe is on file.

### 3.2 SessionView shell (`apps/frontend/src/features/sessions/SessionView.tsx`)

```text
<article class="session-pane" key={selectedRowKey} aria-label="Session view">
  {/* Narrow-mode "Back to list" quiet text-button row — only renders below 900 px. */}
  <div class="back-to-list">…</div>

  <header class="session-header">
    <h2 class="session-title">{row.title || "(untitled)"}</h2>
    <span class="tool-badge">{row.tool}</span>
    <span class="badge {variant}">{row.status}</span>
    {row.statusConflict && <span class="badge conflict">Conflict</span>}
  </header>

  <Tabs activeTab={activeTab} onActivate={setActiveTab}
        defaultTab={DEFAULT_TAB_ON_SELECTION}
        labels={[…Transcript / Skim / Raw / Metadata]} />

  <div class="tabpanels">
    <TabPanel id="panel-transcript" labelledBy="tab-transcript"
              isActive={activeTab === "transcript"}
              isVisited={visitedTabs.has("transcript")}>
      {/* placeholder — STABLE React subtree, not remounted */}
    </TabPanel>
    {/* …Skim, Raw, Metadata identical structure */}
  </div>
</article>
```

- **`key={selectedRowKey}`** on the outer `<article>` — every
  selection change remounts the whole subtree, which fires the
  page-turn fade @keyframes.
- **`activeTab` state lives on `SessionView`** (component-local,
  NOT URL-synced — Resolved Decision #2). Reset to
  `DEFAULT_TAB_ON_SELECTION` on `selectedRowKey` change via the same
  remount.
- **`visitedTabs: Set<TabId>`** state lives on `SessionView`,
  initialized to `new Set([DEFAULT_TAB_ON_SELECTION])` on every
  remount (= every selection change). Setting `setActiveTab(id)`
  also adds `id` to `visitedTabs`.
- **TabPanel** is a thin wrapper: renders the outer `<div
  role="tabpanel" hidden={!isActive}>` only when `isVisited`; renders
  `null` when `!isVisited`. The cross-fade-IN is driven by a CSS
  `animation-name` toggle on the SAME `<div role="tabpanel">`
  element: when `isActive=true`, an inline `style={{ animation:
  "tab-fade-in 120ms var(--ease-out) both" }}` is applied; when
  `isActive=false`, `style={{ animation: "none" }}` is applied. The
  browser restarts the animation each time the `animation` property
  string changes from `"none"` to `"tab-fade-in …"`. The panel's
  React tree is **NOT remounted** on tab change — keep-mounted state
  (RawTab's in-flight consumer, M3+ Skim/Transcript parser results)
  survives intact. **Do NOT add `key={activeTab}` to the panel
  content** — that would defeat Resolved Decision #12.

- **M1a → M2b minimal header delta** (verified by reading
  `apps/frontend/src/features/sessions/SessionView.tsx` post-M1a +
  `SessionView.test.tsx`). M1a's `ready-placeholder` state ships
  ONLY a single line of muted prose ("Session view coming in
  Milestone 2.") plus the M1b vestigial "Open detail" button. M1a
  ships **no title row, no tool badge, no status pill, no conflict
  badge, no Tabs primitive**. The minimal header described in this
  section is therefore **entirely new at M2b**. M2b deletes the M1a
  `ready-placeholder` copy + the M1b "Open detail" button, removes
  the `ready-placeholder` state value entirely from the SessionView
  state-union (replacing it with `ready` per §4.8), and ships the
  full minimal header (title + tool badge + status pill + optional
  conflict badge) plus the Tabs primitive plus the four tabpanels
  (Metadata + Raw real, Skim + Transcript placeholders).

### 3.3 SessionMetadata (`apps/frontend/src/features/sessions/SessionMetadata.tsx`)

The 18-field `<dl>` extracted verbatim from `SessionDetail.tsx`:

```text
<div class="metadata-tab">
  <dl class="metadata-meta">
    <dt>session_key</dt>          <dd class="mono">{row.sourceSessionKey ?? "—"}</dd>
    <dt>session_uid</dt>          <dd class="mono">{row.storedSessionUid ?? "—"}</dd>
    <dt>row_key</dt>              <dd class="mono">{row.rowKey}</dd>
    <dt>tool</dt>                 <dd class="mono">{row.tool}</dd>
    <dt>source_session_id</dt>    <dd class="mono">{row.sourceSessionId}</dd>
    <dt>presence</dt>             <dd class="mono">{row.presence}</dd>
    <dt>status</dt>               <dd>{statusPill + conflict-note}</dd>
    <dt>status_conflict</dt>      <dd class="mono">{bool}</dd>
    <dt>title</dt>                <dd>{title || muted-untitled}</dd>
    <dt>project_path</dt>         <dd class="mono">{row.projectPath ?? "—"}</dd>
    <dt>{stale ? "last seen source path" : "source path"}</dt>
    <dd>{path span} {Copy path button} {copy-hint}</dd>
    <dt>source_path_is_stale</dt> <dd class="mono">{bool}</dd>
    <dt>source_fingerprint</dt>   <dd class="mono">{fp}</dd>
    <dt>has_subagent_sidecars</dt><dd>{bool} {subagent-badge?}</dd>
    <dt>stored_raw_ref</dt>       <dd class="mono">{ref ?? "—"}</dd>
    <dt>created_at (source clock)</dt>          <dd>{ts}</dd>
    <dt>source_updated_at (source clock)</dt>   <dd>{ts}</dd>
    <dt>ingested_at (backend clock)</dt>        <dd>{ts}</dd>
  </dl>
  {row.storedSessionUid && <p class="open-raw"><a>Open raw ↗</a></p>}
</div>
```

- The `<dt>` text matches the source `SessionRow` field names in
  **raw snake_case** (e.g. `session_key`, `session_uid`, `row_key`,
  `tool`, `source_session_id`, `presence`, `status`,
  `status_conflict`, `title`, `project_path`, `source_path_is_stale`,
  `source_fingerprint`, `has_subagent_sidecars`, `stored_raw_ref`,
  `created_at (source clock)`, `source_updated_at (source clock)`,
  `ingested_at (backend clock)`). This was **verified against
  `apps/frontend/src/features/sessions/SessionDetail.tsx` lines
  160–256** — Phase 4 ships snake_case `<dt>` text, NOT human-readable
  labels like "Session key". The single exception is the source-path
  `<dt>`, which swaps based on `row.sourcePathIsStale`: "source path"
  (when fresh) → "last seen source path" (when stale) — these two
  labels are space-separated lowercase, NOT snake_case (matching
  Phase 4 verbatim, which derives them from the `sourcePathLabel`
  string `"Source path:"` / `"Last seen source path:"` with the
  trailing colon stripped). M2b extraction is byte-equivalent to
  Phase 4: the same snake_case keys, the same swap, the same
  `mono` class on the `<dd>`s.
- The Copy path button preserves the Phase 4 fallback chain: Clipboard
  API → manual selection → "Selected — press Ctrl/Cmd + C to copy" hint.
- Subagent sidecar badge: dashed-hairline informational chip, sits on
  the same row as `has_subagent_sidecars: true` rather than as a banner —
  it reads as a footnote on the field, not a top-of-pane warning.

### 3.4 RawTab (`apps/frontend/src/features/sessions/RawTab.tsx`)

Byte-equivalent to Phase 4 `RawPreviewBlock`:

- One `useEffect` per `sessionUid` change: creates an `AbortController`,
  calls `streamSessionRaw` + `consumeRawPreview`, sets state, returns a
  cleanup that aborts the controller.
- State machine: `loading` (initial) → `success` | `error` |
  `non_2xx` | `idle` (idle never reached in current code path).
- Plus the **"Not yet imported"** branch when
  `row.storedSessionUid === null`. RawTab never fires the fetch when
  the row is source-only; it short-circuits to the muted prose.
- Caption strings preserved EXACTLY from Phase 4
  (`describeCaption(lineCount, reachedLineCap, reachedByteCap)`):
  - byte cap fired → `"Stopped at byte cap — full payload not downloaded."`
  - line cap fired → ``Showing first ${N} lines of the raw payload.``
  - neither cap → ``Showing first ${N} lines (full payload below the caps).``
  - both caps → byte-cap caption wins.
- Retry button bumps a local `attempt` counter, re-runs the effect
  (refires the fetch).
- Non-JSON fallback lines render with the `(non-JSON line)` marker
  preserved verbatim from Phase 4 `RawPreviewLineRow`. The marker is
  styled **muted-italic** (`color: var(--color-ink-muted)`,
  `font-style: italic`) — byte-equivalent to Phase 4 (the Phase 4
  source `apps/frontend/src/features/sessions/SessionDetail.css:143-156`
  uses `--color-text-muted`, now aliased to `--color-ink-muted` per
  M2a Option B). The marker is NOT a warn-color text — codex
  measured warn-on-surface-raised at 3.97:1 light, which fails AA
  for normal text. Muted-on-surface-raised passes (light 6.64:1 /
  dark 7.03:1 — see colors.md row R03).

### 3.5 Skim + Transcript placeholder anatomy

Each placeholder is one component:

```html
<div class="placeholder">
  <strong>Transcript</strong>
  <span>Coming in Milestone 4</span>
</div>
```

- The `<strong>` is rendered in italic Fraunces at `--text-lg`,
  `--color-ink-muted`. The `<span>` below is `--font-chrome
  --text-sm --color-ink-muted`. Centered vertically + horizontally
  inside the panel, with a 1 px dashed `--color-border` border so
  the "this is a placeholder" cue is visible without an icon. The
  panel padding leaves room for the dashed border to breathe.
- M4 / M5 swap the placeholder component for the real
  TranscriptView / SkimView; nothing else in SessionView changes.

## 4. States & variants — full enumeration

### 4.1 Tab strip layout variants
- **Wide (≥ 900 px)**: 4-tab horizontal row at top of `.session-pane`
  immediately below `.session-header`. 2.5 rem strip height; 12 px
  gaps; 1 px hairline border-bottom.
- **Narrow (< 900 px)**: same horizontal row, but a "← Back to list"
  quiet text-button row sits above the `.session-header`. The tab
  strip itself does NOT collapse to a `<select>` or stack vertically;
  4 short labels fit comfortably within ~340 px viewports.

### 4.2 Tab states
- **Active**: `aria-selected="true"`, `tabindex="0"`,
  `--color-ink`, `font-weight: 600`, indicator visible underneath.
- **Inactive**: `aria-selected="false"`, `tabindex="-1"`,
  `--color-ink-muted`, regular weight.
- **Hover** (inactive only): text shifts to `color-mix(in srgb,
  var(--color-ink) 80%, var(--color-ink-muted))`. NO background tint.
  The active tab does not visibly change on hover (it's already at
  full ink).
- **Focus-visible**: 2 px outline of `--color-accent`, outline-offset
  2 px, border-radius 2 px (matches M1a focus-visible recipe).
- **Pressed (mouse-down)**: snaps to `--color-ink` without
  transitioning the color (the tab is about to become active anyway).
- **Disabled (pinned for future use)**: `aria-disabled="true"` →
  `opacity: 0.4`, `cursor: not-allowed`, `pointer-events: none`.

### 4.3 Active indicator slide direction
- **Left → right** (tab N → N+M, M > 0): indicator slides positively
  along `translateX`, indicator width animates to the new tab's text
  width via `scaleX`.
- **Right → left** (tab N → N–M): same mechanism; transform is purely
  compositor work so direction doesn't matter for performance.
- Initial mount: indicator settles on the default tab via a
  `requestAnimationFrame` callback (Fraunces swap can shift metrics
  by ~1 px per M2a §4 fallback math; the rAF defers measurement by
  one frame so the indicator anchors correctly).

### 4.4 Tab panel mounting matrix

| State                    | DOM         | `hidden` | a11y tree | content rendered |
|--------------------------|-------------|----------|-----------|------------------|
| not-yet-visited          | not present | n/a      | n/a       | no               |
| visited-but-inactive     | present     | true     | excluded  | yes (cached)     |
| active                   | present     | false    | included  | yes              |

On `selectedRowKey` change: `visitedTabs` resets, all four panels
unmount cleanly. Cache (in `useParsedSession`, M3) persists across
selection changes so re-selecting the same session re-mounts a panel
that finds a cache hit — but the M2b panels (Metadata, Raw) don't
use that cache anyway (Metadata reads SessionRow only; Raw uses its
own `consumeRawPreview` consumer).

### 4.5 Tab panel cross-fade direction

Cross-fade is **fade-IN-only** (per spec line 87 + planner refinement):

- Outgoing panel: hidden via `hidden` HTML attribute → `display: none`
  immediately. NO fade-out animation.
- Incoming panel: CSS `animation-name` toggles from `none` →
  `tab-fade-in` on the panel's `<div role="tabpanel">` element. The
  browser starts the keyframes (opacity 0 → 1 over 120 ms
  `--ease-out`) on the property change. The panel's React subtree is
  STABLE — NOT remounted.

The asymmetry is intentional: a true cross-fade (out + in
overlapping) would require two panels rendered simultaneously, which
fights both the `hidden` attribute (display:none can't transition)
AND the lazy-mount discipline. Fade-in-only matches spec intent and
keeps the panel mounting story simple.

**Why animation-name re-trigger and NOT a `key={activeTab}` remount:**
the spec mandates that visited panels stay React-mounted (Resolved
Decision #12 / spec lines 650–658) so RawTab's `consumeRawPreview`
consumer keeps its in-flight stream alive across tab switches and so
M3+ `useParsedSession` results aren't recomputed. A `key={activeTab}`
on the panel content would unmount and remount the subtree on every
tab change, aborting in-flight work and breaking the keep-mounted
contract. The CSS animation-name toggle achieves the same fade-IN
visual without touching the React tree.

### 4.6 Page-turn fade direction

Page-turn fade is **entrance only**:

- Previous selection: removed entirely via React key change (the
  previous `<SessionView>` unmounts).
- Incoming SessionView: opacity 0 → 1 + translateX(4px → 0) over
  200 ms `--ease-out`. The transform direction is consistent (always
  in from the right by 4 px) — this is signature detail #2's
  "opening a folder" gesture, not a directional history scrub.
- **Clicking the already-selected row is a React no-op**:
  `key={selectedRowKey}` is unchanged → no remount → no animation.
  React's `setState` with an identical value short-circuits the
  re-render at the parent that owns selection (`App.tsx` per
  Resolved Decision #20), so the SessionView doesn't even receive
  a new prop. The page-turn fade fires only when `selectedRowKey`
  actually changes value (including null → key, key → different key,
  key → null transitions).

### 4.7 Reduced-motion fallbacks

Single global rule in `apps/frontend/src/styles/global.css` (already
landed in M1a; unchanged in M2b):

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

Effect on M2b's animations:
- **Tab indicator slide**: zeroed; indicator teleports to the active
  tab's coordinates without sliding.
- **Tab cross-fade**: zeroed; panel snaps to opacity 1 immediately.
- **Page-turn fade**: zeroed; new SessionView appears at full opacity
  with no translateX entrance.

The reading-wash noise overlay is also suppressed under reduced-motion
(M2a established this; the rule lives in `SessionView.css` and is a
SEPARATE rule from the global zero-out per M2a §6).

### 4.8 Right-pane state machine

The M1a state machine is preserved verbatim, with one substitution:
the `ready-placeholder` value (M1a) is REPLACED by `ready` (M2b),
where `ready` mounts the full tab shell:

| State                | Right pane content                                        |
|----------------------|-----------------------------------------------------------|
| empty (no selection) | "Select a session to view its content." (M1a copy unchanged) |
| loading              | "Loading session…" muted prose (M1a copy unchanged)       |
| session_not_found    | "Session not found in current view" + Clear selection + Try Rescan (M1a copy unchanged) |
| **ready**            | full tab shell (header + Tabs + tabpanels). Default tab = Metadata. |

### 4.9 Metadata panel state matrix

Inherited from existing `SessionDetail.test.tsx`:

- `statusConflict` true / false — header conflict badge + "(disagreed
  during load)" muted note in the status `<dd>`.
- `sourcePathIsStale` true / false — `<dt>` label swaps "source path"
  / "last seen source path".
- `hasSubagentSidecars` true / false — subagent badge appears next to
  the `has_subagent_sidecars` field's `true` value.
- `storedSessionUid` null / non-null — "Open raw" anchor renders only
  when non-null (preserves Phase 4 invariant). When null, the anchor
  is absent.
- Copy path button: success (clipboard write) / fallback (clipboard
  undefined → manual selection) / pending (no click yet). Hint copy
  per Phase 4: "Copied" or "Selected — press Ctrl/Cmd + C to copy".

### 4.10 Raw panel state matrix

| State          | Panel content                                                 |
|----------------|---------------------------------------------------------------|
| `idle`         | `<p class="raw-loading">Loading raw preview…</p>` (briefly held; the existing `useEffect` immediately transitions to `loading`) |
| `loading`      | same loading prose                                            |
| `success`      | `<pre>` of lines + caption                                    |
| `error`        | `<p class="raw-error">Failed to load raw preview: {message}</p>` + Retry button |
| `non_2xx`      | `<p class="raw-error">HTTP {status}: {bodySnippet}</p>` + Retry button |
| `not_imported` | quiet muted prose: "This session has not been imported yet — only the source-side metadata is available. Click Import in the action bar to fetch the raw payload." NEW for M2b per Resolved Decision #18. |

### 4.11 Skim + Transcript placeholder copy

Both render a centered editorial placeholder:

```html
<div class="placeholder">
  <strong>Transcript</strong>
  <span>Coming in Milestone 4</span>
</div>
```

The `<strong>` is the panel's name in Fraunces italic at `--text-lg`
(matches M2a's empty-pane preface); the `<span>` is the milestone
copy in `--font-chrome --text-sm`. Both `--color-ink-muted`. A 1 px
dashed `--color-border` border surrounds the centered text — the
single visual cue that distinguishes "placeholder" from "real
content".

### 4.12 Focus model

Tab order through the full inspection page:
1. List pane: filter strip → list rows (one selected via
   `aria-current="true"`; arrow keys + Enter from the list to
   select). The row renders the active "row-action" button at the
   end.
2. Sticky list footer: action bar → pagination strip.
3. Right pane (when selection is active):
   1. (Narrow only) "← Back to list" button.
   2. Session header — the title is in an `<h2>`, not focusable.
      The status pill, conflict badge, and tool badge are inert
      `<span>`s, also not focusable.
   3. Tab strip: only the currently active tab is in tab order
      (`tabindex="0"`). Arrow keys cycle through tabs; Tab moves
      to the active panel.
   4. Active panel content: focusable elements within (Copy path
      button, Open raw anchor, Retry button, prototype's state
      radios).
4. (No further focus targets unless the panel has its own — Skim
   placeholder + Transcript placeholder have no focusable
   children.)

## 5. Motion & interaction

### 5.1 Animatable surfaces in M2b

The frozen motion budget at `working/phase-5.md:84-95` permits
animation ONLY on `transform`, `opacity`, and `background-color`,
and ONLY on the surfaces explicitly listed in that table. M2b
activates exactly the three rows the spec authorizes for this chunk
(rows 1, 2, and 7 of the spec table):

| Surface                  | Property                                              | Duration                       | Easing                       | Trigger                                                                                                                |
|--------------------------|-------------------------------------------------------|--------------------------------|------------------------------|------------------------------------------------------------------------------------------------------------------------|
| Tab indicator slide      | `transform: translateX` + `scaleX`                    | `--motion-base` (120 ms)       | `--ease-standard`            | active-tab change                                                                                                      |
| Tab panel cross-fade-IN  | `opacity` (0 → 1)                                     | `--motion-base` (120 ms)       | `--ease-out`                 | active-tab change (CSS `animation-name` toggle on `<div role="tabpanel">` from `none` → `tab-fade-in`) |
| Page-turn fade           | `opacity` (0 → 1) + `transform: translateX` (4px → 0) | `--motion-disclosure` (200 ms) | `--ease-out`                 | `selectedRowKey` change (re-mount of `<SessionView key={…}>`)                                                          |

All values come from existing M2a tokens; no new motion tokens added.

**No other M2b surface animates.** The active ↔ inactive tab text
color change, the inactive-tab hover color shift, the Copy path
button hover, the Retry button hover, and the "Open raw" anchor
hover underline are all **INSTANT** — no `transition` declaration,
no `animation`. Hover/active state changes apply on the next paint
without interpolation. This is the spec's frozen motion budget
(line 1100: "WCAG AA" + load-bearing motion table); adding
animations not on the table requires a coordinator waiver. None of
M2b's hover/active surfaces appears in the spec's table → all
remain instant.

Reduced-motion is therefore a no-op for these surfaces (there's
nothing to zero out); the global `prefers-reduced-motion: reduce`
rule from M1a still zeroes the three listed animations above.

### 5.2 The two-layer animation pattern (load-bearing for the chunk)

The spec creates a tension between two requirements:
- Spec line 654 mandates `hidden` for inactive-but-visited panels
  (display: none + accessibility-tree exclusion).
- Spec line 87 mandates a 120 ms opacity cross-fade on tab change.
- Spec lines 650–658 + Resolved Decision #12 mandate that visited
  panels stay React-mounted across tab switches (so RawTab's
  in-flight `consumeRawPreview` consumer keeps streaming, and so
  M3+ `useParsedSession` results are not recomputed on every tab
  flip).

`display: none` cannot transition to `display: block` smoothly. The
resolution: the cross-fade is **fade-IN-only**, driven by a CSS
`animation-name` toggle on the SAME `<div role="tabpanel">` element
that carries the `hidden` attribute. The panel's React subtree is
**stable** — never remounted on tab change.

**Inner cross-fade — non-remount, CSS animation-name re-trigger:**

```jsx
<div role="tabpanel"
     hidden={!isActive}
     id={`panel-${tabId}`}
     aria-labelledby={`tab-${tabId}`}
     style={{ animation: isActive
                          ? "tab-fade-in 120ms var(--ease-out) both"
                          : "none" }}>
  {/* STABLE React subtree — NOT keyed on activeTab.
      RawTab's in-flight stream survives tab flips. */}
  {content}
</div>
```

The browser starts the keyframes whenever the `animation` property
string changes from `"none"` to `"tab-fade-in 120ms …"`. Active →
active re-renders don't re-fire (the property string is unchanged);
inactive → active does (the string transitions from `"none"`). The
keyframe is defined once:

```css
@keyframes tab-fade-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}
```

**Outer page-turn fade — React `key` remount IS correct here:**

```jsx
<article class="session-pane" key={selectedRowKey}>
  {/* React remounts this on every selectedRowKey change.
      Selection change SHOULD reset parser state + visitedTabs +
      activeTab — that's the intent of the page-turn gesture. */}
</article>
```

The `.session-pane` element's CSS animation runs once per mount via
`animation: session-page-turn var(--motion-disclosure) var(--ease-out) both`.
React's `key={selectedRowKey}` change fires a fresh mount → the
keyframe runs.

**Do NOT conflate the two layers.** The outer remount on
`selectedRowKey` change is correct (a different selection IS a
different document). The inner `key={activeTab}` remount on tab
change is forbidden (a different tab WITHIN the same selection must
preserve panel state). Cross-fade uses CSS animation-name re-trigger;
page-turn uses React key remount. The two animations fire on
different DOM nodes and never collide.

### 5.3 Reduced-motion behavior

Under `prefers-reduced-motion: reduce` (or the prototype's
`data-motion="reduce"` toggle):

- `--motion-base` and `--motion-disclosure` durations are zeroed by
  the global reduced-motion rule. The keyframes still run for one
  paint frame (0.01 ms), so the visual outcome is "snap to opacity
  1 + translateX(0)" without any visible animation.
- The indicator's `transition: transform` is also zeroed. On
  active-tab change the indicator teleports.
- The reading-wash noise overlay is suppressed (M2a established).

## 6. Accessibility

### 6.1 ARIA roles and properties

Per WAI-ARIA APG tabs pattern (`https://www.w3.org/WAI/ARIA/apg/patterns/tabs/`):

- `<div role="tablist" aria-label="Session content tabs">` — the tab
  strip container.
- `<button role="tab" aria-selected={true|false} aria-controls={panelId}
  tabindex={0|-1}>` — each tab. The `<button>` element handles the
  Enter/Space activation natively; the explicit `aria-selected`
  attribute carries the active state.
- `<div role="tabpanel" aria-labelledby={tabId} hidden={!isActive}>`
  — each panel. The `hidden` attribute hides the panel from the
  accessibility tree AND from the layout (display: none). When
  `isActive`, the panel is rendered visible.
- `aria-controls` ↔ `aria-labelledby` linkage forms the tab ↔ panel
  relationship.
- **`tabindex={0}` on active tabpanels** (WAI-ARIA APG Tabs pattern).
  The Tab key from the active tab moves focus into the panel; if the
  panel has no focusable children — OR if its current state branch
  has no focusable children — focus needs the panel itself to be
  focusable, otherwise Tab skips past the panel entirely. At M2b:
  - **Skim panel** (placeholder) → `tabindex="0"` while active. No
    focusable child in the placeholder.
  - **Transcript panel** (placeholder) → `tabindex="0"` while active.
    No focusable child in the placeholder.
  - **Raw panel** → `tabindex="0"` while active. Picked **Option A
    (unconditional)**: the success state renders a non-focusable
    `<pre class="raw-pre">` followed by a non-focusable `<p
    class="raw-caption">`, and Retry renders ONLY in `error` /
    `non_2xx`. Without `tabindex="0"` on the panel, Tab from the
    active Raw tab in `success` / `idle` / `loading` / `not_imported`
    would skip past the panel entirely (same WAI-ARIA APG violation
    that motivates the rule for Skim / Transcript). Adding it
    unconditionally on the active Raw panel covers every state
    branch without conditional state-machine wiring; in `error` /
    `non_2xx` the panel becomes the first Tab stop and Retry is
    reached on the next Tab press — no regression vs. the previous
    rule (same total Tab presses to reach Retry from the tablist).
  - **Metadata panel** → no `tabindex` needed. The Copy path button
    is always rendered and always focusable (and the "Open raw"
    anchor renders for stored sessions). Metadata is the lone
    exception to the unified rule because its first focusable child
    is unconditional.
  WAI-ARIA APG explicitly permits `tabindex="0"` on a tabpanel even
  when it has focusable children; the panel just becomes the first
  stop in the Tab order, then focus moves into its children. We
  could unify Metadata into the same rule for symmetry, but keeping
  it without `tabindex` saves one extra Tab press per Metadata visit
  for the most-used tab. Inactive panels (`hidden=true`) MUST NOT
  carry `tabindex="0"` (they're outside the layout + a11y tree).
  The tabindex attribute is added/removed in lockstep with `hidden`
  toggling.

### 6.2 Keyboard interaction matrix

| Key                | When focus is on…                      | Effect                          |
|--------------------|----------------------------------------|---------------------------------|
| Tab (forward)      | list pane content                      | focus moves to the tablist (lands on the active tab) |
| Tab (forward)      | a tab in the tablist                   | focus moves OUT of the tablist into the active panel content (NOT to the next tab) |
| Tab (backward)     | a tab in the tablist                   | focus moves backward to the list pane |
| Tab (backward)     | active panel content                   | focus moves to the active tab in the tablist |
| ArrowLeft          | a tab in the tablist                   | active tab decrements (wraps to last on first) |
| ArrowRight         | a tab in the tablist                   | active tab increments (wraps to first on last) |
| Home               | a tab in the tablist                   | active tab = first (Transcript) |
| End                | a tab in the tablist                   | active tab = last (Metadata) |
| Enter / Space      | a tab in the tablist                   | no-op — selection already followed focus per the automatic-activation pattern |
| Esc                | (any focus)                            | M1a behavior — clears selection (`setSelectedRowKey(null)` + URL `?session=` clear). Esc is scoped per Resolved Decision #17 (ignored when focus is in editable controls). M2b does NOT change Esc semantics. |

**Selection follows focus** (automatic activation). Per WAI-ARIA APG:
"if it is easy to determine which tab will receive focus based on
the keyboard event, automatic activation is appropriate." Our four
tabs are all instantly cheap (Metadata / Raw never trigger the 5 MB
fetch per Resolved Decision #18; Skim / Transcript at M2b are
placeholders). Automatic activation is the better default.

### 6.3 Focus management

- On `selectedRowKey` change: the `<SessionView>` remounts; focus is
  NOT automatically moved to the new pane (the user clicked a row;
  focus stayed on the row). The new SessionView mounts with the
  default tab pre-selected, but the tablist is not stolen-focused.
- On Esc / "Back to list" / direct URL clear: focus returns to the
  list pane (Phase 4 / M1a behavior; M2b does not change this).
- On programmatic `activate(id)` from keyboard nav: focus is moved
  to the newly-active tab via `tab.focus()`. From click: focus moves
  to the clicked tab (the browser's default `<button>` behavior).

### 6.4 Focus-visible outlines

Reuse the M1a / M2a recipe: 2 px outline of `--color-accent`,
`outline-offset: 2px`, optional `border-radius: 2px`. Surfaces:

- Tab buttons.
- Copy path button.
- Open raw anchor.
- Retry button.
- (Prototype-only) Raw-state radio buttons.
- (Prototype-only) Theme + reduced-motion toggles.

### 6.5 Contrast targets (numerical; full table in `colors.md`)

The M2b-relevant pairs against `--color-surface`:

| Pair                                             | Light  | Dark   | Verdict       |
|--------------------------------------------------|--------|--------|---------------|
| **Active tab label** (`--color-ink`)             | 17.10:1| 15.52:1| AAA · normal text |
| **Inactive tab label** (`--color-ink-muted`)     | 7.04:1 | 7.36:1 | AAA · normal text |
| **Tab indicator stroke** (`--color-accent`) — *load-bearing for SC 1.4.11* | 4.84:1 | 5.78:1 | passes 3:1 with comfortable margin |
| **Minimal-header title** (`--color-ink`)         | 17.10:1| 15.52:1| AAA · normal text |
| **Tool-badge text** (`--color-ink-muted`)        | 7.04:1 | 7.36:1 | AAA · normal text |
| **Conflict badge text** (warn 70% mix on ink)    | 5.43:1 | 7.74:1 | AAA · normal text (inherited from Phase 4 outdated pill) |
| **"Open raw" anchor** (`--color-accent`)         | 4.84:1 | 5.78:1 | AA · normal text |
| **Subagent badge text** (`--color-ink-muted`)    | 7.04:1 | 7.36:1 | AAA · normal text |
| Subagent badge dashed border (`--color-border-strong`) | 3.06:1 | 3.00:1 (cusp) | passes 3:1 SC 1.4.11 |

All values inherit from M2a's codex-measured ratios — M2b adds NO
new color pairs, so the M2a numbers carry through.

### 6.6 Touch-target size note (WCAG 2.5.5 AAA)

The spec mandates `2.5rem` (40 px) tab-strip height. WCAG 2.5.5 AAA
asks for ≥ 44 × 44 CSS px. The tabs at 40 px tall pass AA (≥ 24 ×
24 per SC 2.5.8) but fall 4 px short of AAA. The width of each tab
varies with the label text (~80–100 px), so width is not the limit —
height is.

**Disposition**: accept the AAA shortfall. Rationale:
- The spec's `2.5rem` strip height is intentional editorial
  geometry; lifting to 2.75rem (44 px) would introduce visual
  bulk against the hairline-over-shadow principle.
- AA is the chunk's contract bar (line 1100 of phase-5.md says
  "WCAG AA contrast verified on every new visible foreground/
  background pair").
- Keyboard navigation (Arrow keys + Home/End + Tab) provides the
  primary affordance for users who cannot pointer-click a 40 px
  target reliably.

If a future round of UI/UX review wants AAA, the change is one
token swap (`2.5rem` → `2.75rem` on `.tabs { height }`) plus a
re-measure of the indicator placement (still at `bottom: -1px`).
**This shortfall is documented here so codex sees we considered it.**

## 7. Decisions & tradeoffs

### 7.1 Italic session title — locked in

Spec line 619 explicitly left both options open: "Title in
`--font-display` italic OR upright (test both at M5; pick the one
that reads better against Fraunces' optical sizing) at `--text-xl`."
**The reviewer locked the answer to italic at M2b** — this section
records the decision; checklist item 24 already assumes it; §10 no
longer carries this as an open question.

Reviewer's accepted rationale:
- **Editorial continuity with M2a's empty-pane preface.** M2a
  promoted the empty-pane preface to italic Fraunces (M2a §9.2 +
  §11 acceptance #22). Continuing italic into the session title
  reads as a single editorial voice across the right pane: the
  empty-pane invitation and the session title both speak in the
  same italic register.
- **Manuscript feel.** Italic Fraunces reads as "title of an article
  in a quarterly", aligning with the Archive-room mental model. An
  upright title would read more like a settings page or a database
  record; italic frames the session as a document, not a row.
- **Optical-axis legibility.** Fraunces' italic is most legible at
  the display optical axis where `--text-xl` lives; the same italic
  at body-size would read slower, but at display size the
  letterforms have room to breathe.

The known cons (long-title scanning slightly slower than upright;
old-style numerals more pronounced in upright) are accepted as
trade-offs against the three pros above.

If a future round wants upright, this is a one-line CSS edit
(`font-style: normal` instead of `italic` on `.session-title`).
M2b ships italic.

### 7.2 Cross-fade is fade-IN-only

A true cross-fade (outgoing fade-out overlapping with incoming
fade-in) would require both panels rendered simultaneously while
their opacities crossfade. This fights two M2b mandates:
- Spec line 654 mandates the `hidden` HTML attribute on inactive-
  but-visited panels (which is `display: none`, not transition-able).
- Resolved Decision #12 mandates lazy-on-first-activation, which
  means unvisited panels aren't even in the DOM.

Fade-in-only resolves cleanly: outgoing panel hides instantly via
`hidden` toggle; incoming panel's `<div role="tabpanel">` toggles
its inline `style.animation` from `"none"` to `"tab-fade-in 120ms
var(--ease-out) both"`, firing the keyframe without remounting the
React tree (see §7.4 for the mechanism rationale). Spec line 87
("Tab panel cross-fade · opacity · 120 ms · ease-out · active-tab
change") doesn't actually mandate a cross-fade in the strict
animation sense; it mandates the entrance animation. M2b's
fade-IN-only matches the spec wording and avoids the panel-
mounting contradiction.

**Explicit spec-interpretation note (so future reviewers don't
re-litigate):** the spec's word "cross-fade" is shorthand for the
entrance animation; this resolution preserves spec intent because
no overlap is visually perceptible at 120 ms with a `display: none`
outgoing panel. A user perceives the outgoing panel as already gone
the moment the click registers; the 120 ms fade-IN of the incoming
panel reads as a single "page reveals next chapter" gesture, not as
a missing cross. There is no perceptual difference at this duration
between true cross-fade and fade-IN-only.

### 7.3 Subagent sidecar badge: ship in Metadata at M2b; defer header version to M4

Resolved Decision #8 says "Subagent sidecar badge appears in the
session header AND the Metadata tab". The brief asks M2b to defer
the header version to M4 (alongside Copy path, sourcePathIsStale
hint, "Open raw" header anchor — the "full header" surfaces).

Reasoning:
- The Metadata tab IS the canonical record (per Resolved Decision
  #8: "header for at-a-glance discovery, Metadata for canonical
  record"). Shipping the canonical version first is the safer
  ordering.
- The full-header surfaces are mostly a coordinated set: Copy path,
  the truncation banner consumer, the parser-warnings banner
  consumer all want to land together so the header doesn't shuffle
  twice between M2b and M4.
- Shipping the header subagent badge alone would create a near-
  empty header surface that would re-render its own column-layout
  decisions in M4 — duplicate work.

The `working/phase-5.md` spec at line 623 lists subagent badge as a
header surface; the brief acknowledges this and explicitly defers
the header version to M4. This design.md captures the decision
explicitly so the M4 planner sees it and reads the brief.

### 7.4 CSS animation-name re-trigger — chosen mechanism for tab cross-fade

Cross-fade-IN must re-fire on every tab change WITHOUT remounting
the panel content (Resolved Decision #12 / spec lines 650–658
require visited panels to stay React-mounted so RawTab's in-flight
`consumeRawPreview` consumer keeps streaming, and so M3+
`useParsedSession` results are not recomputed every tab flip).

Mechanisms considered:

- **(A) CSS animation-name re-trigger via inline style** — chosen.
  The panel's `<div role="tabpanel">` carries an inline
  `style.animation` that toggles between `"none"` (when inactive)
  and `"tab-fade-in 120ms var(--ease-out) both"` (when active). The
  browser starts the keyframe each time the property string
  transitions from `none` to a real animation. The panel's React
  subtree is **stable** — never remounted. Reduced-motion is
  handled by the global rule (`animation-duration: 0.01ms !important`)
  established in M1a, so no per-panel branching is needed.
- **(B) Web Animations API in a `useEffect`** — works equivalently:
  `useEffect(() => { if (isActive) ref.current.animate([{opacity: 0},
  {opacity: 1}], {duration: 120, easing: 'cubic-bezier(0,0,0.2,1)'})
  }, [isActive, tabId])`. Adds a `useEffect` per panel that's
  imperative DOM manipulation; reduced-motion needs an explicit
  `window.matchMedia('(prefers-reduced-motion: reduce)')` guard.
  Functional, but more surface area.
- **(C) ~~React `key={activeTab}` remount~~** — REJECTED. Remounting
  the panel content tree on every tab change aborts RawTab's
  in-flight stream consumer and causes refetch-on-every-switch; for
  M3+ Skim/Transcript it would re-trigger `useParsedSession`. This
  defeats Resolved Decision #12's keep-mounted contract. The
  previous round of this artifact mistakenly chose this option;
  codex (round 3) caught the violation.

Why (A) over (B): the existing `--ease-out` token is consumed
directly via the CSS variable in the inline style; the global
reduced-motion rule from M1a already handles the zero-out (no JS
branching needed); there's no imperative DOM manipulation; the
mechanism is fully declarative.

The only subtlety: React must re-render the panel with the new
inline style on every `activeTab` change. This is automatic — the
panel is a child of the tab-container component that owns
`activeTab` state, so its `isActive` prop changes drive a re-render,
which writes the new `style.animation` string. Active → active
re-renders don't re-fire (the property string is unchanged); only
inactive → active transitions do. Verified by tracing the React
reconciler: identical `style` props produce no DOM mutation.

### 7.5 The "Open raw" anchor on Metadata tab

Spec line 727 says the Metadata tab carries the "Open raw" anchor
"also present in the header — both surfaces keep the affordance for
discoverability". M2b ships the Metadata version. The header
version defers to M4.

The Metadata anchor is rendered ONLY when
`row.storedSessionUid !== null` (Phase 4 invariant; preserved
verbatim). For source-only rows the anchor is absent (and the Raw
tab shows the "Not yet imported" copy instead).

### 7.6 The Raw tab "Not yet imported" branch

Resolved Decision #18 says "Metadata + Raw tabs do NOT trigger
`useParsedSession` fetch." The Raw tab uses its own consumer
(`consumeRawPreview`), not `useParsedSession`. For source-only rows
(`storedSessionUid === null`) Raw can't fetch anything — the URL
`/api/v1/sessions/<uid>/raw` doesn't exist.

The "Not yet imported" branch:
- Renders muted prose: "This session has not been imported yet —
  only the source-side metadata is available. Click Import in the
  action bar to fetch the raw payload."
- Suggests the Metadata tab (implicitly — the Metadata tab is the
  only fully-functional tab for source-only rows at M2b).
- NEVER fires the fetch.

Copy lifted from spec line 671: "This session has not been imported
yet — only the source-side metadata is available. Click Import in
the action bar to fetch the raw payload."

## 8. References

### 8.1 `working/phase-5.md` (frozen at 05467ad)

- §Design Language, lines 15–78 — Archive-room aesthetic, signature
  details, tab indicator slide.
- §Motion & Micro-interactions, lines 80–128 — motion budget table,
  reduced-motion zero-out, performance budget.
- §Inspection Surface Layout, lines 493–611 — split-pane shell,
  narrow-mode behavior, "Back to list" semantics.
- §Session View → Header, lines 615–629 — header anatomy (M2b
  ships minimal subset; M4 ships the rest).
- §Session View → Tab strip, lines 631–662 — tab strip recipe,
  default-tab progression, panel mounting strategy, ARIA APG ref.
- §Session View → State handling for parsed-content tabs, lines
  664–677 — Skim/Transcript placeholder context.
- §Session View → Skim tab / Transcript tab / Raw tab / Metadata
  tab, lines 679–729 — per-tab content references; Raw tab byte-
  equivalence to Phase 4; Metadata tab field list; "Open raw"
  anchor invariants.
- §Design Tokens, lines 866–947 — every M2b-consumed token.
- §Resolved Decisions:
  - #6 Drawer + SessionDetail deletion (M6).
  - #8 Subagent badge in Metadata (ships M2b) and Header (defers
    to M4).
  - #11 Default-tab progression — M2 close = Metadata.
  - #12 Lazy-on-first-activation panel mounting + visitedTabs +
    `hidden` attribute.
  - #18 Metadata + Raw tabs do NOT trigger `useParsedSession`
    fetch.
  - #20 Selection ownership in `App.tsx`.
- §Milestone 2, lines 990–1005 — M2's DoD list.
- §Testing, lines 1106–1122 — Tabs.test.tsx + SessionView.test.tsx
  + SessionMetadata.test.tsx + RawTab.test.tsx obligations.

### 8.2 `working/phase-5/designs/m2a-tokens/` artifacts

- `design.md` — token table; @font-face recipe; cascade order;
  WCAG AA contrast table (post-fix-up); empty-pane preface
  promotion to display italic at `--text-lg`.
- `wcag.md` — codex-measured ratios for every M2a-consumed pair;
  M2b inherits these without re-measure (no new pairs).

### 8.3 `working/phase-5/designs/m1a-shell/` and `m1b-shell/`

- `design.md` (M1a) — split-pane shell, deep-link pulse keyframe,
  empty-pane copy, narrow-mode shell, focus-visible recipe.
- `design.md` (M1b) — compact list 4-essentials recipe, sticky
  footer two-hairline structure, filter `<details>` chevron,
  vestigial "Open detail" trigger.

### 8.4 Production code references

- `apps/frontend/src/features/sessions/SessionDetail.tsx` —
  current 18-field `<dl>` body (lines 160–256) + RawPreviewBlock
  (lines 295–399). M2b extracts both verbatim into
  `SessionMetadata.tsx` and `RawTab.tsx`.
- `apps/frontend/src/features/sessions/rawPreview.ts` — the existing
  `consumeRawPreview` consumer, reused unchanged.
- `apps/frontend/src/features/sessions/relativeTime.ts` — used by
  the timestamp `<dd>`s in the metadata table.

## 9. Implementation acceptance checklist

The developer verifies each item before requesting review.

### Tabs primitive (`apps/frontend/src/components/Tabs.tsx`)

1. Tablist DOM is `<div role="tablist" aria-label={...}>` containing
   exactly four `<button role="tab">` children plus one
   `<span class="indicator" aria-hidden="true">` child.
2. Each `<button role="tab">` has `id`, `aria-controls` (= panel id),
   `aria-selected` (`"true"` exactly when active, otherwise `"false"`).
3. Roving tabindex: exactly one tab carries `tabindex="0"` at any
   moment (the active one); the other three carry `tabindex="-1"`.
4. ArrowLeft on active tab → previous tab (wraps from first to last).
5. ArrowRight on active tab → next tab (wraps from last to first).
6. Home → first tab; End → last tab.
7. Click on tab → activates it; focus moves to it.
8. Tab strip uses arrow keys, NOT Tab, for between-tab navigation
   (Tab moves focus out of the tablist into the active panel).
9. Indicator slides between tabs over `var(--motion-base)` (120 ms)
   with `var(--ease-standard)`, transitioning ONLY `transform`. No
   layout-touching properties animate. Suppressed under
   `prefers-reduced-motion: reduce`.
10. Indicator color is `var(--color-accent)`; **base CSS box is
    exactly `width: 1px; height: 1px;`** (NOT `width: auto` — see
    item 11 for why); positioned via `position: absolute; bottom:
    -1px; left: 0;` so it sits on the strip's bottom hairline border.
11. Indicator width matches the active tab's text width (NOT the
    tab's full padding box). Implemented as: indicator base size is
    `width: 1px; height: 1px;` (item 10), and the JS `useLayoutEffect`
    writes a single `transform: translateX(${x}px) scaleX(${width}px)`
    where `x = activeTabRect.left - tablistRect.left` and `width =
    activeTabRect.width`. The 1 px base is load-bearing: without it,
    `scaleX(N) × 0 = 0` and the indicator never appears. Both
    components live in one `transform` declaration so the
    `transition: transform var(--motion-base) var(--ease-standard)`
    animates them together as a single compositor-cheap step.
    Tab buttons enforce `padding-inline: 0` (their `padding` is
    vertical-only) so the measured `getBoundingClientRect().width`
    equals the label width — the indicator slides between LABEL
    widths, not button-with-padding widths. The
    `useLayoutEffect` re-runs on `activeTab` change AND on a
    `ResizeObserver` watching the tablist (re-measures on viewport
    width change + Fraunces font swap). The `requestAnimationFrame`
    on initial mount lets the Fraunces fallback metrics settle
    before the first measurement (M2a §4 documented the ~1 px
    swap delta).
12. Active tab text: `var(--color-ink)`, `font-weight: 600`,
    `var(--font-chrome)`, `var(--text-sm)`.
13. Inactive tab text: `var(--color-ink-muted)`, regular weight, same
    family + size.
14. Hover (inactive only): text shifts to
    `color-mix(in srgb, var(--color-ink) 80%, var(--color-ink-muted))`.
    NO background tint.
15. Focus-visible: `outline: 2px solid var(--color-accent);
    outline-offset: 2px; border-radius: 2px;`.
16. Tab strip has `height: 2.5rem` (structural literal — see
    `working/phase-5.md:935`), `padding: 0 var(--space-4)` (16 px
    horizontal), `gap: var(--space-3)` (12 px),
    `border-bottom: 1px solid var(--color-border)`. **Note**:
    `--space-5` does NOT exist in
    `apps/frontend/src/styles/tokens.css:96-102` (the spacing scale
    is 1/2/3/4/6/8 only). Use `--space-4` for 16 px horizontal
    padding; if 20 px is desired, document a structural literal
    `1.25rem` per §Implementation acceptance checklist below.
17. NO `background-color` on the tab strip itself; strip inherits
    `var(--color-surface)`.

### SessionView (`apps/frontend/src/features/sessions/SessionView.tsx`)

18. `<SessionView>` is keyed on `selectedRowKey` so React remounts on
    selection change.
19. `.session-pane` has CSS `@keyframes session-page-turn` that runs
    once on mount: `from { opacity: 0; transform: translateX(4px) }
    to { opacity: 1; transform: translateX(0) }`, duration
    `var(--motion-disclosure)` (200 ms), easing `var(--ease-out)`,
    `animation-fill-mode: both`. The `to` state explicitly sets
    `translateX(0)` (NOT `transform: none`) so the property remains
    declared and does not interact poorly with later inline
    `transform` writes during the same paint. Suppressed under
    reduced-motion.
20. `activeTab` is component-local React state, initialized to
    `DEFAULT_TAB_ON_SELECTION` (= `"metadata"` at M2b).
21. `visitedTabs: Set<TabId>` is component-local React state,
    initialized to `new Set([DEFAULT_TAB_ON_SELECTION])`.
22. `setActiveTab(id)` → updates `activeTab` AND adds `id` to
    `visitedTabs` (via `setVisitedTabs(prev => new Set([...prev, id]))`).
23. Both `activeTab` and `visitedTabs` reset to defaults on
    `selectedRowKey` change (via the `key` remount; no manual reset
    needed).
24. The minimal header renders `<h2 class="session-title">` in
    italic Fraunces at `--text-xl`, color `var(--color-ink)` (or
    `var(--color-ink-muted)` italic when row.title is null with
    "(untitled)" fallback). Tool badge in `--font-mono --text-xs`
    with hairline border. Status pill via Phase 4 `.badge {variant}`
    recipe. Conflict badge (variant `conflict` = warn recipe) only
    when `row.statusConflict`.
25. M2b minimal header does NOT include Copy path button, header-side
    subagent badge, sourcePathIsStale hint, or "Open raw" anchor.
    Those defer to M4.
26. Narrow-viewport "← Back to list" quiet text-button row sits ABOVE
    the `.session-header` and only displays under
    `@media (max-width: 899.98px)`. Click sets
    `narrowMode = "list"` only (preserves selection + URL + tab/scroll
    state per Resolved Decision #17).

### Tab panel mounting + cross-fade

27. Each `<div role="tabpanel" id="panel-{id}" aria-labelledby="tab-{id}"
    hidden={!isActive}>` is rendered ONLY when `visitedTabs.has(id)`.
    Unvisited panels are NOT in the DOM. **Panel rendering MUST be
    object-keyed (`key={tabId}`), NEVER index-keyed (`key={index}`)**
    so that skipping an unvisited mid-sequence panel never causes
    React to re-key the remaining panels by position. **Once a panel
    has mounted, its content tree is STABLE — it MUST NOT carry an
    inner `key={activeTab}` (or any other key that flips on tab
    change).** Remounting the panel content on every tab change
    aborts RawTab's in-flight `consumeRawPreview` consumer and (in
    M3+) re-triggers `useParsedSession` for Skim/Transcript — that
    violates Resolved Decision #12's keep-mounted contract. Required
    pattern (or strictly equivalent):

    ```jsx
    {(Object.entries({
       transcript: <TranscriptPanel />,
       skim:       <SkimPanel />,
       raw:        <RawTab row={row} />,
       metadata:   <SessionMetadata row={row} />,
     }) as Array<[TabId, ReactNode]>)
       .filter(([id]) => visitedTabs.has(id))
       .map(([id, content]) => (
         <TabPanel key={id} id={id} isActive={id === activeTab}>
           {content}
         </TabPanel>
       ))}
    ```

    `key={id}` on the OUTER `<TabPanel>` (the tab id string), NEVER
    `key={index}` from `.map((_, i) => …)` and NEVER `key={activeTab}`
    on the inner content. Index-keying would cause the wrong panel to
    remount when a previously-unvisited mid-sequence tab is
    activated for the first time. `key={activeTab}` on the inner
    content would defeat the keep-mounted contract per the warning
    above.
28. The cross-fade-IN runs on the panel's own `<div role="tabpanel">`
    element via a CSS `animation-name` toggle: when `isActive=true`,
    the panel carries `style={{ animation: "tab-fade-in 120ms
    var(--ease-out) both" }}`; when `isActive=false`, it carries
    `style={{ animation: "none" }}`. The browser fires the keyframe
    each time the property string transitions from `"none"` to a
    real animation. The keyframe is defined ONCE at module scope:
    `@keyframes tab-fade-in { from { opacity: 0 } to { opacity: 1 } }`.
    Active → active re-renders DO NOT re-fire (the property string
    is unchanged); only inactive → active does. The panel's React
    subtree is **stable** — NOT remounted on tab change. Suppressed
    under `prefers-reduced-motion: reduce` via the M1a global rule.
    **Do NOT use a React `key={activeTab}` (or any per-activation
    key) on the panel content** — that would defeat the keep-mounted
    contract; see item 27.
29. Cross-fade is fade-IN-only — outgoing panel hides instantly via
    the `hidden` attribute (display: none); no fade-out animation.
29a. Skim, Transcript, AND Raw tabpanels carry `tabIndex={0}` while
    active. Skim + Transcript placeholders have no focusable child;
    Raw's success state also has no focusable child (the `<pre
    class="raw-pre">` is not focusable, the caption is a `<p>`, and
    Retry only renders in `error` / `non_2xx`). Without
    `tabIndex={0}` on the active Raw panel, Tab from the active Raw
    tab in `success` / `idle` / `loading` / `not_imported` would
    skip past the panel entirely. The Raw rule is **Option A
    (unconditional on isActive)**, NOT conditional on the state
    machine — simpler and never wrong; in `error` / `non_2xx` the
    panel becomes the first Tab stop and Retry is reached on the
    next Tab press. **Metadata is the lone exception** — its Copy
    path button is always rendered and always focusable, so the
    panel itself does NOT carry `tabIndex`; the button serves as
    the first Tab stop inside the panel. The `tabIndex` toggles in
    lockstep with `hidden`: inactive panels MUST NOT carry
    `tabIndex={0}`.

### SessionMetadata (`apps/frontend/src/features/sessions/SessionMetadata.tsx`)

30. The component renders all 18 fields from the Phase 4
    `SessionDetail.tsx` `<dl>` (lines 160–256) byte-equivalently.
    Field labels match Phase 4 spelling.
31. The source-path `<dt>` label swaps "source path" / "last seen
    source path" based on `row.sourcePathIsStale`.
32. The status `<dd>` renders the status pill PLUS a muted "(disagreed
    during load)" note when `row.statusConflict`.
33. The has_subagent_sidecars `<dd>` renders the boolean PLUS the
    subagent sidecar badge ("Has Claude Code subagent sidecars on
    disk — not ingested in v1") when `row.hasSubagentSidecars`. Badge
    styling: dashed `var(--color-border-strong)` border,
    `var(--color-ink-muted)` text, `--font-chrome --text-xs`.
34. Copy path button preserves the Phase 4 fallback chain
    (Clipboard API → manual select). Hint copy preserved verbatim:
    "Copied" / "Selected — press Ctrl/Cmd + C to copy". Hint clears
    after 2000 ms.
35. The "Open raw" anchor renders ONLY when
    `row.storedSessionUid !== null`. Anchor target is
    `/api/v1/sessions/{uid}/raw`, opens in new tab via
    `target="_blank" rel="noopener noreferrer"`.
36. Anchor text color is `var(--color-accent)` (light 4.84:1 / dark
    5.78:1 — passes AA normal text per M2a).

### RawTab (`apps/frontend/src/features/sessions/RawTab.tsx`)

37. RawTab fires the fetch ONLY when `row.storedSessionUid !== null`.
    For source-only rows, it short-circuits to the "Not yet imported"
    branch without firing.
38. The "Not yet imported" copy is: "This session has not been
    imported yet — only the source-side metadata is available. Click
    Import in the action bar to fetch the raw payload." Quiet muted
    prose, no border, no chrome.
39. RawTab uses `consumeRawPreview` (from `rawPreview.ts`) unchanged.
    Same 256 KB / 20-line caps, same caption strings, same Retry
    semantics.
40. AbortController is created on mount; the `useEffect` cleanup
    aborts the in-flight fetch ONLY when the effect actually cleans
    up. The four (and only four) cleanup triggers are:
    1. **`selectedRowKey` change** — the outer `SessionView` is
       re-mounted (its `key={selectedRowKey}` on the `<article>`
       changes), which unmounts RawTab and fires its
       AbortController.
    2. **`row.storedSessionUid` change** — RawTab's `useEffect`
       lists `storedSessionUid` in its dependency array, so a
       row-data refresh that changes the uid runs the cleanup
       (aborts the previous request) and then a fresh fetch.
    3. **Retry button** — bumps the internal `attempt` counter
       (item 45), which is a `useEffect` dependency; the cleanup
       aborts whatever is in flight (e.g. a slow-failing request
       the user no longer wants to wait for) and the effect
       re-runs with a new AbortController.
    4. **`SessionView` itself unmounts** (rare; e.g. full app
       teardown / parent removes the pane) — RawTab unmounts and
       its AbortController fires.

    **Tab switches are NOT a cleanup trigger.** Per Resolved
    Decision #12 and `phase-5.md:650-658` (lazy-on-first-activation +
    keep-mounted-after), once Raw has been visited its
    `<div role="tabpanel">` stays mounted for the rest of the
    selection. Switching to another tab only toggles `hidden`,
    `style.animation` (the cross-fade-IN trigger per item 28), and
    `tabIndex` on the panel `<div>`. The React subtree is
    **stable** — RawTab's `useEffect` does NOT re-run, the
    AbortController is NOT aborted, and the in-flight fetch
    survives. Coming back to the Raw tab finds the same
    AbortController and the same response state already in
    progress / completed; no refetch.
41. Caption strings preserved EXACTLY:
    - byte cap fired → `"Stopped at byte cap — full payload not downloaded."`
    - line cap fired → ``Showing first ${N} lines of the raw payload.``
    - neither → ``Showing first ${N} lines (full payload below the caps).``
    - both caps → byte-cap caption wins.
42. Non-JSON fallback lines render with the `(non-JSON line)` marker
    inline (Phase 4 `RawPreviewLineRow` recipe preserved).
43. Error state copy: ``Failed to load raw preview: ${message}`` +
    Retry button.
44. Non-2xx state copy: ``HTTP ${status}: ${bodySnippet}`` + Retry
    button. `bodySnippet` truncated at 240 chars per Phase 4.
45. Retry button bumps an internal `attempt` counter, triggering the
    effect to re-run.

### Skim + Transcript placeholders

46. Both placeholders render an editorial centered block: 1 px dashed
    `var(--color-border)` border, italic Fraunces label
    (`--font-display --text-lg --color-ink-muted`), milestone copy
    below (`--font-chrome --text-sm --color-ink-muted`). Text-align
    center, `padding: var(--space-8) 0` (32 px vertical).
    **Note**: `--space-12` does NOT exist in
    `apps/frontend/src/styles/tokens.css` — the scale is 1/2/3/4/6/8.
    Use `--space-8` for the placeholder padding; if more breathing
    room is desired, document a structural literal (e.g. `2.5rem`
    or `3rem`) per §Implementation acceptance checklist below.
47. Transcript placeholder copy: "Coming in Milestone 4".
48. Skim placeholder copy: "Coming in Milestone 5".

### Tab + panel ARIA contract

49. Every tab has a unique `id`; every panel has a unique `id`. The
    tab's `aria-controls` matches the panel's `id`; the panel's
    `aria-labelledby` matches the tab's `id`.
50. `aria-selected` on each tab matches the active state (`"true"`
    on exactly one tab; `"false"` on the others).
51. Inactive panels carry the `hidden` HTML attribute; the active
    panel does not. The browser's user-agent stylesheet applies
    `display: none` to `[hidden]` automatically.

### Vestigial drawer-trigger collapse

52. The M1a "Open detail" button (vestigial after M1b) is removed
    from `SessionsTable.tsx` (or wherever it lives). Clicking a row
    sets selection (already does); the row's chevron / open-detail
    affordance is removed entirely.
53. `SessionDetail.tsx`, `SessionDetail.test.tsx`, and
    `SessionDetail.css` STAY ON DISK at M2b close (deletion is M6
    work per Resolved Decision #6) but are no longer reachable from
    the UI. The `Drawer` component likewise stays installed but
    unmounted. M6 deletes both.

### Acceptance verification

54. `bun test src` passes; the new `Tabs.test.tsx` covers
    keyboard nav (ArrowLeft/Right/Home/End), ARIA roles,
    `aria-selected` toggling, panel switching, focus-after-activation,
    AND that **Tab from the active tab moves focus into the
    panel** for ALL four panels: Skim + Transcript + Raw via the
    panel's own `tabIndex={0}` (verify the active panel carries
    `tabindex="0"` for Skim, Transcript, AND Raw — including Raw
    in its `success` / `idle` / `loading` / `not_imported` states
    where Retry is absent); Metadata via the Copy path button.
    Inactive panels MUST NOT carry `tabindex` (regression guard:
    after switching tabs, the previously-active panel has its
    `tabindex` attribute removed in lockstep with `hidden=true`).
55. `SessionView.test.tsx` covers default-tab = "metadata",
    `visitedTabs` lazy mount, `hidden` attribute toggling, page-turn
    fade animation presence (test for `animation-name` CSS via
    `getComputedStyle`), AND that the panel content does NOT
    remount on tab change (regression guard for Resolved Decision
    #12: e.g. mount RawTab as the active tab, switch to Metadata,
    switch back to Raw, assert the previous RawTab instance is
    still in the DOM via a stable React ref, NOT a fresh one).
56. `SessionMetadata.test.tsx` covers all 18 fields render with the
    correct labels, sourcePathIsStale label swap, statusConflict
    badge + note, subagent badge, "Open raw" anchor presence/absence,
    Copy path success + fallback paths.
57. `RawTab.test.tsx` covers Phase 4 raw-preview behavior verbatim
    (loading / success / error / non_2xx) PLUS the "Not yet
    imported" branch when storedSessionUid is null.
58. Hex audit holds: `rg -n '#[0-9a-fA-F]{3,8}' apps/frontend/src/ | wc -l`
    returns exactly 24 (M2a baseline; M2b adds zero new hex).
59. Token count holds: `grep -cE '^\s*--' apps/frontend/src/styles/tokens.css`
    is unchanged from M2a (no new tokens introduced).
60. WCAG AA passes for every M2b-relevant pair per `colors.md` (all
    inherited from M2a; no new pairs).
61. Reduced-motion verification: with `prefers-reduced-motion: reduce`
    set, the indicator slide, tab cross-fade, AND page-turn fade all
    complete in one paint frame (< 16 ms).
62. `bun run build` passes; `bun run test:e2e` passes.
63. `cargo check --workspace` and `cargo test --workspace` pass (no
    Rust impact, but the gates run for chunk-close discipline per
    Phase 4 + M2a precedent).

## 10. Open questions for the reviewer

None. The four questions raised in the previous round of this
artifact are now resolved (recorded here for traceability so the
implementer + the M4/M5 planners see the trail):

- **Italic session title** — italic. (See §7.1 for full rationale:
  editorial continuity with M2a's empty-pane preface, manuscript
  feel, optical-axis legibility at `--text-xl` where Fraunces
  italic is most legible. Checklist item 24 ships italic.)
- **WCAG 2.5.5 AAA touch-target shortfall (40 px tab strip vs.
  44 px AAA bar)** — accept the AA bar. (See §6.6: the spec's
  `2.5rem` strip height is intentional editorial geometry; lifting
  to 2.75rem would visibly thicken against the hairline-over-shadow
  principle. Arrow-key + Home/End nav is the documented affordance
  for users who can't reliably hit a 40 px target.)
- **Subagent sidecar badge placement (inline vs. sibling banner)** —
  inline. (Resolved Decision #8 says "Metadata for canonical
  record"; a banner reads as a warning and fights the
  canonical-record framing. The dashed-hairline informational chip
  sits on the same row as the `has_subagent_sidecars: true` field
  per §3.3.)
- **Indicator width measurement (JS bbox vs. CSS-only `:has()`)** —
  JS `getBoundingClientRect` in a `useLayoutEffect`. The `:has()`
  alternative isn't actually CSS-only (would still need JS to
  write a custom property per tab), and hardcoded widths break
  under font-swap + i18n. The production Tabs primitive already
  needs a React effect for ARIA + tabindex management, so the
  measurement consolidates into the same effect.

## 11. Conflicts with spec direction

None. All M2b deliverables align with the spec's frozen text and
Resolved Decisions. The two non-trivial calls (subagent badge in
Metadata at M2b; full header surfaces deferred to M4) are
explicitly captured by Resolved Decision #8 and the brief itself
respectively.

The cross-fade fade-IN-only resolution (§7.2) is a direct read of
spec lines 87 + 654 — there's no contradiction, just a precise
mechanism that the spec leaves open. Documented here so codex sees
the reasoning.

The WCAG 2.5.5 AAA touch-target shortfall (§6.6) is below the AAA
bar but at the spec's mandated geometry. Documented here as
accepted-risk so codex sees the trade considered.
