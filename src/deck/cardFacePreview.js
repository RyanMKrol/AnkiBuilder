import { CARD_TEMPLATES } from "./cardTemplates.js";
import { BASE_CSS } from "./cardStyles.js";
import { noteFields } from "./noteFields.js";

// The card face, as HTML, for a human to look at.
//
// The three most valuable rules in references/card-authoring-rules.md — "an answer card must be
// answerable alone", "a scene must never leak the answer", "a hint belongs on the Production front"
// — are every one of them a claim about a rendered FRONT, and until now no surface in the pipeline
// showed that front to anyone. The reviewer signed off on a table of JSON columns and found out what
// the card looked like in Anki, weeks later, mid-review.
//
// This renders the REAL `qfmt`/`afmt` from ./cardTemplates.js against the REAL field values from
// ./noteFields.js, styled with the REAL CSS from ./cardStyles.js. It is a render, not a
// reimplementation: nothing here restates what a template does, so a template edit changes the
// preview in the same commit. It is also strictly READ-ONLY — it touches no note type, contacts
// nothing, and is not gated on the model-diff guard.

/**
 * The Mustache subset Anki's card templates use, and the only one these templates use:
 * `{{#Field}}…{{/Field}}` sections (rendered only when the field is non-empty), `{{Field}}`
 * substitutions, and `{{FrontSide}}`, which Anki replaces with the already-rendered front.
 *
 * Deliberately NOT a general Mustache implementation. A fuller one would render constructs the real
 * templates do not contain, which would let the preview and Anki disagree in the one direction that
 * matters: the preview showing something Anki would not.
 */
export function renderAnkiTemplate(template, fields, frontSide = "") {
  let out = template.replace(/\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_, field, body) =>
    fields[field] ? body : "",
  );
  out = out.replace(/\{\{FrontSide\}\}/g, frontSide);
  return out.replace(/\{\{(\w+)\}\}/g, (_, field) => fields[field] ?? "");
}

// `[sound:x.mp3]` and a bare `<img src>` are Anki's own notation and mean nothing to a browser. The
// preview substitutes a visible placeholder for each rather than dropping them: whether a card has
// audio, and whether it has an image, is part of what the face IS.
function forBrowser(html, card, mediaUrl) {
  return html
    .replace(
      /\[sound:([^\]]*)\]/g,
      (_, file) =>
        `<span class="preview-chip" title="${escapeAttr(file)}">🔊 ${escapeAttr(file)}</span>`,
    )
    .replace(/<img src="([^"]*)">/g, (whole, file) =>
      mediaUrl
        ? `<img src="${escapeAttr(mediaUrl(file, card))}" alt="${escapeAttr(file)}">`
        : `<span class="preview-chip">🖼 ${escapeAttr(file)}</span>`,
    );
}

const escapeAttr = (value) =>
  String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

/**
 * Both directions of one card, each as `{ name, ord, front, back }` of browser-ready HTML.
 *
 * `ord` is the template ordinal, which is also the Anki card ordinal a direction-suspension flag
 * refers to — so the preview and `dirSuspended` are talking about the same thing by construction.
 */
export function renderCardFaceHtml(card, { mediaUrl = null } = {}) {
  const fields = noteFields(card);
  return CARD_TEMPLATES.map((template, ord) => {
    const frontHtml = renderAnkiTemplate(template.qfmt, fields);
    const backHtml = renderAnkiTemplate(template.afmt, fields, frontHtml);
    return {
      name: template.name,
      ord,
      front: forBrowser(frontHtml, card, mediaUrl),
      back: forBrowser(backHtml, card, mediaUrl),
    };
  });
}

// The page's own chrome. Kept strictly OUTSIDE `.card`, and every selector prefixed, so nothing here
// can leak into the rendered face — the whole value of the preview is that what you see is what the
// note type produces, and a preview that quietly restyles the card is worse than no preview.
const PREVIEW_CHROME_CSS = `
.faces-page { max-width: 1100px; margin: 0 auto; padding: 24px 16px 96px; }
.faces-lede { color: #555; font-size: 14px; line-height: 1.6; margin: 0 0 20px; }
.faces-lede code { background: #f2f2f2; padding: 1px 4px; border-radius: 3px; }
.faces-controls { position: sticky; top: 0; z-index: 5; background: #fff; padding: 10px 0;
  border-bottom: 1px solid #e5e5e5; margin-bottom: 18px; display: flex; gap: 14px;
  align-items: center; flex-wrap: wrap; font-size: 13px; }
.faces-controls button { font: inherit; padding: 4px 10px; cursor: pointer; }
.faces-row { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px;
  margin-bottom: 10px; }
.faces-card { border: 1px solid #ddd; border-radius: 8px; overflow: hidden; background: #fff; }
.faces-card-head { display: flex; justify-content: space-between; align-items: baseline;
  padding: 6px 10px; background: #fafafa; border-bottom: 1px solid #eee; font-size: 11px;
  text-transform: uppercase; letter-spacing: 0.07em; color: #666; }
.faces-card-head .faces-side { font-weight: 700; color: #1f6f6b; }
.faces-meta { grid-column: 1 / -1; font-size: 12px; color: #777; margin-top: 12px;
  border-top: 1px dashed #ddd; padding-top: 6px; }
.faces-meta .faces-id { font-family: ui-monospace, Menlo, monospace; color: #444; }
.faces-meta .faces-flag { color: #a05a00; margin-left: 10px; }
.faces-card .card { padding: 22px 16px; }
.faces-card[data-side="front"] [data-face="back"] { display: none; }
.faces-card[data-side="back"] [data-face="front"] { display: none; }
.preview-chip { display: inline-block; font-size: 12px; color: #666; background: #f0f0f0;
  border-radius: 10px; padding: 1px 8px; }
.faces-empty { color: #a00; font-style: italic; }
@media (max-width: 720px) { .faces-row { grid-template-columns: 1fr; } }
`;

// Flipping is per-card and per-direction, so a reviewer can hold a Recognition FRONT beside its
// Production FRONT — which is the comparison the leak rules are actually about.
const PREVIEW_SCRIPT = `
document.addEventListener("click", (e) => {
  const head = e.target.closest("[data-flip]");
  if (head) {
    const card = head.closest(".faces-card");
    card.dataset.side = card.dataset.side === "back" ? "front" : "back";
    card.querySelector(".faces-side").textContent = card.dataset.side.toUpperCase();
    return;
  }
  const all = e.target.closest("[data-flip-all]");
  if (!all) return;
  const side = all.dataset.flipAll;
  for (const card of document.querySelectorAll(".faces-card")) {
    card.dataset.side = side;
    card.querySelector(".faces-side").textContent = side.toUpperCase();
  }
});
`;

function faceBlock(face, { front, back }) {
  return [
    `<div class="faces-card" data-side="front">`,
    `<div class="faces-card-head" data-flip title="click to flip">`,
    `<span>${escapeAttr(face.name)} · ord ${face.ord}</span><span class="faces-side">FRONT</span>`,
    `</div>`,
    // Both sides are in the DOM and CSS shows one, so flipping never re-renders and a long back
    // cannot make the row jump. `.card` is Anki's own wrapper class, which is what makes the deck
    // CSS apply here at all.
    `<div class="card" data-face="front">${front}</div>`,
    `<div class="card" data-face="back">${back}</div>`,
    `</div>`,
  ].join("");
}

/**
 * The whole preview page body for a list of cards: every card as two flippable faces.
 *
 * `cards` are pipeline cards (cards.json items), not Anki notes — the mapping is `noteFields`, the
 * same one both delivery paths use.
 */
export function renderCardFacesPage(
  cards,
  { title, lede = "", mediaUrl = null, fontCss = "" } = {},
) {
  const rows = cards.map((card) => {
    const faces = renderCardFaceHtml(card, { mediaUrl });
    const flags = [
      card.excluded ? "excluded" : null,
      card.uncertain ? "uncertain" : null,
      card.aiSuggested ? "ai-suggested" : null,
      card.fillInBlank ? "drill" : null,
      Array.isArray(card.dirSuspended) && card.dirSuspended.length
        ? `direction-suspended: ${card.dirSuspended.map((o) => CARD_TEMPLATES[o]?.name ?? o).join(", ")}`
        : null,
    ].filter(Boolean);
    return [
      `<div class="faces-row">`,
      ...faces.map((face) =>
        faceBlock(face, {
          front: face.front || `<span class="faces-empty">(this front renders empty)</span>`,
          back: face.back,
        }),
      ),
      `<div class="faces-meta"><span class="faces-id">${escapeAttr(card.id ?? "")}</span>` +
        flags.map((f) => `<span class="faces-flag">${escapeAttr(f)}</span>`).join("") +
        `</div>`,
      `</div>`,
    ].join("");
  });

  return [
    // BASE_CSS first, then the caller's font rule — the same order `modelCss` composes them in, so
    // the language font wins over `.card { font-family: arial }` here exactly as it does in Anki.
    // Page chrome comes last and is entirely outside `.card`.
    `<style>${BASE_CSS}\n${fontCss}\n${PREVIEW_CHROME_CSS}</style>`,
    `<div class="faces-page">`,
    `<h1>${escapeAttr(title)}</h1>`,
    lede ? `<p class="faces-lede">${lede}</p>` : "",
    `<div class="faces-controls">`,
    `<button data-flip-all="front">All fronts</button>`,
    `<button data-flip-all="back">All backs</button>`,
    `<span>Click a card's header to flip just that one.</span>`,
    `</div>`,
    rows.join("\n") || `<p class="faces-empty">No cards to show.</p>`,
    `</div>`,
    `<script>${PREVIEW_SCRIPT}</script>`,
  ].join("\n");
}
