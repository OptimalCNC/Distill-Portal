// URL-synced selection hook for the inspection master-detail layout.
//
// Owns the `?session=<rowKey>` slice of the page URL. React state is
// the single source of truth; the URL is a mirror written via
// `window.history.replaceState` (NOT `pushState` — see Resolved
// Decision #1 in `working/phase-5.md` lines 1142, 559–586). Casual
// scanning across 20 sessions doesn't pollute the back-stack; deep-
// link bookmarkability still works because the URL reflects the
// current selection.
//
// Coordination rules (so popstate / click / Esc never race — spec
// lines 563–568):
//
//   - selectRow(key)  → setState(key) AND replaceState(buildUrl(key)).
//                       Both are idempotent.
//   - popstate event  → re-read URL, setState directly. Does NOT
//                       call replaceState (would feedback-loop with
//                       the browser's own URL push).
//   - buildUrl(key)   → reads the entire current URLSearchParams,
//                       mutates ONLY the `session` key (sets it to
//                       `key` or removes it if `null`), serializes
//                       back. Preserves all other query params for
//                       forward-compat with future filter URL state.
//
// Initial mount reads `URLSearchParams(window.location.search).get(
// "session")` and pre-selects so a deep-linked URL reload restores
// the selection. The popstate listener is cleaned up on unmount.
import { useCallback, useEffect, useRef, useState } from "react";

export type UseSelectedSession = {
  selectedRowKey: string | null;
  selectRow: (rowKey: string | null) => void;
};

/**
 * Build the next URL after mutating `session` to `key` (or removing
 * it when `key === null`). Reads the entire current
 * `window.location.search`, updates only the `session` key, and
 * serializes back. Preserves every other query param — the future
 * filter URL state slice owns its own keys; we must not stomp on
 * them.
 *
 * Returns the full URL (pathname + search + hash) so callers can
 * pass it directly to `history.replaceState`.
 */
export function buildUrl(key: string | null): string {
  const params = new URLSearchParams(window.location.search);
  if (key === null) {
    params.delete("session");
  } else {
    params.set("session", key);
  }
  const search = params.toString();
  const path = window.location.pathname;
  const hash = window.location.hash;
  return `${path}${search.length > 0 ? `?${search}` : ""}${hash}`;
}

function readSessionFromUrl(): string | null {
  return new URLSearchParams(window.location.search).get("session");
}

export function useSelectedSession(): UseSelectedSession {
  // Initial mount reads the URL once. `useState` with a lazy
  // initializer so the URL read happens exactly once at mount time
  // (per-render evaluation would risk reading after a popstate set
  // state but before the listener fired).
  const [selectedRowKey, setSelectedRowKey] = useState<string | null>(() =>
    readSessionFromUrl(),
  );

  // Stable callback identity. The handler closes over `setState`,
  // which is itself stable, so `selectRow` does not need to depend
  // on any state. Consumers can pass it into `useEffect` deps
  // arrays without re-arming the effect on every render.
  const selectRow = useCallback((rowKey: string | null) => {
    setSelectedRowKey(rowKey);
    // Mirror to URL. `replaceState(null, "", url)` is idempotent —
    // calling it with the same URL is a no-op per the History API
    // spec. We do NOT call it from the popstate handler (the
    // browser already updated the URL; calling replaceState there
    // would feedback-loop).
    window.history.replaceState(null, "", buildUrl(rowKey));
  }, []);

  // popstate listener: browser Back / Forward fires this. Re-read
  // the URL and sync state ONLY (no replaceState — that would
  // feedback-loop). Use a ref-shaped pattern via the effect's
  // closure so the listener identity stays stable across renders.
  // The listener is registered exactly once on mount + removed on
  // unmount.
  const popstateRef = useRef<((event: PopStateEvent) => void) | null>(null);
  useEffect(() => {
    const handler = (_event: PopStateEvent) => {
      const next = readSessionFromUrl();
      setSelectedRowKey(next);
    };
    popstateRef.current = handler;
    window.addEventListener("popstate", handler);
    return () => {
      window.removeEventListener("popstate", handler);
      popstateRef.current = null;
    };
  }, []);

  return { selectedRowKey, selectRow };
}
