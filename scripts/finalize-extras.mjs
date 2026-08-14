#!/usr/bin/env node
// Runs the tail of the extras pass in the right order, printing every report: prepare → duplicate
// check → collision audit → re-order → validate → preflight (extras-pass.md).
//
// Usage:
//   node scripts/finalize-extras.mjs <extras-run-dir>
//   ... --seed <text>     override the re-order seed (default <folder>-post-prepare)
//   ... --dry             print the plan without running it
//
// ⚠️ `prepare` spends model credits. Run this once, after the unit's cards are authored and merged.
//
// It decides nothing: the reports are printed for YOU to judge. Which reported duplicate is real,
// how to word a missing cue, whether an exclusion should be reversed — all of that stays a judgment
// call, and none of the audits are given --apply.
import { spawnSync } from "child_process";
import { existsSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import { finalizeExtrasPlan, postPrepareSeed } from "../src/cards/finalizeExtras.js";

const REPO = resolve(join(dirname(fileURLToPath(import.meta.url)), ".."));
const args = process.argv.slice(2);
const dry = args.includes("--dry");
const seedIndex = args.indexOf("--seed");
// Guard the -1: with no --seed, `seedIndex + 1` is 0, which would drop argv[0] — the run dir — and
// the script could then only run WITH --seed. extras-order.mjs hit exactly this.
const positional = args.filter(
  (a, i) => !a.startsWith("--") && !(seedIndex >= 0 && i === seedIndex + 1),
);
const runDir = resolve(positional[0] || "");

if (!positional[0] || !existsSync(join(runDir, "cards.json"))) {
  console.error("usage: finalize-extras.mjs <extras-run-dir> [--seed <text>] [--dry]");
  process.exit(1);
}

const seed = seedIndex >= 0 ? args[seedIndex + 1] : postPrepareSeed(runDir);
const plan = finalizeExtrasPlan(runDir, { seed });
const results = [];

for (const step of plan) {
  console.log(`\n${"═".repeat(72)}`);
  console.log(`▶ ${step.name} — ${step.why}`);
  console.log(`  node ${step.argv.join(" ")}`);
  console.log("═".repeat(72));
  if (dry) continue;

  const { status, error } = spawnSync(process.execPath, step.argv, {
    cwd: REPO,
    stdio: "inherit",
  });
  if (error) {
    console.error(`\n${step.name} could not run: ${error.message}`);
    process.exit(1);
  }
  results.push({ ...step, status });

  if (status !== 0 && step.fatal) {
    console.error(
      `\n✗ ${step.name} failed (exit ${status}) — stopping here. Everything after it would be ` +
        `measuring the wrong card set.`,
    );
    process.exit(1);
  }
}

if (dry) process.exit(0);

console.log(`\n${"═".repeat(72)}`);
console.log("finalize-extras summary");
for (const { name, status, reportOnly } of results) {
  const verdict =
    status === 0 ? "clean" : reportOnly ? "HAS SOMETHING FOR YOU TO JUDGE" : `exit ${status}`;
  console.log(`  ${status === 0 ? "✓" : "•"} ${name}: ${verdict}`);
}

const toJudge = results.filter((r) => r.status !== 0);
if (toJudge.length > 0) {
  console.log(
    `\nRead the ${toJudge.map((r) => r.name).join(" and ")} output above and decide what to do. ` +
      `Nothing was auto-applied. Re-run this command after your edits.`,
  );
  process.exit(2);
}
console.log("\nEverything clean — the unit is ready for its own gate 1 review link.");
