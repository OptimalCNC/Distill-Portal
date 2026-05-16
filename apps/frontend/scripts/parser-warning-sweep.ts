import { readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseClaudeCode } from "../src/features/sessions/parsers/claude_code";
import { parseCodex } from "../src/features/sessions/parsers/codex";
import type { ParseWarning } from "../src/features/sessions/parsers/types";

export type SweepTool = "claude_code" | "codex";

export type SweepRoot = {
  tool: SweepTool;
  path: string;
};

export type SweepWarning = {
  tool: SweepTool;
  file: string;
  warning: ParseWarning;
};

export type SweepResult = {
  roots: Array<SweepRoot & { exists: boolean; files: number }>;
  warnings: SweepWarning[];
  counts: Map<string, number>;
};

const DEFAULT_ROOTS: SweepRoot[] = [
  { tool: "claude_code", path: "~/.config/claude-code/projects" },
  { tool: "claude_code", path: "~/.claude/projects" },
  { tool: "codex", path: "~/.codex/sessions" },
];

export async function runSweep(roots = DEFAULT_ROOTS): Promise<SweepResult> {
  const warnings: SweepWarning[] = [];
  const rootSummaries: SweepResult["roots"] = [];

  for (const root of roots) {
    const rootPath = expandHome(root.path);
    const files = await listJsonlFiles(rootPath);
    rootSummaries.push({
      tool: root.tool,
      path: rootPath,
      exists: files !== null,
      files: files?.length ?? 0,
    });

    if (!files) continue;

    for (const file of files) {
      const raw = await Bun.file(file).text();
      const output =
        root.tool === "claude_code" ? parseClaudeCode(raw) : parseCodex(raw);
      for (const warning of output.warnings) {
        warnings.push({ tool: root.tool, file, warning });
      }
    }
  }

  return { roots: rootSummaries, warnings, counts: aggregateWarnings(warnings) };
}

export function formatSweepResult(result: SweepResult): string {
  const lines: string[] = ["Parser warning sweep"];
  lines.push("");
  lines.push("Roots:");
  for (const root of result.roots) {
    const status = root.exists ? `${root.files} jsonl files` : "missing; skipped";
    lines.push(`- ${root.tool} ${root.path}: ${status}`);
  }

  lines.push("");
  lines.push("Warning counts by tool/severity/category:");
  if (result.counts.size === 0) {
    lines.push("- none");
  } else {
    for (const [key, count] of [...result.counts.entries()].sort()) {
      lines.push(`- ${key}: ${count}`);
    }
  }

  if (result.warnings.length > 0) {
    lines.push("");
    lines.push("Warnings:");
    for (const item of result.warnings.slice(0, 200)) {
      lines.push(
        `- ${item.tool} ${item.file}:${item.warning.lineOrdinal + 1} ` +
          `[${item.warning.severity}/${item.warning.category}] ${item.warning.reason}`,
      );
    }
    if (result.warnings.length > 200) {
      lines.push(`- ... ${result.warnings.length - 200} more warnings omitted`);
    }
  }

  lines.push("");
  lines.push(
    result.warnings.length === 0
      ? "Result: zero parser warnings"
      : `Result: ${result.warnings.length} parser warnings`,
  );
  return lines.join("\n");
}

export function parseArgs(argv: string[]): SweepRoot[] {
  const roots: SweepRoot[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--claude-root") {
      roots.push({ tool: "claude_code", path: readArgValue(argv, ++i, arg) });
    } else if (arg === "--codex-root") {
      roots.push({ tool: "codex", path: readArgValue(argv, ++i, arg) });
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return roots.length > 0 ? roots : DEFAULT_ROOTS;
}

function readArgValue(argv: string[], index: number, flag: string): string {
  const value = argv[index];
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires a path`);
  }
  return value;
}

function printHelp(): void {
  console.log(`Usage: bun scripts/parser-warning-sweep.ts [--claude-root PATH] [--codex-root PATH]

Walks Claude Code and Codex JSONL sessions, runs the frontend parsers, and
exits non-zero if any parser warning is emitted. Flags may be repeated.`);
}

function expandHome(path: string): string {
  if (path === "~") return homedir();
  if (path.startsWith("~/")) return join(homedir(), path.slice(2));
  return resolve(path);
}

async function listJsonlFiles(root: string): Promise<string[] | null> {
  try {
    const entries = await readdir(root, { withFileTypes: true });
    const nested = await Promise.all(
      entries.map(async (entry) => {
        const fullPath = join(root, entry.name);
        if (entry.isDirectory()) return listJsonlFiles(fullPath);
        return entry.isFile() && entry.name.endsWith(".jsonl") ? [fullPath] : [];
      }),
    );
    return nested.flatMap((files) => files ?? []).sort();
  } catch (error) {
    if (isMissingPathError(error)) return null;
    throw error;
  }
}

function isMissingPathError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}

function aggregateWarnings(warnings: SweepWarning[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of warnings) {
    const key = `${item.tool}/${item.warning.severity}/${item.warning.category}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const result = await runSweep(parseArgs(process.argv.slice(2)));
    console.log(formatSweepResult(result));
    if (result.warnings.length > 0) process.exitCode = 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 2;
  }
}
