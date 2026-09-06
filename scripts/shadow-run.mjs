#!/usr/bin/env node
// Shadow-run phase 1 against a chapter that already has a reviewed corpus, and diff the two.
//
// Usage:
//   node scripts/shadow-run.mjs <unitName> [--lang ja] [--dry] [--keep]
//   node scripts/shadow-run.mjs --list
//
// WHY THIS IS THE CHEAPEST VALIDATION AVAILABLE. The book has 33 reviewed units, and a reviewed
// corpus is a human's own answer to "what should this chapter have produced". That ground truth is
// already paid for, so comparing a fresh phase-1 run against it costs only the run.
//
// READ THE DIFF IN BOTH DIRECTIONS. Items v2 found that the reviewed corpus lacks are candidate GAPS
// in v1, which is the reason for the rewrite. Items the reviewed corpus has that v2 missed are
// REGRESSIONS in v2, and they are the half most likely to go unlooked-at, because the natural
// instinct is to search only for improvements.
//
// ⚠️ IT WRITES NOWHERE NEAR THE DECK. Everything lands in a scratch directory outside the repo. The
// reviewed corpora are what this is judged against and V2-MIGRATION.md forbids the v2 branch from
// touching output/ or .anki-builder/ at all, so the run is given a throwaway unit dir and the real
// one is only ever READ.
import { existsSync, readFileSync, mkdirSync, mkdtempSync, rmSync, readdirSync } from "fs";
import { join, resolve } from "path";
import { tmpdir } from "os";
import {
  chapterCachePath,
  chapterRangeCachePath,
  loadBookHints,
} from "../src/corpus/epubLibrary.js";
import { runBasePhase, BASE_PHASE_STEPS } from "../src/agents/basePhase.js";
import { diffItemSets } from "../src/cards/itemSetDiff.js";
import { ROLES } from "../src/agents/roles.js";

const REPO = resolve(join(import.meta.dirname, ".."));
const BOOK = join(REPO, "output/epubs/japanese-for-busy-people-book-1-kana");

const argv = process.argv.slice(2);
const positional = argv.filter((a) => !a.startsWith("--"));
const dry = argv.includes("--dry");
const keep = argv.includes("--keep");
const langAt = argv.indexOf("--lang");
const targetLanguage = langAt === -1 ? "ja" : argv[langAt + 1];

const reviewedUnits = () =>
  readdirSync(BOOK)
    .filter((n) => /^chapter-\d+$/.test(n))
    .filter((n) => {
      const f = join(BOOK, n, "cards.json");
      return existsSync(f) && JSON.parse(readFileSync(f, "utf-8")).meta?.reviewed;
    })
    .sort();

if (argv.includes("--list")) {
  console.log(reviewedUnits().join("\n"));
  process.exit(0);
}
if (positional.length === 0) {
  console.error("usage: shadow-run.mjs <unitName> [--lang ja] [--dry] [--keep] | --list");
  process.exit(1);
}

const unitName = positional[0];
const realUnit = join(BOOK, unitName);
const cardsPath = join(realUnit, "cards.json");
if (!existsSync(cardsPath)) {
  console.error(`no reviewed unit at ${cardsPath} — try --list`);
  process.exit(1);
}

const cards = JSON.parse(readFileSync(cardsPath, "utf-8"));
const meta = cards.meta ?? {};
const chapterFilePath =
  typeof meta.lastChapterNumber === "number" && meta.lastChapterNumber > meta.chapterNumber
    ? chapterRangeCachePath(meta.epubHash, meta.chapterNumber, meta.lastChapterNumber)
    : chapterCachePath(meta.epubHash, meta.chapterNumber);

if (!existsSync(chapterFilePath)) {
  console.error(`chapter not cached at ${chapterFilePath}`);
  process.exit(2);
}

// The reviewed corpus, minus what a human dropped: an excluded card is a decision, not a miss, and
// counting it as one would send a reviewer to re-add exactly what they just cut.
const reviewed = (cards.items ?? []).filter((i) => !i.excluded);
const spends = BASE_PHASE_STEPS.filter((s) => s.kind === "agent");

console.log(`unit:     ${unitName}  (${reviewed.length} reviewed card(s))`);
console.log(`chapter:  ${chapterFilePath}`);
console.log(
  `spends:   ${spends.length} agent step(s) — ${spends.map((s) => `${s.id}[${ROLES[s.role].model}]`).join(", ")}`,
);

if (dry) {
  console.log(`\n--dry: nothing run. Re-run without it to spend ${spends.length} model call(s).`);
  process.exit(0);
}

const scratch = mkdtempSync(join(tmpdir(), "shadow-"));
const scratchUnit = join(scratch, unitName);
mkdirSync(scratchUnit, { recursive: true });
console.log(`scratch:  ${scratchUnit}\n`);

let result;
try {
  result = runBasePhase({
    unitDir: scratchUnit,
    chapterFilePath,
    chapterHtml: readFileSync(chapterFilePath, "utf-8"),
    targetLanguage,
    meta: { hints: loadBookHints(meta.epubHash) },
  });
} catch (error) {
  console.error(`phase 1 failed: ${error.message}`);
  if (!keep) rmSync(scratch, { recursive: true, force: true });
  process.exit(2);
}

for (const step of result.run.steps) {
  const c = step.counts ? ` (${step.counts.in ?? "-"} → ${step.counts.out ?? "-"})` : "";
  console.log(`  · ${step.step.padEnd(20)}${c}`);
}

// Reference = the human's answer, candidate = this run. `missing` is therefore what a human kept and
// v2 did not produce: the regressions. `extra` is what v2 found and the reviewed corpus lacks.
const diff = diffItemSets(reviewed, result.items, { languageCode: targetLanguage });

console.log(`\n── shadow diff: ${unitName} ──`);
console.log(
  `  reviewed ${reviewed.length} · produced ${result.items.length} · matched ${diff.counts.matched}`,
);
console.log(`  REGRESSIONS (reviewed, not produced): ${diff.missing.length}`);
for (const item of diff.missing.slice(0, 12))
  console.log(`     - ${item.target}  ${item.english ?? ""}`);
if (diff.missing.length > 12) console.log(`     … ${diff.missing.length - 12} more`);
console.log(`  CANDIDATE GAPS IN v1 (produced, not reviewed): ${diff.extra.length}`);
for (const item of diff.extra.slice(0, 12))
  console.log(`     + ${item.target}  ${item.english ?? ""}`);
if (diff.extra.length > 12) console.log(`     … ${diff.extra.length - 12} more`);
console.log(`  adversary gaps against THIS run: ${result.gaps.counts.gaps}`);

if (keep) console.log(`\nkept: ${scratchUnit}`);
else rmSync(scratch, { recursive: true, force: true });

console.log(
  `\nRead both directions. A regression is v2 losing something a human kept; a gap is what the ` +
    `rewrite is for. Neither is automatically a defect: the reviewed corpus is one human's answer, ` +
    `not a specification.`,
);
