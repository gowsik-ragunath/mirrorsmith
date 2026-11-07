# Section selection reference

The section checkpoint always runs, on every clone, before any spec or build.

## Presenting

After the capture, walk `docs/clone/source/sections.json` top-to-bottom and present
each entry:

- **Name** — your working name for it ("Hero", "Feature grid", "Pricing", "Footer")
- **One-line description** — what it contains (from heading + text sample)
- **Crop path** — the crop image under `docs/clone/source/section-crops/`

Group repeated shapes ("three identical testimonial cards — one section, one
component") so the list stays short.

Then ask the user one batched question (use the ask tool when available, otherwise a
plain question in chat) with options per section: **keep**, **drop**, or **rewrite
with new text**. Text overrides: if a kept section should display user-provided
copy instead of the source's text, collect it now (ask precisely what to replace).

## Confirming

Before building, confirm the exact list:

> Not building: <dropped sections>. Building: <kept sections>, with <n> text
> overrides. Proceed?

A "yes" locks it; record both lists in `docs/clone/STATUS.md`.

## Recording / pruning

1. `docs/clone/STATUS.md` gains a `## Sections` block with kept / dropped / text
   overrides. This survives session restarts and re-diffs.
2. Set `"keep": false` on dropped entries in `docs/clone/source/sections.json` —
   `scripts/diff.mjs` skips them, so the mismatch numbers only cover kept sections.

## Notes

- Don't list the site's `<head>` elements, nav bars, or the page as a whole as
  sections — only content bands.
- If a section is a carousel with auto-advance, capture its non-default states too
  (documented in `extraction.md`) and let the user pick the default state to clone;
  the clone renders one static state.
- If the user wants a section the source doesn't have, say that this is out of
  scope for the clone run; a section can be marked "rewrite" only with new text,
  not new content types.
