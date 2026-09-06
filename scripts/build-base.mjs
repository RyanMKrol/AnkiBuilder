#!/usr/bin/env node
// Phase 1: a chapter to a reviewable base-vocabulary corpus, in one command.
//
// Usage:
//   node scripts/build-base.mjs <unitDir> <epubHash> <chapterNumber> --lang <code>
//   --dry     print the ordered steps and what each would write, and spend nothing
//
// The steps live in src/agents/basePhase.js as DATA, and this file only drives them. That split is
// deliberate: an ordering constraint that lives in a script is a constraint nothing can assert, and
// three of the constraints here are load-bearing (raw material before judgement, the merge before
// the snapshot, the adversary last and never shown the corpus).
//
// ⚠️ It SPENDS: four agent steps, one of them pinned to a higher model. --dry first.
import { existsSync, readFileSync, mkdirSync } from "fs";
import { resolve } from "path";
import {
  chapterCachePath,
  chapterRangeCachePath,
  loadBookHints,
} from "../src/corpus/epubLibrary.js";
import { BASE_PHASE_STEPS, runBasePhase } from "../src/agents/basePhase.js";
import { ROLES } from "../src/agents/roles.js";

const argv = process.argv.slice(2);
const positional = argv.filter((a) => !a.startsWith("--"));
const dry = argv.includes("--dry");
const langAt = argv.indexOf("--lang");
const targetLanguage = langAt === -1 ? null : argv[langAt + 1];

if (positional.length < 3 || !targetLanguage) {
  console.error("usage: build-base.mjs <unitDir> <epubHash> <chapterNumber> --lang <code> [--dry]");
  process.exit(1);
}

const [unitDirArg, epubHash, chapterArg] = positional;
const unitDir = resolve(unitDirArg);
const chapterNumber = Number(chapterArg);
const lastArg = positional[3] ? Number(positional[3]) : null;
const chapterFilePath =
  lastArg && lastArg > chapterNumber
    ? chapterRangeCachePath(epubHash, chapterNumber, lastArg)
    : chapterCachePath(epubHash, chapterNumber);

if (!existsSync(chapterFilePath)) {
  console.error(
    `chapter not cached at ${chapterFilePath} — it is a free re-inflate of the EPUB, so extract it first`,
  );
  process.exit(2);
}

const hints = loadBookHints(epubHash);

if (dry) {
  console.log(`unit:    ${unitDir}`);
  console.log(`chapter: ${chapterFilePath}`);
  console.log(
    `hints:   ${Object.keys(hints).length ? Object.keys(hints).join(", ") : "none recorded"}\n`,
  );
  for (const [i, step] of BASE_PHASE_STEPS.entries()) {
    const role = step.role ? ROLES[step.role] : null;
    const pin = role ? `  [${role.model} / ${role.effort}]` : "";
    console.log(
      `${String(i + 1).padStart(2)}. ${step.id.padEnd(20)} ${step.kind.padEnd(14)} → ${step.artifact}${pin}`,
    );
  }
  const spends = BASE_PHASE_STEPS.filter((s) => s.kind === "agent").length;
  console.log(
    `\n${spends} of ${BASE_PHASE_STEPS.length} steps spend. Re-run without --dry to build.`,
  );
  process.exit(0);
}

mkdirSync(unitDir, { recursive: true });
const result = runBasePhase({
  unitDir,
  chapterFilePath,
  chapterHtml: readFileSync(chapterFilePath, "utf-8"),
  targetLanguage,
  meta: { hints },
});

for (const step of result.run.steps) {
  const counts = step.counts ? ` (${step.counts.in ?? "-"} → ${step.counts.out ?? "-"})` : "";
  console.log(`  ${step.status === "ok" ? "·" : "!"} ${step.step.padEnd(20)}${counts}`);
}

console.log(`\n${result.items.length} candidate item(s).`);
if (result.senseCollisions.length) {
  console.log(
    `${result.senseCollisions.length} target(s) carry more than one sense and are KEPT: ` +
      result.senseCollisions.map((c) => c.target).join(", "),
  );
}
if (result.gaps.counts.gaps) {
  console.log(
    `${result.gaps.counts.gaps} coverage gap(s) the adversary found and the corpus lacks — read ` +
      `candidates/coverage.json before the review.`,
  );
}
if (result.unreadable.length) {
  console.log(`${result.unreadable.length} image(s) came back UNREADABLE — go and look at them.`);
}

if (!result.verdict.ok) {
  console.error(`\nthis run cannot be handed to a review:`);
  for (const problem of result.verdict.problems) console.error(`  ✗ ${problem}`);
  process.exit(2);
}
for (const note of result.verdict.notes) console.log(`  · ${note}`);
console.log(`\nverified against its own artifacts. Next: the corpus review for ${unitDir}`);
