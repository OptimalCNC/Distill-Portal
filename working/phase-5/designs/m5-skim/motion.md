# M5 motion timing reference

This is a single-screen lookup for the developer landing M5. It
re-tabulates the spec §Motion budget rows that M5 activates, names
each surface, pins the implementation idiom, and enumerates the
PROHIBITED list for codex defense. M5 introduces ZERO new motion
tokens and ZERO new motion vocab.

## 1. Authorized properties

Per spec line 1100 (verbatim from frozen spec):

> Allowed animatable properties are `transform`, `opacity`, and
> `background-color` (background-color only on the surfaces that
> explicitly list it in §Motion ...). The documented `<details>`
> `block-size` exemption (§Performance budget) is the only
> layout-touching animation. No `width` / `height` / `top` /
> `padding` animations anywhere. Skim-block stagger capped at 8
> blocks.

M5 surfaces touch THREE animation channels:

1. `opacity` (skim-block stagger; truncation banner entrance).
2. `transform: translateY` (skim-block stagger only).
3. `block-size` (`<details>` disclosure; M2b-authorized exemption,
   inherited via global `details > *:not(summary)` rule).

NO M5 surface animates `background-color`. NO M5 surface animates
`color`, `border-color`, `width`, `height`, `top`, `padding`,
`margin`, `font-size`, `letter-spacing`, or `line-height`.

## 2. Authorized motion vocab

M5 introduces ZERO new motion tokens. The vocabulary is
M2a-canonical:

| Token                  | Resolved      | M5 usage                                                                                |
|------------------------|---------------|-----------------------------------------------------------------------------------------|
| `--motion-base`        | `120 ms`      | Truncation banner opacity entrance (M4-inherited recipe).                                |
| `--motion-disclosure`  | `200 ms`      | `<details>` block-size animation (M2b global rule); skim-block stagger keyframe duration. |
| `--ease-out`           | `cubic-bezier(0, 0, 0.2, 1)` | Banner entrance, skim-block stagger.                                                  |
| `--ease-in-out`        | `cubic-bezier(0.4, 0, 0.6, 1)` | Disclosure animation easing (inherited via global rule).                              |

NOT consumed by M5:

- `--motion-fast` (80 ms): would be used for hover-tint surfaces;
  M5 has none (hover states are instant).
- `--motion-pulse` (600 ms): M1a deep-link pulse; not an M5 surface.
- `--ease-standard`: M2b tab-strip indicator only.

## 3. M5's authorized motion surfaces

The chunk activates THREE rows from the spec's §Motion budget table
at `working/phase-5.md:84-95`. **No other M5 surface animates.**

| #   | Surface                                     | Property                     | Duration                    | Easing                  | Trigger                                  | Idiom                                                                                |
|-----|---------------------------------------------|------------------------------|-----------------------------|-------------------------|------------------------------------------|--------------------------------------------------------------------------------------|
| 1   | **Skim-block first-paint stagger** (NEW)    | `opacity` (0 -> 1) + `transform: translateY(4px -> 0)` | `--motion-disclosure` (200 ms) | `--ease-out`            | first paint per session, capped at 8     | CSS `@keyframes skim-block-fade-in` + per-block inline `style={{animationDelay}}`     |
| 2   | **Truncation banner appearance** (M4-inherited) | `opacity` (0 -> 1)           | `--motion-base` (120 ms)    | `--ease-out`            | mount when `parsed.truncated`            | CSS `@keyframes skim-banner-fade` (byte-equivalent recipe to M4's transcript-banner) |
| 3   | **Disclosure (`<details>`) expand/collapse** (M2b-inherited) | `block-size` (via `interpolate-size: allow-keywords`) | `--motion-disclosure` (200 ms) | `--ease-in-out`         | user toggle on `<summary>`               | Native `<details>` element + global CSS `details > *:not(summary) { transition: ... }` |

## 4. M5's INSTANT (non-animated) surfaces

These M5 surfaces undergo state changes with NO animation /
transition:

| #   | Surface                                  | State change                                          | Trigger                  |
|-----|------------------------------------------|-------------------------------------------------------|--------------------------|
| 4   | Skim block panel mount (post-stagger)    | none — panel sits at full opacity, transform 0       | first paint per session  |
| 5   | "Expand to raw messages" hover           | `text-decoration: underline` swap (instant)          | pointer enter            |
| 6   | "Agent reaction" hover                   | (no hover-state change — chrome muted ink stays muted) | pointer enter           |
| 7   | Agent-only summary hover                 | (no hover-state change)                               | pointer enter            |
| 8   | Oversized summary hover                  | (no hover-state change)                               | pointer enter            |
| 9   | Boundary block (mid-stream)              | none — boundary appears with stagger as a passive participant | first paint        |
| 10  | Parse-warnings banner mount              | none — banner appears at full opacity                | `warnings.length > 0`    |
| 11  | Parse-warnings dismiss button hover      | border-color swap (instant)                          | pointer enter            |
| 12  | Retry button hover                       | border-color swap (instant)                          | pointer enter            |
| 13  | `<summary>` focus-visible                | outline appears                                       | focus arrives            |
| 14  | Code-fence segment render                | none — `<pre>` / `<code>` swap is structural         | first paint              |

Why instant rather than animated: `color`, `border-color`,
`text-decoration`, and hover `background-color` on these surfaces
are NOT in the spec's frozen motion budget. The budget is
load-bearing per spec line 1100; adding animations on unlisted
surfaces requires a coordinator waiver, which M5 does not seek.
Instant state changes still feel responsive at 60 Hz; the animated
surfaces (#1, #2, #3) carry the chunk's animation budget.

## 5. Idiom details

### 5.1 Surface 1 — Skim-block first-paint stagger (NEW for M5)

**This is the only NEW motion authorization M5 introduces.**

Spec table row (verbatim from `working/phase-5.md:93`):

> | Skim-block stagger on first paint | `opacity` + `translateY(4px → 0)` per block | 40 ms × N (max 8 blocks) | `ease-out` | first paint per session |

CSS:

```css
.skim-block,
.boundary-row {
  /* Apply at mount; React passes per-block animation-delay inline. */
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

React layer (per block):

```tsx
<li
  className="skim-block skim-block-user-turn"
  style={{ animationDelay: `${Math.min(idx, 8) * 40}ms` }}
>
  ...
</li>
```

**Animation properties (verbatim, motion-budget compliant):**

- `opacity`: 0 -> 1 (universal allow per spec line 1100).
- `transform: translateY`: 4 px -> 0 (universal allow).
- `animation-fill-mode: both` keeps end state after keyframe completes.

**Animation properties NOT touched (motion-budget compliant):**

- NOT `top` (would touch layout).
- NOT `padding` / `margin` (would touch layout).
- NOT `width` / `height` (would touch layout).
- NOT `background-color`.
- NOT `color` / `border-color`.
- NOT `font-size` / `letter-spacing` / `line-height`.

**Stagger cap (spec line 1100 + spec line 681):**

```
animationDelay = Math.min(idx, 8) * 40ms
```

- Block 0 -> 0 ms.
- Block 1 -> 40 ms.
- Block 2 -> 80 ms.
- ...
- Block 7 -> 280 ms.
- Block 8 -> 320 ms (cap reached).
- Blocks 9..N -> 320 ms (all share the cap).

Maximum total stagger duration = 320 ms (cap) + 200 ms (keyframe
length) = **520 ms from first paint to last block fully visible**.

**First-paint lifecycle:**

The keyframe fires on FIRST mount of each `<SkimBlockRow>`. Mount is
triggered when:

- The user selects a session (re-keyed via SessionView's
  `key={selectedRowKey}`; the SkimView root unmounts + remounts).
- The Skim tab is first activated for a given session (under M2b's
  keep-mounted contract, the panel mounts on first activation; on
  subsequent tab switches BACK to Skim, the same instance persists
  -> NO re-fire).

Per planner Q7, the stagger plays once per session selection. Tab
switches do NOT replay the stagger. `<details>` interactions do NOT
replay the stagger.

### 5.2 Surface 2 — Truncation banner appearance (M4-inherited)

Byte-equivalent recipe to M4's `.transcript-banner-truncation`:

```css
.skim-banner-truncation {
  /* Static visual recipe — colors and layout, no animation. */
  background: color-mix(in srgb, var(--color-warn) 8%, var(--color-surface));
  border-inline-start: 3px solid var(--color-warn);
  border-radius: var(--radius-sm);
  padding: var(--space-3) var(--space-4);
  color: var(--color-ink);
  font: var(--text-sm) / var(--leading-comfortable) var(--font-chrome);
  margin-block-end: var(--space-6);

  /* Animation — opacity ONLY. */
  animation: skim-banner-fade var(--motion-base) var(--ease-out) both;
}

@keyframes skim-banner-fade {
  from { opacity: 0; }
  to   { opacity: 1; }
}
```

The keyframe name is M5-namespaced (`skim-banner-fade`) so it does
not collide with M4's `transcript-banner-fade`. The recipe is
byte-equivalent.

The animation explicitly targets `opacity` and ONLY `opacity`. The
static visual recipe (background, border, padding, color) is set at
component mount via the static `.skim-banner-truncation` selector;
the static colors are NOT interpolated in.

### 5.3 Surface 3 — Disclosure (`<details>`) expand/collapse (M2b-inherited)

M5 reuses the M2b-authorized global rule (already in
`apps/frontend/src/styles/global.css`):

```css
@supports (interpolate-size: allow-keywords) {
  :root {
    interpolate-size: allow-keywords;
  }
}

details > *:not(summary) {
  /* The disclosure animation: 200 ms ease-in-out on block-size.
   * Per the documented exemption (spec line 88), this is the ONLY
   * layout-touching animation in Phase 5. */
  transition: block-size var(--motion-disclosure) var(--ease-in-out);
}
```

M5 reuses this rule for FIVE surfaces:

- `<details class="skim-agent-reaction">` (outer "Agent reaction"
  disclosure on user_turn blocks).
- `<details class="skim-expand-raw">` (inner "Expand to raw messages"
  disclosure on user_turn blocks).
- `<details class="skim-agent-only">` (agent_only block disclosure).
- `<details class="skim-oversized">` (oversized_user_message block
  disclosure).
- `<details class="skim-banner-warnings">` (parse-warnings banner; M4
  inherited recipe).

If `interpolate-size` is unavailable in the browser, the `<details>`
snaps without animation. Acceptable per spec line 124 fallback. M5
does NOT fallback-test (the M2b suite already covers this).

The transition explicitly targets `block-size` and ONLY `block-size`.
No other property is interpolated during expand/collapse. Open/closed
state itself is browser-managed (the `[open]` attribute toggles
internally; React does NOT drive it).

## 6. PROHIBITED — what M5 must NOT animate

This section is the codex defense. Every property listed below was a
codex blocking finding in M2b round 1, M4 round 1, or earlier; M5
must not regress.

### 6.1 Properties FORBIDDEN on ALL M5 surfaces (verbatim)

These properties are forbidden per the §Motion budget +
§Performance budget enumeration in spec lines 84-128. M5 must NOT
have ANY CSS declarations matching:

- `transition: color ...`
- `transition: border-color ...`
- `transition: width ...`
- `transition: height ...`
- `transition: top ...`
- `transition: padding ...`
- `transition: margin ...`
- `transition: font-size ...`
- `transition: letter-spacing ...`
- `transition: line-height ...`

Audit (run at implementation close):

```
rg -nE 'transition: (color|border-color|width|height|top|padding|margin|font-size|letter-spacing|line-height)' \
  apps/frontend/src/features/sessions/SkimView.css \
  apps/frontend/src/features/sessions/BoundaryRow.css
```

Expected: empty.

### 6.2 Properties FORBIDDEN on skim block panels

These properties may animate elsewhere in Phase 5 but NOT on skim
block panels:

- `transition: background-color` on `.skim-block`,
  `.skim-block-user-turn`, `.skim-user-panel`, `.skim-block-agent-only`,
  `.skim-agent-only`, `.skim-block-oversized`, `.skim-oversized`,
  `.skim-summary-disabled`, `.boundary-row`. Codex M2b r1 #2 catch
  precedent. The 5 % accent tint on user_turn is STATIC
  (`color-mix()` resolved at mount); the warn 4 px stripe on
  oversized is STATIC.
- `transform` on `.skim-block*` (other than the inherited stagger
  keyframe target). The skim-block stagger uses inline
  `style={{animationDelay}}` to schedule when the `@keyframes
  skim-block-fade-in` rule fires; the keyframe itself targets
  `transform: translateY` but ONLY during the keyframe execution
  window, not as a `transition` declaration.

Audit:

```
rg -nE '\.skim-(block|user-panel|agent-only|oversized|summary-disabled).* transition: background-color' \
  apps/frontend/src/features/sessions/SkimView.css
```

Expected: empty.

### 6.3 Properties FORBIDDEN on the boundary row (`.boundary-row`)

The boundary block:

- NO `transition` or `animation` on the `.boundary-row` wrapper, the
  rules, or the label OTHER than the inherited skim-block stagger
  (which is per-element `animation: skim-block-fade-in ...`, not a
  per-property `transition`).
- NO opacity fade on the boundary specifically (the page-turn fade
  at the SessionView outer layer covers stream-level entrance; the
  boundary inherits as a passive participant).
- NO transition on `background` (the rules and label are statically
  colored).

### 6.4 Properties FORBIDDEN inside the truncation banner

The truncation banner authorizes `opacity` ONLY:

- NO `transition: background-color` on the banner. The 8 % warn-tint
  background is STATIC (resolved at mount via `color-mix`); it does
  not fade in or shift.
- NO `transform` on the banner. It does not slide or scale.
- NO `border-color` transition on the warn stripe. The stripe color
  is static.

Codex precedent: M2b r1 #2 caught a `background-color` transition on
the `.session-conflict-badge`. M5's truncation banner uses
opacity-only entrance to avoid the same misuse pattern.

### 6.5 Properties FORBIDDEN inside parse-warnings banner

The parse-warnings banner is a `<details>` element with native
disclosure animation. NO additional motion:

- NO `transition: background-color` on the banner shell.
- NO `transition: border-color` on the dismiss button.
- NO `transform` on any element.
- NO opacity animation on mount (the banner is not opacity-faded —
  it appears synchronously when `parsed.warnings.length > 0`).

### 6.6 Properties FORBIDDEN on disclosure summaries

The `<summary>` elements (Agent reaction, Expand to raw messages,
agent-only, oversized, parse-warnings):

- NO `transition` on `color`, `border-color`, `background-color`,
  `text-decoration`. Hover state changes are INSTANT.
- NO `transform` rotation on the disclosure marker. The native
  triangle-rotation animation provided by the browser is NOT
  customized; M5 does not override it.

### 6.7 Properties FORBIDDEN on Retry / Dismiss buttons

Same recipe as M2b's `.raw-retry` and M4's
`.transcript-banner-dismiss`:

- NO `transition` declarations at all on the buttons.
- Hover and focus-visible states are INSTANT.

### 6.8 Properties FORBIDDEN on the entire skim stream

- NO additional stagger BEYOND the spec-row-9 authorized
  `skim-block-fade-in` keyframe. Total animations: ONE keyframe at
  this level.
- NO virtualization-induced animations (M5 does not virtualize).
- NO scroll-synchronized animations.
- NO observer-driven animations (no IntersectionObserver-keyed
  fade-ins).

## 7. Reduced-motion fallback

The global rule in `apps/frontend/src/styles/global.css` (landed at
M1a, unchanged through M5):

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

Effect on M5's surfaces:

- **Skim-block first-paint stagger**: zeroed animation duration ->
  blocks snap to opacity 1 + transform 0 immediately on first paint.
  ALL blocks render simultaneously (no perceptible cascade).
- **Truncation banner appearance**: zeroed -> banner snaps to
  opacity 1 immediately on mount.
- **Disclosure expand/collapse**: zeroed transition duration ->
  `<details>` snaps open/closed instantly.
- **Instant hover surfaces (#5..#13)**: unaffected (they weren't
  animated to begin with).

The reading-wash noise overlay on `.session-pane` continues to be
suppressed under reduced-motion via M2a's separate rule (the noise
overlay is a `background-image` which is NOT zeroed by the global
rule's `animation-duration` / `transition-duration` reset). M5 does
not change that.

## 8. First-paint stagger lifecycle

Detail on the stagger's lifecycle (per planner Q7):

1. **First mount** (e.g., user selects a session and lands on the
   Skim tab via the action bar's tab control): the SkimView component
   mounts. Each `<SkimBlockRow>` enters the DOM with
   `animation: skim-block-fade-in ...` declared in CSS. The browser
   runs the keyframe immediately on the first paint cycle.
   Per-block `animation-delay` is set inline (React's `style`
   prop). Visual effect: blocks cascade from top to bottom over
   ~520 ms.

2. **Tab switch to a different tab + back** (e.g., Skim -> Transcript
   -> Skim): per the M2b keep-mounted contract, the SkimView's
   React subtree is NOT remounted. The CSS animation does NOT re-fire
   (the `animation` property hasn't changed; the browser does not
   replay an animation just because the parent's `display` toggled).
   Visual effect: returning to the Skim tab shows the blocks
   immediately at full opacity (no replay).

3. **`<details>` interaction** (e.g., user expands "Agent reaction"):
   the disclosure block-size animation fires (different keyframe
   target — `block-size`, not `opacity` + `transform`). The
   skim-block stagger does NOT replay. The `<details>` body content
   becomes visible via the native disclosure animation.

4. **`now` prop change** (e.g., the relative-time tick at the
   SessionView level): React re-renders SkimView with a new `now`
   prop. The CSS animation does NOT re-fire (no `animation` property
   change; no remount). Visual effect: relative-time labels inside
   the scoped TranscriptView update; everything else is static.

5. **New session selection** (e.g., user clicks a different row in
   the left pane): SessionView's `key={selectedRowKey}` triggers a
   full remount of the entire session pane. SkimView remounts;
   `skim-block-fade-in` keyframe fires fresh. Visual effect: the
   blocks for the new session cascade in.

The stagger keying mechanism uses M2b's existing `selectedRowKey`
boundary at the SessionView wrapper level. SkimView itself has NO
`key=` on its root.

## 9. Performance

### 9.1 Stagger budget

- Per-block keyframe length: 200 ms (`--motion-disclosure`).
- Per-block delay step: 40 ms.
- Maximum delay (cap): 8 × 40 = 320 ms.
- Total visible stagger window: 320 + 200 = **520 ms maximum** for
  the first 9 blocks; subsequent blocks all snap at 320 ms delay.

This sits within the human-noticeable window (~100-1000 ms) but
NOT in the janky-perception window (<50 ms feels too fast; >2000 ms
feels sluggish). 520 ms is editorial-pace, matching the Archive-room
"unhurried" aesthetic.

### 9.2 Reduced-motion users

Reduced-motion users see instant first-paint at full opacity. The
stagger is purely decorative — it does NOT carry information that
the user would miss without the animation.

### 9.3 No new keyframe cost

The stagger reuses `--motion-disclosure` (200 ms) as the keyframe
duration. It does NOT introduce a new motion duration token. The
keyframe `skim-block-fade-in` is M5-local (named to avoid collision
with M4's keyframes); the duration token is shared.

### 9.4 GPU-accelerated properties

`transform` and `opacity` are both GPU-composited in modern browsers
(Chromium 105+, Firefox 121+, Safari 15.4+). The keyframe targets
ONLY GPU-friendly properties; no layout-thrashing. Performance budget
holds even with N=50 skim blocks at first paint.

## 10. Spec acceptance gates

- §Motion table entries that M5 activates: row 9 (Skim-block stagger
  on first paint — NEW for M5; no other chunk has authorized this);
  row 3 (Disclosure expand/collapse — already authorized at M2b for
  tool_use Arguments; M5 extends to four user_turn/agent_only/oversized
  disclosures); row 9 (Truncation banner appearance — M4 already
  authorized; M5's banner reuses the recipe byte-equivalent).
- §Performance budget (lines 114-128): only `transform` + `opacity`
  + `background-color` allowed AND only on the surfaces listed in
  the spec table. M5 activates `opacity` + `transform: translateY`
  (#1) and `block-size` (#3 — the documented exemption). M5 does
  NOT animate `color`, `border-color`, `width`, `height`, `top`,
  `padding`, `margin`, hover `background-color`, or `transform` on
  any non-stagger surface.
- §Reduced-motion (lines 97-112): all M5 animations zero out via the
  global rule. Verified at chunk close.
- §Skim-block stagger cap (spec line 1100): "capped at 8 blocks".
  M5 ships `Math.min(idx, 8)` cap.

## 11. Token references

| Token                  | Value                                         |
|------------------------|-----------------------------------------------|
| `--motion-fast`        | 80 ms (NOT used by M5 — listed for reference) |
| `--motion-base`        | 120 ms                                        |
| `--motion-disclosure`  | 200 ms                                        |
| `--motion-pulse`       | 600 ms (M1a deep-link pulse — NOT M5's surface) |
| `--ease-standard`      | `cubic-bezier(0.4, 0, 0.2, 1)` (NOT used by M5) |
| `--ease-out`           | `cubic-bezier(0, 0, 0.2, 1)`                  |
| `--ease-in-out`        | `cubic-bezier(0.4, 0, 0.6, 1)`                |

No new motion tokens introduced for M5. Token count invariant:
`grep -cE '^\s*--' apps/frontend/src/styles/tokens.css` is unchanged
from M2a (= 83).

## 12. Codex pre-emption notes

The motion-budget catches codex is most likely to flag:

1. **`background-color` transition on a non-enumerated surface**.
   M2b r1 #2 caught this on `.session-conflict-badge`. M5's
   truncation banner has a STATIC color-mix background — only
   opacity animates. The user_turn 5 % accent tint is STATIC
   (color-mix resolved at mount). The oversized 4 px warn stripe is
   STATIC.

2. **Animated `color` / `border-color` on hover surfaces.** The
   "Expand to raw messages" hover, dismiss button hover, retry button
   hover are ALL INSTANT (no `transition` declarations). Codex should
   look for and find none in SkimView.css.

3. **Animated `transform` on skim block panels.** M5 panels do not
   transform. The skim-block stagger keyframe targets `transform:
   translateY` BUT that's the keyframe's own animation, not a
   separate `transform` transition. The `transform` value resolves to
   identity at the end of the keyframe (translateY(0)), where it
   stays for the panel's entire visible lifetime.

4. **Stagger replay on tab switch / `<details>` toggle.** M5 stagger
   is keyed at the SessionView's `key={selectedRowKey}` wrapper.
   Tab switch -> NO replay. `<details>` toggle -> NO replay. `now`
   prop change -> NO replay.

5. **Inline `style` writes that bypass the CSS budget.** The
   developer might be tempted to use `style={{ transition: "..." }}`
   on a per-block basis. M5 forbids this — all motion is declarative
   CSS in `SkimView.css`. The ONLY inline `style` use is
   `style={{ animationDelay: "${idx*40}ms" }}` (per-block delay only;
   the animation itself is declared in CSS).

If codex finds any of these, the developer fixes by removing the
violating declaration; no token additions, no exception requests.

## 13. Implementation guard

A small developer-facing self-check:

```bash
# Property-budget audit
rg -nE 'transition: (color|border-color|width|height|top|padding|margin|font-size|letter-spacing|line-height)' \
  apps/frontend/src/features/sessions/SkimView.css \
  apps/frontend/src/features/sessions/BoundaryRow.css
# Expected: empty.

# Background-color transition on skim panels (forbidden)
rg -n 'transition: background-color' \
  apps/frontend/src/features/sessions/SkimView.css | rg '\.skim-(block|user-panel|agent-only|oversized|summary-disabled)'
# Expected: empty.

# Transform transition on skim panels (forbidden)
rg -nE '\.skim-(block|user-panel|agent-only|oversized|summary-disabled).*transition: transform' \
  apps/frontend/src/features/sessions/SkimView.css
# Expected: empty.

# Animation count (must be exactly two: skim-block-fade-in + skim-banner-fade)
rg -nE '^\s*animation\s*:' apps/frontend/src/features/sessions/SkimView.css
# Expected: at most 2 declarations.

# Keyframe count (must be exactly two)
rg -nE '@keyframes ' apps/frontend/src/features/sessions/SkimView.css
# Expected: 2 (skim-block-fade-in + skim-banner-fade).

# Inline style usage on skim blocks (only animationDelay allowed)
rg -nE 'style=\{\{[^}]*\}\}' apps/frontend/src/features/sessions/SkimView.tsx | rg -v 'animationDelay'
# Expected: empty.
```

These commands are reproducible and codex-friendly.

## 14. Surface comparison: M4 vs M5

| Channel | M4 surface count | M5 surface count |
|---------|------------------|------------------|
| `opacity` keyframe authorizations | 1 (truncation banner) | 2 (truncation banner + skim-block stagger) |
| `transform` keyframe authorizations | 0 | 1 (skim-block stagger uses translateY) |
| `block-size` transition (inherited via global) | 3 (`tool_use` Arguments + `tool_result` Expand + parse-warnings) | 5 (Agent reaction + Expand to raw messages + agent-only + oversized + parse-warnings) |
| `background-color` transition authorizations | 0 | 0 |
| `color` / `border-color` transition authorizations | 0 | 0 |

M5 strictly adds ONE new motion authorization (the skim-block
stagger) on top of M4's surface set. The other M5 surfaces (banners,
disclosures) reuse M4's recipe byte-equivalent or the M2b global
rule.

End of motion.md.
