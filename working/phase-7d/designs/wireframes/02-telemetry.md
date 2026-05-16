# Wireframe 02 — `telemetry` category

Covers: `event_msg.token_count`.

Source fixture:

```json
{"type":"event_msg","payload":{"type":"token_count","input_tokens":10,"output_tokens":5}}
```

Rendered hairline:

```
        ·  TOKENS  :  10↓ 5↑
```

`↓` (U+2193) on input tokens. `↑` (U+2191) on output tokens. Both
glyphs are decorative — the screen-reader label is the verbal form
("Metadata: 10 input tokens, 5 output tokens").

## With cached input tokens

If the payload carries `cached_input_tokens`, the cached count
appends with `≈` (U+2248):

```
        ·  TOKENS  :  127↓ 245↑ 88≈
```

aria-label: `"Metadata: 127 input tokens, 245 output tokens, 88
cached"`.

## With reasoning_tokens

Some Codex versions emit `reasoning_tokens`; the formula appends
`†` (U+2020 dagger) for these:

```
        ·  TOKENS  :  127↓ 245↑ 88≈ 12†
```

The display formula in `renderHints.ts` is:

```ts
function telemetryDisplay(p: TokenCountPayload): string {
  const parts = [`${p.input_tokens}↓ ${p.output_tokens}↑`];
  if (p.cached_input_tokens) parts.push(`${p.cached_input_tokens}≈`);
  if (p.reasoning_tokens) parts.push(`${p.reasoning_tokens}†`);
  return parts.join(" ");
}
```

All number values are mono-font — `--font-mono` — so the digits
visually align if multiple token-count rows render adjacently (which
they often do; see cluster wireframe 09).
