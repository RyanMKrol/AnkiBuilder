// The two card templates: the SINGLE SOURCE OF TRUTH for the note type's visual structure, shared by
// the `.apkg` builder (`buildModel`), the AnkiConnect deliverer (`noteTypeSpec`) and the authoring
// prompts' `{{CARD_FACES}}` block (`./cardFaces.js`). Keep them here so those paths can never drift.
//
// In their own module rather than in collection.js because collection.js opens a sqlite database at
// import time, and the authoring prompts have no business paying for that (or printing node's
// experimental-sqlite warning) just to describe a card face.
//
// Templates carry only `{name, qfmt, afmt}` — the shape AnkiConnect's `updateModelTemplates` /
// `createModel` accept; the `.apkg` path adds the extra sqlite fields (`ord`, `did`, `bqfmt`,
// `bafmt`) in `buildModel`.
export const CARD_TEMPLATES = [
  {
    name: "Recognition",
    // {{Scene}} on this front, {{Hint}} only on the back: the hint is an English cue ("said when
    // entering a room"), which on a Target→English card is a piece of the answer, while the scene
    // is the situation ("answering whose bag this is") without which the sentence is ambiguous.
    qfmt: '{{#Category}}<div class="cat-chip">{{Category}}</div>{{/Category}}{{Target}}{{#Scene}}<div class="hint-front">{{Scene}}</div>{{/Scene}}<br>{{Audio}}',
    afmt: `{{FrontSide}}<hr id=answer>
<div class="field"><div class="field-label">Answer</div><div class="answer">{{English}}</div></div>
{{#Hint}}<div class="hint-front">{{Hint}}</div>{{/Hint}}
{{#Pronunciation}}<div class="field"><div class="field-label">Says</div><div class="pron">{{Pronunciation}}</div></div>{{/Pronunciation}}
{{#Note}}<div class="field"><div class="field-label">Note</div><div class="note-back">{{Note}}</div></div>{{/Note}}
{{#Image}}<div class="field">{{Image}}</div>{{/Image}}`,
  },
  {
    name: "Production",
    qfmt: '{{#Category}}<div class="cat-chip">{{Category}}</div>{{/Category}}{{English}}{{#Scene}}<div class="hint-front">{{Scene}}</div>{{/Scene}}{{#Hint}}<div class="hint-front">{{Hint}}</div>{{/Hint}}',
    afmt: `{{FrontSide}}<hr id=answer>
<div class="field"><div class="field-label">Answer</div><div class="answer">{{Target}}</div></div>
{{#Pronunciation}}<div class="field"><div class="field-label">Says</div><div class="pron">{{Pronunciation}}</div></div>{{/Pronunciation}}
{{#Note}}<div class="field"><div class="field-label">Note</div><div class="note-back">{{Note}}</div></div>{{/Note}}
{{#Image}}<div class="field">{{Image}}</div>{{/Image}}
{{#Audio}}<div class="field">{{Audio}}</div>{{/Audio}}`,
  },
];
