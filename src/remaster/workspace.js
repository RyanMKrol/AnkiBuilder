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
    ocrBinary: join(root, "..", "bin", "vision-ocr"),
  };
}

export function pageFileStem(number) {
  return `page-${String(number).padStart(3, "0")}`;
}
