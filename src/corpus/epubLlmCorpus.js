import { extractChapterViaLlm } from "./epubLlmExtract.js";
import { validateCorpus } from "../model/index.js";

/**
 * Extracts ONE chapter file via the LLM extractor and wraps the result into a
 * schema-valid corpus.json object — normalizing each item to the superset
 * shape (`notes`/`target` always present, `null` when absent; `uncertain`/
 * `aiSuggested` carried through when the extractor set them, omitted
 * otherwise) and setting `meta.reviewed: false`, since a freshly assembled
 * corpus has not been through the review stage yet.
 */
export function assembleCorpusFromChapter({
  chapterFilePath,
  targetLanguage,
  bookConventions,
  runClaude,
} = {}) {
  const rawItems = extractChapterViaLlm({
    chapterFilePath,
    targetLanguage,
    bookConventions,
    runClaude,
  });

  const items = rawItems.map((item) => {
    const normalized = {
      id: item.id,
      english: item.english,
      category: item.category,
      // Split note fields (superset shape, null when absent): cardNote → the Anki card + viewer +
      // review; reviewNote → review gates only, never shown to a learner. A legacy blended `notes`
      // (from an older prompt) is routed to reviewNote so nothing user-facing leaks unreviewed.
      cardNote: item.cardNote ?? null,
      reviewNote: item.reviewNote ?? item.notes ?? null,
      target: item.target ?? null,
    };
    // Only set when true — the schema treats these as optional flags, not
    // tri-state fields, so a false/absent value should stay absent.
    if (item.uncertain) {
      normalized.uncertain = true;
    }
    if (item.aiSuggested) {
      normalized.aiSuggested = true;
    }
    return normalized;
  });

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
