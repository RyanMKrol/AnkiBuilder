import { CARD_TEMPLATES, READING_TEMPLATES } from "./cardTemplates.js";
import { renderAnkiTemplate } from "./cardFacePreview.js";

// What a card actually LOOKS LIKE, rendered from the real Anki templates, as plain text an authoring
// prompt can carry.
//
// The field semantics are defined entirely by prose about a rendering the authoring model has never
// seen. That is why the three most valuable authoring rules — the scene must not leak the answer,
// the hint must not restate the gloss, a note must add something the card does not already show —
// are claims about a rendered front that no surface shows anyone. A leaky scene on a particle card
// is obvious on a face and invisible in a JSON row.
//
// Generated from CARD_TEMPLATES, never retyped: a retyped copy is a second source of truth for the
// card faces, and this repo already knows what happens to those. When a template changes, this
// changes with it.

// The example card. Chosen to exercise every field the templates can render, including both
// front-cue fields, so the block shows what each one does rather than describing it.
const EXAMPLE_CARD = {
  Category: "Greetings",
  Target: "しつれいします",
  English: "Excuse me.",
  Pronunciation: "shitsurei shimasu",
  Scene: "said when entering another person's room",
  Hint: "the apologetic one, not the thank-you",
  Note: "The same phrase also means a formal 'good-bye' — context tells which is meant.",
  Image: "",
  Audio: "[sound:example.mp3]",
};

// The template renderer is shared with the human-facing card-face preview (./cardFacePreview.js):
// one deliberately small Mustache subset, so the block the authoring model reads and the page the
// reviewer looks at cannot disagree about what a template does.

// HTML to lines. Block-level tags become line breaks; everything else collapses. The audio and image
// placeholders become a word, because "[sound:example.mp3]" tells a reader nothing about the face.
function toLines(html) {
  return html
    .replace(/\[sound:[^\]]*\]/g, "(audio plays)")
    .replace(/<img[^>]*>/g, "(image)")
    .replace(/<hr[^>]*>/gi, "\n---\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<div[^>]*>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

// The field-label divs render as their own line ("ANSWER"), which reads as a heading rather than as
// part of the answer. Fold each label onto the value that follows it.
function foldLabels(lines) {
  const LABELS = new Set(["Answer", "Says", "Note"]);
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    if (LABELS.has(lines[i]) && lines[i + 1]) {
      out.push(`${lines[i]}: ${lines[i + 1]}`);
      i++;
    } else {
      out.push(lines[i]);
    }
  }
  return out;
}

function renderFace(template, card) {
  const frontHtml = renderAnkiTemplate(template.qfmt, card);
  const backHtml = renderAnkiTemplate(template.afmt, card, frontHtml);
  return {
    name: template.name,
    front: foldLabels(toLines(frontHtml)),
    back: foldLabels(toLines(backHtml)),
  };
}

/** Both directions, rendered from the real templates against `card` (the example by default). */
export function renderCardFaces(card = EXAMPLE_CARD) {
  return CARD_TEMPLATES.map((template) => renderFace(template, card));
}

/**
 * The `{{CARD_FACES}}` block injected into the authoring prompts: both fronts and both backs, with
 * one example card filled in, so a rule about what a front reveals is checkable rather than
 * imagined.
 */
export function renderCardFacesBlock(card = EXAMPLE_CARD) {
  const faces = renderCardFaces(card);
  const blocks = faces.map((face) => {
    const front = face.front.map((line) => `  ${line}`).join("\n");
    const back = face.back.map((line) => `  ${line}`).join("\n");
    return [`${face.name} — FRONT`, front, "", `${face.name} — BACK`, back].join("\n");
  });

  return [
    "Every item you write becomes TWO cards, generated from one note. This is what they look like,",
    "rendered from the deck's real templates with one example card filled in:",
    "",
    "```",
    blocks.join("\n\n"),
    "```",
    "",
    "Read the two FRONTS again before you write a `scene` or a `hint`. **If you can guess the answer",
    "from the Recognition front alone, the scene leaks.** `scene` renders on BOTH fronts, so it has to",
    "be safe in both directions at once; `hint` renders on the Production front and the Recognition",
    "BACK, which is why it may describe the target word but must never appear on a front that is",
    "asking for that word. Anything that only helps AFTER the answer belongs in `note`, on the back.",
  ].join("\n");
}

// The reading deck's example cards (docs/designs/reading-decks/02): a word, which is spoken on the
// back, and a single kanji, which is silent because a kanji alone has no one pronunciation. Both are
// shown because the difference between them is the thing a reading pass most needs to see.
const READING_EXAMPLE_CARDS = [
  {
    Target: "映画",
    English: "Movie",
    Pronunciation: "eiga",
    Reading: "えいが",
    Audio: "[sound:example.mp3]",
  },
  { Target: "日", English: "Day; sun", Audio: "" },
];

/**
 * The `{{CARD_FACES}}` block for the READING passes: every item becomes ONE card, rendered from the
 * reading note type's real template. Never the speaking block: a reading pass told that each item
 * becomes two cards would start writing for a Production front that does not exist.
 */
export function renderReadingCardFacesBlock(cards = READING_EXAMPLE_CARDS) {
  const blocks = cards.map((card) => {
    const face = renderFace(READING_TEMPLATES[0], card);
    const front = face.front.map((line) => `  ${line}`).join("\n");
    const back = face.back.map((line) => `  ${line}`).join("\n");
    return [`${card.Target}: FRONT`, front, "", `${card.Target}: BACK`, back].join("\n");
  });
  return [
    "Every item you write becomes ONE card, and only one: the written form on the front, nothing",
    "else. This is what it looks like, rendered from the reading deck's real template:",
    "",
    "```",
    blocks.join("\n\n"),
    "```",
    "",
    "The front shows `target` alone, so `target` must never contain the answer: no reading in",
    "brackets, no furigana, no romaji. The back shows the written form, the English, the romaji and",
    "plays the audio. The reading you record is never shown: the romaji and the audio are made from",
    "it, which is why it must be copied from the book. A single kanji has no romaji and no audio.",
  ].join("\n");
}
