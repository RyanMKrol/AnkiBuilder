import { Buffer } from "buffer";
import {
  escapeHtml,
  DECK_VIEW_CSS,
  fontFaceRule,
  renderLessonSections,
  EXPAND_COLLAPSE_SCRIPT,
} from "./deckViewChrome.js";

// Renders a read-only "deck browser" artifact: every card of a built deck laid out for scanning at a
// glance, grouped by its sub-deck, with the deck's own audio clip embedded inline per card (base64
// data URI). Shares its whole visual system with the deck dashboard server via deckViewChrome.js —
// the only difference is this caller inlines the audio (self-contained, but size-capped, so the CLI
// splits a large deck into parts), while the server serves it over HTTP.

/**
 * @param {object} opts
 * @param {string} opts.title           Book/course/deck title (page heading).
 * @param {Array}  opts.sections        [{ leaf, cards: [{english,target,pronunciation,category,note,audioData}] }]
 * @param {number} [opts.startNumber=1] First global card number on this page (for split parts).
 * @param {string|null} [opts.fontBase64=null] Base64 woff2 of the target-script font to embed.
 * @param {string|null} [opts.partLabel=null]  e.g. "Part 2 of 3" — shown when the deck is split.
 * @returns {string} self-contained HTML
 */
export function renderDeckViewPage({
  title,
  sections,
  startNumber = 1,
  fontBase64 = null,
  partLabel = null,
}) {
  const total = sections.reduce((sum, s) => sum + s.cards.length, 0);
  const withAudio = sections.reduce((sum, s) => sum + s.cards.filter((c) => c.audioData).length, 0);

  const audioCell = (c) =>
    c.audioData
      ? `<audio controls preload="none" src="data:audio/mpeg;base64,${Buffer.from(c.audioData).toString("base64")}"></audio>`
      : `<span class="x">—</span>`;
  const { html: sectionHtml } = renderLessonSections({ sections, startNumber, audioCell });

  return `<title>${escapeHtml(title)} — deck view</title>
<style>
${fontFaceRule({ base64: fontBase64 })}
${DECK_VIEW_CSS}
</style>
<div class="wrap">
<header><div class="eyebrow">Deck view · anki-builder${partLabel ? ` · ${escapeHtml(partLabel)}` : ""}</div>
<h1>${escapeHtml(title)}</h1>
<p class="lede"><b>${total}</b> cards${sections.length > 1 ? ` across <b>${sections.length}</b> sub-decks` : ""}${partLabel ? ` (${escapeHtml(partLabel)})` : ""}. Each lesson is collapsed — click one to open it, play each card's audio inline, and scan the fields at a glance. This is a read-only view of exactly what's in the deck. <b>${withAudio}</b> have audio.</p>
<div class="bar"><button type="button" id="xall">Expand all</button><button type="button" id="call">Collapse all</button></div>
</header>
${sectionHtml}
<footer>Read-only deck browser. Lessons collapsed by default. Target script in Klee One where embedded. Audio is the clip stored in the deck.</footer>
</div>
<script>
${EXPAND_COLLAPSE_SCRIPT}
</script>`;
}
