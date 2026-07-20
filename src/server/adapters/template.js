import { existsSync, readdirSync } from "fs";
import { join } from "path";
import { rebuildRunDir } from "../../deck/rebuild.js";
import { renderCardForStage, isSafeMediaFile } from "./runDir.js";
import { loadStageData } from "./stage.js";

// Adapter for bundled-template decks: output/templates/<name>/<lang>/. Unlike books/courses there is
// NO chapter/lesson sublevel — the language folder IS the run dir — so a template deck has a single
// unit. The `id` packs both halves as `<templateSlug>__<langSlug>` (both are [a-z0-9-] slugs, so the
// `__` separator is unambiguous). The media `unit` segment is an ignored sentinel.

const templatesRoot = (outputRoot) => join(outputRoot, "templates");
const templateRunDir = (outputRoot, name, lang) => join(templatesRoot(outputRoot), name, lang);

function splitId(id) {
  const idx = id.indexOf("__");
  if (idx < 0) return null;
  const name = id.slice(0, idx);
  const lang = id.slice(idx + 2);
  return name && lang ? { name, lang } : null;
}

export const templateAdapter = {
  type: "template",

  listDecks(outputRoot) {
    const root = templatesRoot(outputRoot);
    if (!existsSync(root)) return [];
    const decks = [];
    for (const nameEntry of readdirSync(root, { withFileTypes: true })) {
      if (!nameEntry.isDirectory()) continue;
      for (const langEntry of readdirSync(join(root, nameEntry.name), { withFileTypes: true })) {
        if (!langEntry.isDirectory()) continue;
        const data = loadStageData(templateRunDir(outputRoot, nameEntry.name, langEntry.name));
        if (!data) continue;
        decks.push({
          type: "template",
          id: `${nameEntry.name}__${langEntry.name}`,
          title: `${nameEntry.name} (${langEntry.name})`,
          targetLanguage: data.meta?.targetLanguage ?? langEntry.name,
          unitCount: 1,
          stage: data.stage,
        });
      }
    }
    return decks;
  },

  loadDeck(outputRoot, id) {
    const parts = splitId(id);
    if (!parts) return null;
    const data = loadStageData(templateRunDir(outputRoot, parts.name, parts.lang));
    if (!data) return null;
    const title = `${parts.name} (${parts.lang})`;
    return {
      title,
      targetLanguage: data.meta?.targetLanguage ?? parts.lang,
      units: [
        {
          seq: "0",
          number: 1,
          label: title,
          stage: data.stage,
          cards: data.items.map(renderCardForStage(data.stage)),
        },
      ],
    };
  },

  resolveMedia(outputRoot, id, _unit, file) {
    const parts = splitId(id);
    if (!parts || !isSafeMediaFile(file)) return null;
    const path = join(templateRunDir(outputRoot, parts.name, parts.lang), "audio", file);
    return existsSync(path) ? path : null;
  },

  // Templates have no chapter/lesson sublevel — the lang folder IS the run dir; `unit` is ignored.
  unitDir(outputRoot, id) {
    const parts = splitId(id);
    return parts ? templateRunDir(outputRoot, parts.name, parts.lang) : null;
  },

  deckFile(outputRoot, id) {
    const parts = splitId(id);
    return parts ? join(templateRunDir(outputRoot, parts.name, parts.lang), "deck.apkg") : null;
  },

  rebuild(outputRoot, id) {
    const parts = splitId(id);
    if (!parts) return null;
    return rebuildRunDir(templateRunDir(outputRoot, parts.name, parts.lang));
  },

  deckLanguage(outputRoot, id) {
    return splitId(id)?.lang ?? null;
  },
};
