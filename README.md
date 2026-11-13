# mirrorsmith

Visually-accurate static website cloner for coding agents.

Give it a URL and an OpenCode (or other coding agent) session rebuilds the page as a
fresh **Next.js + Tailwind v4** site — built from the page's own readable HTML + CSS
when available, and from Playwright measurements otherwise. The result is a fluid
responsive site verified visually at multiple widths (1440 / 1000 / 768 / 390),
not a pixel-threshold gate.

## How it works

1. **Read the source** — when the site serves readable HTML and CSS, fetch it and
   build directly from it (`fetch-source.mjs`): it is the cheapest, most exact
   spec. For SSR pages (`ssr-detach.mjs`), the framework's scripts and payloads
   are stripped and interactivity is re-implemented in the clone's own React —
   the clone runs with zero source-origin requests.
2. **Measure the rest** — if the source is obfuscated or an SPA bundle, Playwright
   captures the page at 1440 / 1000 / 768 / 390 px and records computed styles,
   layout boxes, fonts, colors and real assets into JSON.
3. **Section selection** — the agent lists every detected section, shows crops, and
   asks the user which ones to keep, drop, or re-write with new text.
4. **Spec & build** — one short spec per kept section; the agent ports it into new
   Next.js components. Photos, logos and webfonts are downloaded.
5. **Visual verification** — side-by-side screenshots per width, plus per-section
   diff overlays (`diff.mjs`) that highlight where the clone drifts from the
   source. Identity is judged visually, never by a pixel-threshold number; any
   section that looks off gets another pass.
6. **Polish (opt-in, subtle)** — light motion (fades, 12px lifts, stagger) added
   after verification passes, settling into the exact verified layout.
7. **Gate** — `npm run build` must pass clean.

## Install the skill

```bash
npx mirrorsmith install-skill
```

Installs into OpenCode's global skills directory, resolved the same way OpenCode
itself does it (works on Linux, macOS and Windows):

1. `OPENCODE_CONFIG_DIR` — if set, used as-is
2. `$XDG_CONFIG_HOME/opencode` — if set
3. `~/.config/opencode` — default (`C:\Users\you\.config\opencode` on Windows)

Use `--dir <path>` for a custom location, then add that directory to OpenCode's
`skills` config.

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
