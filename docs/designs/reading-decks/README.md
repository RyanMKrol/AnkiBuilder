# Reading decks

Status: design, agreed with the owner on 2026-09-23. Nothing here is built yet.

A second kind of deck, built by its own skill, that trains one thing: reading what the book teaches.
Every card shows the word as the book writes it and nothing else. You read it, turn the card, hear it
said and see what it means. For Japanese, the characters the book teaches get cards of their own too,
so you learn what each one means.

The decks the pipeline builds today are for speaking and listening. They stay exactly as they are.
Grammar, sentences, drills and the extras unit all belong to them, and none of it comes into a
reading deck.

## The documents

This folder is the reference for the build. Each numbered file is one piece of work that can go on
its own branch, and says what it depends on and when it is done.

| file                                                       | what it covers                                                      |
| ---------------------------------------------------------- | ------------------------------------------------------------------- |
| [01-collection-identity.md](01-collection-identity.md)     | a collection is a book plus a deck kind, so one book can carry both |
| [02-reading-note-type.md](02-reading-note-type.md)         | the one-template note type, and the code that assumes two templates |
| [03-everything-conversion.md](03-everything-conversion.md) | a conversion purpose that keeps every study unit                    |
| [04-card-rules.md](04-card-rules.md)                       | what earns a reading card, in every language                        |
| [05-japanese-plugin.md](05-japanese-plugin.md)             | kanji cards without audio, and kana readings for the word audio     |
| [06-reading-extraction.md](06-reading-extraction.md)       | the phase that turns a chapter into a reading corpus                |
| [07-checks.md](07-checks.md)                               | every rule code can see, as a check                                 |
| [08-skill-and-pilot.md](08-skill-and-pilot.md)             | the `build-reading-deck` skill, and the Genki pilot                 |

## What the owner has decided

All on 2026-09-23.

- **One card per item, one direction.** Written form on the front. There is no English-to-Japanese
  card.
- **The front is silent.** No audio until the card is turned.
- **The back of a word card is the written form, the English, the romaji and the audio.** Revised
  the same evening: the first design had no romaji, and the owner asked for it on seeing the cards,
  because reading is for speaking too and the romaji lets you check you read the word right. Still no
  kana reading and no note: the reading is TTS plumbing and is never rendered, as in the speaking
  decks.
- **Single kanji get cards, with no audio.** A kanji on its own has no single pronunciation (日 is に
  in 日本, び in 日曜日, ひ on its own), so its card teaches what it means and nothing else.
- **Kanji words are said correctly.** A word containing kanji carries its kana reading, which drives
  the audio and is never shown.
- **The Japanese behaviour is a language plugin.** Kanji cards and kana readings are declared for
  Japanese; a language without a plugin gets word cards only.
- **The source is what the book teaches.** Words written in kana count as well as words written in
  kanji: Genki's greetings on page 41 (おはようございます and the rest) are reading cards even though
  they contain no kanji.
- **Short units only.** Characters, words, and a set phrase where the phrase is what the book teaches
  (a greeting). Never a sentence.
- **No cards for single kana.** The owner already studies hiragana and katakana in a separate deck.
- **No extras unit.** Each chapter is the book's own content and nothing else.
- **A collection is a book plus a deck kind** (`speaking-listening` or `reading`), and the skill used
  decides the kind. Recorded in DECISIONS.md.
- **A book can be converted for everything**, so a reading deck misses nothing the book teaches. This
  amends the 2026-09-21 ruling that there was no "everything" purpose; see 03.

## The card

```
word card                                   kanji card
front              back                     front              back
+------------+     +------------+           +------------+     +------------+
|            |     |    映画     |           |            |     |     日      |
|    映画     |     |  --------  |           |     日      |     |  --------  |
|            |     |  Movie     |           |            |     |  Day; sun  |
|            |     |  eiga      |           |            |     |            |
|            |     |  [audio]   |           |            |     |            |
+------------+     +------------+           +------------+     +------------+
```

One template serves both: front `{{Target}}`, back the front, `{{English}}`, `{{Pronunciation}}` (the
romaji) and `{{Audio}}`. A kanji card simply has no romaji and no audio, and Anki renders an empty
field as nothing. Details in 02 and 05.

## Build order

Each step is its own branch, merged when green. 01, 02 and 03 do not depend on each other and can be
built in parallel.

1. **01 Collection identity.**
2. **02 Reading note type.**
3. **03 Everything conversion.**
4. **04 Card rules and 05 Japanese plugin**, together, since the plugin is how the rules reach
   Japanese. Needs 02 for the audio exemption.
5. **06 Reading extraction.** Needs 01, 04 and 05.
6. **07 Checks.** Needs 04, 05 and 06.
7. **08 Skill, then the pilot.** Needs everything above. The pilot converts Genki for everything and
   builds two chapters end to end, reviewed by the owner at both gates before anything is delivered.

When a step lands, its file here gets a status line saying so, and README.md, PIPELINE.md and the
skills are updated in the same commit, as golden rule 3 requires.

## Later, when there is a reason

- A reading kind for courses (`output/courses/`). A course is a list the owner types, and nothing in
  this design stops one being added the same way.
- Showing a kanji's readings on its card. Left out because the owner asked for meaning only.
