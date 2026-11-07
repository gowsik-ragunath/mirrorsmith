# Extraction reference

Two inputs feed a clone, in priority order: the **fetched source** (HTML + linked
CSS, the build blueprint) and the **capture** (screenshots, sections, measurements —
QA basis and fallback spec). Use this whenever taking input or needing a value
neither file answers.

## Reading the fetched source (preferred)

```bash
node scripts/fetch-source.mjs --url <URL> --out docs/clone/source/site
```

Produces `site/index.html`, `site/css/*.css` (linked stylesheets), and
`site/manifest.json` (sizes, truncation state). When the run summary ends with
`READABLE`, this is the build blueprint — no measuring needed:

- Grep per section, e.g. find the section range in `index.html`
  (`grep -n "id=\"features\"" index.html`) and `sed -n '<start>,<end>p'` that band
  only. Find its rules in the CSS files (`grep -n "\.feature-card" css/*.css`).
- CSS custom properties and variables travel as-is; if the site defines tokens
  (`:root { --brand: ... }`), port them into `globals.css` first.
- Never paste whole files into context; per-section strips stay small.
- If the summary says `PARTIAL` or `TRUNCATED`, re-run with `--max-bytes` raised,
  fall back to the capture measurements below. Never build from a half-read.

## Capture (screenshots for QA, sections, assets, fallback measurements)

```bash
node scripts/capture.mjs --url <URL> --out docs/clone/source [--widths 1440,768,390] [--wait 1500]
```

```bash
node scripts/capture.mjs --url <URL> --out docs/clone/source [--widths 1440,768,390] [--wait 1500]
```

Requires the Playwright Chromium browser (`npx playwright install chromium` once).
Works with live URLs and local servers (serve `template/` HTML with
`python3 -m http.server` first; Playwright cannot fetch remote CDN assets from
`file://` pages).

## Output files

| File | Contents |
| --- | --- |
| `shots/page-<W>.png` | Full-page screenshot at width W |
| `measurements-<W>.json` | Element tree: tag, box, computed styles, text, images |
| `sections.json` | Detected sections with `domTop`, `height`, `bg`, heading, text sample, plus crop paths from the primary width |
| `section-crops/section-<i>.png` | Crop of each section from the primary width's full-page shot |
| `assets.json` | Every referenced image, video, poster and webfont URL |

Default widths: 1440 (desktop), 768 (tablet), 390 (mobile). Element measurement
runs at 1440 and 390; keep those two JSONs as the base for specs.

## Sections detection

Sections are page-level bands detected from candidate elements (`section`, `header`,
`footer`, `article`, top-level blocks) that are ≥160px tall, top-level (no candidate
ancestor), sorted by `domTop`. Detection is a best effort check — after running the
capture:

1. **View the crop images.** Count and boundaries must match what you see.
2. A sticky hero can capture page-level siblings as separate sections; merge or
   split by editing `sections.json` (`domTop`/`height` fields) before building.
3. Sections the user drops get `"keep": false`; the diff skips them.

Measurements are taken after the load settle wait (default 1500ms). If the page has
lazy images or delayed reveals, re-run with `--wait 4000` before trusting boxes.

## Reading measurements-<W>.json

```json
{
  "tag": "section", "cls": [], "box": { "x": 0, "y": 0, "width": 1440, "height": 720 },
  "text": null,
  "styles": { "fontSize": "48px", "fontWeight": "700", "color": "rgb(23, 23, 23)", "gap": "32px", ... },
  "img": null, "children": [ ... ]
}
```

- `styles` only lists non-default computed values. All colors are computed (`rgb()`),
  fonts include family/weight/size/line-height/letter-spacing.
- Use these measurements when the fetched source is unreadable, or for values a
  stylesheet can't give you (runtime inline styles, layout after resize).
- Spec values must come from here or the fetched source, never estimated.
- For SVG `<text>` nodes read the values from the SVG node's entry, not a wrapping `<p>`.

## Getting a missing value

Run a targeted capture via a one-off Node script:

```js
import { chromium } from "playwright";
const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto("<URL>", { waitUntil: "networkidle" });
await page.waitForTimeout(1000);
const v = await page.evaluate(() => {
  const el = document.querySelector("<SELECTOR>");                    // your selector
  const cs = getComputedStyle(el);
  return Object.fromEntries(["fontSize","fontWeight","lineHeight","letterSpacing","color","backgroundColor","padding","gap","borderRadius","boxShadow","transition","animation"].map(p => [p, cs[p]]));
});
console.log(JSON.stringify(v, null, 2));
await b.close();
```

For state-dependent values (hover, scrolled, active tab), navigate/click/hover in
the same script before collecting the second snapshot, and record both plus the
transition in the spec.

## Assets

Every section that renders a photo, logo, background image, video or webfont fetches
it from the source, converted to a local copy:

```bash
node scripts/download-assets.mjs --input docs/clone/source/assets.json --out public/assets
```

Resumable: already-downloaded files are skipped. The written
`public/assets/manifest.json` maps original URL → local path; specs reference local
paths only. Large images (>1MB) belong as `.webp` where quality allows; don't bloat
`public/`.

## Fonts

The capture lists `font-family` values actually in use. Next.js template loads the
closest Google Fonts in `src/app/layout.tsx` via `next/font/google`; self-hosted
fonts land in `public/assets/fonts/` through the asset downloader.
