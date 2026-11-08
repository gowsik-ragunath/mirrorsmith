# mirrorsmith

Pixel-accurate static website cloner for coding agents.

Give it a URL and an OpenCode (or other coding agent) session rebuilds the page as a
fresh **Next.js + Tailwind v4** project — **reverse-engineered from Playwright
measurements, never by copying the source code**. The clone is diffed pixel-for-pixel
against the source until every kept section is within a 1% pixel mismatch.

## How it works

1. **Capture** — Playwright screenshots the source at 1440 / 768 / 390 px and records
   computed styles, layout boxes, fonts, colors and real assets into JSON.
2. **Read the source** — because the pixel diff needs screenshots either way, but the
   build blueprint comes straight from the page's own HTML + CSS whenever those are
   readable (`fetch-source.mjs`); measured JSON is the fallback when they aren't.
3. **Section selection** — the agent lists every detected section, shows crops, and
   asks the user which ones to keep, drop, or re-write with new text.
4. **Spec & build** — one short spec per kept section (from the fetched source when
   readable, else from measurements); the agent ports it into new Next.js
   components. Photos, logos and webfonts are downloaded.
5. **Diff** — `pixelmatch` compares source vs clone per section per width. Any
   section above the 1% mismatch threshold gets another pass.
6. **Polish (opt-in, subtle)** — light motion (fades, 12px lifts, stagger) added
   after the diff passes, settling into the exact verified layout.
7. **Gate** — `npm run build` must pass clean.

## Install the skill

```bash
npx mirrorsmith install-skill          # installs into ~/.config/opencode/skills/mirrorsmith
```

Then say to your agent: *clone https://example.com*, or `/mirrorsmith https://example.com`.

## Start a clone project

No separate scaffold command — the skill creates the Next.js app itself when
you use it (create-next-app + the toolkit scripts copied from the skill).

The toolkit ships with the skill, so agents don't need a browser MCP:

- `scripts/fetch-source.mjs` — the page's own HTML + CSS as the build blueprint
- `scripts/ssr-detach.mjs` — SSR pages: strips the framework's JS/payloads and
  frees the rendered markup for a standalone rebuild (`index.standalone.html`)
- `scripts/capture.mjs` — screenshots + measurements + section detection + assets
- `scripts/diff.mjs` — per-section pixel diff with threshold gate
- `scripts/download-assets.mjs` — resumable asset downloader

## Repository layout

```
bin/cli.mjs              npx entry (install-skill)
skill/SKILL.md           the agent workflow
skill/scripts/           Playwright toolkit the agent copies into each project
skill/references/        extraction, sections, motion, qa guidance
evals/                   benchmark procedure + fixed gold sources
```

## Rights check

The skill asks the user to confirm they have the rights to the source before it
starts. Cloning a design you don't hold rights to may infringe on the source's
license or copyright — check the site's terms first.

## License

MIT
