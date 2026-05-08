// Metadata tab body for the Phase-5 right-pane Tabs shell.
//
// Extracted from `SessionDetail.tsx` lines 130–256 (Phase 4 drawer
// body) byte-equivalently per design.md §3.3:
//   - Same 18 fields rendered as a `<dl class="metadata-meta">`
//     with snake_case `<dt>` text and `mono`-classed `<dd>` for
//     identifier-style values. The single exception is the
//     source-path `<dt>`, which derives from `sourcePathLabel`
//     ("Source path:" or "Last seen source path:") with the trailing
//     colon stripped — matches Phase 4 verbatim.
//   - Same Copy path button + Clipboard-API → manual-selection
//     fallback. Hint copy preserved verbatim ("Copied" / "Selected
//     — press Ctrl/Cmd + C to copy").
//   - Same status pill recipe (the `.badge {variant}` pill is
//     rendered inline; `variant = status.replace(/_/g, "-")`
//     and the visible text is `status.replace(/_/g, " ")`).
//   - Same "View raw" anchor recipe — rendered ONLY when
//     `row.storedSessionUid !== null` (Phase 4 invariant preserved).
//
// NEW for M2b (Resolved Decision #8):
//   - Subagent sidecar badge: dashed-hairline informational chip
//     INLINE next to the `has_subagent_sidecars: true` value (NOT a
//     top-of-pane banner). Reads as a footnote on the field rather
//     than a warning at the top.
//
// SessionMetadata is presentational. The parent (SessionView, via
// the Tabs primitive) passes `row` + `now`; this component owns no
// fetch state and never reaches outside its props. The Phase-4
// `<SessionDetail>` component remains on disk through M5 (Resolved
// Decision #6) and is no longer reachable from the running app —
// this extraction is a NEW component, NOT an in-place edit.
import { useEffect, useRef, useState } from "react";
import { relativeTimeFrom } from "./relativeTime";
import type { SessionRow } from "./types";
import "./SessionMetadata.css";

export type SessionMetadataProps = {
  row: SessionRow;
  /** Pinned-`now` ISO string used for relative-time labelling. */
  now: string;
};

const COPY_HINT_TIMEOUT_MS = 2000;

export function SessionMetadata({ row, now }: SessionMetadataProps) {
  const sourcePath = row.sourcePath;
  const sourcePathRef = useRef<HTMLSpanElement | null>(null);
  const [copyHint, setCopyHint] = useState<
    "idle" | "copied" | "fallback"
  >("idle");

  useEffect(() => {
    if (copyHint === "idle") return;
    const id = setTimeout(() => setCopyHint("idle"), COPY_HINT_TIMEOUT_MS);
    return () => clearTimeout(id);
  }, [copyHint]);

  useEffect(() => {
    setCopyHint("idle");
  }, [row.rowKey]);

  const handleCopyPath = async () => {
    const clipboard = (
      globalThis as unknown as {
        navigator?: { clipboard?: { writeText?: (s: string) => Promise<void> } };
      }
    ).navigator?.clipboard;
    if (clipboard?.writeText) {
      try {
        await clipboard.writeText(sourcePath);
        setCopyHint("copied");
        return;
      } catch {
        // Fall through to manual-select fallback.
      }
    }
    const span = sourcePathRef.current;
    if (span !== null) {
      const range = document.createRange();
      range.selectNodeContents(span);
      const selection = (
        globalThis as unknown as { getSelection?: () => Selection | null }
      ).getSelection?.();
      if (selection) {
        selection.removeAllRanges();
        selection.addRange(range);
      }
    }
    setCopyHint("fallback");
  };

  const sourcePathLabel = row.sourcePathIsStale
    ? "Last seen source path:"
    : "Source path:";

  const rawHref =
    row.storedSessionUid !== null
      ? `/api/v1/sessions/${row.storedSessionUid}/raw`
      : null;

  return (
    <div className="session-metadata">
      <dl className="metadata-meta">
        <dt>session_key</dt>
        <dd className="mono">{row.sourceSessionKey ?? "—"}</dd>

        <dt>session_uid</dt>
        <dd className="mono">{row.storedSessionUid ?? "—"}</dd>

        <dt>row_key</dt>
        <dd className="mono">{row.rowKey}</dd>

        <dt>tool</dt>
        <dd className="mono">{row.tool}</dd>

        <dt>source_session_id</dt>
        <dd className="mono">{row.sourceSessionId}</dd>

        <dt>presence</dt>
        <dd className="mono">{row.presence}</dd>

        <dt>status</dt>
        <dd>
          <span className={`badge ${row.status.replace(/_/g, "-")}`}>
            {row.status.replace(/_/g, " ")}
          </span>
          {row.statusConflict ? (
            <>
              {" "}
              <span className="muted">(disagreed during load)</span>
            </>
          ) : null}
        </dd>

        <dt>status_conflict</dt>
        <dd className="mono">{row.statusConflict ? "true" : "false"}</dd>

        <dt>title</dt>
        <dd>{row.title ?? <span className="muted">(untitled)</span>}</dd>

        <dt>project_path</dt>
        <dd className="mono">{row.projectPath ?? "—"}</dd>

        <dt>{sourcePathLabel.replace(":", "")}</dt>
        <dd>
          <span className="mono metadata-source-path" ref={sourcePathRef}>
            {sourcePath}
          </span>
          {" "}
          <button
            type="button"
            className="metadata-copy-btn"
            onClick={() => {
              void handleCopyPath();
            }}
          >
            Copy path
          </button>
          {copyHint === "copied" ? (
            <>
              {" "}
              <span className="muted metadata-copy-hint">Copied</span>
            </>
          ) : null}
          {copyHint === "fallback" ? (
            <>
              {" "}
              <span className="muted metadata-copy-hint">
                Selected — press Ctrl/Cmd + C to copy
              </span>
            </>
          ) : null}
        </dd>

        <dt>source_path_is_stale</dt>
        <dd className="mono">
          {row.sourcePathIsStale ? "true" : "false"}
        </dd>

        <dt>source_fingerprint</dt>
        <dd className="mono">{row.sourceFingerprint}</dd>

        <dt>has_subagent_sidecars</dt>
        <dd>
          <span className="mono">
            {row.hasSubagentSidecars ? "true" : "false"}
          </span>
          {row.hasSubagentSidecars ? (
            <>
              {" "}
              <span
                className="metadata-subagent-badge"
                title="Has Claude Code subagent sidecars on disk — not ingested in v1"
              >
                Has Claude Code subagent sidecars on disk — not ingested in v1
              </span>
            </>
          ) : null}
        </dd>

        <dt>stored_raw_ref</dt>
        <dd className="mono">{row.storedRawRef ?? "—"}</dd>

        <dt>created_at (source clock)</dt>
        <dd>{renderTimestamp(now, row.createdAt)}</dd>

        <dt>source_updated_at (source clock)</dt>
        <dd>{renderTimestamp(now, row.sourceUpdatedAt)}</dd>

        <dt>ingested_at (backend clock)</dt>
        <dd>{renderTimestamp(now, row.ingestedAt)}</dd>
      </dl>

      {rawHref !== null ? (
        <p className="metadata-raw-link-row">
          <a
            className="raw-link"
            href={rawHref}
            target="_blank"
            rel="noopener noreferrer"
          >
            View raw
          </a>
        </p>
      ) : null}
    </div>
  );
}

function renderTimestamp(now: string, value: string | null) {
  if (value === null) {
    return <span className="muted">—</span>;
  }
  return (
    <>
      <span className="mono">{value}</span>
      {" "}
      <span className="muted">({relativeTimeFrom(now, value)})</span>
    </>
  );
}
