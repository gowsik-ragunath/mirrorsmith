# QA reference (visual verification, no pixel gate)

The bar is: the clone looks like the source at every capture width
(1440 / 1000 / 768 / 390). There is no pixel-mismatch threshold — a percent
number is not the verification, the side-by-side inspection is. Pixel
overlays (`node scripts/diff.mjs ...` without `--threshold` enforcement in
the loop; run `--threshold 100` if you just want the overlay PNGs) are an
optional magnifier to locate a difference quickly — never a pass/fail.

## Run (Step 6/8)

Screenshot the clone at the same widths the source was captured at:

```bash
node scripts/capture.mjs --url http://localhost:3000 --out docs/clone/self-check
```

(dev runs headless contexts of its own; the user's preview window is
untouched.)

Then verify side-by-side, two layers:

1. **Full shots** at 1440 first: top-to-bottom, source next to clone. Then
   1000 / 768 reflow, then 390 mobile — the responsive dimension is part of
   the verdict at every width.
2. **Per-region crops** (`source/section-crops/section-<i>.png` next to the
   clone's same band) for any region you're unsure about.

What "wrong" means (visual, in order of frequency):

1. Missing or extra section/band
2. Broken grid/flex (zero width, everything one column)
3. Overflow / horizontal scrolling at any width
4. Wrong image, wrong/wide aspect, blurry low-res
5. Obvious font fallback (serif/sans ratio off, widths differ)
6. Colors/backgrounds inverted or missing (dark hero renders white)
7. Mobile menu broken, tap targets off at 390

Fix round: change code → re-shoot → re-check. Max two fix rounds per root
cause — log leftovers in STATUS.md. The per-region verdict *is* the record
(kept in STATUS), not a pixel number.
