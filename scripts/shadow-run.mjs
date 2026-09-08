#!/usr/bin/env node
// Shadow-run phase 1 against a chapter that already has a reviewed corpus, and diff the two.
//
// Usage:
//   node scripts/shadow-run.mjs <unitName> [--lang ja] [--dry] [--keep] [--extras]
//   node scripts/shadow-run.mjs --list
//
// --extras runs phase 2 as well, on phase 1's own output, and diffs the COMBINED corpus (base plus
// extras) against the combined reviewed pair. That combined view is the only fair comparison now
// that base units are vocabulary-only: a sentence v1 kept in its base lesson has not been lost if
// v2 put it in the extras sibling, and diffing the halves separately reports exactly that as a
// regression.
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
import { runExtrasPhase, EXTRAS_PHASE_STEPS } from "../src/agents/extrasPhase.js";
import { loadEarlierUnitItems } from "../src/cards/earlierUnits.js";
import { diffItemSets } from "../src/cards/itemSetDiff.js";
import { ROLES } from "../src/agents/roles.js";

const REPO = resolve(join(import.meta.dirname, ".."));
const BOOK = join(REPO, "output/epubs/japanese-for-busy-people-book-1-kana");

const argv = process.argv.slice(2);
const positional = argv.filter((a) => !a.startsWith("--"));
const dry = argv.includes("--dry");
const keep = argv.includes("--keep");
const withExtras = argv.includes("--extras");
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

/** A unit's shipping items, or [] when the unit does not exist (a chapter with no extras sibling). */
function readUnit(name) {
  const file = join(BOOK, name, "cards.json");
  if (!existsSync(file)) return [];
  return (JSON.parse(readFileSync(file, "utf-8")).items ?? []).filter((i) => !i.excluded);
}
const agentSteps = (steps) => steps.filter((s) => s.kind === "agent");
const spends = [
  ...agentSteps(BASE_PHASE_STEPS),
  ...(withExtras ? agentSteps(EXTRAS_PHASE_STEPS) : []),
];
const opus = spends.filter((s) => ROLES[s.role].model === "claude-opus-5").length;

console.log(`unit:     ${unitName}  (${reviewed.length} reviewed card(s))`);
console.log(`chapter:  ${chapterFilePath}`);
if (withExtras) {
  console.log(`extras:   phase 2 will run on phase 1's own output, into the same scratch dir`);
}
console.log(`spends:   ${spends.length} agent step(s), ${opus} of them on Opus`);
for (const s of spends) console.log(`            ${s.id.padEnd(22)} ${ROLES[s.role].model}`);

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
    // Without this the backward judge runs against an empty prior set and reports 0 candidates,
    // which reads exactly like "nothing repeats" while actually meaning "nothing was compared".
    priorItems: loadEarlierUnitItems(BOOK, unitName),
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
// ---------------------------------------------------------------------------------------------
// Phase 2, on phase 1's OWN output rather than the reviewed unit's.
//
// That is the honest shadow: in a real build the extras unit is authored against whatever phase 1
// produced and a human then approved, so feeding it the reviewed corpus instead would measure a
// pipeline that does not exist.
// ---------------------------------------------------------------------------------------------
let extrasResult = null;
if (withExtras) {
  const scratchExtras = join(scratch, `${unitName}-extras`);
  mkdirSync(scratchExtras, { recursive: true });
  console.log(`\nphase 2 -> ${scratchExtras}`);
  try {
    extrasResult = runExtrasPhase({
      unitDir: scratchExtras,
      chapterFilePath,
      chapterHtml: readFileSync(chapterFilePath, "utf-8"),
      baseItems: result.items.filter((i) => !i.excluded),
      earlierItems: loadEarlierUnitItems(BOOK, unitName).filter(
        (i) => !i.__unit.endsWith("-extras"),
      ),
      priorItems: loadEarlierUnitItems(BOOK, `${unitName}-extras`),
      targetLanguage,
      meta: { hints: loadBookHints(meta.epubHash) },
    });
  } catch (error) {
    console.error(`phase 2 failed: ${error.message}`);
    if (!keep) rmSync(scratch, { recursive: true, force: true });
    process.exit(2);
  }
  for (const step of extrasResult.run.steps) {
    const c = step.counts ? ` (${step.counts.in ?? "-"} → ${step.counts.out ?? "-"})` : "";
    console.log(`  · ${step.step.padEnd(22)}${c}`);
  }
}

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

if (extrasResult) {
  const shipping = (items) => (items ?? []).filter((i) => !i.excluded);
  const v1Extras = readUnit(`${unitName}-extras`);
  const v1All = [...reviewed, ...v1Extras];
  const v2All = [...shipping(result.items), ...shipping(extrasResult.items)];
  const both = diffItemSets(v1All, v2All, { languageCode: targetLanguage });

  console.log(`\n── COMBINED: base + extras, v1 vs v2 ──`);
  console.log(`  v1 ${reviewed.length} base + ${v1Extras.length} extras = ${v1All.length}`);
  console.log(
    `  v2 ${shipping(result.items).length} base + ${shipping(extrasResult.items).length} extras = ${v2All.length}`,
  );
  console.log(`  matched ${both.counts.matched}`);
  console.log(`  IN v1, NOT IN v2 (real regressions): ${both.missing.length}`);
  for (const item of both.missing.slice(0, 20))
    console.log(`     - ${item.target}  ${item.english ?? ""}`);
  if (both.missing.length > 20) console.log(`     … ${both.missing.length - 20} more`);
  console.log(`  IN v2, NOT IN v1 (candidate gaps in v1): ${both.extra.length}`);
  for (const item of both.extra.slice(0, 20))
    console.log(`     + ${item.target}  ${item.english ?? ""}`);
  if (both.extra.length > 20) console.log(`     … ${both.extra.length - 20} more`);
}

if (keep) console.log(`\nkept: ${scratchUnit}`);
else rmSync(scratch, { recursive: true, force: true });

console.log(
  `\nRead both directions. A regression is v2 losing something a human kept; a gap is what the ` +
    `rewrite is for. Neither is automatically a defect: the reviewed corpus is one human's answer, ` +
    `not a specification.`,
);
