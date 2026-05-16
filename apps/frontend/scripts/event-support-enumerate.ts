#!/usr/bin/env bun

import { readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { extname, resolve } from "node:path";

type Tool = "claude_code" | "codex";

type TupleKey = {
  tool: Tool;
  topLevelType: string;
  variant: string;
};

type TupleStat = TupleKey & {
  count: number;
  samplePath: string;
  sampleLine: number;
};

type Options = {
  claudeRoots: string[];
  codexRoots: string[];
  stableSeconds: number;
  withSamples: boolean;
};

const MISSING = "(missing)";
const NO_VARIANT = "—";

function usage(): never {
  console.error(`Usage: bun apps/frontend/scripts/event-support-enumerate.ts [options]

Options:
  --claude-root <path>   Add a Claude Code root. Defaults to ~/.config/claude-code/projects and ~/.claude/projects.
  --codex-root <path>    Add a Codex root. Defaults to ~/.codex/sessions.
  --stable-seconds <n>   Exclude files modified in the last n seconds. Defaults to 120; use 0 to include active files.
  --with-samples         Print first observed file:line for each tuple.
  --help                 Show this help.
`);
  process.exit(2);
}

function parseArgs(argv: string[]): Options {
  const claudeRoots: string[] = [];
  const codexRoots: string[] = [];
  let stableSeconds = 120;
  let withSamples = false;

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") usage();
    if (arg === "--with-samples") {
      withSamples = true;
      continue;
    }
    if (arg === "--claude-root") {
      const value = argv[++index];
      if (!value) usage();
      claudeRoots.push(expandHome(value));
      continue;
    }
    if (arg === "--codex-root") {
      const value = argv[++index];
      if (!value) usage();
      codexRoots.push(expandHome(value));
      continue;
    }
    if (arg === "--stable-seconds") {
      const value = argv[++index];
      if (!value) usage();
      stableSeconds = Number(value);
      if (!Number.isFinite(stableSeconds) || stableSeconds < 0) usage();
      continue;
    }
    console.error(`Unknown argument: ${arg}`);
    usage();
  }

  return {
    claudeRoots:
      claudeRoots.length > 0
        ? claudeRoots
        : [
            expandHome("~/.config/claude-code/projects"),
            expandHome("~/.claude/projects"),
          ],
    codexRoots:
      codexRoots.length > 0 ? codexRoots : [expandHome("~/.codex/sessions")],
    stableSeconds,
    withSamples,
  };
}

function expandHome(path: string): string {
  if (path === "~") return homedir();
  if (path.startsWith("~/")) return resolve(homedir(), path.slice(2));
  return resolve(path);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const stats = new Map<string, TupleStat>();
  const rootsSeen: Record<Tool, string[]> = { claude_code: [], codex: [] };
  const missingRoots: Record<Tool, string[]> = { claude_code: [], codex: [] };
  const malformed: Record<Tool, number> = { claude_code: 0, codex: 0 };
  const nonObject: Record<Tool, number> = { claude_code: 0, codex: 0 };
  const stableCutoffMs = Date.now() - options.stableSeconds * 1000;

  await enumerateTool(
    "claude_code",
    options.claudeRoots,
    stats,
    rootsSeen,
    missingRoots,
    malformed,
    nonObject,
    stableCutoffMs,
  );
  await enumerateTool(
    "codex",
    options.codexRoots,
    stats,
    rootsSeen,
    missingRoots,
    malformed,
    nonObject,
    stableCutoffMs,
  );

  printTool("claude_code", stats, rootsSeen, missingRoots, malformed, nonObject, options);
  console.log("");
  printTool("codex", stats, rootsSeen, missingRoots, malformed, nonObject, options);
}

async function enumerateTool(
  tool: Tool,
  roots: string[],
  stats: Map<string, TupleStat>,
  rootsSeen: Record<Tool, string[]>,
  missingRoots: Record<Tool, string[]>,
  malformed: Record<Tool, number>,
  nonObject: Record<Tool, number>,
  stableCutoffMs: number,
) {
  for (const root of roots) {
    const files = await listJsonlFiles(root, stableCutoffMs);
    if (files === null) {
      missingRoots[tool].push(root);
      continue;
    }
    rootsSeen[tool].push(root);
    for (const file of files) {
      const text = await readFile(file, "utf8");
      const lines = text.split("\n");
      for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
        const line = lines[lineIndex];
        if (line === "" && lineIndex === lines.length - 1) continue;
        if (line.trim() === "") continue;

        let record: unknown;
        try {
          record = JSON.parse(line);
        } catch {
          malformed[tool] += 1;
          continue;
        }
        if (!isObject(record)) {
          nonObject[tool] += 1;
          continue;
        }

        const tuples =
          tool === "claude_code"
            ? enumerateClaudeCode(record)
            : enumerateCodex(record);
        for (const tuple of tuples) {
          addStat(stats, tuple, file, lineIndex + 1);
        }
      }
    }
  }
}

async function listJsonlFiles(
  root: string,
  stableCutoffMs: number,
): Promise<string[] | null> {
  try {
    const rootStat = await stat(root);
    if (!rootStat.isDirectory()) return null;
  } catch {
    return null;
  }

  const out: string[] = [];
  const stack = [root];
  while (stack.length > 0) {
    const dir = stack.pop() as string;
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const path = resolve(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(path);
      } else if (entry.isFile() && extname(entry.name) === ".jsonl") {
        const fileStat = await stat(path);
        if (fileStat.mtimeMs <= stableCutoffMs) {
          out.push(path);
        }
      }
    }
  }
  return out.sort();
}

function enumerateClaudeCode(record: Record<string, unknown>): TupleKey[] {
  const topLevelType =
    typeof record.type === "string" ? record.type : MISSING;
  if (topLevelType === "user" || topLevelType === "assistant") {
    const message = isObject(record.message) ? record.message : null;
    const content = message ? message.content : undefined;
    if (typeof content === "string") {
      return [{ tool: "claude_code", topLevelType, variant: "message.content string" }];
    }
    if (Array.isArray(content)) {
      const variants: TupleKey[] = [];
      for (const item of content) {
        if (!isObject(item)) {
          variants.push({
            tool: "claude_code",
            topLevelType,
            variant: "content[].(non-object)",
          });
          continue;
        }
        const itemType = typeof item.type === "string" ? item.type : MISSING;
        variants.push({
          tool: "claude_code",
          topLevelType,
          variant: `content[].${itemType}`,
        });
      }
      return variants.length > 0
        ? variants
        : [{ tool: "claude_code", topLevelType, variant: "content[].(empty)" }];
    }
    return [{ tool: "claude_code", topLevelType, variant: "message.content other" }];
  }

  return [{ tool: "claude_code", topLevelType, variant: NO_VARIANT }];
}

function enumerateCodex(record: Record<string, unknown>): TupleKey[] {
  const topLevelType =
    typeof record.type === "string" ? record.type : MISSING;
  const payload = isObject(record.payload) ? record.payload : null;

  if (topLevelType === "event_msg") {
    const payloadType =
      payload && typeof payload.type === "string" ? payload.type : MISSING;
    return [{ tool: "codex", topLevelType, variant: payloadType }];
  }

  if (topLevelType === "response_item") {
    const payloadType =
      payload && typeof payload.type === "string" ? payload.type : MISSING;
    if (payloadType === "message") {
      const role =
        payload && typeof payload.role === "string" ? payload.role : MISSING;
      return [{ tool: "codex", topLevelType, variant: `message role=${role}` }];
    }
    return [{ tool: "codex", topLevelType, variant: payloadType }];
  }

  return [{ tool: "codex", topLevelType, variant: NO_VARIANT }];
}

function addStat(
  stats: Map<string, TupleStat>,
  tuple: TupleKey,
  samplePath: string,
  sampleLine: number,
) {
  const key = tupleKey(tuple);
  const existing = stats.get(key);
  if (existing) {
    existing.count += 1;
    return;
  }
  stats.set(key, {
    ...tuple,
    count: 1,
    samplePath,
    sampleLine,
  });
}

function tupleKey(tuple: TupleKey): string {
  return `${tuple.tool}\u0000${tuple.topLevelType}\u0000${tuple.variant}`;
}

function printTool(
  tool: Tool,
  stats: Map<string, TupleStat>,
  rootsSeen: Record<Tool, string[]>,
  missingRoots: Record<Tool, string[]>,
  malformed: Record<Tool, number>,
  nonObject: Record<Tool, number>,
  options: Options,
) {
  console.log(`=== ${tool} ===`);
  console.log(`roots: ${rootsSeen[tool].length > 0 ? rootsSeen[tool].join(", ") : "(none)"}`);
  console.log(`stable window: excluding files modified in the last ${options.stableSeconds}s`);
  if (missingRoots[tool].length > 0) {
    console.log(`missing roots: ${missingRoots[tool].join(", ")}`);
  }

  const rows = Array.from(stats.values())
    .filter((row) => row.tool === tool)
    .sort((a, b) => {
      const left = `${a.topLevelType} / ${a.variant}`;
      const right = `${b.topLevelType} / ${b.variant}`;
      return left.localeCompare(right);
    });

  for (const row of rows) {
    const label =
      row.variant === NO_VARIANT
        ? row.topLevelType
        : `${row.topLevelType} / ${row.variant}`;
    const suffix = options.withSamples
      ? ` (sample ${row.samplePath}:${row.sampleLine})`
      : "";
    console.log(`${label.padEnd(56)} ${String(row.count).padStart(8)} lines${suffix}`);
  }

  if (malformed[tool] > 0 || nonObject[tool] > 0) {
    console.log(
      `non-event lines: malformed=${malformed[tool]}, non_object=${nonObject[tool]}`,
    );
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

await main();
