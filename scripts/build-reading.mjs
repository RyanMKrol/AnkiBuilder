#!/usr/bin/env node
// Builds one chapter of a book's READING collection into a reviewable unit
// (docs/designs/reading-decks/06-reading-extraction.md; the operator procedure is
// .claude/skills/build-reading-deck/SKILL.md).
//
//   node scripts/build-reading.mjs --output-root output {--epub <book.epub> | --book <slug>} --list-lessons
//   node scripts/build-reading.mjs --output-root output {--epub <book.epub> | --book <slug>}
//                                  --lesson <selector> --lang <code> [--dry | --remerge]
//                                  [--deck-name "<short name>"]
//   node scripts/build-reading.mjs --output-root output {--epub <book.epub> | --book <slug>}
//                                  --book-pass --lang <code> [--dry]
//
// It registers the book's reading collection on first use (`<slug>-reading`, a book plus a deck kind:
// DECISIONS.md), extracts the lesson's chapter to the free cache, and runs the reading phase: three
// readers, a deterministic merge that enforces the card rules, the snapshot, and a coverage adversary
// whose gaps are computed in code. The unit's cards.json is written whole; the next step is the
// content gate in the dashboard.
//
// `--dry` prints the steps, the paths and which paid steps would be reused from an earlier run, and
// spends nothing. `--remerge` re-runs the merge of a built but UNREVIEWED chapter from its saved
// agent output, for free: what to do after a rule in the merge changes. It refuses a reviewed one.
// `--deck-name` sets the Anki deck the collection is filed under (a converted book's own title is
// long); it can be given on any run until the collection is first delivered. A usage-limit stop
// loses only the step that was running: re-run the same command and every finished agent step is
// reused from disk.
//
// `--book-pass` builds every chapter in book order and then the kana unit, for a language whose
// reading scheme has a kana deck (Japanese): chapters card kanji only, and the kana words of the
// whole book are chosen once (src/reading/kanaDeck.js). A chapter already built is reused; one merged
// before the kana deck existed and not reviewed by a person is re-merged for free. With `--dry` it
// prints what would be read and, once every chapter is read, the kana deck it would choose.

import { existsSync, readFileSync, readdirSync, rmSync } from "fs";
import { join, resolve } from "path";
import {
  hashEpubFile,
  registerEpub,
  loadBookHints,
  chapterCachePath,
  chapterRangeCachePath,
  loadPriorChapterItems,
  resolveLabelDecoding,
  loadBookMeta,
  bookSlugForKind,
} from "../src/corpus/epubLibrary.js";
import {
  resolveBookSlug,
  materializeBookInOutput,
  resolveBookEpubPath,
  resolveChapterRunDir,
  setCollectionDeckName,
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
  laterBuiltChapters,
} from "../src/reading/readingPhase.js";
import { readingScheme } from "../src/reading/readingSchemes.js";
import { buildKanaUnit, collectKanaPool, KANA_CHAPTER_NUMBER } from "../src/reading/kanaDeck.js";
import { selectKanaDeck, kanaScript } from "../src/reading/kanaUnits.js";

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
const remerge = has("remerge");
const deckNameArg = flag("deck-name");
const bookPass = has("book-pass");

function usage(message) {
  if (message) console.error(message);
  console.error(
    "usage: build-reading.mjs --output-root <dir> {--epub <book.epub> | --book <slug>} " +
      "(--list-lessons | --lesson <selector> --lang <code> [--dry | --remerge] | " +
      "--book-pass --lang <code> [--dry])",
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
if (!lang || (!lessonArg && !bookPass)) {
  usage("--lang, and --lesson or --book-pass, are required to build");
}

// Hashed, not registered: a dry run writes nothing, not even to the library.
const epubHash = hashEpubFile(epubPath);
const scheme = readingScheme(lang);
const hints = () => loadBookHints(epubHash);

console.log(`book:     ${getBookTitle(epubPath) ?? epubPath}`);
console.log(
  `language: ${lang}${scheme ? ` (reading plugin: ${scheme.language})` : " (no reading plugin: word cards only)"}`,
);

const cachePathFor = (lesson) =>
  lesson.lastChapterNumber > lesson.firstChapterNumber
    ? chapterRangeCachePath(epubHash, lesson.firstChapterNumber, lesson.lastChapterNumber)
    : chapterCachePath(epubHash, lesson.firstChapterNumber);

/** The reading collection: its own folder, marker, corpora, parent deck and note type. */
function registerCollection() {
  registerEpub(epubPath);
  const slug = resolveBookSlug(outputRoot, epubPath, epubHash, { deckKind: READING });
  materializeBookInOutput(outputRoot, slug, epubPath, epubHash, lang, { deckKind: READING });
  const collectionDir = join(outputRoot, "epubs", slug);
  console.log(`collection: ${collectionDir}`);
  if (deckNameArg) {
    const { changed, deckName } = setCollectionDeckName(collectionDir, deckNameArg);
    console.log(`deck name:  ${deckName}${changed ? " (set)" : ""}`);
  }
  return { slug, collectionDir };
}

const readJsonOrNull = (path) => {
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return null;
  }
};

/** Deletes what the merge and the adversary diff wrote, keeping the agents' own output. */
function clearMerge(unitDir) {
  for (const file of ["cards.json", "corpus.json", "reading-report.json", "as-generated.json"]) {
    rmSync(join(unitDir, file), { force: true });
  }
  rmSync(join(unitDir, "candidates", "coverage.json"), { force: true });
}

/**
 * Builds one chapter. Returns an exit code: 0 built or already built, 2 refused or did not verify.
 * `remerge` re-runs the merge from saved agent output; a unit a person reviewed is refused.
 */
async function buildChapter(
  lesson,
  { slug, collectionDir, unitDir: knownDir = null, remerge: redo = false, quiet = false },
) {
  const first = lesson.firstChapterNumber;
  const last = lesson.lastChapterNumber;
  const chapterFilePath = cachePathFor(lesson);
  console.log(`\nlesson:   ${lesson.label} (spine ${first}${last > first ? `-${last}` : ""})`);
  if (!existsSync(chapterFilePath)) {
    if (last > first) extractChapterRangeToFile(epubPath, first, last, chapterFilePath);
    else extractChapterToFile(epubPath, first, chapterFilePath);
  }
  // Resolved ONCE per chapter: resolving reserves a new folder with a claim in this process's name,
  // so a second resolve in the same run finds a live claim and refuses. The book pass resolves it
  // first to see whether the chapter needs re-merging, and passes it in.
  const unitDir = knownDir ?? resolveChapterRunDir(outputRoot, slug, epubHash, first);
  if (redo && existsSync(join(unitDir, "cards.json"))) {
    const cards = JSON.parse(readFileSync(join(unitDir, "cards.json"), "utf-8"));
    // A unit with no cards was marked reviewed by the phase itself (a chapter with no kanji): there
    // is no human review to lose, so it re-merges like an unreviewed one.
    if (cards.meta?.reviewed === true && (cards.items ?? []).length > 0) {
      console.error(
        `${unitDir} is reviewed. Re-merging it would discard the review; withdraw the review in the ` +
          `dashboard first if the merge really has to change.`,
      );
      return 2;
    }
    clearMerge(unitDir);
    console.log(`re-merging ${unitDir} from its saved agent output`);
  }
  if (existsSync(join(unitDir, "cards.json"))) {
    console.log(
      `${join(unitDir, "cards.json")} already exists: this chapter is built. Review it in the ` +
        `dashboard; --remerge to re-run the merge after a rule change (free); or delete the unit ` +
        `folder to build it again from scratch.`,
    );
    return 0;
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
        hints: hints(),
        earlier,
        log: (line) => console.log(line),
      }),
    // A failed run keeps its claim so the retry reclaims this folder rather than allocating another.
    { clearOnFailure: false },
  );

  const kanaWords = (result.dropped ?? []).filter((d) => /kana deck/.test(d.reason)).length;
  console.log(
    `\n${result.items.length} card(s) written to ${join(unitDir, "cards.json")}` +
      (kanaWords ? `; ${kanaWords} kana word(s) set aside for the kana deck` : ""),
  );
  const ruled = result.dropped.filter((d) => !/kana deck/.test(d.reason));
  if (ruled.length && !quiet) {
    console.log(`${ruled.length} item(s) left out by the rules (see reading-report.json):`);
    for (const d of ruled.slice(0, 15)) console.log(`  - ${d.target}: ${d.reason}`);
  }
  if (result.readingConflicts.length) {
    console.log(
      `${result.readingConflicts.length} word(s) with more than one reading in the book:`,
    );
    for (const c of result.readingConflicts) {
      console.log(`  - ${c.target}: ${c.readings.join(", ")}`);
    }
  }
  console.log(
    `coverage: the adversary listed ${result.gaps.counts.enumerated}, the unit has ` +
      `${result.gaps.counts.unit}, ${result.gaps.counts.gaps} gap(s)` +
      (result.gaps.gaps.length
        ? `:\n${result.gaps.gaps.map((g) => `  - ${g.target}${g.english ? ` (${g.english})` : ""}`).join("\n")}`
        : ""),
  );
  // Built out of book order: the later chapters were merged without this one, so a written form both
  // teach is now carded twice. Re-merging them is free and fixes it; preflight would catch it anyway.
  const later = laterBuiltChapters(collectionDir, first);
  if (later.length && !bookPass) {
    console.log(
      `\nBUILT OUT OF ORDER: ${later.length} later chapter(s) were built before this one and do not ` +
        `know what it cards. Re-merge each (free), in book order:`,
    );
    for (const unit of later) {
      console.log(
        unit.reviewed
          ? `  - ${unit.label}: reviewed, so it is not re-merged automatically; preflight will name any repeat`
          : `  - ${unit.label}: node scripts/build-reading.mjs --output-root ${outputRootArg} ` +
              `--epub <book> --lesson "${unit.label}" --lang ${lang} --remerge`,
      );
    }
  }
  if (!result.verdict.ok) {
    console.error(`\nthe run did not verify:\n  ${result.verdict.problems.join("\n  ")}`);
    return 2;
  }
  return 0;
}

/** Prints what a kana deck choice holds: counts, and the sounds under the minimum. */
function describeKanaChoice({
  selected,
  perScript,
  budgets,
  minPerUnit,
  coverage,
  short,
  unselected,
}) {
  console.log(
    `kana deck: ${selected} word(s): ${perScript.hiragana} hiragana (budget ${budgets.hiragana}), ` +
      `${perScript.katakana} with katakana (budget ${budgets.katakana}); ${unselected.length} left out`,
  );
  const under = Object.entries(coverage).filter(([u, n]) => n < minPerUnit && !short.includes(u));
  if (under.length) {
    console.log(`  sounds under ${minPerUnit}: ${under.map(([u, n]) => `${u}×${n}`).join(" ")}`);
  }
  if (short.length) {
    console.log(
      `  sounds the whole book has fewer than ${minPerUnit} words for: ${short.join(" ")}`,
    );
  }
}

if (bookPass) {
  if (!scheme?.kanaDeck) usage(`--book-pass needs a language whose reading scheme has a kana deck`);
  const lessons = listLessons(epubPath, { labelDecoding });

  if (dry) {
    // The slug the library already recorded for this book's reading collection, if any: a dry run
    // registers nothing, so it only looks.
    const slug = bookSlugForKind(loadBookMeta(epubHash), READING) ?? null;
    const collectionDir = slug ? join(outputRoot, "epubs", slug) : null;
    const byNumber = new Map();
    if (collectionDir && existsSync(collectionDir)) {
      for (const name of readdirSync(collectionDir)) {
        const meta = readJsonOrNull(join(collectionDir, name, "corpus.json"))?.meta;
        if (meta?.epubHash === epubHash)
          byNumber.set(meta.chapterNumber, join(collectionDir, name));
      }
    }
    const agentSteps = READING_PHASE_STEPS.filter((st) => st.kind === "agent");
    let calls = 0;
    console.log(`\n${lessons.length} chapter(s):`);
    for (const lesson of lessons) {
      const dir = byNumber.get(lesson.firstChapterNumber);
      const todo = agentSteps.filter((st) => !dir || !existsSync(join(dir, st.artifact))).length;
      const merged =
        dir && Array.isArray(readJsonOrNull(join(dir, "reading-report.json"))?.kanaPool);
      const cards = dir && readJsonOrNull(join(dir, "cards.json"));
      const reviewed = cards?.meta?.reviewed === true && (cards.items ?? []).length > 0;
      const state = merged
        ? ", merged"
        : reviewed
          ? ", REVIEWED before the kana deck: withdraw its review to re-merge it"
          : dir && !todo
            ? ", to re-merge (free)"
            : "";
      calls += todo;
      console.log(`  ${lesson.label}: ${todo ? `${todo} paid call(s)` : "read"}${state}`);
    }
    console.log(`\nabout ${calls} paid call(s) to read the rest of the book, then the kana deck.`);
    if (collectionDir) {
      const { pool, missing } = collectKanaPool(collectionDir);
      if (pool.length) {
        const { budgets, minPerUnit } = scheme.kanaDeck;
        const choice = selectKanaDeck(pool, { budgets, minPerUnit });
        const perScript = { hiragana: 0, katakana: 0 };
        for (const e of choice.selected) perScript[kanaScript(e.target)]++;
        console.log(
          `\nfrom the ${pool.length} kana word(s) merged so far` +
            (missing.length ? ` (${missing.length} chapter(s) not yet merged)` : "") +
            ":",
        );
        describeKanaChoice({
          ...choice,
          selected: choice.selected.length,
          perScript,
          budgets,
          minPerUnit,
        });
      }
    }
    process.exit(0);
  }

  const { slug, collectionDir } = registerCollection();
  const failed = [];
  for (const lesson of lessons) {
    const unitDir = resolveChapterRunDir(outputRoot, slug, epubHash, lesson.firstChapterNumber);
    const report = readJsonOrNull(join(unitDir, "reading-report.json"));
    const cards = readJsonOrNull(join(unitDir, "cards.json"));
    // Merged before the kana deck existed: re-merge it (free) so its kana words reach the pool. A
    // chapter a person reviewed is left alone and named; preflight's reading-kana-in-chapter will
    // name any kana word it still cards.
    const stale = cards && !Array.isArray(report?.kanaPool);
    const humanReviewed = cards?.meta?.reviewed === true && (cards.items ?? []).length > 0;
    if (stale && humanReviewed) {
      console.log(
        `\n${lesson.label}: reviewed before the kana deck existed, so it is not re-merged; ` +
          `withdraw its review and re-run to move its kana words to the kana deck`,
      );
      continue;
    }
    // One chapter's failure does not stop the pass: the others are still worth reading, and a re-run
    // retries only what is missing. A usage limit does stop it, since every chapter after it would
    // fail the same way.
    try {
      const code = await buildChapter(lesson, {
        slug,
        collectionDir,
        unitDir,
        remerge: stale,
        quiet: true,
      });
      if (code !== 0) failed.push(`${lesson.label}: did not verify`);
    } catch (error) {
      if (error.quotaExhausted) {
        console.error(`\n${error.message}`);
        process.exit(1);
      }
      console.error(`\n${lesson.label} FAILED: ${error.message}`);
      failed.push(`${lesson.label}: ${error.message.split("\n")[0]}`);
    }
  }
  // The kana deck is chosen from EVERY chapter's words. A chapter that failed has no merged pool,
  // and choosing without it would silently leave its words out, so the choice waits for a re-run.
  if (failed.length) {
    console.error(
      `\n${failed.length} chapter(s) failed, so the kana deck was not chosen. Re-run the same ` +
        `command: finished steps are reused.\n  - ${failed.join("\n  - ")}`,
    );
    process.exit(2);
  }

  const kanaDir = resolveChapterRunDir(outputRoot, slug, epubHash, KANA_CHAPTER_NUMBER);
  console.log(`\nkana unit: ${kanaDir}`);
  const kanaCards = readJsonOrNull(join(kanaDir, "cards.json"));
  if (kanaCards?.meta?.reviewed === true) {
    console.log("the kana deck is reviewed; it is not chosen again");
    process.exit(0);
  }
  const report = await withClaim(
    kanaDir,
    { stage: "reading" },
    () =>
      buildKanaUnit({
        unitDir: kanaDir,
        collectionDir,
        targetLanguage: lang,
        epubHash,
        log: (line) => console.log(line),
      }),
    { clearOnFailure: false },
  );
  describeKanaChoice(report);
  if (report.romajiFailed) {
    console.log(`the romaji correction failed (${report.romajiFailed}); re-run to retry it`);
  }
  console.log(
    "\nNext: review the kana deck in the dashboard, then each chapter with kanji, one at a time.",
  );
  process.exit(0);
}

const lesson = resolveLesson(epubPath, lessonArg, { labelDecoding });
if (dry) {
  const chapterFilePath = cachePathFor(lesson);
  console.log(`lesson:   ${lesson.label} (spine ${lesson.firstChapterNumber})`);
  console.log(
    `\nchapter cache: ${chapterFilePath}${existsSync(chapterFilePath) ? "" : " (not yet extracted; free)"}`,
  );
  console.log("\nsteps:");
  for (const [i, step] of READING_PHASE_STEPS.entries()) {
    const paid = step.kind === "agent" ? `  PAID (${step.role ?? step.id})` : "";
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

const { slug, collectionDir } = registerCollection();
const code = await buildChapter(lesson, { slug, collectionDir, remerge });
if (code === 0) {
  console.log(
    "\nNext: review the chapter in the dashboard (the content gate), then generate its audio.",
  );
}
process.exit(code);
