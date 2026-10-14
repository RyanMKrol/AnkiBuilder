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

**List kana words as usual.** For a language with a kana deck (Japanese), the code, not you, moves a
chapter's kana-only words into the collection's one kana deck; a word you leave out cannot be chosen
for it.

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
5. **Never a letter of an alphabet or syllabary taught as a letter** (in Japanese, a hiragana or
   katakana from a kana chart or a writing lesson). The learner studies those in a separate deck. A
   single kana the book teaches as a WORD, with a meaning of its own, is a word like any other: に
   "Two", ご "Five", き "Tree". Give it `kind: "word"`; a kana taught as a letter is
   `kind: "character"` and is left out.
6. **Words, not sentences or phrases.** The deck is for reading what the learner will actually meet
   written down, which is words (owner ruling, 2026-10-13, after cutting 73 Genki cards such as この中に
   お酒が入っていますか "Is there alcohol in this?", a sentence nobody ever reads). So:
   - No sentences, questions, requests, grammar patterns, conjugation tables or drill lines. That
     includes the classroom expressions and "useful expressions" lists a book teaches as units.
   - A word joined to another by a particle (雨が降る, 薬を飲む, 風邪をひく) is its words: card 雨, 降る,
     薬, 飲む and so on, never the phrase.
   - An inflected form (知っています, 来ます, 疲れている) is its dictionary form (知る, 来る, 疲れる).
   - What stays: fixed greetings and set expressions you would see written as one unit (ありがとう
     ございます, いらっしゃいませ), and compounds the language uses as one name (男の人, 母の日, a public
     holiday).
   - When a phrase is left out, each word in it that the book teaches is still a card.
7. **Proper names are not cards**: people, places, companies, named facilities.
8. **`english` is the meaning, in natural sentence-case English**: "Movie", "Good morning", "Day;
   sun". Not lowercased dictionary clips, and never the pronunciation.
9. **The English is the whole answer, so it must tell this card apart from every other card in the
   deck.** The learner sees nothing else on the back to go by.
   - Two different words never share an English answer, and neither do two characters. Give one of
     them a short note in brackets: 寒 "Cold (weather)" and 冷 "Cold (to the touch)"; 男性 "Man
     (formal)" beside 男の人 "Man"; 一つ "One (thing)" beside the bare number. One word in two
     spellings (銀行 and ぎんこう) keeps one answer.
   - An English word with two everyday senses says which one: "Right (direction)", "Spring
     (season)", "Cold (illness)", "Platform (at a train station)", "Kind (to people)". A verb pair
     that differs only in who does it says so: 始める "To begin (something)", 始まる "(Something)
     begins".
   - A character's English is what the character itself means, never the meaning of a word it
     appears in. 将 in 将来 is "Commander; about to", not "Future"; in 質問 (question) 問 is
     "Question" and 質 is "Quality; substance", never both "Question". A character the language uses
     only for its sound (呂 in 風呂) says so: "Spine; backbone (mostly used for its sound)".

## What an item may contain

- `target`: the written form exactly as the book prints it, and nothing else. No reading in brackets,
  no furigana, no romaji. Leave off the full stop a book prints after a phrase (おはよう。 is the card
  おはよう), and, in a language written without spaces, the spaces a beginners' book puts between
  words (おはよう ございます is おはようございます). Keep a question mark that belongs to the phrase.
- `english`: as above.
- `reading`: only where the language rules ask for one, copied from the book, never worked out.
- `category`: one of the categories the prompt lists. It groups the review and is never shown.
- Nothing else: no scene, hint, note or pronunciation. The card has nowhere to show them.
