import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "fs";
import { join, dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { renderPromptTemplate } from "../../src/util/promptTemplate.js";

// Golden checks on the hand-editable prompt templates in docs/. The renderers throw on an
// UNRESOLVED placeholder, but a placeholder that gets DELETED in a hand edit fails silently —
// the model simply never receives that input (cards, conventions, the chapter path), and the
// first anyone hears of it is a bad paid build. This pins each template's required placeholder
// set and its output-format contract.

const DOCS = resolve(join(dirname(fileURLToPath(import.meta.url)), "..", "..", "docs"));

// The contract per template: which {{PLACEHOLDERS}} its renderer substitutes, and a phrase from
// its output-format section that downstream parsing depends on. Extending a template is fine;
// removing any of these means the corresponding pass is flying blind.
const TEMPLATES = {
  "epub-extraction-prompt.md": {
    placeholders: [
      "TARGET_LANGUAGE",
      "CHAPTER_FILE_PATH",
      "BOOK_CONVENTIONS",
      "CATEGORY_LIST",
      "CARD_FACES",
    ],
    // The envelope: items plus the model's own account of what it read.
    outputContract: /"items"[\s\S]*"coverage"/,
  },
  "inventive-author-prompt.md": {
    placeholders: [
      "TARGET_LANGUAGE",
      "PRIOR_COUNT",
      "ALLOWANCE",
      "ALLOWANCE_HALF",
      "CATEGORY_LIST",
      "CARD_FACES",
      "EXISTING_SENTENCES",
      "BASE_VOCABULARY",
      "EARLIER_VOCABULARY",
    ],
    // `usedAllowance` keeps the ceiling in the role's own answer rather than only in the checker.
    outputContract: /"items"[\s\S]*"usedAllowance"/,
  },
  "gap-author-prompt.md": {
    placeholders: [
      "TARGET_LANGUAGE",
      "CHAPTER_FILE_PATH",
      "EXAMPLES_WANTED",
      "CATEGORY_LIST",
      "CARD_FACES",
      "GAPS_JSON",
      "BASE_VOCABULARY",
      "EARLIER_VOCABULARY",
    ],
    // The envelope: sentences that close gaps, and the gaps deliberately left open. Losing
    // `unfillable` makes "this hole needs an untaught word" indistinguishable from silence.
    outputContract: /"items"[\s\S]*"unfillable"/,
  },
  "example-sentence-miner-prompt.md": {
    placeholders: [
      "TARGET_LANGUAGE",
      "CHAPTER_FILE_PATH",
      "CATEGORY_LIST",
      "CARD_FACES",
      "BASE_VOCABULARY",
      "EARLIER_VOCABULARY",
      "SECTIONS_JSON",
    ],
    outputContract: /"items"[\s\S]*"sections"[\s\S]*"skipped"/,
  },
  "fill-in-blank-miner-prompt.md": {
    placeholders: [
      "TARGET_LANGUAGE",
      "CHAPTER_FILE_PATH",
      "CATEGORY_LIST",
      "CARD_FACES",
      "BASE_VOCABULARY",
      "EARLIER_VOCABULARY",
    ],
    // The envelope: sentences, the frames they came from with offered-vs-kept counts, and the
    // fillers skipped for want of taught vocabulary.
    outputContract: /"items"[\s\S]*"frames"[\s\S]*"skipped"/,
  },
  "exercise-miner-prompt.md": {
    placeholders: [
      "TARGET_LANGUAGE",
      "CHAPTER_FILE_PATH",
      "CATEGORY_LIST",
      "CARD_FACES",
      "BASE_VOCABULARY",
      "EARLIER_VOCABULARY",
      "BLOCKS_JSON",
    ],
    // The envelope: sentences, a line per block, and the blocks deliberately skipped. Losing
    // `skipped` would make "this drill needed an untaught word" indistinguishable from silence.
    outputContract: /"items"[\s\S]*"blocks"[\s\S]*"skipped"/,
  },
  "coverage-adversary-prompt.md": {
    // Deliberately NO category list, card faces or book hints: this role enumerates the source, it
    // does not author cards, and anything derived from the corpus would anchor it to the answer it
    // exists to check independently.
    placeholders: ["TARGET_LANGUAGE", "CHAPTER_FILE_PATH", "IMAGE_COUNT", "IMAGE_PATHS"],
    outputContract: /"items"[\s\S]*"coverage"/,
  },
  "image-specialist-prompt.md": {
    placeholders: ["TARGET_LANGUAGE", "CATEGORY_LIST", "CARD_FACES", "BOOK_HINTS", "IMAGES_JSON"],
    // The envelope: what the pictures teach, plus a verdict for every one of them. Losing the
    // second half makes a skipped chart indistinguishable from a chapter that had none.
    outputContract: /"items"[\s\S]*"verdicts"/,
  },
  "chapter-reader-prompt.md": {
    placeholders: [
      "TARGET_LANGUAGE",
      "CHAPTER_FILE_PATH",
      "CATEGORY_LIST",
      "CARD_FACES",
      "BOOK_HINTS",
      "SECTIONS_JSON",
    ],
    // The envelope: words found, plus a line per heading. Losing the second half puts back the
    // short read that a chapter's own bounds cannot detect.
    outputContract: /"items"[\s\S]*"sections"/,
  },
  "table-specialist-prompt.md": {
    placeholders: ["TARGET_LANGUAGE", "CATEGORY_LIST", "CARD_FACES", "BOOK_HINTS", "TABLES_JSON"],
    // The envelope: entries read, plus a verdict for every table it was shown. Losing the second
    // half would put back the silence this role exists to remove.
    outputContract: /"items"[\s\S]*"tables"/,
  },
  "epub-book-conventions-prompt.md": {
    placeholders: ["TARGET_LANGUAGE", "CHAPTER_COUNT", "CHAPTER_FILE_PATHS"],
  },
  "epub-taught-index-prompt.md": {
    placeholders: ["TARGET_LANGUAGE", "CHAPTER_COUNT", "CHAPTER_FILE_PATHS"],
    outputContract: /"chapters"/,
  },
  "epub-forward-flag-prompt.md": {
    placeholders: [
      "TARGET_LANGUAGE",
      "CHAPTER_NUMBER",
      "ITEM_COUNT",
      "CANDIDATE_ITEMS_JSON",
      "LATER_CHAPTER_FILE_PATHS",
      "BOOK_CONVENTIONS",
    ],
    outputContract: /"flag"/,
  },
  "epub-forward-flag-index-prompt.md": {
    placeholders: [
      "TARGET_LANGUAGE",
      "CHAPTER_NUMBER",
      "ITEM_COUNT",
      "CANDIDATE_ITEMS_JSON",
      "LATER_CHAPTERS_INDEX_JSON",
      "BOOK_CONVENTIONS",
    ],
    outputContract: /"flag"/,
  },
  "fill-in-blank-prompt.md": {
    placeholders: [
      "TARGET_LANGUAGE",
      "SOURCE_INSTRUCTION",
      "CARDS_JSON",
      "EARLIER_VOCAB",
      "TARGET_COUNT",
      "COUNTER_EXAMPLES",
      "ROMANIZATION_STYLE_RULES",
      "CARD_FACES",
    ],
    outputContract: /"cards"/,
  },
  "number-reading-prompt.md": {
    placeholders: ["TARGET_LANGUAGE", "CARDS_JSON", "COUNTER_EXAMPLES", "ROMANIZATION_STYLE_RULES"],
    outputContract: /"fixes"/,
  },
  "cross-lesson-note-prompt.md": {
    placeholders: [
      "TARGET_LANGUAGE",
      "CURRENT_LESSON",
      "EARLIER_LESSONS",
      "CARDS_JSON",
      "EARLIER_DIGEST_JSON",
    ],
    outputContract: /"notes"/,
  },
  "pedagogical-sort-prompt.md": {
    placeholders: ["TARGET_LANGUAGE", "ITEM_COUNT", "ITEMS_JSON", "BOOK_CONVENTIONS"],
  },
  "semantic-dedup-prompt.md": {
    placeholders: ["TARGET_LANGUAGE", "CARDS_JSON"],
  },
  // The four prompts that used to be string arrays inside src/translate/. They touch every card in
  // every deck, and until they moved here nobody could edit one without a code change and nothing
  // held them to a contract.
  "translate-full-prompt.md": {
    placeholders: ["TARGET_LANGUAGE", "STYLE_RULES", "ITEM_COUNT", "INPUT_JSON"],
    outputContract: /"pronunciation"/,
  },
  "translate-target-only-prompt.md": {
    placeholders: [
      "TARGET_LANGUAGE",
      "TARGET_SCRIPT_RULE",
      "TARGET_SCRIPT_REMINDER",
      "STYLE_RULES",
      "ITEM_COUNT",
      "INPUT_JSON",
    ],
    outputContract: /Do not include a `pronunciation` key/,
  },
  "translate-pronunciation-prompt.md": {
    placeholders: ["TARGET_LANGUAGE", "ITEM_COUNT", "INPUT_JSON"],
    outputContract: /Do not include a `target` key/,
  },
  "romanization-prompt.md": {
    // Everything language-specific is a placeholder, and that is the point: the Japanese exemplars
    // and the sokuon rule used to be written into the template, so a Hindi or Arabic run was shown
    // ろっかい / こんにちは and told about kana. A few-shot example beats a one-line instruction, so
    // the model was anchored on the wrong task. Losing any of these puts that back.
    placeholders: [
      "TARGET_LANGUAGE",
      "ROMANIZATION_SYSTEM",
      "LIBRARY_INPUT_CLAUSE",
      "LIBRARY_FAILURE_MODES",
      "ROMANIZATION_STYLE_RULES",
      "EXAMPLE_INPUT",
      "EXAMPLE_OUTPUT",
      "ITEM_COUNT",
      "INPUT_JSON",
    ],
    outputContract: /"pronunciation"/,
  },
};

for (const [file, contract] of Object.entries(TEMPLATES)) {
  test(`prompt template ${file} keeps its placeholders and output contract`, () => {
    const text = readFileSync(join(DOCS, file), "utf-8");
    for (const name of contract.placeholders) {
      assert.ok(
        text.includes(`{{${name}}}`),
        `${file} lost its {{${name}}} placeholder — the pass would run without that input`,
      );
    }
    if (contract.outputContract) {
      assert.match(text, contract.outputContract, `${file} lost its output-format contract`);
    }
  });
}

test("every *-prompt.md template in docs/ is covered by this golden check", () => {
  const promptFiles = readdirSync(DOCS).filter(
    (f) => f.endsWith("-prompt.md") || f.endsWith("-prompts.md"),
  );
  // translate-prompts.md is the prose GUIDE to the translate family (which prompt runs when, and
  // why), not a rendered template — it has no placeholders to pin. The prompts it used to
  // transcribe are now real templates in this map, which is what stopped the transcript drifting.
  const uncovered = promptFiles.filter((f) => f !== "translate-prompts.md" && !TEMPLATES[f]);
  assert.deepEqual(uncovered, [], "add new templates to the TEMPLATES map above");
});

// ---------------------------------------------------------------------------
// The shared card rules, and the classification that keeps them shared.
// ---------------------------------------------------------------------------

// Prompts that deliberately carry NO card rules, each with the reason. A prompt is in this map or it
// carries the marker; there is no third state, so a prompt added later cannot opt out by being new.
//
// The test that enumerates docs/ is the whole mechanism. `card-authoring-rules.md` claimed for a year
// to govern "every pass that writes cards" and nothing made that true, which is how the extraction
// prompt came to protect irregular forms from sampling while the semantic de-dup prompt had never
// heard the word and deleted one as a repeat.
const NO_CARD_RULES = {
  "epub-book-conventions-prompt.md": "writes a prose doc about the book; it authors no card",
  "epub-taught-index-prompt.md": "writes a whole-book index of what each chapter introduces",
  "epub-forward-flag-prompt.md": "flags items as possibly premature; it never edits card content",
  "epub-forward-flag-index-prompt.md": "the same pass, reading the taught index instead",
  "pedagogical-sort-prompt.md": "a permutation of items that already exist; it writes no field",
};

test("every prompt either carries the shared card rules or is classified as not needing them", () => {
  const prompts = readdirSync(DOCS).filter((name) => name.endsWith("-prompt.md"));
  assert.ok(prompts.length > 15, "sanity: the prompt set was found");

  for (const name of prompts) {
    const text = readFileSync(join(DOCS, name), "utf-8");
    const carries = text.includes("{{CARD_RULES}}");
    const exempt = name in NO_CARD_RULES;
    assert.notEqual(
      carries,
      exempt,
      carries
        ? `${name} carries {{CARD_RULES}} and is also listed as exempt — pick one`
        : `${name} neither carries {{CARD_RULES}} nor is listed in NO_CARD_RULES with a reason. ` +
            `If it writes, edits or deletes a card, add the marker; if it does not, say so there.`,
    );
  }
});

test("every exemption states a reason, so the list cannot grow silently", () => {
  for (const [name, reason] of Object.entries(NO_CARD_RULES)) {
    assert.ok(reason && reason.length > 20, `${name} needs a real reason, not a placeholder`);
  }
});

test("the rules actually reach a rendered prompt, and carry the rule the incident was about", () => {
  // The one that caused this: extraction protected forms the source marks irregular, semantic de-dup
  // never mentioned them, and a correctly-mined irregular card was deleted as a pattern repeat.
  const rendered = renderPromptTemplate(join(DOCS, "semantic-dedup-prompt.md"), {
    TARGET_LANGUAGE: "Japanese",
    CARDS_JSON: "[]",
  });
  assert.ok(!rendered.includes("{{CARD_RULES}}"), "the marker was substituted, not left literal");
  assert.match(rendered, /irregular/i);
  assert.match(rendered, /never optional and never redundant/i);
});
