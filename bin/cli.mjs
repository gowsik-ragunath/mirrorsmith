#!/usr/bin/env node
// mirrorsmith CLI — `npx mirrorsmith init <dir>` / `npx mirrorsmith install-skill`
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TEMPLATE = path.join(ROOT, "template");
const SKILL = path.join(ROOT, "skill");

const HELP = `mirrorsmith — pixel-accurate static website cloner for coding agents

Usage:
  npx mirrorsmith init [dir] [--no-install]   Scaffold a clone project (default: .)
  npx mirrorsmith install-skill [--dir p]     Install the skill for OpenCode
  npx mirrorsmith help                        Show this help`;

async function main() {
  const argv = process.argv.slice(2);
  const command = argv[0] ?? "help";

  if (command === "help" || command === "--help" || command === "-h") {
    console.log(HELP);
    return;
  }

  if (command === "init") {
    const rest = argv.slice(1).filter((a) => !a.startsWith("--"));
    const noInstall = argv.includes("--no-install");
    const dir = path.resolve(rest[0] ?? ".");
    if (existsSync(path.join(dir, "package.json"))) {
      console.error(`Refusing to overwrite: ${dir} already has a package.json`);
      process.exit(1);
    }
    await mkdir(dir, { recursive: true });
    await cp(TEMPLATE, dir, { recursive: true });
    const pkgPath = path.join(dir, "package.json");
    const pkg = JSON.parse(await readFile(pkgPath, "utf8"));
    pkg.name = path.basename(dir).replace(/[^a-z0-9-]/gi, "-").toLowerCase();
    await writeFile(pkgPath, JSON.stringify(pkg, null, 2) + "\n");

    if (!noInstall) {
      console.log("Installing dependencies (this can take a minute)…");
      const { execSync } = await import("node:child_process");
      execSync("npm install --no-fund --no-audit", { cwd: dir, stdio: "inherit" });
      console.log("\nInstalling the Playwright Chromium browser…");
      try {
        execSync("npx playwright install chromium", { cwd: dir, stdio: "inherit" });
      } catch {
        console.error("Chromium download failed — run `npx playwright install chromium` later.");
      }
    }

    console.log(`
Done. Your clone project is ready in ${dir}

Next (agent) steps:
  1. node scripts/fetch-source.mjs --url <SOURCE_URL>   # blueprint: HTML + CSS
  2. node scripts/capture.mjs --url <SOURCE_URL> --out docs/clone/source
  3. Review sections.json crops and ask the user which sections to keep
  4. Write specs, build sections, then node scripts/diff.mjs --source-dir docs/clone/source --clone-url http://localhost:3000
`);
    return;
  }

  if (command === "install-skill") {
    const flagIdx = argv.indexOf("--dir");
    const target =
      (flagIdx >= 0 && argv[flagIdx + 1]) ||
      path.join(os.homedir(), ".config", "opencode", "skills", "mirrorsmith");
    if (existsSync(target)) await rm(target, { recursive: true });
    await mkdir(path.dirname(target), { recursive: true });
    await cp(SKILL, target, { recursive: true });
    console.log(`Skill installed at ${target}`);
    return;
  }

  console.log(HELP);
  process.exit(command === "init" || command === "install-skill" ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
