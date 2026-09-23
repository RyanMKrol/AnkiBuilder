# 02 The reading note type

Depends on: nothing. Status: built (branch `feat/reading-note-type`): the template, the spec per deck
kind, the card-row loop, the model `req`, the reading card faces block, the preview's template
option and the `isSilent` audio exemption, all tested in `test/deck/readingNoteType.test.js`. Passing
the collection's `deckKind` from its marker into delivery and the deck build lands with 01. The
scratch-profile import is a manual step for the owner.

## What

A second note type per language, `AnkiBuilder ja Reading`, with one template:

- front (`qfmt`): `{{Target}}`, nothing else. Not `{{Scene}}`, not `{{Category}}`, not `{{Audio}}`.
- back (`afmt`): `{{FrontSide}}`, the answer divider, `{{English}}`, then
  `{{#Pronunciation}}...{{/Pronunciation}}` (the romaji, added on the owner's first look at the
  cards) and `{{#Audio}}...{{Audio}}...{{/Audio}}`, so a card with no romaji or audio (a kanji card,
  see 05) renders no empty block and no dead play button.

It keeps the ten fields every AnkiBuilder note has (`src/deck/noteFields.js`), so every builder,
checker and the dashboard keep reading the same shape. `Reading` stays on the note and feeds TTS
exactly as it does now (`speechText` in `src/audio/index.js`). `Pronunciation`, `Hint`, `Scene`,
`Category` and `Note` exist on the note and are not rendered. A second field list would be a second
schema to keep in step, and this project has paid for that mistake four times already.

It uses the same stylesheet and embedded font as the speaking note type for its language
(`fontLibrary.js`), so a reading card looks like the rest of the owner's decks.

## Why not reuse the existing note type

`AnkiBuilder ja` is shared by every Japanese deck, its template order is a contract
(`src/deck/cardTemplates.js`: template 0 is Recognition, template 1 is Production), and Recognition
plays the audio on the front. A reading card cannot be built from it without either editing that
front, which changes every card in every Japanese deck the owner studies, or suspending Production on
every reading card and living with audio on the front.

## Why a second one is safe

It is purely additive. Delivery already handles more than one note type in a run (`specsByModel` in
`src/anki/deliver.js`), and `syncStructure` creates a note type that does not exist yet
(`createModel`). Existing notes, their scheduling, their GUIDs and their audio are untouched.

**Identity.** `resolveModelSpec` (`src/deck/collection.js`) derives the model id from the language
label with `languageModelId`. The reading note type derives it from `"<label> reading"` through the
same function. A test asserts the two ids differ for every language the pipeline supports.

## Where the code assumes two templates

These are the sites that have to learn "a note has as many cards as its note type has templates".
Each was read while writing this design.

| site                                                            | today                                    | change                                                       |
| --------------------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------ |
| `src/deck/cardTemplates.js`                                     | one template list, `CARD_TEMPLATES`      | add `READING_TEMPLATES`, one entry                           |
| `src/deck/collection.js`, `resolveModelSpec` and `noteTypeSpec` | one spec per language                    | spec per language and deck kind                              |
| `src/deck/collection.js`, card rows                             | `for (let ord = 0; ord < 2; ord++)`      | loop over the spec's templates                               |
| `src/anki/deliver.js`, deck planning                            | `noteTypeSpec(targetLanguage)`           | pass the collection's `deckKind` (01)                        |
| `src/anki/directionSuspension.js`                               | `templateCount = 2` default              | callers pass the spec's count; deliver already does          |
| `src/deck/cardFaces.js`                                         | "Every item you write becomes TWO cards" | render the block from the collection's templates             |
| `src/deck/cardFacePreview.js` and the dashboard                 | previews both `CARD_TEMPLATES`           | preview the collection's templates                           |
| `src/audit/checks/cardQuality.js`                               | Production face length check             | not run on a reading collection, and says so                 |
| `src/deck/shippableCards.js`, `assertEveryCardHasAudio`         | every card must have audio               | exempt the card kinds a language plugin declares silent (05) |

`src/anki/deliver.js` already reads `deck.spec.templates.length` when it checks direction flags, so
that part needs nothing.

The audio exemption is narrow on purpose: it asks the language plugin whether this target is a silent
kind, which for Japanese means a single kanji. `assertEveryCardHasAudio` does not know the language
today, so its callers (`src/deck/index.js` twice, `src/anki/deliver.js` once) pass it, and it only
exempts anything for a reading collection. A word card with no audio is still refused, at build
and at delivery, exactly as today.

## Done when

- A test pins `READING_TEMPLATES` to one template whose front is `{{Target}}` alone.
- A test builds a speaking and a reading `.apkg` for the same language and checks two note types with
  different ids, two card rows per speaking note, one per reading note.
- A throwaway reading `.apkg` imports into a scratch Anki profile and shows one silent-front card per
  note, and a kanji card shows no play button. This is a manual step, recorded in the commit.
- The first live delivery of a reading deck is the owner's. `deliver --dry` reports `createModel`;
  whether creating a note type makes Anki ask for a one-way full sync has not been measured, so the
  owner delivers with that in mind.
