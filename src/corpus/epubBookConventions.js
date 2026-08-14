import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join, resolve } from "path";
import { listChapters, extractChapterToFile } from "./epubArchive.js";
import { hashEpubFile, chapterCachePath } from "./epubLibrary.js";
import { runClaude as defaultRunClaude } from "./epubLlmRunClaude.js";
import { buildArtifactMeta } from "./artifactMeta.js";

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));

// Lives in docs/ (not src/) for the same reason as the other prompts — a
// plain, human-editable Markdown file meant to be tuned by hand.
export const BOOK_CONVENTIONS_PROMPT_PATH = resolve(
  join(MODULE_DIR, "..", "..", "docs", "epub-book-conventions-prompt.md"),
);
const DEFAULT_TEMPLATE_PATH = BOOK_CONVENTIONS_PROMPT_PATH;

// The env-pair prefix this pass's runner honors — recorded in the artifact's provenance so the
// meta says which model actually produced the cached doc, not which one is configured today.
const SCOPE_ENV_PREFIX = "ANKI_BUILDER_EPUB_LLM";

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
 * content vs. exercise markup).
 *
 * Returns `{ markdown, meta }`: the model's prose exactly as it came back (this pass produces
 * prose, not structured data, so there is nothing to parse) plus the provenance record to cache
 * beside it. The caller passes `meta` to `saveBookConventions`, which writes it to
 * `conventions.md.meta.json`; a later assemble compares it against the prompt as it stands then
 * and WARNS if the doc predates a prompt edit.
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

  return {
    markdown: runClaude(prompt),
    meta: buildArtifactMeta({
      templatePath: DEFAULT_TEMPLATE_PATH,
      scopeEnvPrefix: SCOPE_ENV_PREFIX,
      chapterCount: chapterFilePaths.length,
    }),
  };
}
