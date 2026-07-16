import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { validateCorpus } from "../model/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = join(__dirname, "../../templates");

const AVAILABLE_TEMPLATES = {
  "travel-essentials": "travel-essentials.json",
  numbers: "numbers.json",
};

export function listTemplates() {
  return Object.keys(AVAILABLE_TEMPLATES);
}

// Templates are language-agnostic: the source JSON carries only English terms and
// categories, never a target language. The language is a build-time choice supplied
// by the caller (the CLI's `--lang` flag) and injected into meta here, so one
// template can be assembled into a deck for any language. See the corpus schema,
// which still requires meta.targetLanguage on the assembled corpus.
export function loadTemplate(name, targetLanguage) {
  const fileName = AVAILABLE_TEMPLATES[name];
  if (!fileName) {
    throw new Error(
      `Unknown template: ${name}. Available templates: ${listTemplates().join(", ")}`,
    );
  }
  if (!targetLanguage) {
    throw new Error(`loadTemplate requires a targetLanguage for template "${name}"`);
  }

  const filePath = join(TEMPLATES_DIR, fileName);
  const content = readFileSync(filePath, "utf-8");
  const raw = JSON.parse(content);

  // Template source files stay minimal (id/english/category only, no language) —
  // normalize to the superset item shape here rather than bulk-editing every
  // bundled template's JSON. Templates never come pre-translated, so target is
  // always null; notes is backfilled to null only when the template doesn't set
  // it. targetLanguage comes from the caller, not the file.
  const corpus = {
    meta: { ...raw.meta, targetLanguage, reviewed: raw.meta.reviewed ?? false },
    items: raw.items.map((item) => ({
      ...item,
      notes: item.notes ?? null,
      target: item.target ?? null,
    })),
  };

  validateCorpus(corpus);
  return corpus;
}
