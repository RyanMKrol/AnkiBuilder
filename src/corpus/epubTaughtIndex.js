import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join, resolve } from "path";
import { listChapters, extractChapterToFile } from "./epubArchive.js";
import {
  hashEpubFile,
  chapterCachePath,
  loadTaughtIndex,
  saveTaughtIndex,
  taughtIndexPath,
} from "./epubLibrary.js";
import { runTaughtIndexClaude as defaultRunClaude } from "./epubLlmRunClaude.js";
import { extractJsonObjectText } from "../util/promptTemplate.js";
import { buildArtifactMeta, promptDriftWarning } from "./artifactMeta.js";

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));

// Lives in docs/ (not src/) for the same reason as the other prompts — a
// plain, human-editable Markdown file meant to be tuned by hand.
export const TAUGHT_INDEX_PROMPT_PATH = resolve(
  join(MODULE_DIR, "..", "..", "docs", "epub-taught-index-prompt.md"),
);
const DEFAULT_TEMPLATE_PATH = TAUGHT_INDEX_PROMPT_PATH;

// See epubBookConventions.js — the env prefixes and defaults this pass's runner honors
// (runTaughtIndexClaude), narrowest first, recorded in the artifact's provenance. Keep them in step
// with the runner: a provenance record that lies is worse than none.
const SCOPE_ENV_PREFIX = ["ANKI_BUILDER_TAUGHT_INDEX", "ANKI_BUILDER_EPUB_LLM"];
const SCOPE_DEFAULTS = { timeoutMs: 15 * 60 * 1000 };

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
 * Builds the book's taught-content index: ONE model pass over EVERY chapter, cached under the
 * EPUB's content hash beside conventions.md. Throws if the pass fails or the response does not
 * cover the whole spine — the caller decides what to do about it.
 *
 * This is a DELIBERATE, whole-book, paid pass and nothing calls it implicitly. It used to be built
 * lazily by the first lesson that needed it, which meant a 57-chapter model call could fire in the
 * middle of building one lesson: the single worst thing to spend a dwindling quota window on, and
 * it happened — the index build exhausted the window, then every downstream pass of that lesson
 * failed in turn. Run it once per book, on purpose:
 *
 *     anki-builder epub taught-index <hash>
 */
export function buildTaughtIndex({
  epubPath,
  targetLanguage,
  runClaude = defaultRunClaude,
  libraryHomeDir,
  log = () => {},
} = {}) {
  const epubHash = hashEpubFile(epubPath);
  const { chapters } = listChapters(epubPath);
  const chapterFilePaths = chapters.map((chapter) => ({
    number: chapter.number,
    path: extractChapterToFile(
      epubPath,
      chapter.number,
      chapterCachePath(epubHash, chapter.number, { libraryHomeDir }),
    ),
  }));

  log(`taught index: one model pass over all ${chapters.length} chapter(s) of this book`);
  const prompt = renderTaughtIndexPrompt({ targetLanguage, chapterFilePaths });
  const index = parseTaughtIndexResponse(
    runClaude(prompt),
    chapters.map((chapter) => chapter.number),
  );

  const path = saveTaughtIndex(epubHash, index, {
    libraryHomeDir,
    meta: buildArtifactMeta({
      templatePath: DEFAULT_TEMPLATE_PATH,
      scopeEnvPrefix: SCOPE_ENV_PREFIX,
      defaults: SCOPE_DEFAULTS,
      chapterCount: chapterFilePaths.length,
    }),
  });
  return { index, path, epubHash, chapterCount: chapterFilePaths.length };
}

/**
 * The book's cached taught-content index, or null if this book has never had one built.
 *
 * `build` defaults to FALSE on purpose: a lesson build must never spend a whole-book pass it was
 * not asked for. A caller that gets null falls back to its own slower path and says so; the
 * operator builds the index when they choose to (see buildTaughtIndex). Pass `build: true` only
 * from a command whose entire job is to build it.
 *
 * Never throws — a failed build returns null, because every caller has a fallback.
 */
export function getTaughtIndex({
  epubPath,
  targetLanguage,
  runClaude = defaultRunClaude,
  libraryHomeDir,
  build = false,
  log = () => {},
} = {}) {
  const epubHash = hashEpubFile(epubPath);

  const cached = loadTaughtIndex(epubHash, { libraryHomeDir });
  if (cached) {
    // Same rule as the conventions doc: report that the cached index predates the current prompt,
    // never rebuild it here. See src/corpus/artifactMeta.js.
    const drift = promptDriftWarning(
      taughtIndexPath(epubHash, { libraryHomeDir }),
      DEFAULT_TEMPLATE_PATH,
      { label: "taught index" },
    );
    if (drift) log(`WARNING — ${drift}`);
    return cached;
  }

  if (!build) {
    return null;
  }

  try {
    return buildTaughtIndex({ epubPath, targetLanguage, runClaude, libraryHomeDir, log }).index;
  } catch (error) {
    log(`taught index: build failed (${error.message}) — not cached`);
    return null;
  }
}
