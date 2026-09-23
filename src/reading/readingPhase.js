// The reading phase: one chapter of a book to a reviewable READING unit, as one ordered script
// (docs/designs/reading-decks/06-reading-extraction.md). Built the way phase 1 is
// (src/agents/basePhase.js), and for the same reasons:
//
//   - THE STEPS ARE DATA. READING_PHASE_STEPS is the order, `runReadingPhase` walks it, and a test
//     pins it. A step in a script always runs; an agent deciding whether to do something does not.
//   - Raw material before judgement: every agent is fed by a deterministic step.
//   - The merge before the snapshot: the snapshot is the pre-review baseline.
//   - The adversary last and never shown the corpus: it enumerates the chapter on its own, and the
//     comparison is a set operation in code.
//
// Two things differ from phase 1, both on purpose:
//
//   - The rules the code can enforce are enforced HERE, in `reconcileReading`, not hoped for in a
//     prompt: one card per written form, the word wins over a character, no single kana, a character
//     card carries no reading, and anything already carded earlier in this collection is dropped.
//     Every drop is listed with its reason in `reading-report.json`, never discarded silently.
//   - There is no `prepare`. The book prints the English and the readings, so this phase writes the
//     reviewable `cards.json` itself, and the unit goes straight to the content gate.
//
// RESUMABLE BY ARTIFACT. Each agent step writes its artifact as soon as it returns, and a re-run
// reuses any artifact already on disk instead of paying for the call again. A usage-limit stop in the
// middle of a chapter therefore costs only the step that was running.

import { createHash } from "crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync } from "fs";
import { dirname, join } from "path";
import { writeFileAtomic } from "../util/atomicWrite.js";
import { parseTables, annotateWithHints } from "../corpus/chapterTables.js";
import { parseHeadings } from "../corpus/chapterOutline.js";
import { resolveChapterImages } from "../corpus/chapterImages.js";
import { assignSourceOrder } from "../cards/sourceOrder.js";
import { CATEGORIES } from "../model/categories.js";
import { resolveIso639Code } from "../model/iso639.js";
import { normalizeDisplayText } from "../model/scriptSpacing.js";
import { validateCorpus, validateCards } from "../model/index.js";
import { writeSnapshot, hasSnapshot } from "../agents/snapshot.js";
import { logDirFor, withRunLogDir } from "../agents/runLog.js";
import { startRun, recordStep, finishRun, verifyRun, STEP_STATUS } from "../agents/runReport.js";
import { readingScheme } from "./readingSchemes.js";
import {
  ITEM_KINDS,
  readTables,
  readChapterForReading,
  readImagesForReading,
  enumerateForReading,
} from "./readingAgents.js";

export const READING_REPORT_FILE = "reading-report.json";
export const READING_COVERAGE_FILE = "candidates/coverage.json";

export const READING_PHASE_STEPS = Object.freeze([
  { id: "tables", kind: "deterministic", artifact: "candidates/tables-raw.json" },
  { id: "sections", kind: "deterministic", artifact: "candidates/sections.json" },
  { id: "images", kind: "deterministic", artifact: "candidates/images-raw.json" },
  {
    id: "table-reader",
    kind: "agent",
    role: "readingTableReader",
    artifact: "candidates/tables.json",
  },
  {
    id: "chapter-reader",
    kind: "agent",
    role: "readingChapterReader",
    artifact: "candidates/chapter.json",
  },
  {
    id: "image-reader",
    kind: "agent",
    role: "readingImageReader",
    artifact: "candidates/images.json",
  },
  { id: "reconcile", kind: "deterministic", artifact: READING_REPORT_FILE },
  { id: "snapshot", kind: "deterministic", artifact: "as-generated.json" },
  {
    id: "coverage-adversary",
    kind: "agent",
    role: "readingCoverageAdversary",
    artifact: READING_COVERAGE_FILE,
  },
  { id: "write-unit", kind: "deterministic", artifact: "cards.json" },
]);

export const REQUIRED_READING_STEPS = Object.freeze(READING_PHASE_STEPS.map((s) => s.id));

// ---- the merge -------------------------------------------------------------------------------

/**
 * The written form as a card shows it, which is also its comparison key: NFC, trimmed, without the
 * full stop or exclamation mark a book prints after a phrase (Genki prints おはよう。), and, for a
 * language written without spaces, without the spaces a beginners' book puts between words
 * (おはよう ございます). Two readers that copied the same phrase differently must land on one card.
 * A question mark is kept: お元気ですか？ is the phrase.
 */
export const targetKey = (target, languageCode = null) =>
  normalizeDisplayText(
    String(target ?? "")
      .normalize("NFC")
      .trim()
      .replace(/[.。．!！]+$/u, "")
      // A book writes a suffix as 〜ごろ in a vocabulary list and ごろ in running text; the tilde
      // is a placeholder for the word it attaches to, not something to read.
      .replace(/^[〜~～]+|[〜~～]+$/gu, "")
      .trim(),
    resolveIso639Code(languageCode) ?? languageCode,
  );

/** A stable card id from the written form: the id is the Anki note's GUID, so it must not change
 * between rebuilds, and one card per written form makes the form a unique key in the collection. */
export const readingCardId = (target) =>
  `r-${createHash("sha1").update(targetKey(target)).digest("hex").slice(0, 12)}`;

function splitGloss(english) {
  return String(english ?? "")
    .split(/\s*;\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
}

// Several glosses are joined with "; ", and a full stop inside that list reads as "Excuse me.; I'm
// sorry.", so a joined gloss loses its trailing full stops. A single gloss is kept as written.
function joinGlosses(glosses) {
  const seen = new Set();
  const out = [];
  for (const gloss of glosses) {
    // "Good-bye" and "Goodbye", "Good morning." and "Good morning" are one gloss.
    const dedupeKey = gloss.toLowerCase().replace(/[\s.,;:!?'"-]+/g, "");
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    out.push(gloss);
  }
  if (out.length === 1) return out[0];
  return out.map((gloss) => gloss.replace(/\.+$/, "")).join("; ");
}

function kindOf(item) {
  if (ITEM_KINDS.includes(item.kind)) return item.kind;
  return [...targetKey(item.target)].length === 1 ? "character" : "word";
}

// A book prints two written forms of one word as one headword: Genki's なん／なに ("what"),
// ゼロ／れい ("zero"). Each is its own written form and its own card. When the reading splits into
// the same number of parts, each form keeps its own; otherwise a single reading is kept for all.
const ALTERNATE_FORM_SEPARATOR = /[／/]/u;

export function splitAlternateForms(item) {
  const forms = String(item.target ?? "")
    .split(ALTERNATE_FORM_SEPARATOR)
    .map((form) => form.trim())
    .filter(Boolean);
  if (forms.length < 2) return [item];
  const readings = String(item.reading ?? "")
    .split(ALTERNATE_FORM_SEPARATOR)
    .map((reading) => reading.trim())
    .filter(Boolean);
  return forms.map((target, index) => ({
    ...item,
    target,
    reading: readings.length === forms.length ? readings[index] : item.reading,
  }));
}

/**
 * Merges the readers' items into one reading corpus and applies every rule the code can see.
 *
 * `earlier` is what this collection already carded in earlier chapters, as `{ target, chapterLabel }`:
 * a written form is carded once per collection, where it is first taught.
 *
 * Returns `{ items, provenance, dropped, readingConflicts }`. `dropped` lists every item left out
 * and why, so a review can see it; nothing is discarded silently.
 */
export function reconcileReading(sources, { targetLanguage, earlier = [] } = {}) {
  const scheme = readingScheme(targetLanguage);
  const key = (target) => targetKey(target, targetLanguage);
  const earlierByKey = new Map(earlier.map((e) => [key(e.target), e.chapterLabel ?? null]));
  const dropped = [];
  const groups = new Map();

  for (const item of sources.flat().flatMap(splitAlternateForms)) {
    const form = key(item.target);
    if (!form) continue;
    const chars = [...form];
    const kind = kindOf(item);
    const drop = (reason) => dropped.push({ target: form, producedBy: item.producedBy, reason });

    if (chars.length === 1) {
      if (scheme?.isSingleLetter?.(form) || !scheme?.characterCards) {
        drop("a single letter or kana is never a card (card rules 5)");
        continue;
      }
      if (!scheme.isCharacterTarget(form)) {
        drop("a single character that is not one this language cards (card rules 4)");
        continue;
      }
    }
    if (!groups.has(form)) groups.set(form, []);
    groups.get(form).push({ ...item, kind });
  }

  // A kana form that is the READING of a kanji form in this same chapter is the same word, and the
  // kanji spelling is the card (the language plugin's rule 1). On the Lesson 3 pilot, an
  // illustration labelled its verbs in kana and the image reader carded たべる beside 食べる.
  const kanaOfKanji = new Map();
  if (scheme) {
    for (const [form, members] of groups) {
      if (!scheme.requiresReading(form)) continue;
      for (const m of members) {
        const reading = key(m.reading ?? "");
        if (reading && reading !== form) kanaOfKanji.set(reading, form);
      }
    }
  }

  const items = [];
  const provenance = {};
  const readingConflicts = [];
  for (const [form, members] of groups) {
    const spelledAs = kanaOfKanji.get(form);
    if (spelledAs && !scheme.requiresReading(form)) {
      dropped.push({
        target: form,
        producedBy: [...new Set(members.map((m) => m.producedBy))].join(", "),
        reason: `the same word as ${spelledAs}, which the chapter prints in kanji and is the card`,
      });
      continue;
    }
    if (earlierByKey.has(form)) {
      dropped.push({
        target: form,
        producedBy: [...new Set(members.map((m) => m.producedBy))].join(", "),
        reason: `already carded in ${earlierByKey.get(form) ?? "an earlier chapter"} of this collection`,
      });
      continue;
    }
    // The word wins over the character (card rules 4): a single character the book also teaches as
    // a word keeps the word's reading, and is voiced.
    const wordMembers = members.filter((m) => m.kind !== "character");
    const kind = wordMembers.length
      ? wordMembers.some((m) => m.kind === "phrase")
        ? "phrase"
        : "word"
      : "character";
    // A character card carries no reading: it is silent by design. A reading an agent attached to a
    // character anyway is dropped here rather than voicing one arbitrary reading of it.
    // A book can print two readings for one form (Genki's 七: しち／なな; 十歳: じゅっさい／じっさい).
    // Each is its own reading: the audio is spoken from ONE, and the alternatives are named for
    // review. Kept whole, "しち／なな" would be spoken as both and is not a kana reading at all.
    const readings = [
      ...new Set(
        (kind === "character" ? [] : wordMembers)
          .flatMap((m) => String(m.reading ?? "").split(/[／/・,，、]/u))
          .map((reading) => reading.trim())
          .filter(Boolean),
      ),
    ];
    if (readings.length > 1) readingConflicts.push({ target: form, readings });
    // The English comes from ONE reader: the first in `sources` order that found this form (the
    // table reader first, because a table is the book's own gloss). Joining every reader's wording
    // turned one meaning into three ("Thank you for the meal (before eating); Thanks for the meal
    // (said before eating)") on the first live run. Glosses are joined only within that reader,
    // which is where a form with two real meanings shows up (今日: today; these days).
    const glossSource = members[0].producedBy;
    const english = joinGlosses(
      members.filter((m) => m.producedBy === glossSource).flatMap((m) => splitGloss(m.english)),
    );
    const category = members.map((m) => m.category).find((c) => CATEGORIES.includes(c)) ?? "Other";
    const reading = readings[0] ?? null;
    const notes = [];
    if (readings.length > 1) {
      notes.push(
        `The book gives more than one reading: ${readings.join(", ")}. Audio uses the first.`,
      );
    }
    if (scheme?.requiresReading?.(form) && kind !== "character" && !reading) {
      notes.push("No reading was found in the book for this word; it cannot be voiced reliably.");
    }
    const id = readingCardId(form);
    items.push({
      id,
      target: form,
      english,
      category,
      // The reading drives TTS and is never rendered (the `ttsText` contract, src/model/index.js).
      // Only a word whose written form the TTS voice might misread needs one.
      ...(reading && reading !== form ? { ttsText: reading } : {}),
      ...(notes.length ? { reviewNote: notes.join(" ") } : {}),
    });
    provenance[id] = [...new Set(members.map((m) => m.producedBy))];
  }
  return { items, provenance, dropped, readingConflicts };
}

/**
 * What the adversary enumerated that the unit does not have, and the reverse. A set operation on
 * the written form. Targets the rules leave out (a single kana) and ones already carded earlier in
 * the collection are not gaps.
 */
export function findReadingGaps(enumerated, items, { dropped = [], targetLanguage = null } = {}) {
  const formOf = (target) => targetKey(target, targetLanguage);
  const have = new Set(items.map((i) => formOf(i.target)));
  const accounted = new Set(dropped.map((d) => formOf(d.target)));
  const listed = new Set();
  const gaps = [];
  for (const item of enumerated) {
    const form = formOf(item.target);
    if (!form || listed.has(form)) continue;
    listed.add(form);
    if (!have.has(form) && !accounted.has(form)) {
      gaps.push({ target: form, english: item.english ?? null });
    }
  }
  const onlyInUnit = [...have].filter((key) => !listed.has(key));
  return {
    gaps,
    onlyInUnit,
    counts: { enumerated: listed.size, unit: have.size, gaps: gaps.length },
  };
}

// ---- the earlier chapters of this collection -------------------------------------------------

/**
 * Every written form an earlier chapter of THIS reading collection already cards: its reviewed
 * chapters in the library (passed in) and any earlier unit built but not yet reviewed, read from the
 * collection folder. Never another collection's (golden rule 7).
 */
export function earlierReadingTargets(collectionDir, chapterNumber, libraryItems = []) {
  const out = libraryItems.map((i) => ({ target: i.target, chapterLabel: i.__chapterLabel }));
  if (!existsSync(collectionDir)) return out;
  for (const name of readdirSync(collectionDir)) {
    const cardsPath = join(collectionDir, name, "cards.json");
    if (!/^chapter-\d+$/.test(name) || !existsSync(cardsPath)) continue;
    let cards;
    try {
      cards = JSON.parse(readFileSync(cardsPath, "utf-8"));
    } catch {
      continue;
    }
    if (
      typeof cards.meta?.chapterNumber !== "number" ||
      cards.meta.chapterNumber >= chapterNumber
    ) {
      continue;
    }
    for (const item of cards.items ?? []) {
      if (!item.excluded) out.push({ target: item.target, chapterLabel: cards.meta.chapterLabel });
    }
  }
  return out;
}

// ---- the run ---------------------------------------------------------------------------------

function readArtifact(unitDir, relative) {
  const path = join(unitDir, relative);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return null;
  }
}

function writeArtifact(unitDir, relative, body) {
  const path = join(unitDir, relative);
  mkdirSync(dirname(path), { recursive: true });
  writeFileAtomic(path, `${JSON.stringify(body, null, 2)}\n`);
  return relative;
}

/**
 * Runs the reading phase for one chapter into `unitDir`.
 *
 * `unit` is the identity stamped on the unit (`epubHash`, `chapterNumber`, `chapterLabel`, and
 * `lastChapterNumber` for a multi-file lesson). `earlier` is `earlierReadingTargets`' answer. Every
 * agent is injectable through `agents`, so the whole phase runs in a test without a model.
 */
function runReadingPhaseInner({
  unitDir,
  chapterFilePath,
  targetLanguage,
  unit,
  hints = {},
  earlier = [],
  agents = {},
  log = () => {},
  now,
}) {
  const impl = {
    readTables,
    readChapterForReading,
    readImagesForReading,
    enumerateForReading,
    ...agents,
  };
  const runClaude = agents.runClaude;
  const meta = { hints };
  const chapterHtml = readFileSync(chapterFilePath, "utf-8");
  const run = startRun({ phase: "reading", unitDir, ...(now ? { now } : {}) });

  // --- deterministic: raw material -----------------------------------------------------------
  const tables = annotateWithHints(parseTables(chapterHtml), {
    vocabularyTableClass: hints.vocabularyTableClass ?? null,
  });
  recordStep(run, {
    step: "tables",
    status: STEP_STATUS.OK,
    counts: { out: tables.length },
    artifact: writeArtifact(unitDir, "candidates/tables-raw.json", tables),
  });
  const sections = parseHeadings(chapterHtml);
  recordStep(run, {
    step: "sections",
    status: STEP_STATUS.OK,
    counts: { out: sections.length },
    artifact: writeArtifact(unitDir, "candidates/sections.json", sections),
  });
  const images = resolveChapterImages(chapterFilePath, chapterHtml).filter((i) =>
    existsSync(i.path),
  );
  const imagePaths = images.map((i) => i.path);
  recordStep(run, {
    step: "images",
    status: STEP_STATUS.OK,
    counts: { out: images.length },
    artifact: writeArtifact(unitDir, "candidates/images-raw.json", images),
  });

  // --- agents, each reused from disk when an earlier run already paid for it ------------------
  const agentStep = (step, role, relative, call, countIn) => {
    const reused = readArtifact(unitDir, relative);
    if (reused) {
      log(`  ${step}: reusing ${relative} from an earlier run`);
      recordStep(run, {
        step,
        role,
        status: STEP_STATUS.OK,
        reason: "reused from an earlier run",
        counts: { in: countIn, out: reused.items?.length ?? 0 },
        artifact: relative,
      });
      return reused;
    }
    log(`  ${step}: calling ${role}`);
    const started = Date.now();
    const value = call();
    recordStep(run, {
      step,
      role,
      status: STEP_STATUS.OK,
      durationMs: Date.now() - started,
      counts: { in: countIn, out: value.items?.length ?? 0 },
      artifact: writeArtifact(unitDir, relative, value),
    });
    return value;
  };

  const tableResult = agentStep(
    "table-reader",
    "readingTableReader",
    "candidates/tables.json",
    () => impl.readTables({ tables, targetLanguage, meta, runClaude }),
    tables.length,
  );
  const chapterResult = agentStep(
    "chapter-reader",
    "readingChapterReader",
    "candidates/chapter.json",
    () =>
      impl.readChapterForReading({ chapterFilePath, sections, targetLanguage, meta, runClaude }),
    sections.length,
  );
  const imageResult = agentStep(
    "image-reader",
    "readingImageReader",
    "candidates/images.json",
    () => impl.readImagesForReading({ imagePaths, targetLanguage, meta, runClaude }),
    imagePaths.length,
  );

  // --- deterministic: the merge, where the rules the code can see are enforced ----------------
  const merged = reconcileReading([tableResult.items, chapterResult.items, imageResult.items], {
    targetLanguage,
    earlier,
  });
  const positions = assignSourceOrder(merged.items, chapterHtml, { languageCode: targetLanguage });
  for (const item of merged.items) {
    const at = positions.get(item.id);
    if (typeof at === "number") item.sourceOrder = at;
  }
  recordStep(run, {
    step: "reconcile",
    status: STEP_STATUS.OK,
    counts: {
      in: tableResult.items.length + chapterResult.items.length + imageResult.items.length,
      out: merged.items.length,
    },
    artifact: writeArtifact(unitDir, READING_REPORT_FILE, {
      items: merged.items.length,
      dropped: merged.dropped,
      readingConflicts: merged.readingConflicts,
      unreadSections: chapterResult.unread ?? [],
    }),
  });

  // --- the baseline, before anything a reviewer does ------------------------------------------
  if (!hasSnapshot(unitDir)) {
    writeSnapshot(unitDir, {
      phase: "reading",
      items: merged.items,
      provenance: merged.provenance,
    });
  }
  recordStep(run, {
    step: "snapshot",
    status: STEP_STATUS.OK,
    counts: { out: merged.items.length },
    artifact: "as-generated.json",
  });

  // --- the adversary: enumerate independently, diff in code -----------------------------------
  const enumerated = agentStep(
    "coverage-adversary",
    "readingCoverageAdversary",
    "candidates/coverage-enumeration.json",
    () => impl.enumerateForReading({ chapterFilePath, imagePaths, targetLanguage, runClaude }),
    0,
  );
  const gaps = findReadingGaps(enumerated.items ?? [], merged.items, {
    dropped: merged.dropped,
    targetLanguage,
  });
  writeArtifact(unitDir, READING_COVERAGE_FILE, {
    role: "readingCoverageAdversary",
    counts: gaps.counts,
    coverage: enumerated.coverage ?? null,
    gaps: gaps.gaps,
    onlyInUnit: gaps.onlyInUnit,
  });
  // The step's own record points at the diff, which is what a reviewer reads.
  run.steps[run.steps.length - 1].artifact = READING_COVERAGE_FILE;

  // --- the unit: corpus.json (identity) and cards.json (what the review and the deck read) ----
  const unitMeta = {
    targetLanguage,
    sourceType: "epub",
    reviewed: false,
    ...unit,
    phase: "reading",
  };
  const corpus = { meta: unitMeta, items: merged.items };
  validateCorpus(corpus);
  writeArtifact(unitDir, "corpus.json", corpus);
  // `pronunciation` is required on a card and never rendered on a reading card: the back is the
  // English and the audio (owner decision, 2026-09-23).
  const cards = {
    meta: unitMeta,
    items: merged.items.map((item) => ({ ...item, pronunciation: "" })),
  };
  validateCards(cards);
  recordStep(run, {
    step: "write-unit",
    status: STEP_STATUS.OK,
    counts: { out: cards.items.length },
    artifact: writeArtifact(unitDir, "cards.json", cards),
  });

  finishRun(run, now ? { now } : {});
  const verdict = verifyRun(run, { unitDir, requiredSteps: REQUIRED_READING_STEPS });
  return {
    run,
    verdict,
    items: merged.items,
    dropped: merged.dropped,
    readingConflicts: merged.readingConflicts,
    gaps,
  };
}

/** The reading phase, with every agent call teeing its transcript into the unit's `agent-logs/`. */
export function runReadingPhase(options = {}) {
  const dir = options.unitDir ? logDirFor(options.unitDir) : null;
  return withRunLogDir(dir, () => runReadingPhaseInner(options));
}

/**
 * The chapters of this collection built AFTER `chapterNumber` in book order, as `{ dir, label }`.
 * Each was merged without knowing what this chapter cards, so a written form both teach is carded
 * twice until they are re-merged (build-reading.mjs --remerge). Found on the Genki pilot, where
 * Lesson 1 was built after Lesson 3 and はい landed in both.
 */
export function laterBuiltChapters(collectionDir, chapterNumber) {
  if (!existsSync(collectionDir)) return [];
  const later = [];
  for (const name of readdirSync(collectionDir)) {
    const cardsPath = join(collectionDir, name, "cards.json");
    if (!/^chapter-\d+$/.test(name) || !existsSync(cardsPath)) continue;
    try {
      const meta = JSON.parse(readFileSync(cardsPath, "utf-8")).meta ?? {};
      if (typeof meta.chapterNumber === "number" && meta.chapterNumber > chapterNumber) {
        later.push({
          dir: join(collectionDir, name),
          label: meta.chapterLabel ?? name,
          reviewed: meta.reviewed === true,
        });
      }
    } catch {
      /* an unreadable unit is preflight's to report */
    }
  }
  return later;
}
