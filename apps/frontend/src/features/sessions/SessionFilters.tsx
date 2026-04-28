// Filter / sort / search controls for the unified inspection list.
//
// Stateless w.r.t. filter values: every value comes in as a prop and
// every change calls a setter. `useSessionFilters` (in `App.tsx`) owns
// the filter state + the `localStorage` blob; this component is a thin
// presentational layer for the filter affordances themselves.
//
// As of Phase-5 / M1b the component owns one piece of viewport-driven
// state: the `<details>` open attribute below the 1100 px breakpoint.
// Above 1100 px the filter strip renders as the existing Phase-4
// inline group (the `<details>` chrome is hidden via CSS); below
// 1100 px the strip wraps inside `<details>` with a chevron summary
// and an active-filter-count chip. The default open state matches
// the breakpoint side: open above 1100 px, closed below. Crossing the
// breakpoint resets the `open` attribute to the new band's default;
// resize events that stay inside the same band do NOT clobber the
// user's manual toggle (intra-band preservation rule per design.md
// §3.4 + the UI/UX reviewer's notes).
//
// Components rendered inside the body:
//   - Tool chip group: All | Claude Code | Codex.
//   - Storage chip group: All | Stored | Not stored.
//   - Status multi-select chips (one per `SessionSyncStatus` value)
//     with an "All" reset chip; chips toggle individually.
//   - Project `<input list>` paired with a sibling `<datalist>`
//     populated from the current row set's distinct project paths.
//     Long paths are visually truncated; the full path stays in the
//     `title=` attribute. A small "x" clears the project filter.
//   - Substring search input with a clear button.
//   - Sort field `<select>` plus a direction `<select>` (asc / desc).
//   - "Show importable only" boolean toggle (rendered as a chip for
//     visual consistency with the other filters; the user clicks
//     once and the filter narrows immediately).
//
// Token-driven CSS lives in the sibling `SessionFilters.css` (selectors
// `.filters-wrap`, `.filter-count-chip`, `.session-filters`,
// `.filter-row`, `.filter-label`, `.chip`, `.chip.active`,
// `.session-filters input`, `.session-filters select`); WCAG AA
// contrast for `.chip.active` foreground/background was pre-computed
// via the Bun script in the M3 chunk evidence pack and remeasured in
// M6 — light 6.237 / dark 6.949 (both ≥ 4.5:1).
import { useEffect, useRef, useState } from "react";
import type { SessionSyncStatus, Tool } from "../../lib/contracts";
import {
  DEFAULT_FILTERS,
  type SessionFiltersState,
  type SortDirection,
  type SortField,
} from "./useSessionFilters";
import "./SessionFilters.css";

export type SessionFiltersProps = {
  filters: SessionFiltersState;
  projects: string[];
  setFilter: <K extends keyof SessionFiltersState>(
    key: K,
    value: SessionFiltersState[K],
  ) => void;
  setImportableOnly: (v: boolean) => void;
};

const TOOL_OPTIONS: ReadonlyArray<{
  value: Tool | "all";
  label: string;
}> = [
  { value: "all", label: "All" },
  { value: "claude_code", label: "Claude Code" },
  { value: "codex", label: "Codex" },
];

const STORAGE_OPTIONS: ReadonlyArray<{
  value: "all" | "stored" | "not_stored";
  label: string;
}> = [
  { value: "all", label: "All" },
  { value: "stored", label: "Stored" },
  { value: "not_stored", label: "Not stored" },
];

const STATUS_OPTIONS: ReadonlyArray<{
  value: SessionSyncStatus;
  label: string;
}> = [
  { value: "up_to_date", label: "Up to date" },
  { value: "outdated", label: "Outdated" },
  { value: "not_stored", label: "Not stored" },
  { value: "source_missing", label: "Source missing" },
];

const SORT_FIELD_OPTIONS: ReadonlyArray<{
  value: SortField;
  label: string;
}> = [
  { value: "source_updated_at", label: "Source updated" },
  { value: "created_at", label: "Created" },
  { value: "ingested_at", label: "Ingested" },
  { value: "title", label: "Title" },
  { value: "project_path", label: "Project" },
];

/**
 * M1b: count the active filter axes for the `<details>` summary chip.
 *
 * The seven axes are:
 *   1. tool          — active when ≠ "all"
 *   2. storage       — active when ≠ "all"
 *   3. status        — active when array is non-empty
 *   4. project       — active when not null
 *   5. search        — active when non-empty after trim
 *   6. importableOnly — active when true
 *   7. sort          — active when not deep-equal to the default
 *                      `{field: "source_updated_at", direction: "desc"}`
 *
 * Exported so component tests + future call sites can consume the same
 * helper without re-deriving the predicate. The chip suppresses at 0;
 * non-zero renders as `${count} active`.
 */
export function countActiveFilters(filters: SessionFiltersState): number {
  let count = 0;
  if (filters.tool !== DEFAULT_FILTERS.tool) count += 1;
  if (filters.storage !== DEFAULT_FILTERS.storage) count += 1;
  if (filters.status.length > 0) count += 1;
  if (filters.project !== null) count += 1;
  if (filters.search.trim() !== "") count += 1;
  if (filters.importableOnly === true) count += 1;
  if (
    filters.sort.field !== DEFAULT_FILTERS.sort.field ||
    filters.sort.direction !== DEFAULT_FILTERS.sort.direction
  ) {
    count += 1;
  }
  return count;
}

/**
 * M1b: hook that mirrors `App.tsx`'s narrow-mode listener pattern
 * (matchMedia with `addEventListener("change", ...)` + legacy
 * `addListener` fallback). Returns whether the media query currently
 * matches. Default to the SSR-safe `false` when `window.matchMedia`
 * is unavailable.
 */
function useMatchMedia(query: string): boolean {
  const [matches, setMatches] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    if (typeof window.matchMedia !== "function") return false;
    return window.matchMedia(query).matches;
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia(query);
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches);
    if (typeof mq.addEventListener === "function") {
      mq.addEventListener("change", onChange);
    } else if (
      typeof (mq as unknown as { addListener?: typeof onChange }).addListener ===
      "function"
    ) {
      (mq as unknown as { addListener: (l: typeof onChange) => void }).addListener(
        onChange,
      );
    }
    return () => {
      if (typeof mq.removeEventListener === "function") {
        mq.removeEventListener("change", onChange);
      } else if (
        typeof (mq as unknown as { removeListener?: typeof onChange })
          .removeListener === "function"
      ) {
        (mq as unknown as { removeListener: (l: typeof onChange) => void }).removeListener(
          onChange,
        );
      }
    };
  }, [query]);
  return matches;
}

export function SessionFilters({
  filters,
  projects,
  setFilter,
  setImportableOnly,
}: SessionFiltersProps) {
  // M1b: spec-verbatim 1100 px breakpoint (NOT 1099.98 px) per the
  // chunk dispatch brief. Above the breakpoint the filter strip
  // renders inline; below it wraps in `<details>`.
  const isWide = useMatchMedia("(min-width: 1100px)");

  // The `<details>` open state. Default matches the current band
  // (open above 1100 px; closed below). The intra-band preservation
  // rule (per design.md §3.4 + UI/UX reviewer notes): when the user
  // manually toggles the disclosure below 1100 px, that state must
  // survive subsequent resize events that stay below 1100 px. ONLY
  // crossing the breakpoint resets the open state to the new band's
  // default. We track the previous `isWide` value and reset `open`
  // only on a transition.
  const [isOpen, setIsOpen] = useState<boolean>(isWide);
  const prevIsWideRef = useRef<boolean>(isWide);
  useEffect(() => {
    if (prevIsWideRef.current === isWide) return;
    // Breakpoint crossed — reset to the new band's default.
    prevIsWideRef.current = isWide;
    setIsOpen(isWide);
  }, [isWide]);

  const activeCount = countActiveFilters(filters);

  return (
    <details
      className="filters-wrap"
      open={isOpen}
      onToggle={(event) => {
        // Honor the user's manual toggle below 1100 px. Above 1100 px
        // the body is forced visible by CSS regardless of the `open`
        // attribute (the summary is `display: none`), but we still
        // sync state so the toggle event from a hidden summary does
        // not stick the filter body in an unexpected state on the
        // next resize crossing.
        const next = (event.currentTarget as HTMLDetailsElement).open;
        setIsOpen(next);
      }}
    >
      <summary>
        {/* The "Filters" text is the disclosure widget's accessible
            name. Below 1100 px the summary is the visible toggle; the
            label must reach the accessibility tree so screen-reader
            users know what section is being expanded/collapsed. The
            count chip carries its own readable text ("N active") and
            is announced as part of the summary's accessible name. */}
        <span>Filters</span>
        {activeCount > 0 ? (
          <span className="filter-count-chip">{activeCount} active</span>
        ) : null}
      </summary>
      <div className="session-filters" role="group" aria-label="Session filters">
        <div className="filter-row">
          <span className="filter-label">Tool</span>
          {TOOL_OPTIONS.map((opt) => (
            <button
              type="button"
              key={`tool-${opt.value}`}
              className={`chip${filters.tool === opt.value ? " active" : ""}`}
              aria-pressed={filters.tool === opt.value}
              onClick={() => setFilter("tool", opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="filter-row">
          <span className="filter-label">Storage</span>
          {STORAGE_OPTIONS.map((opt) => (
            <button
              type="button"
              key={`storage-${opt.value}`}
              className={`chip${filters.storage === opt.value ? " active" : ""}`}
              aria-pressed={filters.storage === opt.value}
              onClick={() => setFilter("storage", opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="filter-row">
          <span className="filter-label">Status</span>
          <button
            type="button"
            className={`chip${filters.status.length === 0 ? " active" : ""}`}
            aria-pressed={filters.status.length === 0}
            onClick={() => setFilter("status", [])}
          >
            All
          </button>
          {STATUS_OPTIONS.map((opt) => {
            const active = filters.status.includes(opt.value);
            return (
              <button
                type="button"
                key={`status-${opt.value}`}
                className={`chip${active ? " active" : ""}`}
                aria-pressed={active}
                onClick={() => {
                  const next = active
                    ? filters.status.filter((s) => s !== opt.value)
                    : [...filters.status, opt.value];
                  setFilter("status", next);
                }}
              >
                {opt.label}
              </button>
            );
          })}
          <button
            type="button"
            className={`chip${filters.importableOnly ? " active" : ""}`}
            aria-pressed={filters.importableOnly}
            aria-label="Show importable only"
            onClick={() => setImportableOnly(!filters.importableOnly)}
          >
            Importable only
          </button>
        </div>

        <div className="filter-row">
          <label className="filter-label" htmlFor="session-filters-project">
            Project
          </label>
          <input
            id="session-filters-project"
            type="text"
            list="session-filters-project-list"
            placeholder="Any project"
            value={filters.project ?? ""}
            title={filters.project ?? undefined}
            onChange={(e) => {
              const value = e.target.value;
              setFilter("project", value === "" ? null : value);
            }}
          />
          <datalist id="session-filters-project-list">
            {projects.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
          {filters.project !== null ? (
            <button
              type="button"
              className="chip"
              aria-label="Clear project filter"
              onClick={() => setFilter("project", null)}
            >
              x
            </button>
          ) : null}
        </div>

        <div className="filter-row">
          <label className="filter-label" htmlFor="session-filters-search">
            Search
          </label>
          <input
            id="session-filters-search"
            type="search"
            placeholder="Title, id, path, project"
            value={filters.search}
            onChange={(e) => setFilter("search", e.target.value)}
          />
          {filters.search !== "" ? (
            <button
              type="button"
              className="chip"
              aria-label="Clear search"
              onClick={() => setFilter("search", "")}
            >
              x
            </button>
          ) : null}
        </div>

        <div className="filter-row">
          <label className="filter-label" htmlFor="session-filters-sort-field">
            Sort
          </label>
          <select
            id="session-filters-sort-field"
            value={filters.sort.field}
            onChange={(e) =>
              setFilter("sort", {
                field: e.target.value as SortField,
                direction: filters.sort.direction,
              })
            }
          >
            {SORT_FIELD_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <select
            aria-label="Sort direction"
            value={filters.sort.direction}
            onChange={(e) =>
              setFilter("sort", {
                field: filters.sort.field,
                direction: e.target.value as SortDirection,
              })
            }
          >
            <option value="desc">Desc</option>
            <option value="asc">Asc</option>
          </select>
        </div>
      </div>
    </details>
  );
}
