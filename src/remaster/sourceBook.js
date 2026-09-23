import { basename, extname, join } from "path";
import { getBookTitle } from "../corpus/epubArchive.js";
import { extractPageImages } from "./sourcePages.js";
import { ensurePdfBinary, renderPdfPages } from "./pdfPages.js";

// The one place that knows what kind of file a conversion started from. Everything downstream works
// on a numbered list of page images and a title, so an EPUB of page pictures and a PDF converge
// here and nowhere else.

export function isPdf(path) {
  return extname(path).toLowerCase() === ".pdf";
}

/**
 * The book's pages as images, plus what the file says about itself.
 *
 * `{ pages: [{ number, localPath }], title, textLayerChars }`. `textLayerChars` is null for an EPUB
 * (the question does not apply) and a count for a PDF, where zero means its pages are pictures.
 */
export function extractSourcePages(sourcePath, { imagesDir, binDir }) {
  if (!isPdf(sourcePath)) {
    return {
      pages: extractPageImages(sourcePath, imagesDir),
      title: getBookTitle(sourcePath),
      textLayerChars: null,
    };
  }
  const rendered = renderPdfPages(sourcePath, imagesDir, {
    binaryPath: ensurePdfBinary(join(binDir, "pdf-render")),
  });
  return {
    pages: rendered.pages,
    // A PDF's metadata title is often absent or left over from the tool that made it, so the file
    // name is the fallback a person would recognise.
    title: rendered.title || basename(sourcePath, extname(sourcePath)),
    textLayerChars: rendered.textLayerChars,
  };
}
