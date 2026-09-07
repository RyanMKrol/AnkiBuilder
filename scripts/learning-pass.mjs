#!/usr/bin/env node
// Reads a unit's review back against the corpus its roles generated.
//
// Usage:
//   node scripts/learning-pass.mjs <unitDir> [--lang ja] [--json]
//
// Moving extraction to agents removed the eval fixtures' replay seam for that half of the pipeline.
// What replaces it is the reviewer, who already looks at every card and already excludes and edits.
// Those actions are ground truth about where a role was wrong, they cost nothing extra, and this is
// what reads them back.
//
// Strictly read-only. It reports; changing a prompt on the strength of it is a human's call.
import { existsSync, readFileSync } from "fs";
import { join, resolve } from "path";
import { readSnapshot } from "../src/agents/snapshot.js";
import { learnFromReview, describeLearning } from "../src/agents/learningPass.js";

const argv = process.argv.slice(2);
const positional = argv.filter((a) => !a.startsWith("--"));
const asJson = argv.includes("--json");
const langAt = argv.indexOf("--lang");
const languageCode = langAt === -1 ? null : argv[langAt + 1];

if (positional.length === 0) {
  console.error("usage: learning-pass.mjs <unitDir> [--lang ja] [--json]");
  process.exit(1);
}

const unitDir = resolve(positional[0]);
const cardsPath = join(unitDir, "cards.json");
if (!existsSync(cardsPath)) {
  console.error(`no cards.json at ${cardsPath}`);
  process.exit(1);
}

const snapshot = readSnapshot(unitDir);
if (!snapshot) {
  console.error(
    `${unitDir} has no as-generated.json. The snapshot is written by the phase script BEFORE the ` +
      `review, so a unit built by v1 has none and cannot be learned from. That is a gap in the ` +
      `record, not an error.`,
  );
  process.exit(2);
}

const approved = JSON.parse(readFileSync(cardsPath, "utf-8"));
if (approved.meta?.reviewed !== true) {
  console.error(`${unitDir} is not reviewed yet, so there are no corrections to learn from.`);
  process.exit(2);
}

const report = learnFromReview(snapshot, approved, {
  languageCode: languageCode ?? approved.meta?.targetLanguage,
});

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

console.log(`unit:  ${unitDir}`);
console.log(`phase: ${report.phase ?? "(unrecorded)"}\n`);
console.log(describeLearning(report));

for (const [role, r] of Object.entries(report.byRole)) {
  if (!r.excludedByHuman.length) continue;
  console.log(`\n${role} — cut by a human:`);
  for (const cut of r.excludedByHuman.slice(0, 10)) {
    console.log(`   ${cut.target}${cut.reason ? `  (${cut.reason})` : ""}`);
  }
}
