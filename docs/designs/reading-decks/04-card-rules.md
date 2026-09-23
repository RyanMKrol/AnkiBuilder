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

1. **Card what the chapter teaches you to read: all of it, and nothing it has not reached.** A
   vocabulary table, a list of set expressions, a kanji table. Not a word that only appears in a
   dialogue or an exercise, and not a word the book has not taught yet.
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
6. **No sentences, grammar patterns, conjugation tables or drill lines.** A set phrase is a card only
   when the book teaches it as a unit (greetings, classroom expressions). A phrase whose meaning is
   just its words added together is its words.
7. **Proper names are not cards**, the same rule the speaking decks follow.
8. **The English is the meaning, in natural sentence-case English** ("Movie", "Good morning"), the
   same rule as the speaking decks. For a character it is the meanings the book gives ("Day; sun").

## What the back shows

- A word or phrase: the English and the audio. The audio is spoken from the word's reading when the
  language plugin requires one (05), otherwise from the word itself.
- A character: the English only. No audio, no readings.
- Never: a kana reading, romaji, or the `Note` field. In the speaking decks `Note` carries usage and
  grammar remarks ("polite form of ...", "used with に"), which are about saying a word, not reading
  it.

## Done when

- `docs/card-rules-reading.md` exists and every reading prompt includes it the way the speaking
  prompts include the shared rules: a marker substituted at render time (`src/util/cardRules.js` does
  this for `{{CARD_RULES}}`; the reading rules get their own marker beside it). The test that makes
  every prompt in `docs/` either carry the marker or be deliberately exempt covers the reading
  prompts too, so a speaking prompt can never pick up the reading rules or the reverse.
- Each rule that code can see has a check in 07.
