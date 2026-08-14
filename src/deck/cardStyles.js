import { languageFontCss } from "./fontLibrary.js";

// The note type's CSS: the SINGLE SOURCE OF TRUTH for how a card looks, shared by the `.apkg`
// builder (`buildModel`), the AnkiConnect deliverer (`noteTypeSpec`) and the card-face preview
// (`./cardFacePreview.js`). In its own module rather than in collection.js for the same reason as
// ./cardTemplates.js: collection.js opens a sqlite database at import time, and a surface that only
// wants to SHOW a card face should not pay for that.
//
// ⚠️ Editing anything here changes the note type's spec, and the note type is keyed on language
// alone — so the next deliver of ANY deck in this language force-syncs the change into every
// collection using it and marks the schema modified, which forces a one-way full AnkiWeb sync the
// owner completes by hand. `deliver --dry` prints the diff and `--allow-model-change` is the consent
// step; neither is optional for a styling edit.
export const BASE_CSS = `.card {
  font-family: arial;
  font-size: 20px;
  text-align: center;
  color: black;
  background-color: white;
}
.field {
  margin-bottom: 14px;
}
.field:last-child {
  margin-bottom: 0;
}
.field-label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #1f6f6b;
  margin-bottom: 3px;
}
.answer {
  font-size: 26px;
  font-weight: 600;
  line-height: 1.3;
}
.pron {
  font-size: 16px;
  font-weight: 400;
  color: #555555;
}
.note-back {
  font-size: 14px;
  color: #888888;
}
.hint-front {
  font-size: 13px;
  font-style: italic;
  color: #9a9284;
  margin-top: 8px;
}
.cat-chip {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #a08a5a;
  margin-bottom: 14px;
}
/* Anki's night mode stamps .night_mode (newer clients) or .nightMode (older) on the card. */
.card.night_mode, .card.nightMode {
  color: #e8e6e3;
  background-color: #2c2c2e;
}
.night_mode .field-label, .nightMode .field-label {
  color: #6fb5b0;
}
.night_mode .pron, .nightMode .pron {
  color: #b8b5b0;
}
.night_mode .note-back, .nightMode .note-back {
  color: #a3a09a;
}
.night_mode .hint-front, .nightMode .hint-front {
  color: #a89f8d;
}
.night_mode .cat-chip, .nightMode .cat-chip {
  color: #c2ab77;
}`;

/** Base CSS + the language's embedded @font-face, if any. Identical for the .apkg and AnkiConnect paths. */
export function modelCss(fontDescriptor) {
  return `${BASE_CSS}${fontDescriptor ? "\n" + languageFontCss(fontDescriptor) : ""}`;
}
