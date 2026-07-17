import { readFileSync } from "fs";
import { join } from "path";
import { Buffer } from "buffer";
import { renderReviewPage, escapeHtml } from "./reviewPageTemplate.js";

export function renderAudioReviewPage(cards, { audioDir, readFile = readFileSync } = {}) {
  const items = cards.items || [];
  const targetLanguage = cards.meta?.targetLanguage || "the target language";

  // When any card has a second (alt) recording, the review shows both clips and switches to the
  // two-action "audio-alt" mode (switch to alt / drop). Otherwise it stays the single-action
  // "regenerate" review exactly as before.
  const hasAlt = items.some((item) => item.altAudio);

  const audioCell = (filename, emptyLabel) => {
    if (!filename) {
      return `<span class="empty">${emptyLabel}</span>`;
    }
    const base64 = Buffer.from(readFile(join(audioDir, filename))).toString("base64");
    return `<audio controls src="data:audio/mpeg;base64,${base64}"></audio>`;
  };

  const rows = items.map((item) => {
    const cells = [
      escapeHtml(item.english),
      `<span class="target-cell">${escapeHtml(item.target)}</span>`,
      `<span class="target-cell">${escapeHtml(item.pronunciation)}</span>`,
      audioCell(item.audio, "no audio"),
    ];
    if (hasAlt) {
      cells.push(audioCell(item.altAudio, "no alt"));
    }
    return {
      cells,
      note: item.notes || null,
      ...(hasAlt ? { hasAlt: Boolean(item.altAudio) } : {}),
    };
  });

  const subtitle = hasAlt
    ? `Generated audio for ${escapeHtml(targetLanguage)} — ${items.length} item(s), each with a default and an alt (。) recording. Click a row to cycle: switch to alt → drop audio → keep default, then copy the instruction back into the conversation.`
    : `Generated audio for ${escapeHtml(targetLanguage)} — ${items.length} item(s). Click a row to flag it for regeneration, then copy the instruction back into the conversation.`;

  return renderReviewPage({
    eyebrow: "Anki Builder — Audio Review",
    title: "Audio Review",
    subtitle,
    metaItems: [
      { label: "Target language", value: targetLanguage },
      { label: "Items", value: String(items.length) },
    ],
    columns: hasAlt
      ? ["English", "Target", "Pronunciation", "Audio", "Alt (。)"]
      : ["English", "Target", "Pronunciation", "Audio"],
    rows,
    mode: hasAlt ? "audio-alt" : "regenerate",
  });
}
