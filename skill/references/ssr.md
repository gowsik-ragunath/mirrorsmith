# SSR reference (standalone rebuilds, zero source-JS dependency)

Sites rendered server-side (Next.js, Nuxt, SvelteKit, Remix, Astro, most
Wordpress-adjacent platforms) send **fully rendered HTML**. That is good news:
the first paint needs no JavaScript, so the fetched source is a complete spec.
The danger is the *second half of the payload* — hydration scripts and framework
data whose only job is to attach the framework runtime. Those must never ship in
the clone.

## The rule

**Build from the rendered DOM. Ship none of the source's JS/CSS runtime.**

The rebuilt site is standalone: it runs from its own Next.js components and
Tailwind with no request to the source origin, and no script copied from the
source can ever hydrate inside it. This is the same approach archiving tools
(SingleFile, ArchiveBox, snapshot/mirror tools) converged on: keep the DOM,
freeze the CSS, strip every script.

## What the detach pass does (`scripts/ssr-detach.mjs`)

`fetch-source.mjs` runs it automatically when the HTML contains a framework
marker and writes, next to `index.html`:

- `index.standalone.html` — the blueprint:
  - all `<script>` tags removed (inline and external);
  - `prefetch`/`preload`/`modulepreload` links to `.js`/`.mjs` removed;
  - every `<link rel="stylesheet">` rebound to the locally downloaded `css/`
    files (offline-identical rendering, no origin requests);
  - inline `<style>` blocks unescaped (servers double-encode selectors like
    `hover\:` as `hover&#92;:` — CSS does not round-trip unless unescaped).
- `framework.json` — the extracted framework payloads (`__NEXT_DATA__`,
  `window.__NUXT__`, `__remixContext`, SvelteKit's payload scripts). This is
  structured content: nav labels, card lists, link trees. **Mine content from
  it first** — it is cheaper and more exact than reading rendered markup before
  asking questions.

Detect the framework via the markers: `__NEXT_DATA__`/`__next_f` (Next),
`__NUXT__` (Nuxt), `__remixContext` (Remix), `__sveltekit` (SvelteKit),
`astro-island` (Astro), `__gatsby` (Gatsby).

## Mining content from framework payloads

`framework.json` holds the page's data as serialized JSON — in Next.js
App Router the streams are chunked (`self.__next_f.push(…)` fragments); glue
the fragments in order, then grep for the component props you need. Prefer a
payload field (a product list, menu, footer link objects) over transcribing the
same data from rendered HTML.

## What "standalone" means in the rebuilt clone

- All styling lives in the clone's Tailwind/component CSS. If detection finds
  critical inline CSS (e.g. a font-loading anti-FOUC block), that may be
  recreated as the clone's own small `<style>` file — recreated, not copied.
- Interactive behavior visible on the source (menus, tabs, accordions, sliders,
  hover states) is re-implemented in the clone's own client components, in
  React, from captured interaction states. Never "include their script and let
  it hydrate".
- Absolute asset URLs (`https://source…/img/x.png`) are acceptable only during
  evaluation; before QA, `download-assets.mjs` must localize them all, and the
  final page must be fully served by the clone's own `next` server.

## Common SSR traps and fixes

1. **JS-hidden content** (the server sends `display:none` markup that a client
   script reveals — e.g. after nonce/platform hydration). The visible state is
   what you measure: use Playwright (`capture.mjs`) at `networkidle`, diff the raw
   fetch against the measured DOM and build from whichever shows content.
2. **Chunked/deferred SSR streams** (React server components). A plain `fetch`
   can cut off mid-stream; verify the fetched HTML ends with `</html>`; if not,
   fall back to the Playwright DOM (`document.documentElement.outerHTML`).
3. **Time-scoped content** — a dated hero ("48h only", a countdown). Freeze
   whatever it showed at capture; note the mismatch in STATUS.md.
4. **Form-expecting islands** (search bars, filters). Capture their resting
   state; build them as working inputs wired to nothing visible, or omit with
   a STATUS.md note — you are not porting their backend.
5. **Hard-coded-origin assets** — CSS `url(https://source…/font.woff2)`.
   Rewrite to the localized `public/` copies; keep a mapping note in the build
   so QA can prove zero-origin (`grep -c 'https://source' -r .` must be 0 in
   the built app).

## Verification addendum for SSR sources

Beyond the standard visual pass (qa.md): open the clone's built `index.html`
with network throttled to offline except localhost. Everything painted must be
the clone: zero failed requests to the source origin proves the detach — a
clone that still calls home is not standalone.
