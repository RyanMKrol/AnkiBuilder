# 10. Character cards a chapter needs before the book teaches them

Owner decisions, 2026-09-28. Code: `src/reading/characterGaps.js` (generic),
`src/reading/kanjiDictionary.js` and `src/reading/data/` (the Japanese dictionary), the
`characterSource` hook on the Japanese reading scheme, the `readingCharacterWriter` and
`readingCharacterReviewer` roles, and the character step of `build-reading.mjs --book-pass`.

## Why

A reading deck cards each word as the book writes it. Genki prints its vocabulary in full kanji from
Lesson 3 (眼鏡, 聞く) and teaches each kanji on its own much later, in the Reading and Writing section,
or never: 579 kanji appear in the deck's words and Genki I teaches 145. So a learner met 聞く fifteen
chapters before 聞, and 眼鏡 with no card for 眼 or 鏡 at all.

## What was decided

- Every kanji a word uses gets a character card, in the first chapter that uses it.
- Its meaning and readings come from a dictionary (KANJIDIC2), then a model for any the dictionary
  lacks, and one review agent per chapter checks everything generated there, trimming a dictionary's
  obscure senses and rare readings. The owner does not trust a dictionary wholesale, and cannot judge
  kanji readings unaided, so the reviewer is the check.
- A character card stays silent (no single reading is right on its own) and shows its readings on the
  romaji line (`bun / ki`), as the book's own kanji cards do (DECISIONS.md).
- When the book later teaches the kanji, the book's meaning and readings replace the generated ones on
  that card, and the book's own card in the later chapter is dropped as a repeat. It is one card
  throughout: the id comes from the written form, so a delivered card is updated in place.
- Within a chapter, the character cards come first, then the words, each group shuffled.
- Hoisting the book's kanji cards to their first use was considered and rejected: built chapter by
  chapter, a chapter cannot know what a later one teaches.

## How it runs

For each chapter, after its merge, the book pass: drops a character card the chapter repeats from an
earlier one; gives the book's data to an earlier generated card for each kanji the chapter's table
teaches; then fills the chapter's own gaps. Every step works in place and keeps review edits. A
chapter marked done is not changed. A chapter only reviewed is, and its review is withdrawn: a card
nobody has seen is not covered by a sign-off given before it existed. Each generated card carries a `reviewNote` saying
where its data came from, and `candidates/characters.json` records every generated character, its
source, the reviewer's verdict and, later, the chapter whose book data replaced it.

Each generated card records the version of the review it was checked under (`CHARACTER_REVIEW_VERSION`
in `src/reading/characterGaps.js`). Raise it whenever the review prompt changes what the reviewer
fixes: the book pass then re-reviews every generated card checked under an older version, one call per
chapter. The first Genki run needed it: its review kept dictionary senses a learner never meets (校
"Exam; school; printing").

## The dictionary

`src/reading/data/kanjidic2-compact.json` holds KANJIDIC2's 2,974 graded kanji (jōyō and jinmeiyō)
with meanings, readings, grade and frequency, built by `scripts/build-kanji-dictionary.mjs` from the
jmdict-simplified JSON edition. `src/reading/data/NOTICE.md` carries the CC BY-SA 4.0 attribution.

## Complete readings, and voicing a kanji with only one (owner decisions, 2026-09-28)

A book teaches a kanji's readings as it needs them: Genki lists every official reading for only 45 of
its 144 kanji (明 gets めい and あか, not みょう, あ or あき). Every kanji card is now completed to the
official school reading list, the 常用漢字表, which the Japanese plugin keeps as a reference for any
book (`src/reading/joyoReadings.js`, built by `scripts/build-joyo-readings.mjs`): the book's readings
first (or a reviewed generated card's), then each official one it lacks. Special and narrow-use
readings, bracketed in the official table, are left out.

A kanji card is then voiced exactly when its completed list has one reading (曜 よう, 週 しゅう): with
the full list, "one reading" means one, not one taught so far. Every other kanji card stays silent.
`candidates/characters.json` keeps a `cards` entry per character card, so a voiced kanji card is never
mistaken for the word card of a single-kanji word (日 read ひ). Generic code only calls the plugin's
`characterSource.complete` and `soleReading`.
