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
    placeholders: ["TARGET_LANGUAGE", "CHAPTER_FILE_PATH", "BOOK_CONVENTIONS", "CATEGORY_LIST"],
    // The envelope: items plus the model's own account of what it read.
    outputContract: /"items"[\s\S]*"coverage"/,
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
      "COUNTER_HYPHEN_RULE",
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
  // translate-prompts.md is a hand-maintained MIRROR of prompts that live in code, not a
  // rendered template — it has no placeholders to pin.
  const uncovered = promptFiles.filter((f) => f !== "translate-prompts.md" && !TEMPLATES[f]);
  assert.deepEqual(uncovered, [], "add new templates to the TEMPLATES map above");
});
