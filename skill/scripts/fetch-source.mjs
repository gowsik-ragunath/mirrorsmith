#!/usr/bin/env node
// Fetch the page's own source (HTML + linked stylesheets) as the build blueprint.
// Usage: node scripts/fetch-source.mjs --url <URL> [--out docs/clone/source/site] [--max-css 20] [--max-bytes 1000000]
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { detectSsr, detachSsr } from "./ssr-detach.mjs";

const { values } = parseArgs({
  options: {
    url: { type: "string" },
    out: { type: "string", default: "docs/clone/source/site" },
    "max-css": { type: "string", default: "20" },
    "max-bytes": { type: "string", default: "1000000" },
  },
});

if (!values.url) {
  console.error("Usage: node scripts/fetch-source.mjs --url <URL> [--out docs/clone/source/site] [--max-css 20] [--max-bytes 1000000]");
  process.exit(1);
}
const outDir = path.resolve(values.out);
const maxCss = parseInt(values["max-css"], 10);
const maxBytes = parseInt(values["max-bytes"], 10);
const htmlPath = path.join(outDir, "index.html");

fs.mkdirSync(outDir, { recursive: true });

const res = await fetch(values.url, { headers: { "User-Agent": "Mozilla/5.0 (mirrorsmith)" }, redirect: "follow" });
if (!res.ok) {
  console.error(`Fetch failed: HTTP ${res.status}`);
  process.exit(1);
}
const html = await res.text();
const htmlTruncated = html.length > maxBytes;
fs.writeFileSync(htmlPath, html.slice(0, maxBytes));
const htmlKB = (Math.min(html.length, maxBytes) / 1024).toFixed(0);

// Linked stylesheets from the head (order matters).
const cssLinks = [...html.matchAll(/<link\b[^>]*rel=["']stylesheet["'][^>]*>/gi)]
  .map((m) => /href=["']([^"']+)["']/.exec(m[0])?.[1])
  .filter(Boolean);
const cssUrls = [];
for (const href of cssLinks) {
  try {
    const abs = new URL(href, res.url || values.url).href;
    if (!cssUrls.includes(abs)) cssUrls.push(abs);
  } catch {}
}

const cssDir = path.join(outDir, "css");
fs.mkdirSync(cssDir, { recursive: true });
const manifest = { url: values.url, html: { file: "index.html", bytes: Math.min(html.length, maxBytes), truncated: htmlTruncated }, css: [], skipped: [] };

let idx = 0;
for (const url of cssUrls.slice(0, maxCss)) {
  idx++;
  try {
    const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (mirrorsmith)" } });
    if (!r.ok) {
      manifest.skipped.push({ url, reason: `HTTP ${r.status}` });
      continue;
    }
    const text = await r.text();
    const name = `css/${String(idx).padStart(2, "0")}-${new URL(url).pathname.split("/").pop().replace(/[^\w.-]/g, "_") || "sheet"}.css`;
    fs.writeFileSync(path.join(outDir, name), text);
    manifest.css.push({ url, file: name, bytes: text.length });
  } catch (err) {
    manifest.skipped.push({ url, reason: err.message.split("\n")[0] });
  }
}

fs.writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 1));

// SSR detach pass: when the fetch is framework-rendered (Next/Nuxt/Remix/…),
// also write index.standalone.html — scripts stripped, stylesheets rebound to
// the local css/ files — so the blueprint is standalone, never hydrating from
// the source's bundles. Content mining uses framework.json payloads.
const cssMap = Object.fromEntries(manifest.css.map((c) => [c.url, c.file]));
if (detectSsr(html)) {
  const { framework, payloads, html: standalone } = detachSsr(html, { cssMap });
  fs.writeFileSync(path.join(outDir, "index.standalone.html"), standalone);
  if (payloads.length) fs.writeFileSync(path.join(outDir, "framework.json"), payloads.join("\n"));
  manifest.ssr = { framework, standalone: true, payloads: payloads.length };
  fs.writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 1));
  console.log(`\nSSR:  ${framework} page → index.standalone.html (scripts stripped, CSS local, standalone).`);
  console.log("      Build from index.standalone.html; mine data from framework.json.");
}

const totalCssKB = (manifest.css.reduce((a, c) => a + c.bytes, 0) / 1024).toFixed(0);
console.log(`HTML: index.html ${htmlKB}KB${htmlTruncated ? " (TRUNCATED at --max-bytes; raise it to fetch fully)" : ""}`);
for (const c of manifest.css) console.log(`CSS:  ${c.file}  ${(c.bytes / 1024).toFixed(0)}KB  <- ${c.url}`);
for (const s of manifest.skipped) console.log(`SKIP: ${s.url} (${s.reason})`);
const readable = !htmlTruncated && (manifest.css.every((c) => c.file) || cssUrls.length === 0);
console.log(readable
  ? `\nREADABLE: build directly from docs/clone/source/site/ — grep the HTML for section markup, and the CSS files for its rules. No measurement needed.`
  : `\nPARTIAL: source is truncated. Re-run with --max-bytes or fall back to scripts/capture.mjs measurements.`);
