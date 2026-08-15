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
//
// ⚠️ Editing a template here changes the note type's SPEC, and the note type is keyed on language
// alone: the next deliver of any deck in this language rewrites the card faces of every other deck
// using it and flips Anki's schema, which forces a one-way full AnkiWeb sync the owner completes by
// hand. `deliver --dry` prints the diff and `--allow-model-change` is the consent step
// (`syncStructure`, src/anki/deliver.js). Neither is optional.
//
// The ORDINAL is the contract, not the name: template 0 is Recognition and template 1 is Production,
// and a card's `dirSuspended` refers to those numbers. Never reorder this array.
export const CARD_TEMPLATES = [
  {
    name: "Recognition",
    // {{Scene}} on this front, {{Hint}} only on the back: the hint is an English cue ("said when
    // entering a room"), which on a Target→English card is a piece of the answer, while the scene
    // is the situation ("answering whose bag this is") without which the sentence is ambiguous.
    //
    // NO {{Category}} on THIS front. The chip is an uncontrolled answer cue here: "Shopping" above a
    // bare デパート narrows the answer more than any scene the collision doctrine would permit, on
    // 2,150 fronts, 86% of which carry no scene at all. It stays on the Production front, where the
    // learner is already looking at the English and the category tells them nothing they don't have.
    qfmt: '<div class="prompt">{{Target}}</div>{{#Scene}}<div class="scene">{{Scene}}</div>{{/Scene}}{{Audio}}',
    afmt: `{{FrontSide}}<hr id=answer>
<div class="field"><div class="field-label">Answer</div><div class="answer">{{English}}</div></div>
{{#Hint}}<div class="hint">{{Hint}}</div>{{/Hint}}
{{#Pronunciation}}<div class="field"><div class="field-label">Says</div><div class="pron">{{Pronunciation}}</div></div>{{/Pronunciation}}
{{#Note}}<div class="field"><div class="field-label">Note</div><div class="note-back">{{Note}}</div></div>{{/Note}}
{{#Image}}<div class="field">{{Image}}</div>{{/Image}}`,
  },
  {
    name: "Production",
    qfmt: '{{#Category}}<div class="cat-chip">{{Category}}</div>{{/Category}}<div class="prompt">{{English}}</div>{{#Scene}}<div class="scene">{{Scene}}</div>{{/Scene}}{{#Hint}}<div class="hint">{{Hint}}</div>{{/Hint}}',
    afmt: `{{FrontSide}}<hr id=answer>
<div class="field"><div class="field-label">Answer</div><div class="answer">{{Target}}</div></div>
{{#Pronunciation}}<div class="field"><div class="field-label">Says</div><div class="pron">{{Pronunciation}}</div></div>{{/Pronunciation}}
{{#Note}}<div class="field"><div class="field-label">Note</div><div class="note-back">{{Note}}</div></div>{{/Note}}
{{#Image}}<div class="field">{{Image}}</div>{{/Image}}
{{#Audio}}<div class="field">{{Audio}}</div>{{/Audio}}`,
  },
];
