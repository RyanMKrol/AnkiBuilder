import { join } from "path";
import { libraryHome } from "../model/index.js";

// Where one book's picture transcription lives, keyed by the book's hash. It is under the library
// (`.anki-builder/`), which `libraryHome()` redirects to scratch under the test runner and which is
// gitignored: the pictures are cut from a commercial book and this repository is public.
//
//   <root>/
//     inventory.json      every distinct picture, its uses and a few sentences around them
//     images/g-NNNN.jpg   the pictures, copied out of the archive
//     ocr/g-NNNN.json     Apple Vision's reading of each (free, local)
//     reading-a.json      model reading A, by picture id
//     reading-b.json      model reading B, independent of A
//     settled.json        the settle pass's decision on every picture the three readers split on
//     journal.jsonl, agent-logs/   what was decided, and every model call in full
export function glyphPaths(bookHash, { libraryHomeDir } = {}) {
  const home = libraryHomeDir || libraryHome();
  const root = join(home, "glyphs", bookHash);
  return {
    root,
    inventory: join(root, "inventory.json"),
    images: join(root, "images"),
    ocr: join(root, "ocr"),
    reading: (id) => join(root, `reading-${id}.json`),
    settled: join(root, "settled.json"),
    // Shared with the page converter: one compiled helper per library.
    ocrBinary: join(home, "remaster", "bin", "vision-ocr"),
  };
}
