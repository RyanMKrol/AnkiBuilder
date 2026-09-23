import { extname } from "path";
import { buildShapeReport } from "./epubShapeReport.js";

// One answer to "can the pipeline build this book?", given before anything is registered or paid
// for. The shape report (epubShapeReport.js) lists every degradation it can see, but all of them
// are advisory: a book of 393 page images and a one-entry table of contents produces two soft
// warnings and would go on to build all 393 pages as a single "lesson". This module decides which
// of those findings actually stop a build, and what to do instead.
//
// Three verdicts:
//   native    the normal path (onboard-epub, then build-anki-deck) can use it as it is
//   remaster  the content is pictures of pages; scripts/remaster-epub.mjs rebuilds it as text
//   blocked   neither path can use it; `reasons` says why
//
// Read-only and free, like the shape report it reads.

// A page-image book carries almost no text per image. Calibre's reflow of a PDF leaves a
// fraction of a character per page (Genki: 132 characters for 393 images, 0.3 per image). A text
// textbook with plenty of pictures still carries hundreds: Japanese for Busy People has 291,660
// characters over 727 images, about 400 per image. 20 sits well clear of both, measured on
// 2026-09-21.
const PAGE_IMAGE_TEXT_PER_IMAGE = 20;
// Below this many images the ratio means nothing (a two-image cover-and-title book).
const PAGE_IMAGE_MIN_IMAGES = 10;
// A table of contents that names at most one section is only a real problem when there is more
// than one section's worth of book behind it.
const SINGLE_ENTRY_MIN_BYTES = 100 * 1024;

export function assessEpubEligibility(epubPath, { buildReport = buildShapeReport } = {}) {
  // A PDF is never native: the pipeline reads EPUBs. Its pages are rendered to images and it joins
  // the conversion where a page-image EPUB does (src/remaster/sourceBook.js). Whether it carries a
  // text layer is reported by the conversion's own first step, not guessed at here.
  if (extname(epubPath).toLowerCase() === ".pdf") {
    return {
      verdict: "remaster",
      reasons: [
        "this is a PDF, and the pipeline reads EPUBs: its pages are rendered to images and " +
          "converted the same way a book of page pictures is",
      ],
      report: null,
    };
  }
  let report;
  try {
    report = buildReport(epubPath);
  } catch (error) {
    return {
      verdict: "blocked",
      reasons: [`the EPUB parser rejects this file: ${error.message}`],
      report: null,
    };
  }
  return { ...judgeShape(report), report };
}

/** The decision itself, over an already-built shape report. Pure, so tests can feed it shapes. */
export function judgeShape(report) {
  const { totals } = report;
  const textChars = report.spine.reduce((sum, file) => sum + file.textLength, 0);
  const images = totals.distinctImages;
  const pageImages =
    images >= PAGE_IMAGE_MIN_IMAGES && textChars / images < PAGE_IMAGE_TEXT_PER_IMAGE;

  const findings = [];
  if (pageImages) {
    findings.push(
      `the content is pictures of pages: ${images} image(s) and ${textChars} characters of text ` +
        `in total (${(textChars / images).toFixed(1)} per image; a text book with pictures has hundreds)`,
    );
  }
  const noLessons = !report.nav.source;
  const oneLesson =
    !noLessons &&
    report.lessons.length <= 1 &&
    totals.contentBytes + images > SINGLE_ENTRY_MIN_BYTES;
  // Content bytes alone undercount a page-image book (its one XHTML file is tiny), so the check
  // above adds the image count as a floor; a book of hundreds of page images is never "small".
  if (noLessons) {
    findings.push("there is no table of contents, so no lesson can be selected by name");
  } else if (oneLesson || (pageImages && report.lessons.length <= 1)) {
    findings.push(
      `the table of contents names ${report.lessons.length} section(s) ` +
        `(${report.lessons.map((l) => `"${l.label}"`).join(", ") || "none"}), so the whole book ` +
        `would be built as one lesson`,
    );
  }

  if (pageImages) {
    // The remaster rebuilds the table of contents as well as the text, so a missing or one-entry
    // TOC on a page-image book is covered by the same fix.
    return { verdict: "remaster", reasons: findings };
  }
  if (findings.length) return { verdict: "blocked", reasons: findings };
  return { verdict: "native", reasons: [] };
}

const NEXT_STEP = {
  native: "next: the normal path. Run the onboard-epub skill on this book, then build-anki-deck.",
  remaster:
    "next: node scripts/remaster-epub.mjs ocr <book.epub>, then outline, transcribe and build " +
    "(see docs/designs/image-epub-remaster.md). Onboard the EPUB that build writes, not this one.",
  blocked:
    "next: nothing automatic. The remaster only handles books whose pages are images; a text book " +
    "with a broken table of contents needs its TOC fixed at the source.",
};

export function formatEligibility({ verdict, reasons, report }) {
  const lines = [];
  if (report) lines.push(report.title ?? "(no <dc:title>)");
  lines.push(`verdict: ${verdict}`);
  for (const reason of reasons) lines.push(`  - ${reason}`);
  lines.push(NEXT_STEP[verdict]);
  return lines;
}
