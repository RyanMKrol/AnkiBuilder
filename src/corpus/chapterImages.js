import { existsSync, statSync } from "fs";
import { dirname, join } from "path";

// Finding a chapter's images in the artifacts the pipeline ALREADY produced.
//
// `extractChapterToFile` writes every image a chapter references next to the cached chapter file, at
// the path the chapter's own `<img src>` resolves to — that is what lets the extraction model open
// them. So by the time anyone asks "what pictures does this chapter have", they are on disk, already
// paid for. Re-deriving the answer by unzipping the EPUB by hand is work the build already did.
//
// The two patterns below mirror the private copies in src/corpus/epubArchive.js (which decides what
// gets extracted); keep them in step. Deliberately not imported from there: that module is where the
// extraction rules live and this is a read-only reporter over their output.
const IMG_SRC_PATTERN = /<img\b[^>]*\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
const SVG_IMAGE_HREF_PATTERN = /<image\b[^>]*\b(?:xlink:)?href\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

function isLocalRelativePath(src) {
  return Boolean(src) && !/^([a-z]+:)?\/\//i.test(src) && !src.startsWith("data:");
}

/** Every local image src a chapter file references, in document order, de-duplicated. */
export function imageSrcsIn(html) {
  return [
    ...new Set(
      [...html.matchAll(IMG_SRC_PATTERN), ...html.matchAll(SVG_IMAGE_HREF_PATTERN)]
        .map((m) => m[1] ?? m[2])
        .filter(isLocalRelativePath),
    ),
  ];
}

/**
 * Each referenced image as `{ src, path, exists, bytes }`, resolved the same way the extractor
 * placed it: against the cached chapter file's own directory.
 */
export function resolveChapterImages(chapterFilePath, html) {
  const dir = dirname(chapterFilePath);
  return imageSrcsIn(html).map((src) => {
    const path = join(dir, src);
    let bytes = null;
    try {
      bytes = statSync(path).size;
    } catch {
      bytes = null;
    }
    return { src, path, exists: existsSync(path), bytes };
  });
}

/**
 * What the book's cached `conventions.md` says about this chapter and these images.
 *
 * The conventions pass already read every chapter and listed the image-embedded content per chapter,
 * naming files. Matching on the filename is exact; the chapter lines are a looser `Ch. <n>` match,
 * which is how that document refers to chapters. Returns the matching lines verbatim, never a
 * verdict: whether a picture is load-bearing or decoration is a judgment for the reader.
 */
export function conventionsNotesFor(conventions, { chapterNumber, images }) {
  if (!conventions) return { named: new Map(), chapterLines: [] };

  const lines = conventions.split("\n");
  const named = new Map();
  for (const { src } of images) {
    const file = src.split("/").pop();
    const hits = lines.filter((line) => line.includes(file));
    if (hits.length > 0) named.set(src, hits);
  }

  const chapterRef = new RegExp(`\\bch(?:apter)?\\.?\\s*${chapterNumber}\\b`, "i");
  const chapterLines = lines.filter((line) => chapterRef.test(line));

  return { named, chapterLines };
}
