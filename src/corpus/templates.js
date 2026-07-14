import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { validateCorpus } from "../model/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = join(__dirname, "../../templates");

const AVAILABLE_TEMPLATES = {
  "travel-essentials": "travel-essentials.json",
};

export function listTemplates() {
  return Object.keys(AVAILABLE_TEMPLATES);
}

export function loadTemplate(name) {
  const fileName = AVAILABLE_TEMPLATES[name];
  if (!fileName) {
    throw new Error(
      `Unknown template: ${name}. Available templates: ${listTemplates().join(", ")}`,
    );
  }

  const filePath = join(TEMPLATES_DIR, fileName);
  const content = readFileSync(filePath, "utf-8");
  const raw = JSON.parse(content);

  // Template source files stay minimal (id/english/category only) — normalize
  // to the superset item shape here rather than bulk-editing every bundled
  // template's JSON. Templates never come pre-translated, so target is always
  // null; notes is backfilled to null only when the template doesn't set it.
  const corpus = {
    meta: { ...raw.meta, reviewed: raw.meta.reviewed ?? false },
    items: raw.items.map((item) => ({
      ...item,
      notes: item.notes ?? null,
      target: item.target ?? null,
    })),
  };

  validateCorpus(corpus);
  return corpus;
}
