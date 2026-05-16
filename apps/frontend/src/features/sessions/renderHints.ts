// Phase 7c / M2 + M3 — render-hint layer.
//
// Pure transformation `Message[] + ParseWarning[] → RenderHint[]`.
// Consumed by `TranscriptView.tsx` ONCE per render. No React, no DOM,
// no parser logic — parsers stay pure data emitters (Resolved Decision
// #3 in `working/phase-7c.md`). Render-hint computation lives here so
// the render switch in `TranscriptView` can dispatch on a derived
// `kind` first and then on the underlying `MessageKind` for the
// inner content.
//
// Two-pass algorithm:
//
//   Pass 1 (M2): per-message hint emission — pairing (strict-adjacency
//     per design.md §15.1), task-lifecycle stamping on `system`
//     messages whose text starts with `task_started · turn ` or
//     `task_complete · turn ` (per design.md §6.5 + checklist #36),
//     4-bucket warning classification + per-message attachment. Emits
//     `lifecycle` / `standalone` / `boundary` / `warning-only`.
//
//   Pass 2 (M3 + polish-r2): tool-batch grouping. Detects runs of
//     N >= GROUP_THRESHOLD (=2 since polish-r2; was 3 at M1) consecutive
//     LIFECYCLE hints — regardless of tool name (mixed-tool grouping
//     since polish-r1) — and collapses each run into a single
//     `group-head` hint followed by N `group-member` hints. The buffer
//     is permissive about ONE kind of intervening standalone:
//     `assistant` standalones between lifecycle pairs do NOT break
//     the run; they become `group-text-member` entries pulled into
//     the group's expanded body. `system` is INTENTIONALLY excluded
//     from passthrough because the Phase 7b matrix routes Codex
//     errors (`event_msg.error`), telemetry, and lifecycle events to
//     `kind:"system"` — those rows need top-level visibility.
//     Delimiters that flush the run: `user`/`unknown`/`system`
//     standalones, `boundary`, `warning-only`, task-lifecycle stamped
//     standalones, orphan `tool_result` standalones, end-of-stream.
//     Below-threshold runs (count of lifecycle members < 2) stay as
//     individual lifecycle hints; below-threshold buffers also emit
//     any buffered passthrough standalones at top level (no group).
//     The aggregate-status calc on `group-head` consumes the same
//     `detectFailure` helper that the lifecycle-card chrome uses.
//
// Operational decisions locked in design.md §15:
//   §15.1 — strict-adjacency pairing.
//   §15.2 — GROUP_THRESHOLD = 3.
//   §15.3 — per-tool text-based failure detection.
//   §15.4 — 4-bucket warning classification table.
//   §15.7 — inline warning chip hidden until group-head expanded.
//
// @see working/phase-7c.md
// @see working/phase-7c/designs/design.md

import type {
  Message,
  MetaCategory,
  ParseWarning,
  ParseWarningSeverity,
  ParseWarningCategory,
} from "./parsers";

/**
 * Grouping threshold.
 *
 * Originally 3 at M1 design (design.md §15.2). Lowered to 2 by the
 * post-Phase-7c polish round 2 after real-session user feedback: a
 * 2-Edit pair in a typical Claude Code turn felt visually noisy and
 * the user requested it collapse into a group. With the narrow
 * passthrough policy (only `assistant` standalones pass through;
 * `system`, `user`, `unknown`, `tool_result`, and task-lifecycle
 * standalones are all delimiters — see `isPassthroughStandalone` in
 * `groupLifecycles` below), this matches the "tool batch" mental
 * model from real agent-iteration sessions while keeping Codex
 * errors/telemetry/lifecycle events at top level.
 *
 * Exported as a `const` so a documented change requires a progress-
 * log entry per Resolved Decision #5.
 */
export const GROUP_THRESHOLD = 2;

/**
 * Phase 7d — adjacent metadata-hint cluster threshold.
 *
 * Two or more consecutive `kind:"metadata"` hints collapse into a
 * single `metadata-cluster-head` + N `metadata-cluster-member` triple
 * rendered as a native `<details>` disclosure. Below threshold (count
 * of 1) the metadata hint stays at top level as a singleton hairline /
 * echo row.
 *
 * Value: **2** — matches Phase 7c polish-r2's lowered `GROUP_THRESHOLD`
 * (3 → 2) per user instruction in the Phase 7d design round-2 review.
 * Rationale recorded in `working/phase-7d/designs/design.md` §4.2 +
 * §11.3.
 *
 * Exported as a `const` so a documented change requires a progress-
 * log entry per Resolved Decision #5.
 */
export const METADATA_COLLAPSE_THRESHOLD = 2;

/** Task-lifecycle text prefixes emitted by the Codex parser. */
const TASK_STARTED_PREFIX = "task_started · turn ";
const TASK_COMPLETE_PREFIX = "task_complete · turn ";

/**
 * One inline warning attached to a `RenderHint`. Carries the
 * classification bucket so the renderer can pick the chip recipe.
 */
export type InlineWarning = {
  reason: string;
  severity: ParseWarningSeverity;
  category: ParseWarningCategory;
  classification:
    | "render-normally"
    | "collapse-by-default"
    | "hide-with-inspect"
    | "warning-only";
};

/**
 * Aggregate status surfaced on `group-head` hints (M3). Defined here
 * so the M2 type surface is byte-aligned with the design contract.
 */
export type GroupStatus =
  | { kind: "all-success"; total: number }
  | { kind: "mixed"; total: number; failed: number }
  | { kind: "in-flight"; total: number; pending: number }
  | { kind: "all-failed"; total: number };

/**
 * Per-message render-dispatch metadata. The renderer switches on
 * `RenderHint.kind` first, then on `Message.kind` for the inner body.
 *
 * `group-head` and `group-member` are M3's emission targets; they are
 * declared on the union so M3 can layer grouping without rewriting M2.
 *
 * `taskLifecycle` (per design.md §6.5 + checklist #36) attaches to
 * the existing `standalone` variant — the underlying `Message.kind`
 * stays `system`; the discriminator lives on the hint.
 */
export type RenderHint =
  | {
      kind: "standalone";
      messageIndex: number;
      warnings?: InlineWarning[];
      taskLifecycle?: "started" | "complete";
    }
  | {
      kind: "lifecycle";
      messageIndex: number;
      pairWithIndex: number | null;
      warnings?: InlineWarning[];
    }
  | {
      kind: "group-head";
      messageIndices: number[];
      /**
       * First member's tool name. Retained for back-compat with the
       * single-tool grouping shape; renderer should prefer `toolNames`
       * for the display string (handles mixed-tool runs).
       */
      toolName: string;
      /**
       * Distinct tool names of the grouped lifecycles in
       * first-appearance order. Mixed-tool grouping (post-Phase-7c
       * polish) collapses ANY consecutive lifecycles into one group,
       * regardless of tool name. For single-tool groups this is a
       * 1-element array; for mixed groups the renderer joins these
       * for display ("Edit, Bash, Read · N calls").
       */
      toolNames: string[];
      aggregateStatus: GroupStatus;
      warnings?: InlineWarning[];
    }
  | {
      kind: "group-member";
      messageIndex: number;
      pairWithIndex: number | null;
      groupHeadIndex: number;
      warnings?: InlineWarning[];
    }
  | {
      /**
       * A non-lifecycle hint pulled into the group's expanded body
       * (post-Phase-7c polish round 2). The grouping pass extends the
       * lifecycle run across intervening `assistant` and `system`
       * standalones — they don't break the run; they render inside
       * the group's `<details>` body in original order. This matches
       * how real agent sessions look: a turn's tool calls are
       * interleaved with assistant commentary, and the user wants
       * the WHOLE batch collapsible as one unit.
       *
       * Reset (delimiter) hints — `user`/`unknown` standalones,
       * `boundary`, `warning-only`, task-lifecycle stamped standalones,
       * orphan `tool_result` with stray chip — do NOT become text
       * members; they flush the buffer.
       */
      kind: "group-text-member";
      messageIndex: number;
      groupHeadIndex: number;
      warnings?: InlineWarning[];
    }
  | { kind: "boundary"; messageIndex: number }
  | { kind: "warning-only"; messageIndex: number; warnings: InlineWarning[] }
  | {
      /**
       * Phase 7d — a single metadata Message rendered as a marginalia
       * hairline (or echo glyph row for `category === "echo"`). Below
       * the cluster threshold (METADATA_COLLAPSE_THRESHOLD); multiple
       * adjacent metadata hints collapse into `metadata-cluster-head`
       * + N `metadata-cluster-member` via the third pass in
       * `renderHints()`.
       */
      kind: "metadata";
      messageIndex: number;
      metadata: MetadataHint;
    }
  | {
      /**
       * Phase 7d — head of an adjacent-metadata cluster. Renders as a
       * native `<details class="msg-metadata-cluster">` whose summary
       * says "N metadata events" and whose body re-renders every
       * member from `members[]` in original order.
       */
      kind: "metadata-cluster-head";
      messageIndices: number[];
      members: MetadataHint[];
    }
  | {
      /**
       * Phase 7d — cluster body member. Inert at the top level
       * (`renderTopLevelHints` skips these; the cluster head re-renders
       * the body from its own `members[]`). The discriminator + the
       * `clusterHeadIndex` back-pointer let tests and future skim-view
       * extensions reason about cluster membership without re-walking
       * the stream.
       */
      kind: "metadata-cluster-member";
      messageIndex: number;
      clusterHeadIndex: number;
      metadata: MetadataHint;
    };

/**
 * Phase 7d — pre-computed metadata payload carried on `kind:"metadata"`
 * (and cluster-head / cluster-member) hints. The renderer treats
 * `display` and `ariaLabel` as opaque strings; the formula lives in
 * `buildMetadataHint` below so test stability is owned by a single
 * site.
 *
 * - `category`: drives the per-category visual recipe (font, prefix
 *   glyph, separator) in `TranscriptView.css`'s
 *   `.msg-metadata[data-meta-category="..."]` selectors.
 * - `display`: the inline label/value text. For `category === "echo"`
 *   this is the empty string (the echo register renders no text
 *   beyond the `↺` glyph; the back-pointer surfaces via `ariaLabel`).
 * - `ariaLabel`: screen-reader-friendly label.
 * - `echoOf`: only set when `category === "echo"`; mirrors
 *   `Message.echoOf` for renderer convenience.
 */
export type MetadataHint = {
  category: MetaCategory;
  display: string;
  ariaLabel: string;
  /**
   * Truncated raw NDJSON line (≤ 1024 chars) for the hover-tooltip
   * affordance on hairline rows per design.md acceptance item 23. Set
   * for every metadata variant including echo (where the tooltip
   * augments the back-pointer with the source-line excerpt).
   */
  raw: string;
  echoOf?: { lineOrdinal: number; canonicalKind: "user" | "assistant" };
};

const METADATA_RAW_TOOLTIP_MAX = 1024;

/**
 * Classify a single `ParseWarning` into one of the four buckets per
 * design.md §15.4. The mapping is a literal table; the function is
 * total over the (severity × category) cross product.
 *
 * | severity | category          | bucket                |
 * |----------|-------------------|-----------------------|
 * | error    | (any)             | render-normally       |
 * | warning  | schema / payload  | render-normally       |
 * | warning  | lexer / timestamp | collapse-by-default   |
 * | warning  | meta              | warning-only          |
 * | info     | (any)             | hide-with-inspect     |
 */
export function classifyWarning(
  warning: ParseWarning,
):
  | "render-normally"
  | "collapse-by-default"
  | "hide-with-inspect"
  | "warning-only" {
  if (warning.severity === "error") return "render-normally";
  if (warning.severity === "info") return "hide-with-inspect";
  // warning.severity === "warning"
  switch (warning.category) {
    case "schema":
    case "payload":
      return "render-normally";
    case "lexer":
    case "timestamp":
      return "collapse-by-default";
    case "meta":
      return "warning-only";
    default: {
      // Exhaustiveness: a future ParseWarningCategory addition
      // breaks the build here until the mapping above is extended.
      const _exhaustive: never = warning.category;
      void _exhaustive;
      return "render-normally";
    }
  }
}

/**
 * Per-tool failure detection over `tool_result.text` per design.md
 * §15.3. Conservative substring/regex match — false positives are
 * acceptable (the chrome-text label "failed" is a hint; the user
 * reading the result body sees the real content).
 *
 * Consumed by the M3 aggregate-status calc. Exported so M3 can wire
 * it into `group-head` emission without re-deriving the heuristic.
 *
 * Matched signals (all case-insensitive unless noted):
 *   - Claude Code     : `"is_error":true` / `"is_error": true`.
 *   - MCP convention  : `"isError":true`.
 *   - Codex exec      : `exit_code: N` where N != 0 (regex).
 *   - Codex apply_patch: `"success":false`, `status: failed`,
 *                        `status: error`.
 *   - Codex mcp       : `"isError":true`, `status: error`.
 *   - Codex web_search: (no observed failure signal in corpus).
 */
export function detectFailure(msg: Message): boolean {
  if (msg.kind !== "tool_result") return false;
  const text = msg.text;
  const lower = text.toLowerCase();
  if (lower.includes('"is_error":true') || lower.includes('"is_error": true')) {
    return true;
  }
  if (lower.includes('"iserror":true') || lower.includes('"iserror": true')) {
    return true;
  }
  if (lower.includes('"success":false') || lower.includes('"success": false')) {
    return true;
  }
  // Codex exec exit_code: N where N != 0.
  // The regex is case-sensitive on the field name (`exit_code`) but
  // tolerant of `:`/`=` separators and quoting around the value.
  if (/exit_code["']?\s*[:=]\s*([1-9]\d*)/.test(text)) return true;
  // `status: failed` / `status: error` at line start (any line).
  if (/(^|\n)\s*status\s*[:=]\s*(failed|error)\b/i.test(text)) return true;
  return false;
}

/**
 * Pure render-hint computation. One `RenderHint` per input `Message`.
 *
 * Algorithm:
 *   1. Build an `InlineWarning[]` per message-index from the input
 *      `ParseWarning[]`. Warnings without `messageIndex` are dropped
 *      from inline routing — they still surface on the session
 *      banner (banner stays loud per Resolved Decision #6).
 *   2. Linear scan over `messages`. For each message decide its
 *      `RenderHint.kind`:
 *        - `boundary` → boundary.
 *        - `tool_use` → lifecycle; pairWithIndex is set to the next
 *          message's index iff the next message is a `tool_result`
 *          AT messageIndex + 1 (strict adjacency per design.md
 *          §15.1).
 *        - `tool_result` → if the previous message at index - 1 was
 *          a `tool_use` that paired forward to us, we are consumed
 *          by that lifecycle and produce no hint of our own — the
 *          loop skips us. Otherwise we are an orphan tool_result and
 *          emit a `standalone` hint with an attached `stray-result`
 *          warning (classified as `render-normally`).
 *        - `system` (text starts with `task_started · turn `
 *          or `task_complete · turn `) → standalone with
 *          `taskLifecycle: "started" | "complete"`.
 *        - everything else → standalone.
 *   3. After all emissions, route any `warning-only` warnings whose
 *      messageIndex falls inside the message stream onto a
 *      `warning-only` hint — but ONLY when the underlying message
 *      otherwise renders as `standalone`. (Per design.md §15.4 +
 *      checklist #20: `warning-only` messages render NO chip on the
 *      card; the warning is banner-only. The hint EXISTS so the
 *      renderer can suppress its message body and let the banner
 *      carry the surface.)
 *
 * Bounded cost: linear in `messages.length` + linear in
 * `warnings.length`. No quadratic scans. Memoizable in
 * `TranscriptView` via `useMemo`.
 */
export function renderHints(
  messages: Message[],
  warnings: ParseWarning[],
): RenderHint[] {
  if (messages.length === 0) return [];

  // 1) Bucket warnings by messageIndex. Each warning attaches once.
  const inlineByIndex = new Map<number, InlineWarning[]>();
  for (const w of warnings) {
    if (w.messageIndex === undefined) continue;
    if (w.messageIndex < 0 || w.messageIndex >= messages.length) continue;
    const inline: InlineWarning = {
      reason: w.reason,
      severity: w.severity,
      category: w.category,
      classification: classifyWarning(w),
    };
    const arr = inlineByIndex.get(w.messageIndex);
    if (arr) arr.push(inline);
    else inlineByIndex.set(w.messageIndex, [inline]);
  }

  // -------------------------------------------------------------------------
  // Pairing rule: strict-adjacency for BOTH tools
  // -------------------------------------------------------------------------
  // The Phase 7c task spec §Data Model "Pairing rules" describes
  // pairing as `tool_use_id` linkage for Claude Code (and adjacency
  // for Codex). The M1 design loop superseded that description: see
  // `working/phase-7c/designs/design.md` §15.1 ("Pairing mode: strict-
  // adjacency"). The decision was driven by the Phase 7b real-corpus
  // sweep, which found ZERO divergent cases across 408 Claude Code
  // sessions + 737 Codex sessions — every tool_use was followed
  // immediately by its tool_result at messageIndex+1.
  //
  // This implementation respects the M1 decision: pairing is strict-
  // adjacency for both tools, with no id-based fallback. The Claude
  // Code parser still preserves `tool_use_id` (it stores the id on
  // `tool_result.toolName` per `parsers/claude_code.ts`), so a future
  // drift could add an id-based fallback here without changing the
  // public `RenderHint` API.
  //
  // Authoritative sources for the strict-adjacency decision:
  //   - working/phase-7c/designs/design.md §15.1
  //   - progress/phase-7c.progress.md UI/UX Design Log + Review Log
  //
  // 2) Pre-compute the pair lookup. For each tool_use at index i,
  // pairWith[i] is i+1 iff messages[i+1] exists, is a tool_result,
  // and i+1 is strictly adjacent. We rely on messageIndex being
  // sequential (Phase 5 contract: messageIndex is the 0-based
  // sequential position; per types.ts:48-49).
  const pairWith: Array<number | null> = new Array(messages.length).fill(null);
  const consumedByPrev: boolean[] = new Array(messages.length).fill(false);
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (msg.kind !== "tool_use") continue;
    const next = messages[i + 1];
    if (!next) continue;
    if (next.kind !== "tool_result") continue;
    // Strict adjacency by sequential messageIndex. The Phase 5 parser
    // contract guarantees messageIndex monotonicity, so messages[i+1]
    // IS the next message in the stream — there is no implicit
    // skip-list. design.md §15.1: tool_use_id linkage is not
    // re-derived here (Claude Code's parser stores the id on the
    // tool_result.toolName only); strict adjacency holds in the
    // corpus and is the load-bearing pairing rule.
    pairWith[i] = next.messageIndex;
    consumedByPrev[i + 1] = true;
  }

  // 3) Emit one RenderHint per message (skipping consumed-tool_result
  // positions so the lifecycle hint owns both halves).
  const hints: RenderHint[] = [];

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const attached = inlineByIndex.get(msg.messageIndex);

    if (consumedByPrev[i]) {
      // This tool_result was absorbed by its preceding tool_use's
      // lifecycle hint. Skip emission; the lifecycle owns the
      // visual. (If this tool_result carries warnings, they were
      // attached to the lifecycle via index-i; the lifecycle hint
      // below will MERGE them via the merge step.)
      continue;
    }

    if (msg.kind === "boundary") {
      hints.push({ kind: "boundary", messageIndex: msg.messageIndex });
      continue;
    }

    if (msg.kind === "metadata") {
      // Phase 7d — emit one metadata hint per metadata Message. The
      // tool-batch grouping pass (Pass 2) treats `kind !== "standalone"`
      // hints as delimiters, so the metadata hint flushes any open
      // lifecycle buffer (see §5 in working/phase-7d/designs/design.md).
      // The cluster pass (Pass 3, below) folds adjacent runs of N ≥
      // METADATA_COLLAPSE_THRESHOLD into a single cluster head.
      hints.push({
        kind: "metadata",
        messageIndex: msg.messageIndex,
        metadata: buildMetadataHint(msg),
      });
      continue;
    }

    if (msg.kind === "tool_use") {
      // Lifecycle (paired or orphan). When paired, also pull in any
      // warnings attached to the tool_result half so the chip
      // surface is unified on the lifecycle card.
      const partnerIndex = pairWith[i];
      let merged: InlineWarning[] | undefined = attached
        ? [...attached]
        : undefined;
      if (partnerIndex !== null) {
        const partnerWarnings = inlineByIndex.get(partnerIndex);
        if (partnerWarnings) {
          merged = merged
            ? merged.concat(partnerWarnings)
            : [...partnerWarnings];
        }
      }
      const hint: RenderHint = {
        kind: "lifecycle",
        messageIndex: msg.messageIndex,
        pairWithIndex: partnerIndex,
      };
      if (merged && merged.length > 0) hint.warnings = merged;
      hints.push(hint);
      continue;
    }

    if (msg.kind === "tool_result") {
      // Orphan tool_result — no preceding adjacent tool_use claimed
      // us. Emit standalone with an inline `stray-result` warning at
      // `render-normally` so the chip is visible. Merge with any
      // already-attached warnings from the parser.
      const stray: InlineWarning = {
        reason: "stray tool_result — no preceding tool_use",
        severity: "warning",
        category: "payload",
        classification: "render-normally",
      };
      const merged: InlineWarning[] = attached
        ? [...attached, stray]
        : [stray];
      hints.push({
        kind: "standalone",
        messageIndex: msg.messageIndex,
        warnings: merged,
      });
      continue;
    }

    // Empty-body user/assistant suppression (post-Phase-7c polish).
    //
    // The Codex parser emits an empty-text `assistant` / `user` row
    // when the source event_msg payload is missing its `message` /
    // `text` field (event_msg.user_message, event_msg.agent_message,
    // event_msg.agent_reasoning all share this shape per the Phase 7b
    // audit at `parsers/codex.ts:393-473`). The parser also emits a
    // `warning/payload` warning, but the warning carries NO
    // messageIndex — it surfaces only through the session banner, not
    // through inline routing. Without this suppression the transcript
    // would render the empty row as a bare "Assistant · 8d ago"
    // header card — pure visual noise on top of the banner that
    // already explains the anomaly.
    //
    // Fix: drop empty-body user/assistant from the hint stream
    // entirely. The session banner remains the source of truth for
    // the parser anomaly. If any warning happens to be inline-routed
    // at this messageIndex (theoretically possible if a parser path
    // ever attaches one), surface it as `warning-only` so the user
    // sees the chip-less banner notice — never a blank card.
    //
    // `unknown` rows are intentionally NOT suppressed: they have
    // their own "Unrecognized line:" prefix and the user benefits
    // from seeing the raw shape that confused the parser.
    if (
      (msg.kind === "user" || msg.kind === "assistant") &&
      msg.text.trim() === ""
    ) {
      if (attached && attached.length > 0) {
        hints.push({
          kind: "warning-only",
          messageIndex: msg.messageIndex,
          warnings: attached,
        });
      }
      continue;
    }

    // system / user / assistant / unknown → standalone (with
    // task-lifecycle stamping for the two known Codex system texts).
    let taskLifecycle: "started" | "complete" | undefined;
    if (msg.kind === "system") {
      if (msg.text.startsWith(TASK_STARTED_PREFIX)) {
        taskLifecycle = "started";
      } else if (msg.text.startsWith(TASK_COMPLETE_PREFIX)) {
        taskLifecycle = "complete";
      }
    }

    // PRECEDENCE: task-lifecycle stamping wins over warning-only
    // short-circuit. A `task_started · turn ...` / `task_complete ·
    // turn ...` system message is a chapter marker — the chapter
    // marker must never be silently swallowed by a `warning/meta`
    // warning that happens to land on the same message index. The
    // attached warnings still propagate through `hint.warnings` so
    // (a) the session banner remains loud per Resolved Decision #6,
    // and (b) `TaskLifecycleCard` can decide what (if anything) to
    // render inline. (Current `TaskLifecycleCard` renders no inline
    // chip for warning-only warnings — `InlineWarnings` drops the
    // bucket defensively — so the user-visible effect is: chapter
    // marker survives, banner still shows the warning.)
    if (taskLifecycle) {
      const hint: RenderHint = {
        kind: "standalone",
        messageIndex: msg.messageIndex,
        taskLifecycle,
      };
      if (attached && attached.length > 0) hint.warnings = attached;
      hints.push(hint);
      continue;
    }

    // warning-only routing: when the ONLY warnings attached to this
    // message classify as `warning-only`, emit `warning-only` so the
    // renderer can suppress the message body. When a mix is
    // attached, keep `standalone` (the non-warning-only chips still
    // need to render on the card).
    if (attached && attached.length > 0) {
      const allWarningOnly = attached.every(
        (w) => w.classification === "warning-only",
      );
      if (allWarningOnly) {
        hints.push({
          kind: "warning-only",
          messageIndex: msg.messageIndex,
          warnings: attached,
        });
        continue;
      }
    }

    const hint: RenderHint = {
      kind: "standalone",
      messageIndex: msg.messageIndex,
    };
    if (attached && attached.length > 0) hint.warnings = attached;
    hints.push(hint);
  }

  // -------------------------------------------------------------------------
  // Pass 2 (M3 + post-7c polish): mixed-tool grouping
  // -------------------------------------------------------------------------
  // Detect runs of N >= GROUP_THRESHOLD consecutive `lifecycle` hints —
  // REGARDLESS of tool name. Each run collapses to one `group-head` hint
  // followed by N `group-member` hints (in order). Below-threshold
  // runs stay as individual `lifecycle` hints; a `boundary` hint in
  // the stream resets the run; any non-lifecycle hint (including
  // `standalone` / `warning-only`) also resets the run.
  //
  // Grouping operates on `lifecycle` hints ONLY — never on
  // `standalone` / `boundary` / `warning-only`. M2's per-hint
  // attachments (warnings, pairing) survive into the `group-member`
  // hints unchanged. Inline warnings on a member surface only inside
  // the expanded group per design.md §15.7.
  //
  // Mixed-tool grouping (post-Phase-7c polish): the original M3
  // implementation required all members of a run to share a tool
  // name. Real-session usage showed this fragmented the surface
  // — alternating Edit/Bash/Read sequences (typical of an agent
  // iterating on a task) stayed un-grouped. The polish patch drops
  // the same-tool predicate: any consecutive lifecycle hints group
  // once they hit threshold. The `group-head` carries `toolNames`
  // (distinct names in first-appearance order) so the renderer can
  // display the tool-type breakdown.
  // Pass 2 — tool-batch grouping. Metadata hints are delimiters by
  // virtue of `kind !== "standalone"` (the buffer flushes around them).
  const grouped = groupLifecycles(hints, messages);
  // Pass 3 — adjacent-metadata clustering (Phase 7d). Folds runs of
  // N ≥ METADATA_COLLAPSE_THRESHOLD into a single cluster-head plus
  // members.
  return clusterMetadata(grouped);
}

/**
 * Phase 7d — Pass 3: collapse adjacent runs of `kind:"metadata"` hints
 * into a single `metadata-cluster-head` followed by N
 * `metadata-cluster-member` hints. Runs of length 1 pass through as
 * singleton `metadata` hints unchanged.
 *
 * Runs at top level (post-Pass-2). Any non-metadata hint breaks the
 * run; end-of-stream flushes.
 */
function clusterMetadata(hints: RenderHint[]): RenderHint[] {
  if (hints.length === 0) return hints;
  const out: RenderHint[] = [];
  let buffer: Array<Extract<RenderHint, { kind: "metadata" }>> = [];

  const flush = () => {
    if (buffer.length === 0) return;
    if (buffer.length < METADATA_COLLAPSE_THRESHOLD) {
      // Below threshold — emit as singletons unchanged.
      for (const h of buffer) out.push(h);
    } else {
      const messageIndices = buffer.map((h) => h.messageIndex);
      const members = buffer.map((h) => h.metadata);
      const headIndex = buffer[0].messageIndex;
      out.push({
        kind: "metadata-cluster-head",
        messageIndices,
        members,
      });
      // Skip the head's own member entry (the head's `members[]` already
      // carries its content); emit one cluster-member per buffer entry
      // AFTER the head so the hint stream's positional alignment with
      // `messages[]` is preserved.
      for (const h of buffer) {
        out.push({
          kind: "metadata-cluster-member",
          messageIndex: h.messageIndex,
          clusterHeadIndex: headIndex,
          metadata: h.metadata,
        });
      }
    }
    buffer = [];
  };

  for (const hint of hints) {
    if (hint.kind === "metadata") {
      buffer.push(hint);
      continue;
    }
    flush();
    out.push(hint);
  }
  flush();
  return out;
}

/**
 * Phase 7d — compute the `MetadataHint` for one `kind:"metadata"`
 * Message. The parser pre-formats `Message.text` for hairline
 * categories per `working/phase-7d/designs/design.md` §3.4; this
 * helper layers `ariaLabel` + the echo-row empty-display rule on
 * top.
 *
 * For `metaCategory === "echo"`:
 *   - `display` is the empty string (the echo register renders no
 *     inline text; the `↺` glyph carries the presence cue).
 *   - `ariaLabel` reads "Echo: duplicate of canonical {user|assistant}
 *     message at line N" per design §6.4. When `echoOf.lineOrdinal` is
 *     missing, the label degrades to "(line unknown)" per design §6.5.
 *
 * For every other category:
 *   - `display` is the parser-formatted strip (e.g. `"permission mode
 *     → default"`).
 *   - `ariaLabel` reads "Metadata: {display}" so screen readers
 *     announce the row contents with a category-neutral prefix.
 */
function buildMetadataHint(msg: Message): MetadataHint {
  const category: MetaCategory = msg.metaCategory ?? "control";
  const raw =
    msg.raw.length > METADATA_RAW_TOOLTIP_MAX
      ? msg.raw.slice(0, METADATA_RAW_TOOLTIP_MAX) + "…"
      : msg.raw;
  if (category === "echo") {
    const echoOf = msg.echoOf;
    const canonical =
      echoOf?.canonicalKind === "assistant" ? "assistant" : "user";
    const line =
      echoOf && typeof echoOf.lineOrdinal === "number"
        ? `at line ${echoOf.lineOrdinal}`
        : "(line unknown)";
    return {
      category,
      display: "",
      ariaLabel: `Echo: duplicate of canonical ${canonical} message ${line}`,
      raw,
      ...(echoOf ? { echoOf } : {}),
    };
  }
  return {
    category,
    display: msg.text,
    ariaLabel: `Metadata: ${msg.text}`,
    raw,
  };
}

/**
 * Resolve the tool name from a `lifecycle` hint. Reads the underlying
 * tool_use `Message.toolName`; orphan lifecycles (`pairWithIndex: null`)
 * still carry a toolName from the parser. Returns `null` if the
 * underlying message is missing or has no toolName (defensive — should
 * not happen with the M2 emit invariants).
 */
function lifecycleToolName(
  hint: Extract<RenderHint, { kind: "lifecycle" }>,
  messagesByIndex: Map<number, Message>,
): string | null {
  const msg = messagesByIndex.get(hint.messageIndex);
  if (!msg) return null;
  if (msg.kind !== "tool_use") return null;
  return msg.toolName ?? null;
}

/**
 * Compute the `GroupStatus` for a run of `lifecycle` hints. Per
 * design.md §15.3 + §4.3.
 *
 * - `in-flight`: any member is orphan (`pairWithIndex: null`).
 * - Otherwise, scan paired tool_result messages via `detectFailure`:
 *   - all succeeded → `all-success`.
 *   - all failed    → `all-failed`.
 *   - mixed         → `mixed` with `failed` count.
 */
function computeAggregateStatus(
  members: Array<Extract<RenderHint, { kind: "lifecycle" }>>,
  messagesByIndex: Map<number, Message>,
): GroupStatus {
  const total = members.length;
  let pending = 0;
  let failed = 0;
  let succeeded = 0;
  for (const m of members) {
    if (m.pairWithIndex === null) {
      pending += 1;
      continue;
    }
    const resultMsg = messagesByIndex.get(m.pairWithIndex);
    if (!resultMsg || resultMsg.kind !== "tool_result") {
      // Defensive: M2's pairing only sets `pairWithIndex` when the
      // adjacent message IS a tool_result, so this branch is theoretical.
      pending += 1;
      continue;
    }
    if (detectFailure(resultMsg)) failed += 1;
    else succeeded += 1;
  }
  if (pending > 0) return { kind: "in-flight", total, pending };
  if (failed === 0) return { kind: "all-success", total };
  if (succeeded === 0) return { kind: "all-failed", total };
  return { kind: "mixed", total, failed };
}

/**
 * Pass 2 — "tool-batch" grouping.
 *
 * Collapse a run of consecutive `lifecycle` hints (mixed-tool allowed
 * since the post-Phase-7c polish round 1) PLUS any intervening
 * `assistant` / `system` standalones into a single `group-head` +
 * ordered members. This matches the real-session shape produced by
 * the Claude Code and Codex parsers: each assistant turn emits
 * `assistant(text)` Messages interleaved with `tool_use`/`tool_result`
 * Messages, so a back-to-back-Edit batch in the source JSONL is NOT
 * back-to-back in the parser's typed-message stream — there's an
 * assistant-text Message between every tool-use pair (it's a separate
 * `content[]` item carried inside the same assistant record).
 *
 * Algorithm:
 *   1. Walk `hints` linearly.
 *   2. Buffer ANY of:
 *        - `lifecycle` hint (counts toward the "N calls" badge)
 *        - `standalone` hint whose underlying message is `assistant`
 *          or `system` AND has no `taskLifecycle` stamp (passthrough
 *          text — appears in the group's expanded body but does NOT
 *          count toward "N calls")
 *   3. Flush on any other hint kind (delimiters):
 *        - `boundary`
 *        - `warning-only`
 *        - `standalone` with `user`/`unknown` underlying msg.kind
 *        - `standalone` with `taskLifecycle` stamp (chapter marker)
 *        - `standalone` representing an orphan `tool_result` (the
 *          parser path attaches a `stray tool_result` chip; treat as
 *          delimiter because it represents a structural anomaly).
 *      The delimiter itself is emitted as-is after the flush.
 *   4. On flush: count buffered LIFECYCLE hints. If count >=
 *      GROUP_THRESHOLD (=2), emit one `group-head` + ordered members
 *      (lifecycles as `group-member`, standalones as
 *      `group-text-member`). Otherwise emit the buffer's contents
 *      unchanged.
 *
 * The lifecycle count drives the "N calls" badge; the toolNames list
 * is built from the LIFECYCLE buffer entries only (first-appearance
 * order, distinct). The expanded body shows ALL members in their
 * original interleaved order — agent commentary surfaces alongside
 * each tool call so the reasoning trail stays auditable.
 *
 * Linear in `hints.length`.
 */
function groupLifecycles(
  hints: RenderHint[],
  messages: Message[],
): RenderHint[] {
  if (hints.length === 0) return hints;
  const messagesByIndex = new Map<number, Message>();
  for (const m of messages) messagesByIndex.set(m.messageIndex, m);

  const out: RenderHint[] = [];

  /**
   * Determine if a `standalone` hint is "passthrough" — i.e. it can
   * sit inside a tool batch without flushing the run.
   *
   * Only `assistant` text (the agent's running commentary) qualifies.
   * `system` kind is INTENTIONALLY excluded even though it's
   * structurally similar to assistant text, because the Phase 7b
   * parser-event matrix maps several Codex error/telemetry/lifecycle
   * events to `kind:"system"` (notably `event_msg.error` per
   * `codex.ts:681`, `event_msg.turn_aborted`, `event_msg.entered_review_mode`,
   * `event_msg.exited_review_mode`, collaboration events, etc). Those
   * messages need top-level visibility — hiding them inside a
   * collapsed group would suppress error and lifecycle signal the
   * user must see. (codex external review caught this gap; matrix
   * audit table in `docs/features/parser-event-support.md`.)
   *
   * `tool_result` standalones are orphan-stray cases — they carry a
   * visible "stray tool_result" chip and must remain at top level.
   *
   * `user` and `unknown` standalones are normal delimiters.
   *
   * Task-lifecycle stamped standalones (chapter markers) reset the
   * batch by design.
   */
  function isPassthroughStandalone(
    hint: Extract<RenderHint, { kind: "standalone" }>,
  ): boolean {
    if (hint.taskLifecycle) return false;
    const msg = messagesByIndex.get(hint.messageIndex);
    if (!msg) return false;
    // Only `assistant` text qualifies. `system` is intentionally
    // excluded so Codex errors/telemetry/lifecycle events stay loud.
    return msg.kind === "assistant";
  }

  // Buffer accumulates `lifecycle` and passthrough-`standalone` hints
  // in source order. Order is preserved so the expanded group body
  // renders the agent's commentary interleaved with its tool calls.
  type Bufferable =
    | Extract<RenderHint, { kind: "lifecycle" }>
    | Extract<RenderHint, { kind: "standalone" }>;
  let buffer: Bufferable[] = [];

  function flush() {
    if (buffer.length === 0) return;
    const lifecycleMembers = buffer.filter(
      (h): h is Extract<RenderHint, { kind: "lifecycle" }> =>
        h.kind === "lifecycle",
    );
    if (lifecycleMembers.length >= GROUP_THRESHOLD) {
      const aggregateStatus = computeAggregateStatus(
        lifecycleMembers,
        messagesByIndex,
      );
      // Canonical head index = first LIFECYCLE member's messageIndex
      // (so the bound check in renderTopLevelHints aligns with what
      // group-member entries declare via `groupHeadIndex`).
      const groupHeadIndex = lifecycleMembers[0].messageIndex;
      const messageIndices = lifecycleMembers.map((h) => h.messageIndex);
      // Distinct tool names from LIFECYCLE buffer entries only, in
      // first-appearance order. Passthrough standalones don't
      // contribute to the toolNames list.
      const toolNames: string[] = [];
      const seen = new Set<string>();
      let primary: string | null = null;
      for (const h of lifecycleMembers) {
        const name = lifecycleToolName(h, messagesByIndex);
        if (name === null) continue;
        if (primary === null) primary = name;
        if (!seen.has(name)) {
          seen.add(name);
          toolNames.push(name);
        }
      }
      out.push({
        kind: "group-head",
        messageIndices,
        toolName: primary ?? "",
        toolNames,
        aggregateStatus,
      });
      // Emit ALL buffered hints (lifecycle + passthrough) in order.
      // Lifecycles become `group-member`; passthrough standalones
      // become `group-text-member`.
      for (const h of buffer) {
        if (h.kind === "lifecycle") {
          const member: Extract<RenderHint, { kind: "group-member" }> = {
            kind: "group-member",
            messageIndex: h.messageIndex,
            pairWithIndex: h.pairWithIndex,
            groupHeadIndex,
          };
          if (h.warnings && h.warnings.length > 0) member.warnings = h.warnings;
          out.push(member);
        } else {
          const textMember: Extract<
            RenderHint,
            { kind: "group-text-member" }
          > = {
            kind: "group-text-member",
            messageIndex: h.messageIndex,
            groupHeadIndex,
          };
          if (h.warnings && h.warnings.length > 0)
            textMember.warnings = h.warnings;
          out.push(textMember);
        }
      }
    } else {
      // Below threshold — emit buffer as-is (lifecycles + standalones
      // both stay as top-level hints).
      for (const h of buffer) out.push(h);
    }
    buffer = [];
  }

  for (const hint of hints) {
    if (hint.kind === "lifecycle") {
      buffer.push(hint);
      continue;
    }
    if (hint.kind === "standalone" && isPassthroughStandalone(hint)) {
      buffer.push(hint);
      continue;
    }
    // Delimiter: flush the run, then emit this hint as-is.
    flush();
    out.push(hint);
  }
  flush();
  return out;
}
