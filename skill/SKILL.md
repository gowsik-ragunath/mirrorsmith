---
name: mirrorsmith
description: Visually-accurate static website cloner. Use when the user gives a URL (or template HTML files) and asks to clone, replicate, mirror, rebuild, or reverse-engineer it into a static Next.js site. Builds from the page's own readable source when available, and from Playwright measurements otherwise — a fluid responsive site verified visually at multiple widths, not a pixel-threshold gate. Not for design reviews, redesigns, or interactive backends.
---

# mirrorsmith — visually-accurate static cloner

Two ground truths, in priority order:

1. **Readable page source wins.** When the site serves readable HTML and CSS, fetch
   it and build directly from it — it is the cheapest, most exact spec. Port it into
   Next.js components; no detour through screenshots for facts the code states.
2. **Measurements cover the rest.** If the source is obfuscated, an SPA bundle, or
   otherwise unreadable, fall back to Playwright measurement capture (computed
   styles, boxes, fonts) at every capture width.

The clone is a **responsive site that looks like the source at 1440 / 1000 /
768 / 390**. Identity is verified visually (side-by-side shots), never by a
pixel-threshold number. Downloaded visual assets (photos, logos, videos) are
always fetched from the source; webfonts load via `next/font/google` unless
the family isn't on a marketplace (then downloaded, see Fonts).

## Source resolution (do this first)

1. URL given → validate it, then use it.
2. No URL → look for a local directory containing HTML files (e.g. files the user
   named); serve locally in background (`python3 -m http.server 8787 --bind
   127.0.0.1`) and use `http://127.0.0.1:8787/<file>.html` as the URL.
3. Neither → reply exactly this and stop:

> I need a source to clone. Please provide either:
> 1. **A website URL** — e.g. `clone https://example.com`, or
> 2. **An HTML file** — place it in the working directory, then re-run.

Never clone from memory. Never guess a URL the user did not give.

## Before starting (both must pass)

1. **Rights check:** confirm the user holds the rights to clone the source. One
   question is enough; if they decline or the source is clearly a paid template they
   don't own, stop.
2. **Project setup:** if the working directory is already a mirrorsmith
   project (has `scripts/fetch-source.mjs`), use it as-is. Otherwise create
   the Next.js app yourself, then set up the scripts:

   ```bash
   npx create-next-app@latest <name> --ts --tailwind --eslint --app \
     --src-dir --import-alias "@/*" --use-npm --yes
   cd <name>
   npm i -D playwright pngjs
   npx playwright install chromium      # skip when a cached version exists
   cp <skill-dir>/scripts/*.mjs scripts/     # the toolkit scripts
   ```

   `<skill-dir>` is where `npx mirrorsmith install-skill` placed the skill.
   Never scaffold over existing files.

## Workflow

### 1. Intake — facts + screenshots, then fix the section map

```bash
node scripts/fetch-source.mjs --url <SOURCE_URL>   # readable HTML + linked CSS (blueprint)
node scripts/capture.mjs --url <SOURCE_URL> --out docs/clone/source
```

`capture` writes full-page screenshots at 1440/1000/768/390 (scroll-settled
so animations/reveals are complete), detected sections with crop images, and
an asset manifest. **Check `sections.json` against the screenshots** — on
builder SPAs the detector can collapse the whole page into one giant band:
hand-split it into real bands using the screenshots + measured boxes, then
re-run capture. Use `grep`/`sed` on the fetched HTML/CSS per region — never
load whole files into context. Details: `references/extraction.md`.

### 2. Base globals first (before any user questions)

Lay the foundation for the whole site:

- `layout.tsx`: fonts via `next/font/google` for the captured families
  (weights/sizes the capture shows); self-host only families Google doesn't carry.
- `globals.css`: tokens from the capture — palette (body + section
  backgrounds, text colors), type scale, container caps, section paddings,
  gaps, radii, breakpoints from the source's own `@media(`
- Base rules: body bg/text, heading defaults, container class, section-band
  pattern, breakpoints wired in.

Record the tokens in `docs/clone/STATUS.md`. Feature work and sections come
after the foundation, so later decisions never rewrite the base.

### 3. Section selection (always runs)

Present the detected sections top-to-bottom (name, one-line description, crop
image). Ask the user which to **keep**, **drop**, or **re-write with new content**.
Before building, confirm: the dropped list will not appear in the clone. Record the
answers in `docs/clone/STATUS.md` (kept / dropped / text overrides). Prune
`docs/clone/source/sections.json` to mark dropped sections `"keep": false` —
the QA skips them. Details: read `references/sections.md` when asking.

### 4. Spec per kept section

One short markdown spec per section in `docs/clone/specs/`, written from the best
available truth:
- Source readable? → the section's own HTML markup plus its CSS rules (grep the
  files in `docs/clone/source/site/`). That is the spec.
- Source unreadable, or a value can't be found in it (computed/runtime styles)? →
  the section's entries in `docs/clone/source/measurements-*.json`, crops, and
  screenshots. Re-run capture with `--wait` raised if values look half-loaded.
Never estimate; when you can't find a value, re-extract.

### 5. Build — responsive, against the capture

Port the section specs into a fresh component per section (`src/components/`), using
Tailwind for what maps cleanly and plain CSS from the identity tokens for the rest
(exact values from the spec). Keep the source's structure (headings, lists, alt
text) — that is fidelity, not copying. Register each component in `src/content.ts`
(`sections` array, top-to-bottom). Enter text verbatim; apply the user's text
overrides. Images: explicit width/height from the measured boxes (attribute-level
defaults must not reflow your layout — Tailwind preflight resets would). Run
`npm run dev` in background; the user watches at http://localhost:3000.

### 6. Visual verify (no pixel gate)

Screenshot the clone at the same widths and **compare side-by-side against the
source shots at every width** (1440 / 1000 / 768 / 390): per-section crops for
close-ups, full shots for rhythm and reflow. The bar is *looks like the
source, responsive at all widths* — not a mismatch percentage. Fix visually
wrong things (missing band, broken grid, wrong image, font fallback, broken
mobile layout) and re-shoot; `docs/clone/diff/` overlays (pixel differences)
are an optional magnifier, run without a threshold when useful. Two fix
rounds maximum per root cause, then stop and report. Details:
`references/qa.md`.

### 7. Report (no production build in the flow)

- Report: sections kept/dropped, what to check visually per width, font
  sources, and the state of any deferred work. `npm run build` runs only when
  the user asks.
- No placeholder text survives ("lorem", "TODO", source branding unless kept).
- `docs/clone/STATUS.md` is the run's record: source, decisions, status per
  phase. Write it as you go.

## Hard rules

- Read the source before measuring it: readable HTML/CSS is the fact sheet;
  measurements are only for what the source can't tell you.
- Responsive at all capture widths is not optional — no fixed-width blocks,
  no overflow, mobile verified at 390.
- Targeted reads only: grep/sed the fetched HTML/CSS per section; never load
  whole files or JS bundles into context.
- Never put the source's inline `<script>` code into the build; clone visible
  behavior, port state-flows as plain React where the source requires them.
- Every CSS value in a spec comes from the fetched source or the capture —
  never estimated.
- If the fetched source is truncated (`fetch-source` says PARTIAL), raise
  `--max-bytes` or use the capture path; don't build from a half-read.
- One spec + one component per section; build sections in parallel when it helps.
- `docs/clone/STATUS.md` is the run's record: source, decisions, status per
  phase. Write it as you go and finish it at the end.

## Reference loading map

| When | Read |
| --- | --- |
| Taking input (fetch source / capture / re-extract / fix sections) | `references/extraction.md` |
| Asking about sections | `references/sections.md` |
| Adding polish motion | `references/motion.md` |
| Visual verification + diffs | `references/qa.md` |
