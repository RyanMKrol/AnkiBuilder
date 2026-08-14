import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join, resolve } from "path";
import { listChapters, extractChapterToFile } from "./epubArchive.js";
import { hashEpubFile, chapterCachePath, loadTaughtIndex, saveTaughtIndex } from "./epubLibrary.js";
import { runTaughtIndexClaude as defaultRunClaude } from "./epubLlmRunClaude.js";
import { extractJsonObjectText } from "../util/promptTemplate.js";

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));

// Lives in docs/ (not src/) for the same reason as the other prompts — a
// plain, human-editable Markdown file meant to be tuned by hand.
const DEFAULT_TEMPLATE_PATH = resolve(
  join(MODULE_DIR, "..", "..", "docs", "epub-taught-index-prompt.md"),
);

function substitute(template, values) {
  let rendered = template;
  for (const [key, value] of Object.entries(values)) {
    rendered = rendered.split(`{{${key}}}`).join(value);
  }
  return rendered;
}

export function renderTaughtIndexPrompt({
  targetLanguage,
  chapterFilePaths,
  templatePath = DEFAULT_TEMPLATE_PATH,
} = {}) {
  if (!targetLanguage) {
    throw new Error("targetLanguage is required");
  }
  if (!chapterFilePaths || chapterFilePaths.length === 0) {
    throw new Error("chapterFilePaths is required and must be non-empty");
  }

  const template = readFileSync(templatePath, "utf-8");
  const rendered = substitute(template, {
    TARGET_LANGUAGE: targetLanguage,
    CHAPTER_COUNT: String(chapterFilePaths.length),
    CHAPTER_FILE_PATHS: chapterFilePaths
      .map(({ number, path }) => `- chapter ${number}: ${path}`)
      .join("\n"),
  });

  const unresolved = rendered.match(/\{\{[A-Z_]+\}\}/);
  if (unresolved) {
    throw new Error(`Prompt template has an unresolved placeholder: ${unresolved[0]}`);
  }

  return rendered;
}

/**
 * Parses and VERIFIES a taught-index response against the spine. The prompt tells the
 * model every chapter must appear (empty `teaches` allowed); this is the mechanical
 * check behind that sentence — a missing chapter means the model skipped part of the
 * book, and an index silently missing chapters would produce confident wrong "not
 * taught later" answers for every lesson that consults it.
 */
export function parseTaughtIndexResponse(raw, spineChapterNumbers) {
  const parsed = JSON.parse(extractJsonObjectText(raw));

  if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.chapters)) {
    throw new Error('model response must be a JSON object with a "chapters" array');
  }

  for (const entry of parsed.chapters) {
    if (
      typeof entry !== "object" ||
      entry === null ||
      typeof entry.chapter !== "number" ||
      (entry.label !== undefined && entry.label !== null && typeof entry.label !== "string") ||
      !Array.isArray(entry.teaches) ||
      entry.teaches.some((t) => typeof t !== "string")
    ) {
      throw new Error(
        'each "chapters" entry must have a number chapter, an optional string/null label, and a string array teaches',
      );
    }
  }

  const covered = new Set(parsed.chapters.map((entry) => entry.chapter));
  const missing = spineChapterNumbers.filter((number) => !covered.has(number));
  if (missing.length > 0) {
    throw new Error(
      `taught index is missing ${missing.length} chapter(s) of the spine (${missing.join(", ")}) — ` +
        `the model did not cover the whole book`,
    );
  }

  return {
    chapters: parsed.chapters
      .map((entry) => ({
        chapter: entry.chapter,
        label: entry.label ?? null,
        teaches: entry.teaches,
      }))
      .sort((a, b) => a.chapter - b.chapter),
  };
}

/**
 * Loads the book's cached taught-content index, building it (ONE whole-book model
 * call, cached under the EPUB's content hash beside conventions.md) when absent.
 * Returns null when the build fails — the caller decides its own fallback; this
 * never throws.
 *
 * The one-time cost mirrors analyzeBookConventions; every later assemble's forward
 * pass then consults the compact index instead of re-reading all later chapters
 * (which repeated a near-whole-book read per lesson, O(n²) over a book's build).
 */
export function ensureTaughtIndex({
  epubPath,
  targetLanguage,
  runClaude = defaultRunClaude,
  libraryHomeDir,
  log = () => {},
} = {}) {
  const epubHash = hashEpubFile(epubPath);

  const cached = loadTaughtIndex(epubHash, { libraryHomeDir });
  if (cached) {
    return cached;
  }

  try {
    const { chapters } = listChapters(epubPath);
    const chapterFilePaths = chapters.map((chapter) => ({
      number: chapter.number,
      path: extractChapterToFile(
        epubPath,
        chapter.number,
        chapterCachePath(epubHash, chapter.number, { libraryHomeDir }),
      ),
    }));

    log(
      `taught index: building once for this book — one model pass over all ${chapters.length} chapter(s)`,
    );
    const prompt = renderTaughtIndexPrompt({ targetLanguage, chapterFilePaths });
    const index = parseTaughtIndexResponse(
      runClaude(prompt),
      chapters.map((chapter) => chapter.number),
    );

    saveTaughtIndex(epubHash, index, { libraryHomeDir });
    return index;
  } catch (error) {
    log(`taught index: build failed (${error.message}) — not cached`);
    return null;
  }
}
