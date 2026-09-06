import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "fs";
import { join, dirname, resolve } from "path";
import { fileURLToPath } from "url";

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
