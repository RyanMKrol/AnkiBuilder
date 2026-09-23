# 05 The Japanese reading plugin

Depends on: 02 (the audio exemption lives there). Lands with 04. Status: not built.

## Why a plugin

Two things the owner wants are specific to Japanese: cards for single kanji, with no audio, and kanji
words spoken from their kana reading so the audio says them correctly. Neither makes sense for a
language written in an alphabet. The pipeline already has the pattern for this: per-language
behaviour declared in a registry keyed by ISO 639-1, where an unconfigured language gets the plain
default rather than an invented one (`src/cards/inflectionSchemes.js`, described in PIPELINE.md under
"Inflected forms, as a per-language plugin").

## The registry

A new `src/reading/readingSchemes.js`, keyed by ISO 639-1, with one entry, `ja`. A language with no
entry returns `null`, which means: word and phrase cards only, no character cards, audio spoken from
the target as written.

The Japanese entry declares four things.

### 1. Which written form is the card

When the book prints a word in kana and in kanji, the card is the kanji spelling, and the kana
becomes the word's reading (below). Genki's tables are `えいが | 映画 | movie`: target `映画`,
reading `えいが`. A word printed only in kana is carded as printed and needs no separate reading.

### 2. Character cards

A kanji is a card when the book teaches it as a character: an entry in a kanji table, the way Genki's
reading and writing lessons present each new kanji with its meaning, readings and example words. The
card is the kanji on the front and its meanings on the back ("Day; sun"). No readings are shown and
no audio is made.

Only kanji the book teaches. A kanji that appears inside a carded word, without a table entry, is not
a card; the plugin never adds characters the book has not taught. A book with no kanji tables yields
no character cards at all, which for Genki's conversation half is correct.

The example words a kanji table lists (Genki gives several per kanji, with readings) are word cards
under rule 2, deduplicated against words the collection already has.

### 3. Which cards are silent

A card whose target is exactly one kanji is silent: no audio is generated for it, and the audio
exemption in 02 lets it ship without one. Decided from the target alone (one character in the CJK
ideograph range, or `々`), so neither schema gains a field and nothing has to be remembered.

The exception from rule 4 in 04 applies: a single kanji the book also teaches as a word on its own
(日 as ひ, "day") is a word card, and has audio.

### 4. Kanji words carry a kana reading

A word target containing any kanji must carry `reading`, in kana. It is taken from the book: the kana
column of a vocabulary table, or the reading printed beside an example word in a kanji table. The
agents are told to copy it, not to derive it, because a kanji's reading depends on the word it is in
and a guessed reading is exactly the error this exists to prevent.

The reading drives the audio through the existing path (`reading` becomes `ttsText`, and `speechText`
in `src/audio/index.js` speaks `ttsText` when there is one). It is never rendered, which is the rule
the speaking decks already follow ("reading never rendered", settled 2026-08-14).

The audio review gate works as it does for the speaking decks, including the existing alternate-take
tools, so a word the TTS voice still says oddly is caught by ear.

## Where the plugin is read

| reader                              | what it asks                                                                                                          |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| the reading extraction prompts (06) | which form to card, whether to card characters; injected as a block the way the inflection scheme reaches its prompts |
| the reading checks (07)             | whether a reading is required, which targets are silent                                                               |
| the audio stage                     | skip silent targets, so no TTS is spent on them                                                                       |
| `assertEveryCardHasAudio` (02)      | whether a card with no audio is a silent kind                                                                         |

## Done when

- `readingSchemes.js` returns the `ja` entry and `null` for a language without one, with a test for
  both.
- A test renders a reading prompt for `ja` and for an unconfigured language and checks the character
  instructions appear only in the first.
- A fixture chapter with a kanji table produces character cards with no audio and word cards with a
  reading, and the audio stage asks TTS for the word cards only (the TTS client is a fake, as every
  test's is).
