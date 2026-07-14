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
  join(MODULE_DIR, "..", "..", "docs", "epub-dedup-forward-prompt.md"),
);

function substitute(template, values) {
  let rendered = template;
  for (const [key, value] of Object.entries(values)) {
    rendered = rendered.split(`{{${key}}}`).join(value);
  }
  return rendered;
}

export function renderForwardDedupPrompt({
  targetLanguage,
  chapterNumber,
  candidateItems,
  laterChapterFilePaths,
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
  });

  const unresolved = rendered.match(/\{\{[A-Z_]+\}\}/);
  if (unresolved) {
    throw new Error(`Prompt template has an unresolved placeholder: ${unresolved[0]}`);
  }

  return rendered;
}

/**
 * Backward-looking, deterministic, hard drop — pure function, no I/O.
 * Drops any candidate item whose english (case-insensitive, trimmed) or
 * target (exact, trimmed) matches an item from an earlier chapter of the
 * same book. `priorItems` is expected to carry `__chapterNumber` (see
 * epubLibrary.js's loadPriorChapterItems) so a drop can name which earlier
 * chapter it matched — `dropped[].matchedPriorItem.__chapterNumber`.
 */
export function dedupBackward(candidateItems, priorItems) {
  const priorEnglish = new Map();
  const priorTarget = new Map();
  for (const prior of priorItems) {
    priorEnglish.set(prior.english.trim().toLowerCase(), prior);
    if (prior.target) {
      priorTarget.set(prior.target.trim(), prior);
    }
  }

  const kept = [];
  const dropped = [];
  for (const item of candidateItems) {
    const englishMatch = priorEnglish.get(item.english.trim().toLowerCase());
    const targetMatch = item.target ? priorTarget.get(item.target.trim()) : undefined;
    const match = englishMatch ?? targetMatch;

    if (match) {
      dropped.push({
        item,
        matchedField: englishMatch ? "english" : "target",
        matchedPriorItem: match,
      });
    } else {
      kept.push(item);
    }
  }

  return { kept, dropped };
}

// The model is asked for raw JSON but may wrap it in a markdown fence anyway
// (same deviation observed elsewhere in this pipeline) — strip it before
// parsing rather than failing outright over formatting.
function extractJsonObjectText(raw) {
  const fenceMatch = raw.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
  return fenceMatch ? fenceMatch[1] : raw.trim();
}

function parseForwardResponse(raw) {
  const parsed = JSON.parse(extractJsonObjectText(raw));

  if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.drop)) {
    throw new Error('model response must be a JSON object with a "drop" array');
  }

  for (const entry of parsed.drop) {
    if (
      typeof entry !== "object" ||
      entry === null ||
      typeof entry.id !== "string" ||
      typeof entry.laterChapter !== "number" ||
      typeof entry.reason !== "string"
    ) {
      throw new Error(
        'each "drop" entry must have a string id, a number laterChapter, and a string reason',
      );
    }
  }

  return parsed.drop;
}

/**
 * Forward-looking, LLM-driven, soft drop. Materializes every later chapter
 * of the book to a cache file (shared with the current-chapter extraction
 * cache — see epubLibrary.js's chapterCachePath) and asks a Sonnet-medium
 * model which candidate items are explicitly, deliberately taught in one of
 * them. No-ops (returns candidateItems unchanged) when there's nothing to
 * check — either candidateItems is empty, or chapterNumber is already the
 * last chapter in the book — without ever invoking runClaude. Fails open on
 * any parse/shape/thrown error: logs a warning naming the actual failure and
 * returns candidateItems unpruned by this pass, never blocking assemble.
 */
export function dedupForward({
  candidateItems,
  epubPath,
  chapterNumber,
  targetLanguage,
  log = () => {},
  runClaude = defaultRunClaude,
  libraryHomeDir,
} = {}) {
  if (candidateItems.length === 0) {
    return { kept: candidateItems, dropped: [] };
  }

  const { chapters } = listChapters(epubPath);
  const laterChapters = chapters.filter((chapter) => chapter.number > chapterNumber);

  if (laterChapters.length === 0) {
    log(`chapter ${chapterNumber} is the last chapter — forward dedup pass skipped`);
    return { kept: candidateItems, dropped: [] };
  }

  const epubHash = hashEpubFile(epubPath);
  const laterChapterFilePaths = laterChapters.map((chapter) => {
    const dest = chapterCachePath(epubHash, chapter.number, { libraryHomeDir });
    return extractChapterToFile(epubPath, chapter.number, dest);
  });

  const lastChapterNumber = chapters[chapters.length - 1].number;
  log(
    `forward dedup pass: checking ${candidateItems.length} item(s) against chapters ` +
      `${chapterNumber + 1}-${lastChapterNumber}`,
  );

  const prompt = renderForwardDedupPrompt({
    targetLanguage,
    chapterNumber,
    candidateItems,
    laterChapterFilePaths,
  });

  let dropEntries;
  try {
    dropEntries = parseForwardResponse(runClaude(prompt));
  } catch (error) {
    log(`forward dedup pass: failed (${error.message}) — keeping all items unpruned by this pass`);
    return { kept: candidateItems, dropped: [] };
  }

  const dropById = new Map(dropEntries.map((entry) => [entry.id, entry]));
  const kept = [];
  const dropped = [];
  for (const item of candidateItems) {
    const entry = dropById.get(item.id);
    if (entry) {
      dropped.push({ item, laterChapter: entry.laterChapter, reason: entry.reason });
    } else {
      kept.push(item);
    }
  }

  return { kept, dropped };
}
