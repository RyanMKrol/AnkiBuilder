// The note type's FIELDS, and the one mapping from a pipeline card onto them.
//
// In their own module rather than in collection.js for the same reason as ./cardTemplates.js:
// collection.js opens a sqlite database at import time, and the surfaces that only need to know what
// a card LOOKS LIKE (the card-face preview, the authoring prompts) have no business paying for that.
// collection.js and the AnkiConnect deliverer both import from here, so there is still exactly one
// mapping and the .apkg and the live collection cannot fill a field differently.

// "Scene" (card.scene) sets the situation — the question just asked, the thing under discussion —
// and renders on the FRONT of BOTH directions: it never contains the answer, only the context
// without which the sentence is ambiguous. "Hint" (card.hint) is the Production-front-only
// disambiguator (an English cue like "the object you read") — on a Target→English front it would
// give the answer away, so it shows there only on the back. "Note" is the BACK-of-card context.
// "Reading" holds the card's `ttsText` (see fieldValue below), stored as a real field so the kanji
// era needs no note-type migration. NO template renders it, and none is meant to: `ttsText` is TTS
// input, not something a learner reads. The Anki field keeps its old name on purpose. The JSON
// field was renamed; the live note type was not.
// New fields append at the END: the AnkiConnect deliverer force-syncs structure by adding missing
// fields, and appending keeps every existing note's field order stable.
export const FIELD_NAMES = [
  "Target",
  "Pronunciation",
  "English",
  "Category",
  "Hint",
  "Note",
  "Image",
  "Audio",
  "Reading",
  "Scene",
];

// Field values are HTML in Anki, so a literal `<`, `>` or `&` in card text has to be escaped or it
// silently disappears (or worse, becomes markup). Escaped ONCE here, on the one path both builders
// take. The AnkiConnect deliverer compares stored field text against freshly built text on both
// sides before comparing, so escaping here keeps re-runs a no-op.
export function escapeFieldText(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function fieldValue(card, name) {
  switch (name) {
    case "Target":
      return escapeFieldText(card.target || "");
    case "Pronunciation":
      return escapeFieldText(card.pronunciation || "");
    case "English":
      return escapeFieldText(card.english || "");
    case "Category":
      return escapeFieldText(card.category || "");
    case "Hint":
      // FRONT-of-card cue (disambiguator). NEVER the internal reviewNote.
      return escapeFieldText(card.hint || "");
    case "Note":
      // BACK-of-card context. `cardNote` is the pre-rename alias, kept for back-compat.
      return escapeFieldText(card.note || card.cardNote || "");
    case "Reading":
      // THE ONE PLACE the pipeline's `ttsText` becomes Anki's "Reading" field. The JSON field was
      // renamed (`reading` -> `ttsText`) so its name states its contract; the ANKI field keeps the
      // name "Reading" deliberately, because renaming a field on a live note type rewrites every
      // note in both delivered collections for zero benefit (nothing renders it). Both the .apkg
      // build and the AnkiConnect deliver come through here, so this line is the whole mapping.
      return escapeFieldText(card.ttsText || "");
    case "Scene":
      // Situation cue, shown on the FRONT of both directions. Never contains the answer.
      return escapeFieldText(card.scene || "");
    case "Image":
      return card.image ? `<img src="${card.image}">` : "";
    case "Audio":
      return card.audio ? `[sound:${card.audio}]` : "";
    default:
      return "";
  }
}

/** Every field of one card, as Anki's `{ Target: …, English: … }` shape. */
export function noteFields(card) {
  return Object.fromEntries(FIELD_NAMES.map((name) => [name, fieldValue(card, name)]));
}
