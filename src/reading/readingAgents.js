// The reading deck's four agents (docs/designs/reading-decks/06-reading-extraction.md): three readers
// that overlap on purpose (tables, the whole chapter, images) and an adversary that enumerates the
// chapter on its own and is never shown what the readers found. Each is phase 1's role of the same
// shape, with a reading prompt: every one carries docs/card-rules-reading.md and the language
// plugin's block, and none carries the speaking rules (a test holds the prompts to that).
//
// `runClaude` is injectable everywhere, so tests never spawn a model.

import { existsSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import { renderPromptTemplate, extractJsonObjectText } from "../util/promptTemplate.js";
import { renderReadingCardFacesBlock } from "../deck/cardFaces.js";
import { CATEGORIES } from "../model/categories.js";
import { renderBookHints } from "../corpus/bookConfig.js";
import { runRole } from "../agents/runRole.js";
import { readingLanguageBlock } from "./readingSchemes.js";
import { sectionTitleKey } from "../corpus/chapterOutline.js";

const DOCS = resolve(join(dirname(fileURLToPath(import.meta.url)), "..", "..", "docs"));
export const READING_PROMPTS = Object.freeze({
  table: join(DOCS, "reading-table-prompt.md"),
  chapter: join(DOCS, "reading-chapter-prompt.md"),
  image: join(DOCS, "reading-image-prompt.md"),
  coverage: join(DOCS, "reading-coverage-prompt.md"),
});

export const ITEM_KINDS = Object.freeze(["word", "phrase", "character"]);
export const TABLE_VERDICTS = Object.freeze(["vocabulary", "characters", "other"]);
export const IMAGE_VERDICTS = Object.freeze(["teaches", "decorative", "unreadable"]);

const NO_HINTS = "(no conventions recorded for this book: read it on its own terms)";
const NO_IMAGES = "(this chapter has no images)";

const shared = (targetLanguage, meta) => ({
  TARGET_LANGUAGE: targetLanguage,
  READING_LANGUAGE_RULES: readingLanguageBlock(targetLanguage),
  CARD_FACES: renderReadingCardFacesBlock(),
  CATEGORY_LIST: CATEGORIES.map((c) => `- ${c}`).join("\n"),
  BOOK_HINTS: renderBookHints(meta) ?? NO_HINTS,
});

const imageList = (imagePaths) =>
  imagePaths.length ? ["```", ...imagePaths, "```"].join("\n") : NO_IMAGES;

function parseReply(raw, who) {
  try {
    return JSON.parse(extractJsonObjectText(raw));
  } catch (err) {
    throw new Error(`${who} did not reply with a JSON object: ${err.message}`);
  }
}

/** The items an agent returned, stamped with who produced them; malformed rows are dropped. */
function takeItems(parsed, producedBy) {
  return (Array.isArray(parsed.items) ? parsed.items : [])
    .filter((item) => item && typeof item.target === "string" && item.target.trim())
    .map((item) => ({ ...item, producedBy }));
}

// ---- tables ----------------------------------------------------------------------------------

export function renderReadingTablePrompt({ tables, targetLanguage, meta = null }) {
  const payload = tables.map((table) => ({
    index: table.index,
    className: table.className,
    rows: table.rows.map((row) => row.map((cell) => cell.text)),
  }));
  return renderPromptTemplate(READING_PROMPTS.table, {
    ...shared(targetLanguage, meta),
    TABLES_JSON: JSON.stringify(payload, null, 2),
  });
}

/**
 * Every table given must come back with a verdict. A table nobody judged and a table holding nothing
 * must not look the same, so a missing verdict fails the step; a verdict for a table that does not
 * exist is dropped and reported.
 */
export function assertTablesJudged(tables, verdicts) {
  const given = new Set(tables.map((t) => t.index));
  const seen = new Map();
  const unaskedFor = [];
  for (const verdict of verdicts ?? []) {
    if (!given.has(verdict?.index)) {
      unaskedFor.push(verdict?.index);
      continue;
    }
    if (!TABLE_VERDICTS.includes(verdict.verdict)) {
      throw new Error(
        `reading table reader gave table ${verdict.index} the verdict ` +
          `${JSON.stringify(verdict.verdict)}; one of ${TABLE_VERDICTS.join(", ")}`,
      );
    }
    seen.set(verdict.index, verdict);
  }
  const missing = [...given].filter((index) => !seen.has(index));
  if (missing.length) {
    throw new Error(`reading table reader gave no verdict for table(s) ${missing.join(", ")}`);
  }
  return { verdicts: [...seen.values()], unaskedFor };
}

export function readTables({ tables, targetLanguage, meta = null, runClaude } = {}) {
  if (!Array.isArray(tables) || tables.length === 0) return { items: [], tables: [] };
  const prompt = renderReadingTablePrompt({ tables, targetLanguage, meta });
  const parsed = parseReply(
    runRole("readingTableReader", prompt, runClaude ? { runClaude } : {}),
    "the reading table reader",
  );
  const { verdicts, unaskedFor } = assertTablesJudged(tables, parsed.tables);
  return { items: takeItems(parsed, "readingTableReader"), tables: verdicts, unaskedFor };
}

// ---- the whole chapter -----------------------------------------------------------------------

export function renderReadingChapterPrompt({ chapterFilePath, sections, targetLanguage, meta }) {
  return renderPromptTemplate(READING_PROMPTS.chapter, {
    ...shared(targetLanguage, meta),
    CHAPTER_FILE_PATH: chapterFilePath,
    SECTIONS_JSON: JSON.stringify(
      sections.map((s) => ({ title: s.title, level: s.level })),
      null,
      2,
    ),
  });
}

/**
 * Headings the reader did not account for. Counted, because a chapter can repeat a heading, and
 * compared on `sectionTitleKey`, because a heading with furigana parses as "単 語 Vocabulary" and the
 * reader reports "単語 Vocabulary" (the first Lesson 3 run refused a finished response over that).
 */
export function sectionsUnaccounted(sections, reported) {
  const shown = new Map();
  const tally = (titles) =>
    titles.reduce((acc, title) => {
      const key = sectionTitleKey(title);
      if (!shown.has(key)) shown.set(key, title);
      return acc.set(key, (acc.get(key) ?? 0) + 1);
    }, new Map());
  const want = tally(sections.map((s) => s.title));
  const got = tally((reported ?? []).map((s) => s?.title));
  return [...want].filter(([key, n]) => (got.get(key) ?? 0) < n).map(([key]) => shown.get(key));
}

/**
 * The headings the chapter reader must report. A converted book opens every chapter with its own
 * title as the one level-1 heading ("Chapter 03: Numbers") and puts everything under level-2
 * headings beneath it. That title is not a section: on Genki's Numbers the reader reported all five
 * real sections and 37 items, left the title out, and the whole paid response was refused. A title
 * with nothing under it is still a section and must be reported.
 */
export function sectionsToAccountFor(sections) {
  const [first, ...rest] = sections;
  const wrapsChapter = first?.level === 1 && rest.length > 0 && rest.every((s) => s.level > 1);
  return wrapsChapter ? rest : sections;
}

export function readChapterForReading({
  chapterFilePath,
  sections = [],
  targetLanguage,
  meta = null,
  runClaude,
} = {}) {
  if (!chapterFilePath || !existsSync(chapterFilePath)) {
    throw new Error(
      `the reading chapter reader needs a chapter file that exists: ${chapterFilePath}`,
    );
  }
  const prompt = renderReadingChapterPrompt({ chapterFilePath, sections, targetLanguage, meta });
  const parsed = parseReply(
    runRole("readingChapterReader", prompt, runClaude ? { runClaude } : {}),
    "the reading chapter reader",
  );
  const missing = sectionsUnaccounted(sectionsToAccountFor(sections), parsed.sections);
  if (missing.length) {
    throw new Error(
      `the reading chapter reader did not account for section(s): ${missing.join(", ")}. A section ` +
        `that taught nothing and a section nobody reached must not look the same.`,
    );
  }
  return {
    items: takeItems(parsed, "readingChapterReader"),
    sections: parsed.sections ?? [],
    unread: (parsed.sections ?? []).filter((s) => s?.read === false).map((s) => s.title),
  };
}

// ---- images ----------------------------------------------------------------------------------

export function renderReadingImagePrompt({ imagePaths, targetLanguage, meta = null }) {
  return renderPromptTemplate(READING_PROMPTS.image, {
    ...shared(targetLanguage, meta),
    IMAGE_COUNT: String(imagePaths.length),
    IMAGE_PATHS: imageList(imagePaths),
  });
}

export function readImagesForReading({
  imagePaths = [],
  targetLanguage,
  meta = null,
  runClaude,
} = {}) {
  if (imagePaths.length === 0) return { items: [], images: [] };
  const prompt = renderReadingImagePrompt({ imagePaths, targetLanguage, meta });
  const parsed = parseReply(
    runRole("readingImageReader", prompt, runClaude ? { runClaude } : {}),
    "the reading image reader",
  );
  const judged = new Set((parsed.images ?? []).map((i) => i?.path));
  const missing = imagePaths.filter((path) => !judged.has(path));
  if (missing.length) {
    throw new Error(
      `the reading image reader gave no verdict for ${missing.length} image(s): ` +
        `${missing.slice(0, 3).join(", ")}`,
    );
  }
  return { items: takeItems(parsed, "readingImageReader"), images: parsed.images };
}

// ---- the adversary ---------------------------------------------------------------------------

/**
 * The adversary's prompt. It takes the chapter and the images and NOTHING derived from the corpus:
 * there is no parameter here that could carry the readers' output even by accident.
 */
export function renderReadingCoveragePrompt({ chapterFilePath, imagePaths = [], targetLanguage }) {
  return renderPromptTemplate(READING_PROMPTS.coverage, {
    TARGET_LANGUAGE: targetLanguage,
    READING_LANGUAGE_RULES: readingLanguageBlock(targetLanguage),
    CHAPTER_FILE_PATH: chapterFilePath,
    IMAGE_COUNT: String(imagePaths.length),
    IMAGE_PATHS: imageList(imagePaths),
  });
}

export function enumerateForReading({
  chapterFilePath,
  imagePaths = [],
  targetLanguage,
  runClaude,
} = {}) {
  if (!chapterFilePath || !existsSync(chapterFilePath)) {
    throw new Error(
      `the reading coverage adversary needs a chapter file that exists: ${chapterFilePath}`,
    );
  }
  const prompt = renderReadingCoveragePrompt({ chapterFilePath, imagePaths, targetLanguage });
  const parsed = parseReply(
    runRole("readingCoverageAdversary", prompt, runClaude ? { runClaude } : {}),
    "the reading coverage adversary",
  );
  return {
    items: takeItems(parsed, "readingCoverageAdversary"),
    coverage: parsed.coverage ?? null,
  };
}
