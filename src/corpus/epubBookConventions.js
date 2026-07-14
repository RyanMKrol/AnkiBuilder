import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join, resolve } from "path";
import { listChapters, extractChapterToFile } from "./epubArchive.js";
import { hashEpubFile, chapterCachePath } from "./epubLibrary.js";
import { runClaude as defaultRunClaude } from "./epubLlmRunClaude.js";

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));

// Lives in docs/ (not src/) for the same reason as the other prompts — a
// plain, human-editable Markdown file meant to be tuned by hand.
const DEFAULT_TEMPLATE_PATH = resolve(
  join(MODULE_DIR, "..", "..", "docs", "epub-book-conventions-prompt.md"),
);

function substitute(template, values) {
  let rendered = template;
  for (const [key, value] of Object.entries(values)) {
    rendered = rendered.split(`{{${key}}}`).join(value);
  }
  return rendered;
}

export function renderBookConventionsPrompt({
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
    CHAPTER_FILE_PATHS: chapterFilePaths.map((path) => `- ${path}`).join("\n"),
  });

  const unresolved = rendered.match(/\{\{[A-Z_]+\}\}/);
  if (unresolved) {
    throw new Error(`Prompt template has an unresolved placeholder: ${unresolved[0]}`);
  }

  return rendered;
}

/**
 * One-time, whole-book pass: materializes every chapter to the shared
 * extraction cache (chapterCachePath — the same cache assemble/flagForwardConcerns
 * use, so this warms it for them too) and asks a Sonnet-medium model to
 * characterize the book's own structural conventions (placeholder notation,
 * content vs. exercise markup). Returns the raw Markdown text as-is — this
 * pass produces prose, not structured data, so there's nothing to parse.
 */
export function analyzeBookConventions({
  epubPath,
  targetLanguage,
  runClaude = defaultRunClaude,
  libraryHomeDir,
} = {}) {
  const { chapters } = listChapters(epubPath);
  const epubHash = hashEpubFile(epubPath);

  const chapterFilePaths = chapters.map((chapter) => {
    const dest = chapterCachePath(epubHash, chapter.number, { libraryHomeDir });
    return extractChapterToFile(epubPath, chapter.number, dest);
  });

  const prompt = renderBookConventionsPrompt({ targetLanguage, chapterFilePaths });

  return runClaude(prompt);
}
