# Distill Portal PRD

Implementation-specific decisions live in `ARCHITECTURE.md`.

## Product Summary

Distill Portal is a local-first portal for collecting, storing, and analyzing coding sessions produced by AI coding tools.

What distinguishes Distill Portal from a session-file browser is that only its features make sense together:

- Every session is rendered as a sequence of **skim blocks** — one per user message plus the agent reaction that follows — so the user can scan a long agent-heavy session by their own intent.
- A **distill** action can run against whatever slice of sessions is currently selected or filtered, and surface repeated patterns, candidate reusable skills, and suggested improvements.

It has two core jobs:

1. Act as a reliable raw session store that discovers sessions from tool-specific locations, keeps them synchronized as they change, and preserves the original source data with enough derived indexing to browse and search it well.
2. Help users view and analyze those sessions through multiple lenses such as date, project, tool, tags, bookmarked status, summarized skim blocks, and on-demand distillation of the currently selected sessions.

The product should become the canonical place where a user can answer questions like:

- What did I work on last week?
- Show me all sessions for a given project.
- How do my Codex sessions differ from my Claude Code sessions?
- Can I skim this session by my own prompts and summarized agent reactions before opening the full transcript?
- Which workflows or prompts keep showing up and should be turned into reusable skills?

## Problem Statement

AI coding tools generate valuable session history, but that history is fragmented across tool-specific files, folders, and formats. Users typically cannot:

- see all of their sessions in one place
- keep a durable copy that remains useful even if the source files move or change
- browse sessions consistently across tools
- skim long agent-heavy sessions quickly
- analyze trends across time or across projects
- run focused analysis on the exact slice of sessions they are currently viewing
- identify repeated workflows worth reusing

Distill Portal solves this by creating a unified portal layer above the raw tool outputs.

## Product Goals

### Goal 1: Raw Session Store

Distill Portal should:

- support Claude Code and Codex together as the only session sources in scope
- discover sessions from configured coding-tool locations
- import newly created sessions automatically
- detect updates to existing sessions and re-sync incrementally
- preserve raw source data for traceability and reprocessing
- extract only the shared metadata needed for indexing and browsing
- keep tool-specific structure available so each source can be handled appropriately
- prevent duplicate storage of the same session

### Goal 2: Session Exploration and Analysis

Distill Portal should:

- provide several ways to browse sessions, including by date, project, and tool
- support transcript view, skim view, and full-text search
- let the user expand any summarized block into the original messages or events
- derive useful metadata such as files mentioned, task type, and outcome signals
- surface patterns across sessions, including repeated instructions, workflows, and habits
- let the user run a distill analysis on the currently selected sessions for any lens or filter
- help users identify reusable "skills" from real session history

## Non-Goals

The first version should not try to be:

- a live chat interface for talking to coding agents
- a source-of-truth editor for the original tool session files
- a team collaboration suite with permissions, comments, and shared workspaces
- a model training platform
- a fully normalized cross-tool transcript model that erases tool-specific structure
- a fully automatic skill generator that publishes production-ready skills without user review
- a session diffing tool that compares two sessions against each other
- a replay environment that runs a prior session against a live agent
- a public sharing surface with session links or embeddable views
- ingestion of Claude Code subagent sidecar transcripts (the `~/.claude/projects/<project>/<session>/subagents/` files are not read by v1; if they materially matter to a user's workflow they can be promoted to a first-class ingestion target in a later release)
- authenticated or TLS-hardened remote collection (v1 remote collection assumes a trusted private network)
- a conflict-resolution UI for cross-machine duplicate sessions (v1 relies on `(tool, source_session_id)` being globally unique; duplicate detection is limited to a warning log, and both duplicate records remain visible in the UI as-is with no merge workflow)
- automatic eviction of raw payloads under a storage cap (v1 raw retention is unbounded; reclaiming space requires explicit Purge — see "Archive Is the Default; Redaction-Style Purge Is the Escape Hatch")
- audit logs of Purge or archive/unarchive actions

## Assumptions

- The initial product is single-user and local-first.
- Session sources are primarily local files or directories managed by supported coding tools.
- Users care about raw fidelity first.
- Cross-tool browsing will likely rely on lightweight shared metadata plus tool-specific handling, not a single exhaustive normalized schema.
- Analysis can start with pragmatic heuristics and metadata extraction before advanced clustering or ML-heavy methods.
- Supported source-tool session formats are stable enough to parse with per-tool adapters; parser adjustments are expected after major tool releases.
- Summary generation and distill analysis invoke an external LLM, which may incur API costs and requires network access. Cost, latency, and egress control are product concerns that must be visible to the user.
- A single user's total session volume fits in local storage on one machine in v1.
- The UI/API requires a per-request local credential even in single-user mode. The product's first-run flow surfaces a one-time setup step that bootstraps this credential into a user-scoped token file the embedded UI reads on launch.

## Collection Topology

Distill Portal is structured around a collector layer that reads source session files and submits them to a backend store. Two modes are supported in v1:

1. **Embedded local mode** (the default): the backend starts an embedded local collector on the same machine, which scans that machine's session directories. This is the simple out-of-the-box experience for a developer on a single laptop.
2. **Remote collector mode** (simple v1 form): a separate collector process runs on another machine on the same trusted private network and ships sessions to the backend. v1 does not include authentication or TLS-based hardening for the remote path — the user explicitly accepts a "trusted network" assumption for remote collection. Authentication, certificate provisioning, and credential rotation are deferred to a later release.

Regardless of which mode is active, the shared session record treats collector and source-machine identity as provenance so a user can tell which machine a session came from.

Because the v1 remote path is unauthenticated, the product documentation must clearly explain the trust assumption and recommend that users expose the backend only on private/local network interfaces or VPN-backed networks they already trust. Any exposure to a public network in v1 is a user-accepted risk.

## Primary Users

### Individual Developers

People using tools like Codex or Claude Code who want a better way to review what they did, recover useful context, and improve how they work with agents.

### Power Users and Tool Builders

People who want to study repeated prompting and workflow patterns, compare tools, and turn recurring successful behavior into reusable practices.

### Teams and Managers

Later-stage users who want to understand AI-assisted development habits across projects. This is not the primary MVP audience, but the data model should not block this future direction.

## Core User Jobs

- As a developer, I want all of my coding sessions collected automatically so I do not need to hunt through tool-specific directories.
- As a developer, I want updated sessions to stay in sync so the portal reflects the latest transcript state.
- As a developer, I want to browse sessions by date so I can review what happened on a given day or week.
- As a developer, I want to browse sessions by project (the folder or repository the work happened in) so I can understand the history of work on a codebase.
- As a developer, I want each session grouped into skim-friendly blocks based on my messages so I can quickly review what I asked and how the agent reacted.
- As a developer, I want to expand any summarized block into the original underlying messages or events when I need detail.
- As a developer, I want to search session content so I can find prior prompts, commands, file references, and decisions.
- As a developer, when I select a lens or filtered session set, I want the portal to distill that subset and suggest possible improvements or reusable skills.
- As a developer, I want the portal to highlight patterns and repeated workflows so I can improve my practice.
- As a developer, I want to mark useful fragments as reusable so I can turn them into future skills, checklists, or templates.

## Functional Requirements

### 1. Session Ingestion

The system must:

- support source adapters for Claude Code and Codex
- let the user configure one or more source locations per tool
- discover new sessions automatically
- detect when an existing session has changed
- ingest updates incrementally rather than re-importing everything
- support manual import or reindexing
- preserve raw source artifacts and source metadata
- record ingestion status, sync status, and last-seen timestamps

The system should:

- tolerate partially malformed or tool-version-specific data
- keep enough source metadata to debug import issues later

### 2. Session Storage and Derived Indexes

The system should be raw-first. It should store the original session artifacts and derive only the shared fields needed for browsing, search, summaries, and analysis.

The system should not depend on a single fully normalized transcript model across all supported tools.

Each stored session should include, where available:

- stable session identifier
- source tool
- source location
- created time
- last updated time
- project label (a human-friendly alias derived from `project_path`, optionally collapsed via the project-alias map; see `ARCHITECTURE.md`)
- project path (a best-effort folder or repository path inferred from session data)
- session title or derived label
- raw payload reference
- sync metadata
- archived status
- summary blocks keyed by user-message boundaries
- derived metadata such as tags, files mentioned, task type, and outcome signals

The storage layer must:

- store raw source artifacts durably
- avoid duplicates
- support incremental updates
- retain enough change-detection metadata (timestamps, fingerprints) to explain when a session last updated; prior versions of a session are not retained in v1 (see "Current Session Lifecycle" in Key Product Decisions)
- support indexing by date, project, tool, tags, and bookmark status
- support full-text search over raw content and derived metadata
- support tool-specific parsing and rendering paths where cross-tool structure differs

### 3. Session Browsing and Viewing

The product must provide the following views:

- Recent activity view
- Timeline view by day, week, and month
- Project view
- Tool view
- Search results view
- Session detail view

Users must be able to filter and sort sessions by:

- date or date range
- time or time range
- project (the folder or repository the work happened in; see terminology note in `ARCHITECTURE.md`)
- tool (Claude Code, Codex)
- tags
- bookmarked status
- `has_notes`
- archived status
- ingestion status, and sync status (the latter spans the full enum defined in `ARCHITECTURE.md`, including `orphaned_source` for sessions whose source file no longer exists on disk and `sync_blocked` for sessions whose collector has stopped retrying after a per-session ceiling)
- `do_not_send_to_llm` flag

Additional filters (`machine_id`, `collector_id`, derived `task_type`, `has_subagent_sidecars`, and `quality_mark` for the session-level successful/reusable/problematic marker) appear conditionally in the UI only when the underlying dimension actually has variety to filter on; their definitions live in `ARCHITECTURE.md`.

Users should also be able to:

- save a filter combination as a named **lens** and reopen it later
- select a subset of filtered sessions and perform bulk actions (archive, summarize, distill)

The session detail view must show:

- the transcript in original chronological order
- an optional skim view where user messages remain visible and the coding-agent reaction between them is summarized by default (once the user has accepted the first-run LLM egress consent; before consent the block renders in a `disabled` summary state, after a user opt-out it renders in an `excluded_by_opt_out` state, and a `do_not_send_to_llm` block renders as `skipped_per_user` — none of these are ever a silent blank; full block-summary state enum is in `ARCHITECTURE.md` §7)
- summary blocks whose unit is: one user message plus the coding-agent reaction until the next user message
- skim blocks named in `ARCHITECTURE.md` as `user_turn`, `boundary` (tool-initiated session-resume / compaction markers), `agent_only` (synthetic block for agent-only sessions), and `oversized_user_message` (single user message above a configured size threshold, rendered collapsed without summarization)
- a header badge indicating that the session has Claude Code subagent sidecar files on disk (the `has_subagent_sidecars` flag) so the user knows there is related material outside the portal's view, even though sidecar content is not ingested in v1
- a way to expand any summary block into the underlying raw messages or events
- agent activity should not be summarized as isolated low-level steps
- cached summaries when available
- timestamps when available
- source tool and source metadata
- linked project context
- derived metadata such as files mentioned, task type, and outcome indicators
- notes, bookmarks, or reusable excerpts if the user has created them; notes may be attached to a session as a whole or to an individual skim block
- an "orphaned annotations" surface listing any block-anchored annotations (notes attached to a specific block, highlights on a raw-event or block range) that could no longer be relinked after a source update; these are never silently discarded. Session-scoped state (bookmarks, session-level tags and notes, the session's `quality_mark`) is never block-anchored and so is never orphaned by relink — it persists across source updates as-is.

The summary workflow must:

- generate summaries lazily on first view of a skim block (the opt-out tier — see "LLM Egress Default" below — runs this generation automatically after the user has accepted first-run consent)
- allow the user to generate summaries for selected sessions in bulk
- let the user opt out of automatic on-view summary generation per tool, per project, or per session
- cache generated summaries so they are not recomputed on every view, and best-effort relink them to updated session data after sync (see "Current Session Lifecycle")
- show a clear first-run consent surface that names the LLM provider and the shape of the payload sent out
- honor a per-session `do_not_send_to_llm` flag consistently in both summary and distill paths (the flag affects external LLM egress only; it does not hide the session from local browsing or local search)
- show a clear error state in the UI when summary generation fails (e.g., provider outage, rate limit) rather than a silent stale cache

### LLM Egress Default: Tiered

- **Summaries are opt-out**: after a one-time first-run consent that explains what a skim-block summary looks like (small per-block payload, scrubbed), summaries run on demand by default. Users can turn summaries off per tool, per project, or per session.
- **Distill is opt-in**: each distill run presents a fresh pre-run confirmation with the selected session count, estimated payload size, target LLM provider, and per-session "exclude from this run" checkboxes (a transient choice scoped to the single run, distinct from the persistent per-session `do_not_send_to_llm` flag below). Nothing leaves the machine until the user accepts; there is no "don't ask again" shortcut.
- Per-tool opt-out, per-project opt-out, and per-session "do-not-send" flags apply to both tiers consistently.
- The rationale for tiered defaults is that summary payloads are small and bounded, while distill payloads aggregate excerpts from many sessions and have a materially larger secret-exposure surface.

Skim-view edge cases:

- A session with no user messages (for example, an agent-autopilot run) is rendered as a single synthetic `agent_only` block, collapsed by default.
- A single user message above a configured size threshold is rendered as its own collapsed-by-default `oversized_user_message` block without summarization (the message itself is not summarized).
- Tool-initiated boundaries (session resume, compaction markers) are rendered as explicit `boundary` markers rather than merged into a neighboring block.

### 4. Analysis, Distill, and Insight Generation

The product should help users analyze:

- repeated prompting patterns
- common task decomposition strategies
- testing and validation habits
- workflows that correlate with successful outcomes
- workflows that appear wasteful or ineffective
- differences across projects, tools, and time periods

The product should let users run analysis against the currently selected sessions from any lens or filter combination.

That distill action should be able to produce:

- possible improvements in how the user works with coding agents
- repeated prompts, instructions, or workflow fragments
- candidate skills worth saving
- supporting examples from the selected sessions

The first version does not need perfect inference. It does need useful, inspectable outputs.

The product may use closely related analyzer flows for:

- improvement-oriented distill suggestions
- skill-oriented distill suggestions

The difference is mainly the analyzer prompt and the output framing, not a completely separate product workflow.

The analysis layer should surface:

- recurring instructions or prompt fragments
- common session types; v1 task-type categories are: bug fix, feature work, refactor, review, investigation, documentation, setup or configuration, and uncategorized
- frequently referenced files or repositories
- trend summaries over time
- lens-specific distill suggestions for the current selection
- candidate skill patterns worth saving

Distill runs must be cancelable, must expose progress when the selection is large, and must preserve enough intermediate state to resume or retry without recomputing everything. Resume is best effort: if the analyzer prompt or model version changes between pause and resume, prior partial findings are discarded so results are not silently mixed across versions.

Distill cache identity must include the analyzer mode (improvement or skill) and the active analyzer prompt and model versions in addition to the selected session set, so that an improvement-mode run and a skill-mode run over the same selection — or the same mode under a newer prompt or model — are treated as distinct results rather than collapsing into one cache entry.

### 5. Reuse and Skill Curation

The product should support lightweight reuse workflows.

Users should be able to:

- bookmark sessions
- highlight useful excerpts (a highlight anchors to a raw-event or skim-block range and carries one of the quality labels below — every highlight is also a quality mark on that range)
- attach tags or notes (notes may be attached to a session or to an individual skim block)
- mark a session or excerpt as successful, reusable, or problematic (at session granularity this is the `quality_mark`; at excerpt granularity it is a highlight on the chosen range; the vocabulary is the same)
- collect multiple excerpts or distill findings into a draft skill or workflow note

From any distill result, the user must be able to:

- dismiss the finding (a dismissed finding is hidden from the run's default view but the run record is retained; dismissals are reversible from the run detail)
- save it as a new skill draft
- merge it into an existing skill draft (append the finding's headline, explanation, and supporting citations to a draft the user picks)

Skill drafts live in a dedicated Skills view, viewable and editable as plain text (Markdown). An export or publish format beyond plain-text Markdown drafts is out of scope for MVP, but drafts must be viewable, editable, and retainable across sessions.

The initial product may stop at curation and export-ready drafts. It does not need fully automated skill publishing.

## MVP Scope

The MVP should focus on the smallest product that proves the two main goals.

### In Scope for MVP

- local configuration of supported session source locations
- ingestion for Claude Code and Codex
- automatic discovery of new sessions
- update detection and re-sync for existing sessions
- durable local storage of raw sessions and derived indexes
- session list with filtering and search
- timeline browsing by date (recent activity, day, week, month)
- project browsing
- tool-based browsing
- session detail transcript view
- skim view with summary blocks keyed to user-message boundaries
- on-demand summary generation with cache reuse
- basic derived metadata such as files mentioned, tags, and simple task-type inference
- on-demand distill analysis on any filtered or lens-selected session set
- basic analysis summaries, for example top projects, session counts over time, repeated phrases, or common workflow markers
- archive as the default removal flow, with a redaction-style Purge escape hatch
- bookmarking, tagging, and manual notes on sessions
- skill-draft curation (create, edit, list) as plain-text Markdown

### Out of Scope for MVP

- multi-user collaboration
- cloud sync
- permissions and roles
- automated skill generation without user review
- advanced semantic clustering that depends on heavy model infrastructure
- direct editing of source session files
- published skill export formats beyond plain-text Markdown drafts
- audit logs of purges or archive/unarchive actions

## Success Criteria

The product is successful if a user can:

- point Distill Portal at one or more tool session locations and see sessions imported correctly
- trust that updated sessions remain synchronized
- leave project blank when it cannot be derived rather than failing ingestion
- skim a session through summary blocks aligned to their own messages, then expand into the original transcript when needed
- find prior work by date, project, or tool in seconds
- open any session and inspect its transcript with useful metadata
- run a distill analysis on a chosen session slice and get plausible improvement or skill suggestions
- discover at least a few repeated patterns or reusable fragments from historical data

## Key Product Decisions

### Local-First by Default

The initial product should optimize for privacy, low setup friction, and direct access to local session artifacts.

### Raw-First, Tool-Aware Processing

The system should keep raw source data as the source of truth, plus derived indexes, summaries, and metadata for browsing and analysis.

It should not depend on forcing every tool into one exhaustive normalized schema. Where common fields are available, extract them. Where they are not, keep tool-specific handling.

For v1, the supported tools are Claude Code and Codex only. The architecture should treat them as first-class peers rather than as one-off imports.

### Shared Fields Are for Filtering, Not Full Normalization

The portal should require only the small set of shared fields needed for filtering and navigation, such as tool, project folder, and date or time metadata. Everything else can remain tool-specific.

If project attribution cannot be determined reliably, the session should remain stored with an empty project field.

### Analysis Should Be Explainable

The first analysis features should favor transparent heuristics and inspectable outputs over opaque scoring. Users should be able to understand why a session was tagged or grouped in a certain way.

### Summaries Follow User Turn Boundaries

The summary unit should be one user message plus the coding-agent reaction until the next user message. In skim mode, user messages remain the primary anchors and the intervening agent reaction is summarized by default. This keeps the view aligned with user intent and avoids over-summarizing low-level agent steps.

### Current Session Lifecycle

The portal does not preserve historical versions of a session in v1. When a source session changes, the portal should sync the latest state and replace the stored derived state. It should make a best effort to relink existing summaries and existing block-anchored user annotations (notes attached to a specific block, highlights on a raw-event or block range) to the updated session data where possible. Session-scoped state (bookmarks, session-level tags and notes, the session's `quality_mark`) is preserved verbatim across the update and is never subject to relinking. Summaries that cannot be relinked are marked stale and lazily regenerated; block-anchored annotations that cannot be relinked surface in the session detail view as "orphaned annotations" rather than being silently discarded.

### Archive Is the Default; Redaction-Style Purge Is the Escape Hatch

Archiving is the normal way to remove a session from view. Archived sessions are hidden by default but remain available for browsing and analysis when explicitly included, and they can be unarchived from the archived-inclusive view with a single action.

For the narrow but realistic case where a session must be fully purged (for example, the user realizes they pasted credentials or sensitive customer data), the product must provide a **Purge** action that removes the raw payload, derived metadata, summary cache, distill citations, and user annotations (notes, tags, highlights, bookmarks) for that session. Purge is a destructive operation and is intended for redaction, not for ordinary cleanup. To prevent re-import by the next collector scan, the backend must keep a local tombstone of purged source identities.

Skill drafts that referenced a purged session keep the draft itself but replace the citation with a tombstone marker so the user can see that the cited evidence is no longer available.

Tombstone release is an explicit, user-initiated UI action: the user may release a tombstone (for example, after editing the offending content out of the source file) to allow re-ingestion. Re-ingestion after release creates a fresh shared record with a new identifier; the prior identifier is not reused.

Bulk deletion and team-scale data-protection workflows are out of scope for v1. Audit logs of Purge or archive/unarchive actions are also out of scope for v1 (see "Out of Scope for MVP").

## Resolved Product Decisions

- Claude Code and Codex are the only supported tools in scope, and they are supported together.
- The shared cross-tool fields are limited to what is needed for filtering and navigation, such as tool, project, and date or time metadata.
- Project detection is best effort. If a session cannot be mapped to a folder or repository, the project field remains blank.
- Summaries are generated lazily on first view of a skim block (the opt-out tier after one-time first-run consent), may also be generated in bulk for selected sessions, and must be cached. Users should be able to opt out of automatic on-view generation per tool, per project, or per session.
- Archive is the default removal flow. A destructive Purge action is available for redaction of sessions that must be fully removed (for example, accidentally pasted credentials). Purge destroys raw payload, derived metadata, summary cache, distill citations, and user annotations, and writes a tombstone that the user may explicitly release to allow re-ingestion.
- Session history is not preserved in v1. Sync replaces the current stored state and tries to relink summaries and block-anchored annotations (block notes, raw-event or block-range highlights) after updates; session-scoped state (bookmarks, session-level tags/notes, `quality_mark`) is preserved verbatim. Block-anchored annotations that cannot be relinked are surfaced as "orphaned" for user review.
- Improvement distill and skill distill are closely related flows that mainly differ by analyzer prompt and output framing; the analyzer mode and the active prompt/model versions are part of the distill cache key so the two modes (and runs under different prompt or model versions) do not collapse into one cached run.
- Summarization and distill invoke an external LLM. The product must display first-run consent, expose per-session opt-out, and show clear error states when LLM calls fail.
- Skim blocks have four defined kinds: `user_turn` (the primary user-message-anchored block), `boundary` (tool-initiated session-resume / compaction markers), `agent_only` (synthetic block for agent-only sessions), and `oversized_user_message` (single user message above a configured size threshold, rendered collapsed without summarization).
- Cached summaries are not full-text searchable in v1 (search covers raw content and derived metadata); summary search may be added later.
- The UI/API requires a per-request local credential even in single-user mode; the embedded UI bootstraps from a user-scoped token file at launch.

## Open Product Decisions

Remaining open items that are still worth tracking:

- **Distill result exportability**: v1 persists a distill run per selection fingerprint (see `ARCHITECTURE.md`). Whether distill runs should also be exportable as Markdown (for sharing, review, or versioning outside the portal) is not yet decided.
- **Summary auto-regeneration policy on source update**: v1 defaults to "mark stale and regenerate lazily on next view." Whether to offer an optional eager-regenerate-on-sync setting for power users is open.
- **Repository-vs-project field model**: v1 uses a single `project_path` field derived primarily from `cwd` (with the Claude adapter falling back to a reverse-decode of the `<project-key>` folder name when `cwd` is missing — see `ARCHITECTURE.md` §"Project Attribution"). Whether to add a separate derived `repository_root` signal (the nearest enclosing `.git`) is open; it would layer on top of `project_path` without changing the filter model.
