import { existsSync } from "fs";
import { join } from "path";
import { listBooks } from "../../cli/outputPaths.js";
import { scanNumberedUnits, isSafeMediaFile } from "./runDir.js";

// Adapter for EPUB-book decks: output/epubs/<slug>/chapter-N/. The deck `id` is the book slug; each
// unit is a chapter, ordered by pedagogical chapter number.

const bookDir = (outputRoot, slug) => join(outputRoot, "epubs", slug);

export const bookAdapter = {
  type: "book",

  listDecks(outputRoot) {
    return listBooks(outputRoot).map((b) => ({
      type: "book",
      id: b.slug,
      title: b.title || b.slug,
      targetLanguage: b.targetLanguage,
      unitCount: scanNumberedUnits(bookDir(outputRoot, b.slug), "chapter").length,
    }));
  },

  loadDeck(outputRoot, id) {
    const book = listBooks(outputRoot).find((b) => b.slug === id);
    if (!book) return null;
    return {
      title: book.title || id,
      targetLanguage: book.targetLanguage,
      units: scanNumberedUnits(bookDir(outputRoot, id), "chapter"),
    };
  },

  // `unit` is a chapter folder seq; the file must be a plain audio filename. Returns null (=> 404)
  // when either is unsafe or the file doesn't exist; the server also enforces a realpath-in-root check.
  resolveMedia(outputRoot, id, unit, file) {
    if (!/^\d+$/.test(String(unit)) || !isSafeMediaFile(file)) return null;
    const path = join(bookDir(outputRoot, id), `chapter-${unit}`, "audio", file);
    return existsSync(path) ? path : null;
  },
};
