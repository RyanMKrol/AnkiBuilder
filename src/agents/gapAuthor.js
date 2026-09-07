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
export function gapHandles(gaps) {
  return [
    ...gaps.neverUsed.map((g) => g.target),
    ...gaps.underExampled.map((g) => g.target),
    ...(gaps.paradigm ?? []).map((g) => g.label ?? g.form),
  ].filter(Boolean);
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
export function assertGapsAddressed(gaps, { items = [], unfillable = [] } = {}) {
  const wanted = gapHandles(gaps);
  const closed = new Set(items.map((i) => i.fillsGap).filter(Boolean));
  const declined = new Set(unfillable.map((u) => u.gap).filter(Boolean));

  const untouched = wanted.filter((handle) => !closed.has(handle) && !declined.has(handle));
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
    return { items: [], unfillable: [], notes: null, unteachable: [] };
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
  assertGapsAddressed(gaps, { items, unfillable: parsed.unfillable ?? [] });

  const taught = teachableVocabulary({ baseItems, earlierItems }, targetLanguage);
  return {
    items,
    unfillable: parsed.unfillable ?? [],
    notes: parsed.notes ?? null,
    unteachable: findUnteachable(items, taught, { languageCode: targetLanguage }),
  };
}
