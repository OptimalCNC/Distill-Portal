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
//   - Raw preview block (stored sessions only). The block streams the
//     `/api/v1/sessions/:uid/raw` endpoint via `streamSessionRaw` +
//     `consumeRawPreview` and renders the structured `RawPreviewState`
//     (loading / success / error / non_2xx). M4 Chunk E2 added the
//     live block — the placeholder from E1 is gone.
//
// SessionDetail is presentational EXCEPT for the raw-preview block,
// which owns its own fetch lifecycle (one AbortController per
// SessionDetail mount, restarted whenever the row changes — e.g. the
// user closes the drawer and opens a different row). The parent
// (`SessionsView`) owns the open-state, the row lookup, and the
// "now" timestamp pinning. All field reads are done at render time
// so the drawer always shows whatever the merged row carries when
// the parent picks a key.
import { useCallback, useEffect, useRef, useState } from "react";
import { StatusBadge } from "../../components/StatusBadge";
import { ApiError, streamSessionRaw } from "../../lib/api";
import { relativeTimeFrom } from "./relativeTime";
import {
  consumeRawPreview,
  type RawPreviewLine,
  type RawPreviewState,
} from "./rawPreview";
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
          <RawPreviewBlock sessionUid={row.storedSessionUid} />
        </section>
      ) : null}
    </div>
  );
}

/**
 * Streaming raw-preview block.
 *
 * Owns one fetch lifecycle per `sessionUid`. On mount (and whenever
 * `sessionUid` changes), creates an `AbortController`, calls
 * `streamSessionRaw` + `consumeRawPreview`, and stores the resulting
 * `RawPreviewState`. On unmount (drawer close OR a different row
 * opened), aborts the controller — the consumer's abort handling
 * cancels the in-flight reader and re-throws AbortError, which we
 * silently ignore.
 *
 * The Retry button wires through to the same effect by bumping a
 * local "attempt" counter, which is included in the effect's dep
 * array so the effect re-runs on click.
 */
type RawPreviewBlockProps = { sessionUid: string };

function RawPreviewBlock({ sessionUid }: RawPreviewBlockProps) {
  const [state, setState] = useState<RawPreviewState>({ kind: "loading" });
  // Bumping `attempt` re-runs the effect, which is the cleanest way
  // to refire the fetch on Retry without duplicating the logic.
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
        // AbortError is a normal close-time outcome; do not mutate
        // state because the component is about to unmount or a
        // newer effect has already taken over.
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
      <p className="raw-preview-loading">Loading raw preview…</p>
    );
  }

  if (state.kind === "error") {
    return (
      <div>
        <p className="raw-preview-error">
          Failed to load raw preview: {state.message}
        </p>
        <p>
          <button type="button" onClick={handleRetry}>
            Retry
          </button>
        </p>
      </div>
    );
  }

  if (state.kind === "non_2xx") {
    return (
      <div>
        <p className="raw-preview-error">
          HTTP {state.status}: {state.bodySnippet}
        </p>
        <p>
          <button type="button" onClick={handleRetry}>
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
    <div>
      <pre className="raw-preview" aria-label="Raw NDJSON preview">
        {lines.map((line, idx) => (
          <RawPreviewLineRow key={idx} line={line} />
        ))}
      </pre>
      <p className="raw-preview-caption">{caption}</p>
    </div>
  );
}

/**
 * One rendered preview line. JSON lines render their raw NDJSON; text
 * fallbacks render with a distinct class AND a visible "(non-JSON
 * line)" marker so the user can tell when the parser fell back. The
 * marker is inside the same `<div>` so the row stays one logical
 * unit for screen readers.
 */
function RawPreviewLineRow({ line }: { line: RawPreviewLine }) {
  if (line.kind === "json") {
    return <div className="raw-preview-line">{line.raw}</div>;
  }
  return (
    <div className="raw-preview-line text">
      {line.raw}
      {" "}
      <span className="raw-preview-fallback-marker">(non-JSON line)</span>
    </div>
  );
}

/**
 * Caption text per the spec:
 *
 *   - byte cap fired → "Stopped at byte cap — full payload not
 *     downloaded." (EXACT spec text per working/phase-4.md
 *     §Session Detail Drawer)
 *   - line cap fired → "Showing first 20 lines of the raw payload."
 *   - neither cap → "Showing first N lines (full payload below the
 *     caps)."
 *
 * If both caps fired (rare; possible when the chunk that pushed
 * bytesRead past the cap also contained the 20th newline), the byte
 * cap message wins because it carries the more specific "not
 * downloaded" warning.
 */
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

/**
 * Trim the error-body snippet so a misbehaving backend that returns a
 * megabyte of HTML on a 500 does not blow out the drawer.
 */
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
