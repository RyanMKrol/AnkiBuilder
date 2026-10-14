import { Buffer } from "buffer";
import { buildZip } from "../deck/zip.js";
import { findInlineGlyphImages } from "../corpus/inlineGlyphs.js";
import { sha256 } from "./inventory.js";

// Puts the readings back into the book. Each picture that was read as writing is replaced, where it
// stands, by the text it showed: `<ruby>食<rt>た</rt></ruby>` when a reading was printed with it,
// the bare text when not. Nothing else in the book changes. Pictures read as "other" (bullets,
// icons) stay pictures, and so does any picture with no settled reading.
//
// Ruby is what the page converter writes for furigana (docs/remaster-page-prompt.md), so the
// pipeline already reads it: plainText drops <rt>, and the card passes see the word as printed.

function escapeXml(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function glyphMarkup(reading) {
  const text = escapeXml(reading.text);
  return reading.reading ? `<ruby>${text}<rt>${escapeXml(reading.reading)}</rt></ruby>` : text;
}

/**
 * Rewrites one XHTML file. `readingFor(archivePath)` returns the settled reading for the picture at
 * that path, or null. Returns `{ content, replaced, kept }`.
 */
export function rewriteChapter(content, { chapterHref, readingFor }) {
  const found = findInlineGlyphImages(content, { chapterHref, anyText: true });
  let out = content;
  let replaced = 0;
  let kept = 0;
  // From the end, so earlier offsets stay valid as later tags change length.
  for (const image of [...found].sort((x, y) => y.index - x.index)) {
    const reading = readingFor(image.archivePath);
    if (!reading || reading.kind !== "text") {
      kept++;
      continue;
    }
    if (out.slice(image.index, image.index + image.tag.length) !== image.tag) {
      throw new Error(`${chapterHref}: the picture at offset ${image.index} moved while rewriting`);
    }
    out =
      out.slice(0, image.index) + glyphMarkup(reading) + out.slice(image.index + image.tag.length);
    replaced++;
  }
  return { content: out, replaced, kept };
}

/**
 * The whole book, rewritten. `entries` is the archive (`readZip`), `chapters` the spine
 * (`listChapters`), `readings` a Map from picture sha to its settled reading. Returns the new
 * archive as a Buffer and per-file counts.
 */
export function rewriteEpub(entries, chapters, readings) {
  const shaByPath = new Map();
  const readingFor = (archivePath) => {
    if (!shaByPath.has(archivePath)) {
      const entry = entries.find((e) => e.name === archivePath);
      shaByPath.set(archivePath, entry ? sha256(entry.data) : null);
    }
    const sha = shaByPath.get(archivePath);
    return sha ? (readings.get(sha) ?? null) : null;
  };

  const spine = new Set(chapters.map((c) => c.href));
  const files = [];
  const out = entries.map((entry) => {
    if (!spine.has(entry.name)) return { ...entry };
    const result = rewriteChapter(entry.data.toString("utf-8"), {
      chapterHref: entry.name,
      readingFor,
    });
    if (result.replaced || result.kept) {
      files.push({ href: entry.name, replaced: result.replaced, kept: result.kept });
    }
    return { name: entry.name, data: Buffer.from(result.content, "utf-8") };
  });

  // The EPUB rule: `mimetype` first, and stored rather than compressed.
  const mimetype = out.find((e) => e.name === "mimetype");
  const rest = out.filter((e) => e.name !== "mimetype");
  const ordered = mimetype ? [{ ...mimetype, store: true }, ...rest] : rest;
  return {
    buffer: buildZip(ordered.map(({ name, data, store }) => ({ name, data, store }))),
    files,
  };
}
