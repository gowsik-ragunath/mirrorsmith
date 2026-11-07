---
name: mirrorsmith
description: Pixel-accurate static website cloner. Use when the user gives a URL (or template HTML files) and asks to clone, replicate, mirror, rebuild, or reverse-engineer it into a static Next.js site. Builds from the page's own readable source when available, and from Playwright measurements otherwise. Not for design reviews, redesigns, or interactive backends.
---

# mirrorsmith — pixel-accurate static cloner

Two ground truths, in priority order:

1. **Readable page source wins.** When the site serves readable HTML and CSS, fetch
   it and build directly from it — it is the cheapest, most exact spec. Port it into
   Next.js components; no detour through screenshots for facts the code states.
2. **Measurements cover the rest.** If the source is obfuscated, an SPA bundle, or
   otherwise unreadable, fall back to Playwright measurement capture (computed
   styles, boxes, fonts).

Either way the clone is pixel-diffed against screenshots of the source; every kept
section must pass at ≤1% mismatch. Downloaded visual assets (photos, logos, videos,
webfonts) are always fetched from the source, never recreated.

## Source resolution (do this first)

1. URL given → validate it, then use it.
2. No URL → look for `template/` containing HTML files in the working directory.
   Serve locally in background (`python3 -m http.server 8787 --bind 127.0.0.1`) and
   use `http://127.0.0.1:8787/<file>.html` as the URL.
3. Neither → reply exactly this and stop:

> I need a source to clone. Please provide either:
> 1. **A website URL** — e.g. `clone https://example.com`, or
> 2. **An HTML file** — place it inside `template/` in the working directory, then re-run.

Never clone from memory. Never guess a URL the user did not give.

## Before starting (both must pass)

1. **Rights check:** confirm the user holds the rights to clone the source. One
   question is enough; if they decline or the source is clearly a paid template they
   don't own, stop.
2. **Project exists:** the working directory must be a mirrorsmith project (it has
   `scripts/fetch-source.mjs`). If not, ask the user to run `npx mirrorsmith init .`
   — do not scaffold manually.

## Workflow

### 1. Intake — get both the blueprint and the QA basis

```bash
node scripts/fetch-source.mjs --url <SOURCE_URL>   # readable HTML + linked CSS (blueprint)
node scripts/capture.mjs --url <SOURCE_URL> --out docs/clone/source
```

`fetch-source` saves `index.html` + linked stylesheets under
`docs/clone/source/site/`. **Build from these when the output says READABLE.**
`capture` saves full-page screenshots at 1440/768/390, detected sections with crop
images, and an asset manifest — screenshots and assets are needed for QA and
diffing regardless of how you build; the element-measurement JSONs are the fallback
spec when the site was not readable. For `template/` HTML sources, serve locally
(`python3 -m http.server 8787 --bind 127.0.0.1`) and use
`http://127.0.0.1:8787/<file>.html` for both scripts. Use `grep`/`sed` on the
fetched HTML/CSS per section — never load the whole file into context at once.
Details: read `references/extraction.md` when taking input.

### 2. Section selection (always runs)

Present the detected sections top-to-bottom (name, one-line description, crop
image). Ask the user which to **keep**, **drop**, or **re-write with new content**.
Before building, confirm: the dropped list will not appear in the clone. Record the
answers in `docs/clone/STATUS.md` (kept / dropped / text overrides). Prune
`docs/clone/source/sections.json` to mark dropped sections `"keep": false` — the
diff skips them. Details: read `references/sections.md` when asking.

### 3. Spec per kept section

One short markdown spec per section in `docs/clone/specs/`, written from the best
available truth:
- Source readable? → the section's own HTML markup plus its CSS rules (grep the
  files in `docs/clone/source/site/`). That is the spec.
- Source unreadable, or a value can't be found in it (computed/runtime styles)? →
  the section's entries in `docs/clone/source/measurements-*.json`, crops, and
  screenshots. Re-run capture with `--wait` raised if values look half-loaded.
Never estimate; when you can't find a value, re-extract.

### 4. Build

Port the section specs into a fresh component per section (`src/components/`), using
Tailwind for what maps cleanly and plain CSS for the rest (exact values from the
spec). Keep the source's structure (headings, lists, alt text) — that is fidelity,
not copying. Register each component in `src/content.ts` (`sections` array,
top-to-bottom). Enter text verbatim; apply the user's text overrides. Run:
`npm run dev` in background so the user can watch progress at http://localhost:3000.

### 5. Diff gate

```bash
node scripts/diff.mjs --source-dir docs/clone/source --clone-url http://localhost:3000
```

Per-section and per-width pixel mismatch. **Every kept section must be ≤ 1.0%
mismatch** (`--threshold` to change). Over-threshold: compare the diff overlays in
`docs/clone/diff/`, fix, re-diff. Iterate until pass or 3 failed rounds — then stop
and report, don't thrash. Details: read `references/qa.md` when diffing.

### 6. Polish pass (subtle, opt-in)

Only after the diff passes, if the user asked for polish (or said "subtle motion"),
add light motion **that settles into the exact layout the diff verified**: 300ms
ease-out entrances (opacity + 12px lift, slight blur), 100ms stagger, 0.96 press
scale, hover styles behind `@media (hover: hover)`, everything gated behind
`prefers-reduced-motion` with an opacity cross-fade fallback. Never animate away
from the verified static layout. Exact values: read `references/motion.md` — do not
improvise motion values.

### 7. Final gates

- `npm run build` passes clean.
- No placeholder text survives ("lorem", "TODO", the source site's name in body
  copy unless the user kept it).
- Delete intermediate artifacts (diff overlays are fine to keep under
  `docs/clone/`). Report: sections kept/dropped, final mismatch numbers per width,
  build status, what to check visually.

## Hard rules

- Read the source before measuring it: readable HTML/CSS is the spec; measurements
  are only for what the source can't tell you.
- Targeted reads only: grep/sed the fetched HTML/CSS per section; never load whole
  files or JS bundles into context.
- Never put the source's inline `<script>` code into the build; clone visible
  behavior, port state-flows as plain React where the source requires them.
- Every CSS value in a spec comes from the fetched source or the capture — never
  estimated.
- If the fetched source is truncated (`fetch-source` says PARTIAL), raise
  `--max-bytes` or use the capture path; don't build from a half-read.
- One spec + one component per section; build sections in parallel when it helps.
- `npm run build` must pass before you report done.
- `docs/clone/STATUS.md` is the run's record: source, decisions, status per phase,
  final numbers. Write it as you go and finish it at the end.

## Reference loading map

| When | Read |
| --- | --- |
| Taking input (fetch source / capture / re-extract) | `references/extraction.md` |
| Asking about sections | `references/sections.md` |
| Adding polish motion | `references/motion.md` |
| Running / interpreting diff | `references/qa.md` |
