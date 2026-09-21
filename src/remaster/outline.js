import { join, dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { renderPromptTemplate, extractJsonObjectText } from "../util/promptTemplate.js";
import { ocrLinesTopDown, marginLines } from "./visionOcr.js";

// The outline replaces the table of contents the source book does not have. It is one text-only
// model call over the OCR (no images), and its output is a list of page ranges that a person
// reviews before anything is transcribed, because every later step, and every deck name, hangs
// off it.

const TEMPLATE = resolve(
  join(dirname(fileURLToPath(import.meta.url)), "..", "..", "docs", "remaster-outline-prompt.md"),
);
const FRONT_PAGES = 16;
// A page that names three or more different lessons is a table of contents. Books with several
// parts often print one per part, far from the front: Genki's reading-and-writing contents is
// page 304 of 393, and an outline built without it invented that part's lesson titles.
const CONTENTS_MIN_LESSONS = 3;
const LESSON_MARKER = /第\s*(\d+)\s*課|\b(?:Lesson|Chapter|Unit)\s+(\d+)/gi;
const KINDS = new Set(["lesson", "front-matter", "back-matter", "other"]);

function pageText(ocr) {
  return ocrLinesTopDown(ocr)
    .map((line) => line.text)
    .join("\n");
}

/** Pages past the front that read like a table of contents (see CONTENTS_MIN_LESSONS). */
export function contentsLikePages(ocrByPage, pageCount) {
  const found = [];
  for (let page = FRONT_PAGES + 1; page <= pageCount; page++) {
    const text = pageText(ocrByPage.get(page));
    const lessons = new Set([...text.matchAll(LESSON_MARKER)].map((m) => m[1] ?? m[2]));
    if (lessons.size >= CONTENTS_MIN_LESSONS) found.push(page);
  }
  return found;
}

export function renderOutlinePrompt({ bookTitle, pageCount, ocrByPage }) {
  const frontText = [];
  const fullPages = [
    ...Array.from({ length: Math.min(FRONT_PAGES, pageCount) }, (_, i) => i + 1),
    ...contentsLikePages(ocrByPage, pageCount),
  ];
  for (const page of fullPages) {
    const text = pageText(ocrByPage.get(page));
    frontText.push(`--- page ${page} ---\n${text || "(no text)"}`);
  }
  const margins = [];
  for (let page = 1; page <= pageCount; page++) {
    const lines = marginLines(ocrByPage.get(page)).map((line) => line.text.trim());
    margins.push(`${page}: ${lines.length ? lines.join(" | ") : "(none)"}`);
  }
  return renderPromptTemplate(TEMPLATE, {
    BOOK_TITLE: bookTitle ?? "(untitled)",
    PAGE_COUNT: String(pageCount),
    FRONT_PAGES: String(FRONT_PAGES),
    FRONT_TEXT: frontText.join("\n\n"),
    MARGINS: margins.join("\n"),
  });
}

/**
 * Parses and checks the model's outline. Throws on anything that would make a broken book: a
 * page covered twice or not at all, a range out of order, a label used twice (two lessons filed
 * into one deck). These are mechanical checks, so a bad outline never reaches a person looking
 * plausible.
 */
export function parseOutline(raw, { pageCount }) {
  const parsed = JSON.parse(extractJsonObjectText(raw));
  const entries = parsed.entries;
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error("outline has no entries");
  }
  const problems = [];
  let expectedFirst = 1;
  const labels = new Set();
  entries.forEach((entry, index) => {
    const where = `entry ${index + 1} ("${entry.label}")`;
    if (!entry.label || typeof entry.label !== "string") problems.push(`${where} has no label`);
    if (labels.has(entry.label)) problems.push(`${where} repeats a label`);
    labels.add(entry.label);
    if (!KINDS.has(entry.kind)) problems.push(`${where} has an unknown kind "${entry.kind}"`);
    if (!Number.isInteger(entry.firstPage) || !Number.isInteger(entry.lastPage)) {
      problems.push(`${where} has a non-integer page range`);
      return;
    }
    if (entry.firstPage !== expectedFirst) {
      problems.push(
        `${where} starts at page ${entry.firstPage}, but the previous entry ended at ` +
          `${expectedFirst - 1} (pages must be covered once each, in order)`,
      );
    }
    if (entry.lastPage < entry.firstPage) problems.push(`${where} ends before it starts`);
    expectedFirst = entry.lastPage + 1;
  });
  if (expectedFirst !== pageCount + 1) {
    problems.push(`the entries end at page ${expectedFirst - 1}, but the book has ${pageCount}`);
  }
  if (problems.length) {
    throw new Error(`the outline is not usable:\n  - ${problems.join("\n  - ")}`);
  }
  return numberChapters({
    printedPageOffset: parsed.printedPageOffset ?? null,
    entries: entries.map((entry, index) => ({
      number: index + 1,
      label: entry.label.trim(),
      kind: entry.kind,
      part: entry.part ?? null,
      firstPage: entry.firstPage,
      lastPage: entry.lastPage,
      evidence: entry.evidence ?? "",
    })),
  });
}

/**
 * The chapter numbering every converted book gets (owner ruling, 2026-09-21; see DECISIONS.md).
 *
 * Each study unit (`kind: "lesson"`) becomes `Chapter NN: <the book's own name for it>`, numbered
 * in page order. Everything else stays in the outline as a record and is left out of the converted
 * EPUB. Assigned here, in code, never by the model, so the rule is the same for every book.
 *
 * Why this shape, from what the pipeline reads:
 *   - `unitDeckSegments` already groups `Chapter N: Title` like `Lesson N: Title`, so a chapter and
 *     its extras nest under one `Chapter NN` deck with no change to the deck contract.
 *   - With only chapters in the EPUB, a chapter's number, its `--lesson` ordinal and its spine
 *     position are the same number, and back matter such as an index cannot pose as a "later
 *     chapter" to the forward-flag check.
 *   - The number is zero-padded (to the width the book needs, at least two digits) so that
 *     `--lesson "Chapter 01"` cannot also match "Chapter 10".
 *   - The book's own name is kept after the number, because the book's exercises and
 *     cross-references say "Lesson 3" and a learner needs to find it.
 */
export function numberChapters(outline) {
  const studyCount = outline.entries.filter((entry) => entry.kind === "lesson").length;
  const width = Math.max(2, String(studyCount).length);
  let chapter = 0;
  return {
    ...outline,
    entries: outline.entries.map((entry) => {
      if (entry.kind !== "lesson") return { ...entry, chapter: null, chapterLabel: null };
      chapter++;
      return {
        ...entry,
        chapter,
        chapterLabel: `Chapter ${String(chapter).padStart(width, "0")}: ${entry.label}`,
      };
    }),
  };
}

/** The entries that become chapters of the converted book, in order. */
export function studyChapters(outline) {
  return numberChapters(outline).entries.filter((entry) => entry.chapter !== null);
}

export function formatOutline(outline) {
  return numberChapters(outline).entries.map(
    (entry) =>
      `[${String(entry.number).padStart(2)}] pages ${entry.firstPage}-${entry.lastPage} ` +
      (entry.chapterLabel
        ? entry.chapterLabel
        : `(${entry.kind}, not in the converted book) ${entry.label}`),
  );
}
