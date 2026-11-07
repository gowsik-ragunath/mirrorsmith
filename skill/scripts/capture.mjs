#!/usr/bin/env node
// Capture a source page: screenshots, measurements, sections, assets.
// Usage: node scripts/capture.mjs --url <URL> [--out docs/clone/source] [--widths 1440,768,390] [--wait 1500]
import fs from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { DEFAULT_WIDTHS, cropBand, launchBrowser, measurePage, openPage } from "./lib.mjs";

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const url = arg("url");
if (!url) {
  console.error("Usage: node scripts/capture.mjs --url <URL> [--out docs/clone/source] [--widths 1440,768,390] [--wait 1500]");
  process.exit(1);
}
const out = path.resolve(arg("out") ?? "docs/clone/source");
const widths = (arg("widths") ?? DEFAULT_WIDTHS.join(","))
  .split(",")
  .map((n) => parseInt(n, 10))
  .filter(Boolean);
const waitMs = parseInt(arg("wait") ?? "1500", 10);

const shotsDir = path.join(out, "shots");
const cropsDir = path.join(out, "section-crops");
await mkdir(shotsDir, { recursive: true });
await mkdir(cropsDir, { recursive: true });

const browser = await launchBrowser();
const measures = [];
try {
  for (const width of widths) {
    const { context, page } = await openPage(browser, { url, width });
    await page.waitForTimeout(waitMs); // let lazy images and reveals settle
    const shotPath = path.join(shotsDir, `page-${width}.png`);
    await page.screenshot({ path: shotPath, fullPage: true });

    const measure = await measurePage(page);
    measure.url = url;
    measure.viewport = width;
    measure.screenshot = path.relative(out, shotPath);
    measures.push(measure);
    await writeFile(path.join(out, `measurements-${width}.json`), JSON.stringify(measure, null, 1));

    const fullPage = await page.evaluate(() => document.body.scrollHeight);
    console.log(`captured ${width}px: ${measure.sections.length} sections, ${measure.assets.length} assets, page height ${fullPage}px`);
    await context.close();
  }
} finally {
  await browser.close();
}

// Sections crop from the primary width's full-page shot.
const primary = measures[0];
const primaryShot = path.join(out, primary.screenshot);
for (const section of primary.sections) {
  const cropPath = path.join(cropsDir, `section-${section.index}.png`);
  try {
    cropBand(primaryShot, section.box, cropPath);
  } catch (err) {
    console.error(`crop failed for section ${section.index}: ${err.message}`);
  }
}

// Asset manifest (union across widths, first-seen wins).
const seen = new Set();
const assets = [];
for (const m of measures) {
  for (const a of m.assets) {
    if (seen.has(a.url)) continue;
    seen.add(a.url);
    assets.push(a);
  }
}
await writeFile(path.join(out, "assets.json"), JSON.stringify({ url, assets }, null, 1));
fs.writeFileSync(
  path.join(out, "sections.json"),
  JSON.stringify({ url, viewport: primary.viewport, sections: primary.sections }, null, 1)
);

console.log(`\nDone. Files in ${out}: shots/, section-crops/, measurements-*.json, sections.json, assets.json`);
console.log(`Next: run fetch-source.mjs for the HTML/CSS blueprint, then follow the mirrorsmith skill workflow step 2 (section selection).`);
