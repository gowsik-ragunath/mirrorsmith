#!/usr/bin/env node
// Download every asset listed in capture's assets.json into public/assets (resumable).
// Usage: node scripts/download-assets.mjs [--input docs/clone/source/assets.json] [--out public/assets] [--base <origin rewrite>] [--concurrency 6]
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    input: { type: "string", default: "docs/clone/source/assets.json" },
    out: { type: "string", default: "public/assets" },
    base: { type: "string" },
    concurrency: { type: "string", default: "6" },
  },
});

const inputPath = path.resolve(values.input);
const outRoot = path.resolve(values.out);
const concurrency = Math.max(1, parseInt(values.concurrency ?? "6", 10));
const base = values.base ? (values.base.endsWith("/") ? values.base : `${values.base}/`) : null;

if (!fs.existsSync(inputPath)) {
  console.error(`No input manifest at ${inputPath}. Run capture.mjs first.`);
  process.exit(1);
}
const captured = JSON.parse(fs.readFileSync(inputPath, "utf8"));
const assets = captured.assets ?? [];
if (assets.length === 0) {
  console.log("No assets found in the capture; nothing to download.");
  process.exit(0);
}

// Resume support: any already-recorded mapping in manifest.json is kept.
const manifestPath = path.join(outRoot, "manifest.json");
const map = fs.existsSync(manifestPath)
  ? JSON.parse(fs.readFileSync(manifestPath, "utf8"))
  : {};

const KIND_DIR = { image: "images", font: "fonts", video: "videos", icon: "icons" };

function localRel(asset, idx) {
  const dir = KIND_DIR[asset.kind] ?? "misc";
  let ext = "";
  try {
    ext = path.extname(new URL(asset.url).pathname) || "";
  } catch {}
  if (!ext || ext.length > 6) {
    ext =
      asset.kind === "font" ? ".woff2"
      : asset.kind === "video" ? ".mp4"
      : asset.kind === "icon" ? ".png"
      : ".bin";
  }
  const hash = createHash("sha1").update(asset.url).digest("hex").slice(0, 10);
  return path.join(dir, `${String(idx).padStart(3, "0")}-${hash}${ext}`);
}

const rewritten = (url) => (base ? url.replace(/^https?:\/\/[^/]+\//, base) : url);

const queue = [];
assets.forEach((asset, idx) => {
  const rel = localRel(asset, idx);
  if (!map[asset.url] && !fs.existsSync(path.join(outRoot, rel))) {
    queue.push({ ...asset, idx, rel });
  }
  if (!map[asset.url] && fs.existsSync(path.join(outRoot, rel))) {
    map[asset.url] = rel; // file exists from a previous run, just record it
  }
});

let ok = 0;
let fail = 0;
async function fetchOne({ url, rel }) {
  try {
    const target = rewritten(url);
    const res = await fetch(target, { redirect: "follow" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const dst = path.join(outRoot, rel);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.writeFileSync(dst, buf);
    map[url] = rel;
    ok++;
    console.log(`ok    ${rel}  ${(buf.length / 1024).toFixed(0)}KB  <- ${url.slice(0, 90)}`);
  } catch (err) {
    fail++;
    console.error(`FAIL  ${url.slice(0, 90)}: ${err.message}`);
  }
}

await Promise.all(
  Array.from({ length: concurrency }, async () => {
    while (queue.length) {
      const next = queue.shift();
      await fetchOne(next);
    }
  })
);

fs.mkdirSync(outRoot, { recursive: true });
fs.writeFileSync(manifestPath, JSON.stringify(map, null, 1));
console.log(`\nDone: ${ok} downloaded, ${fail} failed, ${Object.keys(map).length - ok} reused. Map: ${manifestPath}`);
if (fail > 0) {
  console.error("\nSome assets failed. Re-run this script — it is resumable and skips already-downloaded files.");
  process.exit(1);
}
