import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join, resolve } from "path";
import { listChapters, extractChapterToFile } from "./epubArchive.js";
import { hashEpubFile, chapterCachePath } from "./epubLibrary.js";
import { runClaude as defaultRunClaude } from "./epubLlmRunClaude.js";

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));

// Lives in docs/ (not src/) for the same reason as the extraction prompt —
// a plain, human-editable Markdown file meant to be tuned by hand.
const DEFAULT_TEMPLATE_PATH = resolve(
  join(MODULE_DIR, "..", "..", "docs", "epub-forward-flag-prompt.md"),
);

const NO_BOOK_CONVENTIONS = "(no book-wide conventions available for this source)";

function substitute(template, values) {
  let rendered = template;
  for (const [key, value] of Object.entries(values)) {
    rendered = rendered.split(`{{${key}}}`).join(value);
  }
  return rendered;
}

export function renderForwardFlagPrompt({
  targetLanguage,
  chapterNumber,
  candidateItems,
  laterChapterFilePaths,
  bookConventions = null,
  templatePath = DEFAULT_TEMPLATE_PATH,
} = {}) {
  const template = readFileSync(templatePath, "utf-8");
  const candidateData = candidateItems.map(({ id, english, target }) => ({ id, english, target }));

  const rendered = substitute(template, {
    TARGET_LANGUAGE: targetLanguage,
    CHAPTER_NUMBER: String(chapterNumber),
    ITEM_COUNT: String(candidateItems.length),
    CANDIDATE_ITEMS_JSON: JSON.stringify(candidateData, null, 2),
    LATER_CHAPTER_FILE_PATHS: laterChapterFilePaths.map((path) => `- ${path}`).join("\n"),
    BOOK_CONVENTIONS: bookConventions || NO_BOOK_CONVENTIONS,
  });

  const unresolved = rendered.match(/\{\{[A-Z_]+\}\}/);
  if (unresolved) {
    throw new Error(`Prompt template has an unresolved placeholder: ${unresolved[0]}`);
  }

  return rendered;
}

// The model is asked for raw JSON but may deviate: wrapping it in a markdown
// fence, or prefacing it with a plain-prose sentence and no fence at all
// (e.g. "Confirmed — chapter 56 is the glossary... {"flag": []}"). Handle
// both: prefer a fenced block if present, otherwise take the span from the
// first "{" to the last "}" rather than requiring the ENTIRE response to be
// JSON, since that's what actually shows up when a model narrates first.
function extractJsonObjectText(raw) {
  const fenceMatch = raw.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
  if (fenceMatch) {
    return fenceMatch[1];
  }

  const firstBrace = raw.indexOf("{");
  const lastBrace = raw.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return raw.slice(firstBrace, lastBrace + 1);
  }

  return raw.trim();
}

function parseForwardFlagResponse(raw) {
  const parsed = JSON.parse(extractJsonObjectText(raw));

  if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.flag)) {
    throw new Error('model response must be a JSON object with a "flag" array');
  }

  for (const entry of parsed.flag) {
    if (
      typeof entry !== "object" ||
      entry === null ||
      typeof entry.id !== "string" ||
      typeof entry.reason !== "string" ||
      (entry.laterChapter !== undefined && typeof entry.laterChapter !== "number")
    ) {
      throw new Error(
        'each "flag" entry must have a string id and reason, and an optional number laterChapter',
      );
    }
  }

  return parsed.flag;
}

function noteWithFlag(existingNotes, reason, laterChapter) {
  const concern =
    laterChapter !== undefined
      ? `Possibly premature — explicitly taught later in chapter ${laterChapter} (${reason})`
      : `Possibly premature — ${reason}`;
  return existingNotes ? `${existingNotes} | ${concern}` : concern;
}

/**
 * Forward-looking, LLM-driven, non-destructive review. Materializes every
 * later chapter of the book to a cache file (shared with the current-chapter
 * extraction cache — see epubLibrary.js's chapterCachePath) and asks a
 * Sonnet-medium model to flag which candidate items look premature for this
 * point in the book — either because a later chapter explicitly re-teaches
 * them, or because they rely on grammar/vocabulary not yet introduced.
 * Flagged items are never removed: they come back with `uncertain: true` and
 * a "Possibly premature — ..." note appended, so the human reviewer sees and
 * decides, rather than the item silently vanishing before review.
 *
 * Returns `{ items, flagged }`: `items` is `candidateItems` in the same
 * order and count, annotated where flagged; `flagged` is the subset actually
 * flagged, each paired with its original (pre-annotation) item, for logging.
 *
 * No-ops (returns candidateItems unchanged, `flagged: []`) when there's
 * nothing to check — either candidateItems is empty, or chapterNumber is
 * already the last chapter in the book — without ever invoking runClaude.
 * Fails open on any parse/shape/thrown error: logs a warning naming the
 * actual failure and returns candidateItems unannotated, never blocking
 * assemble.
 */
export function flagForwardConcerns({
  candidateItems,
  epubPath,
  chapterNumber,
  targetLanguage,
  bookConventions = null,
  log = () => {},
  runClaude = defaultRunClaude,
  libraryHomeDir,
} = {}) {
  if (candidateItems.length === 0) {
    return { items: candidateItems, flagged: [] };
  }

  const { chapters } = listChapters(epubPath);
  const laterChapters = chapters.filter((chapter) => chapter.number > chapterNumber);

  if (laterChapters.length === 0) {
    log(`chapter ${chapterNumber} is the last chapter — forward flag pass skipped`);
    return { items: candidateItems, flagged: [] };
  }

  const epubHash = hashEpubFile(epubPath);
  const laterChapterFilePaths = laterChapters.map((chapter) => {
    const dest = chapterCachePath(epubHash, chapter.number, { libraryHomeDir });
    return extractChapterToFile(epubPath, chapter.number, dest);
  });

  const lastChapterNumber = chapters[chapters.length - 1].number;
  log(
    `forward flag pass: checking ${candidateItems.length} item(s) against chapters ` +
      `${chapterNumber + 1}-${lastChapterNumber}`,
  );

  const prompt = renderForwardFlagPrompt({
    targetLanguage,
    chapterNumber,
    candidateItems,
    laterChapterFilePaths,
    bookConventions,
  });

  let flagEntries;
  try {
    flagEntries = parseForwardFlagResponse(runClaude(prompt));
  } catch (error) {
    log(`forward flag pass: failed (${error.message}) — leaving all items unflagged by this pass`);
    return { items: candidateItems, flagged: [] };
  }

  const flagById = new Map(flagEntries.map((entry) => [entry.id, entry]));
  const flagged = [];
  const items = candidateItems.map((item) => {
    const entry = flagById.get(item.id);
    if (!entry) {
      return item;
    }
    flagged.push({ item, reason: entry.reason, laterChapter: entry.laterChapter });
    return {
      ...item,
      uncertain: true,
      notes: noteWithFlag(item.notes, entry.reason, entry.laterChapter),
    };
  });

  return { items, flagged };
}
