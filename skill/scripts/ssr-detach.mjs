#!/usr/bin/env node
// Detach an SSR-served page from its framework: rewrite the fetched HTML so the
// blueprint ships as fully standalone markup — no hydration scripts, no framework
// JSON payloads, stylesheets pointed at the locally downloaded css/ files.
//
// Why: SSR sites (Next.js, Nuxt, SvelteKit, Astro islands) ship the rendered
// HTML **plus** a runtime payload (`__NEXT_DATA__`, `__NUXT__`, `/@fs`/`/_next`
// module scripts) whose only job is to hydrate. Replaying those bundles in a
// static rebuild either does nothing (they 404 / fetch the original origin) or
// fights the clone's own JS with hydration mismatch errors. Standard archiving
// practice (SingleFile, ArchiveBox, snapshot tools): keep the rendered DOM,
// strip every script, keep the CSS standalone.
//
// Usage:
//   node scripts/ssr-detach.mjs --dir docs/clone/source/site
//   (writes index.standalone.html + framework.json next to index.html)
//
// Module use: export { detectSsr, detachSsr } — called automatically by
// scripts/fetch-source.mjs after every fetch.
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

// Markers that identify which framework rendered the page.
const SSR_MARKERS = [
  ["__NEXT_DATA__", "next-pages"],
  ["__next_f", "next-app"],
  ["__NUXT__", "nuxt"],
  ["__remixContext", "remix"],
  ["__sveltekit", "sveltekit"],
  ["astro-island", "astro"],
  ["__gatsby", "gatsby"],
];

/** @returns {string | null} framework id when raw SSR HTML contains a hydration payload. */
export function detectSsr(html) {
  for (const [marker, id] of SSR_MARKERS) {
    if (html.includes(marker)) return id;
  }
  return null;
}

// Framework payload scripts worth persisting (page data lives in them —
// often the only structured source for repeated lists/cards).
const PAYLOAD_IDS = [
  /<script[^>]*\bid=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/gi,
  /<script[^>]*>window\.__NUXT__([\s\S]*?)<\/script>/gi,
  /<script[^>]*>window\.__remixContext\s*=\s*([\s\S]*?)<\/script>/gi,
  /<script[^>]*>window\.__sveltekit_[\s\S]*?<\/script>/gi,
];

// Decode the entities a server double-escapes into inline <style> text.
// SSR HTML often contains e.g. `.hover\:underline:hover` written as
// `.hover&#92;:underline` — CSS only round-trips after unescaping.
function decodeEntities(css) {
  return css
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&(amp|lt|gt|quot|#39);/g, (_, e) =>
      ({ amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'" })[e]);
}

const relHref = (file) => `./${file}`;

/**
 * @param {string} html raw SSR HTML
 * @param {{ cssMap?: Record<string, string> }} opts cssMap maps original absolute
 *        stylesheet URL -> local file name produced by fetch-source.mjs
 */
export function detachSsr(html, { cssMap = {} } = {}) {
  const framework = detectSsr(html);

  // 1) Extract framework payloads for content mining, then forget their script tags.
  const payloads = [];
  for (const re of PAYLOAD_IDS) {
    for (const m of html.matchAll(re)) payloads.push(m[1]?.slice(0, 200_000) ?? "");
  }

  let out = html;

  // 2) Drop every <script> (inline + external). Static rebuild hydrates nothing
  //    from the source; interactivity is re-implemented in the clone's own JS.
  out = out.replace(/<script\b[\s\S]*?<\/script>/gi, "");
  out = out.replace(/<script\b[^>]*\/?\s*>/gi, "")

  // 3) Drop preloads/prefetches pointing at scripts the standalone page no longer runs.
  out = out.replace(/<link\b[^>]*(?:rel=["'][^"']*(?:prefetch|preload|modulepreload)[^"']*["'])[^>]*(?:href=["'][^"']*\.(?:js|mjs)["'][^>]*)>\/?\s*/gi, "");

  // 4) Point every stylesheet at the locally downloaded css/ files so the page
  //    renders identically offline — no requests to the source origin.
  out = out.replace(/(<link\b[^>]*rel=["']stylesheet["'][^>]*href=["'])([^"']+)(["'])/gi,
    (m, head, href, tail) => {
      const local = cssMap[href.trim()];
      if (local) return `${head}${relHref(local)}${tail}`;
      return m; // leave as-is; caller/agent resolves remaining absolute URLs
    });

  // 5) Unescape server-double-encoded CSS inside inline <style> blocks.
  out = out.replace(/<style\b([^>]*)>([\s\S]*?)<\/style>/gi,
    (m, attrs, css) => `<style${attrs}>${decodeEntities(css)}</style>`);

  // 6) Kill noscript-degraded duplicate rendering artefacts (<noscript><style> known culprit).
  out = out.replace(/<noscript><style[\s\S]*?<\/style><\/noscript>/gi, "");

  return { framework, payloads, html: out };
}

// --- CLI: post-process an already-fetched docs/clone/source/site directory ---
import { pathToFileURL } from "node:url";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
const { values } = parseArgs({
  options: { dir: { type: "string", default: "docs/clone/source/site" } },
});
const dir = path.resolve(values.dir);
const htmlPath = path.join(dir, "index.html");
if (!fs.existsSync(htmlPath)) {
  console.error(`No ${htmlPath} — run scripts/fetch-source.mjs first.`);
  process.exit(1);
}

const html = fs.readFileSync(htmlPath, "utf8");
const manifest = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8"));
// manifest.css entries store { url, file } — rebuild url -> local-file map.
const cssMap = Object.fromEntries((manifest.css ?? []).map((c) => [c.url, c.file]));

const { framework, payloads, html: standalone } = detachSsr(html, { cssMap });
if (!framework) {
  console.log("Not an SSR payload page (no framework markers) — nothing to detach.");
  process.exit(0);
}

fs.writeFileSync(path.join(dir, "index.standalone.html"), standalone);
if (payloads.length) {
  fs.writeFileSync(path.join(dir, "framework.json"), payloads.join("\n"));
}
const kb = (standalone.length / 1024).toFixed(0);

console.log(`SSR:  ${framework} detected → index.standalone.html ${kb}KB`);
console.log(`      all <script>/script preloads removed; payloads -> framework.json (${payloads.length})`);
console.log(`      stylesheets rebound to local css/ files; page runs standalone with zero source JS.`);
console.log("      Mine content from framework.json (next/props…), never from live bundles.");
}
