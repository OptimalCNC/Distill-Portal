# Wireframe 01 — `control` category

Covers: `permission-mode`, `queue-operation`.

## permission-mode

Source fixture:

```json
{"type":"permission-mode","permissionMode":"default"}
```

Rendered hairline:

```
        ·  PERMISSION MODE  →  default
```

Spans:

```
.meta-prefix  .meta-label              .meta-sep  .meta-value
   ↓            ↓                         ↓         ↓
   ·          PERMISSION MODE             →         default
            (font-chrome, uppercase,                (font-mono)
             letter-spaced)
```

`title` attribute (tooltip on hover) carries `Message.raw`:
`{"type":"permission-mode","permissionMode":"default"}`.

aria-label: `"Metadata: permission mode set to default"`

## queue-operation (with prompt)

Source fixture:

```json
{"type":"queue-operation","operation":"enqueue","prompt":"Review the matrix."}
```

Rendered hairline:

```
        ·  QUEUE  →  enqueue : "Review the matrix."
```

The optional prompt is appended in `--font-display` italic after a
colon. Truncated at 78 chars with U+2026 `…` if longer.

aria-label: `"Metadata: queue enqueue with prompt 'Review the matrix.'"`

## queue-operation (no prompt)

```json
{"type":"queue-operation","operation":"dequeue"}
```

Rendered:

```
        ·  QUEUE  →  dequeue
```
