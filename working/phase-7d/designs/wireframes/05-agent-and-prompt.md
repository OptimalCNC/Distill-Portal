# Wireframe 05 — `agent` and `prompt` categories

## agent-name

Source fixture:

```json
{"type":"agent-name","name":"phase-agent"}
```

Rendered hairline:

```
        ·  AGENT  →  phase-agent
```

Value rendered in `--font-mono` — agent names are machine-named
identifiers in the corpus.

aria-label: `"Metadata: agent name phase-agent"`

## last-prompt

Source fixture:

```json
{"type":"last-prompt","prompt":"Deliver phase 7a."}
```

Rendered hairline:

```
        ·  LAST PROMPT  :  "Deliver phase 7a."
```

Value rendered in `--font-display` italic with curly quotes —
prompts ARE editorial text, not machine identifiers. The display
register matches the `title` category.

aria-label: `"Metadata: last prompt — Deliver phase 7a."`

## Truncation rule (shared)

For prompts longer than 78 chars:

```
        ·  LAST PROMPT  :  "Deliver phase 7a so we can close the parser-event-support matrix and unblock 7b …"
```
