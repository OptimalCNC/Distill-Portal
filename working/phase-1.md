# Distill Portal Phase 1: Local Raw Session Store

## Objective

Phase 1 delivers the first runnable vertical slice of Distill Portal in Rust:

- collect Claude Code and Codex main session files from the same machine as the backend
- let the user inspect discovered sessions before choosing which ones to persist
- preserve the raw session JSONL bytes under a backend-owned local data directory
- store enough metadata to avoid duplicates and replace a session in place when the source file changes
- expose a minimal inspection surface so we can verify discovery, selective save, and store freshness before building skim view, search, summaries, or distill

This phase should prove the raw-first storage backbone, not the full product.

## Phase 1 Scope

### In scope

- embedded local collector only
- support for Claude Code main `.jsonl` sessions
- support for Codex main `.jsonl` sessions
- safe read of append-only JSONL files, ignoring an incomplete trailing line
- backend-local raw blob storage
- SQLite metadata store
- idempotent upsert keyed by `(tool, source_session_id)`
- replace-on-sync when a source session changes
- manual rescan plus periodic polling
- minimal HTTP inspection surface for:
  - opening a webpage
  - listing discovered source sessions
  - choosing which discovered sessions to save
  - listing stored sessions and their freshness status
  - fetching stored raw content

### Out of scope

- remote collectors
- collector registration or network transport protocol
- summaries, skim blocks, distill runs, search, annotations, tags, archive, bookmarks
- ingestion of Claude sidecar artifacts such as `subagents/`
- filesystem watch integrations (`notify`); polling is enough for this phase
- purge/tombstones
- cross-machine provenance and conflict handling

## Phase Boundary Decisions

### 1. Use the final storage split now

Phase 1 should already use:

- a `BlobStore` for raw payloads
- SQLite for metadata

This avoids building a throwaway manifest-only store and matches the architecture we already want later.

### 2. Keep collection in-process

The collector runs inside the backend process and calls `IngestService` directly. We do not build the remote HTTP collector protocol yet, but we keep an internal boundary so Phase 2 or 3 can wrap the same ingest path with transport later.

### 3. Store sessions in the backend's local data root

The phrase "stored next to our backend" should mean "stored in a backend-owned local data root on the same machine."

Recommended config shape:

- development default: `./var/distill-portal/`
- packaged default: `$XDG_DATA_HOME/distill-portal/`

The code should treat this as one configurable `data_dir`, so the storage layout stays the same even if the default path changes.

## Runtime Shape

```text
local session files
  -> embedded collector
  -> tool adapter
  -> safe JSONL read
  -> source inventory + status comparison
  -> optional user-selected save
  -> IngestService
  -> LocalFsBlobStore + SQLite
  -> minimal HTML + JSON inspection API
```

Only one machine is in scope. Only one logical collector exists in this phase: `embedded-local`.

## Rust Implementation Shape

Start with a single backend crate and clear module boundaries:

```text
src/
  main.rs
  app.rs
  config.rs
  api.rs
  collect/
    mod.rs
    scanner.rs
    safe_read.rs
    adapters/
      mod.rs
      claude_code.rs
      codex.rs
  ingest/
    mod.rs
    service.rs
    types.rs
  store/
    mod.rs
    blob_store.rs
    local_fs_blob_store.rs
    sqlite.rs
    migrations.rs
```

Recommended crates:

- `tokio` for runtime, polling loop, and file I/O
- `axum` for the minimal backend API
- `rusqlite` for SQLite access and migrations
- `serde` and `serde_json` for parsing session records
- `sha2` for content addressing and simple source fingerprints
- `time` for timestamps
- `tracing` and `tracing-subscriber` for logs
- `thiserror` for structured errors
- `walkdir` or `ignore` for directory traversal
- `uuid` or `ulid` for backend-issued `session_uid`

`rusqlite` is the pragmatic choice here. Phase 1 is single-process and SQLite-backed; we do not need async ORM complexity yet.

## Core Rust Interfaces

```rust
pub enum Tool {
    ClaudeCode,
    Codex,
}

pub struct ParsedSession {
    pub tool: Tool,
    pub source_session_id: String,
    pub source_path: PathBuf,
    pub source_fingerprint: String,
    pub raw_bytes: Vec<u8>,
    pub created_at: Option<OffsetDateTime>,
    pub source_updated_at: Option<OffsetDateTime>,
    pub project_path: Option<PathBuf>,
    pub title: Option<String>,
    pub has_subagent_sidecars: bool,
}

pub trait SessionAdapter {
    fn tool(&self) -> Tool;
    fn discover(&self, roots: &[PathBuf]) -> Result<Vec<PathBuf>, AdapterError>;
    fn parse(&self, path: &Path, safe_bytes: &[u8]) -> Result<ParsedSession, AdapterError>;
}

pub trait BlobStore {
    fn put(&self, content_addr: &str, bytes: &[u8]) -> Result<BlobStat, StoreError>;
    fn get(&self, content_addr: &str) -> Result<Vec<u8>, StoreError>;
    fn delete(&self, content_addr: &str) -> Result<(), StoreError>;
}
```

For Phase 1, `BlobStore` may be byte-oriented. We can expand it to streaming later without changing the session schema.

## Storage Layout

```text
<data_dir>/
├── distill.db
├── distill.db-wal
├── distill.db-shm
└── blobs/
    └── <aa>/<bb>/<sha256hex>
```

Rules:

- blob path is content-addressed by SHA-256 of the stored bytes
- blob files use mode `0600`
- directories use mode `0700`
- writes use temp-file + atomic rename in the target directory
- a startup sweep removes orphan temp files and orphan blobs with no DB reference

## SQLite Schema

Phase 1 only needs four tables:

```sql
CREATE TABLE sessions (
  session_uid TEXT PRIMARY KEY,
  tool TEXT NOT NULL,
  source_session_id TEXT NOT NULL,
  source_path TEXT NOT NULL,
  source_fingerprint TEXT NOT NULL,
  raw_ref TEXT NOT NULL REFERENCES raw_blobs(content_addr),
  created_at TEXT,
  source_updated_at TEXT,
  ingested_at TEXT NOT NULL,
  project_path TEXT,
  title TEXT,
  has_subagent_sidecars INTEGER NOT NULL DEFAULT 0,
  UNIQUE(tool, source_session_id)
);

CREATE TABLE raw_blobs (
  content_addr TEXT PRIMARY KEY,
  size_bytes INTEGER NOT NULL,
  refcount INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE scan_errors (
  error_id TEXT PRIMARY KEY,
  tool TEXT NOT NULL,
  source_path TEXT NOT NULL,
  fingerprint TEXT,
  message TEXT NOT NULL,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);

CREATE TABLE migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);
```

Notes:

- `sessions` is the minimal shared record for browse and dedup
- `raw_blobs` lets us keep content-addressed storage and correct refcounts from day one
- `scan_errors` gives us basic visibility into malformed files without inventing a larger observability subsystem
- we intentionally do not add `summary_cache`, FTS, annotations, jobs, or collector tables yet

## Collection Rules

### Claude Code

- discover `~/.claude/projects/*/*.jsonl`
- exclude nested `subagents/*.jsonl`
- use filename stem as initial `source_session_id`
- validate against record `sessionId` when present
- derive `project_path` from record `cwd`
- set `has_subagent_sidecars = true` if a sibling `subagents/` directory exists

### Codex

- discover `~/.codex/sessions/*/*/*/*.jsonl`
- extract `source_session_id` from filename suffix
- validate against `session_meta.payload.id` when present
- derive `project_path` primarily from `session_meta.payload.cwd`

### Safe JSONL Read

For both tools:

1. read the file bytes
2. truncate to the last newline byte
3. if no full line exists yet, skip the file for now
4. parse only the truncated bytes
5. store exactly those truncated bytes as raw payload

This handles append-in-progress files without ingesting torn JSON.

## Fingerprint and Upsert Rules

Phase 1 should use the simplest reliable fingerprint:

```text
source_fingerprint = sha256(safe_read_bytes)
```

This is cheaper to explain and easier to implement than the later optimized fingerprint format. We can replace the algorithm later without changing the surrounding contract or schema.

Upsert behavior:

1. parse the session file into `ParsedSession`
2. look up `(tool, source_session_id)` in `sessions`
3. if no row exists:
   create new `session_uid`, write blob, insert `raw_blobs`, insert `sessions`
4. if a row exists and `source_fingerprint` is unchanged:
   no-op
5. if a row exists and `source_fingerprint` changed:
   write the new blob first
   update the `sessions` row in one SQLite transaction
   increment the new blob refcount
   decrement the old blob refcount
   if old refcount reaches zero, delete the old blob after commit

Crash behavior:

- if blob write succeeds and DB transaction fails, the startup sweep deletes the orphan blob
- if DB commit succeeds and old-blob deletion fails, the old blob remains orphaned until the next startup sweep

That is acceptable for Phase 1 because the visible record still points at the correct raw payload.

## Minimal Backend API

Phase 1 should expose only enough backend surface to inspect discovery state and the store:

- `GET /`
- `POST /api/v1/admin/rescan`
- `GET /api/v1/source-sessions`
- `POST /api/v1/source-sessions/import`
- `GET /api/v1/sessions`
- `GET /api/v1/sessions/:session_uid`
- `GET /api/v1/sessions/:session_uid/raw`
- `GET /api/v1/admin/scan-errors`

The HTML page at `/` may be server-rendered and minimal. The API can stay local-only in this phase. No auth is required yet if the server binds to loopback only.

## Polling Model

Use periodic polling instead of filesystem watchers.

Recommended defaults:

- startup full scan
- poll every `30s`
- configurable source roots per tool

Polling refreshes the discovered-session inventory and freshness status. It does not auto-save new or changed sessions; saving remains an explicit user action in this phase.

Why polling first:

- simpler and more portable
- robust for append-only JSONL files
- easier to reason about when source tools rewrite or truncate files

## Done Criteria

Phase 1 is complete when the following are true:

- starting the backend discovers existing Claude Code and Codex sessions and shows them in the inspection surface
- the user can choose which discovered sessions to save into the local store
- the raw payload stored under `blobs/` matches the safe-read bytes exactly
- rescanning the same source files refreshes per-session freshness status without creating duplicate stored records
- re-saving an unchanged source session is a no-op
- re-saving a changed source session updates the existing stored session instead of creating a new one
- malformed trailing partial lines do not corrupt the stored copy
- `GET /` renders a webpage suitable for opening in a browser
- `GET /api/v1/source-sessions` returns enough metadata to choose what to save and whether each source session is `not_stored`, `up_to_date`, or `outdated`
- `GET /api/v1/sessions` returns enough metadata to confirm what is stored and whether each stored session is `up_to_date`, `outdated`, or `source_missing`
- `GET /api/v1/sessions/:session_uid/raw` returns the stored raw payload
- all data survives backend restart

## Testing Plan

Write tests before moving on to search or rendering:

- unit tests for Claude and Codex ID extraction
- unit tests for safe-read truncation behavior
- unit tests for content-addressed blob writes
- integration tests for discovery without auto-import, explicit save, no-op re-save, and replace-on-sync update
- integration test for malformed trailing line
- integration test for restart recovery with an orphan blob

Use fixture files checked into `tests/fixtures/claude_code/` and `tests/fixtures/codex/`.

## Why This Cut Is Right

This phase keeps only the part of the system that must be correct before everything else:

- discovering sessions
- preserving raw bytes
- identifying sessions stably
- updating them safely
- storing them under backend ownership

Once this exists, later phases can add:

- FTS and browse filters on the same `sessions` table
- skim-block extraction and renderer logic
- summary and distill jobs
- remote collector transport around the same `IngestService`

Phase 1 should not try to solve more than storage and collection.
