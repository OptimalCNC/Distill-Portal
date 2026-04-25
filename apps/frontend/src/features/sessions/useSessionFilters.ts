// Filter / sort / search state hook with versioned `localStorage`
// persistence.
//
// Per `working/phase-4.md` §Filter, Sort, Search — Contract with the
// Backend: the inspection surface persists a small filter blob under
// `distill-portal:inspection-filters:v1`. The hook re-writes the blob on
// every mutation so legacy / corrupt inputs heal naturally — the user
// never sees an error toast for a malformed persisted shape.
//
// Robustness rules (covered by `useSessionFilters.test.ts`):
//   - Parse failure (malformed JSON, null top-level, array top-level,
//     string top-level) -> defaults applied + corrupt blob rewritten.
//   - Missing top-level keys -> per-field defaults; valid keys accepted.
//   - Unknown enum value for `tool` / `storage` / `sort.field` /
//     `sort.direction` -> default for that key.
//   - Non-array `status` -> default `[]`.
//   - `status` array with one valid + one invalid entry -> drop the
//     WHOLE array (apply default `[]`); do NOT silently filter to valid
//     entries (per spec robustness clause).
//   - Non-boolean `importableOnly` -> default `false`.
//   - Out-of-range `pageSize` (anything not 50/100/200) -> default 50.
//   - `project`: any string accepted on decode (it's dynamic data
//     derived from the current row set; the decoder runs before the API
//     loads so the value cannot be cross-checked here).
//   - `localStorage` unavailable (private mode, quota, disabled, throws)
//     -> in-memory fallback without surfacing an error.
//
// `importableOnly` interaction with `status` (per spec): when
// `importableOnly === true`, the persisted `status` array is cleared on
// apply (`setImportableOnly(true)`). The downstream filter
// (`filterSessions.ts`) computes the EFFECTIVE status as
// `["not_stored", "outdated"]` whenever `importableOnly === true`,
// regardless of the persisted `status` array. This way the hook owns
// the persistence rule and `filterSessions.ts` owns the apply-time
// rule, matching the spec's "one filter mutation per affordance"
// design (the "Show importable only" empty-state link sets a single
// boolean rather than juggling a compound state).
import { useCallback, useEffect, useRef, useState } from "react";
import type { SessionSyncStatus, Tool } from "../../lib/contracts";

export const STORAGE_KEY = "distill-portal:inspection-filters:v1";

export type SortField =
  | "source_updated_at"
  | "created_at"
  | "ingested_at"
  | "title"
  | "project_path";

export type SortDirection = "asc" | "desc";

export type SessionFiltersState = {
  tool: Tool | "all";
  status: SessionSyncStatus[];
  storage: "all" | "stored" | "not_stored";
  importableOnly: boolean;
  project: string | null;
  search: string;
  sort: { field: SortField; direction: SortDirection };
  pageSize: 50 | 100 | 200;
};

export const DEFAULT_FILTERS: SessionFiltersState = {
  tool: "all",
  status: [],
  storage: "all",
  importableOnly: false,
  project: null,
  search: "",
  sort: { field: "source_updated_at", direction: "desc" },
  pageSize: 50,
};

const VALID_TOOLS: ReadonlySet<string> = new Set([
  "all",
  "claude_code",
  "codex",
]);
const VALID_STORAGES: ReadonlySet<string> = new Set([
  "all",
  "stored",
  "not_stored",
]);
const VALID_STATUSES: ReadonlySet<string> = new Set([
  "not_stored",
  "up_to_date",
  "outdated",
  "source_missing",
]);
const VALID_SORT_FIELDS: ReadonlySet<string> = new Set([
  "source_updated_at",
  "created_at",
  "ingested_at",
  "title",
  "project_path",
]);
const VALID_SORT_DIRECTIONS: ReadonlySet<string> = new Set(["asc", "desc"]);
const VALID_PAGE_SIZES: ReadonlySet<number> = new Set([50, 100, 200]);

/**
 * Decode a raw `localStorage` value into a `SessionFiltersState`.
 *
 * Exported for tests; internal callers use `loadFilters` which combines
 * decode + read in one step.
 */
export function decodeFilters(raw: string | null): SessionFiltersState {
  if (raw === null) return { ...DEFAULT_FILTERS };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ...DEFAULT_FILTERS };
  }
  if (
    parsed === null ||
    typeof parsed !== "object" ||
    Array.isArray(parsed)
  ) {
    return { ...DEFAULT_FILTERS };
  }
  const obj = parsed as Record<string, unknown>;

  const tool: SessionFiltersState["tool"] =
    typeof obj.tool === "string" && VALID_TOOLS.has(obj.tool)
      ? (obj.tool as SessionFiltersState["tool"])
      : DEFAULT_FILTERS.tool;

  // `status` rule: must be an array of valid SessionSyncStatus values.
  // Any unknown entry drops the WHOLE array (per spec — do NOT silently
  // filter to valid entries; defaulting to [] is the explicit choice so
  // a corrupt blob cannot accidentally narrow the user's view).
  let status: SessionSyncStatus[] = [...DEFAULT_FILTERS.status];
  if (Array.isArray(obj.status)) {
    let allValid = true;
    for (const entry of obj.status) {
      if (typeof entry !== "string" || !VALID_STATUSES.has(entry)) {
        allValid = false;
        break;
      }
    }
    if (allValid) {
      status = (obj.status as SessionSyncStatus[]).slice();
    }
  }

  const storage: SessionFiltersState["storage"] =
    typeof obj.storage === "string" && VALID_STORAGES.has(obj.storage)
      ? (obj.storage as SessionFiltersState["storage"])
      : DEFAULT_FILTERS.storage;

  const importableOnly: boolean =
    typeof obj.importableOnly === "boolean"
      ? obj.importableOnly
      : DEFAULT_FILTERS.importableOnly;

  // `project` is dynamic data: any string accepted; null otherwise.
  const project: string | null =
    typeof obj.project === "string" ? obj.project : null;

  const search: string =
    typeof obj.search === "string" ? obj.search : DEFAULT_FILTERS.search;

  // `sort` must be an object with a valid `field` and `direction`.
  let sort: SessionFiltersState["sort"] = { ...DEFAULT_FILTERS.sort };
  if (
    obj.sort !== null &&
    typeof obj.sort === "object" &&
    !Array.isArray(obj.sort)
  ) {
    const sortObj = obj.sort as Record<string, unknown>;
    const field: SortField =
      typeof sortObj.field === "string" && VALID_SORT_FIELDS.has(sortObj.field)
        ? (sortObj.field as SortField)
        : DEFAULT_FILTERS.sort.field;
    const direction: SortDirection =
      typeof sortObj.direction === "string" &&
      VALID_SORT_DIRECTIONS.has(sortObj.direction)
        ? (sortObj.direction as SortDirection)
        : DEFAULT_FILTERS.sort.direction;
    sort = { field, direction };
  }

  const pageSize: 50 | 100 | 200 =
    typeof obj.pageSize === "number" && VALID_PAGE_SIZES.has(obj.pageSize)
      ? (obj.pageSize as 50 | 100 | 200)
      : DEFAULT_FILTERS.pageSize;

  return {
    tool,
    status,
    storage,
    importableOnly,
    project,
    search,
    sort,
    pageSize,
  };
}

/** Best-effort `localStorage.getItem`. Returns null if storage is
 *  unavailable (private mode, disabled, throws). */
function safeGet(key: string): string | null {
  try {
    if (typeof globalThis.localStorage === "undefined") return null;
    return globalThis.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Best-effort `localStorage.setItem`. Silent no-op on failure so the
 *  in-memory fallback stays intact. */
function safeSet(key: string, value: string): void {
  try {
    if (typeof globalThis.localStorage === "undefined") return;
    globalThis.localStorage.setItem(key, value);
  } catch {
    // Quota exceeded, disabled, etc. — fall back to in-memory state.
  }
}

/**
 * `useSessionFilters` — owns the persisted filter blob and exposes a
 * narrow setter API.
 *
 * Returned API:
 *   - `filters`: the current `SessionFiltersState`.
 *   - `setFilter<K>(key, value)`: replace a single field (and re-persist).
 *   - `resetAll()`: drop every filter back to defaults (used by the
 *     "Clear filters" empty-state affordance and the secondary
 *     ActionBar caption's Clear button).
 *   - `setImportableOnly(v)`: dedicated setter for the boolean shortcut.
 *     When toggled to `true` it ALSO clears the persisted `status` array
 *     (per spec: "Setting `importableOnly = true` overrides any
 *     incompatible status array on apply"). When toggled to `false` it
 *     leaves `status` untouched (the user's last array choice is
 *     preserved).
 */
export function useSessionFilters(): {
  filters: SessionFiltersState;
  setFilter: <K extends keyof SessionFiltersState>(
    key: K,
    value: SessionFiltersState[K],
  ) => void;
  resetAll: () => void;
  setImportableOnly: (v: boolean) => void;
} {
  // Initialize from `localStorage` once. The decoder is total — it
  // never throws; it returns defaults for any corrupt input.
  const [filters, setFilters] = useState<SessionFiltersState>(() =>
    decodeFilters(safeGet(STORAGE_KEY)),
  );

  // After mount, if the persisted blob differed from what we just
  // wrote (e.g. it was malformed), re-write the canonical shape so the
  // next reload doesn't hit the same parse path.
  const initialRewriteDone = useRef(false);
  useEffect(() => {
    if (initialRewriteDone.current) return;
    initialRewriteDone.current = true;
    safeSet(STORAGE_KEY, JSON.stringify(filters));
    // Intentionally NO dep on `filters`: this useEffect only runs once,
    // immediately after the first render, to heal a corrupt blob. All
    // subsequent writes happen inside the setters below where they are
    // synchronous with the state mutation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const persist = useCallback((next: SessionFiltersState) => {
    safeSet(STORAGE_KEY, JSON.stringify(next));
  }, []);

  const setFilter = useCallback(
    <K extends keyof SessionFiltersState>(
      key: K,
      value: SessionFiltersState[K],
    ) => {
      setFilters((prev) => {
        const next = { ...prev, [key]: value };
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const resetAll = useCallback(() => {
    const next = { ...DEFAULT_FILTERS };
    persist(next);
    setFilters(next);
  }, [persist]);

  const setImportableOnly = useCallback(
    (v: boolean) => {
      setFilters((prev) => {
        // Per spec: setting importableOnly=true clears the persisted
        // status array (the boolean is a one-click shortcut; we don't
        // want a leftover status filter to silently widen or narrow
        // the effective set on the next toggle off).
        const next: SessionFiltersState = v
          ? { ...prev, importableOnly: true, status: [] }
          : { ...prev, importableOnly: false };
        persist(next);
        return next;
      });
    },
    [persist],
  );

  return { filters, setFilter, resetAll, setImportableOnly };
}
