<!--
The rules every READING pass shares, injected at render time wherever a reading prompt carries
{{READING_CARD_RULES}} (src/util/readingCardRules.js). A reading prompt carries this marker and never
{{CARD_RULES}}: the speaking rules are about scenes, hints and a Production card that a reading deck
does not have. A test enumerates docs/ and holds every prompt to that.

Design and the owner's decisions: docs/designs/reading-decks/04-card-rules.md. Language-specific
behaviour (Japanese kanji cards, kana readings) is NOT here; it is the language plugin's block
(src/reading/readingSchemes.js), injected beside these rules.
-->

## What a reading card is

A reading deck trains one thing: reading what the book teaches. Each item becomes ONE card. Its front
shows the item exactly as the book writes it and nothing else; its back shows the English and plays
the audio. There is no English-to-target card. Grammar, sentences and drills belong to a separate
speaking-and-listening deck and never come into this one.

## What earns a card

1. **Card what this chapter teaches you to read: all of it, and nothing it has not reached.** A
   vocabulary table, a list of set expressions, a table of characters the chapter teaches. Not a word
   that only appears in a dialogue, an exercise, an example sentence or a reading passage, not a word
   that only appears in a heading, a title or an instruction (a chapter called デートの約束 does not
   teach 約束), and not a word the book has not taught yet.
2. **One card per word, in the fullest written form the book prints.** When the book prints a word in
   more than one form, the language rules below say which form is the card. A word printed in one
   form only is carded exactly as printed.
3. **One card per written form.** Two cards with the same `target` would be the same question with
   two answers. When the chapter teaches one written form with two readings or meanings, write ONE
   item whose `english` carries both ("Today; this day").
4. **A single character is a card only when the language rules say so** and the book teaches it as a
   character (a character table). A character that only appears inside a word is not a card of its
   own. A single character the book also teaches as a word in its own right is one card: the word.
5. **Never a single letter of an alphabet or syllabary** (in Japanese, never a single hiragana or
   katakana). The learner studies those in a separate deck.
6. **No sentences, grammar patterns, conjugation tables or drill lines.** A set phrase is a card only
   when the book teaches it as a unit (a greeting, a classroom expression). A phrase whose meaning is
   just its words added together is its words.
7. **Proper names are not cards**: people, places, companies, named facilities.
8. **`english` is the meaning, in natural sentence-case English**: "Movie", "Good morning", "Day;
   sun". Not lowercased dictionary clips, and never the pronunciation.

## What an item may contain

- `target`: the written form exactly as the book prints it, and nothing else. No reading in brackets,
  no furigana, no romaji. Leave off the full stop a book prints after a phrase (おはよう。 is the card
  おはよう), and, in a language written without spaces, the spaces a beginners' book puts between
  words (おはよう ございます is おはようございます). Keep a question mark that belongs to the phrase.
- `english`: as above.
- `reading`: only where the language rules ask for one, copied from the book, never worked out.
- `category`: one of the categories the prompt lists. It groups the review and is never shown.
- Nothing else: no scene, hint, note or pronunciation. The card has nowhere to show them.
