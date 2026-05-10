// Synthetic 5k-message Claude Code JSONL fixture builder for the M4
// long-corpus measurement.
//
// Per m4-plan §13.1 + Q5: this builder is *generated at test runtime*
// — never checked-in — to keep the production bundle and the
// `apps/frontend/src/` audit tree free of test-fixture bytes (a 5k-
// message JSONL is ~1-3 MB).
//
// Determinism: a seeded linear-congruential PRNG (LCG with
// constants from Numerical Recipes, modulus 2^32) drives every
// random choice. Default seed `0x1234ABCD` produces byte-identical
// output across runs so the Playwright trace is reproducible.
//
// Schema: emits Claude Code-shaped NDJSON records. Each record
// matches the parser's expected shapes (see
// `apps/frontend/src/features/sessions/parsers/claude_code.ts`):
//   - `summary` records (small system-meta lines).
//   - `user` records with a `content` array carrying text +
//     occasional tool_use entries.
//   - `assistant` records with content arrays carrying text +
//     occasional tool_use entries.
//   - `tool_use` and `tool_result` content items inside the above.
//
// The builder produces 5,000 alternating user/assistant records
// with tool_use + tool_result interspersed roughly every 500 turns,
// plus boundary cues every ~1500 turns to exercise the chapter-
// break code path.
//
// Output: `{ tool: "claude_code", jsonl: string }` — pass
// `Buffer.from(jsonl)` to the e2e backend harness.

export type Tool5k = "claude_code";

export type Transcript5kFixture = {
  tool: Tool5k;
  jsonl: string;
  /** Number of records written. Matches `5000` for the default seed. */
  recordCount: number;
};

const DEFAULT_SEED = 0x1234abcd;
const DEFAULT_RECORD_COUNT = 5000;

/**
 * Build the synthetic 5k-message fixture.
 *
 * @param seed - LCG seed; default `0x1234ABCD`.
 * @param recordCount - Number of records to emit; default 5000.
 */
export function buildTranscript5k(
  seed = DEFAULT_SEED,
  recordCount = DEFAULT_RECORD_COUNT,
): Transcript5kFixture {
  const rng = makeLcg(seed);
  const lines: string[] = [];
  // Monotonically increasing timestamp, started at a fixed pinned
  // moment so the relative-time labels are deterministic.
  let nowMs = Date.parse("2026-04-25T08:00:00.000Z");

  for (let i = 0; i < recordCount; i += 1) {
    nowMs += 1000 + (rng() % 30) * 1000; // 1-30 seconds per turn
    const ts = new Date(nowMs).toISOString();

    if (i % 200 === 0 && i > 0) {
      // Inject a `summary` system record.
      lines.push(
        JSON.stringify({
          type: "summary",
          summary: `Summary block at turn ${i}`,
          timestamp: ts,
        }),
      );
      continue;
    }

    if (i % 1500 === 0 && i > 0) {
      // Boundary cue: emit a synthetic system-meta line that the
      // Claude Code parser falls back to as `unknown` (boundary
      // is Codex-only in M3a; Claude Code marks resumed sessions
      // through its own shape). Documenting here so the test
      // doesn't claim "boundary" coverage; the exercise is
      // unrelated to the boundary kind specifically.
      lines.push(
        JSON.stringify({
          type: "summary",
          summary: `--- session breakpoint at turn ${i} ---`,
          timestamp: ts,
        }),
      );
      continue;
    }

    const isUser = i % 2 === 0;
    const role = isUser ? "user" : "assistant";

    // Roughly every 500 turns inject a tool_use + tool_result pair
    // by appending tool blocks to the assistant content array.
    const includeTool = !isUser && i > 0 && i % 500 === 0;

    const textBody = pseudoLorem(rng, 80, 200);

    let content: Array<Record<string, unknown>>;
    if (includeTool) {
      content = [
        { type: "text", text: textBody },
        {
          type: "tool_use",
          id: `toolu_${i}`,
          name: i % 1000 === 0 ? "Bash" : "Read",
          input: { path: `/srv/perf/${i}.txt`, lines: 20 },
        },
      ];
    } else {
      content = [{ type: "text", text: textBody }];
    }

    lines.push(
      JSON.stringify({
        type: role,
        timestamp: ts,
        message: {
          role,
          content,
        },
      }),
    );

    // After an assistant tool_use, follow up with a user-side
    // tool_result on the next iteration.
    if (includeTool && i + 1 < recordCount) {
      i += 1;
      nowMs += 100;
      const tsResult = new Date(nowMs).toISOString();
      lines.push(
        JSON.stringify({
          type: "user",
          timestamp: tsResult,
          message: {
            role: "user",
            content: [
              {
                type: "tool_result",
                tool_use_id: `toolu_${i - 1}`,
                content: pseudoLorem(rng, 200, 600),
              },
            ],
          },
        }),
      );
    }
  }

  return {
    tool: "claude_code",
    jsonl: lines.join("\n") + "\n",
    recordCount: lines.length,
  };
}

/**
 * Linear congruential generator (Numerical Recipes constants).
 * Seedable, deterministic, returns 32-bit unsigned integers.
 */
function makeLcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state;
  };
}

const LOREM_WORDS = [
  "the",
  "quick",
  "brown",
  "fox",
  "jumps",
  "over",
  "lazy",
  "dog",
  "session",
  "transcript",
  "parser",
  "render",
  "scroll",
  "performance",
  "frame",
  "budget",
  "measure",
  "fixture",
  "synthetic",
  "deterministic",
];

function pseudoLorem(
  rng: () => number,
  minChars: number,
  maxChars: number,
): string {
  const target = minChars + (rng() % (maxChars - minChars + 1));
  const parts: string[] = [];
  let total = 0;
  while (total < target) {
    const word = LOREM_WORDS[rng() % LOREM_WORDS.length];
    parts.push(word);
    total += word.length + 1;
  }
  return parts.join(" ");
}
