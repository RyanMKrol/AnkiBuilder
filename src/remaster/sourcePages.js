import { readFileSync, existsSync, mkdirSync } from "fs";
import { join, extname, posix } from "path";
import { readZip } from "../deck/zip.js";
import { listChapters, referencedImageSrcs } from "../corpus/epubArchive.js";
import { writeFileAtomic } from "../util/atomicWrite.js";

// A page-image book is an EPUB whose reading order is a list of pictures of pages. Calibre's
// "PDF Reflow" conversion of a scanned or print-ready PDF is the common source: one spine file,
// one <img> per printed page, no text. This module turns that into a flat, numbered list of
// pages, which is the unit everything else in src/remaster/ works in.

const RASTER = /\.(jpe?g|png|gif|webp)$/i;

/**
 * The book's page images in reading order: spine order first, then the order each spine file
 * references its images. `number` is 1-based and is the page's identity for the rest of the
 * remaster (its OCR file, its transcript, its place in a lesson range). It is NOT the printed
 * page number, which the book's own running headers carry and the outline pass reads.
 *
 * An image referenced twice (a repeated logo) keeps only its first position, so a decorative
 * repeat never becomes a second "page".
 */
export function listPageImages(epubPath) {
  const { chapters } = listChapters(epubPath);
  const entries = new Map(readZip(readFileSync(epubPath)).map((entry) => [entry.name, entry]));
  const seen = new Set();
  const pages = [];
  for (const chapter of chapters) {
    const entry = entries.get(chapter.href);
    if (!entry) continue;
    for (const src of referencedImageSrcs(entry.data.toString("utf-8"))) {
      const archivePath = posix.normalize(posix.join(posix.dirname(chapter.href), src));
      if (!RASTER.test(archivePath) || seen.has(archivePath) || !entries.has(archivePath)) continue;
      seen.add(archivePath);
      pages.push({ number: pages.length + 1, archivePath, spineHref: chapter.href });
    }
  }
  return { pages, entries };
}

/** `page-007.jpg`: zero-padded so a directory listing sorts in reading order. */
export function pageImageName(number, archivePath) {
  return `page-${String(number).padStart(3, "0")}${extname(archivePath).toLowerCase()}`;
}

/**
 * Writes every page image into `destDir` under its page number, skipping files already there
 * (the archive is immutable for a given hash, so an existing file is already correct). Returns
 * the pages with a `localPath` added.
 */
export function extractPageImages(epubPath, destDir) {
  const { pages, entries } = listPageImages(epubPath);
  mkdirSync(destDir, { recursive: true });
  return pages.map((page) => {
    const localPath = join(destDir, pageImageName(page.number, page.archivePath));
    if (!existsSync(localPath)) writeFileAtomic(localPath, entries.get(page.archivePath).data);
    return { ...page, localPath };
  });
}
