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

import { useEffect, useState, type ReactNode } from "react";
import { BoundaryRow } from "./BoundaryRow";
import { relativeTimeFrom } from "./relativeTime";
import { useParsedSession } from "./useParsedSession";
import type { Message, ParsedSession, ParseWarning } from "./parsers";
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
          {slicedMessages.map((msg) => (
            <MessageRow key={msg.messageIndex} msg={msg} now={now} />
          ))}
        </ol>
      )}
    </section>
  );
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

function MessageRow({ msg, now }: { msg: Message; now: string }) {
  switch (msg.kind) {
    case "user":
      return <UserMessage msg={msg} now={now} />;
    case "assistant":
      return <AssistantMessage msg={msg} now={now} />;
    case "tool_use":
      return <ToolUseMessage msg={msg} now={now} />;
    case "tool_result":
      return <ToolResultMessage msg={msg} now={now} />;
    case "system":
      return <SystemMessage msg={msg} />;
    case "boundary":
      return <BoundaryMessage msg={msg} />;
    case "unknown":
      return <UnknownMessage msg={msg} />;
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

function UserMessage({ msg, now }: { msg: Message; now: string }) {
  return (
    <li className="msg msg-li">
      <article className="msg-panel msg-user">
        <header className="msg-attr">
          <span>User</span>
          <span aria-hidden="true"> · </span>
          <MessageTime iso={msg.timestamp} now={now} />
        </header>
        <div className="msg-body">{renderBodyWithCode(msg.text)}</div>
      </article>
    </li>
  );
}

function AssistantMessage({ msg, now }: { msg: Message; now: string }) {
  return (
    <li className="msg msg-li">
      <article className="msg-panel msg-assistant">
        <header className="msg-attr">
          <span>Assistant</span>
          <span aria-hidden="true"> · </span>
          <MessageTime iso={msg.timestamp} now={now} />
        </header>
        <div className="msg-body">{renderBodyWithCode(msg.text)}</div>
      </article>
    </li>
  );
}

function ToolUseMessage({ msg, now }: { msg: Message; now: string }) {
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
      </article>
    </li>
  );
}

function ToolResultMessage({ msg, now }: { msg: Message; now: string }) {
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
      </article>
    </li>
  );
}

function SystemMessage({ msg }: { msg: Message }) {
  return (
    <li className="msg msg-li">
      <p className="msg-panel msg-system">
        <span className="msg-system-glyph" aria-hidden="true">
          system ·
        </span>{" "}
        {msg.text}
      </p>
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

function UnknownMessage({ msg }: { msg: Message }) {
  const slice = renderUnknownLine(msg.text);
  return (
    <li className="msg msg-li">
      <p className="msg-panel msg-unknown">
        <span className="msg-unknown-prefix">Unrecognized line:</span>{" "}
        <span className="msg-unknown-payload">{slice}</span>
      </p>
    </li>
  );
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
