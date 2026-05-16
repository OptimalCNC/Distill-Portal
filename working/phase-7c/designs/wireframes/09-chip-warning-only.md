# Wireframe 09 — Inline warning — warning-only (no chip on the message)

Spec ref: working/phase-7c.md §Data Model — `InlineWarning.classification === "warning-only"`.

The message card renders WITHOUT any inline chip. The warning is still
discoverable on the session banner at the top of the transcript, but
it does not attach to the affected message's visual surface.

```
+---------------------------------------------------------------+
| {N} parse warnings — click to view.                           |  <- session banner (unchanged)
|---------------------------------------------------------------|
|  ...expanded list of every warning, regardless of bucket...   |
|                                                               |
|  bucket breakdown:                                            |
|    2 render-normally · 1 collapse-by-default ·                |
|    1 hide-with-inspect · 1 warning-only                       |
+---------------------------------------------------------------+

  ...later in the transcript:

+---------------------------------------------------------------+
| ASSISTANT · just now                                          |  <- the message that "carries"
|---------------------------------------------------------------|     the warning-only entry
| All looks good — ready to commit.                             |     renders cleanly, no chip.
+---------------------------------------------------------------+

  (no .chip-wrapper, no inspect-link, no marginalia.)
```

## Why this bucket exists

Some warnings are about session-level meta (e.g. "matrix row in
unfamiliar state"); they don't attach to a particular visible
message and would be visual noise if surfaced inline. Routing
them to `warning-only` keeps the banner authoritative without
cluttering the reading surface.

## Banner invariant

Per Resolved Decision #6: "Banner stays loud. No removal, no
demotion. Inline chips are additive." Every warning in the session
appears in the banner list regardless of which bucket the
classification routes it to. The banner's bucket breakdown row
(new in 7c) summarizes the distribution so the inspector can see
at a glance how many warnings are discoverable inline vs banner-only.
