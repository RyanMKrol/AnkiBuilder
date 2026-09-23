# Reading decks

Status: design, agreed with the owner on 2026-09-23. Nothing here is built yet.

## What this is

A second kind of deck, built by its own skill, that trains one skill: reading what the book teaches.
Every card shows the word as the book writes it and nothing else. You read it, turn the card, hear it
said and see what it means.

The decks the pipeline builds today are for speaking and listening. They stay exactly as they are.
Grammar, sentences, drills and the extras unit all belong to them, and none of it comes into a
reading deck.

## What the owner has decided

- **One card per item, one direction.** Written form on the front. There is no English-to-Japanese
  card.
- **The front is silent.** No audio until the card is turned.
- **The back is the English and the audio.** No kana reading, no romaji and no note. That matches the
  rule the speaking decks already follow (the reading is TTS plumbing and is never rendered), just on
  a different side of the card.
- **The source is what the book teaches.** Words written in kana count as well as words written in
  kanji: Genki's greetings on page 41 (おはようございます and the rest) are reading cards even though
  they contain no kanji.
- **Short units only.** Words, and a set phrase where the phrase is what the book teaches (a
  greeting). Never a sentence.
- **No cards for single kana.** The owner already studies hiragana and katakana in a separate deck.
- **No extras unit.** Each chapter is the book's own content and nothing else, so there is nothing
  for a gap filler or an inventive author to do.
- **A deck has a kind, and the kind is part of its identity.** A collection is a book plus a deck
  kind: `speaking-listening` or `reading`. The same book file can have one of each, and they never
  collide. See [A collection is a book plus a deck kind](#a-collection-is-a-book-plus-a-deck-kind).
- **The skill decides the kind.** `build-anki-deck` builds speaking-listening collections and
  `build-reading-deck` builds reading collections. Neither will build the other's.
- **A reading deck is built from the book as it is already ingested.** For Genki that is the
  speaking-listening conversion. A conversion's purpose is only about how the book is ingested; it is
  not the deck kind.

## The card

```
front                     back
+------------------+      +------------------+
|                  |      |      映画         |
|      映画         |      |  ------------    |
|                  |      |  Movie           |
|                  |      |  [audio plays]   |
+------------------+      +------------------+
```

The note type keeps the ten fields every AnkiBuilder note has (`src/deck/noteFields.js`), so every
builder, checker and the dashboard keep reading the same shape. Only the template differs:

- front (`qfmt`): `{{Target}}`, nothing else. Not `{{Scene}}`, not `{{Category}}`, not `{{Audio}}`.
- back (`afmt`): the front, then `{{English}}`, then `{{Audio}}`.

`Reading` stays on the note and feeds TTS exactly as it does now (`speechText` in
`src/audio/index.js`), which is what makes a kanji word be said correctly. `Pronunciation`, `Hint`,
`Scene`, `Category` and `Note` exist on the note and are not rendered. Keeping the field list identical
is deliberate: a second field list would be a second schema to keep in step, and this project has
paid for that mistake four times already.

`Note` stays off the back. In the speaking decks it carries usage and grammar remarks ("polite form
of ...", "used with に"), which are about saying the word, not reading it.

## What earns a card

These rules go in a new `docs/card-rules-reading.md`, included by every reading pass, the same way
`docs/card-rules-shared.md` travels with the speaking passes.

1. **One card per word, in the fullest written form the book prints.** Genki's vocabulary tables have
   three columns: the kana headword, the kanji spelling, and the English
   (`えいが | 映画 | movie`). The card is `映画`. A word the book prints with no kanji spelling is
   carded as printed: `スポーツ`, `おはようございます`. There is no separate kana card for a word that
   has a kanji one; reading kana is what the owner's kana deck is for.
2. **One card per written form in a collection.** Two items with the same front would be the same
   question with two answers. 今日 read as きょう and as こんにち is one card whose English carries both
   meanings, and a check refuses a second card with an identical front.
3. **No sentences, no grammar patterns, no conjugation tables, no drill lines.** A set phrase is a
   card only when the book teaches it as a unit (greetings, classroom expressions). A phrase whose
   meaning is just its words added together is its words.
4. **No single kana.** See the owner's decisions.
5. **No single kanji, for now.** See [Single kanji](#single-kanji).
6. **Proper names are not cards**, the same rule the speaking decks follow.

### Single kanji

Not carded in the first version. A kanji on its own has no one pronunciation: 日 is に in 日本, び in
日曜日, か in 十日 and ひ on its own. The word it sits in decides, which is the owner's own
understanding and is correct. A card's audio has to say something, and any single choice would teach a
reading that is wrong most of the time. Saying every reading the book lists (にち、ひ) is accurate
but is a list to memorise, not reading.

Words carry the pronunciation in context, so a word card never has this problem, and every kanji the
book teaches reaches the deck through the words that use it. If a book is built later that teaches
kanji as characters (Genki's reading and writing lessons do), single-kanji cards can be designed then,
with the audio question answered for that book's shape.

## Where the cards come from

### Genki

The reading deck is built against the speaking-listening conversion that already exists. Its 14
chapters (Greetings, Numbers, Lessons 1 to 12) hold every vocabulary table in the conversation half.
From Lesson 3 on, those tables print the kanji spelling of every word that has one. Lessons 1 and 2
print a romaji column instead, so their words (だいがく, がくせい) are kana cards, and they stay kana:
the book does not reprint them with kanji later in this half.

What it does not contain is the book's reading and writing half (pages 305 to 366): the kana lessons
and the twelve kanji lessons, whose kanji tables and reading passages were left out of the
speaking-listening conversion on purpose. With kana and single kanji both out of scope, the words
those lessons add are the main thing missed. If they are wanted later, that half can be converted and
built as its own reading collection.

No new conversion is needed and nothing new is transcribed. The cost of the Genki reading deck is the
extraction calls per chapter plus TTS for each card.

### Any other book

The same: a reading deck is built against the book as it is registered, native EPUB or converted.
Nothing about a reading deck needs a special conversion.

## A collection is a book plus a deck kind

This is the one structural change, and it is what lets the same book file carry both decks.

Today a collection is identified by its book alone. The book's hash picks the output folder
(`materializeBookInOutput` and `saveBookSlug`, `src/cli/outputPaths.js` and
`src/corpus/epubLibrary.js`) and the library folder that holds the dedup corpora
(`.anki-builder/epubs/<hash>/corpora/`). A reading deck built from the same file under that scheme
would land in the speaking deck's folder and read the speaking deck's dedup corpora, so every reading
card would look already taught.

The change: a collection's identity is (book, deck kind).

- **The kind is recorded** in the collection's `book.json` marker as `deckKind`. A marker without one
  is `speaking-listening`, so every existing collection is already correct and none of their files is
  rewritten. `materializeBookInOutput` rewrites the marker whole, and its comment records what
  happens to a field it does not carry forward (`retired` was nearly lost that way), so `deckKind` is
  carried forward the same way, with a test.
- **The output folder** is `output/epubs/<slug>/` for speaking-listening, unchanged, and
  `output/epubs/<slug>-reading/` for reading. The library's hash-to-slug record becomes a slug per
  kind.
- **Card GUIDs** are namespaced by the collection's slug already, so the two collections' notes can
  never overwrite each other in Anki.
- **Book facts stay shared; collection content does not.** Everything in the library that describes
  the source book is shared by both kinds: the registered EPUB, its hints, the chapter cache and
  `conventions.md`. Everything that records cards is per collection: the dedup corpora move to a
  per-kind folder for reading (`.anki-builder/epubs/<hash>/reading/corpora/`), with the
  speaking-listening path unchanged, because those files are tracked and hand-reviewed.
  `taught-index.json` belongs to the speaking pipeline and the reading pipeline does not read it.
- **The Anki parent deck** is named from the book and the kind: `<book title> (Reading)`. The note
  type is chosen by the kind. Both are decided from the collection's own marker, so nothing has to
  look at the other collection to keep them apart, and golden rule 7 holds unchanged.
- **Each skill refuses the other kind.** `build-anki-deck` and every phase script refuse a reading
  collection, and the reading scripts refuse a speaking one, with a message naming the right skill.

A course (`output/courses/`) has no reading kind in this design. It is a list the owner types, and a
reading course can be added the same way if one is ever wanted.

## The note type

A reading deck gets a second note type per language, `AnkiBuilder ja Reading`, with one template.

**Why not reuse the existing one.** `AnkiBuilder ja` is shared by every Japanese deck, its template
order is a contract (`src/deck/cardTemplates.js`: template 0 is Recognition, template 1 is
Production), and Recognition plays the audio on the front. A reading card cannot be built from it
without either editing that front, which changes every card in every Japanese deck you study, or
suspending Production on every reading card and living with audio on the front. Neither is
acceptable.

**Why a second one is safe.** It is purely additive. Delivery already handles more than one note
type in a run (`specsByModel` in `src/anki/deliver.js`), and `syncStructure` creates a note type that
does not exist yet. Existing notes, their scheduling, their GUIDs and their audio are untouched.

**Identity.** `resolveModelSpec` (`src/deck/collection.js`) derives the model id from the language
label. The reading note type derives it from `"<label> reading"` through the same function, and a
test asserts the two ids differ for every language the pipeline supports.

### Where the code assumes two templates

These are the sites that have to learn "a note has as many cards as its note type has templates".
Each one was read while writing this doc.

| site                                            | today                                    | change                                               |
| ----------------------------------------------- | ---------------------------------------- | ---------------------------------------------------- |
| `src/deck/cardTemplates.js`                     | one template list, `CARD_TEMPLATES`      | add `READING_TEMPLATES`, one entry                   |
| `src/deck/collection.js`, `resolveModelSpec`    | one spec per language                    | spec per language and deck kind                      |
| `src/deck/collection.js`, card rows             | `for (let ord = 0; ord < 2; ord++)`      | loop over the spec's templates                       |
| `src/anki/deliver.js`, deck planning            | `noteTypeSpec(targetLanguage)`           | pass the collection's `deckKind`                     |
| `src/anki/directionSuspension.js`               | `templateCount = 2` default              | callers pass the spec's count (deliver does already) |
| `src/deck/cardFaces.js`                         | "Every item you write becomes TWO cards" | render the block from the collection's templates     |
| `src/deck/cardFacePreview.js` and the dashboard | previews both `CARD_TEMPLATES`           | preview the collection's templates                   |
| `src/audit/checks/cardQuality.js`               | Production face length check             | not run on a reading collection, and says so         |

`src/anki/deliver.js` already reads `deck.spec.templates.length` when it checks direction flags, so
that part needs nothing.

One thing to measure rather than assume: creating a note type in the live collection may or may not
make Anki demand a one-way full sync. `deliver --dry` already reports `createModel`; the first live
delivery of a reading deck should be done by the owner with that in mind, after a scratch-profile
import has shown the cards look right.

## The pipeline

A chapter goes through two gates, content then audio.

```
register the reading collection -> extract -> translate -> Gate 1: content
                                -> audio -> Gate 2: audio
                                -> build -> preflight -> deliver (owner)
```

### Reused as it is

Onboarding, the chapter reader's raw material (tables, sections, images), the reconciler, the
snapshot, translation, audio generation and its review page, the deck build, the dashboard,
preflight, delivery, the pass ledger and `resume`.

The audio cache is keyed by the text spoken (`speechText`), so a word both decks say costs one clip.
That is a property of the cache, not a comparison of the two collections' cards.

### New

- **A reading extraction phase**, built the way phase 1 is: the steps are data
  (`READING_PHASE_STEPS`, beside `BASE_PHASE_STEPS` in `src/agents/basePhase.js`) and one script
  drives them. The deterministic raw-material steps are the same; the agent steps get reading
  prompts fed by `docs/card-rules-reading.md`. The coverage adversary stays, with a reading prompt,
  because "did we card every word this chapter teaches" is exactly the question it answers well by
  enumerating.
- **`docs/card-rules-reading.md`**, the rules above, in one place every reading pass includes.
- **Reading checks** in preflight (next section).
- **The skill**, `.claude/skills/build-reading-deck/SKILL.md`.

### Left out on purpose

The extras phase and its roles, drills, the base/extras split check, scene and hint authoring, the
collision audit's cue rules (they exist because a hint renders on the Production front, and there is
no Production front), romanisation, the taught index, and the learning pass until there is review
history to learn from.

## Checks

A rule in prose is a hope, so each rule that code can see becomes a check. All run on one reading
collection at a time.

1. **The front is the target alone.** A test pins `READING_TEMPLATES[0].qfmt` to `{{Target}}` with
   nothing else, so no later edit can put audio or a hint on the front.
2. **The target gives nothing away.** Preflight refuses a target containing ruby markup, Latin
   letters, a bracketed reading (`大学 (だいがく)`), or sentence punctuation (。？！).
3. **One card per front.** Preflight refuses two cards in the collection with the same target.
4. **Word-sized.** Preflight refuses a single-character target, and warns on one longer than 16
   characters. The number is a starting point, tuned on the pilot; a long set phrase the book teaches
   is accepted by hand.
5. **The kanji spelling was used.** When the book printed a kanji spelling for a word, a card whose
   target is only the kana is flagged. This is the check that keeps rule 1 from quietly sliding back
   to kana.
6. **Kanji needs a reading.** A Japanese target containing kanji must carry `reading`, or TTS may
   read it wrongly.
7. **Every card has English and audio.** `assertEveryCardHasAudio` already refuses a card without
   audio; a reading check adds the same for English.
8. **Skipped means said.** Preflight lists the speaking-deck checks it did not run on a reading
   collection, so "not run" never reads as "passed".

## The skill

`build-reading-deck`, separate from `build-anki-deck` because the procedure is different enough that
branching one document would make both harder to follow.

0. **Which book.** Any registered book. A book not yet registered goes through `onboard-epub` (and
   `convert-book` first if it needs converting) exactly as for a speaking deck.
1. **Register the reading collection** for that book. This creates `<slug>-reading` with
   `deckKind: "reading"`.
2. **Extract a chapter** with the reading phase script. `--dry` first, as with phase 1.
3. **Gate 1, content.** The owner reviews the chapter in the dashboard, which previews the one card.
4. **Audio, then Gate 2.** Generated and reviewed as the speaking decks' audio is.
5. **Build and preflight.**
6. **Deliver.** A human step, as always. The first delivery creates the note type.

## Build order

Each step is its own branch, merged when green.

1. **The note type and a template-count-aware builder.** `READING_TEMPLATES`, the spec per deck
   kind, the card-row loop, direction suspension and the model id test. Done when a throwaway
   reading `.apkg` imports into a scratch Anki profile and shows one silent card per note.
2. **Collection identity by book and deck kind.** `deckKind` in the marker (carried forward,
   tested), the slug per kind, the per-kind corpora folder, the parent deck name, and each skill's
   scripts refusing the other kind. Done when a test builds a speaking and a reading collection from
   one fixture EPUB and neither can see the other's files. Existing collections must come through
   byte-identical.
3. **The card faces block, preview and dashboard** for a one-template collection.
4. **Reading extraction**: the rules doc, the prompts, the steps, the adversary and the checks.
5. **The skill** and the doc updates (README status, PIPELINE.md, CLAUDE.md orientation).
6. **The pilot.** Build two chapters of Genki end to end from the existing speaking-listening
   conversion: Greetings (kana phrases) and Lesson 3 (the first vocabulary table with kanji
   spellings). The owner reviews both at both gates before anything is delivered.

## Still open

Nothing blocks the build. Two things are for later, when there is a reason:

- Single-kanji cards, for a book that teaches kanji as characters.
- Genki's reading and writing half as its own reading collection.
