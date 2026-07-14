import { readFileSync } from "fs";
import { join } from "path";
import { Buffer } from "buffer";
import { renderReviewPage, escapeHtml } from "./reviewPageTemplate.js";

export function renderAudioReviewPage(cards, { audioDir, readFile = readFileSync } = {}) {
  const items = cards.items || [];
  const targetLanguage = cards.meta?.targetLanguage || "the target language";

  const rows = items.map((item) => {
    let audioCell = `<span class="empty">no audio</span>`;
    if (item.audio) {
      const bytes = readFile(join(audioDir, item.audio));
      const base64 = Buffer.from(bytes).toString("base64");
      audioCell = `<audio controls src="data:audio/mpeg;base64,${base64}"></audio>`;
    }
    return {
      cells: [
        escapeHtml(item.english),
        `<span class="target-cell">${escapeHtml(item.target)}</span>`,
        `<span class="target-cell">${escapeHtml(item.pronunciation)}</span>`,
        audioCell,
      ],
      note: item.notes || null,
    };
  });

  return renderReviewPage({
    eyebrow: "Anki Builder — Audio Review",
    title: "Audio Review",
    subtitle: `Generated audio for ${escapeHtml(targetLanguage)} — ${items.length} item(s). Click a row to flag it for regeneration, then copy the instruction back into the conversation.`,
    metaItems: [
      { label: "Target language", value: targetLanguage },
      { label: "Items", value: String(items.length) },
    ],
    columns: ["English", "Target", "Pronunciation", "Audio"],
    rows,
    mode: "regenerate",
  });
}
