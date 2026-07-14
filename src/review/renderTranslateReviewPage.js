import { renderReviewPage, escapeHtml } from "./reviewPageTemplate.js";

export function renderTranslateReviewPage(cards) {
  const items = cards.items || [];
  const targetLanguage = cards.meta?.targetLanguage || "the target language";

  const rows = items.map((item) => ({
    cells: [
      escapeHtml(item.english),
      `<span class="target-cell">${escapeHtml(item.target)}</span>`,
      `<span class="target-cell">${escapeHtml(item.pronunciation)}</span>`,
      escapeHtml(item.category),
    ],
    note: item.notes || null,
  }));

  return renderReviewPage({
    eyebrow: "Anki Builder — Translation Review",
    title: "Translation Review",
    subtitle: `Translated cards for ${escapeHtml(targetLanguage)} — ${items.length} item(s). Click a row to mark it for exclusion, then copy the instruction back into the conversation.`,
    metaItems: [
      { label: "Target language", value: targetLanguage },
      { label: "Items", value: String(items.length) },
    ],
    columns: ["English", "Target", "Pronunciation", "Category"],
    rows,
    mode: "exclude",
  });
}
