import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join, resolve } from "path";
import { listChapters, extractChapterToFile } from "./epubArchive.js";
import { hashEpubFile, chapterCachePath } from "./epubLibrary.js";
import { runBookConventionsClaude as defaultRunClaude } from "./epubLlmRunClaude.js";

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));

// Lives in docs/ (not src/) for the same reason as the other prompts — a
// plain, human-editable Markdown file meant to be tuned by hand.
const DEFAULT_TEMPLATE_PATH = resolve(
  join(MODULE_DIR, "..", "..", "docs", "epub-book-conventions-prompt.md"),
);

/**
 * How many chapter files go into one conventions call.
 *
 * This pass used to hand the model all 57 chapters at once, under a 10-minute ceiling, with no
 * partial-progress path — and then self-certify at the end ("All 57 chapter files were read in
 * full"). That is the silent-degradation signature, and it sits in the artifact that goes on to
 * steer every single chapter extraction. Twelve chapters is a batch a model can genuinely read
 * inside its ceiling; a batch that degrades now degrades visibly, and only over its own range.
 */
const CHAPTERS_PER_BATCH = 12;

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

/** Splits `items` into consecutive runs of at most `size`. */
export function batchChapters(items, size = CHAPTERS_PER_BATCH) {
  const batches = [];
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size));
  }
  return batches;
}

// Enough entity decoding for a <title>: the five XML predefined entities, the numeric forms, and
// &nbsp; — which is what an EPUB title actually contains. A full HTML entity table would be dead
// weight here.
const NAMED_ENTITIES = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

/**
 * Normalizes text for anchor comparison: entities decoded, tags stripped, whitespace collapsed,
 * case folded.
 *
 * Both sides of this comparison are noisy in different ways — the file has entity-escaped markup,
 * the model retypes the title into prose — so comparing raw strings would report a mismatch for two
 * texts a person would call identical, and a shortfall report full of those is just noise.
 */
export function normalizeAnchor(text) {
  if (typeof text !== "string") return "";
  return (
    text
      .replace(/<[^>]*>/g, " ")
      .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
      .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
      .replace(/&([a-z]+);/gi, (whole, name) => NAMED_ENTITIES[name.toLowerCase()] ?? whole)
      // U+3000 is the ideographic space, which these titles use and \s does not cover.
      .replace(/[\s\u3000]+/g, " ")
      .trim()
      .toLowerCase()
  );
}

/** The `<title>` text of a cached chapter file, normalized — or "" when the file has none. */
export function chapterAnchor(chapterFilePath) {
  let xhtml;
  try {
    xhtml = readFileSync(chapterFilePath, "utf-8");
  } catch {
    return "";
  }
  const match = xhtml.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? normalizeAnchor(match[1]) : "";
}

/**
 * Which chapters of a batch the response actually evidences having read.
 *
 * The prompt asks for one Coverage line per chapter quoting that file's `<title>`, and this checks
 * each quote against the cached file. The anchor is chosen for being deterministic and un-guessable
 * from the filename: a model that skipped a chapter cannot produce its title.
 *
 * REPORT-ONLY, never a throw. The anchor can legitimately be absent (a chapter file with no
 * `<title>`), duplicated (several spine files sharing one lesson title), or escaped in a way that
 * survives normalization badly. Hard-failing the one pass that onboards a whole book on a fragile
 * anchor would trade a silent gap for a hard block, which is the worse of the two.
 */
export function verifyChapterCoverage(response, chapters) {
  const normalized = normalizeAnchor(response);
  const evidenced = [];
  const unevidenced = [];
  const noAnchor = [];
  const ambiguous = [];

  const anchorCounts = new Map();
  for (const { anchor } of chapters) {
    if (anchor) anchorCounts.set(anchor, (anchorCounts.get(anchor) ?? 0) + 1);
  }

  for (const chapter of chapters) {
    if (!chapter.anchor) {
      noAnchor.push(chapter.number);
      continue;
    }
    if (anchorCounts.get(chapter.anchor) > 1) ambiguous.push(chapter.number);
    if (normalized.includes(chapter.anchor)) evidenced.push(chapter.number);
    else unevidenced.push(chapter.number);
  }

  return { evidenced, unevidenced, noAnchor, ambiguous };
}

function describeCoverage({ evidenced, unevidenced, noAnchor, ambiguous }, total) {
  const parts = [`${evidenced.length} of ${total} chapter anchor(s) quoted back`];
  if (unevidenced.length) parts.push(`NOT evidenced: ${unevidenced.join(", ")}`);
  if (noAnchor.length) parts.push(`no <title> to check: ${noAnchor.join(", ")}`);
  if (ambiguous.length) parts.push(`title shared with another chapter: ${ambiguous.join(", ")}`);
  return parts.join(" — ");
}

const HEADING = /^##\s+(.+)$/;

/**
 * Merges the per-batch conventions documents into one.
 *
 * Deliberately structural rather than semantic: each batch answers the same headings for its own
 * range, so the merge groups them under one copy of each heading and labels every block with the
 * chapters it came from. A model call to blend the prose would be a second place for the book's
 * conventions to be quietly rewritten, and the range labels are worth keeping anyway — the prompt
 * already asks "if a convention only shows up in some chapters, say which", and this makes that
 * answer readable at a glance.
 */
export function mergeConventionDocuments(batches) {
  const order = [];
  const sections = new Map();
  let title = null;

  for (const { label, markdown } of batches) {
    let current = null;
    let buffer = [];
    const flush = () => {
      if (!current) return;
      const body = buffer.join("\n").trim();
      if (body) {
        if (!sections.has(current)) {
          sections.set(current, []);
          order.push(current);
        }
        sections.get(current).push({ label, body });
      }
      buffer = [];
    };

    for (const line of markdown.split("\n")) {
      const heading = line.match(HEADING);
      if (heading) {
        flush();
        current = heading[1].trim();
        continue;
      }
      if (!title && line.startsWith("# ")) {
        title = line.slice(2).trim();
        continue;
      }
      buffer.push(line);
    }
    flush();
  }

  const out = [`# ${title ?? "Book Conventions"}`, ""];
  for (const heading of order) {
    out.push(`## ${heading}`, "");
    for (const { label, body } of sections.get(heading)) {
      out.push(`**Chapters ${label}:**`, "", body, "");
    }
  }
  return out.join("\n").trimEnd() + "\n";
}

/**
 * One-time, whole-book pass: materializes every chapter to the shared extraction cache
 * (chapterCachePath — the same cache assemble/flagForwardConcerns use, so this warms it for them
 * too) and asks the model to characterize the book's own structural conventions (placeholder
 * notation, content vs. exercise markup).
 *
 * Runs in BATCHES over chapter ranges and merges the results (see CHAPTERS_PER_BATCH and
 * mergeConventionDocuments). Each batch's response is checked against a deterministic per-chapter
 * anchor and the shortfall is LOGGED, not thrown (see verifyChapterCoverage).
 *
 * Returns the merged Markdown text — this pass produces prose, not structured data, so there is
 * nothing to parse.
 */
export function analyzeBookConventions({
  epubPath,
  targetLanguage,
  runClaude = defaultRunClaude,
  libraryHomeDir,
  log = () => {},
  chaptersPerBatch = CHAPTERS_PER_BATCH,
} = {}) {
  const { chapters } = listChapters(epubPath);
  const epubHash = hashEpubFile(epubPath);

  const materialized = chapters.map((chapter) => {
    const dest = chapterCachePath(epubHash, chapter.number, { libraryHomeDir });
    const path = extractChapterToFile(epubPath, chapter.number, dest);
    return { number: chapter.number, path, anchor: chapterAnchor(path) };
  });

  const batches = batchChapters(materialized, chaptersPerBatch);
  log(
    `book conventions: ${materialized.length} chapter(s) in ${batches.length} batch(es) of up to ` +
      `${chaptersPerBatch}`,
  );

  const documents = [];
  for (const batch of batches) {
    const label = `${batch[0].number}-${batch[batch.length - 1].number}`;
    const prompt = renderBookConventionsPrompt({
      targetLanguage,
      chapterFilePaths: batch.map((chapter) => chapter.path),
    });
    const markdown = runClaude(prompt);

    const coverage = verifyChapterCoverage(markdown, batch);
    const line = `book conventions: chapters ${label} — ${describeCoverage(coverage, batch.length)}`;
    log(coverage.unevidenced.length > 0 ? `${line} [COVERAGE SHORTFALL]` : line);

    documents.push({ label, markdown });
  }

  return mergeConventionDocuments(documents);
}
