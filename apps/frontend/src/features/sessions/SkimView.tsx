// Skim tab body for the Phase-5 right-pane Tabs shell.
//
// Phase 5 / Milestone 5 — second visible UI surface that consumes the
// M3 parser pipeline (`useParsedSession` from M3b -> typed messages
// + `parsed.skim` from M3a `buildSkim`). Renders the editorial
// outline of a session with four block kinds: `user_turn`,
// `boundary`, `agent_only`, `oversized_user_message`. All copy is
// verbatim from the spec at `working/phase-5.md` lines 679-697
// (frozen at 05467ad).
//
// Architecture (per design.md §1):
//   - Top-level state-discriminator switches on
//     `useParsedSession(row).state` mirroring TranscriptView:
//     `idle | no_raw | loading | error` -> single muted line;
//     `success | truncated` -> `<SkimBody>` subtree.
//   - `<SkimBody>` mounts the truncation banner (only when
//     `state === "truncated"`), the parse-warnings disclosure (only
//     when `warnings.length > 0` AND not yet dismissed), and the
//     per-block outline as an `<ol>`.
//   - Each `<SkimBlockRow>` switches on `block.kind` and emits the
//     kind-specific shell; the switch's default branch is the
//     TypeScript exhaustiveness check (`const _: never = block.kind`)
//     so a future `BlockKind` addition fails the build until it gets
//     a render branch.
//
// Critical correctness items (one entry per documented codex catch
// precedent — see m5-plan §6):
//   - **Spec-literal copy**: every visible string anchored to a spec
//     line. "Agent reaction (N messages)" / "Agent-only session (N
//     messages)" use the verbatim `({count} messages)` form even for
//     N=0 / N=1 (spec literal beats English grammar — M3a precedent).
//     "Oversized user message ({N} KB) — collapsed by default" uses
//     U+2014 EM DASH. Disabled placeholder copy uses straight ASCII
//     double quotes around "Expand to raw messages" exactly as the
//     spec shows. Truncation banner + parse-warnings banner copy
//     mirrors TranscriptView verbatim (Q12 in m5-plan).
//   - **Keep-mounted contract**: NO `key=` on the SkimView root or
//     descendants except `<SkimBlockRow key={`${kind}-${start}-${end}`}>`
//     (content-keyed, NOT tab-keyed). Native `<details>` open state is
//     browser-managed; survives tab switches because the React node
//     identity is stable. The only natural reset is row identity
//     change handled by the parent `<SessionView key={selectedRowKey}>`
//     remount + a defensive `useEffect` reset on `row.rowKey`.
//   - **Token discipline**: zero new tokens. Every `var(--…)`
//     reference resolves to a token in `apps/frontend/src/styles/
//     tokens.css`. Hex isolation invariant preserved (24).
//   - **Motion budget**: only `opacity` + `transform: translateY`
//     (the skim-block stagger keyframe, spec table row 9), `opacity`
//     (the truncation banner entrance, M4 inherited), and `<details>`
//     `block-size` (the M2b global exemption). NO animated `color`,
//     `border-color`, `width`, `height`, `top`, `padding`,
//     `transform on .skim-block panels` outside the keyframe,
//     `background-color on .skim-block panels`. See SkimView.css for
//     the explicit authorizations.
//   - **a11y**: `<section aria-label="Session skim outline">` anchors
//     the surface; per-block `<li>`s carry implicit `role="listitem"`
//     except `boundary` (which becomes `role="separator"` via
//     BoundaryRow); `<details>` summaries are keyboard-focusable;
//     Retry button has accessible name "Retry"; Dismiss button has
//     accessible name "Dismiss"; "Expand to raw messages" affordance
//     is a `<summary>` element (planner Q3) — native keyboard
//     handling.
//
// JSDoc rationale (do NOT "fix" the grammar): the spec at
// `working/phase-5.md:685, 693, 695, 717` is treated as a literal
// string. For N=1 "Agent reaction (1 messages)" reads as
// grammatically odd in English but is spec-precedent compliant.
// Codex verified spec literals beat English grammar in M3a r1; do
// NOT swap in a singular form.
//
// @see working/phase-5.md:679-697 (Skim tab body)
// @see working/phase-5/designs/m5-skim/design.md (full design)
// @see working/phase-5/m5-plan.md (implementation plan)

import { useEffect, useState } from "react";
import { BoundaryRow } from "./BoundaryRow";
import { TranscriptView, renderBodyWithCode } from "./TranscriptView";
import { useParsedSession } from "./useParsedSession";
import type { ParsedSession, ParseWarning, SkimBlock } from "./parsers";
import type { SessionRow } from "./types";
import "./SkimView.css";

/**
 * Stagger cap per spec line 75 + 1100 ("Skim-block stagger capped at
 * 8 blocks"). Block index >= 8 all receive the 320 ms delay.
 */
const STAGGER_CAP = 8;
/**
 * Per-step delay multiplier per spec table row 9 ("40 ms × N").
 */
const STAGGER_STEP_MS = 40;

export type SkimViewProps = {
  /** Selected session row. */
  row: SessionRow;
  /**
   * Pinned-`now` ISO string. Forwarded to the scoped TranscriptView
   * mounted under user_turn / agent_only disclosures so timestamps
   * render deterministically in tests.
   */
  now: string;
};

export function SkimView({ row, now }: SkimViewProps) {
  const result = useParsedSession(row);
  const [warningsBannerDismissed, setWarningsBannerDismissed] =
    useState<boolean>(false);

  // Defensive reset: `<SessionView key={selectedRowKey}>` already
  // destroys this component on selection change, but the belt-and-
  // suspenders `useEffect` clears the dismissed-state if `row.rowKey`
  // changes without a parent-level remount (mirrors TranscriptView).
  useEffect(() => {
    setWarningsBannerDismissed(false);
  }, [row.rowKey]);

  if (result.state === "idle") {
    return (
      <p className="skim-empty">Select a session to read its skim outline.</p>
    );
  }
  if (result.state === "no_raw") {
    return (
      <p className="skim-not-imported">
        This session has not been imported yet — only the source-side
        metadata is available. Click <strong>Import</strong> in the
        action bar to fetch the raw payload.
      </p>
    );
  }
  if (result.state === "loading") {
    return <p className="skim-loading">Reading session…</p>;
  }
  if (result.state === "error") {
    return (
      <div className="skim-error-block">
        <p className="skim-error">
          Could not load session: {result.error.message}.
        </p>
        <p>
          <button
            type="button"
            className="skim-retry"
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
    <SkimBody
      parsed={result.parsed}
      now={now}
      truncated={result.state === "truncated"}
      row={row}
      warningsBannerDismissed={warningsBannerDismissed}
      onDismissWarnings={() => setWarningsBannerDismissed(true)}
    />
  );
}

function SkimBody({
  parsed,
  now,
  truncated,
  row,
  warningsBannerDismissed,
  onDismissWarnings,
}: {
  parsed: ParsedSession;
  now: string;
  truncated: boolean;
  row: SessionRow;
  warningsBannerDismissed: boolean;
  onDismissWarnings: () => void;
}) {
  return (
    <section className="skim-body" aria-label="Session skim outline">
      {truncated ? <TruncationBanner /> : null}
      {parsed.warnings.length > 0 && !warningsBannerDismissed ? (
        <ParseWarningsBanner
          warnings={parsed.warnings}
          onDismiss={onDismissWarnings}
        />
      ) : null}
      {parsed.skim.length === 0 ? (
        <p className="skim-empty-stream">No skim blocks parsed.</p>
      ) : (
        <ol className="skim-stream">
          {parsed.skim.map((block, idx) => (
            <SkimBlockRow
              key={`${block.kind}-${block.start}-${block.end}`}
              block={block}
              parsed={parsed}
              now={now}
              row={row}
              staggerIndex={Math.min(idx, STAGGER_CAP)}
            />
          ))}
        </ol>
      )}
    </section>
  );
}

function TruncationBanner() {
  return (
    <div
      className="skim-banner skim-banner-truncation"
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
  // Spec literal beats English grammar (M3a r1 precedent): for N=1
  // this reads as "1 parse warnings — click to view." which is
  // grammatically odd but spec-precedent compliant. Mirrors
  // TranscriptView's banner verbatim (Q12 in m5-plan).
  return (
    <details className="skim-banner skim-banner-warnings">
      <summary>{warnings.length} parse warnings — click to view.</summary>
      <ul className="skim-warnings-list">
        {warnings.map((w, idx) => (
          <li key={`${w.lineOrdinal}-${idx}`}>
            line {w.lineOrdinal} · {w.reason}
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="skim-banner-dismiss"
        onClick={onDismiss}
      >
        Dismiss
      </button>
    </details>
  );
}

function SkimBlockRow({
  block,
  parsed,
  now,
  row,
  staggerIndex,
}: {
  block: SkimBlock;
  parsed: ParsedSession;
  now: string;
  row: SessionRow;
  staggerIndex: number;
}) {
  switch (block.kind) {
    case "user_turn":
      return (
        <UserTurnBlock
          block={block}
          parsed={parsed}
          now={now}
          row={row}
          staggerIndex={staggerIndex}
        />
      );
    case "boundary": {
      const subtype = block.meta?.["subtype"];
      const typedSubtype =
        subtype === "session_resumed" || subtype === "compacted"
          ? subtype
          : undefined;
      return <BoundaryRow subtype={typedSubtype} staggerIndex={staggerIndex} />;
    }
    case "agent_only":
      return (
        <AgentOnlyBlock
          block={block}
          row={row}
          now={now}
          staggerIndex={staggerIndex}
        />
      );
    case "oversized_user_message":
      return (
        <OversizedUserMessageBlock
          block={block}
          parsed={parsed}
          staggerIndex={staggerIndex}
        />
      );
    default: {
      // Exhaustiveness: a future BlockKind without a render branch
      // breaks the build here. Per m5-plan §6 catch #12.
      const _exhaustive: never = block.kind;
      void _exhaustive;
      return null;
    }
  }
}

function staggerStyle(idx: number): React.CSSProperties {
  return { animationDelay: `${idx * STAGGER_STEP_MS}ms` };
}

// ============================================================================
// Per-kind blocks
// ============================================================================

function UserTurnBlock({
  block,
  parsed,
  now,
  row,
  staggerIndex,
}: {
  block: SkimBlock;
  parsed: ParsedSession;
  now: string;
  row: SessionRow;
  staggerIndex: number;
}) {
  const reactionCount = block.end - block.start;
  const userMsg = parsed.messages[block.start];
  return (
    <li
      className="skim-block skim-block-user-turn"
      style={staggerStyle(staggerIndex)}
    >
      <article className="skim-user-panel">
        <div className="skim-user-body">
          {renderBodyWithCode(userMsg?.text ?? "")}
        </div>
      </article>
      <details className="skim-agent-reaction">
        <summary className="skim-agent-reaction-summary">
          Agent reaction ({reactionCount} messages)
        </summary>
        <div className="skim-agent-reaction-body">
          <p className="skim-summary-disabled">
            Summary disabled — generation deferred to a later phase. Use
            "Expand to raw messages" to read the agent's response inline.
          </p>
          <details className="skim-expand-raw">
            <summary className="skim-expand-raw-summary">
              Expand to raw messages
            </summary>
            <div className="skim-expand-raw-body">
              <TranscriptView
                row={row}
                now={now}
                messageRange={{ start: block.start + 1, end: block.end }}
              />
            </div>
          </details>
        </div>
      </details>
    </li>
  );
}

function AgentOnlyBlock({
  block,
  row,
  now,
  staggerIndex,
}: {
  block: SkimBlock;
  row: SessionRow;
  now: string;
  staggerIndex: number;
}) {
  // Inclusive count: end - start + 1. Empty-stream sentinel
  // `{start: 0, end: -1, meta: {empty: 1}}` -> count = 0.
  const count = block.end - block.start + 1;
  return (
    <li
      className="skim-block skim-block-agent-only"
      style={staggerStyle(staggerIndex)}
    >
      <details className="skim-agent-only">
        <summary className="skim-agent-only-summary">
          Agent-only session ({count} messages)
        </summary>
        <div className="skim-agent-only-body">
          <TranscriptView
            row={row}
            now={now}
            messageRange={{ start: block.start, end: block.end }}
          />
        </div>
      </details>
    </li>
  );
}

function OversizedUserMessageBlock({
  block,
  parsed,
  staggerIndex,
}: {
  block: SkimBlock;
  parsed: ParsedSession;
  staggerIndex: number;
}) {
  const sizeBytesRaw = block.meta?.["sizeBytes"];
  const sizeBytes =
    typeof sizeBytesRaw === "number" ? sizeBytesRaw : 0;
  // Per planner Q11: Math.round(sizeBytes / 1024). Documented so a
  // maintainer doesn't "fix" it to floor/ceil.
  const sizeKB = Math.round(sizeBytes / 1024);
  const text = parsed.messages[block.start]?.text ?? "";
  return (
    <li
      className="skim-block skim-block-oversized"
      style={staggerStyle(staggerIndex)}
    >
      <details className="skim-oversized">
        <summary className="skim-oversized-summary">
          Oversized user message ({sizeKB} KB) — collapsed by default
        </summary>
        <div className="skim-oversized-body">
          <pre className="skim-oversized-pre">{text}</pre>
        </div>
      </details>
    </li>
  );
}
