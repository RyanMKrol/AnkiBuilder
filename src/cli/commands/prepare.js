// The `prepare` command: everything between assemble and the first human review,
// as one stage (translate, drill enrichment, semantic de-dup, cross-lesson notes,
// number readings). Moved verbatim from src/cli/index.js when the CLI was split
// per command.
import { existsSync } from "fs";
import { withClaim, updateClaim } from "../runClaim.js";
import { backupFileOnce } from "../../util/atomicWrite.js";
import { resolveIso639Code } from "../../model/iso639.js";
import { findUnreadableNumbers, describeUnreadableNumbers } from "../../cards/spokenNumbers.js";
import { readJson, writeJson, runDirOrderContext } from "./shared.js";
import { runTranslateInner } from "./translate.js";

const FIB_BACKUP_SUFFIX = ".pre-fib.bak";

/**
 * The breadcrumb left on a lesson whose enrichment ran without everything it needed. Its presence is
 * what tells a later `prepare` that the un-set markers are deliberate — and what lets that run drop
 * the previous, thinner drill block instead of appending a second one on top of it.
 */
function degradedMarker(order) {
  return {
    at: new Date().toISOString(),
    reason: order.status,
    missing: order.missing.map((unit) => unit.name),
  };
}

/**
 * `prepare` — EVERYTHING between assemble and the first human review, as one stage:
 * translate → fill-in-the-blank enrichment → semantic de-dup → cross-lesson notes.
 *
 * This exists so a lesson has no resting state between "assembled" and "reviewable". Those four
 * steps all change what the reviewer will sign off on, so a lesson that stops partway through them
 * is a half-built lesson, not a pipeline stage — and the dashboard says so rather than offering it
 * for review. The claim is held across the whole span (its `stage` field naming the current step) and
 * deliberately NOT cleared on failure, so a crash mid-prepare surfaces as "interrupted" instead of
 * looking finished.
 *
 * Every step is idempotent and fails open, so re-running `prepare` on a partly-prepared lesson picks
 * up where it stopped. A lesson already marked reviewed is left completely alone — growing or
 * rewriting a card set someone has signed off on is the one thing this stage must never do.
 */
export async function runPrepare(flags, ctx) {
  if (!flags.run) {
    throw new Error("--run <dir> is required");
  }
  return withClaim(flags.run, { stage: "prepare" }, () => runPrepareInner(flags, ctx), {
    clearOnFailure: false,
  });
}

async function runPrepareInner(flags, ctx) {
  const runDir = flags.run;
  const paths = ctx.runPaths(runDir);

  if (!existsSync(paths.corpus)) {
    throw new Error(`corpus.json not found at ${paths.corpus} — run "assemble" first`);
  }

  updateClaim(runDir, { stage: "translate" });
  await runTranslateInner({ ...flags, __fromPrepare: true }, ctx);

  const cards = readJson(paths.cards);
  const meta = cards.meta || {};

  // Enriching an incompletely-translated lesson would mine drills and write notes against a card
  // set with holes in it. Stop here instead — the markers stay unset, readiness keeps the lesson
  // out of review, and re-running prepare retries the errored items first.
  if (Array.isArray(meta.translateErrors) && meta.translateErrors.length > 0) {
    ctx.log(
      `prepare: stopping — ${meta.translateErrors.length} item(s) failed to translate. ` +
        `Re-run "prepare --run ${runDir}" to retry them; enrichment runs once translation is complete.`,
    );
    return;
  }

  if (meta.reviewed === true) {
    ctx.log(
      "prepare: this lesson is already marked reviewed — skipping enrichment and notes " +
        "(they would change cards that have been signed off)",
    );
    return;
  }

  const targetLanguage = meta.targetLanguage;
  // A template is a fixed vocabulary list: there are no drills to mine and no sibling lessons to
  // cross-reference, so both enrichment and the note pass are no-ops for it by design.
  const isTemplate = meta.sourceType === "template";

  // Both remaining passes read this lesson's EARLIER siblings, so their result is only as complete
  // as what those siblings have already written. Worked out once, up front, and used to decide both
  // what to tell the operator and whether the result is worth marking done.
  const order = isTemplate
    ? { status: "unknown", earlier: [], missing: [], unreviewed: [], vocab: null }
    : runDirOrderContext(runDir, meta.chapterNumber, ctx);
  const complete = order.status === "ok" || order.status === "first";

  if (!isTemplate) {
    if (order.status === "degraded") {
      ctx.log(
        `prepare: WARNING — ${order.missing.length} earlier lesson(s) of this book have no cards.json yet ` +
          `(${order.missing.map((u) => u.name).join(", ")}). The fill-in-the-blank and cross-lesson-note ` +
          `passes only see PREPARED lessons, so this lesson is being built as if those did not exist. ` +
          `Finish them first, then re-run "prepare --run ${runDir}" — both passes are deliberately left ` +
          `un-marked so the re-run redoes them.`,
      );
    } else if (order.status === "unknown") {
      ctx.log(
        `prepare: could not place this lesson among its siblings — treating it as standalone. The ` +
          `enrichment markers are left unset so a later run can redo the passes.`,
      );
    } else if (order.status === "first") {
      ctx.log("prepare: no earlier lessons — building this as the first lesson of the book.");
    } else {
      ctx.log(
        `prepare: ${order.earlier.length} earlier lesson(s) fed to the drill and note passes as context.`,
      );
    }
  }

  if (!isTemplate && meta.enriched !== true) {
    updateClaim(runDir, { stage: "fill-in-the-blank" });

    // Reaching here means this lesson has no `enriched` marker, so the pass is about to run — and
    // mining APPENDS. Any practice cards already present therefore came from a run that never got
    // marked: a degraded one, or a lesson built before the marker existed at all. Drop them rather
    // than stack a second block on top. Precise and safe: only AI-authored practice cards carry
    // `fillInBlank`, and this whole branch is already skipped for a lesson someone has signed off.
    const stale = cards.items.filter((item) => item.fillInBlank).length;
    if (stale > 0) {
      cards.items = cards.items.filter((item) => !item.fillInBlank);
      ctx.log(
        `fill-in-the-blank: dropped ${stale} unmarked practice card(s) from an earlier run — ` +
          `re-mining so the lesson ends up with exactly one drill block`,
      );
    }

    // The source document to mine drills from, for an --epub lesson. A dictated (--words) lesson has
    // none, and composes its drills from the lesson's own patterns instead.
    let chapterFilePath = null;
    if (meta.epubHash && typeof meta.chapterNumber === "number") {
      chapterFilePath =
        typeof meta.lastChapterNumber === "number" && meta.lastChapterNumber > meta.chapterNumber
          ? ctx.chapterRangeCachePath(meta.epubHash, meta.chapterNumber, meta.lastChapterNumber)
          : ctx.chapterCachePath(meta.epubHash, meta.chapterNumber);
    }

    const mined = ctx.mineFillInBlankCards({
      items: cards.items,
      targetLanguage,
      chapterFilePath,
      earlierVocab: order.vocab,
      log: ctx.log,
    });

    if (mined.added.length > 0) {
      cards.items = mined.items;
      ctx.log(`fill-in-the-blank: added ${mined.added.length} practice card(s)`);

      updateClaim(runDir, { stage: "semantic-dedup" });
      const deduped = ctx.dedupeByPattern({
        items: cards.items,
        targetLanguage,
        patterns: mined.patterns,
        log: ctx.log,
      });
      cards.items = deduped.items;
      for (const { id, reason } of deduped.excluded) {
        ctx.log(
          `[dedup:semantic] excluded "${id}" — ${reason || "repeats a pattern the lesson covers"}`,
        );
      }
      ctx.log(
        `semantic de-dup: ${deduped.excluded.length} of ${mined.added.length} practice card(s) excluded as pattern repeats`,
      );

      backupFileOnce(paths.cards, FIB_BACKUP_SUFFIX);
    }

    // The marker means "this pass ran with everything it needed", NOT "this pass ran". Marked even
    // when nothing was mined — a lesson whose source has no usable drills has still been through the
    // pass, and re-running would just re-spend the model call. But NOT marked when the pass was
    // flying blind, or a degraded result would be frozen in and no re-run could ever repair it —
    // and NOT marked when the pass itself FAILED (a model/parse error), or a transient outage
    // would permanently skip this lesson's drills.
    if (mined.failed) {
      ctx.log(
        "fill-in-the-blank: pass failed — enrichment marker left unset so a re-run retries it",
      );
    } else {
      cards.meta = complete
        ? { ...meta, enriched: true, prepareDegraded: undefined }
        : { ...meta, prepareDegraded: degradedMarker(order) };
      if (cards.meta.prepareDegraded === undefined) delete cards.meta.prepareDegraded;
      writeJson(paths.cards, cards);
    }
  }

  if (!isTemplate && meta.notesEnhanced !== true) {
    updateClaim(runDir, { stage: "cross-lesson-notes" });
    const { changed, skipped, failed } = ctx.enhanceRunDirNotes({
      runDir,
      targetLanguage,
      log: ctx.log,
    });
    if (skipped) {
      ctx.log(`cross-lesson notes: skipped — ${skipped}`);
    } else if (!failed) {
      ctx.log(`cross-lesson notes: wrote ${changed} note(s) for this lesson`);
    }
    if (failed) {
      // A failed pass is not a completed pass: leave notesEnhanced unset so a re-run retries,
      // rather than freezing a transient outage in as "done".
      ctx.log("cross-lesson notes: pass failed — marker left unset so a re-run retries it");
    } else {
      // Re-read: the note pass rewrites cards.json itself, so the in-memory copy is stale.
      const fresh = readJson(paths.cards);
      fresh.meta = complete
        ? { ...fresh.meta, notesEnhanced: true }
        : { ...fresh.meta, prepareDegraded: degradedMarker(order) };
      writeJson(paths.cards, fresh);
    }
  }

  // Last pass before the review, and the only one that runs on demand rather than always: spell out
  // any numeral still sitting in a card's ttsText or romaji. Placed here so it covers everything the
  // earlier passes produced, drills included, and so the reviewer is handed cards that are already as
  // good as the pipeline can make them rather than a list of things to go and fix by hand.
  const fresh = readJson(paths.cards);
  const before = findUnreadableNumbers(fresh.items, resolveIso639Code(targetLanguage));
  if (before.length > 0) {
    updateClaim(runDir, { stage: "number-readings" });
    ctx.log(
      `number readings: ${before.length} card(s) have a numeral to spell out — filling them in`,
    );
    const { items, fixed, remaining } = ctx.fillNumberReadings({
      items: fresh.items,
      targetLanguage,
      log: ctx.log,
    });
    if (fixed.length > 0) {
      fresh.items = items;
      writeJson(paths.cards, fresh);
      for (const f of fixed) {
        ctx.log(`  ${f.target} -> ${f.ttsText} (${f.pronunciation})`);
      }
      ctx.log(
        `number readings: filled ${fixed.length} card(s), each flagged uncertain so you check the counter`,
      );
    }
    if (remaining.length > 0) {
      ctx.log(
        `prepare: WARNING — ${remaining.length} card(s) still have a numeral that reaches the romaji ` +
          `or the spoken text. The review gate holds this lesson back until each has a "ttsText" with ` +
          `the number spelled out (and a romaji to match):\n` +
          describeUnreadableNumbers(remaining),
      );
    }
  }

  ctx.log(
    `prepare: ${runDir} is ready for the corpus review — open the dashboard ("npm run serve") and sign it off`,
  );
}
