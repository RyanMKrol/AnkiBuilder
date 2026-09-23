# Reading decks

Status: design, agreed in conversation on 2026-09-23. Nothing here is built yet.

## What this is

A second kind of deck, built by its own skill, that trains one skill: reading what the book teaches
you to read. Every card shows the word as the book writes it and nothing else. You read it, turn the
card, hear it said and see what it means.

The decks the pipeline builds today are for speaking and listening. They stay exactly as they are.
Grammar, sentences, drills and the extras unit all belong to them, and none of it comes into a
reading deck.

## What the owner has decided

These came out of the planning conversation and are not open.

- **One card per item, one direction.** Written form on the front. There is no English-to-Japanese
  card.
- **The front is silent.** No audio until the card is turned.
- **The back is the English and the audio.** No kana reading and no romaji. That matches the rule
  the speaking decks already follow (the reading is TTS plumbing and is never rendered), just on a
  different side of the card.
- **The source is whatever the book teaches you to read.** Words written in kana count, not only
  kanji: Genki's greetings on page 41 (おはようございます and the rest) are reading cards even though
  they contain no kanji. Kanji words count. Single characters count when the book teaches them as
  characters. The rule is "what does the book teach", not a filter on script.
- **Short units only.** Single characters, words, and a set phrase where the phrase is what the book
  teaches (a greeting). Never a sentence.
- **No extras unit.** Each chapter is the book's own content and nothing else, so there is nothing
  for a gap filler or an inventive author to do.
- **A reading deck is its own collection.** Golden rule 7 applies unchanged: it is never compared
  with, cued against or deduplicated against the speaking deck built from the same book. The same
  word appearing in both is expected.

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
`src/audio/index.js`). `Pronunciation`, `Hint`, `Scene`, `Category` and `Note` exist on the note and
are simply not rendered. Keeping the field list identical is deliberate: a second field list would be
a second schema to keep in step, and this project has paid for that mistake four times already.

### Three kinds of item, one template

The kind is read from the target, so neither `corpus.json` nor `cards.json` gains a field.

| kind      | example            | English on the back      | audio says                         |
| --------- | ------------------ | ------------------------ | ---------------------------------- |
| word      | 映画, おはよう     | the meaning              | the word                           |
| phrase    | おはようございます | the meaning              | the phrase                         |
| character | 日                 | the meaning ("day; sun") | the readings the book lists (open) |

A kana character taught as a character (Genki's hiragana lessons) is a character item whose English
is its sound. See the open questions: whether you want those at all is yours to decide.

## What earns a card

These rules go in a new `docs/card-rules-reading.md`, included by every reading pass, the same way
`docs/card-rules-shared.md` travels with the speaking passes.

1. **Card what the unit teaches you to read, in the form it teaches it.** A vocabulary list that
   prints えいが as the headword with 映画 in a reference column teaches the kana word. The lesson
   that teaches 映 and 画 is where 映画 becomes a card. This keeps a front from showing characters
   the book has not taught yet, without the pipeline having to track which characters are known.
2. **Characters are cards when the book teaches them as characters**: a kanji table entry, a kana
   chart in a kana lesson. A character that merely appears inside a word is not a card on its own.
3. **One card per written form in a collection.** Two items with the same front would be the same
   question with two answers. 今日 read as きょう and as こんにち is one card whose back carries
   both meanings, and the check below refuses a second card with an identical front.
4. **No sentences, no grammar patterns, no conjugation tables, no drill lines.** A set phrase is a
   card only when the book teaches it as a unit (greetings, classroom expressions). A phrase whose
   meaning is just its words added together is its words.
5. **Proper names are not cards**, the same rule the speaking decks follow.

## Where the cards come from

### Genki, the first book

Genki is a converted book, so the collection comes from a conversion. Its outline has 12 reading
and writing lessons (pages 305 to 366) after 14 conversation chapters, and the owner wants both
halves: the conversation chapters' vocabulary lists teach words to read, and the reading and writing
lessons teach kana and kanji.

That does not fit either conversion purpose as they stand (`src/remaster/purpose.js`).
`speaking-listening` leaves the kanji lessons out, and `reading-writing` leaves the vocabulary
lessons out. The 2026-09-21 ruling ("A conversion has a purpose, and each purpose is its own
collection") also says there is no "everything" purpose, because feeding kanji lessons to the
speaking pipeline flagged every kanji card as already taught.

**Recommendation:** amend `reading-writing` rather than add a third purpose. Its criteria change to
"every unit that teaches the learner to read something: vocabulary lists, kana lessons, kanji
lessons", and `hasDeckPipeline` becomes true because this pipeline consumes it. The ruling's reason
still holds, because this book feeds the reading pipeline, never the speaking one. This is an
amendment to an owner ruling, so it needs a yes before the DECISIONS.md entry is edited.

Cost: the conversation half is already transcribed and shared by every purpose, so the only new
pages are the reading and writing half, 62 pages. Two readings each is about 124 transcription calls,
plus settling and auditing the pages that need it.

Chapters come out in page order, as every converted book does: Chapter 01 Greetings through
Chapter 14 Lesson 12, then Chapter 15 onwards for the reading and writing lessons. Anki lets you
study them in whatever order you like, so page order costs nothing.

### A book that needs no conversion

A native EPUB like Japanese for Busy People has one file, so a reading collection and a speaking
collection built from it would share a hash, and today the hash decides both the output folder
(`materializeBookInOutput`, `src/cli/outputPaths.js`) and the library folder that holds the dedup
corpora (`.anki-builder/epubs/<hash>/`). Sharing the dedup corpora would break collection isolation
outright: every reading card would look already taught.

That needs the library to be keyed by book and deck kind rather than book alone. It is a real
change to how the library is addressed, and Genki does not need it, because its reading book is a
different file. **So it is deferred to a second stage**, and until it lands the skill refuses a
reading collection for a book that already has a speaking collection under the same hash, with a
message that says why.

### How a collection knows it is a reading collection

The collection's `book.json` marker gains `deckKind: "reading"`, set once when the collection is
created. Two things follow from it: which note type the deck uses, and the parent deck name in Anki
(`Genki ... (Reading)`), so the two decks from one book can never be filed under the same name. Both
are decided by construction from the collection's own marker, so nothing has to look at the other
collection to keep them apart.

`materializeBookInOutput` rewrites the marker whole, and its comment already records what happens to
a field it does not carry forward (`retired` was nearly lost that way). `deckKind` has to be carried
forward the same way, with a test.

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
convert (Genki only) -> onboard -> extract -> translate -> Gate 1: content
                                                        -> audio -> Gate 2: audio
                                                        -> build -> preflight -> deliver (owner)
```

### Reused as it is

Conversion, onboarding, the chapter reader's raw material (tables, sections, images), the
reconciler, the snapshot, translation, audio generation and its review page, the deck build, the
dashboard, preflight, delivery, the pass ledger and `resume`.

The audio cache is keyed by the text spoken (`speechText`), so a word both decks say costs one
clip. That is a property of the cache, not a comparison of the two collections' cards.

### New

- **A reading extraction phase**, built the way phase 1 is: the steps are data
  (`READING_PHASE_STEPS`, beside `BASE_PHASE_STEPS` in `src/agents/basePhase.js`) and one script
  drives them. The deterministic raw-material steps are the same; the agent steps get reading
  prompts fed by `docs/card-rules-reading.md`. The coverage adversary stays, with a reading prompt,
  because "did we card every word this lesson teaches you to read" is exactly the question it
  answers well by enumerating.
- **`docs/card-rules-reading.md`**, the rules above, in one place every reading pass includes.
- **Reading checks** in preflight (next section).
- **The skill**, `.claude/skills/build-reading-deck/SKILL.md`.

### Left out on purpose

The extras phase and its roles, drills, the base/extras split check, scene and hint authoring, the
collision audit's cue rules (they exist because a hint renders on the Production front, and there is
no Production front), romanisation, and the learning pass until there is review history to learn
from.

## Checks

A rule in prose is a hope, so each rule that code can see becomes a check. All run on one reading
collection at a time.

1. **The front is the target alone.** A test pins `READING_TEMPLATES[0].qfmt` to `{{Target}}` with
   nothing else, so no later edit can put audio or a hint on the front.
2. **The target gives nothing away.** Preflight refuses a target containing ruby markup, Latin
   letters, a bracketed reading (`大学 (だいがく)`), or sentence punctuation (。？！).
3. **One card per front.** Preflight refuses two cards in the collection with the same target.
4. **Word-sized.** Preflight warns on a target longer than 16 characters. The number is a starting
   point, tuned on the pilot; a long set phrase the book teaches is accepted by hand.
5. **Kanji needs a reading.** A Japanese target containing kanji must carry `reading`, or TTS may
   read it wrongly. A character item's reading is the list of readings the book gives.
6. **Every card has English and audio.** `assertEveryCardHasAudio` already refuses a card without
   audio; a reading check adds the same for English.
7. **Skipped means said.** Preflight lists the speaking-deck checks it did not run on a reading
   collection, so "not run" never reads as "passed".

## The skill

`build-reading-deck`, separate from `build-anki-deck` because the procedure is different enough that
branching one document would make both harder to follow.

0. **Which book.** A converted book (via `convert-book` with the `reading-writing` purpose), or a
   native EPUB once stage 2 lands.
1. **Onboard** with `onboard-epub`, creating the collection as a reading collection.
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
2. **The reading collection.** `deckKind` in the marker (carried forward, tested), the parent deck
   suffix, the card faces block, the preview and the dashboard.
3. **The purpose amendment**, after the owner's yes: `reading-writing` criteria, `hasDeckPipeline`,
   and the DECISIONS.md entry.
4. **Reading extraction**: the rules doc, the prompts, the steps, the adversary and the checks.
5. **The skill** and the doc updates (README status, PIPELINE.md, CLAUDE.md orientation).
6. **The pilot.** Convert Genki's reading and writing half, then build two chapters end to end:
   Greetings (kana words only) and Reading and Writing 3 (the first kanji lesson). The owner
   reviews both at both gates before anything is delivered.
7. **Stage 2**, later: library keyed by book and deck kind, so a native EPUB can have a reading
   collection.

## Open questions

1. **What a single character's audio says.** Recommendation: the readings the book lists, in the
   book's order, separated by a pause (日: にち、ひ). The alternative is the most common reading
   alone, which is shorter but hides the others.
2. **Kana as characters.** Genki's hiragana and katakana lessons teach single kana. Do you want a
   card per kana (あ, answer "a"), or should those lessons contribute only their words? You read
   kana already, so these may be noise for you, but "whatever the book teaches" says include them.
3. **The purpose amendment** above: widen `reading-writing` (recommended), or add a separate
   `reading` purpose and leave `reading-writing` for a writing deck later.
4. **Whether `Note` renders on the back.** The decision was English and audio only, so the default
   is no. Some kanji words have a note worth seeing (an irregular reading); say if you want it.
