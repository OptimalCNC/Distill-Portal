# Collector Runtime

## Purpose

Owns source discovery, safe JSONL reads, and tool-specific session parsing for Claude Code and Codex.

## Owned Files

- `src/adapters/**`
- `src/safe_read.rs`
- `src/scanner.rs`
- `src/types.rs`

## Public API / Entry Points

- `Scanner`
- `ClaudeCodeAdapter`
- `CodexAdapter`
- `safe_read_jsonl_bytes`
- `SCANNER_CONFIG_VERSION`

## Scanner Config Version

`SCANNER_CONFIG_VERSION` is part of Phase 9a operation idempotency for
`rescan_sources`. Bump it whenever scanner discovery, fingerprinting, or parse
eligibility changes enough that a new rescan should not deduplicate against an
operation created by the prior behavior.

## Important Internal Files

- `src/adapters/claude_code.rs`
- `src/adapters/codex.rs`
- `src/scanner.rs`

## Dependencies It May Rely On

- `components/ui-api-contracts`

## Read Before Modifying

- `src/scanner.rs`
- `src/adapters/mod.rs`
- `tests/parsers.rs`

## Tests

- `tests/parsers.rs`
