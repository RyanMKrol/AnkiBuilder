// The fill-in-the-blank miner: a chapter's substitution frames, expanded into complete sentences.
//
// THE LINE BETWEEN THIS AND THE EXERCISE MINER. That role mines what the book PRINTS; this one
// expands what the book IMPLIES. A worked `e.g.` line is a sentence the author wrote, so mining it
// is a fact about the chapter and the miner is unbounded. A frame with six fillers beside it is a
// recipe for six sentences the author did not write, so how many deserve a card is a judgement, and
// that is why this role is capped and the other is not.
//
// Drawing that line late cost a duplicate: the exercise miner's first prompt claimed substitutions
// too, which would have produced the same sentences twice under two role names and made the
// provenance meaningless.
//
// WHY UNRESOLVED PLACEHOLDERS ARE REFUSED RATHER THAN REPORTED. Everything else in this pipeline
// reports and lets a human decide, because most judgements are genuinely close. This one is not: a
// card whose target still contains an underscore run or an empty full-width paren cannot be
// studied by anyone, so there is nothing for a reviewer to weigh. It is refused at parse time.

import { existsSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import { renderPromptTemplate, extractJsonObjectText } from "../util/promptTemplate.js";
import { renderCardFacesBlock } from "../deck/cardFaces.js";
import { CATEGORIES } from "../model/categories.js";
import { teachableVocabulary, findUnteachable, vocabularyForPrompt } from "./extrasVocabulary.js";
import { runRole } from "./runRole.js";

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
export const FILL_IN_BLANK_MINER_PROMPT_PATH = resolve(
  join(MODULE_DIR, "..", "..", "docs", "fill-in-blank-miner-prompt.md"),
);

export const ROLE_ID = "fillInBlankMiner";

/** What an unresolved slot looks like, in every notation this pipeline has met. */
export const UNRESOLVED = /[_＿]{2,}|[（(]\s*[）)]|〜|～|[…⋯]|\.{3}/;

const NO_EARLIER = "(this is the book's first lesson — there is no earlier vocabulary)";

export function renderFillInBlankMinerPrompt({
  chapterFilePath,
  baseItems,
  earlierItems = [],
  targetLanguage,
}) {
  const earlier = vocabularyForPrompt(earlierItems);
  return renderPromptTemplate(FILL_IN_BLANK_MINER_PROMPT_PATH, {
    TARGET_LANGUAGE: targetLanguage,
    CHAPTER_FILE_PATH: chapterFilePath,
    CATEGORY_LIST: CATEGORIES.map((c) => `- ${c}`).join("\n"),
    CARD_FACES: renderCardFacesBlock(),
    BASE_VOCABULARY: JSON.stringify(vocabularyForPrompt(baseItems), null, 2),
    EARLIER_VOCABULARY: earlier.length
      ? ["```json", JSON.stringify(earlier, null, 2), "```"].join("\n")
      : NO_EARLIER,
  });
}

/**
 * Refuses any produced sentence that still contains a slot.
 *
 * Unlike the vocabulary check, this one throws. A target holding `___` is unstudiable for everyone,
 * so there is no judgement to hand to a reviewer, and letting one through would put a card in the
 * deck that can only ever be deleted.
 */
export function assertNoUnresolvedSlots(items) {
  const offenders = (items ?? []).filter(
    (item) => typeof item?.target === "string" && UNRESOLVED.test(item.target),
  );
  if (offenders.length) {
    throw new Error(
      `fill-in-the-blank miner left ${offenders.length} slot(s) unresolved: ` +
        `${offenders
          .slice(0, 3)
          .map((o) => o.target)
          .join(", ")}${offenders.length > 3 ? ", …" : ""}. ` +
        `A card containing a blank cannot be studied by anyone, so it is refused rather than reported.`,
    );
  }
  return items;
}

/**
 * Frames where the gap between offered fillers and kept sentences is worth a glance.
 *
 * Not an error either way. A frame that produced one of six may have been right to; the point is
 * that the number is visible rather than implied, so "this chapter was thin" and "this role capped
 * hard" are told apart by reading rather than by guessing.
 */
export function frameYield(frames) {
  return (frames ?? []).map((frame) => ({
    frame: frame.frame,
    fillers: frame.fillers ?? null,
    produced: frame.produced ?? 0,
    note: frame.note ?? null,
  }));
}

/** Expands one chapter's frames. Returns `{ items, frames, skipped, unteachable }`. */
export function mineFillInBlanks({
  chapterFilePath,
  baseItems = [],
  earlierItems = [],
  targetLanguage,
  runClaude,
} = {}) {
  if (!chapterFilePath || !existsSync(chapterFilePath)) {
    throw new Error(`fill-in-the-blank miner needs a chapter file that exists: ${chapterFilePath}`);
  }
  const prompt = renderFillInBlankMinerPrompt({
    chapterFilePath,
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
    fillInBlank: true,
  }));
  assertNoUnresolvedSlots(items);

  const taught = teachableVocabulary({ baseItems, earlierItems }, targetLanguage);
  return {
    items,
    frames: frameYield(parsed.frames),
    skipped: parsed.skipped ?? [],
    unteachable: findUnteachable(items, taught, { languageCode: targetLanguage }),
  };
}
