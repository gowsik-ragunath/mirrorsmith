# QA reference

The pixel diff gate. Run it repeatedly during the build, not once at the end.

## Run

```bash
node scripts/diff.mjs \
  --source-dir docs/clone/source \
  --clone-url http://localhost:3000 \
  [--out docs/clone/diff] [--widths 1440,768,390] [--threshold 1.0]
```

The dev server must be running in background. Requires the Playwright Chromium
browser (`npx playwright install chromium`).

## What it does

1. Screenshots the clone at 1440 / 768 / 390 (same widths as the source capture;
   uniform widths keep `--widths` aligned).
2. Per width: full-page pixel mismatch with `pixelmatch`, plus per-section mismatch
   from horizontal band crops using the section boxes measured at each width.
3. Writes `report.md` and `report.json` in `--out` (full notes: per width, per
   section). Rows have a red overlay under `overlays/` where pixels differ.
4. Exits non-zero if any kept section is above `--threshold` (default **1.0%**).

## Gate

- Every kept section ≤ 1.0% at **every** width. One soft spot fails the gate.
- Full-page mismatch also reported per width; use it for the final summary.
- Dropped sections (`"keep": false`) don't go into the gate.
- If the clone's own section detection finds a different count than the source (the
  report flags it), fall back to the full-page numbers and count them for now —
  fix detection/section ordering before trusting per-section numbers.

## Finding the cause

Open `overlays/section-<i>-<W>.png` from the diff output. Red pixels cluster round
the cause:

- One component off — check it against the spec (often font size, padding, gap).
- Whole band off vertically → section height mismatch; the clone's content is a
  different size (or missing an image), not a styling problem.
- Mild scattered red on dense text bands — usually font metric differences; check
  the `font-family` actually resolves (load the fonts in the template, none silently
  missing).

Common single-variable fixes, in order of probability: font size/family, padding,
gap, image dimensions, text length (input text wrong), section background.

## Loop discipline

- Each failing round: fix the top mismatch cause, then re-run the full diff (dev
  server with hot reload, so the re-run is a fresh capture).
- Stop and report after three re-rounds without pass — list per-section numbers,
  overlays and most probable cause. Do not keep thrashing.
- After a pass: log the final numbers per width into `docs/clone/STATUS.md`.

## Final checks before reporting done

1. `npm run build` passes clean.
2. `reports.md` logged in `docs/clone/STATUS.md`.
3. No placeholder text survives.
4. Interactives were checked statically (hover/click code reviewed against the
   spec, listed under a note "verified in code, not by diff").
