// Phase 1: a chapter to a reviewable base-vocabulary corpus, as one ordered script.
//
// THE STEPS ARE DATA, and that is the point rather than a style. A step in a script always runs; an
// agent deciding for itself whether to do something does not. So the order lives in BASE_PHASE_STEPS
// where a test can assert it, `runBasePhase` walks it, and removing a step is a visible edit to a
// list rather than a path someone did not take.
//
// WHAT THE ORDER ENCODES. Three of the constraints are real and were got wrong somewhere before:
//
//   - the deterministic steps come first, because every agent is fed by one of them. Scripts supply
//     raw material; agents judge. No agent here is handed a selector or a filter.
//   - the reconciler runs after all three specialists and before the snapshot, because the snapshot
//     is the pre-review baseline and a baseline taken mid-merge is not one.
//   - the adversary is fed the chapter, never the corpus, and runs after the merge so its diff has
//     something to compare against. The comparison happens in code afterwards, and the prompt has
//     nowhere to put the corpus even if the order changed.
//   - the deduplicator runs LAST, and after the snapshot. It is the only role that can remove a
//     card, so it acts on the finished set rather than a partial one; and running it after the
//     baseline is taken is what lets the learning pass see what it cut. Before the snapshot, its
//     work would be invisible to the one mechanism built to audit what happens to a corpus between
//     generation and review.
//
// EVERY STEP IS VERIFIED BY ITS ARTIFACT, not by its return value. `verifyRun` re-reads the files at
// the end, so a step that returned cheerfully and wrote nothing is caught here rather than at a
// review gate.

import { mkdirSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { parseTables, annotateWithHints } from "../corpus/chapterTables.js";
import { parseHeadings } from "../corpus/chapterOutline.js";
import { resolveChapterImages } from "../corpus/chapterImages.js";
import { judgeTables } from "./tableSpecialist.js";
import { readChapter } from "./chapterReader.js";
import { judgeImages } from "./imageSpecialist.js";
import { reconcile } from "../cards/unionReconciler.js";
import {
  enumerateChapter,
  findGaps,
  buildCoverageArtifact,
  COVERAGE_FILE,
} from "./coverageAdversary.js";
import { writeVerdicts } from "./imageVerdicts.js";
import { writeSnapshot } from "./snapshot.js";
import { deduplicateCorpus, DEDUP_FILE } from "./semanticDeduplicator.js";
import { deduplicateAgainstEarlier, BACKWARD_FILE } from "./backwardDeduplicator.js";
import { startRun, recordStep, finishRun, verifyRun, STEP_STATUS } from "./runReport.js";

/**
 * The phase, in order. `kind` says who does the work; `artifact` is what the step must leave behind
 * for `verifyRun` to check, relative to the unit dir.
 */
export const BASE_PHASE_STEPS = Object.freeze([
  { id: "tables", kind: "deterministic", artifact: "candidates/tables-raw.json" },
  { id: "sections", kind: "deterministic", artifact: "candidates/sections.json" },
  { id: "images", kind: "deterministic", artifact: "candidates/images-raw.json" },
  {
    id: "table-specialist",
    kind: "agent",
    role: "tableSpecialist",
    artifact: "candidates/tables.json",
  },
  {
    id: "chapter-reader",
    kind: "agent",
    role: "chapterReader",
    artifact: "candidates/chapter.json",
  },
  {
    id: "image-specialist",
    kind: "agent",
    role: "imageSpecialist",
    artifact: "candidates/images.json",
  },
  { id: "reconcile", kind: "deterministic", artifact: "corpus.json" },
  { id: "snapshot", kind: "deterministic", artifact: "as-generated.json" },
  { id: "coverage-adversary", kind: "agent", role: "coverageAdversary", artifact: COVERAGE_FILE },
  { id: "semantic-dedup", kind: "agent", role: "semanticDeduplicator", artifact: DEDUP_FILE },
  {
    id: "backward-dedup",
    kind: "agent",
    role: "backwardDeduplicator",
    artifact: BACKWARD_FILE,
  },
]);

/** Steps `verifyRun` insists on. Every one of them: none of these is optional. */
export const REQUIRED_STEPS = Object.freeze(BASE_PHASE_STEPS.map((s) => s.id));

function writeArtifact(unitDir, relative, body) {
  const path = join(unitDir, relative);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(body, null, 2)}\n`);
  return path;
}

/**
 * Runs phase 1 for one chapter into `unitDir`.
 *
 * Every model-calling collaborator is injectable, so the whole phase is exercisable without spawning
 * anything. That is the v1 idiom and it is what makes an ordering bug cost a test run rather than a
 * paid build.
 */
export function runBasePhase({
  unitDir,
  chapterFilePath,
  chapterHtml,
  targetLanguage,
  meta = null,
  // Every earlier unit's shipping items, base and extras alike, for the backward judge. Separate
  // from anything the miners see: this is prior ART, not permitted vocabulary.
  priorItems = [],
  agents = {},
  now,
} = {}) {
  const run = startRun({ phase: "base", unitDir, ...(now ? { now } : {}) });
  const impl = {
    judgeTables,
    readChapter,
    judgeImages,
    enumerateChapter,
    deduplicateCorpus,
    deduplicateAgainstEarlier,
    ...agents,
  };

  const timed = (fn) => {
    const started = Date.now();
    const value = fn();
    return { value, durationMs: Date.now() - started };
  };

  // --- deterministic: raw material -----------------------------------------------------------
  const hints = meta?.hints ?? {};
  const tables = annotateWithHints(parseTables(chapterHtml), {
    vocabularyTableClass: hints.vocabularyTableClass ?? null,
  });
  recordStep(run, {
    step: "tables",
    status: STEP_STATUS.OK,
    counts: { out: tables.length },
    artifact: writeRelative(unitDir, "candidates/tables-raw.json", tables),
  });

  const sections = parseHeadings(chapterHtml);
  recordStep(run, {
    step: "sections",
    status: STEP_STATUS.OK,
    counts: { out: sections.length },
    artifact: writeRelative(unitDir, "candidates/sections.json", sections),
  });

  const images = resolveChapterImages(chapterFilePath, chapterHtml);
  recordStep(run, {
    step: "images",
    status: STEP_STATUS.OK,
    counts: { out: images.length },
    artifact: writeRelative(unitDir, "candidates/images-raw.json", images),
  });

  // --- agents: judgement ---------------------------------------------------------------------
  const tableResult = timed(() =>
    impl.judgeTables({ tables, targetLanguage, meta, runClaude: agents.runClaude }),
  );
  recordStep(run, {
    step: "table-specialist",
    role: "tableSpecialist",
    status: STEP_STATUS.OK,
    durationMs: tableResult.durationMs,
    counts: { in: tables.length, out: tableResult.value.items.length },
    artifact: writeRelative(unitDir, "candidates/tables.json", tableResult.value),
  });

  const readerResult = timed(() =>
    impl.readChapter({
      chapterFilePath,
      sections,
      targetLanguage,
      meta,
      runClaude: agents.runClaude,
    }),
  );
  recordStep(run, {
    step: "chapter-reader",
    role: "chapterReader",
    status: STEP_STATUS.OK,
    durationMs: readerResult.durationMs,
    counts: { in: sections.length, out: readerResult.value.items.length },
    artifact: writeRelative(unitDir, "candidates/chapter.json", readerResult.value),
  });

  const imageResult = timed(() =>
    impl.judgeImages({ images, targetLanguage, meta, runClaude: agents.runClaude }),
  );
  writeVerdicts(unitDir, imageResult.value.verdicts);
  recordStep(run, {
    step: "image-specialist",
    role: "imageSpecialist",
    status: STEP_STATUS.OK,
    durationMs: imageResult.durationMs,
    counts: { in: images.length, out: imageResult.value.items.length },
    artifact: writeRelative(unitDir, "candidates/images.json", imageResult.value),
  });

  // --- deterministic: merge, then freeze the baseline -----------------------------------------
  const merged = reconcile(
    [tableResult.value.items, readerResult.value.items, imageResult.value.items],
    { languageCode: targetLanguage },
  );
  recordStep(run, {
    step: "reconcile",
    status: STEP_STATUS.OK,
    counts: {
      in:
        tableResult.value.items.length +
        readerResult.value.items.length +
        imageResult.value.items.length,
      out: merged.items.length,
    },
    artifact: writeRelative(unitDir, "corpus.json", {
      meta: {
        targetLanguage,
        sourceType: "epub",
        reviewed: false,
        ...(meta?.unit ?? {}),
        phase: "base",
      },
      items: merged.items,
    }),
  });

  writeSnapshot(unitDir, {
    phase: "base",
    items: merged.items,
    provenance: merged.provenance,
  });
  recordStep(run, {
    step: "snapshot",
    status: STEP_STATUS.OK,
    counts: { out: merged.items.length },
    artifact: "as-generated.json",
  });

  // --- the adversary, last, and never shown the corpus ----------------------------------------
  const adversary = timed(() =>
    impl.enumerateChapter({
      chapterFilePath,
      imagePaths: images.map((i) => i.path),
      targetLanguage,
      runClaude: agents.runClaude,
    }),
  );
  const gaps = findGaps(adversary.value.items, merged.items, { languageCode: targetLanguage });
  recordStep(run, {
    step: "coverage-adversary",
    role: "coverageAdversary",
    status: STEP_STATUS.OK,
    durationMs: adversary.durationMs,
    counts: { in: merged.items.length, out: gaps.counts.gaps },
    artifact: writeRelative(
      unitDir,
      COVERAGE_FILE,
      buildCoverageArtifact({ coverage: adversary.value.coverage, gaps }),
    ),
  });

  // --- the deduplicator, last, on the finished corpus and after the baseline -------------------
  const dedup = timed(() =>
    impl.deduplicateCorpus({
      items: merged.items,
      targetLanguage,
      languageCode: targetLanguage,
      ...(agents.runClaude ? { runClaude: agents.runClaude } : {}),
    }),
  );
  recordStep(run, {
    step: "semantic-dedup",
    role: "semanticDeduplicator",
    status: STEP_STATUS.OK,
    durationMs: dedup.durationMs,
    counts: { in: dedup.value.groups.length, out: dedup.value.excluded.length },
    artifact: writeRelative(unitDir, DEDUP_FILE, {
      groups: dedup.value.groups.length,
      skipped: dedup.value.skipped,
      excluded: dedup.value.excluded,
      distinct: dedup.value.distinct,
      unaccounted: dedup.value.unaccounted,
    }),
  });

  // --- prior art, after the within-corpus merge so nothing about-to-be-cut is judged -----------
  const backward = timed(() =>
    impl.deduplicateAgainstEarlier({
      items: merged.items,
      earlierItems: priorItems,
      targetLanguage,
      languageCode: targetLanguage,
      // `assemble` runs the v1 string matcher after this phase and flags exact repeats itself.
      skipExactMatches: true,
      ...(agents.runClaude ? { runClaude: agents.runClaude } : {}),
    }),
  );
  recordStep(run, {
    step: "backward-dedup",
    role: "backwardDeduplicator",
    status: STEP_STATUS.OK,
    durationMs: backward.durationMs,
    counts: { in: backward.value.candidates.length, out: backward.value.flagged.length },
    artifact: writeRelative(unitDir, BACKWARD_FILE, {
      priorItems: priorItems.length,
      candidates: backward.value.candidates.length,
      skipped: backward.value.skipped,
      flagged: backward.value.flagged,
      cleared: backward.value.cleared,
      unaccounted: backward.value.unaccounted,
    }),
  });

  // The corpus is rewritten because the exclusions are part of it. The SNAPSHOT is not: it was taken
  // before this ran, on purpose, and `writeSnapshot` refuses a second write anyway.
  writeRelative(unitDir, "corpus.json", {
    meta: {
      targetLanguage,
      sourceType: "epub",
      reviewed: false,
      ...(meta?.unit ?? {}),
      phase: "base",
    },
    items: merged.items,
  });

  finishRun(run, now ? { now } : {});
  const verdict = verifyRun(run, { unitDir, requiredSteps: REQUIRED_STEPS });
  return {
    run,
    verdict,
    dedup: dedup.value,
    backward: backward.value,
    items: merged.items,
    provenance: merged.provenance,
    senseCollisions: merged.senseCollisions,
    gaps,
    unreadable: imageResult.value.verdicts.filter((v) => v.verdict === "unreadable"),
  };
}

function writeRelative(unitDir, relative, body) {
  writeArtifact(unitDir, relative, body);
  return relative;
}
