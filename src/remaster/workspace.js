import { join } from "path";
import { libraryHome } from "../model/index.js";

// Where one source book's remaster work lives. Everything in it is derived from the source file
// and is keyed by that file's hash, so a different edition (or a re-export) never mixes its pages
// with another's.
//
// It sits under the library (`.anki-builder/`), which `libraryHome()` already redirects to a
// scratch directory under the test runner, so no test can write here. It is gitignored along with
// the rest of the library's generated bulk, and that matters more than usual: the transcripts are
// the full text of a commercial textbook, and this repository is public. Only the tooling is ever
// committed, never a book's pages.
//
//   <root>/
//     images/page-NNN.jpg          the page images, copied out of the archive
//     ocr/page-NNN.json            Apple Vision's reading of each page (free, local)
//     outline.json                 the lesson ranges, from the outline pass (a human reviews it)
//     transcripts/page-NNN.xhtml   Claude's reading of each page (paid, the expensive part)
//     checks/page-NNN.json         the OCR cross-check of each transcript
//     transcripts-b/, checks-b/    a second, independent reading (--reading b)
//     settled/page-NNN.xhtml       one page from the two readings, and settled/page-NNN.json saying how
//     crops/page-NNN-fig-N.jpg     figures cut out of the page image by their data-box
export function remasterRoot(sourceHash, { libraryHomeDir } = {}) {
  return join(libraryHomeDir || libraryHome(), "remaster", sourceHash);
}

export function remasterPaths(root) {
  return {
    root,
    images: join(root, "images"),
    ocr: join(root, "ocr"),
    outline: join(root, "outline.json"),
    transcripts: join(root, "transcripts"),
    checks: join(root, "checks"),
    // The page the build uses when two readings exist: B where they agreed, the adjudicated page
    // where they did not (settle.js). The build prefers it over transcripts/.
    settled: join(root, "settled"),
    crops: join(root, "crops"),
    ocrBinary: join(root, "..", "bin", "vision-ocr"),
  };
}

/**
 * One READING of the book: an independent transcription run. Reading `a` is the original
 * `transcripts/`; any other reading gets its own `transcripts-<id>/` and `checks-<id>/`, so a
 * second run never overwrites the first and the two can be compared (compareReadings.js).
 */
export function readingPaths(paths, reading = "a") {
  if (reading === "a") return paths;
  if (!/^[a-z]$/.test(reading)) throw new Error(`a reading is one letter, got "${reading}"`);
  return {
    ...paths,
    transcripts: join(paths.root, `transcripts-${reading}`),
    checks: join(paths.root, `checks-${reading}`),
  };
}

export function pageFileStem(number) {
  return `page-${String(number).padStart(3, "0")}`;
}
