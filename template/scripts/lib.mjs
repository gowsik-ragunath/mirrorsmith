// Shared helpers for mirrorsmith capture/diff scripts.
import fs from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";
import { chromium } from "playwright";

export const DEFAULT_WIDTHS = [1440, 768, 390];

export async function launchBrowser() {
  return chromium.launch({ headless: true });
}

export async function openPage(browser, { url, width }) {
  const context = await browser.newContext({
    viewport: { width, height: 1000 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 60_000 });
  } catch (err) {
    // Partial loads are still measurable; report and continue.
    console.error(`goto warning (${url}): ${err.message.split("\n")[0]}`);
  }
  return { context, page };
}

const STYLE_PROPS = [
  "fontSize", "fontWeight", "fontFamily", "fontStyle", "lineHeight", "letterSpacing",
  "color", "backgroundColor", "backgroundImage", "textAlign", "textTransform",
  "textDecoration", "whiteSpace", "WebkitTextStroke", "WebkitBackgroundClip",
  "padding", "margin", "width", "maxWidth", "minWidth", "height", "minHeight", "maxHeight",
  "display", "flexDirection", "flexWrap", "justifyContent", "alignItems", "gap",
  "gridTemplateColumns", "gridTemplateRows", "columnCount",
  "border", "borderRadius", "borderRadiusTopLeft", "boxShadow", "outline",
  "overflow", "opacity", "objectFit", "position", "top", "left", "right", "bottom",
  "zIndex", "transform", "filter", "backdropFilter", "mixBlendMode", "transition",
  "animation", "scrollBehavior", "cursor", "textShadow", "clipPath", "aspectRatio",
];

// Runs inside the page: returns { tree, sections, assets, fonts, palette }.
export async function measurePage(page) {
  return page.evaluate(
    /** @param {string[]} props */ (props) => {
      const round = (n) => Math.round(n * 100) / 100;
      const boxOf = (el) => {
        const r = el.getBoundingClientRect();
        return {
          x: round(r.x),
          y: round(r.top + window.scrollY),
          width: round(r.width),
          height: round(r.height),
        };
      };
      const pick = (el) => {
        const cs = getComputedStyle(el);
        const styles = {};
        for (const p of props) {
          const v = cs[p];
          if (!v) continue;
          if (v === "none" || v === "normal" || v === "auto" || v === "0px") continue;
          if (p === "backgroundColor" && v === "rgba(0, 0, 0, 0)") continue;
          styles[p] = v;
        }
        return styles;
      };
      function walk(el, depth) {
        if (depth > 6) return null;
        const children = [...el.children];
        const imgEl = /** @type {HTMLImageElement|null} */ (el.tagName === "IMG" ? el : null);
        return {
          tag: el.tagName.toLowerCase(),
          id: el.id || null,
          cls: typeof el.className === "string" ? el.className.split(/\s+/).filter(Boolean).slice(0, 8) : [],
          box: boxOf(el),
          text:
            children.length === 0 && el.textContent
              ? el.textContent.trim().slice(0, 160)
              : null,
          styles: pick(el),
          img: imgEl
            ? { src: imgEl.currentSrc || imgEl.src, alt: imgEl.alt || null, box: boxOf(imgEl) }
            : null,
          children: children.slice(0, 30).map((c) => walk(c, depth + 1)).filter(Boolean),
        };
      }

      // --- sections: top-level page bands >= 160px tall
      const selector = "section,header,footer,article,main";
      let candidateEls = [...document.querySelectorAll(selector)];
      if (candidateEls.length === 0) candidateEls = [...document.body.children];
      const items = candidateEls
        .map((el) => ({ el, box: boxOf(el) }))
        .filter((i) => i.box.height >= 160 && i.box.width >= 300);
      const topLevel = items.filter(
        (i) => !items.some((j) => j !== i && j.el.contains(i.el))
      );
      const sections = topLevel
        .map((i) => {
          const headingEl = i.el.querySelector("h1,h2,h3");
          return {
            box: i.box,
            bg: getComputedStyle(i.el).backgroundColor,
            heading: headingEl ? headingEl.textContent.trim().slice(0, 120) : null,
            textSample: (i.el.innerText || "")
              .replace(/\s+/g, " ")
              .trim()
              .slice(0, 200),
          };
        })
        .sort((a, b) => a.box.y - b.box.y)
        .map((s, i) => ({ index: i, keep: true, ...s }));

      // Sections for bare-markup pages (no semantic tags, or semantic tags
      // covering <50% of the page) are clustered later, in `clusterFallback()`,
      // once boxOf/heading data are still cheap to reuse.

      // --- assets
      const assets = [];
      const add = (url, kind, extra) => {
        if (url && !url.startsWith("data:")) assets.push({ url, kind, ...extra });
      };
      document.querySelectorAll("img").forEach((img) =>
        add(img.currentSrc || img.src, "image", { alt: img.alt || null })
      );
      document.querySelectorAll("video").forEach((v) => {
        if (v.poster) add(v.poster, "image", { alt: "video-poster" });
        const src = v.currentSrc || v.querySelector("source")?.src;
        if (src) add(src, "video", {});
      });
      for (const sheet of document.styleSheets) {
        let rules;
        try {
          rules = [...sheet.cssRules];
        } catch {
          continue; // cross-origin sheet
        }
        for (const rule of rules) {
          const bg = rule.style?.getPropertyValue?.("background-image");
          if (bg) {
            const m = /url\((["']?)([^"')]+)\1\)/.exec(bg);
            if (m) {
              try {
                add(new URL(m[2], sheet.href || location.href).href, "image", {});
              } catch {}
            }
          }
          if (rule instanceof CSSFontFaceRule) {
            const src = rule.style.getPropertyValue("src");
            const m = /url\((["']?)([^"')]+)\1\)/.exec(src);
            if (m) {
              try {
                add(new URL(m[2], sheet.href || location.href).href, "font", {
                  family: rule.style.getPropertyValue("font-family").trim(),
                  weight: rule.style.getPropertyValue("font-weight").trim() || null,
                });
              } catch {}
            }
          }
        }
      }
      document
        .querySelectorAll('link[rel*="icon"], link[rel="apple-touch-icon"]')
        .forEach((l) => add(l.href, "icon", {}));
      document
        .querySelectorAll('link[rel="preload"][as="font"]')
        .forEach((l) => add(l.href, "font", {}));

      // --- fonts in use + color palette
      const fonts = new Map();
      const palette = new Map();
      const sample = [...document.querySelectorAll("body, body *")].slice(0, 400);
      for (const el of sample) {
        const cs = getComputedStyle(el);
        if (el.textContent?.trim()) {
          const fam = cs.fontFamily.split(",")[0].replace(/["']/g, "").trim();
          const key = `${fam}|${cs.fontWeight}|${cs.fontSize}`;
          if (!fonts.has(key)) fonts.set(key, { family: fam, weight: cs.fontWeight, size: cs.fontSize, lineHeight: cs.lineHeight, letterSpacing: cs.letterSpacing, sample: el.textContent.trim().slice(0, 60) });
        }
        const c = cs.color;
        if (!palette.has(c)) palette.set(c, cssToHex(c));
        const bg = cs.backgroundColor;
        if (bg !== "rgba(0, 0, 0, 0)" && !palette.has(bg)) palette.set(bg, cssToHex(bg));
      }
      function cssToHex(css) {
        const m = css.match(/rgba?\(([\d.]+), ([\d.]+), ([\d.]+)(?:, ([\d.]+))?/);
        if (!m) return css;
        const to = (v) => Math.max(0, Math.min(255, Math.round(+v))).toString(16).padStart(2, "0");
        const hex = `#${to(m[1])}${to(m[2])}${to(m[3])}`;
        return +m[4] > 0 && m[4] !== "1" ? css : hex;
      }

      // Fallback clustering for bare-markup pages: group the body's visible
      // children into vertical bands separated by gaps > 48px.
      function clusterFallback() {
        const pageHeight = document.body.scrollHeight;
        const covered = sections.reduce((acc, s) => acc + s.box.height, 0);
        if (sections.length > 0 && covered >= pageHeight * 0.5) return [];
        const HIDDEN = ["SCRIPT", "STYLE", "NOSCRIPT", "LINK", "META", "TEMPLATE"];
        const kids = [...document.body.children]
          .filter((el) => {
            const b = boxOf(el);
            return !HIDDEN.includes(el.tagName) && b.width >= 1 && b.height >= 1;
          })
          .map((el) => boxOf(el))
          .sort((a, b) => a.y - b.y);
        const bands = [];
        for (const k of kids) {
          const last = bands[bands.length - 1];
          if (!last || k.y - (last.y + last.height) > 48) {
            bands.push({ y: k.y, height: k.y + k.height });
          } else {
            last.height = Math.max(last.height, k.y + k.height);
          }
        }
        const headings = [...document.querySelectorAll("h1,h2,h3")].map((h) => {
          const b = boxOf(h);
          return { y: b.y, text: h.textContent.trim().slice(0, 120) };
        });
        return bands
          .map((bnd) => {
            const height = Math.min(bnd.height, pageHeight) - bnd.y;
            const head = headings.find((h) => h.y >= bnd.y - 4 && h.y <= bnd.y + height);
            const members = kids.filter((k) => k.y >= bnd.y && k.y < bnd.y + height);
            const width = members.length
              ? Math.max(...members.map((k) => k.x + k.width))
              : document.body.clientWidth;
            return {
              box: { x: 0, y: bnd.y, width, height },
              bg: "rgba(0, 0, 0, 0)",
              heading: head ? head.text : null,
              textSample: "",
            };
          })
          .filter((s) => s.box.height >= 40)
          .sort((a, b) => a.box.y - b.box.y)
          .map((s, i) => ({ index: i, keep: true, ...s }));
      }
      const clustered = clusterFallback();

      return {
        tree: walk(document.body, 0),
        sections: clustered.length > 0 ? clustered : sections,
        assets,
        fonts: [...fonts.values()],
        palette: [...palette.entries()].map(([value, hex]) => ({ hex, raw: value })),
      };
    },
    STYLE_PROPS
  );
}

// Crop a horizontal band (full width) from a PNG file.
export function cropBand(pngPath, { y, height }, outPath) {
  const src = PNG.sync.read(fs.readFileSync(pngPath));
  const top = Math.max(0, Math.round(y));
  const h = Math.min(Math.round(height), src.height - top);
  if (h <= 0) throw new Error(`Band y=${top} h=${h} is outside ${pngPath} (height ${src.height})`);
  const dst = new PNG({ width: src.width, height: h });
  PNG.bitblt(src, dst, 0, top, src.width, h, 0, 0);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, PNG.sync.write(dst));
}

// Nearest-neighbor scale a PNG object to w x h (for pixelmatch size alignment).
export function scalePng(src, w, h) {
  const dst = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) {
    const sy = Math.min(src.height - 1, Math.floor((y * src.height) / h));
    for (let x = 0; x < w; x++) {
      const sx = Math.min(src.width - 1, Math.floor((x * src.width) / w));
      const si = (sy * src.width + sx) * 4;
      const di = (y * w + x) * 4;
      dst.data[di] = src.data[si];
      dst.data[di + 1] = src.data[si + 1];
      dst.data[di + 2] = src.data[si + 2];
      dst.data[di + 3] = src.data[si + 3];
    }
  }
  return dst;
}
