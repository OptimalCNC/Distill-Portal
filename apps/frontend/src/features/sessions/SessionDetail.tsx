// Drawer body for the unified inspection list.
//
// Renders every field on the merged `SessionRow` so a user can inspect
// a single session without leaving the page. Per
// `working/phase-4.md` §Session Detail Drawer the body contains:
//
//   - Title header with the tool badge, status pill, and (when
//     `statusConflict`) a small "Conflict" badge alongside.
//   - Metadata `<dl>` listing every SessionRow field with a labeled
//     `<dt>` + `<dd>`. Timestamp fields render the absolute ISO value
//     PLUS a relative form via `relativeTimeFrom(now, value)`. The
//     `createdAt` and `sourceUpdatedAt` fields are annotated
//     "(source clock)" because the backend records them from the
//     source machine and they may be skewed; `ingestedAt` is annotated
//     "(backend clock)" because it is monotonic.
//   - Source path with a "Last seen source path:" label swap when
//     `sourcePathIsStale` is true (the file is no longer
//     discoverable). A copy-to-clipboard button sits next to it; the
//     fallback when `navigator.clipboard` is unavailable selects the
//     path text so the user can copy it manually with Ctrl+C.
//   - "View raw" anchor (only rendered for stored sessions, i.e.
//     `storedSessionUid !== null`) opens the existing
//     `/api/v1/sessions/:uid/raw` endpoint in a new tab.
//   - Raw preview placeholder (stored sessions only). The streaming
//     preview body lands in Chunk E2; E1 ships the chrome around it
//     so the drawer is fully reviewable on its own.
//
// SessionDetail is presentational. The parent (`SessionsView`) owns
// the open-state, the row lookup, and the "now" timestamp pinning.
// All field reads are done at render time so the drawer always shows
// whatever the merged row carries when the parent picks a key.
import { useEffect, useRef, useState } from "react";
import { StatusBadge } from "../../components/StatusBadge";
import { relativeTimeFrom } from "./relativeTime";
import type { SessionRow } from "./types";

export type SessionDetailProps = {
  /** The merged row to render. */
  row: SessionRow;
  /** Pinned-`now` ISO string used for relative-time labelling. */
  now: string;
};

const COPY_HINT_TIMEOUT_MS = 2000;

export function SessionDetail({ row, now }: SessionDetailProps) {
  const sourcePath = row.sourcePath;
  const sourcePathRef = useRef<HTMLSpanElement | null>(null);
  const [copyHint, setCopyHint] = useState<
    "idle" | "copied" | "fallback"
  >("idle");

  // Reset the "Copied" / "Select to copy" hint after a short delay so
  // it does not stay forever.
  useEffect(() => {
    if (copyHint === "idle") return;
    const id = setTimeout(() => setCopyHint("idle"), COPY_HINT_TIMEOUT_MS);
    return () => clearTimeout(id);
  }, [copyHint]);

  // Reset the hint when the row changes (the user opened a different
  // drawer entry).
  useEffect(() => {
    setCopyHint("idle");
  }, [row.rowKey]);

  const handleCopyPath = async () => {
    // Try the modern Clipboard API first. Browsers without it (older
    // Chromium variants, locked-down test runners, jsdom-style shims)
    // throw on call or simply do not expose the API; fall through to
    // the manual-select fallback.
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
        // Fall through to the manual-select fallback.
      }
    }
    // Fallback: programmatically select the path text so the user can
    // press Ctrl/Cmd + C themselves. We never throw — clipboard
    // failure should not break the drawer.
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

  // Only render the "View raw" anchor and the raw preview placeholder
  // when the session is actually stored. A `source_only` row has no
  // backend resource to view.
  const rawHref =
    row.storedSessionUid !== null
      ? `/api/v1/sessions/${row.storedSessionUid}/raw`
      : null;

  return (
    <div className="drawer-body">
      <header className="drawer-header">
        <h2 className="drawer-title">{row.title ?? "(untitled)"}</h2>
        <span className="badge mono drawer-tool-badge">{row.tool}</span>
        <StatusBadge status={row.status} />
        {row.statusConflict ? (
          <span
            className="badge drawer-conflict-badge"
            title="Source and stored status disagreed during load — refresh to re-fetch."
          >
            Conflict
          </span>
        ) : null}
      </header>

      <dl className="drawer-meta">
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
          <StatusBadge status={row.status} />
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
          <span className="mono drawer-source-path" ref={sourcePathRef}>
            {sourcePath}
          </span>
          {" "}
          <button
            type="button"
            className="drawer-copy-btn"
            onClick={() => {
              void handleCopyPath();
            }}
          >
            Copy path
          </button>
          {copyHint === "copied" ? (
            <>
              {" "}
              <span className="muted drawer-copy-hint">Copied</span>
            </>
          ) : null}
          {copyHint === "fallback" ? (
            <>
              {" "}
              <span className="muted drawer-copy-hint">
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
        <dd className="mono">
          {row.hasSubagentSidecars ? "true" : "false"}
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
        <p className="drawer-raw-link-row">
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

      {row.storedSessionUid !== null ? (
        <section className="drawer-raw-preview">
          <h3>Raw preview</h3>
          <p className="raw-preview-placeholder">
            Raw preview block lands in Chunk E2.
          </p>
        </section>
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
