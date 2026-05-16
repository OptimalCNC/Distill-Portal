// Transcript tab body for the Phase-5 right-pane Tabs shell.
//
// Phase 5 / Milestone 4 — first visible UI surface that consumes the
// M3 parser pipeline (`useParsedSession` from M3b → typed messages
// from M3a). Renders the chronological message list with per-kind
// shells (user / assistant / tool_use / tool_result / system /
// boundary / unknown), the truncation banner, the parse-warnings
// dismissible disclosure, and the long-tool_result collapse. All
// copy is verbatim from the spec at `working/phase-5.md` lines
// 699–717 (frozen at 05467ad).
//
// Architecture (per design.md §2):
//   - Top-level state-discriminator switches on
//     `useParsedSession(row).state`. `idle | no_raw | loading | error`
//     each render a single muted line; `success | truncated` mount
//     the `<TranscriptBody>` subtree.
//   - `<TranscriptBody>` mounts the truncation banner (only when
//     `state === "truncated"`), the parse-warnings disclosure (only
//     when warnings.length > 0 AND not yet dismissed), and the
//     per-message stream as an `<ol>`.
//   - Each `<MessageRow>` switches on `msg.kind` and emits the kind-
//     specific shell; the switch's default branch is the TypeScript
//     exhaustiveness check (`const _: never = msg.kind`) so a future
//     `MessageKind` addition fails the build until it gets a render
//     branch.
//
// Critical correctness items (one entry per documented codex catch
// precedent — see m4-plan §6):
//   - **Spec-literal copy**: every visible string anchored to a spec
//     line. Truncation banner per spec line 715. Parse-warnings per
//     spec line 717 (including the grammatically-odd "1 parse
//     warnings" for N=1 — design.md §7.1). Boundary per spec line
//     710 ("SESSION RESUMED" / "CONVERSATION COMPACTED"). Unknown
//     per spec line 711.
//   - **Keep-mounted contract**: NO `key=` on the TranscriptView
//     root or descendants except `<MessageRow key={msg.messageIndex}>`
//     (content-keyed, NOT tab-keyed). Component-local state
//     (warnings dismissal, expanded `<details>`) survives tab
//     switches. The only natural reset is row identity change —
//     handled by the parent `<SessionView key={selectedRowKey}>`
//     remount + a defensive `useEffect` reset on `row.rowKey`.
//   - **Token discipline**: zero new tokens. Every `var(--…)`
//     reference resolves to a token in `apps/frontend/src/styles/
//     tokens.css`. Hex isolation invariant preserved (24).
//   - **Motion budget**: only `opacity` (truncation banner entrance)
//     and `<details>` `block-size` (the M2b exemption). NO animated
//     `color`, `border-color`, `width`, `height`, `top`, `padding`,
//     `transform on message panels`, `background-color on message
//     panels`. See TranscriptView.css for the explicit
//     authorizations.
//   - **a11y**: `<section aria-label="Session transcript">` anchors
//     the surface; boundary `<li>` carries `role="separator"`
//     directly (no nested `<div>` per design.md §12.2);
//     `<details>` summaries are keyboard-focusable; Retry button is
//     focusable + accessible-name "Retry".
//
// @see working/phase-5.md:699-717 (Transcript tab body)
// @see working/phase-5/designs/m4-transcript/design.md (full design)
// @see working/phase-5/m4-plan.md (implementation plan)

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { BoundaryRow } from "./BoundaryRow";
import { relativeTimeFrom } from "./relativeTime";
import { useParsedSession } from "./useParsedSession";
import type { Message, ParsedSession, ParseWarning } from "./parsers";
import {
  renderHints as computeRenderHints,
  type GroupStatus,
  type InlineWarning,
  type MetadataHint,
  type RenderHint,
} from "./renderHints";
import type { SessionRow } from "./types";
import "./TranscriptView.css";

/**
 * Threshold for the `tool_result` body collapse. Per spec line 708
 * + Q2 in m4-plan §5: the discriminator is the parser-computed
 * `msg.bytes` (UTF-8 byte length), NOT `msg.text.length` (which
 * undercounts multi-byte codepoints).
 *
 * Declared as a private constant rather than a token because the
 * 2 KB threshold is structural rendering logic, not a design-token
 * concern. Documented here so codex review can verify the value.
 */
const TOOL_RESULT_OVERFLOW_BYTES = 2048;

/**
 * Maximum prefix length for the `unknown` fallback line. Per spec
 * line 711: "Unrecognized line: {first 80 chars}…".
 */
const UNKNOWN_LINE_PREFIX_CHARS = 80;

export type TranscriptViewProps = {
  /** Selected session row. */
  row: SessionRow;
  /**
   * Pinned-`now` ISO string used for relative-time labelling. Required
   * so timestamps render deterministically in tests (mirrors
   * SessionMetadata's contract).
   */
  now: string;
  /**
   * Optional inclusive [start, end] messageIndex range. When provided,
   * the body renders only `parsed.messages.slice(start, end + 1)`.
   * Used by SkimView (M5) to mount a scoped TranscriptView inside the
   * "Expand to raw messages" affordance and the agent_only block
   * expansion (Resolved Decision #9). Out-of-bounds values clamp to
   * `[0, parsed.messages.length - 1]`. When `start > end` (e.g., the
   * empty-stream sentinel `{start: 0, end: -1}`) the body slice is
   * empty and the empty-stream copy renders.
   *
   * Omitting this prop renders the full transcript (M4 default
   * behaviour — backward compatible).
   */
  messageRange?: { start: number; end: number };
};

export function TranscriptView({ row, now, messageRange }: TranscriptViewProps) {
  const result = useParsedSession(row);
  const [warningsBannerDismissed, setWarningsBannerDismissed] =
    useState<boolean>(false);

  // Defensive reset: `<SessionView key={selectedRowKey}>` already
  // destroys this component on selection change, but the belt-and-
  // suspenders `useEffect` clears the dismissed-state if `row.rowKey`
  // changes without a parent-level remount. Mirrors SessionView's
  // own pattern at lines 223-226.
  useEffect(() => {
    setWarningsBannerDismissed(false);
  }, [row.rowKey]);

  if (result.state === "idle") {
    return (
      <p className="transcript-empty">Select a session to read its transcript.</p>
    );
  }
  if (result.state === "no_raw") {
    return (
      <p className="transcript-not-imported">
        This session has not been imported yet — only the source-side
        metadata is available. Click <strong>Import</strong> in the
        action bar to fetch the raw payload.
      </p>
    );
  }
  if (result.state === "loading") {
    return <p className="transcript-loading">Reading session…</p>;
  }
  if (result.state === "error") {
    return (
      <div className="transcript-error-block">
        <p className="transcript-error">
          Could not load session: {result.error.message}.
        </p>
        <p>
          <button
            type="button"
            className="transcript-retry"
            onClick={result.retry}
          >
            Retry
          </button>
        </p>
      </div>
    );
  }
  // success | truncated
  return (
    <TranscriptBody
      parsed={result.parsed}
      now={now}
      truncated={result.state === "truncated"}
      warningsBannerDismissed={warningsBannerDismissed}
      onDismissWarnings={() => setWarningsBannerDismissed(true)}
      messageRange={messageRange}
    />
  );
}

function TranscriptBody({
  parsed,
  now,
  truncated,
  warningsBannerDismissed,
  onDismissWarnings,
  messageRange,
}: {
  parsed: ParsedSession;
  now: string;
  truncated: boolean;
  warningsBannerDismissed: boolean;
  onDismissWarnings: () => void;
  messageRange?: { start: number; end: number };
}) {
  // Defensive slice with clamping. Per design.md §10.3 + planner Q10:
  //   - missing prop -> render the full message stream (M4 default).
  //   - start < 0       -> clamp to 0.
  //   - end >= len      -> clamp to len - 1.
  //   - start > end     -> empty slice (renders the empty-stream copy).
  //     This includes the buildSkim empty-stream sentinel
  //     `{start: 0, end: -1}` per spec line 697.
  const slicedMessages = (() => {
    if (!messageRange) return parsed.messages;
    const lo = Math.max(0, messageRange.start);
    const hi = Math.min(parsed.messages.length - 1, messageRange.end);
    if (hi < lo) return [];
    return parsed.messages.slice(lo, hi + 1);
  })();

  // Phase 7c / M2 — render-hint dispatch layer. Compute once per
  // (messages, warnings) tuple; the recompute cost is bounded by a
  // single linear scan over the message stream so `useMemo` is
  // sufficient — no virtualization escape-hatch fires here.
  //
  // Hints align positionally with `slicedMessages`: the slice is the
  // input to `computeRenderHints`, so `messageIndex` on each hint is
  // the parser-emitted sequential index from the FULL stream. The
  // index lookup below resolves a hint's `pairWithIndex` back to a
  // concrete `Message` by scanning the slice — bounded and small.
  const hints = useMemo(
    () => computeRenderHints(slicedMessages, parsed.warnings),
    [slicedMessages, parsed.warnings],
  );
  const messagesByIndex = useMemo(() => {
    const map = new Map<number, Message>();
    for (const msg of slicedMessages) map.set(msg.messageIndex, msg);
    return map;
  }, [slicedMessages]);

  return (
    <section className="transcript-body" aria-label="Session transcript">
      {truncated ? <TruncationBanner /> : null}
      {parsed.warnings.length > 0 && !warningsBannerDismissed ? (
        <ParseWarningsBanner
          warnings={parsed.warnings}
          onDismiss={onDismissWarnings}
        />
      ) : null}
      {slicedMessages.length === 0 ? (
        <p className="transcript-empty-stream">No messages parsed.</p>
      ) : (
        <ol className="transcript-stream">
          {renderTopLevelHints(hints, messagesByIndex, now)}
        </ol>
      )}
    </section>
  );
}

/**
 * Render the top-level row stream. `group-head` consumes the
 * subsequent N `group-member` hints into its expanded body — those
 * member positions emit nothing at the top level (the head renders
 * them inside its `<details>`). Linear in `hints.length`.
 *
 * @see working/phase-7c/designs/design.md §3 + §4 (group recipe).
 */
function renderTopLevelHints(
  hints: RenderHint[],
  messagesByIndex: Map<number, Message>,
  now: string,
): ReactNode[] {
  const out: ReactNode[] = [];
  for (let i = 0; i < hints.length; i++) {
    const hint = hints[i];
    if (hint.kind === "metadata-cluster-member") {
      // Phase 7d — cluster body members are inert at top level. The
      // preceding `metadata-cluster-head` rendered them inside its
      // `<details>` body via its own `members[]`.
      continue;
    }
    if (hint.kind === "metadata-cluster-head") {
      out.push(<MetadataCluster key={hintKey(hint)} hint={hint} />);
      continue;
    }
    if (hint.kind === "group-member" || hint.kind === "group-text-member") {
      // Consumed by a preceding group-head — emit nothing at top level.
      // Both lifecycle members AND passthrough text members (added by
      // the post-Phase-7c polish round 2 "tool-batch" grouping) are
      // hoovered into the group's expanded body by the GroupHeadRow
      // forward walk.
      continue;
    }
    if (hint.kind === "group-head") {
      // Walk forward over the contiguous group-member hints belonging
      // to this head. The grouping pass in renderHints.ts emits each
      // head followed immediately by exactly N group-member hints
      // pointing back via `groupHeadIndex`.
      //
      // Defense in depth (codex M3 r2 finding #1): cap consumption at
      // `head.messageIndices.length` AND verify each member's
      // `groupHeadIndex === head.messageIndices[0]`. The canonical
      // head pointer is the FIRST message index of the run (see
      // renderHints.ts `flush()`: `groupHeadIndex = buffer[0]
      // .messageIndex`). If a member fails either check, abort the
      // walk so the next head's members are not swallowed when two
      // groups land adjacent in the hint stream with no intervening
      // non-member hint.
      // Post-Phase-7c polish r2: members can be `group-member` (a
      // lifecycle pair) OR `group-text-member` (an assistant/system
      // standalone pulled into the group's expanded body). Walk
      // forward collecting BOTH kinds in original order.
      //
      // Defensive bounds (codex M3 r2 finding #1):
      //   - lifecycle-member count caps at `head.messageIndices.length`
      //   - every member (lifecycle or text) must declare
      //     `groupHeadIndex === head.messageIndices[0]`; a mismatch
      //     aborts the walk so a subsequent group's members are not
      //     swallowed.
      type GroupMember =
        | Extract<RenderHint, { kind: "group-member" }>
        | Extract<RenderHint, { kind: "group-text-member" }>;
      const members: GroupMember[] = [];
      const expectedLifecycleCount = hint.messageIndices.length;
      const canonicalHeadIndex = hint.messageIndices[0];
      let lifecycleSeen = 0;
      let j = i + 1;
      while (
        j < hints.length &&
        (hints[j].kind === "group-member" ||
          hints[j].kind === "group-text-member")
      ) {
        const candidate = hints[j] as GroupMember;
        if (candidate.groupHeadIndex !== canonicalHeadIndex) {
          // Belongs to a different head — stop the walk so the next
          // group's members are preserved for its own GroupHeadRow.
          break;
        }
        if (candidate.kind === "group-member") {
          if (lifecycleSeen >= expectedLifecycleCount) break;
          lifecycleSeen += 1;
        }
        members.push(candidate);
        j += 1;
      }
      out.push(
        <GroupHeadRow
          key={hintKey(hint)}
          hint={hint}
          members={members}
          messagesByIndex={messagesByIndex}
          now={now}
        />,
      );
      continue;
    }
    out.push(
      <HintRow
        key={hintKey(hint)}
        hint={hint}
        messagesByIndex={messagesByIndex}
        now={now}
      />,
    );
  }
  return out;
}

/**
 * Stable React key per hint. Uses the message-index for single-message
 * hint variants; for `group-head` (M3) the union of indices forms the
 * key.
 */
function hintKey(hint: RenderHint): string {
  switch (hint.kind) {
    case "standalone":
    case "lifecycle":
    case "boundary":
    case "warning-only":
    case "metadata":
      return `${hint.kind}-${hint.messageIndex}`;
    case "group-head":
      return `group-head-${hint.messageIndices.join("-")}`;
    case "group-member":
      return `group-member-${hint.messageIndex}`;
    case "group-text-member":
      return `group-text-member-${hint.messageIndex}`;
    case "metadata-cluster-head":
      return `metadata-cluster-head-${hint.messageIndices.join("-")}`;
    case "metadata-cluster-member":
      return `metadata-cluster-member-${hint.messageIndex}`;
    default: {
      const _: never = hint;
      void _;
      return "unknown";
    }
  }
}

function HintRow({
  hint,
  messagesByIndex,
  now,
}: {
  hint: RenderHint;
  messagesByIndex: Map<number, Message>;
  now: string;
}) {
  switch (hint.kind) {
    case "boundary": {
      const msg = messagesByIndex.get(hint.messageIndex);
      if (!msg || msg.kind !== "boundary") return null;
      return <BoundaryMessage msg={msg} />;
    }
    case "lifecycle": {
      const useMsg = messagesByIndex.get(hint.messageIndex);
      if (!useMsg || useMsg.kind !== "tool_use") return null;
      const resultMsg =
        hint.pairWithIndex !== null
          ? messagesByIndex.get(hint.pairWithIndex)
          : undefined;
      const pairedResult =
        resultMsg && resultMsg.kind === "tool_result" ? resultMsg : null;
      return (
        <LifecycleCard
          useMsg={useMsg}
          resultMsg={pairedResult}
          warnings={hint.warnings}
          now={now}
        />
      );
    }
    case "warning-only": {
      // Per design.md §15.4 + checklist #20: no chip on the message
      // card; banner-only. Render nothing — the session banner
      // already lists every warning regardless of inline routing.
      return null;
    }
    case "standalone": {
      const msg = messagesByIndex.get(hint.messageIndex);
      if (!msg) return null;
      // Task-lifecycle stamp: a `system` message whose text starts
      // with `task_started · turn ` or `task_complete · turn ` is
      // a chapter marker, NOT a generic system note. The discriminator
      // lives on the RenderHint per design.md §6.5 + checklist #36.
      if (msg.kind === "system" && hint.taskLifecycle) {
        return (
          <TaskLifecycleCard
            text={msg.text}
            variant={hint.taskLifecycle}
            warnings={hint.warnings}
          />
        );
      }
      return (
        <StandaloneRow msg={msg} now={now} warnings={hint.warnings} />
      );
    }
    case "metadata": {
      // Phase 7d — singleton metadata Message below the cluster
      // threshold. Hairlines render with category-specific recipe;
      // echoes render as a single `↺` glyph row.
      return <MetadataRow hint={hint.metadata} />;
    }
    case "metadata-cluster-head":
    case "metadata-cluster-member": {
      // Phase 7d — cluster head and members are handled by
      // `renderTopLevelHints` BEFORE this switch runs. Defensive
      // no-op so a future caller that bypasses the top-level walk
      // does not crash.
      return null;
    }
    case "group-head":
    case "group-member":
    case "group-text-member": {
      // Phase 7c / M3 + polish r2: `group-head`, `group-member`, and
      // `group-text-member` are consumed by `renderTopLevelHints`
      // BEFORE this switch runs. A stray member or head reaching this
      // branch is a defensive no-op so a future caller that bypasses
      // the top-level walk does not crash.
      return null;
    }
    default: {
      // Exhaustiveness: a future RenderHint.kind without a render
      // branch breaks the build here. Mirrors the MessageKind
      // exhaustiveness check below.
      const _exhaustive: never = hint;
      void _exhaustive;
      return null;
    }
  }
}

/**
 * Render a standalone message (one not consumed by a lifecycle pair).
 * Switches on `Message.kind` for the inner content. The shell
 * (`<li>`) is owned by the per-kind helpers when they need it; for
 * `boundary` the `BoundaryRow` carries its own semantic markup.
 */
function StandaloneRow({
  msg,
  now,
  warnings,
}: {
  msg: Message;
  now: string;
  warnings: InlineWarning[] | undefined;
}) {
  return <MessageRow msg={msg} now={now} warnings={warnings} />;
}

function TruncationBanner() {
  return (
    <div
      className="transcript-banner transcript-banner-truncation"
      role="status"
    >
      Truncated at 5 MB — full payload not parsed. Use the{" "}
      <strong>Open raw</strong> anchor in the session header to
      inspect the full payload.
    </div>
  );
}

function ParseWarningsBanner({
  warnings,
  onDismiss,
}: {
  warnings: ParseWarning[];
  onDismiss: () => void;
}) {
  // JSDoc rationale (do NOT "fix" the grammar):
  // The spec at working/phase-5.md:717 is treated as a literal
  // string. For N=1 this reads as "1 parse warnings — click to
  // view." which is grammatically odd in English but spec-precedent
  // compliant. Codex verified spec literals beat English grammar
  // in M3a r1; do NOT swap in a singular form.
  return (
    <details className="transcript-banner transcript-banner-warnings">
      <summary>{warnings.length} parse warnings — click to view.</summary>
      <ul className="transcript-warnings-list">
        {warnings.map((w, idx) => (
          <li key={`${w.lineOrdinal}-${idx}`}>
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
  );
}

/**
 * Matrix rows whose parser route is `(skipped)` have no `MessageRow`
 * branch by design:
 * - docs/features/parser-event-support.md#claude-code-custom-title
 * - docs/features/parser-event-support.md#claude-code-permission-mode
 * - docs/features/parser-event-support.md#codex-response-item-message-role-assistant
 * - docs/features/parser-event-support.md#codex-response-item-message-role-user
 * - docs/features/parser-event-support.md#codex-turn-context
 */
function MessageRow({
  msg,
  now,
  warnings,
}: {
  msg: Message;
  now: string;
  warnings?: InlineWarning[];
}) {
  switch (msg.kind) {
    case "user":
      /**
       * Matrix:
       * - docs/features/parser-event-support.md#claude-code-user-message-content-string
       * - docs/features/parser-event-support.md#claude-code-user-content-text
       * - docs/features/parser-event-support.md#codex-event-msg-user-message
       */
      return <UserMessage msg={msg} now={now} warnings={warnings} />;
    case "assistant":
      /**
       * Matrix:
       * - docs/features/parser-event-support.md#claude-code-assistant-content-text
       * - docs/features/parser-event-support.md#codex-event-msg-agent-message
       * - docs/features/parser-event-support.md#codex-event-msg-agent-reasoning
       */
      return <AssistantMessage msg={msg} now={now} warnings={warnings} />;
    case "tool_use":
      /**
       * Matrix:
       * - docs/features/parser-event-support.md#claude-code-assistant-content-tool-use
       * - docs/features/parser-event-support.md#codex-response-item-function-call
       */
      return <ToolUseMessage msg={msg} now={now} warnings={warnings} />;
    case "tool_result":
      /** Matrix: docs/features/parser-event-support.md#claude-code-user-content-tool-result */
      return <ToolResultMessage msg={msg} now={now} warnings={warnings} />;
    case "system":
      /**
       * Matrix:
       * - docs/features/parser-event-support.md#claude-code-system
       * - docs/features/parser-event-support.md#codex-event-msg-error
       * - docs/features/parser-event-support.md#codex-event-msg-task-complete
       * - docs/features/parser-event-support.md#codex-event-msg-task-started
       * - docs/features/parser-event-support.md#codex-session-meta
       *
       * The `task_complete` / `task_started` matrix rows route through
       * `<TaskLifecycleCard>` in `HintRow` BEFORE reaching this branch
       * (when the renderHints layer stamps `taskLifecycle`). This
       * branch handles the remaining `system` rows.
       */
      return <SystemMessage msg={msg} warnings={warnings} />;
    case "boundary":
      /** Matrix: docs/features/parser-event-support.md#codex-session-meta */
      return <BoundaryMessage msg={msg} />;
    case "unknown":
      /**
       * Matrix:
       * - docs/features/parser-event-support.md#claude-code-agent-name
       * - docs/features/parser-event-support.md#claude-code-ai-title
       * - docs/features/parser-event-support.md#claude-code-assistant-content-thinking
       * - docs/features/parser-event-support.md#claude-code-attachment
       * - docs/features/parser-event-support.md#claude-code-file-history-snapshot
       * - docs/features/parser-event-support.md#claude-code-last-prompt
       * - docs/features/parser-event-support.md#claude-code-queue-operation
       * - docs/features/parser-event-support.md#codex-compacted
       * - docs/features/parser-event-support.md#codex-event-msg-collab-agent-interaction-end
       * - docs/features/parser-event-support.md#codex-event-msg-collab-agent-spawn-end
       * - docs/features/parser-event-support.md#codex-event-msg-collab-close-end
       * - docs/features/parser-event-support.md#codex-event-msg-collab-waiting-end
       * - docs/features/parser-event-support.md#codex-event-msg-context-compacted
       * - docs/features/parser-event-support.md#codex-event-msg-entered-review-mode
       * - docs/features/parser-event-support.md#codex-event-msg-exec-command-end
       * - docs/features/parser-event-support.md#codex-event-msg-exited-review-mode
       * - docs/features/parser-event-support.md#codex-event-msg-item-completed
       * - docs/features/parser-event-support.md#codex-event-msg-mcp-tool-call-end
       * - docs/features/parser-event-support.md#codex-event-msg-patch-apply-end
       * - docs/features/parser-event-support.md#codex-event-msg-thread-rolled-back
       * - docs/features/parser-event-support.md#codex-event-msg-token-count
       * - docs/features/parser-event-support.md#codex-event-msg-turn-aborted
       * - docs/features/parser-event-support.md#codex-event-msg-web-search-end
       * - docs/features/parser-event-support.md#codex-response-item-custom-tool-call
       * - docs/features/parser-event-support.md#codex-response-item-custom-tool-call-output
       * - docs/features/parser-event-support.md#codex-response-item-function-call-output
       * - docs/features/parser-event-support.md#codex-response-item-message-role-developer
       * - docs/features/parser-event-support.md#codex-response-item-reasoning
       * - docs/features/parser-event-support.md#codex-response-item-web-search-call
       */
      return <UnknownMessage msg={msg} warnings={warnings} />;
    case "metadata": {
      /**
       * Phase 7d — `kind:"metadata"` Messages route through the
       * `HintRow` `case "metadata"` branch on the RenderHint level,
       * not through this MessageKind switch. A metadata Message
       * reaching `<MessageRow>` indicates a defensive code path
       * (e.g. a test invoking MessageRow directly). Render the
       * hairline using a freshly-built MetadataHint so the
       * exhaustiveness check stays loud without breaking the
       * fallback behavior.
       *
       * Matrix:
       * - docs/features/parser-event-support.md#claude-code-agent-name
       * - docs/features/parser-event-support.md#claude-code-ai-title
       * - docs/features/parser-event-support.md#claude-code-attachment
       * - docs/features/parser-event-support.md#claude-code-custom-title
       * - docs/features/parser-event-support.md#claude-code-file-history-snapshot
       * - docs/features/parser-event-support.md#claude-code-last-prompt
       * - docs/features/parser-event-support.md#claude-code-permission-mode
       * - docs/features/parser-event-support.md#claude-code-queue-operation
       * - docs/features/parser-event-support.md#codex-event-msg-token-count
       * - docs/features/parser-event-support.md#codex-response-item-message-role-assistant
       * - docs/features/parser-event-support.md#codex-response-item-message-role-user
       * - docs/features/parser-event-support.md#codex-turn-context
       */
      const category = msg.metaCategory ?? "control";
      const raw =
        msg.raw.length > 1024 ? msg.raw.slice(0, 1024) + "…" : msg.raw;
      const hint: MetadataHint =
        category === "echo"
          ? {
              category,
              display: "",
              ariaLabel: `Echo: duplicate of canonical ${msg.echoOf?.canonicalKind ?? "user"} message at line ${msg.echoOf?.lineOrdinal ?? "?"}`,
              raw,
              ...(msg.echoOf ? { echoOf: msg.echoOf } : {}),
            }
          : {
              category,
              display: msg.text,
              ariaLabel: `Metadata: ${msg.text}`,
              raw,
            };
      return <MetadataRow hint={hint} />;
    }
    default: {
      // Exhaustiveness: a future MessageKind without a render branch
      // breaks the build here. Per m4-plan §6 catch #13.
      const _exhaustive: never = msg.kind;
      void _exhaustive;
      return null;
    }
  }
}

// ============================================================================
// Per-kind components
// ============================================================================

function UserMessage({
  msg,
  now,
  warnings,
}: {
  msg: Message;
  now: string;
  warnings?: InlineWarning[];
}) {
  return (
    <li className="msg msg-li">
      <article className="msg-panel msg-user">
        <header className="msg-attr">
          <span>User</span>
          <span aria-hidden="true"> · </span>
          <MessageTime iso={msg.timestamp} now={now} />
        </header>
        <div className="msg-body">{renderBodyWithCode(msg.text)}</div>
        <InlineWarnings warnings={warnings} />
      </article>
    </li>
  );
}

function AssistantMessage({
  msg,
  now,
  warnings,
}: {
  msg: Message;
  now: string;
  warnings?: InlineWarning[];
}) {
  return (
    <li className="msg msg-li">
      <article className="msg-panel msg-assistant">
        <header className="msg-attr">
          <span>Assistant</span>
          <span aria-hidden="true"> · </span>
          <MessageTime iso={msg.timestamp} now={now} />
        </header>
        <div className="msg-body">{renderBodyWithCode(msg.text)}</div>
        <InlineWarnings warnings={warnings} />
      </article>
    </li>
  );
}

function ToolUseMessage({
  msg,
  now,
  warnings,
}: {
  msg: Message;
  now: string;
  warnings?: InlineWarning[];
}) {
  const toolName = msg.toolName ?? "(unknown)";
  return (
    <li className="msg msg-li">
      <article className="msg-panel msg-tool-use">
        <header className="msg-tool-head">
          <span>Tool</span>
          <span aria-hidden="true"> · </span>
          <span className="msg-tool-name">{toolName}</span>
          <span aria-hidden="true"> · </span>
          <MessageTime iso={msg.timestamp} now={now} />
        </header>
        <details className="msg-tool-disclosure">
          <summary>Arguments</summary>
          <pre className="msg-tool-pre">{msg.text}</pre>
        </details>
        <InlineWarnings warnings={warnings} />
      </article>
    </li>
  );
}

function ToolResultMessage({
  msg,
  now,
  warnings,
}: {
  msg: Message;
  now: string;
  warnings?: InlineWarning[];
}) {
  const toolName = msg.toolName ?? "(unknown)";
  const overflow = msg.bytes > TOOL_RESULT_OVERFLOW_BYTES;
  const { head, tail, tailBytes } = overflow
    ? splitToolResult(msg.text, msg.bytes)
    : { head: msg.text, tail: null, tailBytes: 0 };
  return (
    <li className="msg msg-li">
      <article className="msg-panel msg-tool-result">
        <header className="msg-tool-head">
          <span>Tool result</span>
          <span aria-hidden="true"> · </span>
          <span className="msg-tool-name">{toolName}</span>
          <span aria-hidden="true"> · </span>
          <MessageTime iso={msg.timestamp} now={now} />
        </header>
        <pre className="msg-tool-pre msg-tool-result-head">{head}</pre>
        {overflow && tail !== null ? (
          <details className="msg-tool-disclosure msg-tool-overflow">
            <summary>Expand ({tailBytes} more bytes)</summary>
            <pre className="msg-tool-pre msg-tool-result-tail">{tail}</pre>
          </details>
        ) : null}
        <InlineWarnings warnings={warnings} />
      </article>
    </li>
  );
}

function SystemMessage({
  msg,
  warnings,
}: {
  msg: Message;
  warnings?: InlineWarning[];
}) {
  return (
    <li className="msg msg-li">
      <p className="msg-panel msg-system">
        <span className="msg-system-glyph" aria-hidden="true">
          system ·
        </span>{" "}
        {msg.text}
      </p>
      <InlineWarnings warnings={warnings} />
    </li>
  );
}

function BoundaryMessage({ msg }: { msg: Message }) {
  // M5 extracted the inline recipe into the shared `BoundaryRow`
  // component (signature detail #1; design.md §4.2). Transcript does
  // NOT pass `staggerIndex` — the per-block stagger animation is a
  // SkimView-only authorization (spec table row 9).
  return <BoundaryRow subtype={msg.boundarySubtype} />;
}

function UnknownMessage({
  msg,
  warnings,
}: {
  msg: Message;
  warnings?: InlineWarning[];
}) {
  const slice = renderUnknownLine(msg.text);
  return (
    <li className="msg msg-li">
      <p className="msg-panel msg-unknown">
        <span className="msg-unknown-prefix">Unrecognized line:</span>{" "}
        <span className="msg-unknown-payload">{slice}</span>
      </p>
      <InlineWarnings warnings={warnings} />
    </li>
  );
}

// ============================================================================
// Phase 7c / M2 — lifecycle + task-lifecycle cards + inline warning chip
// ============================================================================

/**
 * Paired tool_use + tool_result rendered as a single lifecycle card
 * per design.md §3 (sienna inline-start rail, status indicator dot +
 * chrome-text label, two native `<details>` disclosures for Arguments
 * and Result).
 *
 * Pairing semantics:
 *   - `resultMsg !== null` → success / failure status from the
 *     `tool_result.text` via `detectFailureStatus`.
 *   - `resultMsg === null` → orphan tool_use → `in-flight` recipe;
 *     header carries an "awaiting result" Fraunces SC pill; body
 *     shows only the Arguments disclosure + an italic "no
 *     tool_result observed" note.
 *
 * Phase 7c / M3: when `inGroup` is true the card is rendered inside
 * an expanded `<details class="group-card">` body and the outer
 * `<li>` shell is suppressed (the group's `.group-members` div owns
 * the vertical rhythm).
 *
 * Matrix:
 * - docs/features/parser-event-support.md#claude-code-assistant-content-tool-use
 * - docs/features/parser-event-support.md#claude-code-user-content-tool-result
 * - docs/features/parser-event-support.md#codex-event-msg-exec-command-end
 * - docs/features/parser-event-support.md#codex-event-msg-mcp-tool-call-end
 * - docs/features/parser-event-support.md#codex-event-msg-patch-apply-end
 * - docs/features/parser-event-support.md#codex-event-msg-web-search-end
 * - docs/features/parser-event-support.md#codex-response-item-custom-tool-call
 * - docs/features/parser-event-support.md#codex-response-item-custom-tool-call-output
 * - docs/features/parser-event-support.md#codex-response-item-function-call
 * - docs/features/parser-event-support.md#codex-response-item-function-call-output
 * - docs/features/parser-event-support.md#codex-response-item-web-search-call
 *
 * @see working/phase-7c/designs/design.md §3
 */
function LifecycleCard({
  useMsg,
  resultMsg,
  warnings,
  now,
  inGroup,
}: {
  useMsg: Message;
  resultMsg: Message | null;
  warnings: InlineWarning[] | undefined;
  now: string;
  /**
   * Phase 7c / M3 — when true, the card renders inside an expanded
   * `<details class="group-card">` group. The outer `<li>` shell is
   * skipped (the group's `<div class="group-members">` owns the
   * vertical rhythm), and the `.group-member` class is added so the
   * raised-surface backdrop applies per design.md §4.2.
   */
  inGroup?: boolean;
}) {
  const toolName = useMsg.toolName ?? "(unknown)";
  const failed = resultMsg ? detectFailureStatus(resultMsg.text) : false;
  const status: "all-success" | "all-failed" | "in-flight" = !resultMsg
    ? "in-flight"
    : failed
      ? "all-failed"
      : "all-success";
  const statusLabel: string =
    status === "in-flight"
      ? "in-flight"
      : status === "all-failed"
        ? "failed"
        : "succeeded";
  const cardClass = inGroup
    ? "lifecycle-card msg-lifecycle group-member"
    : "lifecycle-card msg-lifecycle";
  const card = (
    <article className={cardClass} data-status={status}>
      <header className="lifecycle-head">
        <span className="label-tool">Tool</span>
        <span aria-hidden="true"> · </span>
        <span className="tool-name">{toolName}</span>
        {status === "in-flight" ? (
          <span className="lifecycle-pill">awaiting result</span>
        ) : null}
        <span aria-hidden="true"> · </span>
        <MessageTime iso={useMsg.timestamp} now={now} />
        <span className="head-status">
          <span
            className="status-dot"
            data-status={status}
            aria-hidden="true"
          />
          {statusLabel}
        </span>
      </header>
      <div className="lifecycle-body">
        <details>
          <summary>
            <span className="side-label">Arguments</span>
          </summary>
          <pre>{useMsg.text}</pre>
        </details>
        {resultMsg ? (
          <details>
            <summary>
              <span className="side-label">Result</span>
            </summary>
            <pre>{resultMsg.text}</pre>
          </details>
        ) : (
          <p className="lifecycle-no-result">
            No tool_result observed before end of stream.
          </p>
        )}
      </div>
      <InlineWarnings warnings={warnings} />
    </article>
  );
  if (inGroup) return card;
  return <li className="msg msg-li">{card}</li>;
}

/**
 * Phase 7c / M3 — same-tool grouped card.
 *
 * Collapsed `<details>` rendering a group head: tool name + count
 * badge ("N calls") + aggregate-status indicator. Expanding reveals
 * the group's N member lifecycles, each rendered as a
 * `.group-member.lifecycle-card` on the raised surface (per design.md
 * §4.2). Inline warnings on the members surface ONLY inside the
 * expanded view per design.md §15.7 — the collapsed head shows
 * neither chips nor an Inspect affordance.
 *
 * Matrix: tool lifecycle grouping is render-layer concern only — no
 * matrix row maps directly here (the underlying tool_use / tool_result
 * rows are already specialized in their own matrix entries).
 *
 * @see working/phase-7c/designs/design.md §3 (lifecycle recipe)
 * @see working/phase-7c/designs/design.md §4 (group card model)
 * @see working/phase-7c/designs/design.md §15.2 (threshold = 3)
 * @see working/phase-7c/designs/design.md §15.7 (chip hidden until expanded)
 */
function GroupHeadRow({
  hint,
  members,
  messagesByIndex,
  now,
}: {
  hint: Extract<RenderHint, { kind: "group-head" }>;
  /**
   * Member hints in original-stream order. May include
   * `group-text-member` entries (assistant/system passthrough text
   * the polish-r2 "tool-batch" grouping pulled into the group's
   * expanded body) interleaved with `group-member` lifecycle entries.
   */
  members: Array<
    | Extract<RenderHint, { kind: "group-member" }>
    | Extract<RenderHint, { kind: "group-text-member" }>
  >;
  messagesByIndex: Map<number, Message>;
  now: string;
}) {
  const aggregateLabel = aggregateLabelText(hint.aggregateStatus);
  const dotStatus = aggregateDotStatus(hint.aggregateStatus);
  const count = hint.messageIndices.length;
  // Post-Phase-7c polish: groups are mixed-tool. `toolNames` carries
  // distinct names in first-appearance order; the renderer joins them
  // with ", " — works naturally for both single-tool (1 entry) and
  // mixed-tool (N entries) runs. Fall back to the legacy `toolName`
  // when `toolNames` is missing (defensive for older hint shapes).
  const toolNamesDisplay =
    hint.toolNames && hint.toolNames.length > 0
      ? hint.toolNames.join(", ")
      : hint.toolName;
  return (
    <li className="msg msg-li">
      <details className="group-card" data-status={dotStatus}>
        <summary>
          <span className="tool-name">{toolNamesDisplay}</span>
          <span className="group-divider" aria-hidden="true" />
          <span className="count-badge">{count} calls</span>
          <span className="aggregate-label">
            <span
              className="status-dot"
              data-status={dotStatus}
              aria-hidden="true"
            />
            {aggregateLabel}
          </span>
        </summary>
        <div className="group-members">
          {members.map((m) => {
            // Text members (assistant/system passthrough from polish r2)
            // render their underlying message via StandaloneRow so the
            // agent's commentary surfaces inside the expanded group in
            // original order.
            if (m.kind === "group-text-member") {
              const msg = messagesByIndex.get(m.messageIndex);
              if (!msg) return null;
              return (
                <StandaloneRow
                  key={`gtm-${m.messageIndex}`}
                  msg={msg}
                  now={now}
                  warnings={m.warnings}
                />
              );
            }
            // Lifecycle member (group-member).
            const useMsg = messagesByIndex.get(m.messageIndex);
            if (!useMsg || useMsg.kind !== "tool_use") return null;
            const resultMsg =
              m.pairWithIndex !== null
                ? messagesByIndex.get(m.pairWithIndex)
                : undefined;
            const pairedResult =
              resultMsg && resultMsg.kind === "tool_result"
                ? resultMsg
                : null;
            return (
              <LifecycleCard
                key={`gm-${m.messageIndex}`}
                useMsg={useMsg}
                resultMsg={pairedResult}
                warnings={m.warnings}
                now={now}
                inGroup
              />
            );
          })}
        </div>
      </details>
    </li>
  );
}

/**
 * Aggregate-label copy per design.md §6 + §4.3. Mixed-case strings
 * driven by `font-variant: small-caps` in CSS; the load-bearing
 * cue is the chrome-text label, the dot is reinforcement.
 */
function aggregateLabelText(status: GroupStatus): string {
  switch (status.kind) {
    case "all-success":
      return "all succeeded";
    case "mixed":
      return `${status.total - status.failed} succeeded · ${status.failed} failed`;
    case "in-flight":
      return `running ${status.total - status.pending} of ${status.total}`;
    case "all-failed":
      return "all failed";
    default: {
      const _: never = status;
      void _;
      return "";
    }
  }
}

/**
 * Map a `GroupStatus.kind` to the `data-status` value on the status
 * dot. The four intentional dot variants per design.md §6.
 */
function aggregateDotStatus(
  status: GroupStatus,
): "all-success" | "mixed" | "in-flight" | "all-failed" {
  return status.kind;
}

/**
 * Chapter-marker card for Codex task lifecycle (`task_started · turn
 * {id}` / `task_complete · turn {id}`). Hairline pair top + bottom,
 * Fraunces italic small-caps label, middle-dot divider, mono turn id.
 * Non-interactive — no hover, no focus ring, no `<details>`.
 *
 * Matrix:
 * - docs/features/parser-event-support.md#codex-event-msg-task-started
 * - docs/features/parser-event-support.md#codex-event-msg-task-complete
 *
 * @see working/phase-7c/designs/design.md §6.5
 */
function TaskLifecycleCard({
  text,
  variant,
  warnings,
}: {
  text: string;
  variant: "started" | "complete";
  warnings: InlineWarning[] | undefined;
}) {
  // Recover the trailing turn id from the parser-emitted string.
  // Format: `task_started · turn {turn}` or `task_complete · turn {turn}`.
  // Per design.md §6.5.3, the parser fallback is `(unknown turn)`.
  const TURN_MARKER = " · turn ";
  const turnIdx = text.indexOf(TURN_MARKER);
  const turnId =
    turnIdx >= 0 ? text.slice(turnIdx + TURN_MARKER.length) : "(unknown turn)";
  const label = variant === "started" ? "Task started" : "Task complete";
  return (
    <li className="msg msg-li">
      <article
        className="msg-task-lifecycle"
        data-task={variant}
        aria-label={`${label} for turn ${turnId}`}
      >
        <span className="task-label">{label}</span>
        <span className="task-divider" aria-hidden="true">
          ·
        </span>
        <span className="task-turn">turn {turnId}</span>
      </article>
      <InlineWarnings warnings={warnings} />
    </li>
  );
}

/**
 * Inline warning chips rendered below a message body. Each chip is a
 * native `<details>` whose summary carries the severity dot + label
 * + category tag; the expanded body shows the full `reason`. Four
 * placement variants per design.md §9 + checklist #17-20:
 *
 *   - `render-normally`     → chip visible below the body.
 *   - `collapse-by-default` → same chip; the summary copy is generic
 *                             (`{N} warning · <category>`) so the
 *                             reason is hidden until expand.
 *   - `hide-with-inspect`   → chip nested inside a corner `<details>`
 *                             whose summary is an accent-colored
 *                             "Inspect" link, justified to the
 *                             trailing edge.
 *   - `warning-only`        → never reaches this component; the
 *                             `warning-only` RenderHint suppresses
 *                             the message body entirely (banner-only).
 *
 * `warnings === undefined` (or empty) renders nothing — the chip
 * surface is purely additive. The session-level banner still lists
 * every warning regardless of inline classification (Resolved
 * Decision #6).
 */
function InlineWarnings({
  warnings,
}: {
  warnings: InlineWarning[] | undefined;
}) {
  if (!warnings || warnings.length === 0) return null;
  // Partition into placement buckets. `warning-only` is dropped
  // here — the hint layer already routed those to `warning-only`
  // RenderHints (which don't render); a stray classification falling
  // through is a defensive no-op.
  const renderNormally: InlineWarning[] = [];
  const collapseByDefault: InlineWarning[] = [];
  const hideWithInspect: InlineWarning[] = [];
  for (const w of warnings) {
    if (w.classification === "render-normally") renderNormally.push(w);
    else if (w.classification === "collapse-by-default")
      collapseByDefault.push(w);
    else if (w.classification === "hide-with-inspect") hideWithInspect.push(w);
  }
  const hasBelow = renderNormally.length > 0 || collapseByDefault.length > 0;
  const hasCorner = hideWithInspect.length > 0;
  if (!hasBelow && !hasCorner) return null;
  return (
    <>
      {hasBelow ? (
        <div className="chip-wrapper">
          {renderNormally.map((w, i) => (
            <Chip
              key={`rn-${i}`}
              warning={w}
              summaryText={w.reason}
              variant="render-normally"
            />
          ))}
          {collapseByDefault.map((w, i) => (
            <Chip
              key={`cd-${i}`}
              warning={w}
              summaryText="1 warning"
              variant="collapse-by-default"
            />
          ))}
        </div>
      ) : null}
      {hasCorner ? (
        <div className="inspect-affordance">
          <details>
            <summary className="inspect-link">
              {hideWithInspect.length} info · Inspect
            </summary>
            {hideWithInspect.map((w, i) => (
              <Chip
                key={`hi-${i}`}
                warning={w}
                summaryText={w.reason}
                variant="hide-with-inspect"
              />
            ))}
          </details>
        </div>
      ) : null}
    </>
  );
}

function Chip({
  warning,
  summaryText,
  variant,
}: {
  warning: InlineWarning;
  summaryText: string;
  variant:
    | "render-normally"
    | "collapse-by-default"
    | "hide-with-inspect";
}) {
  // Severity → status-dot data-status mapping per design.md §5.4.
  // The status-dot recipe carries authoring contract: every
  // .status-dot MUST have data-status. design.md §6 confirms the
  // four intentional variants; severity ∈ {error/warning/info} maps
  // here.
  const dotStatus: "all-success" | "mixed" | "all-failed" | "in-flight" =
    warning.severity === "error"
      ? "all-failed"
      : warning.severity === "warning"
        ? "mixed"
        : "in-flight";
  return (
    <details
      className="chip"
      data-variant={variant}
      data-classification={warning.classification}
    >
      <summary>
        <span
          className="status-dot"
          data-status={dotStatus}
          aria-hidden="true"
        />
        <span className="chip-label">{summaryText}</span>
        <span className="chip-tag">{warning.category}</span>
      </summary>
      <span className="chip-reason">{warning.reason}</span>
    </details>
  );
}

/**
 * Failure detection over a tool_result body, mirroring the helper in
 * `renderHints.ts`. Re-exported as a small local helper so the
 * LifecycleCard render doesn't need to import the renderHints module
 * (the chip layer already pre-computes per-hint warnings; this is
 * the per-result success/failure cue for the card chrome).
 *
 * Kept byte-aligned with `renderHints.detectFailure`.
 */
function detectFailureStatus(text: string): boolean {
  const lower = text.toLowerCase();
  if (lower.includes('"is_error":true') || lower.includes('"is_error": true'))
    return true;
  if (lower.includes('"iserror":true') || lower.includes('"iserror": true'))
    return true;
  if (lower.includes('"success":false') || lower.includes('"success": false'))
    return true;
  if (/exit_code["']?\s*[:=]\s*([1-9]\d*)/.test(text)) return true;
  if (/(^|\n)\s*status\s*[:=]\s*(failed|error)\b/i.test(text)) return true;
  return false;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Slice an unknown line per spec line 711 + design.md §3.7. The
 * trailing U+2026 ellipsis is appended ONLY when the original text
 * exceeded the 80-char prefix; otherwise the original text is
 * returned verbatim.
 *
 * @internal — exported for testing.
 */
export function renderUnknownLine(text: string): string {
  if (text.length > UNKNOWN_LINE_PREFIX_CHARS) {
    return text.slice(0, UNKNOWN_LINE_PREFIX_CHARS) + "…";
  }
  return text;
}

/**
 * Render a message body with naive code-fence detection per
 * design.md §3.1 + Q-DESIGN-4. Triple-backtick fenced blocks become
 * `<pre class="msg-code-block">`; single-backtick spans become
 * `<code class="msg-code-inline">`. Unterminated fences and
 * cross-line single-backtick spans render as plain text (per
 * design.md §13 Q-DESIGN-4).
 *
 * The detector is render-time (Q1 in m4-plan §5) so the parser
 * surface stays stable.
 */
export function renderBodyWithCode(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  // Fence-pair scan first. Triple-backtick is the strongest signal;
  // resolve it before single-backtick inline code.
  const FENCE = "```";
  let cursor = 0;
  let key = 0;
  while (cursor < text.length) {
    const fenceStart = text.indexOf(FENCE, cursor);
    if (fenceStart === -1) {
      // No more fences — emit the remainder, possibly with inline code.
      out.push(...renderInlineSegment(text.slice(cursor), key));
      break;
    }
    // Emit text before the fence (with inline-code detection).
    if (fenceStart > cursor) {
      out.push(...renderInlineSegment(text.slice(cursor, fenceStart), key));
      key = out.length;
    }
    // Find the matching closing fence.
    const innerStart = fenceStart + FENCE.length;
    const fenceEnd = text.indexOf(FENCE, innerStart);
    if (fenceEnd === -1) {
      // Unterminated fence: render the rest as plain text per
      // design.md §13 Q-DESIGN-4 case 2.
      out.push(...renderInlineSegment(text.slice(fenceStart), key));
      break;
    }
    // Strip the optional language hint after the opening fence.
    let blockBody = text.slice(innerStart, fenceEnd);
    const firstNewline = blockBody.indexOf("\n");
    if (firstNewline !== -1) {
      // Drop everything before the first newline (the language hint).
      blockBody = blockBody.slice(firstNewline + 1);
    }
    out.push(
      <pre
        key={`code-block-${key}`}
        className="msg-code-block"
      >
        {blockBody}
      </pre>,
    );
    key = out.length;
    cursor = fenceEnd + FENCE.length;
  }
  return out;
}

/**
 * Inline-code detection within a non-fenced text segment. Splits on
 * single-backtick pairs and emits `<code class="msg-code-inline">`
 * for each match. Pairs spanning a newline are NOT treated as
 * inline code (per design.md §13 Q-DESIGN-4 case 6).
 */
function renderInlineSegment(text: string, baseKey: number): ReactNode[] {
  if (text.length === 0) return [];
  const parts: ReactNode[] = [];
  let cursor = 0;
  let key = baseKey;
  while (cursor < text.length) {
    const open = text.indexOf("`", cursor);
    if (open === -1) {
      parts.push(text.slice(cursor));
      break;
    }
    if (open > cursor) {
      parts.push(text.slice(cursor, open));
    }
    const close = text.indexOf("`", open + 1);
    if (close === -1) {
      // Unmatched single backtick → emit as plain text.
      parts.push(text.slice(open));
      break;
    }
    const inner = text.slice(open + 1, close);
    if (inner.includes("\n")) {
      // Cross-line backtick pair → render as plain text.
      parts.push(text.slice(open, close + 1));
    } else {
      parts.push(
        <code key={`code-inline-${key}`} className="msg-code-inline">
          {inner}
        </code>,
      );
      key += 1;
    }
    cursor = close + 1;
  }
  return parts;
}

/**
 * Split a tool_result body at the 2 KB byte boundary, walking back
 * to a UTF-8 codepoint boundary so we never split mid-codepoint.
 * Per design.md §9.2 + Q2 in m4-plan §5.
 *
 * @internal — exported for testing.
 */
export function splitToolResult(
  text: string,
  totalBytes: number,
): { head: string; tail: string; tailBytes: number } {
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  const all = enc.encode(text);
  // Defensive: parser-computed `msg.bytes` is approximate. Recompute
  // from the actual bytes so the split arithmetic is always
  // consistent with `all`.
  const trueBytes = all.length;
  if (trueBytes <= TOOL_RESULT_OVERFLOW_BYTES) {
    return { head: text, tail: "", tailBytes: 0 };
  }
  let cut = TOOL_RESULT_OVERFLOW_BYTES;
  // UTF-8 continuation bytes start with bits 10xxxxxx (0x80..0xBF).
  // Walk back until we land on a codepoint-leading byte.
  while (cut > 0 && (all[cut] & 0xc0) === 0x80) {
    cut -= 1;
  }
  const head = dec.decode(all.slice(0, cut));
  const tail = dec.decode(all.slice(cut));
  // Use the parser-reported byte count for the user-facing message:
  // matches what the spec says ("N more bytes") relative to the
  // 2 KB threshold.
  const tailBytes = totalBytes - cut;
  return { head, tail, tailBytes };
}

// ============================================================================
// Phase 7d — Metadata hairlines + echo glyph + cluster disclosure
// ============================================================================

/**
 * Single metadata Message rendered in the marginalia register.
 *
 * - Hairline categories (control / telemetry / title / attachment /
 *   agent / prompt / context) render as a single-line `<p
 *   class="msg-metadata" data-meta-category={...}>` with a
 *   decorative middle-dot prefix and the parser-formatted display
 *   text.
 * - Echo category renders as a quieter row with a single `↺` glyph
 *   (no inline text). The hover tooltip + aria-label resolve the
 *   back-pointer to the canonical `event_msg.{user,agent}_message`
 *   line.
 *
 * @see working/phase-7d/designs/design.md §3.2 + §3.6
 */
function MetadataRow({ hint }: { hint: MetadataHint }) {
  if (hint.category === "echo") {
    const canonical = hint.echoOf?.canonicalKind ?? "user";
    const line = hint.echoOf?.lineOrdinal;
    const tooltip =
      typeof line === "number"
        ? `duplicate of event_msg.${canonical === "assistant" ? "agent" : "user"}_message at line ${line}`
        : `duplicate of event_msg.${canonical === "assistant" ? "agent" : "user"}_message (line unknown)`;
    return (
      <li className="msg msg-li">
        <p
          className="msg-metadata msg-metadata-echo"
          data-meta-category="echo"
          title={tooltip}
          aria-label={hint.ariaLabel}
        >
          <span className="meta-prefix meta-prefix-echo" aria-hidden="true">
            ↺
          </span>
        </p>
      </li>
    );
  }
  return (
    <li className="msg msg-li">
      <p
        className="msg-metadata"
        data-meta-category={hint.category}
        aria-label={hint.ariaLabel}
        title={hint.raw}
      >
        <span className="meta-prefix" aria-hidden="true">
          ·
        </span>
        <span className="meta-text">{hint.display}</span>
      </p>
    </li>
  );
}

/**
 * Cluster of 2+ adjacent metadata Messages rendered as a native
 * `<details>` disclosure. The summary says "N metadata events"; the
 * body re-renders each member as a `<MetadataRow>` in original order.
 *
 * @see working/phase-7d/designs/design.md §4.4
 */
function MetadataCluster({
  hint,
}: {
  hint: Extract<RenderHint, { kind: "metadata-cluster-head" }>;
}) {
  const count = hint.members.length;
  return (
    <li className="msg msg-li">
      <details className="msg-metadata-cluster">
        <summary aria-label={`${count} metadata events, click to expand`}>
          <span className="meta-prefix" aria-hidden="true">
            ·
          </span>
          <span className="meta-cluster-count">{count} metadata events</span>
        </summary>
        <ol className="meta-cluster-body" role="list">
          {hint.members.map((member, idx) => (
            <MetadataRow key={`${hint.messageIndices[idx]}`} hint={member} />
          ))}
        </ol>
      </details>
    </li>
  );
}

function MessageTime({ iso, now }: { iso: string | null; now: string }) {
  if (iso === null) {
    return <time>—</time>;
  }
  const rel = relativeTimeFrom(now, iso);
  return (
    <time dateTime={iso} title={iso}>
      {rel}
    </time>
  );
}
