# Wireframe 04 — `attachment` category

Covers: `attachment`, `file-history-snapshot`.

## attachment

Source fixture:

```json
{"type":"attachment","fileName":"notes.txt","mimeType":"text/plain"}
```

Rendered hairline:

```
        ·  ATTACHMENT  →  notes.txt (text/plain)
```

aria-label: `"Metadata: attachment notes.txt, mime type text/plain"`

## file-history-snapshot

Source fixture:

```json
{"type":"file-history-snapshot","files":[{"path":"README.md","status":"modified"}]}
```

Rendered hairline (1 file):

```
        ·  FILE SNAPSHOT  →  1 file: README.md
```

## file-history-snapshot (multiple files)

```json
{"type":"file-history-snapshot","files":[
  {"path":"README.md","status":"modified"},
  {"path":"docs/dev-commands.md","status":"modified"},
  {"path":"src/api.ts","status":"deleted"}
]}
```

Rendered:

```
        ·  FILE SNAPSHOT  →  3 files: README.md, docs/dev-commands.md, …
```

The display formula caps the path list at 2 paths + a U+2026 `…`
when more files are present. Status fields are dropped from the
inline display — they're noisy at the marginalia register. The
hover tooltip carries the full raw JSON for inspection.

aria-label: `"Metadata: file snapshot of 3 files, including
README.md and docs/dev-commands.md"`

## Multiple attachments → cluster

Two or more consecutive `attachment` events collapse into a
metadata cluster (`METADATA_COLLAPSE_THRESHOLD = 2`; see wireframe
07). A 3-attachment paste reads `· 3 metadata events ▸`; a typical
2-attachment paste reads `· 2 metadata events ▸`. Expanding shows
the individual rows.
