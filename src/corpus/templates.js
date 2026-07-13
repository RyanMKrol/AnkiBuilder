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
  const corpus = JSON.parse(content);

  validateCorpus(corpus);
  return corpus;
}
