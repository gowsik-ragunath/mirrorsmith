#!/usr/bin/env node
// Pixel-diff a clone against its captured source, per section per width.
// Usage: node scripts/diff.mjs --source-dir docs/clone/source --clone-url http://localhost:3000 [--out docs/clone/diff] [--widths 1440,768,390] [--threshold 1.0]
import fs from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";
import pixelmatchImport from "pixelmatch";
import { launchBrowser, measurePage, openPage, scalePng } from "./lib.mjs";

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const sourceDir = path.resolve(arg("source-dir") ?? "docs/clone/source");
const cloneUrl = arg("clone-url");
if (!cloneUrl || !fs.existsSync(sourceDir)) {
  console.error(
    "Usage: node scripts/diff.mjs --source-dir <capture dir> --clone-url <URL> [--out docs/clone/diff] [--widths 1440,768,390] [--threshold 1.0]"
  );
  process.exit(1);
}
const out = path.resolve(arg("out") ?? "docs/clone/diff");
const threshold = parseFloat(arg("threshold") ?? "1.0");
const widths = arg("widths")
  ? arg("widths").split(",").map((n) => parseInt(n, 10))
  : fs
      .readdirSync(sourceDir)
      .map((f) => /^measurements-(\d+)\.json$/.exec(f))
      .filter(Boolean)
      .map((m) => parseInt(m[1], 10))
      .sort((a, b) => b - a);

const pixelmatch = pixelmatchImport.default ?? pixelmatchImport;
const mismatchCount = (a, b, d, w, h) => {
  const res = pixelmatch(a, b, d, w, h, { threshold: 0.1, includeAA: false });
  return typeof res === "number" ? res : (res?.mismatch ?? res?.count ?? 0);
};
const num = (x) => Math.round(x * 100) / 100;

// Crop a full-width horizontal band from an in-memory PNG and write it out.
function writeBand(png, y, height, outPath) {
  const top = Math.max(0, Math.round(y));
  const h = Math.max(0, Math.min(Math.round(height), png.height - top));
  if (h === 0) throw new Error(`empty band at y=${top} on a ${png.height}px image`);
  const band = new PNG({ width: png.width, height: h });
  PNG.bitblt(png, band, 0, top, png.width, h, 0, 0);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, PNG.sync.write(band));
  return band;
}

if (!widths.length) {
  console.error(`No measurements-*.json found in ${sourceDir}. Run capture.mjs first.`);
  process.exit(1);
}

// 1. Capture the clone at the same widths.
const cloneShots = path.join(out, "clone-shots");
const overlays = path.join(out, "overlays");
fs.mkdirSync(cloneShots, { recursive: true });
fs.mkdirSync(overlays, { recursive: true });

const browser = await launchBrowser();
const cloneMeasures = {};
try {
  for (const width of widths) {
    const { context, page } = await openPage(browser, { url: cloneUrl, width });
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(cloneShots, `page-${width}.png`), fullPage: true });
    cloneMeasures[width] = await measurePage(page);
    await context.close();
    console.log(`captured clone at ${width}px`);
  }
} finally {
  await browser.close();
}

// 2. Compare per width, per section.
const results = [];
const failing = [];
const countMismatches = [];
for (const width of widths) {
  const srcMeasure = JSON.parse(fs.readFileSync(path.join(sourceDir, `measurements-${width}.json`), "utf8"));
  const cloneMeasure = cloneMeasures[width];
  const src = PNG.sync.read(fs.readFileSync(path.join(sourceDir, "shots", `page-${width}.png`)));
  let clone = PNG.sync.read(fs.readFileSync(path.join(cloneShots, `page-${width}.png`)));
  if (clone.width !== src.width || clone.height !== src.height) {
    clone = scalePng(clone, src.width, src.height);
  }

  const diffPng = new PNG({ width: src.width, height: src.height });
  let full = 0;
  try {
    full = mismatchCount(src.data, clone.data, diffPng.data, src.width, src.height);
  } catch (err) {
    console.error(`pixelmatch failed at ${width}px: ${err.message}`);
  }
  fs.writeFileSync(path.join(overlays, `fullpage-${width}.png`), PNG.sync.write(diffPng));

  const srcSections = srcMeasure.sections ?? [];
  const cloneSections = cloneMeasure.sections ?? [];
  const matched = srcSections.length > 0 && srcSections.length === cloneSections.length;
  if (!matched) countMismatches.push({ width, source: srcSections.length, clone: cloneSections.length });

  const rows = [];
  for (let i = 0; i < srcSections.length; i++) {
    const s = srcSections[i];
    if (s.keep === false) {
      rows.push({ index: i, heading: s.heading, kept: false, mismatchPct: null });
      continue;
    }
    const base = { index: i, heading: s.heading, kept: true };
    try {
      let srcBand, cloneBand;
      if (matched) {
        const sy = Math.round(s.box.y);
        const sh = Math.round(s.box.height);
        const cy = Math.round(cloneSections[i].box.y);
        const ch = Math.round(cloneSections[i].box.height);
        const srcBandPath = path.join(overlays, `section-${i}-${width}.png`);
        const cloneBandPath = path.join(overlays, `_clone-${i}-${width}.png`);
        srcBand = writeBand(src, sy, sh, srcBandPath);
        cloneBand = writeBand(clone, cy, ch, cloneBandPath);
        if (cloneBand.width !== srcBand.width || cloneBand.height !== srcBand.height) {
          cloneBand = scalePng(cloneBand, srcBand.width, srcBand.height);
        }
        fs.unlinkSync(cloneBandPath);
        const diffBand = new PNG({ width: srcBand.width, height: srcBand.height });
        const mm = mismatchCount(srcBand.data, cloneBand.data, diffBand.data, srcBand.width, srcBand.height);
        fs.writeFileSync(srcBandPath, PNG.sync.write(diffBand));
        const pct = (100 * mm) / (srcBand.width * srcBand.height);
        rows.push({ ...base, boxY: sy, cloneY: cy, height: srcBand.height, mismatchPct: num(pct), overlay: path.relative(out, srcBandPath) });
        if (pct > threshold) failing.push({ width, index: i, heading: s.heading, pct: num(pct) });
      } else {
        rows.push({ ...base, boxY: Math.round(s.box.y), mismatchPct: null, note: "per-section skipped (section counts differ); see fullpage overlay" });
      }
    } catch (err) {
      console.error(`section ${i} @${width}px: ${err.message}`);
      rows.push({ ...base, boxY: Math.round(s.box.y), mismatchPct: null, note: err.message });
    }
  }
  // Clean the cloned copy of duplicated section rows.
  results.push({
    width,
    fullPage: { mismatchPct: num((100 * full) / (src.width * src.height)), height: src.height },
    sections: rows,
  });
}

// 3. Report.
const report = {
  generatedAt: new Date().toISOString(),
  threshold,
  sectionCountMismatches: countMismatches,
  results,
  failing,
};
fs.writeFileSync(path.join(out, "report.json"), JSON.stringify(report, null, 1));

const lines = ["# mirrorsmith diff report", "", `Gate: every kept section ≤ ${threshold}% mismatch at every width.`, ""];
for (const r of results) {
  lines.push(`## ${r.width}px — full page ${r.fullPage.mismatchPct}% (height ${r.fullPage.height}px)`, "");
  lines.push("| Section | Source y | Clone y | Mismatch |", "| --- | --- | --- | --- |");
  for (const s of r.sections) {
    const name = s.heading || `section ${s.index}`;
    lines.push(`| ${name}${s.kept === false ? " (dropped)" : ""} | ${s.boxY ?? ""} | ${s.cloneY ?? ""} | ${s.mismatchPct == null ? (s.note ?? "—") : `${s.mismatchPct}%`} |`);
  }
  lines.push("");
}
const reportMd = lines.join("\n");
fs.writeFileSync(path.join(out, "report.md"), reportMd);
console.log(reportMd);

if (failing.length > 0) {
  console.error(`\nFAIL: ${failing.length} section*size pairs above ${threshold}%. Overlays: ${overlays}`);
  process.exit(1);
}
console.log(`\nPASS: every kept section ≤ ${threshold}% at ${widths.join(" / ")}px. Report: ${path.join(out, "report.md")}`);
