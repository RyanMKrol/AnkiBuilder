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
 * Checks a response accounted for every exercise block it was given. Returns what it said about
 * blocks it was NOT given, which is a report rather than a rejection.
 *
 * A block may appear under `blocks` or under `skipped`: skipping for an untaught word is a correct
 * outcome and must not be indistinguishable from never reaching the block. THAT is worth refusing a
 * response over, because a block nobody reached leaves no trace otherwise.
 *
 * **An UNASKED-FOR block is not the same failure and must not be treated as one.** The miner is
 * given the chapter's numbered blocks; the chapter also has named sections, and naming one of those
 * is a model reading slightly outside its remit, not inventing coverage it does not have. Refusing
 * over it threw away this miner's entire output and the six agent steps queued behind it, on a
 * chapter whose only sin was having a TARGET DIALOGUE section next to its EXERCISES. The items it
 * found are kept, because union-for-existence is this phase's whole design and a surplus sentence
 * costs a reviewer one click while a lost one is invisible. The stray label is returned so the run
 * report can name it.
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
  return { reported, unaskedFor: [...seen].filter((label) => !want.includes(label)) };
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
  const { unaskedFor } = assertBlocksAccountedFor(blocks, parsed);

  const items = (Array.isArray(parsed.items) ? parsed.items : []).map((item) => ({
    ...item,
    producedBy: ROLE_ID,
  }));
  const taught = teachableVocabulary({ baseItems, earlierItems }, targetLanguage);

  return {
    items,
    blocks: parsed.blocks ?? [],
    skipped: parsed.skipped ?? [],
    // Blocks the miner named that it was never given. A report, so the run says so rather than the
    // phase dying over it; see assertBlocksAccountedFor.
    unaskedFor,
    unteachable: findUnteachable(items, taught, { languageCode: targetLanguage }),
  };
}
