// The inventive author: practice the book does not supply, and the only capped role in phase 2.
//
// WHY IT IS CAPPED WHEN THE MINERS ARE NOT. They mine: if the book prints a sentence, that is a fact
// about the chapter and there is no reason to stop at any number. This role invents, and an inventive
// role with no ceiling is exactly how a unit fills with padding. Another sentence is always possible,
// each looks reasonable alone, and the unit ends up twice the size with no more teaching in it.
//
// WHY IT RUNS LAST. It is given every sentence the other roles produced, so it can tell "this
// context is missing" from "I have not seen it yet". Running it earlier would make its allowance a
// guess and its duplicate-avoidance impossible.
//
// THE CAP IS ENFORCED, NOT REQUESTED. The prompt is told the exact number and `assertWithinAllowance`
// refuses a response that exceeds it. Silently trimming would be worse: it would hide a role
// ignoring its brief, and it would make this module choose which cards to drop, which is a content
// judgement it has no basis for.

import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import { renderPromptTemplate, extractJsonObjectText } from "../util/promptTemplate.js";
import { renderCardFacesBlock } from "../deck/cardFaces.js";
import { CATEGORIES } from "../model/categories.js";
import { teachableVocabulary, findUnteachable, vocabularyForPrompt } from "./extrasVocabulary.js";
import { candidateKey } from "../cards/unionReconciler.js";
import { runRole } from "./runRole.js";

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
export const INVENTIVE_AUTHOR_PROMPT_PATH = resolve(
  join(MODULE_DIR, "..", "..", "docs", "inventive-author-prompt.md"),
);

export const ROLE_ID = "inventiveAuthor";

/**
 * The share of the miners' output this role may add.
 *
 * A dial rather than a law, and the first number to tune if extras units come out thin or bloated.
 * It lives here as a named constant so tuning it is one edit rather than a search.
 */
export const ALLOWANCE_SHARE = 0.2;

const NO_EARLIER = "(this is the book's first lesson — there is no earlier vocabulary)";

/** How many items the role may return, given what the others produced. */
export function allowanceFor(priorCount) {
  return Math.max(0, Math.ceil(priorCount * ALLOWANCE_SHARE));
}

export function renderInventiveAuthorPrompt({
  existingItems,
  baseItems,
  earlierItems = [],
  targetLanguage,
}) {
  const allowance = allowanceFor(existingItems.length);
  const earlier = vocabularyForPrompt(earlierItems);
  return renderPromptTemplate(INVENTIVE_AUTHOR_PROMPT_PATH, {
    TARGET_LANGUAGE: targetLanguage,
    PRIOR_COUNT: String(existingItems.length),
    ALLOWANCE: String(allowance),
    ALLOWANCE_HALF: String(Math.max(1, Math.floor(allowance / 2))),
    CATEGORY_LIST: CATEGORIES.map((c) => `- ${c}`).join("\n"),
    CARD_FACES: renderCardFacesBlock(),
    EXISTING_SENTENCES: JSON.stringify(
      existingItems.map((i) => ({ target: i.target, english: i.english ?? null })),
      null,
      2,
    ),
    BASE_VOCABULARY: JSON.stringify(vocabularyForPrompt(baseItems), null, 2),
    EARLIER_VOCABULARY: earlier.length
      ? ["```json", JSON.stringify(earlier, null, 2), "```"].join("\n")
      : NO_EARLIER,
  });
}

/** Refuses a response over its allowance. Returning fewer is fine and often correct. */
export function assertWithinAllowance(items, allowance) {
  if ((items ?? []).length > allowance) {
    throw new Error(
      `inventive author returned ${items.length} item(s) against an allowance of ${allowance}. ` +
        `The cap is what stops an inventive role filling a unit with padding, so it is refused ` +
        `rather than trimmed: trimming would hide the overrun and pick which cards to drop.`,
    );
  }
  return items;
}

/**
 * Items that repeat something the other roles already produced.
 *
 * Reported rather than refused. The role is told not to reinvent and mostly will not, but a
 * near-duplicate is a judgement about whether two sentences teach the same thing, and that belongs
 * to the reviewer. Matching uses the reconciler's own key so this cannot disagree with the merge
 * that happens next.
 */
export function findReinvented(items, existingItems, { languageCode } = {}) {
  const existing = new Set(
    (existingItems ?? []).map((item) => candidateKey(item, languageCode)).filter(Boolean),
  );
  return (items ?? []).filter((item) => existing.has(candidateKey(item, languageCode)));
}

/** Invents practice within its allowance. Returns `{ items, allowance, reinvented, unteachable }`. */
export function authorInventedPractice({
  existingItems = [],
  baseItems = [],
  earlierItems = [],
  targetLanguage,
  runClaude,
} = {}) {
  const allowance = allowanceFor(existingItems.length);
  // Nothing to add to nothing: with no mined sentences the allowance is zero and there is no basis
  // for inventing a context, so this costs no call.
  if (allowance === 0) {
    return { items: [], allowance, reinvented: [], unteachable: [] };
  }

  const prompt = renderInventiveAuthorPrompt({
    existingItems,
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
  assertWithinAllowance(items, allowance);

  const taught = teachableVocabulary({ baseItems, earlierItems }, targetLanguage);
  return {
    items,
    allowance,
    reinvented: findReinvented(items, existingItems, { languageCode: targetLanguage }),
    unteachable: findUnteachable(items, taught, { languageCode: targetLanguage }),
  };
}
