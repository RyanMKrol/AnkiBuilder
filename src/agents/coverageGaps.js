// The gaps a chapter's cards have, computed rather than noticed.
//
// WHY THIS IS DETERMINISTIC. The gap author writes sentences to fill holes, and the holes must be
// FOUND by counting rather than by a model's sense of what feels thin. A role asked "what is this
// unit missing" answers from impression and produces plausible-looking work with no relationship to
// the actual shape of the deck. A role handed a list of specific holes writes against evidence.
//
// This is the same division the whole pipeline runs on: scripts supply raw material and agents
// judge. Here the raw material is arithmetic over the cards that already exist.
//
// WHAT IS NOT HERE, AND WHY. The paradigm grid is a third gap source and it is deliberately absent:
// its spec is hand-authored per chapter because knowing WHICH paradigm a chapter teaches is a
// judgement, not a count (extras-pass.md, "You author the grid; the matching is a script"). It
// arrives as an optional input rather than being invented here, so a chapter with no spec reports
// no paradigm gaps and says so, instead of a made-up grid producing made-up holes.

import { findTaughtNeverUsed } from "../cards/taughtNeverUsed.js";
import { normalizeDisplayText } from "../model/scriptSpacing.js";

/** Categories whose items are forms rather than things, so a bare gloss is not enough to study. */
export const FUNCTION_CATEGORY = "Grammar & Function Words";

/** How many distinct sentences a function word wants before it is considered demonstrated. */
export const EXAMPLES_WANTED = 3;

const shipping = (cards) =>
  (cards ?? []).filter((c) => !c.excluded && typeof c.target === "string");

/**
 * Function words with fewer than `wanted` sentences showing them at work.
 *
 * A learner who meets `が` as a bare gloss can recite the card and cannot use the word, which is why
 * v1's rules say every Grammar & Function Words card needs a worked example. Counting is the honest
 * way to know: `の` once had ten examples in this deck and all ten were the same
 * `[company]の[person]` shape, so presence was never the question.
 *
 * A sentence counts as an example when it CONTAINS the form and is longer than it. Containment over
 * a space-free script over-counts (`は` appears inside many words), so this is a floor rather than a
 * measurement: a form this reports as under-exampled genuinely is.
 */
export function underExampledForms(cards, { wanted = EXAMPLES_WANTED, languageCode } = {}) {
  const items = shipping(cards);
  const norm = (text) => normalizeDisplayText(String(text).trim(), languageCode);
  const sentences = items.map((c) => norm(c.target)).filter(Boolean);

  return items
    .filter((c) => c.category === FUNCTION_CATEGORY)
    .map((card) => {
      const form = norm(card.target);
      const examples = sentences.filter((s) => s !== form && s.includes(form));
      return {
        id: card.id,
        target: card.target,
        english: card.english ?? null,
        examples: examples.length,
      };
    })
    .filter((entry) => entry.examples < wanted)
    .sort((a, b) => a.examples - b.examples);
}

/**
 * Every computed gap for one lesson, as `{ neverUsed, underExampled, paradigm }`.
 *
 * `cards` is a lesson's worth: the base unit and whatever the extras roles have produced so far.
 * Judging either alone gives the wrong answer for both, since the extras unit is exactly where the
 * base unit's bare words are meant to get used.
 */
export function computeGaps(cards, { languageCode, paradigmMisses = null } = {}) {
  const shipped = shipping(cards);
  return {
    neverUsed: findTaughtNeverUsed(shipped),
    underExampled: underExampledForms(shipped, { languageCode }),
    // null, not [], when no grid was supplied: "nobody checked" and "nothing missing" are different
    // answers, and this file exists because the difference matters.
    paradigm: paradigmMisses ?? null,
  };
}

/** True when there is nothing for the gap author to do. */
export function noGaps(gaps) {
  return (
    gaps.neverUsed.length === 0 &&
    gaps.underExampled.length === 0 &&
    (gaps.paradigm === null || gaps.paradigm.length === 0)
  );
}
