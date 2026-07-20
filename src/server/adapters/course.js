import { existsSync } from "fs";
import { join } from "path";
import { listCourses } from "../../cli/outputPaths.js";
import { scanNumberedUnits, isSafeMediaFile } from "./runDir.js";

// Adapter for lesson-sourced course decks: output/courses/<slug>/lesson-N/. Structurally identical to
// the book adapter (units are lessons instead of chapters), reusing scanNumberedUnits.

const courseDir = (outputRoot, slug) => join(outputRoot, "courses", slug);

export const courseAdapter = {
  type: "course",

  listDecks(outputRoot) {
    return listCourses(outputRoot).map((c) => ({
      type: "course",
      id: c.slug,
      title: c.name || c.slug,
      targetLanguage: c.targetLanguage,
      unitCount: scanNumberedUnits(courseDir(outputRoot, c.slug), "lesson").length,
    }));
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
    if (!/^\d+$/.test(String(unit)) || !isSafeMediaFile(file)) return null;
    const path = join(courseDir(outputRoot, id), `lesson-${unit}`, "audio", file);
    return existsSync(path) ? path : null;
  },
};
