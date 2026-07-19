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

  const player = (filename) => {
    if (!filename) return null;
    const base64 = Buffer.from(readFile(join(audioDir, filename))).toString("base64");
    return `<audio controls src="data:audio/mpeg;base64,${base64}"></audio>`;
  };
  // A single labelled take: a short descriptor + its player, stacked in the variants cell. The
  // with-。 default carries a ◆ marker so the preferred take reads at a glance. This is the
  // per-card "audio variants" presentation shared with the book-level review.
  const variant = (desc, playerHtml) =>
    `<div class="var"><span class="vd">${desc}</span>${playerHtml || `<span class="empty">—</span>`}</div>`;

  const rows = items.map((item) => {
    let audioHtml;
    if (hasAlt) {
      // Post-reversal wiring: `audio` is the with-。 default take, `altAudio` is the no-。 alt.
      const chips = [variant("with 。 <b>◆ default</b>", player(item.audio))];
      if (item.altAudio) chips.push(variant("no 。 · alt", player(item.altAudio)));
      audioHtml = `<div class="variants">${chips.join("")}</div>`;
    } else {
      audioHtml = player(item.audio) || `<span class="empty">no audio</span>`;
    }
    return {
      cells: [
        escapeHtml(item.english),
        `<span class="target-cell">${escapeHtml(item.target)}</span>`,
        `<span class="target-cell">${escapeHtml(item.pronunciation)}</span>`,
        audioHtml,
      ],
      note: item.notes || null,
      ...(hasAlt ? { hasAlt: Boolean(item.altAudio) } : {}),
    };
  });

  const subtitle = hasAlt
    ? `Generated audio for ${escapeHtml(targetLanguage)} — ${items.length} item(s). Each card shows its audio takes: the with-。 default (◆) and the no-。 alt. Click a row to cycle: switch to the alt take → drop audio → keep default, then copy the instruction back into the conversation.`
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
      ? ["English", "Target", "Pronunciation", "Audio variants"]
      : ["English", "Target", "Pronunciation", "Audio"],
    rows,
    mode: hasAlt ? "audio-alt" : "regenerate",
  });
}
