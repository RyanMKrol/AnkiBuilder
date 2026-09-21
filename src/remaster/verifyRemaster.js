import { readFileSync } from "fs";
import { readZip } from "../deck/zip.js";
import { listLessons } from "../corpus/epubLessons.js";
import { entryFileName } from "./epubWriter.js";

// The end-to-end check: open the EPUB the build wrote, read it the way the pipeline will, and
// account for every page of the source book.
//
// Each step before this checks its own output: the outline covers every page once, a transcript is
// well formed, a lesson is built only from complete transcripts. None of them looks at the finished
// file. A whole-book build used to skip an incomplete lesson without a word, and the eligibility
// check on the result said "native", because a book missing a lesson is still a perfectly readable
// book. This reads the result back and compares it with the outline, page by page.
//
// Every page is identified by the `data-source-page` the writer stamps on its <section>, so the
// check is exact: a page is present once, in its lesson, in order, or it is reported.

const SECTION = /<section class="page"[^>]*\bdata-source-page="(\d+)"[^>]*>([\s\S]*?)<\/section>/g;

function textLength(html) {
  return html
    .replace(/<rt\b[^>]*>[\s\S]*?<\/rt>/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, "").length;
}

/**
 * `expected` is the outline entries the file should contain, in order. Returns
 * `{ problems, notes, pagesPresent, pagesExpected, bookPages }`. `problems` means the file is not
 * the book it claims to be; `notes` are things a person should know but that do not make it wrong
 * (a page with no text, which a blank page legitimately is).
 */
export function verifyRemasteredEpub(epubPath, { expected, bookPages }) {
  const problems = [];
  const notes = [];

  const lessons = listLessons(epubPath);
  const labels = lessons.map((lesson) => lesson.label);
  const expectedLabels = expected.map((entry) => entry.label);
  if (labels.join("\n") !== expectedLabels.join("\n")) {
    problems.push(
      `the nav lists ${labels.length} lesson(s) [${labels.join(" | ")}], expected ` +
        `${expectedLabels.length} [${expectedLabels.join(" | ")}]`,
    );
  }

  const files = new Map(
    readZip(readFileSync(epubPath)).map((entry) => [entry.name, entry.data.toString("utf-8")]),
  );

  let pagesPresent = 0;
  const seen = new Map();
  for (const entry of expected) {
    // By name, from the entry's own number: pairing files by position reported one lesson's pages
    // as another's the moment a lesson was absent.
    const html = files.get(`OEBPS/${entryFileName(entry)}`);
    if (!html) {
      problems.push(`"${entry.label}" has no chapter file`);
      continue;
    }
    const sections = [...html.matchAll(SECTION)].map((m) => ({
      page: Number(m[1]),
      body: m[2],
    }));
    const found = sections.map((s) => s.page);
    const want = [];
    for (let page = entry.firstPage; page <= entry.lastPage; page++) want.push(page);

    const missing = want.filter((page) => !found.includes(page));
    const extra = found.filter((page) => !want.includes(page));
    if (missing.length) problems.push(`"${entry.label}" is missing page(s) ${missing.join(", ")}`);
    if (extra.length) {
      problems.push(`"${entry.label}" holds page(s) outside its range: ${extra.join(", ")}`);
    }
    if (!missing.length && !extra.length && found.join(",") !== want.join(",")) {
      problems.push(`"${entry.label}" has its pages out of order: ${found.join(", ")}`);
    }

    for (const section of sections) {
      seen.set(section.page, (seen.get(section.page) ?? 0) + 1);
      if (section.body.includes('class="missing-page"')) {
        problems.push(`"${entry.label}" page ${section.page} is a placeholder, not a transcript`);
      } else if (textLength(section.body) === 0) {
        notes.push(`"${entry.label}" page ${section.page} has no text (a blank page, or a miss)`);
      }
    }
    pagesPresent += found.length;

    // Every picture a page shows has to be in the book: a figure whose image is missing reads as
    // a picture to the pipeline's image passes and gives them nothing to open.
    for (const [, src] of html.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/g)) {
      if (!files.has(`OEBPS/${src}`))
        problems.push(`"${entry.label}" shows ${src}, which is not in the book`);
    }
  }

  const repeated = [...seen.entries()].filter(([, n]) => n > 1).map(([page]) => page);
  if (repeated.length) problems.push(`page(s) appear more than once: ${repeated.join(", ")}`);

  const pagesExpected = expected.reduce((sum, e) => sum + e.lastPage - e.firstPage + 1, 0);
  return { problems, notes, pagesPresent, pagesExpected, bookPages };
}

export function formatVerification(result, { flaggedPages = [] } = {}) {
  const lines = [];
  const scope =
    result.pagesExpected === result.bookPages
      ? `the whole book (${result.bookPages} pages)`
      : `${result.pagesExpected} of the book's ${result.bookPages} pages`;
  lines.push(
    result.problems.length
      ? `verify: FAILED. ${result.problems.length} problem(s) in ${scope}:`
      : `verify: ok. Every expected page is present once, in order, covering ${scope}.`,
  );
  for (const problem of result.problems) lines.push(`  - ${problem}`);
  for (const note of result.notes) lines.push(`  note: ${note}`);
  if (flaggedPages.length) {
    lines.push(
      `  note: ${flaggedPages.length} page(s) flagged by the OCR cross-check, worth reading ` +
        `against the image: ${flaggedPages.join(", ")}`,
    );
  }
  return lines;
}
