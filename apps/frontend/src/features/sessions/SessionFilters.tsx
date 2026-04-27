// Filter / sort / search controls for the unified inspection list.
//
// Stateless: every value comes in as a prop and every change calls a
// setter. `useSessionFilters` (in `App.tsx`) owns the state + the
// `localStorage` blob; this component is a thin presentational layer.
//
// Components rendered:
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
// `.session-filters`, `.filter-row`, `.filter-label`, `.chip`,
// `.chip.active`, `.session-filters input`, `.session-filters select`);
// WCAG AA contrast for `.chip.active` foreground/background was
// pre-computed via the Bun script in the M3 chunk evidence pack and
// remeasured in M6 — light 6.237 / dark 6.949 (both ≥ 4.5:1).
import type { SessionSyncStatus, Tool } from "../../lib/contracts";
import type {
  SessionFiltersState,
  SortDirection,
  SortField,
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

export function SessionFilters({
  filters,
  projects,
  setFilter,
  setImportableOnly,
}: SessionFiltersProps) {
  return (
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
  );
}
