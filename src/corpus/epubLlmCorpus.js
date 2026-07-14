import { extractChapterViaLlm } from "./epubLlmExtract.js";
import { validateCorpus } from "../model/index.js";

/**
 * Extracts ONE chapter file via the LLM extractor and wraps the result into a
 * schema-valid corpus.json object — normalizing each item to the superset
 * shape (`notes`/`target` always present, `null` when absent) and setting
 * `meta.reviewed: false`, since a freshly assembled corpus has not been
 * through the review stage yet.
 */
export function assembleCorpusFromChapter({ chapterFilePath, targetLanguage, runClaude } = {}) {
  const rawItems = extractChapterViaLlm({ chapterFilePath, targetLanguage, runClaude });

  const items = rawItems.map((item) => ({
    id: item.id,
    english: item.english,
    category: item.category,
    notes: item.notes ?? null,
    target: item.target ?? null,
  }));

  const corpus = {
    meta: {
      targetLanguage,
      sourceType: "epub",
      reviewed: false,
    },
    items,
  };

  validateCorpus(corpus);
  return corpus;
}
