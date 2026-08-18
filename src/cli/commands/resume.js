// The `resume` command: read a unit's pass ledger and re-run exactly what failed.
//
// This is the payoff for Tier 1. `meta.passes` records how every model pass turned out; until now
// nothing read it back, so recovery meant a human diagnosing the unit and hand-picking flags for a
// scripts/ tool. That worked, but only for as long as someone remembered the diagnosis — and the
// whole reason the ledger exists is that nobody does, weeks later, when the symptom is one wrong
// card. The script it replaces has been deleted rather than kept alongside: two recovery paths
// drift, and the one that drifts is always the one nobody ran this month.
//
// What it will and will not do lives in src/cards/resumePasses.js, as data, so `--dry` and the real
// run cannot disagree.
import { existsSync } from "fs";
import { withClaim, updateClaim } from "../runClaim.js";
import { resolveIso639Code } from "../../model/iso639.js";
import { PASS_OK, PASS_FAILED } from "../../cards/passLedger.js";
import {
  planResume,
  resumeRefusal,
  unresolvedAfter,
  patchUnitItems,
  recordPassOnUnit,
} from "../../cards/resumePasses.js";
import { readJson } from "./shared.js";
import { runPrepare } from "./prepare.js";

/** How this pass's own note always opens — see the idempotency note in applyForwardFlags. */
const FLAG_MARKER = /Possibly premature/;

export async function runResume(flags, ctx) {
  if (!flags.run) {
    throw new Error("--run <dir> is required");
  }
  const paths = ctx.runPaths(flags.run);
  if (!existsSync(paths.corpus)) {
    throw new Error(`corpus.json not found at ${paths.corpus} — there is no unit here to resume`);
  }

  const corpus = readJson(paths.corpus);
  const hasCards = existsSync(paths.cards);
  const cardsMeta = hasCards ? readJson(paths.cards).meta : null;
  const meta = cardsMeta ?? corpus.meta;

  const refusal = resumeRefusal(meta);
  if (refusal) {
    ctx.log(`resume: ${refusal}`);
    return;
  }

  const { steps, blocked, notes } = planResume({
    corpusMeta: corpus.meta,
    cardsMeta,
    hasCards,
  });

  for (const item of blocked) {
    ctx.log(`resume: ${item.pass} CANNOT be resumed — ${item.why}`);
    if (item.before) ctx.log(`  ${item.before}`);
    ctx.log(`  fix: ${item.fix}`);
  }
  for (const note of notes) {
    ctx.log(`resume: ${note}`);
  }

  if (steps.length === 0) {
    ctx.log(
      blocked.length > 0
        ? `resume: nothing on ${flags.run} can be re-run from here — see the fixes above`
        : `resume: nothing to re-run — every pass on ${flags.run} is recorded as complete`,
    );
    return;
  }

  ctx.log(`resume: ${steps.length} pass(es) to re-run on ${flags.run}, in pipeline order:`);
  for (const step of steps) {
    ctx.log(`  ${step.pass} — ${step.why}`);
  }
  if (flags.dry) {
    ctx.log("resume: --dry, so nothing ran. Each pass above costs model credits.");
    return;
  }

  // Held across the whole span, and deliberately NOT cleared on failure, exactly as prepare does:
  // a resume that dies partway must surface as "interrupted", never as a finished unit.
  return withClaim(flags.run, { stage: "resume" }, () => runSteps(steps, flags, ctx), {
    clearOnFailure: false,
  });
}

async function runSteps(steps, flags, ctx) {
  const ran = [];
  for (const step of steps) {
    updateClaim(flags.run, { stage: `resume:${step.pass}` });
    if (step.action === "prepare") {
      // prepare owns its own claim; nesting is fine (withClaim re-enters on the same run dir),
      // and it re-reads the unit itself rather than trusting anything read up here.
      await runPrepare({ ...flags }, ctx);
      ran.push("prepare");
      continue;
    }
    const handler = HANDLERS[step.action];
    const outcome = await handler(flags, ctx);
    recordPassOnUnit(
      flags.run,
      step.pass,
      outcome.failed ? PASS_FAILED : PASS_OK,
      outcome.failed ? outcome.reason : null,
    );
    ran.push(step.pass);
    if (outcome.failed) {
      // Stop at the first failure rather than marching the rest of the plan into the same wall.
      // A quota window that just refused one pass will refuse the next four too, and the ledger
      // now records that this one was tried and failed again.
      ctx.log(
        `resume: ${step.pass} failed again (${outcome.reason}) — stopping here. ` +
          `The ledger records it, so re-running resume picks up from this pass.`,
      );
      return;
    }
  }

  const cardsPath = ctx.runPaths(flags.run).cards;
  const fresh = existsSync(cardsPath) ? readJson(cardsPath) : null;
  const left = unresolvedAfter(fresh?.meta ?? {}, ran);
  if (left.length > 0) {
    ctx.log(
      `resume: re-ran ${ran.join(", ")}. Still recorded failed: ` +
        left.map((p) => `${p.name}${p.reason ? ` (${p.reason})` : ""}`).join(", "),
    );
    return;
  }
  ctx.log(`resume: re-ran ${ran.join(", ")} — every recorded failure on this unit is now clear.`);
}

/**
 * The forward-flag pass, against the corpus already on disk.
 *
 * Safe by construction: it only ever sets `uncertain` and appends to `reviewNote`, so the worst case
 * is the annotation the unit already has.
 */
async function applyForwardFlags(flags, ctx) {
  const paths = ctx.runPaths(flags.run);
  const corpus = readJson(paths.corpus);
  const { epubHash, targetLanguage } = corpus.meta;
  const epubPath = ctx.libraryEpubPath(epubHash);
  const bookConventions = ctx.loadBookConventions(epubHash);

  // The chapter to look PAST — a multi-file lesson's own later files are not "taught later".
  const chapterNumber = corpus.meta.lastChapterNumber ?? corpus.meta.chapterNumber;
  const result = ctx.flagForwardConcerns({
    candidateItems: corpus.items,
    epubPath,
    chapterNumber,
    targetLanguage,
    bookConventions,
    log: ctx.log,
  });
  if (result.failed) return result;

  ctx.log(`resume: forward flags — ${result.flagged.length} item(s) flagged`);
  if (result.flagged.length > 0) {
    const byId = new Map(result.items.map((item) => [item.id, item]));
    patchUnitItems(flags.run, "resume-forward-flags", (file) => {
      for (const item of file.items) {
        const flagged = byId.get(item.id);
        if (!flagged?.uncertain) continue;
        // Idempotency keys on the pass's MARKER, not on the note being byte-identical. The wording
        // comes from a model, so a second run rephrases it, an equality check misses, and the card
        // collects the same warning two or three times over. It did: one card ended up carrying
        // three copies of its forward-flag note before this check existed.
        if (FLAG_MARKER.test(item.reviewNote ?? "")) continue;
        item.uncertain = true;
        item.reviewNote = item.reviewNote
          ? `${item.reviewNote} ${flagged.reviewNote}`
          : flagged.reviewNote;
      }
    });
  }
  return { failed: false };
}

/** The pedagogical sort, against the corpus already on disk. Reorders; cannot add or drop. */
async function applyPedagogicalSort(flags, ctx) {
  const paths = ctx.runPaths(flags.run);
  const corpus = readJson(paths.corpus);
  const bookConventions = corpus.meta.epubHash
    ? ctx.loadBookConventions(corpus.meta.epubHash)
    : null;

  const result = ctx.sortItemsPedagogically({
    items: corpus.items,
    targetLanguage: corpus.meta.targetLanguage,
    bookConventions,
    log: ctx.log,
  });
  if (result.failed) return result;

  ctx.log(`resume: pedagogical sort — ${result.changed ? "reordered" : "no change"}`);
  if (result.changed) {
    const order = new Map(result.items.map((item, index) => [item.id, index]));
    // Anything the sort never saw (the drill block, cards hand-added at gate 1) keeps its relative
    // position at the end rather than being dropped or scattered.
    const rank = (item) => (order.has(item.id) ? order.get(item.id) : Number.MAX_SAFE_INTEGER);
    patchUnitItems(flags.run, "resume-pedagogical-sort", (file) => {
      file.items = [...file.items].sort((a, b) => rank(a) - rank(b));
    });
  }
  return { failed: false };
}

/**
 * The romanization correction, against cards.json only — corpus.json has no `pronunciation` field
 * by schema. Rewrites that one field and nothing else.
 *
 * Re-running `translate` is NOT a substitute: it short-circuits on an existing cards.json, and when
 * it doesn't it rebuilds the file from the corpus, discarding the drill block, every audio
 * reference and the cross-lesson notes.
 */
async function applyRomanization(flags, ctx) {
  const paths = ctx.runPaths(flags.run);
  const cards = readJson(paths.cards);
  const { targetLanguage } = cards.meta;

  const result = await ctx.correctRomanization({
    items: cards.items.filter((item) => !item.excluded && (item.ttsText || item.target)),
    targetLanguage,
    languageCode: resolveIso639Code(targetLanguage),
    log: ctx.log,
  });
  if (result.failed) return result;

  const byId = new Map(result.items.map((item) => [item.id, item]));
  let changed = 0;
  patchUnitItems(flags.run, "resume-romanization", (file, name) => {
    if (name !== "cards.json") return;
    for (const item of file.items) {
      const fixed = byId.get(item.id);
      if (!fixed?.pronunciation || fixed.pronunciation === item.pronunciation) continue;
      ctx.log(`  ${item.target}\n      ${item.pronunciation}\n   -> ${fixed.pronunciation}`);
      item.pronunciation = fixed.pronunciation;
      changed++;
    }
  });
  ctx.log(`resume: romanization — ${changed} item(s) corrected`);
  return { failed: false };
}

const HANDLERS = {
  forwardFlags: applyForwardFlags,
  pedagogicalSort: applyPedagogicalSort,
  romanization: applyRomanization,
};
