# Wireframe 03 — `title` category

Covers: `ai-title`, `custom-title`.

## ai-title

Source fixture:

```json
{"type":"ai-title","title":"Investigate parser matrix"}
```

Rendered hairline:

```
        ·  AUTO TITLE  :  "Investigate parser matrix"
```

The title text is rendered in `--font-display` italic. Curly quotes
(U+201C / U+201D) wrap the value to mark it as quoted text in the
marginalia register.

aria-label: `"Metadata: auto title — Investigate parser matrix"`

## custom-title

Source fixture:

```json
{"type":"custom-title","customTitle":"phase-7a-event-support"}
```

Rendered hairline:

```
        ·  CUSTOM TITLE  :  "phase-7a-event-support"
```

Same recipe; "custom" instead of "auto" in the label distinguishes
human-assigned vs. AI-generated titles.

aria-label: `"Metadata: custom title — phase-7a-event-support"`

## Truncation

A title longer than 78 chars truncates with U+2026:

```
        ·  AUTO TITLE  :  "Investigate the parser matrix and identify the silenced events that need …"
```

Full title is recoverable via the hover tooltip (`title` attribute
on the `<p>`).
