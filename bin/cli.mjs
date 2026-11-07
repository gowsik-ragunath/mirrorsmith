#!/usr/bin/env node
// mirrorsmith CLI — `npx mirrorsmith install-skill` / help
import { cp, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SKILL = path.join(ROOT, "skill");

const HELP = `mirrorsmith — pixel-accurate static website cloner for coding agents

Usage:
  npx mirrorsmith install-skill [--dir p]     Install the skill for OpenCode
  npx mirrorsmith help                        Show this help

Clone projects are created by the mirrorsmith skill itself at runtime
(create-next-app + the toolkit scripts). There is no init command.

For agents: the full workflow lives in the installed skill (SKILL.md).`;

async function main() {
  const argv = process.argv.slice(2);
  const command = argv[0] ?? "help";

  if (command === "help" || command === "--help" || command === "-h") {
    console.log(HELP);
    return;
  }

  if (command === "install-skill") {
    const flagIdx = argv.indexOf("--dir");
    const target =
      (flagIdx >= 0 && argv[flagIdx + 1]) ||
      path.join(os.homedir(), ".config", "opencode", "skills", "mirrorsmith");
    if (existsSync(target)) await rm(target, { recursive: true });
    await cp(SKILL, target, { recursive: true });
    console.log(`Skill installed at ${target}`);
    return;
  }

  console.log(HELP);
  process.exit(command ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
