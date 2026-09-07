// The exercise miner: a chapter's drills and worked examples, turned into complete sentences.
//
// The first phase-2 role. Phase 2 runs AFTER the base corpus review, so it is fed vocabulary a human
// has already approved, and its job is to show those words at work rather than to teach new ones.
//
// ITS ACCOUNTABILITY UNIT IS THE EXERCISE BLOCK, for the same reason each phase-1 role has one of
// its own: a block nobody reached and a block that held nothing produce the same empty output. One
// chapter's read once stopped at Exercise V of VIII, two blocks were never seen, and one held the
// only use of two words in the whole book. `assertBlocksAccountedFor` makes that unrepresentable.
//
// `skipped` is a first-class part of the answer, not an apology. A drill needing a word neither list
// teaches MUST be skipped, and saying which and why is how a reviewer tells "this chapter had less
// in it" apart from "this role quietly lowered its standards".

import { existsSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import { renderPromptTemplate, extractJsonObjectText } from "../util/promptTemplate.js";
import { renderCardFacesBlock } from "../deck/cardFaces.js";
import { CATEGORIES } from "../model/categories.js";
import { teachableVocabulary, findUnteachable, vocabularyForPrompt } from "./extrasVocabulary.js";
import { runRole } from "./runRole.js";

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
export const EXERCISE_MINER_PROMPT_PATH = resolve(
  join(MODULE_DIR, "..", "..", "docs", "exercise-miner-prompt.md"),
);

export const ROLE_ID = "exerciseMiner";

const NO_EARLIER = "(this is the book's first lesson — there is no earlier vocabulary)";

/** The prompt for one chapter's exercises. */
export function renderExerciseMinerPrompt({
  chapterFilePath,
  blocks,
  baseItems,
  earlierItems = [],
  targetLanguage,
}) {
  const earlier = vocabularyForPrompt(earlierItems);
  return renderPromptTemplate(EXERCISE_MINER_PROMPT_PATH, {
    TARGET_LANGUAGE: targetLanguage,
    CHAPTER_FILE_PATH: chapterFilePath,
    CATEGORY_LIST: CATEGORIES.map((c) => `- ${c}`).join("\n"),
    CARD_FACES: renderCardFacesBlock(),
    BASE_VOCABULARY: JSON.stringify(vocabularyForPrompt(baseItems), null, 2),
    EARLIER_VOCABULARY: earlier.length
      ? ["```json", JSON.stringify(earlier, null, 2), "```"].join("\n")
      : NO_EARLIER,
    BLOCKS_JSON: JSON.stringify(
      blocks.map((b) => (typeof b === "string" ? b : `${b.kind} ${b.numeral}`)),
      null,
      2,
    ),
  });
}

/** The label a block is accounted for by, so the prompt and the check agree on one spelling. */
export function blockLabel(block) {
  return typeof block === "string" ? block : `${block.kind} ${block.numeral}`;
}

/**
 * Rejects a response that did not account for every exercise block it was given.
 *
 * A block may appear under `blocks` or under `skipped`: skipping for an untaught word is a correct
 * outcome and must not be indistinguishable from never reaching the block.
 */
export function assertBlocksAccountedFor(blocks, { blocks: reported = [], skipped = [] } = {}) {
  const want = blocks.map(blockLabel);
  const seen = new Set([...reported.map((b) => b.block), ...skipped.map((s) => s.block)]);
  const missing = want.filter((label) => !seen.has(label));
  if (missing.length) {
    throw new Error(
      `exercise miner did not account for block(s): ${missing.join(", ")}. ` +
        `A block nobody reached and a block that held nothing look identical otherwise.`,
    );
  }
  const extra = [...seen].filter((label) => !want.includes(label));
  if (extra.length) {
    throw new Error(`exercise miner reported block(s) it was not given: ${extra.join(", ")}`);
  }
  return reported;
}

/**
 * Mines one chapter's exercises. Returns `{ items, blocks, skipped, unteachable }`.
 *
 * `unteachable` is a REPORT, never a filter. Substring containment over a space-free script cannot be
 * certain, so a silent drop would remove a good sentence for a bad reason and say nothing about it.
 */
export function mineExercises({
  chapterFilePath,
  blocks = [],
  baseItems = [],
  earlierItems = [],
  targetLanguage,
  runClaude,
} = {}) {
  if (!chapterFilePath || !existsSync(chapterFilePath)) {
    throw new Error(`exercise miner needs a chapter file that exists: ${chapterFilePath}`);
  }
  if (!blocks.length) return { items: [], blocks: [], skipped: [], unteachable: [] };

  const prompt = renderExerciseMinerPrompt({
    chapterFilePath,
    blocks,
    baseItems,
    earlierItems,
    targetLanguage,
  });
  const parsed = JSON.parse(
    extractJsonObjectText(runRole(ROLE_ID, prompt, runClaude ? { runClaude } : {})),
  );
  assertBlocksAccountedFor(blocks, parsed);

  const items = (Array.isArray(parsed.items) ? parsed.items : []).map((item) => ({
    ...item,
    producedBy: ROLE_ID,
  }));
  const taught = teachableVocabulary({ baseItems, earlierItems }, targetLanguage);

  return {
    items,
    blocks: parsed.blocks ?? [],
    skipped: parsed.skipped ?? [],
    unteachable: findUnteachable(items, taught, { languageCode: targetLanguage }),
  };
}
