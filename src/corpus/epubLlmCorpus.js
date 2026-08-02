import { extractChapterViaLlm } from "./epubLlmExtract.js";
import { validateCorpus } from "../model/index.js";

/**
 * Extracts ONE chapter file via the LLM extractor and wraps the result into a
 * schema-valid corpus.json object — normalizing each item to the superset
 * shape (`target` always present, `null` when absent; `reading`/`uncertain`/
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
      // Note fields (superset shape, null when absent): `hint` → front-of-card cue; `note` → back-of-card
      // context (both shown to the learner); `reviewNote` → review gates only, never shown. A legacy
      // `cardNote` folds into `note`; a legacy blended `notes` routes to `reviewNote` so nothing
      // user-facing leaks unreviewed.
      hint: item.hint ?? null,
      note: item.note ?? item.cardNote ?? null,
      reviewNote: item.reviewNote ?? item.notes ?? null,
      target: item.target ?? null,
    };
    // Optional spoken form (e.g. にせんえん for 2,000えん). The schema wants a non-empty string or
    // nothing; when present it drives the romaji and the audio downstream, so dropping it here would
    // force `prepare` to re-derive it with another model call and worse provenance.
    if (typeof item.reading === "string" && item.reading) {
      normalized.reading = item.reading;
    }
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
