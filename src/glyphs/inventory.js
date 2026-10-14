import { createHash } from "crypto";
import { readFileSync } from "fs";
import { extname } from "path";
import { readZip } from "../deck/zip.js";
import { listChapters } from "../corpus/epubArchive.js";
import { findInlineGlyphImages } from "../corpus/inlineGlyphs.js";

// Every distinct picture-of-a-word in a book, with where it is used.
//
// A picture is identified by its BYTES, not its file name: the Revised 3rd edition of Japanese for
// Busy People II points several ids at one file ("jap422" is common2.jpg), and two files with the
// same bytes are one reading, not two. Ids are assigned in first-appearance order (g-0001, ...), so
// an inventory rebuilt from the same book gets the same ids and every reading already paid for
// still lines up.

// How much of the surrounding text to keep on each side of a use, within the line it sits in.
// Enough for the settle pass to see the word in its sentence; the readers never see it (see
// glyphRead.js).
const CONTEXT_CHARS = 40;
// Contexts kept per picture. A common word is used dozens of times; three sentences are enough to
// tell a word from a decoration.
const MAX_CONTEXTS = 3;

function plainText(html) {
  return html
    .replace(/<img\b[^>]*>/gi, "□")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
}

function contextAround(content, image) {
  const before = plainText(content.slice(image.blockStart, image.index)).slice(-CONTEXT_CHARS);
  const after = plainText(content.slice(image.index + image.tag.length, image.blockEnd)).slice(
    0,
    CONTEXT_CHARS,
  );
  return { before: before.trimStart(), after: after.trimEnd() };
}

export function glyphId(n) {
  return `g-${String(n).padStart(4, "0")}`;
}

export function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

/**
 * `{ glyphs: [{ id, sha, ext, archivePaths, uses, contexts }], files, uses }` for one EPUB.
 * `entries` is the archive as `readZip` returns it (passed in by tests); `files` counts the spine
 * files that hold at least one picture.
 */
export function buildGlyphInventory(epubPath, { entries } = {}) {
  const archive = entries ?? readZip(readFileSync(epubPath));
  const byName = new Map(archive.map((entry) => [entry.name, entry]));
  const { chapters } = listChapters(epubPath);

  const bySha = new Map();
  let uses = 0;
  let files = 0;
  for (const chapter of chapters) {
    const entry = byName.get(chapter.href);
    if (!entry) continue;
    const content = entry.data.toString("utf-8");
    const found = findInlineGlyphImages(content, { chapterHref: chapter.href, anyText: true });
    if (found.length) files++;
    for (const image of found) {
      const imageEntry = byName.get(image.archivePath);
      if (!imageEntry) continue;
      uses++;
      const sha = sha256(imageEntry.data);
      if (!bySha.has(sha)) {
        bySha.set(sha, {
          id: glyphId(bySha.size + 1),
          sha,
          ext: extname(image.archivePath).toLowerCase() || ".img",
          archivePaths: [],
          uses: 0,
          contexts: [],
        });
      }
      const glyph = bySha.get(sha);
      glyph.uses++;
      if (!glyph.archivePaths.includes(image.archivePath))
        glyph.archivePaths.push(image.archivePath);
      if (glyph.contexts.length < MAX_CONTEXTS) {
        glyph.contexts.push({
          href: chapter.href,
          ...contextAround(content, image),
        });
      }
    }
  }
  return { glyphs: [...bySha.values()], files, uses };
}

/** The bytes of one inventoried picture, from the archive. */
export function glyphBytes(entries, glyph) {
  const entry = entries.find((e) => e.name === glyph.archivePaths[0]);
  if (!entry) throw new Error(`${glyph.id}: ${glyph.archivePaths[0]} is not in the archive`);
  return entry.data;
}
