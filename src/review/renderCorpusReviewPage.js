import { renderReviewPage, escapeHtml } from "./reviewPageTemplate.js";

export function renderCorpusReviewPage(corpus) {
  const items = corpus.items || [];
  const targetLanguage = corpus.meta?.targetLanguage || "the target language";

  const rows = items.map((item) => ({
    cells: [
      escapeHtml(item.english),
      escapeHtml(item.category),
      item.target
        ? `<span class="target-cell">${escapeHtml(item.target)}</span>`
        : `<span class="empty">—</span>`,
    ],
    note: item.notes || null,
  }));

  return renderReviewPage({
    eyebrow: "Anki Builder — Corpus Review",
    title: "Corpus Review",
    subtitle: `Assembled corpus for ${escapeHtml(targetLanguage)} — ${items.length} item(s). Click a row to mark it for exclusion, then copy the instruction back into the conversation.`,
    metaItems: [
      { label: "Source", value: corpus.meta?.sourceType || "unknown" },
      { label: "Target language", value: targetLanguage },
      { label: "Items", value: String(items.length) },
    ],
    columns: ["English", "Category", "Target"],
    rows,
    mode: "exclude",
  });
}
