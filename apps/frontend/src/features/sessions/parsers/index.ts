// Per-tool parser registry + dispatcher entry point.
//
// `PARSERS` is a `Record<Tool, ParserFn>`. The static type forces a
// compile-error if `Tool` ever grows a third variant without a parser
// added — the runtime exhaustiveness test in `index.test.ts` provides
// a second, runtime-asserted line of defence (a `Record<Tool, ParserFn>`
// alone won't fail if a future maintainer casts to silence TS).
//
// `dispatchParser` is the only consumer entry point: it routes the raw
// text to the per-tool parser, runs `buildSkim` on the resulting message
// stream, and wraps everything with the stream metadata produced by
// `streamRawText` (M3b). Unknown tools fall through to an empty
// ParsedSession + warning — this guarantees totality at the dispatch
// layer too.

import type { Tool } from "../../../lib/contracts";
import { buildSkim, USER_MSG_OVERSIZE_THRESHOLD } from "./buildSkim";
import { parseClaudeCode } from "./claude_code";
import { parseCodex } from "./codex";
import type { ParsedSession, ParserOutput, StreamMeta } from "./types";

export type ParserFn = (rawText: string) => ParserOutput;

/**
 * Registry mapping each `Tool` variant to its NDJSON parser.
 *
 * Adding a third tool in a future phase = one record entry + one parser
 * file, NOT a control-flow edit. Reviewers verify exhaustiveness via the
 * runtime assertion in `index.test.ts`.
 */
export const PARSERS: Record<Tool, ParserFn> = {
  claude_code: parseClaudeCode,
  codex: parseCodex,
};

/**
 * Wrap a per-tool parser with `buildSkim` + stream metadata to produce a
 * `ParsedSession`. Unknown `tool` values land in an empty session + warning
 * (the dispatcher itself is total — never throws, never returns a partial
 * session).
 *
 * @param tool One of the `Tool` variants. Unknown values produce an empty + warning result.
 * @param rawText Full NDJSON payload (already capped by `streamRawText`).
 * @param streamMeta Total bytes + truncation flag from `streamRawText`.
 */
export function dispatchParser(
  tool: Tool,
  rawText: string,
  streamMeta: StreamMeta,
): ParsedSession {
  const parser = PARSERS[tool] as ParserFn | undefined;
  const output: ParserOutput = parser
    ? parser(rawText)
    : {
        messages: [],
        warnings: [
          {
            lineOrdinal: 0,
            severity: "error",
            category: "schema",
            reason: `No parser registered for tool "${tool}"`,
          },
        ],
      };

  return {
    tool,
    messages: output.messages,
    skim: buildSkim(output.messages, USER_MSG_OVERSIZE_THRESHOLD),
    totalBytes: streamMeta.totalBytes,
    truncated: streamMeta.truncated,
    warnings: output.warnings,
  };
}

// Re-export public surface so consumers in M3b/M4 can pull from the
// barrel without reaching into individual files.
export { buildSkim, USER_MSG_OVERSIZE_THRESHOLD } from "./buildSkim";
export { parseClaudeCode } from "./claude_code";
export { parseCodex } from "./codex";
export type {
  BlockKind,
  Message,
  MessageKind,
  MetaCategory,
  ParsedSession,
  ParserOutput,
  ParseWarning,
  ParseWarningCategory,
  ParseWarningSeverity,
  SkimBlock,
  StreamMeta,
} from "./types";
