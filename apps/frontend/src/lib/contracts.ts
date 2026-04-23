// Thin re-export barrel for the generated TypeScript contract types.
//
// The canonical source of truth is the Rust contract crate
// (components/ui-api-contracts/src/lib.rs); its generated TS declarations
// live under components/ui-api-contracts/bindings/*.ts and are imported
// here via the `@contracts/*` path alias wired in tsconfig.json.
//
// Frontend code MUST import contract types from this barrel (or directly
// from `@contracts/*`) and MUST NOT re-declare them by hand.
export type { SourceSessionView } from "@contracts/SourceSessionView";
export type { StoredSessionView } from "@contracts/StoredSessionView";
export type { PersistedScanError } from "@contracts/PersistedScanError";
export type { SessionSyncStatus } from "@contracts/SessionSyncStatus";
export type { Tool } from "@contracts/Tool";
export type { RescanReport } from "@contracts/RescanReport";
export type { ImportReport } from "@contracts/ImportReport";
export type { ImportSourceSessionsRequest } from "@contracts/ImportSourceSessionsRequest";
