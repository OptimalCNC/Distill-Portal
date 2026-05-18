// Phase 9b M3-B — per-operation card.
//
// Renders a single `Operation` as a native `<details class="jc-card">`
// summary tile inside the Job Center tray. The summary row is a CSS
// Grid layout (kind icon / kind label + relative time / status pill /
// full-width bottom row); the expanded panel surfaces submission
// timestamps and (for terminal ops) a pretty-JSON `<pre>` block built
// from `result_json` or `error_json`.
//
// Design source-of-truth: `working/phase-9b/designs/m1-job-center/
// design.md` §3.5 (card anatomy), §3.6 (pill recipe matrix), §3.7
// (expanded panel + null-payload skip rule). The 54-item acceptance
// checklist in §10 covers items 24–35 and 39–44 here.
//
// Pinned implementation rules (per m3-plan.md §7):
//   1. Uniform expanded-panel rule. `<dl class="jc-expand-meta">`
//      always renders; the `<pre>` renders only when the relevant JSON
//      column is non-null AND status is terminal. `cancelled` /
//      `interrupted` with both payloads null get the `<dl>` only.
//   2. Status pill is inline JSX in this file — no standalone module.
//   3. The pulsing dot animation is toggled via `data-pulse="true"` on
//      the pill (CSS keyframes scoped to that attribute); the dot
//      element NEVER remounts on status change, so the animation
//      survives status flips without restart.
//
// Cancel behavior (items 36–39): the cancel button is `type="button"`
// and rendered ONLY for active ops. While the op is
// `cancel_requested`, the button is `[disabled]` with label
// "Cancelling…". The 409 race is handled by `useOperationsFeed`'s
// cancel wrapper; this component does not see it.

import type { ReactNode } from "react";
import type { Operation, OperationKind, OperationStatus } from "../../lib/contracts";
import "./OperationCard.css";

/**
 * Relative-time helper for the Job Center per-operation card.
 *
 * Exported (rather than module-local) so the sibling test file can
 * exercise the threshold boundaries without round-tripping through a
 * full `<OperationCard>` mount. The helper is pure and reads
 * `Date.now()` itself; the card is a live-update surface and never
 * needs to pin a wall-clock instant.
 *
 * Output forms (mirrors M1 design.md §3.5 "Relative time"):
 *   - 0–60 seconds  -> "Ns ago"
 *   - 1–60 minutes  -> "Nm ago"
 *   - 1–24 hours    -> "Nh ago"
 *   - 1–7 days      -> "Nd ago"
 *   - 7 days+       -> absolute "DD Mon HH:MM" in UTC
 *   - invalid ISO   -> the original string (defensive)
 */
export function formatRelativeTime(iso: string): string {
  const thenMs = Date.parse(iso);
  if (Number.isNaN(thenMs)) return iso;

  const nowMs = Date.now();
  const deltaMs = nowMs - thenMs;
  const absMs = Math.abs(deltaMs);

  const SECOND_MS = 1_000;
  const MINUTE_MS = 60 * SECOND_MS;
  const HOUR_MS = 60 * MINUTE_MS;
  const DAY_MS = 24 * HOUR_MS;
  const WEEK_MS = 7 * DAY_MS;

  if (absMs < MINUTE_MS) {
    const seconds = Math.max(0, Math.floor(absMs / SECOND_MS));
    return `${seconds}s ago`;
  }
  if (absMs < HOUR_MS) {
    const minutes = Math.floor(absMs / MINUTE_MS);
    return `${minutes}m ago`;
  }
  if (absMs < DAY_MS) {
    const hours = Math.floor(absMs / HOUR_MS);
    return `${hours}h ago`;
  }
  if (absMs < WEEK_MS) {
    const days = Math.floor(absMs / DAY_MS);
    return `${days}d ago`;
  }

  // Older than ~7 days — render an absolute UTC label.
  const d = new Date(thenMs);
  const day = String(d.getUTCDate()).padStart(2, "0");
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  const mon = months[d.getUTCMonth()];
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${day} ${mon} ${hh}:${mm}`;
}

export interface OperationCardProps {
  op: Operation;
  onCancel: (id: string) => void;
}

const KIND_GLYPH: Record<OperationKind, string> = {
  import_sessions: "I",
  rescan_sources: "R",
};

const KIND_LABEL: Record<OperationKind, string> = {
  import_sessions: "Import sessions",
  rescan_sources: "Rescan sources",
};

const STATUS_LABEL: Record<OperationStatus, string> = {
  queued: "Queued",
  running: "Running",
  cancel_requested: "Cancelling",
  succeeded: "Succeeded",
  failed: "Failed",
  cancelled: "Cancelled",
  interrupted: "Interrupted",
};

const ACTIVE_STATUSES: ReadonlySet<OperationStatus> = new Set([
  "queued",
  "running",
  "cancel_requested",
]);

const TERMINAL_STATUSES: ReadonlySet<OperationStatus> = new Set([
  "succeeded",
  "failed",
  "cancelled",
  "interrupted",
]);

function isActive(op: Operation): boolean {
  return ACTIVE_STATUSES.has(op.status);
}

function isTerminal(op: Operation): boolean {
  return TERMINAL_STATUSES.has(op.status);
}

function kindGlyph(kind: OperationKind | string): string {
  return KIND_GLYPH[kind as OperationKind] ?? "?";
}

function kindLabel(kind: OperationKind | string): string {
  return KIND_LABEL[kind as OperationKind] ?? String(kind);
}

function truncate(text: string, max = 40): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

// Build the inline summary line for terminal ops. Active ops use a
// different bottom-row element (cancel button) so they never call this
// helper.
function summaryTextForTerminal(op: Operation): string {
  switch (op.status) {
    case "succeeded":
      return successSummary(op);
    case "failed":
      return failureSummary(op);
    case "cancelled":
      return "Cancelled";
    case "interrupted":
      return "Interrupted";
    default:
      return STATUS_LABEL[op.status] ?? String(op.status);
  }
}

function successSummary(op: Operation): string {
  const result = op.result_json as Record<string, unknown> | null;
  if (!result || typeof result !== "object") return "Succeeded";

  // import_sessions result_json shape: { imported, skipped, failed, ... }
  if (op.kind === "import_sessions") {
    const imported = numericField(result, "imported");
    const skipped = numericField(result, "skipped");
    const failed = numericField(result, "failed");
    if (imported !== null) {
      if (failed !== null && failed > 0) {
        return `${imported} imported, ${failed} failed`;
      }
      if (skipped !== null) {
        return `${imported} imported, ${skipped} skipped`;
      }
      return `${imported} imported`;
    }
  }

  // rescan_sources result_json shape: { scans/new/discovered/... }
  if (op.kind === "rescan_sources") {
    const scans = numericField(result, "scans") ?? numericField(result, "scanned");
    const fresh = numericField(result, "new") ?? numericField(result, "discovered");
    if (scans !== null && fresh !== null) {
      return `${scans} scans, ${fresh} new`;
    }
    if (scans !== null) return `${scans} scans`;
    if (fresh !== null) return `${fresh} new`;
  }

  return "Succeeded";
}

function failureSummary(op: Operation): string {
  const err = op.error_json as Record<string, unknown> | null;
  if (err && typeof err === "object") {
    const message = err["message"];
    if (typeof message === "string" && message.length > 0) return message;
    const detail = err["detail"];
    if (typeof detail === "string" && detail.length > 0) return detail;
  }
  return "Failed";
}

function numericField(
  obj: Record<string, unknown>,
  key: string,
): number | null {
  const value = obj[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

// JSON pretty-printer. When both payloads happen to be non-null (which
// the backend prevents but defend anyway) prefer result_json.
function prettyJson(op: Operation): string {
  const payload =
    op.result_json !== null && op.result_json !== undefined
      ? op.result_json
      : op.error_json;
  return JSON.stringify(payload, null, 2);
}

// Format an ISO timestamp for the `<dd>` slot. Falls back to the raw
// string if Date.parse fails.
function formatIso(iso: string | null | undefined): string {
  if (iso === null || iso === undefined) return "—";
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return iso;
  return new Date(parsed).toISOString();
}

export function OperationCard({ op, onCancel }: OperationCardProps): ReactNode {
  const glyph = kindGlyph(op.kind);
  const label = kindLabel(op.kind);
  const statusLabel = STATUS_LABEL[op.status] ?? String(op.status);
  const relativeTime = formatRelativeTime(op.submitted_at);
  const showPre =
    isTerminal(op) && (op.result_json !== null || op.error_json !== null);

  let bottomRow: ReactNode;
  if (isActive(op) && op.status !== "cancel_requested") {
    bottomRow = (
      <button
        type="button"
        className="jc-cancel"
        onClick={() => onCancel(op.id)}
      >
        Cancel
      </button>
    );
  } else if (op.status === "cancel_requested") {
    bottomRow = (
      <button type="button" className="jc-cancel" disabled>
        Cancelling…
      </button>
    );
  } else {
    const full = summaryTextForTerminal(op);
    const short = truncate(full);
    bottomRow = (
      <span className="jc-summary-text" title={full}>
        {short}
      </span>
    );
  }

  return (
    <details className="jc-card">
      <summary className="jc-card-summary">
        <span className="jc-icon" aria-hidden="true">{glyph}</span>
        <span className="jc-kind">{label}</span>
        <time
          className="jc-time"
          dateTime={op.submitted_at}
          title={op.submitted_at}
        >
          {relativeTime}
        </time>
        <span
          className={`jc-pill ${op.status}`}
          data-pulse={op.status === "running" ? "true" : undefined}
        >
          <span className="jc-pill-dot" aria-hidden="true" />
          <span className="jc-pill-label">{statusLabel}</span>
        </span>
        <div className="jc-bottom-row">{bottomRow}</div>
      </summary>
      <div className="jc-expand">
        <dl className="jc-expand-meta">
          <div>
            <dt>Submitted</dt>
            <dd>{formatIso(op.submitted_at)}</dd>
          </div>
          {op.started_at !== null && op.started_at !== undefined ? (
            <div>
              <dt>Started</dt>
              <dd>{formatIso(op.started_at)}</dd>
            </div>
          ) : null}
          {op.finished_at !== null && op.finished_at !== undefined ? (
            <div>
              <dt>Finished</dt>
              <dd>{formatIso(op.finished_at)}</dd>
            </div>
          ) : null}
        </dl>
        {showPre ? (
          <pre className="jc-expand-json">{prettyJson(op)}</pre>
        ) : null}
      </div>
    </details>
  );
}
