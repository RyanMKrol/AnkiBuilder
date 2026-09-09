// The gap author: sentences written against holes that were COUNTED, not noticed.
//
// The difference matters more than it looks. A role asked "what is this unit missing" answers from
// impression and produces plausible work with no relationship to the deck's actual shape. This role
// is handed a list computed by arithmetic over the cards that exist (src/agents/coverageGaps.js) and
// writes against it, which is the same scripts-supply-agents-judge split the rest of the pipeline
// runs on, with arithmetic as the raw material.
//
// EVERY GAP MUST BE CLOSED OR NAMED. `assertGapsAddressed` refuses a response that quietly drops
// one, because a gap left silently is indistinguishable from a gap that was filled, and the whole
// value of computing the list is lost if the answer need not cover it. `unfillable` is a correct
// outcome: a hole that cannot be closed without an untaught word must stay open, since filling it
// with one would turn one gap into two.

import { existsSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import { renderPromptTemplate, extractJsonObjectText } from "../util/promptTemplate.js";
import { renderCardFacesBlock } from "../deck/cardFaces.js";
import { CATEGORIES } from "../model/categories.js";
import { teachableVocabulary, findUnteachable, vocabularyForPrompt } from "./extrasVocabulary.js";
import { EXAMPLES_WANTED, noGaps } from "./coverageGaps.js";
import { runRole } from "./runRole.js";

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
export const GAP_AUTHOR_PROMPT_PATH = resolve(
  join(MODULE_DIR, "..", "..", "docs", "gap-author-prompt.md"),
);

export const ROLE_ID = "gapAuthor";

const NO_EARLIER = "(this is the book's first lesson — there is no earlier vocabulary)";

/** Every gap's handle, in the one spelling the prompt and the check both use. */
/**
 * The handles that IDENTIFY each gap, as `[[handle, ...], ...]`, one group per gap.
 *
 * A gap is addressed when a response names ANY of its handles, and it has two: its `id` and its
 * `target`. The prompt has always promised that ("the id or target of the gap this closes") and this
 * function used to return targets only, so a response that used ids matched nothing at all.
 *
 * That is not hypothetical and it is not a rare edge. On the chapter-9 run of 2026-09-08 the gap
 * author returned fifty items covering every gap, thirty-five of them naming a gap by id, and the
 * check reported thirty-nine of thirty-nine unaddressed. The phase died having done the work. An
 * earlier run had mixed ids and targets and failed partially, which is why the cause looked like a
 * model that dropped gaps rather than a contract the checker did not honour.
 *
 * Grouped rather than flattened because a gap must count as addressed once, by either handle, not
 * twice by both.
 */
export function gapHandleGroups(gaps) {
  // TARGET FIRST, deliberately. Any handle matches, but the first is what gets printed when a gap is
  // reported unaddressed, and `が` tells a reader what is missing where `ga` makes them go and look
  // it up.
  const groups = [
    ...gaps.neverUsed.map((g) => [g.target, g.id]),
    ...gaps.underExampled.map((g) => [g.target, g.id]),
    ...(gaps.paradigm ?? []).map((g) => [g.label, g.form, g.id]),
  ];
  return groups.map((handles) => handles.filter(Boolean)).filter((handles) => handles.length);
}

/** One handle per gap, the human-readable one. What a report names when a gap goes unanswered. */
export function gapHandles(gaps) {
  return gapHandleGroups(gaps).map((handles) => handles[0]);
}

export function renderGapAuthorPrompt({
  chapterFilePath,
  gaps,
  baseItems,
  earlierItems = [],
  targetLanguage,
}) {
  const earlier = vocabularyForPrompt(earlierItems);
  return renderPromptTemplate(GAP_AUTHOR_PROMPT_PATH, {
    TARGET_LANGUAGE: targetLanguage,
    CHAPTER_FILE_PATH: chapterFilePath,
    EXAMPLES_WANTED: String(EXAMPLES_WANTED),
    CATEGORY_LIST: CATEGORIES.map((c) => `- ${c}`).join("\n"),
    CARD_FACES: renderCardFacesBlock(),
    GAPS_JSON: JSON.stringify(gaps, null, 2),
    BASE_VOCABULARY: JSON.stringify(vocabularyForPrompt(baseItems), null, 2),
    EARLIER_VOCABULARY: earlier.length
      ? ["```json", JSON.stringify(earlier, null, 2), "```"].join("\n")
      : NO_EARLIER,
  });
}

/**
 * Refuses a response that left a computed gap unmentioned.
 *
 * A gap is addressed by an item claiming to fill it, or by an entry in `unfillable`. Anything else is
 * silence, and silence is what computing the list was meant to remove.
 */
/**
 * The gaps a response neither filled nor declined.
 *
 * Split out from the assertion so a caller can WRITE this before deciding what to do about it. The
 * guard used to throw straight after parsing, which meant a rejected response was never persisted:
 * a real chapter-9 run failed with a count and no artifact, and nothing on disk could say whether
 * the model had dropped the gaps or answered with handles that did not match. Every other step in
 * the phase is verified by its artifact; this one destroyed its own.
 */
export function unaddressedGaps(gaps, { items = [], unfillable = [] } = {}) {
  const named = new Set(
    [...items.map((i) => i.fillsGap), ...unfillable.map((u) => u.gap)].filter(Boolean),
  );
  return gapHandleGroups(gaps)
    .filter((handles) => !handles.some((handle) => named.has(handle)))
    .map((handles) => handles[0]);
}

export function assertGapsAddressed(gaps, { items = [], unfillable = [] } = {}) {
  const untouched = unaddressedGaps(gaps, { items, unfillable });
  if (untouched.length) {
    throw new Error(
      `gap author left ${untouched.length} computed gap(s) unaddressed: ` +
        `${untouched.slice(0, 4).join(", ")}${untouched.length > 4 ? ", …" : ""}. ` +
        `A gap left silently is indistinguishable from one that was filled.`,
    );
  }
  return items;
}

/** Writes against one lesson's computed gaps. Returns `{ items, unfillable, notes, unteachable }`. */
export function authorGapFills({
  chapterFilePath,
  gaps,
  baseItems = [],
  earlierItems = [],
  targetLanguage,
  runClaude,
} = {}) {
  if (!chapterFilePath || !existsSync(chapterFilePath)) {
    throw new Error(`gap author needs a chapter file that exists: ${chapterFilePath}`);
  }
  // Nothing to do is a real and common outcome for a well-covered lesson, and it must not cost a
  // model call to discover.
  if (!gaps || noGaps(gaps)) {
    return { items: [], unfillable: [], notes: null, unteachable: [], unaddressed: [] };
  }

  const prompt = renderGapAuthorPrompt({
    chapterFilePath,
    gaps,
    baseItems,
    earlierItems,
    targetLanguage,
  });
  const parsed = JSON.parse(
    extractJsonObjectText(runRole(ROLE_ID, prompt, runClaude ? { runClaude } : {})),
  );

  const items = (Array.isArray(parsed.items) ? parsed.items : []).map((item) => ({
    ...item,
    producedBy: ROLE_ID,
    aiSuggested: true,
  }));
  const unfillable = parsed.unfillable ?? [];
  const taught = teachableVocabulary({ baseItems, earlierItems }, targetLanguage);
  return {
    items,
    unfillable,
    notes: parsed.notes ?? null,
    unteachable: findUnteachable(items, taught, { languageCode: targetLanguage }),
    // Reported, not thrown. The PHASE writes this to `candidates/gap-fills.json` and then asserts,
    // so a failure leaves the model's actual answer on disk to be read.
    unaddressed: unaddressedGaps(gaps, { items, unfillable }),
  };
}
