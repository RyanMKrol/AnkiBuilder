// The example-sentence miner: the chapter's own model sentences, and the few dialogue lines that
// earn a card.
//
// TWO SOURCES, TWO RULES, AND THE SECOND IS A DELIBERATE NARROWING OF A v1 BAN.
//
// Key Sentences and grammar examples are the chapter's curated core: the author chose them, numbered
// them, and the rest of the chapter refers back to them. There is no cap on those.
//
// The dialogue is different, and v1 banned it outright with good reasoning: a modeled conversation is
// written for listening and rehearsal, so walking it line by line yields reactions, backchannels and
// recap lines that nobody can study alone. That ban was correct about the failure and too wide about
// the remedy. Measured on a real chapter, its dialogues produced zero cards while holding the only
// utterance demonstrating the chapter's own grammar point, and the extras pass then re-added those
// lines by hand months later with reviewNotes saying exactly that.
//
// So the ban is narrowed rather than lifted, and the narrowing has teeth: a dialogue line must NAME
// the form it uniquely demonstrates, at most four come from any one dialogue, and reactions are still
// refused. `assertDialogueEarnsItsPlace` enforces the first two, because a rule that only lives in a
// prompt is a rule that holds until the day it does not.

import { existsSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import { renderPromptTemplate, extractJsonObjectText } from "../util/promptTemplate.js";
import { renderCardFacesBlock } from "../deck/cardFaces.js";
import { CATEGORIES } from "../model/categories.js";
import { teachableVocabulary, findUnteachable, vocabularyForPrompt } from "./extrasVocabulary.js";
import { runRole } from "./runRole.js";

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
export const EXAMPLE_SENTENCE_MINER_PROMPT_PATH = resolve(
  join(MODULE_DIR, "..", "..", "docs", "example-sentence-miner-prompt.md"),
);

export const ROLE_ID = "exampleSentenceMiner";

/** How many lines any one dialogue may contribute, however good the rest are. */
export const DIALOGUE_CAP = 4;

export const SOURCES = Object.freeze(["key-sentence", "grammar-example", "dialogue"]);

const NO_EARLIER = "(this is the book's first lesson — there is no earlier vocabulary)";

export function renderExampleSentenceMinerPrompt({
  chapterFilePath,
  sections,
  baseItems,
  earlierItems = [],
  targetLanguage,
}) {
  const earlier = vocabularyForPrompt(earlierItems);
  return renderPromptTemplate(EXAMPLE_SENTENCE_MINER_PROMPT_PATH, {
    TARGET_LANGUAGE: targetLanguage,
    CHAPTER_FILE_PATH: chapterFilePath,
    CATEGORY_LIST: CATEGORIES.map((c) => `- ${c}`).join("\n"),
    CARD_FACES: renderCardFacesBlock(),
    BASE_VOCABULARY: JSON.stringify(vocabularyForPrompt(baseItems), null, 2),
    EARLIER_VOCABULARY: earlier.length
      ? ["```json", JSON.stringify(earlier, null, 2), "```"].join("\n")
      : NO_EARLIER,
    SECTIONS_JSON: JSON.stringify(sections, null, 2),
  });
}

/**
 * Enforces the narrowed dialogue rule.
 *
 * Two checks, and both exist because the ban they replace was doing real work. A dialogue line with
 * no `demonstrates` is a line taken because it seemed useful, which is the failure v1 banned the
 * whole source to avoid. More than four from one dialogue means the role is mining rather than
 * selecting, and at that point the chapter is telling it the dialogue is the wrong source.
 */
export function assertDialogueEarnsItsPlace(items) {
  const dialogue = (items ?? []).filter((item) => item.source === "dialogue");

  const unjustified = dialogue.filter((item) => !item.demonstrates?.trim());
  if (unjustified.length) {
    throw new Error(
      `${unjustified.length} dialogue line(s) name no form they uniquely demonstrate: ` +
        `${unjustified
          .slice(0, 3)
          .map((i) => i.target)
          .join(", ")}. A line taken because it seemed ` +
        `useful is what banning the whole dialogue was avoiding.`,
    );
  }

  const perSection = new Map();
  for (const item of dialogue) {
    const key = item.fromSection ?? "(unnamed dialogue)";
    perSection.set(key, (perSection.get(key) ?? 0) + 1);
  }
  const over = [...perSection].filter(([, n]) => n > DIALOGUE_CAP);
  if (over.length) {
    throw new Error(
      `dialogue cap of ${DIALOGUE_CAP} exceeded: ${over.map(([s, n]) => `${s} (${n})`).join(", ")}. ` +
        `Choosing between five means the dialogue is the wrong source for them.`,
    );
  }
  return items;
}

/** Rejects a response that did not account for every section it was given. */
export function assertSectionsAccountedFor(
  sections,
  { sections: reported = [], skipped = [] } = {},
) {
  const seen = new Set([...reported.map((s) => s.section), ...skipped.map((s) => s.section)]);
  const missing = sections.filter((s) => !seen.has(s));
  if (missing.length) {
    throw new Error(
      `example-sentence miner did not account for section(s): ${missing.join(", ")}. ` +
        `A section nobody read and a section that held nothing look identical otherwise.`,
    );
  }
  return reported;
}

/** Mines one chapter's model sentences. Returns `{ items, sections, skipped, unteachable }`. */
export function mineExampleSentences({
  chapterFilePath,
  sections = [],
  baseItems = [],
  earlierItems = [],
  targetLanguage,
  runClaude,
} = {}) {
  if (!chapterFilePath || !existsSync(chapterFilePath)) {
    throw new Error(`example-sentence miner needs a chapter file that exists: ${chapterFilePath}`);
  }
  if (!sections.length) return { items: [], sections: [], skipped: [], unteachable: [] };

  const prompt = renderExampleSentenceMinerPrompt({
    chapterFilePath,
    sections,
    baseItems,
    earlierItems,
    targetLanguage,
  });
  const parsed = JSON.parse(
    extractJsonObjectText(runRole(ROLE_ID, prompt, runClaude ? { runClaude } : {})),
  );
  assertSectionsAccountedFor(sections, parsed);

  const items = (Array.isArray(parsed.items) ? parsed.items : []).map((item) => ({
    ...item,
    producedBy: ROLE_ID,
  }));
  assertDialogueEarnsItsPlace(items);

  const taught = teachableVocabulary({ baseItems, earlierItems }, targetLanguage);
  return {
    items,
    sections: parsed.sections ?? [],
    skipped: parsed.skipped ?? [],
    unteachable: findUnteachable(items, taught, { languageCode: targetLanguage }),
  };
}
