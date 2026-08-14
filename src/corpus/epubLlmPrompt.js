import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join, resolve } from "path";
import { CATEGORIES } from "../model/categories.js";
import { renderCardFacesBlock } from "../deck/cardFaces.js";

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));

// The template lives in docs/ (not src/) so it stays a plain, human-editable
// Markdown file — the extraction behavior it drives is meant to be tuned by
// hand, not just by code changes. See docs/epub-extraction-prompt.md.
const DEFAULT_TEMPLATE_PATH = resolve(
  join(MODULE_DIR, "..", "..", "docs", "epub-extraction-prompt.md"),
);

function substitute(template, values) {
  let rendered = template;
  for (const [key, value] of Object.entries(values)) {
    rendered = rendered.split(`{{${key}}}`).join(value);
  }
  return rendered;
}

const NO_BOOK_CONVENTIONS = "(no book-wide conventions available for this source)";

/**
 * Renders the LLM chapter-extraction prompt from the Markdown template,
 * substituting {{TARGET_LANGUAGE}}, {{CHAPTER_FILE_PATH}}, {{CATEGORY_LIST}},
 * {{BOOK_CONVENTIONS}} and {{CARD_FACES}} (the real rendered card faces, so the
 * model can see what it is writing into rather than only reading about it). `bookConventions` is optional — when omitted
 * (e.g. the manual --chapter path, which has no book identity to look
 * conventions up under), a plain fallback string is substituted instead of
 * leaving a gap.
 */
export function renderExtractionPrompt({
  targetLanguage,
  chapterFilePath,
  categoryList = CATEGORIES,
  bookConventions = null,
  templatePath = DEFAULT_TEMPLATE_PATH,
} = {}) {
  if (!targetLanguage) {
    throw new Error("targetLanguage is required");
  }
  if (!chapterFilePath) {
    throw new Error("chapterFilePath is required");
  }

  const template = readFileSync(templatePath, "utf-8");
  const rendered = substitute(template, {
    TARGET_LANGUAGE: targetLanguage,
    CHAPTER_FILE_PATH: resolve(chapterFilePath),
    CATEGORY_LIST: categoryList.join(", "),
    BOOK_CONVENTIONS: bookConventions || NO_BOOK_CONVENTIONS,
    CARD_FACES: renderCardFacesBlock(),
  });

  const unresolved = rendered.match(/\{\{[A-Z_]+\}\}/);
  if (unresolved) {
    throw new Error(`Prompt template has an unresolved placeholder: ${unresolved[0]}`);
  }

  return rendered;
}
