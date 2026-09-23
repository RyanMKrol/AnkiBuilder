#!/usr/bin/env node
// Builds one chapter of a book's READING collection into a reviewable unit
// (docs/designs/reading-decks/06-reading-extraction.md; the operator procedure is
// .claude/skills/build-reading-deck/SKILL.md).
//
//   node scripts/build-reading.mjs --output-root output {--epub <book.epub> | --book <slug>} --list-lessons
//   node scripts/build-reading.mjs --output-root output {--epub <book.epub> | --book <slug>}
//                                  --lesson <selector> --lang <code> [--dry]
//
// It registers the book's reading collection on first use (`<slug>-reading`, a book plus a deck kind:
// DECISIONS.md), extracts the lesson's chapter to the free cache, and runs the reading phase: three
// readers, a deterministic merge that enforces the card rules, the snapshot, and a coverage adversary
// whose gaps are computed in code. The unit's cards.json is written whole; the next step is the
// content gate in the dashboard.
//
// `--dry` prints the steps, the paths and which paid steps would be reused from an earlier run, and
// spends nothing. A usage-limit stop loses only the step that was running: re-run the same command
// and every finished agent step is reused from disk.

import { existsSync } from "fs";
import { join, resolve } from "path";
import {
  hashEpubFile,
  registerEpub,
  loadBookHints,
  chapterCachePath,
  chapterRangeCachePath,
  loadPriorChapterItems,
  resolveLabelDecoding,
} from "../src/corpus/epubLibrary.js";
import {
  resolveBookSlug,
  materializeBookInOutput,
  resolveBookEpubPath,
  resolveChapterRunDir,
} from "../src/cli/outputPaths.js";
import { withClaim } from "../src/cli/runClaim.js";
import {
  extractChapterToFile,
  extractChapterRangeToFile,
  getBookTitle,
} from "../src/corpus/epubArchive.js";
import { listLessons, resolveLesson } from "../src/corpus/epubLessons.js";
import { READING } from "../src/model/deckKind.js";
import {
  READING_PHASE_STEPS,
  runReadingPhase,
  earlierReadingTargets,
} from "../src/reading/readingPhase.js";
import { readingScheme } from "../src/reading/readingSchemes.js";

const argv = process.argv.slice(2);
const flag = (name) => {
  const at = argv.indexOf(`--${name}`);
  return at === -1 ? null : argv[at + 1];
};
const has = (name) => argv.includes(`--${name}`);

const outputRootArg = flag("output-root");
const epubArg = flag("epub");
const bookArg = flag("book");
const lessonArg = flag("lesson");
const lang = flag("lang");
const dry = has("dry");

function usage(message) {
  if (message) console.error(message);
  console.error(
    "usage: build-reading.mjs --output-root <dir> {--epub <book.epub> | --book <slug>} " +
      "(--list-lessons | --lesson <selector> --lang <code> [--dry])",
  );
  process.exit(1);
}

if (!outputRootArg) usage("--output-root is required");
if (!epubArg === !bookArg) usage("give exactly one of --epub or --book");
const outputRoot = resolve(outputRootArg);
const epubPath = epubArg ? resolve(epubArg) : resolveBookEpubPath(outputRoot, bookArg);
if (!existsSync(epubPath)) usage(`no book at ${epubPath}`);

const labelDecoding = resolveLabelDecoding(epubPath);

if (has("list-lessons")) {
  for (const lesson of listLessons(epubPath, { labelDecoding })) {
    console.log(`[${lesson.number}] ${lesson.label}`);
  }
  process.exit(0);
}
if (!lessonArg || !lang) usage("--lesson and --lang are required to build a chapter");

// Hashed, not registered: a dry run writes nothing, not even to the library.
const epubHash = hashEpubFile(epubPath);
const lesson = resolveLesson(epubPath, lessonArg, { labelDecoding });
const first = lesson.firstChapterNumber;
const last = lesson.lastChapterNumber;
const chapterFilePath =
  last > first ? chapterRangeCachePath(epubHash, first, last) : chapterCachePath(epubHash, first);
const scheme = readingScheme(lang);

console.log(`book:     ${getBookTitle(epubPath) ?? epubPath}`);
console.log(`lesson:   ${lesson.label} (spine ${first}${last > first ? `-${last}` : ""})`);
console.log(
  `language: ${lang}${scheme ? ` (reading plugin: ${scheme.language})` : " (no reading plugin: word cards only)"}`,
);

if (dry) {
  console.log(
    `\nchapter cache: ${chapterFilePath}${existsSync(chapterFilePath) ? "" : " (not yet extracted; free)"}`,
  );
  console.log("\nsteps:");
  for (const [i, step] of READING_PHASE_STEPS.entries()) {
    const paid = step.kind === "agent" ? `  PAID (${step.role})` : "";
    console.log(
      `  ${i + 1}. ${step.id.padEnd(20)} ${step.kind.padEnd(13)} ${step.artifact}${paid}`,
    );
  }
  console.log(
    "\nThe reading collection is registered on the real run, not here. Paid steps whose artifact\n" +
      "already exists in the unit are reused, not re-run.",
  );
  process.exit(0);
}

// The reading collection: its own folder, marker, corpora, parent deck and note type.
registerEpub(epubPath);
const slug = resolveBookSlug(outputRoot, epubPath, epubHash, { deckKind: READING });
materializeBookInOutput(outputRoot, slug, epubPath, epubHash, lang, { deckKind: READING });
const collectionDir = join(outputRoot, "epubs", slug);
console.log(`collection: ${collectionDir}`);

if (!existsSync(chapterFilePath)) {
  if (last > first) extractChapterRangeToFile(epubPath, first, last, chapterFilePath);
  else extractChapterToFile(epubPath, first, chapterFilePath);
}

const unitDir = resolveChapterRunDir(outputRoot, slug, epubHash, first);
if (existsSync(join(unitDir, "cards.json"))) {
  console.log(
    `${join(unitDir, "cards.json")} already exists: this chapter is built. Review it in the ` +
      `dashboard, or delete the unit folder to build it again from scratch.`,
  );
  process.exit(0);
}
console.log(`unit:       ${unitDir}\n`);

const earlier = earlierReadingTargets(
  collectionDir,
  first,
  loadPriorChapterItems(epubHash, first, { deckKind: READING }),
);

const result = await withClaim(
  unitDir,
  { stage: "reading" },
  () =>
    runReadingPhase({
      unitDir,
      chapterFilePath,
      targetLanguage: lang,
      unit: {
        epubHash,
        chapterNumber: first,
        chapterLabel: lesson.label,
        ...(last > first ? { lastChapterNumber: last } : {}),
      },
      hints: loadBookHints(epubHash),
      earlier,
      log: (line) => console.log(line),
    }),
  // A failed run keeps its claim so the retry reclaims this folder rather than allocating another.
  { clearOnFailure: false },
);

console.log(`\n${result.items.length} card(s) written to ${join(unitDir, "cards.json")}`);
if (result.dropped.length) {
  console.log(`${result.dropped.length} item(s) left out by the rules (see reading-report.json):`);
  for (const d of result.dropped.slice(0, 15)) console.log(`  - ${d.target}: ${d.reason}`);
}
if (result.readingConflicts.length) {
  console.log(`${result.readingConflicts.length} word(s) with more than one reading in the book:`);
  for (const c of result.readingConflicts) console.log(`  - ${c.target}: ${c.readings.join(", ")}`);
}
console.log(
  `coverage: the adversary listed ${result.gaps.counts.enumerated}, the unit has ` +
    `${result.gaps.counts.unit}, ${result.gaps.counts.gaps} gap(s)` +
    (result.gaps.gaps.length
      ? `:\n${result.gaps.gaps.map((g) => `  - ${g.target}${g.english ? ` (${g.english})` : ""}`).join("\n")}`
      : ""),
);
if (!result.verdict.ok) {
  console.error(`\nthe run did not verify:\n  ${result.verdict.problems.join("\n  ")}`);
  process.exit(2);
}
console.log(
  "\nNext: review the chapter in the dashboard (the content gate), then generate its audio.",
);
