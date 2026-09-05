# Verb citation forms and the family gap (2026-09-05)

Two gaps reported by the deck's owner, investigated together, addressed as two addition batches
against the Japanese for Busy People Book 1 collection.

> **The `verb-dictionary-forms` batch was REVERTED on 2026-09-05, the day it was authored.** All 23
> cards were written, audio-generated and content-approved, then stripped back out on the owner's
> ruling: the deck should follow the book's own schedule for verb forms rather than supplying
> citation forms ahead of it, and gathering them into Lesson 15 piled that lesson with verbs whose own
> lesson was chapters earlier. The investigation below stands, and the three-verb miss it found
> (みせる, あげる, かりる, all named in Lesson 15's own grammar prose) remains a real open gap, tracked
> in LIMITATIONS. **The `family-vocabulary` batch was kept** and is what actually shipped.
>
> The card data for both batches is left intact in the JSON beside this file, as the record of what
> was authored. The audio generated for the 23 reverted cards is still in `.anki-builder/audio/`, so
> re-adding any of them later costs nothing. The card data is in
> [`verb-forms-family-2026-09.cards.json`](./verb-forms-family-2026-09.cards.json) and was applied by
> `scripts/add-verb-forms-family.mjs`.

The Nihongo 101 course collection was scanned separately and is not touched here. It has one
citation-form gap (すいえいをする) and almost no bare verb vocabulary of its own, its verbs living
inside sentences. Nothing in this document compares the two collections; see CLAUDE.md, "Collections
are isolated".

## Gap 1: verbs taught only in ます-form

### What was found

Dictionary forms existed, but only in Lesson 15, which is where the book introduces the concept.
Twenty-one citation-form cards were in the deck (nineteen in `chapter-15`, plus よむ and あるく in
`chapter-15-extras`). Twenty-three verbs had a vocabulary entry in ます-form and no citation form
anywhere in the collection.

Three of the twenty-three were a straight extraction miss rather than a judgement call. Lesson 15's
GRAMMAR 2 prose enumerates the Regular 2 verbs taught up to that point, so the learner can derive
their dictionary forms: たべます, みます, おしえます, みせます, います, あげます, かります. Four were
carded (たべる, みる, おしえる, いる). みせる, あげる and かりる were not, though the chapter names
them. かりる is the most costly of the three, because it is the R1 lookalike the book calls out: り
before ます, but Regular 2, so かりる and never かる.

### Why the chapter was carded half-way

The Lesson 15 conjugation chart is a page image (`Page_145_Image_0001.jpg`). The prose beside it lists
only the ます-forms. Extraction carded what it could read, and the coverage checks passed, because
every vocabulary headword did reach a card. This is the failure mode `src/cards/taughtNeverUsed.js`
was written for, seen from the other side: that check finds a form carded and never used, and nothing
was looking for a form never carded at all.

### Routing

Twenty of the twenty-three went to `chapter-15-extras`, which is where the book teaches the form.
Three went to `chapter-16-extras` instead: やすみます, しょくじをします and パーティーをします are
Lesson 16 vocabulary, and a citation form in Lesson 15 would be met before the ます-form it derives
from. Prerequisite beats topical fit, per `augment-anki-deck/SKILL.md`.

Twelve are plain verbs (あう, あげる, ある, おくる, かりる, くれる, にあう, のぼる, みせる, もらう,
やすむ, わかる) and eleven are noun+をする compounds, where only the します part changes.

## Gap 2: the family vocabulary

### What was found

Nothing was dropped. Lesson 9's WORD POWER family table teaches exactly twelve terms and the deck has
all twelve. The extraction was faithful.

Siblings, children, sons and daughters are taught in **Lesson 24** (`chapter 51`), in a WORD POWER
table this deck has not been built to; the deck stops at Lesson 16. おとうと first appears in Lesson
17's dialogue and いもうと in Lesson 22's, both in use before being formally taught.

Grandparents and parents are a different case: そふ, そぼ, おじいさん, おばあさん and りょうしん
appear nowhere in Book 1, in any lesson or in either glossary. The book never teaches them.

### What was added

Twenty-two cards into `chapter-9-extras`, where the rest of the family vocabulary lives, as eleven
humble/honorific pairs following the ちち／おとうさん pattern the lesson already teaches. Each card's
`reviewNote` records which of the three cases it is: Lesson 24's table, first seen in a later
dialogue, or absent from Book 1 entirely.

こども is glossed "(My) child" rather than "Child", because こ already carries "Child" in Lesson 13
and two cards cannot share an English prompt without cues. The gloss follows the book's own table,
which lists こども under "Related to the speaker" opposite おこさん, and the card carries a hint and a
note saying こども is also the general word.

## How the surviving batch ships

`family-vocabulary` went in as an addition: every card carries `addition: "family-vocabulary"`, so
`shippableCards()` holds it out of the `.apkg` and the AnkiConnect deliver until it passes the
per-card gates at `/additions/epub/...`. `chapter-9-extras` keeps its own `reviewed` and `done`
sign-off untouched.

All 22 passed the content gate and have audio. Five of the clips carry `audioMarkerStuck`
(おにいさん, おねえさん, おばあさん, plus あげる and わかる from the reverted batch), meaning the
automatic trim could not locate and cut the `。ででで` end marker; those need a listen at the audio
gate.

The `verb-dictionary-forms` batch reached the same point before being reverted, which is the two-gate
design working as intended: the cards were held out of the deck for their whole life, so removing them
changed nothing about what ships.

## What was written back

- `card-authoring-rules.md` gained "Card every verb form the source teaches, and none it does not",
  stated language-agnostically. It keeps the half of the learning that survived the reversal (do not
  miss a form the source teaches, above all one printed as an image or named only in grammar prose)
  and records the owner ruling on the other half (do not supply forms the source has not reached).
- `SKILL.md` names the gap in its Gate 1 checklist of most-violated rules.
- Two entries in `.harness/custom/docs/LIMITATIONS.md`, each with a `Verified by` command: one for the
  citation-form rule having nothing mechanical behind it, one recording that the family gap is the
  book's own sequencing and will collide with Lesson 24 when that lesson is built.
