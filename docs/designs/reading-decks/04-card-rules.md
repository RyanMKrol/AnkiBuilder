# 04 What earns a reading card

Depends on: nothing to write, but it lands with 05, because the Japanese plugin is how several of
these rules reach Japanese. Status: built (branch `feat/reading-rules-japanese`):
`docs/card-rules-reading.md`, injected by `renderPromptTemplate` wherever a template carries
`{{READING_CARD_RULES}}` (`src/util/readingCardRules.js`). A test holds every `reading-*-prompt.md`
to carrying it and never `{{CARD_RULES}}`, and every other prompt to never carrying it.

These rules go in a new `docs/card-rules-reading.md`, included by every reading pass the same way
`docs/card-rules-shared.md` travels with the speaking passes. A rule needed by more than one pass lives
there and nowhere else; that is the lesson of the paradigm-cell and proper-name rules, which existed
and did not travel.

The speaking rules are not included. Most of them (scenes, hints, collision cues, gap filling) exist
because of the Production card, and a reading deck has none.

## The rules

1. **Card every word the chapter puts in front of the learner to read, wherever it appears**:
   vocabulary lists, kanji tables, dialogues, exercises, Culture Notes, reading passages and their
   word lists. The English comes from the book where it gives one; where it does not, the reader
   writes it and the card is flagged AI-suggested for the review (the reading phase has no separate
   translate pass, so the reader's own English plays that part). A word a later chapter's vocabulary
   list introduces is carded there, not here, so the deck keeps the book's order: the readers say
   where they saw each word, and the merge holds back a word this chapter only uses when one of the
   collection's own later chapters lists it (`src/reading/laterVocabulary.js`, reading the later
   chapters' vocabulary tables from the chapter cache). Headings, titles and instruction lines are
   not carded. (Owner ruling, 2026-10-18, which widened the first version: that one carded only the
   vocabulary tables and lists, and left out 生け花 from a Culture Note that prints it with its
   reading. The speaking deck's chapter reader has always worked this way.)
2. **One card per word, in the fullest written form the book prints.** When a book prints a word in
   more than one script, the language plugin says which form is the card (05). For Japanese it is the
   kanji spelling: Genki's tables print `えいが | 映画 | movie`, and the card is `映画`. A word printed
   in one form only is carded as printed: `スポーツ`, `おはようございます`.
3. **One card per written form in a collection.** Two cards with the same front would be the same
   question with two answers. 今日 read as きょう and as こんにち is one card whose English carries
   both meanings. A word already carded in an earlier chapter of the collection is not carded again;
   the backward dedup library does this within the collection, as it does for speaking decks.
4. **A character is a card only when the language plugin declares character cards and the book teaches
   it as a character.** For Japanese that means a kanji in a kanji table (05). A character that only
   appears inside a word is not a card on its own. When a single character is also taught as a word
   in its own right (日 as ひ, "day"), it is one card, and the word wins: a word has one pronunciation,
   so it keeps its audio.
5. **Never a single letter or kana.** The owner studies hiragana and katakana in a separate deck, and
   an alphabet is a template, not a book.
6. **Words, not sentences or phrases.** No sentences, requests, grammar patterns, conjugation tables
   or drill lines, classroom expressions included. A word joined to another by a particle is its
   words, and an inflected form is its dictionary form. Only fixed greetings and set expressions
   written as one unit stay. (Owner ruling, 2026-10-13, which narrowed the first version: that one
   let in any set phrase the book taught as a unit, and 73 Genki cards had to be cut. The working
   rule is `docs/card-rules-reading.md`.)
7. **Proper names are not cards**, the same rule the speaking decks follow.
8. **The English is the meaning, in natural sentence-case English** ("Movie", "Good morning"), the
   same rule as the speaking decks. For a character it is the meanings the book gives ("Day; sun").

## What the back shows

- A word or phrase: the written form, the English, the romaji and the audio. The romaji and the
  audio are made from the word's reading when the language plugin requires one (05), otherwise from
  the word itself. (Owner decision, 2026-09-23 evening: reading is for speaking too, so the back lets
  the learner check they read the word right, not only that they understood it. The first design had
  no romaji.)
- A word the book prints with more than one reading (七人 しちにん／ななにん, 毎年 まいねん／まいとし):
  the romaji lists every reading in the book's order, "shichi-nin / nana-nin", and the audio speaks
  the first. (Owner ruling, 2026-10-18: the book says both are right for the same word, so one spoken
  take is still right, and a learner who reads the second should be told it is also correct.) This
  is not the same as a kanji whose reading depends on the word it sits in, which stays silent.
- A character: the English only. No romaji, no audio, no readings.
- Never: the kana reading, or the `Note` field. In the speaking decks `Note` carries usage and
  grammar remarks ("polite form of ...", "used with に"), which are about saying a word, not reading
  it.

## Done when

- `docs/card-rules-reading.md` exists and every reading prompt includes it the way the speaking
  prompts include the shared rules: a marker substituted at render time (`src/util/cardRules.js` does
  this for `{{CARD_RULES}}`; the reading rules get their own marker beside it). The test that makes
  every prompt in `docs/` either carry the marker or be deliberately exempt covers the reading
  prompts too, so a speaking prompt can never pick up the reading rules or the reverse.
- Each rule that code can see has a check in 07.
