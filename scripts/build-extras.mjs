#!/usr/bin/env node
// Phase 2: an APPROVED base unit to a reviewable extras corpus, in one command.
//
// Usage:
//   node scripts/build-extras.mjs <baseUnitDir> <extrasUnitDir> --lang <code> [--dry] [--no-prepare]
//
// It chains into `prepare` when the phase succeeds, exactly as `assemble` does, so the unit arrives
// reviewable rather than as a corpus somebody still has to finish.
//
// The base unit must be REVIEWED. Phase 2 exists to show approved vocabulary at work, and running it
// against an unreviewed base means every sentence rests on words a human may still cut, which is how
// v1's extras units ended up audited against a card set that no longer existed.
//
// ⚠️ It SPENDS: up to five agent steps, plus whatever `prepare` costs after them. --dry first.
import { existsSync, readFileSync, mkdirSync } from "fs";
import { dirname, join, resolve } from "path";
import {
  chapterCachePath,
  chapterRangeCachePath,
  loadBookHints,
} from "../src/corpus/epubLibrary.js";
import { EXTRAS_PHASE_STEPS, runExtrasPhase, extrasUnitMeta } from "../src/agents/extrasPhase.js";
import { ROLES } from "../src/agents/roles.js";
import { parseUnitDir } from "../src/model/unitDir.js";
import { loadEarlierUnitItems } from "../src/cards/earlierUnits.js";

const argv = process.argv.slice(2);
const positional = argv.filter((a) => !a.startsWith("--"));
const dry = argv.includes("--dry");
const noPrepare = argv.includes("--no-prepare");
const langAt = argv.indexOf("--lang");
const targetLanguage = langAt === -1 ? null : argv[langAt + 1];

if (positional.length < 2 || !targetLanguage) {
  console.error(
    "usage: build-extras.mjs <baseUnitDir> <extrasUnitDir> --lang <code> [--dry] [--no-prepare]",
  );
  process.exit(1);
}

const baseDir = resolve(positional[0]);
const extrasDir = resolve(positional[1]);
const cardsPath = join(baseDir, "cards.json");
if (!existsSync(cardsPath)) {
  console.error(`no base unit at ${cardsPath}`);
  process.exit(1);
}

const cards = JSON.parse(readFileSync(cardsPath, "utf-8"));
const meta = cards.meta ?? {};
if (!meta.reviewed) {
  console.error(
    `${baseDir} is not reviewed. Phase 2 shows APPROVED vocabulary at work; running it now means ` +
      `every sentence rests on words a human may still cut.`,
  );
  process.exit(2);
}

const chapterFilePath =
  typeof meta.lastChapterNumber === "number" && meta.lastChapterNumber > meta.chapterNumber
    ? chapterRangeCachePath(meta.epubHash, meta.chapterNumber, meta.lastChapterNumber)
    : chapterCachePath(meta.epubHash, meta.chapterNumber);
if (!existsSync(chapterFilePath)) {
  console.error(`chapter not cached at ${chapterFilePath}`);
  process.exit(2);
}

const baseItems = (cards.items ?? []).filter((i) => !i.excluded);

// Every earlier lesson of this collection, so the vocabulary rule is judged against what the learner
// has actually met rather than against this chapter alone.
const collection = dirname(baseDir);
const thisNumber = parseUnitDir(baseDir.split("/").pop())?.number ?? Infinity;
const earlierItems = [];
for (const name of (await import("fs")).readdirSync(collection)) {
  const unit = parseUnitDir(name);
  if (!unit || unit.extras || unit.number >= thisNumber) continue;
  const f = join(collection, name, "cards.json");
  if (!existsSync(f)) continue;
  earlierItems.push(
    ...(JSON.parse(readFileSync(f, "utf-8")).items ?? []).filter((i) => !i.excluded),
  );
}

const spends = EXTRAS_PHASE_STEPS.filter((s) => s.kind === "agent");
console.log(`base:    ${baseDir}  (${baseItems.length} approved card(s))`);
console.log(
  `earlier: ${earlierItems.length} card(s) from ${thisNumber === Infinity ? "?" : thisNumber} earlier unit(s)`,
);
console.log(`chapter: ${chapterFilePath}`);

if (dry) {
  console.log();
  for (const [i, step] of EXTRAS_PHASE_STEPS.entries()) {
    const role = step.role ? ROLES[step.role] : null;
    console.log(
      `${String(i + 1).padStart(2)}. ${step.id.padEnd(22)} ${step.kind.padEnd(14)} → ${step.artifact}` +
        (role ? `  [${role.model} / ${role.effort}]` : ""),
    );
  }
  console.log(
    `\n${spends.length} of ${EXTRAS_PHASE_STEPS.length} steps spend. Re-run without --dry.`,
  );
  process.exit(0);
}

mkdirSync(extrasDir, { recursive: true });
const result = runExtrasPhase({
  unitDir: extrasDir,
  chapterFilePath,
  chapterHtml: readFileSync(chapterFilePath, "utf-8"),
  baseItems,
  earlierItems,
  targetLanguage,
  meta: { hints: loadBookHints(meta.epubHash), unit: extrasUnitMeta(meta) },
  // Distinct from `earlierItems` above, which is the vocabulary the miners may USE and deliberately
  // excludes extras units. This is prior art for the backward judge and must include them.
  priorItems: loadEarlierUnitItems(collection, extrasDir.split("/").pop()),
});

for (const step of result.run.steps) {
  const c = step.counts ? ` (${step.counts.in ?? "-"} → ${step.counts.out ?? "-"})` : "";
  console.log(`  ${step.status === "ok" ? "·" : "!"} ${step.step.padEnd(22)}${c}`);
}

console.log(
  `\n${result.items.length} extras card(s); the inventive author's allowance was ${result.allowance}.`,
);
if (result.unteachable.length) {
  console.log(
    `${result.unteachable.length} sentence(s) appear to use an untaught word — read them before the ` +
      `review: ${result.unteachable
        .slice(0, 3)
        .map((u) => `${u.target} (${u.residue})`)
        .join(", ")}`,
  );
}
if (result.unfillable.length)
  console.log(`${result.unfillable.length} gap(s) left open for want of taught vocabulary.`);
if (result.reinvented.length)
  console.log(`${result.reinvented.length} invented sentence(s) repeat a mined one.`);
if (result.senseCollisions.length) {
  console.log(`${result.senseCollisions.length} target(s) carry more than one sense and are KEPT.`);
}

if (!result.verdict.ok) {
  console.error(`\nthis run cannot be handed to a review:`);
  for (const problem of result.verdict.problems) console.error(`  ✗ ${problem}`);
  process.exit(2);
}
for (const note of result.verdict.notes) console.log(`  · ${note}`);
console.log(`\nverified against its own artifacts.`);

// ── into prepare, so a phase-2 unit has no resting state between corpus and reviewable ──────────
//
// `assemble` chains into `prepare` for a reason it states plainly: corpus.json is not a place a
// lesson stops, and a unit that halts there is a half-built unit nobody can sign off on. Phase 2 had
// the same shape and not the same chaining, so building an extras unit was two commands and the
// second was easy to forget. The review gate would then refuse the unit, correctly, and the operator
// would be looking at a corpus wondering why.
//
// Same escape hatch as assemble's, and for the same reason: `--no-prepare` for a debugging run,
// which says plainly that the unit is not reviewable yet.
if (noPrepare) {
  console.log(
    `--no-prepare given: stopping at corpus.json. ${extrasDir} is NOT reviewable yet.\n` +
      `  finish it with:  anki-builder prepare --run ${extrasDir}`,
  );
  process.exit(0);
}

console.log(`\nprepare: translating and running the cross-lesson passes…`);
const { runCli } = await import("../src/cli/index.js");
await runCli(["prepare", "--run", extrasDir]);
console.log(`\nNext: the extras corpus review for ${extrasDir}`);
