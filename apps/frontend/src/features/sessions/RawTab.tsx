// Raw tab body for the Phase-5 right-pane Tabs shell.
//
// Extracted from `SessionDetail.tsx`'s `RawPreviewBlock` byte-
// equivalently (Phase 4 contract preserved). PLUS the M2b
// "Not yet imported" branch when `row.storedSessionUid === null`
// (Resolved Decision #18 — Metadata + Raw never trigger the
// `useParsedSession` fetch; for source-only rows Raw cannot
// reach `/api/v1/sessions/<uid>/raw` because the URL doesn't exist).
//
// State machine (RawPreviewState from `rawPreview.ts`):
//   idle / loading → "Loading raw preview…" muted prose
//   success        → <pre> of decoded NDJSON lines + caption
//   error          → "Failed to load raw preview: <message>" + Retry
//   non_2xx        → "HTTP <status>: <bodySnippet>" + Retry
//   not_imported   → quiet muted prose (NEW for M2b; never fires
//                    the fetch)
//
// AbortController cleanup (design.md §9 acceptance #40):
//   The `useEffect` cleanup aborts the in-flight fetch ONLY on
//     (1) selectedRowKey change → outer SessionView remounts →
//         RawTab unmounts → cleanup runs;
//     (2) row.storedSessionUid change → useEffect dep change;
//     (3) Retry button bumps `attempt` → useEffect dep change;
//     (4) SessionView itself unmounts.
//   Tab switches are NOT a cleanup trigger — the panel stays
//   React-mounted across tab switches per the keep-mounted contract
//   (Resolved Decision #12 + spec lines 650–658). Switching tabs
//   only toggles `hidden`, the inline `style.animation`, and
//   `tabIndex` on the parent `<div role="tabpanel">` — RawTab's
//   `useEffect` does NOT re-run.
//
// Caption strings preserved EXACTLY from Phase 4
// (`describeCaption(lineCount, reachedLineCap, reachedByteCap)`):
//   - byte cap fired → "Stopped at byte cap — full payload not
//                       downloaded."
//   - line cap fired → `Showing first ${N} lines of the raw payload.`
//   - neither cap     → `Showing first ${N} lines (full payload below
//                       the caps).`
//   - both caps       → byte-cap caption wins.
//
// Non-JSON fallback line marker preserved verbatim ("(non-JSON
// line)"); styling uses the muted-italic cascade in RawTab.css
// (NOT the warn-color text — codex measured warn-on-surface-raised
// at 3.97:1 light, which fails AA for normal text; muted passes —
// see colors.md row R03).
import { useCallback, useEffect, useState } from "react";
import { ApiError, streamSessionRaw } from "../../lib/api";
import {
  consumeRawPreview,
  type RawPreviewLine,
  type RawPreviewState,
} from "./rawPreview";
import type { SessionRow } from "./types";
import "./RawTab.css";

export type RawTabProps = {
  row: SessionRow;
};

export function RawTab({ row }: RawTabProps) {
  // Source-only rows short-circuit before any fetch state — render
  // the "Not yet imported" branch.
  if (row.storedSessionUid === null) {
    return (
      <div className="raw-tab">
        <p className="raw-not-imported">
          This session has not been imported yet — only the source-
          side metadata is available. Click Import in the action bar
          to fetch the raw payload.
        </p>
      </div>
    );
  }
  return <RawTabFetching sessionUid={row.storedSessionUid} />;
}

function RawTabFetching({ sessionUid }: { sessionUid: string }) {
  const [state, setState] = useState<RawPreviewState>({ kind: "loading" });
  // Bumping `attempt` re-runs the effect. Same pattern as the Phase 4
  // `RawPreviewBlock`.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setState({ kind: "loading" });

    void (async () => {
      try {
        const response = await streamSessionRaw(sessionUid, controller.signal);
        const result = await consumeRawPreview(response, controller.signal);
        if (!cancelled) {
          setState(result);
        }
      } catch (err) {
        if (isAbortError(err)) return;
        if (cancelled) return;
        if (err instanceof ApiError) {
          setState({
            kind: "non_2xx",
            status: err.status,
            bodySnippet: truncateForDisplay(err.body),
          });
          return;
        }
        const message = err instanceof Error ? err.message : String(err);
        setState({ kind: "error", message });
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [sessionUid, attempt]);

  const handleRetry = useCallback(() => {
    setAttempt((a) => a + 1);
  }, []);

  if (state.kind === "idle" || state.kind === "loading") {
    return (
      <div className="raw-tab">
        <p className="raw-loading">Loading raw preview…</p>
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div className="raw-tab">
        <p className="raw-error">
          Failed to load raw preview: {state.message}
        </p>
        <p>
          <button type="button" className="raw-retry" onClick={handleRetry}>
            Retry
          </button>
        </p>
      </div>
    );
  }

  if (state.kind === "non_2xx") {
    return (
      <div className="raw-tab">
        <p className="raw-error">
          HTTP {state.status}: {state.bodySnippet}
        </p>
        <p>
          <button type="button" className="raw-retry" onClick={handleRetry}>
            Retry
          </button>
        </p>
      </div>
    );
  }

  // success
  const { lines, reachedLineCap, reachedByteCap } = state;
  const caption = describeCaption(
    lines.length,
    reachedLineCap,
    reachedByteCap,
  );

  return (
    <div className="raw-tab">
      <pre className="raw-pre" aria-label="Raw NDJSON preview">
        {lines.map((line, idx) => (
          <RawTabLineRow key={idx} line={line} />
        ))}
      </pre>
      <p className="raw-caption">{caption}</p>
    </div>
  );
}

function RawTabLineRow({ line }: { line: RawPreviewLine }) {
  if (line.kind === "json") {
    return <div className="line">{line.raw}</div>;
  }
  return (
    <div className="line text">
      {line.raw}
      {" "}
      <span className="raw-fallback-marker">(non-JSON line)</span>
    </div>
  );
}

function describeCaption(
  lineCount: number,
  reachedLineCap: boolean,
  reachedByteCap: boolean,
): string {
  if (reachedByteCap) {
    return "Stopped at byte cap — full payload not downloaded.";
  }
  if (reachedLineCap) {
    return `Showing first ${lineCount} lines of the raw payload.`;
  }
  return `Showing first ${lineCount} lines (full payload below the caps).`;
}

function truncateForDisplay(body: string, maxChars = 240): string {
  if (body.length <= maxChars) return body;
  return `${body.slice(0, maxChars)}…`;
}

function isAbortError(err: unknown): boolean {
  if (err === null || err === undefined) return false;
  if (typeof err !== "object") return false;
  const name = (err as { name?: unknown }).name;
  return name === "AbortError";
}
