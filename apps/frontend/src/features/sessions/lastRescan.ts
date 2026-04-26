// Persistence helper for the "last manual rescan from this browser"
// timestamp.
//
// Per `working/phase-4.md` §Action Bar and Mutation UX, the Rescan
// button carries a short relative-time caption — "last rescan from
// this browser 3m ago" — computed from the timestamp persisted under
// the dedicated key `distill-portal:last-manual-rescan:v1`. The key
// is intentionally separate from the filter blob (`:inspection-
// filters:v1`) so a filter-schema bump in a later phase doesn't
// invalidate the rescan clock.
//
// The caption is explicitly scoped to "this browser": the backend
// runs its own scans (startup + poll interval) that the browser
// cannot observe, so this helper only writes on a SUCCESSFUL manual
// rescan triggered from this UI.
//
// Robustness rules (mirror the `useSessionFilters` total-decoder
// pattern):
//   - JSON.parse failure -> null.
//   - Non-string parsed value -> null (we persist a bare ISO string
//     wrapped in JSON.stringify so reads come back through
//     JSON.parse and deserialise into a string; anything else
//     means the blob is corrupt).
//   - Empty string after parse -> null (treated as missing).
//   - localStorage unavailable (private mode, quota, disabled,
//     throws) -> null on read, no-op on write. Never surfaces an
//     error to the UI.
//
// `readLastRescan` and `writeLastRescan` never validate the ISO
// string itself (a non-parseable date is a separate concern handled
// downstream by `relativeTimeFrom`, which renders "—" for invalid
// inputs). The helper's only contract is "round-trip a string or
// fall through to null."

const KEY = "distill-portal:last-manual-rescan:v1";

export function readLastRescan(): string | null {
  let raw: string | null;
  try {
    if (typeof globalThis.localStorage === "undefined") return null;
    raw = globalThis.localStorage.getItem(KEY);
  } catch {
    // Storage access threw (e.g. SecurityError in some private modes).
    return null;
  }
  if (raw === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "string" || parsed.length === 0) return null;
  return parsed;
}

export function writeLastRescan(iso: string): void {
  try {
    if (typeof globalThis.localStorage === "undefined") return;
    globalThis.localStorage.setItem(KEY, JSON.stringify(iso));
  } catch {
    // Quota, disabled, or threw — silently fall back to in-memory
    // state owned by the caller. The caption just won't survive a
    // reload in that environment.
  }
}

/** Exported for tests so they can read + clear the key without
 *  hardcoding the literal in two places. */
export const LAST_RESCAN_KEY = KEY;
