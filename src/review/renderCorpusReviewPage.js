import { renderReviewPage, escapeHtml } from "./reviewPageTemplate.js";

export function renderCorpusReviewPage(corpus) {
  const items = corpus.items || [];
  const targetLanguage = corpus.meta?.targetLanguage || "the target language";

  const rows = items.map((item) => {
    const badges = [
      item.uncertain ? `<span class="badge badge-uncertain">Uncertain</span>` : "",
      item.aiSuggested ? `<span class="badge badge-ai-suggested">AI-suggested</span>` : "",
    ]
      .filter(Boolean)
      .join("");

    return {
      cells: [
        escapeHtml(item.english),
        escapeHtml(item.category),
        item.target
          ? `<span class="target-cell">${escapeHtml(item.target)}</span>`
          : `<span class="empty">—</span>`,
        badges || `<span class="empty">—</span>`,
      ],
      note: item.notes || null,
    };
  });

  const metaItems = [
    { label: "Source", value: corpus.meta?.sourceType || "unknown" },
    { label: "Target language", value: targetLanguage },
    { label: "Items", value: String(items.length) },
  ];
  if (corpus.meta?.chapterLabel) {
    metaItems.push({ label: "Chapter", value: corpus.meta.chapterLabel });
  }

  return renderReviewPage({
    eyebrow: "Anki Builder — Corpus Review",
    title: "Corpus Review",
    subtitle: `Assembled corpus for ${escapeHtml(targetLanguage)} — ${items.length} item(s). Click a row to mark it for exclusion, then copy the instruction back into the conversation.`,
    metaItems,
    columns: ["English", "Category", "Target", "Flags"],
    rows,
    mode: "exclude",
  });
}
