import { existsSync } from "fs";
import { join } from "path";
import { listBooks, loadCourseMeta } from "../../cli/outputPaths.js";
import { loadBookMeta } from "../../corpus/epubLibrary.js";
import { rebuildBookDir } from "../../deck/rebuild.js";
import { isSafeMediaFile } from "./runDir.js";
import { scanNumberedUnits, deckStage } from "./stage.js";
import { resolveDeckPathForDir } from "../../deck/deckFileName.js";

// Adapter for EPUB-book decks: output/epubs/<slug>/chapter-N/. The deck `id` is the book slug; each
// unit is a chapter, ordered by pedagogical chapter number.

const bookDir = (outputRoot, slug) => join(outputRoot, "epubs", slug);

// The only shapes a unit token may take: `12` (a chapter) or `12-extras` (that chapter's drill unit).
const UNIT_PATTERN = /^\d+(-extras)?$/;

export const bookAdapter = {
  type: "book",

  listDecks(outputRoot) {
    return listBooks(outputRoot).map((b) => {
      const units = scanNumberedUnits(bookDir(outputRoot, b.slug), "chapter", {
        includeCards: false,
      });
      return {
        type: "book",
        id: b.slug,
        title: b.title || b.slug,
        targetLanguage: b.targetLanguage,
        unitCount: units.length,
        stage: deckStage(units),
        retired: b.retired === true,
      };
    });
  },

  loadDeck(outputRoot, id, { includeCards = true } = {}) {
    const book = listBooks(outputRoot).find((b) => b.slug === id);
    if (!book) return null;
    return {
      title: book.title || id,
      targetLanguage: book.targetLanguage,
      units: scanNumberedUnits(bookDir(outputRoot, id), "chapter", { includeCards }),
    };
  },

  // `unit` is a chapter folder seq — digits, optionally suffixed `-extras` for a lesson's drill
  // unit. The pattern is the path-traversal guard as well as a validity check, so it stays an
  // anchored whitelist with no separators or dots; the file must be a plain audio filename. Returns
  // null (=> 404) when either is unsafe or the file doesn't exist; the server also enforces a
  // realpath-in-root check.
  resolveMedia(outputRoot, id, unit, file) {
    if (!UNIT_PATTERN.test(String(unit)) || !isSafeMediaFile(file)) return null;
    const path = join(bookDir(outputRoot, id), `chapter-${unit}`, "audio", file);
    return existsSync(path) ? path : null;
  },

  // The run dir owning a card's cards.json + audio/, for edits. null on unsafe/unknown unit.
  unitDir(outputRoot, id, unit) {
    if (!UNIT_PATTERN.test(String(unit))) return null;
    return join(bookDir(outputRoot, id), `chapter-${unit}`);
  },

  deckFile(outputRoot, id) {
    return resolveDeckPathForDir(bookDir(outputRoot, id));
  },

  rebuild(outputRoot, id) {
    return rebuildBookDir(bookDir(outputRoot, id), { loadBookMeta, loadCourseMeta });
  },

  deckLanguage(outputRoot, id) {
    return listBooks(outputRoot).find((b) => b.slug === id)?.targetLanguage ?? null;
  },
};
