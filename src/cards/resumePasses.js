// What `anki-builder resume` can put right on a unit that already exists, and how.
//
// WHY. Tier 1 gave every pass a ledger entry (src/cards/passLedger.js), so a failure is now a fact
// on the unit instead of a log line nobody kept. This is the other half: reading that fact back and
// re-running exactly what failed. Before it existed, recovery meant a human diagnosing the unit and
// hand-picking flags for a scripts/ tool — which worked, but only because someone remembered the
// diagnosis. A ledger nobody acts on is just a tidier way to lose the same work.
//
// The passes split three ways, and the split is the whole design:
//
//   RESUMABLE   forwardFlags, pedagogicalSort, romanization — all three ANNOTATE or REORDER an
//               existing item set. None can add, drop or rewrite a card's meaning, so re-running
//               one against a unit that already has cards is safe by construction.
//   DELEGATED   translate, fillInBlank, semanticDedup, crossLessonNotes, numberReadings — `prepare`
//               already recovers these, because each leaves a marker and re-running retries exactly
//               the unmarked ones. Resume calls prepare rather than reimplementing that.
//   BLOCKED     extraction, bookConventions, taughtIndex — none of these can be repaired in place.
//               Extraction IS the item set; the other two are book-level artifacts. Resume reports
//               them with the command that fixes each, and does not pretend to handle them.

import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { writeUnitJson } from "../util/unitWrite.js";
import { failedPasses, recordPass, PASS_FAILED, PASS_SKIPPED } from "./passLedger.js";

/** The passes resume drives itself, in the order the pipeline runs them. */
export const RESUMABLE_PASSES = ["forwardFlags", "pedagogicalSort", "romanization"];

/** The passes `prepare` recovers on its own, via the markers it already writes. */
export const DELEGATED_PASSES = [
  "translate",
  "fillInBlank",
  "semanticDedup",
  "crossLessonNotes",
  "numberReadings",
];

function passStatus(meta, name) {
  return meta?.passes?.[name]?.status ?? null;
}

/**
 * What resuming this unit would do, as data — so `--dry` and the real run agree by construction
 * rather than by two code paths saying similar things.
 *
 * Returns `{ steps, blocked, notes }`. `steps` are the actions to take in order; `blocked` are
 * failures resume cannot repair, each with the command that can; `notes` are things worth saying
 * that are neither.
 */
export function planResume({ corpusMeta = {}, cardsMeta = null, hasCards = false } = {}) {
  // The ledger travels corpus -> cards (translate copies meta verbatim), but a unit that never got
  // as far as cards.json only has the corpus copy. Read whichever is the later truth.
  const meta = cardsMeta ?? corpusMeta;
  const isTemplate = meta.sourceType === "template";
  const isEpub = Boolean(meta.epubHash);

  const steps = [];
  const blocked = [];
  const notes = [];

  if (passStatus(meta, "extraction") === PASS_FAILED) {
    blocked.push({
      pass: "extraction",
      why: "extraction IS the item set — there is nothing on disk to repair it against",
      fix: "rebuild the unit from scratch, passing --run <this dir> so a fresh assemble reuses it instead of allocating the next chapter number",
    });
  }

  if (passStatus(meta, "bookConventions") === PASS_FAILED) {
    blocked.push({
      pass: "bookConventions",
      why: "the conventions doc is a book-level artifact, cached under the book's hash, not part of this unit",
      fix: `anki-builder epub cache ${meta.epubHash ?? "<hash>"} --clear --conventions, then re-assemble this lesson`,
    });
  }

  const taughtIndexStatus = passStatus(meta, "taughtIndex");
  const forwardFailed = passStatus(meta, "forwardFlags") === PASS_FAILED;
  if (taughtIndexStatus === PASS_FAILED || taughtIndexStatus === PASS_SKIPPED) {
    blocked.push({
      pass: "taughtIndex",
      why: "a whole-book pass is not this unit's to spend — it belongs to the book",
      fix: `anki-builder epub taught-index ${meta.epubHash ?? "<hash>"}`,
      // The ordering that actually saves money, said at the moment it matters.
      before: forwardFailed
        ? "run this BEFORE resuming, and the forward-flag pass below reads the index instead of re-reading every later chapter"
        : null,
    });
  }

  if (forwardFailed) {
    if (isEpub) {
      steps.push({
        pass: "forwardFlags",
        action: "forwardFlags",
        why: "only annotates (uncertain + reviewNote); it can never add or drop an item",
      });
    } else {
      notes.push(
        "forwardFlags is recorded failed but this unit has no epubHash — the pass is EPUB-only and cannot run here",
      );
    }
  }

  if (passStatus(meta, "pedagogicalSort") === PASS_FAILED) {
    steps.push({
      pass: "pedagogicalSort",
      action: "pedagogicalSort",
      why: "reorders only; it cannot add, drop or duplicate an item",
    });
  }

  // prepare's own markers, not the ledger — these passes predate it and recover through the
  // markers they have always written. Asking prepare is both cheaper and more honest than
  // duplicating its readiness logic here.
  const preparePending = [];
  if (Array.isArray(meta.translateErrors) && meta.translateErrors.length > 0) {
    preparePending.push(`${meta.translateErrors.length} item(s) failed to translate`);
  }
  if (!hasCards) {
    preparePending.push("no cards.json — the unit was never translated");
  }
  if (!isTemplate && hasCards) {
    if (meta.enriched !== true) preparePending.push("the fill-in-the-blank pass never completed");
    if (meta.notesEnhanced !== true)
      preparePending.push("the cross-lesson note pass never completed");
  }
  if (preparePending.length > 0) {
    steps.push({
      pass: "prepare",
      action: "prepare",
      why: preparePending.join("; "),
    });
  }

  // Last, deliberately: prepare can add a whole drill block, and those cards want correcting too.
  if (passStatus(meta, "romanization") === PASS_FAILED) {
    if (hasCards) {
      steps.push({
        pass: "romanization",
        action: "romanization",
        why: "rewrites `pronunciation` and nothing else",
      });
    } else {
      notes.push(
        "romanization is recorded failed but there is no cards.json yet — prepare will run it as part of translating",
      );
    }
  }

  return { steps, blocked, notes };
}

/** A one-line human summary of why a unit cannot be resumed, or null if it can. */
export function resumeRefusal(meta = {}) {
  if (meta.done === true) {
    return (
      "this unit is DONE — its audio is reviewed and its cards are in the collection. Every pass " +
      "resume runs would change what was signed off. Undo the sign-off first if you really mean to."
    );
  }
  if (meta.reviewed === true) {
    return (
      "this unit is already REVIEWED — the passes resume runs change what the reviewer signed off " +
      "on. Unreview it in the dashboard first, rather than editing underneath the sign-off."
    );
  }
  return null;
}

/** The failed passes resume will NOT touch, for the closing report. */
export function unresolvedAfter(meta, ranPasses) {
  const ran = new Set(ranPasses);
  return failedPasses(meta)
    .filter(([name]) => !ran.has(name))
    .map(([name, reason]) => ({ name, reason }));
}

/**
 * Apply `patch` to a unit's corpus.json AND cards.json (whichever exist), through the safe write
 * path — validate, stamped backup, atomic write, re-validate.
 *
 * The item-count assertion is the guard that makes the resumable passes safe to re-run at all: all
 * three annotate or reorder, so a patch that changes how many items a unit holds has done something
 * its pass is not allowed to do, and the write is refused rather than reconciled.
 */
export function patchUnitItems(runDir, reason, patch) {
  const written = [];
  for (const name of ["corpus.json", "cards.json"]) {
    const path = join(runDir, name);
    if (!existsSync(path)) continue;
    const file = JSON.parse(readFileSync(path, "utf-8"));
    const before = file.items.length;
    patch(file, name);
    if (file.items.length !== before) {
      throw new Error(`${path}: item count changed (${before} -> ${file.items.length}), refusing`);
    }
    writeUnitJson(path, file, { reason });
    written.push(path);
  }
  return written;
}

/**
 * Stamp a pass's new outcome onto the unit's ledger, in both files.
 *
 * Without this a successful resume leaves the unit still reading "failed": preflight keeps blocking
 * the review, and the next resume re-runs a pass that already worked. The ledger is only useful if
 * the thing that acts on it also updates it.
 */
export function recordPassOnUnit(runDir, name, status, reason = null) {
  return patchUnitItems(runDir, `resume-${name}`, (file) => {
    recordPass(file.meta, name, status, reason);
  });
}
