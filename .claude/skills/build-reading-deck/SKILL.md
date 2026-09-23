---
name: build-reading-deck
description: Build a READING deck from a book, one chapter at a time. Each card shows the word as the book writes it on a silent front, with the English, the romaji and the audio on the back; for Japanese, single kanji get meaning-only cards with no audio. Separate from build-anki-deck, which builds speaking and listening decks. Use when the owner asks for reading cards, a reading deck, or kanji recognition cards for a book.
---

# Build a reading deck

A reading deck trains one thing: reading what the book teaches. It is a separate deck kind from the
speaking and listening decks `build-anki-deck` builds, with its own collection, note type, rules,
agents and checks. The design, the owner's decisions and what each piece does are in
`docs/designs/reading-decks/`; how the code is wired is in `docs/PIPELINE.md` ("The reading phase").
This file is normative for the procedure.

**What a card is.** The front is the written form exactly as the book prints it (`映画`), nothing
else, and silent. The back is the written form, the English, the romaji and the audio, so you can
check you read it right as well as understood it. No kana reading and no note. For Japanese, a
kanji the book teaches as a character gets its own card with its meaning and **no romaji or audio** (a kanji
alone has no one pronunciation), and every word containing kanji carries its kana reading, copied
from the book, which makes the romaji and is never shown. The voice is given the written form, except
for a single kanji word or a word the book prints with two readings, which are spoken from the kana
(the review marks those "voice reads the kana"). What earns a card is in
`docs/card-rules-reading.md`; the Japanese behaviour is `src/reading/readingSchemes.js`.

**What is left out on purpose**: sentences, grammar, drills, single kana (the owner studies kana in a
separate deck), proper names, and the whole extras phase. There are two gates per chapter, content
then audio.

**A collection is a book plus a deck kind** (DECISIONS.md). A book's reading collection is
`output/epubs/<slug>-reading/`, beside its speaking collection, and never compared with it: the same
word in both is expected. This skill only ever builds the reading one; `build-anki-deck`'s scripts
refuse a reading collection and these refuse a speaking one.

## 0. Which book

Any registered book, native EPUB or converted.

- **A book that has never been built**: run `onboard-epub` first, and `convert-book` before that if
  `node scripts/remaster-epub.mjs check <book>` does not say `native`.
- **A converted book**: build the reading deck from its `everything` conversion, which keeps every
  study unit (vocabulary lessons AND kanji lessons). The `speaking-listening` conversion leaves the
  kanji lessons out, so a reading deck built from it misses them. The speaking pipeline refuses an
  `everything` book, so the two never cross.

```sh
TOOL="node scripts/build-reading.mjs --output-root output"
$TOOL --epub <book.epub> --list-lessons      # or --book <slug> for a book already in output/
```

## 1. Build a chapter

Say the cost first: **five model calls per chapter** (three readers, the romaji correction and the
coverage adversary, all Sonnet), whatever the chapter's size. `--dry` shows the steps and spends
nothing.

```sh
$TOOL --epub <book.epub> --lesson "<label, or n from [n] in --list-lessons>" --lang ja --dry
$TOOL --epub <book.epub> --lesson "<label, or n>" --lang ja
```

`--lesson` takes a piece of the label (`"Chapter 01"`) or the bare number `n`, never `[n]` with its
brackets, which is read as label text and matches nothing.

The first run registers the reading collection (`<slug>-reading`). **Ask the owner for a short deck
name before it**, and pass it as `--deck-name "Genki I (Reading)"`: without one the Anki deck is named
after the book's own title, which for a converted book runs to "GENKI: An Integrated Course … [Third
Edition] 初級日本語げんき[第3版] (everything) (Reading)". It can be given on any later run too, until
the collection is first delivered; after that the name is how delivery finds the deck, and changing
it is a migration. Each chapter is one deck straight under that name (`Chapter 06: Lesson 3: Making a
Date`): a reading deck has no extras, so it has no grouping level.

The run prints:

- the number of cards written;
- **what the rules left out**, with the reason for each (`reading-report.json` has the full list):
  single kana, a single character the language does not card, a word already carded in an earlier
  chapter of this collection;
- **words the book gives more than one reading for**: the audio uses the first; check it at the gate;
- **coverage**: how many items the adversary listed on its own, and every one the unit lacks. A gap
  is evidence that a reader missed something, not a suggestion. Look at each at the gate.

**A usage-limit stop costs only the step that was running.** Re-run the same command: every agent
step that finished is reused from disk (`candidates/*.json`).

**After a change to the merge rules**, re-merge an unreviewed chapter from its saved agent output
with `--remerge` (a reviewed chapter is refused). No reader is called; the romaji correction runs for
any card with no cached romaji, which is only a card the merge newly produced or one whose correction
failed.

**If the run prints `romanization eval: failed`**, the cards carry the library's uncorrected romaji
(`gozai masu`, `shi tsu rei`). It is not cached, so `--remerge` retries it. Do that before the gate. To build a chapter again
from scratch, including the paid agent steps, delete its unit folder first.

Build chapters in book order. A written form is carded once per collection, in the chapter that first
teaches it, and the merge only knows about chapters built before it. A chapter built out of order says so
at the end of its run and prints the `--remerge` command for each later chapter; run them in book
order. Preflight's `one card per written form` names any repeat that is left.

## 2. Gate 1: content

Run preflight on the collection, then hand over the dashboard.

```sh
node scripts/preflight.mjs output/epubs/<slug>-reading
npm run serve
```

Preflight runs the reading checks (`src/audit/checks/reading.js`) and says which speaking checks it
skipped. **FAIL** findings must be fixed before the link goes out: a front carrying furigana, a
bracketed reading or sentence punctuation; a written form carded twice; a single kana; a kanji word
with no kana reading. **ACK** findings are judgements: Latin letters on a front (Ｔシャツ is right,
romaji is not), a front over 16 characters (right for a long set phrase the book teaches), a word
carded in kana where the chapter prints its kanji.

In the dashboard the owner reviews the chapter and presses **Mark reviewed**, which saves it to the
reading collection's own dedup library. The card-faces view shows the reading card exactly as Anki
will: one face, the written form alone.

**Never hand over a gate and stop: arm a watcher with the Monitor tool when you give the link**, and
tell the owner it is armed. When it fires, carry on by yourself (audio after gate 1). It is the same
script and the same rules as the speaking decks (`build-anki-deck` SKILL.md, "Arm a watcher"); it
reads a reading unit exactly as it reads a speaking one. Pass an absolute path.

```sh
RUN=$PWD/output/epubs/<slug>-reading/chapter-<n>
node scripts/await-review.mjs "$RUN" --gate 1 && anki-builder audio --run "$RUN"   # Mark reviewed
node scripts/await-review.mjs "$RUN" --gate 2                                     # Mark done + rebuild
```

The first Genki chapter was handed over without one. The owner pressed Mark reviewed, nothing
happened, and they had to ask, which is the message the watcher exists to save.

## 3. Audio, then Gate 2

```sh
anki-builder audio --run output/epubs/<slug>-reading/chapter-<n>
```

This spends ElevenLabs credits: one clip per word or phrase. **Single-kanji cards get no clip, by
design**; the stage says how many were silent. It is a human step at any scale beyond a chapter or
two. The owner reviews the audio in the dashboard as for a speaking deck: a kanji word the voice
misreads is caught by ear here, and the reading on the card is what to check first.

## 4. Mark done, build, preflight, deliver

When the audio gate passes, the owner presses **Mark done** in the dashboard; only done units go into
the package. Hand over the audio gate with the `--gate 2` watcher armed, as at gate 1.

```sh
anki-builder deck --book-dir output/epubs/<slug>-reading
node scripts/preflight.mjs output/epubs/<slug>-reading
```

The package's parent deck is the collection's deck name (or `<book title> (Reading)` if none was
set), each chapter a deck directly beneath it, and its notes use the note type
`AnkiBuilder <lang> Reading`, one card each. **Delivery is the owner's step**, exactly as for a
speaking deck (`node scripts/deliver-to-anki.mjs --dry`, then without `--dry`). The first delivery
of any reading deck creates the reading note type; the dry run says `createModel`. Whether creating a
note type makes Anki ask for a one-way full sync has not been measured, so tell the owner before the
first one, and import a throwaway `.apkg` into a scratch Anki profile first if they want to see the
cards before anything touches their collection.

## Not in the first version

No extras phase, no learning pass and no final review pass. If an operator used to `build-anki-deck`
looks for them, that is why they are not here.
