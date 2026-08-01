import { existsSync } from "fs";
import { join } from "path";
import { listCourses, loadCourseMeta } from "../../cli/outputPaths.js";
import { loadBookMeta } from "../../corpus/epubLibrary.js";
import { rebuildBookDir } from "../../deck/rebuild.js";
import { isSafeMediaFile } from "./runDir.js";
import { scanNumberedUnits, deckStage } from "./stage.js";
import { resolveDeckPathForDir } from "../../deck/deckFileName.js";

// Adapter for lesson-sourced course decks: output/courses/<slug>/lesson-N/. Structurally identical to
// the book adapter (units are lessons instead of chapters), reusing scanNumberedUnits.

const courseDir = (outputRoot, slug) => join(outputRoot, "courses", slug);

// The only shapes a unit token may take: `3` (a lesson) or `3-extras` (that lesson's drill unit).
const UNIT_PATTERN = /^\d+(-extras)?$/;

export const courseAdapter = {
  type: "course",

  listDecks(outputRoot) {
    return listCourses(outputRoot).map((c) => {
      const units = scanNumberedUnits(courseDir(outputRoot, c.slug), "lesson");
      return {
        type: "course",
        id: c.slug,
        title: c.name || c.slug,
        targetLanguage: c.targetLanguage,
        unitCount: units.length,
        stage: deckStage(units),
      };
    });
  },

  loadDeck(outputRoot, id) {
    const course = listCourses(outputRoot).find((c) => c.slug === id);
    if (!course) return null;
    return {
      title: course.name || id,
      targetLanguage: course.targetLanguage,
      units: scanNumberedUnits(courseDir(outputRoot, id), "lesson"),
    };
  },

  resolveMedia(outputRoot, id, unit, file) {
    if (!UNIT_PATTERN.test(String(unit)) || !isSafeMediaFile(file)) return null;
    const path = join(courseDir(outputRoot, id), `lesson-${unit}`, "audio", file);
    return existsSync(path) ? path : null;
  },

  unitDir(outputRoot, id, unit) {
    if (!UNIT_PATTERN.test(String(unit))) return null;
    return join(courseDir(outputRoot, id), `lesson-${unit}`);
  },

  deckFile(outputRoot, id) {
    return resolveDeckPathForDir(courseDir(outputRoot, id));
  },

  rebuild(outputRoot, id) {
    return rebuildBookDir(courseDir(outputRoot, id), { loadBookMeta, loadCourseMeta });
  },

  deckLanguage(outputRoot, id) {
    return listCourses(outputRoot).find((c) => c.slug === id)?.targetLanguage ?? null;
  },
};
