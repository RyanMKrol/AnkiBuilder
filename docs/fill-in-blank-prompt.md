# Task: Mine Fill-in-the-Blank Practice Cards

## Overview

You are adding extra practice cards to a {{TARGET_LANGUAGE}} flashcard lesson. Textbook lessons carry
fill-in-the-blank drills, substitution tables and practice exercises whose example lines make good
sentence cards — but only once each blank is resolved into a concrete word. Your job is to mine those
patterns and return complete, level-appropriate sentences.

These cards are shown to a human reviewer before anything is built, badged as AI-generated practice,
so a card you are unsure about costs a moment's glance. A card built on vocabulary the learner has
not met costs them a broken lesson, so the vocabulary rule below is absolute.

## What a card looks like

{{CARD_FACES}}

## Source

{{SOURCE_INSTRUCTION}}

## The lesson's existing cards

These are every card already in the lesson, in study order. **This list defines the entire vocabulary
and grammar you are allowed to use.** Cards marked `"excluded": true` have been dropped by the
reviewer — treat their vocabulary as unavailable too, and build the equivalent sentence on a kept
word instead.

```json
{{CARDS_JSON}}
```

## Rules

1. **Only already-introduced vocabulary and grammar.** Every word and construction in a drill
   sentence must appear in the lesson's cards above, or in the earlier lessons summarised below.
   Never invent new vocabulary, and never reach for grammar the lesson has not taught. If a drill in
   the source needs a word the lesson lacks, skip that drill.
2. **Resolve every blank.** Return a complete sentence, not a template with a gap in it. A card that
   still contains `___` or `（　）` is useless as a flashcard.
3. **One prompt, one response.** Never put a question and its answer on the same card. A source line
   like "When is the presentation? — It's at 3:00 today." becomes TWO cards: the question, and the
   answer. Keep the pair adjacent in the order you return them.
4. **An ANSWER card must carry its question as a `scene`.** The pair you just split is studied shuffled,
   weeks apart, so the answer card comes up alone, with nothing on it to say what was asked. "It's at
   3:00 today." is unanswerable in that state. So every answer half gets a short front `scene` naming
   the question it replies to: `"answering when the presentation is"`, `"answering where the vacuum
cleaner is"`. The scene is shown on the front of BOTH card directions, states the QUESTION and never
   leaks the answer: for a card answering "Where is the computer?" the scene is "answering where the
   computer is", never "it's in the basement".
5. **The `english` must render the WHOLE `target`, including a topic the target states.** Splitting a
   drill tempts you to write the answer the way a person would say it in conversation, dropping what
   the question already established. That is right only when the TARGET drops it too. If the target
   keeps the topic, the English must keep it:
   - `パーティーはごじです` → "The party is at 5:00." ✅ — target says パーティーは, so English says "the
     party". Writing "It's at 5:00." ❌ makes the card unproducible: nothing in the prompt tells the
     learner to reach for パーティーは.
   - `にちようびです` → "It's on Sunday." ✅ — the target drops the topic too, so the English may. This
     card still needs the rule-4 scene.
     Check every answer card by reading the English alone and asking whether it could produce that exact
     target. If it could not, the English is missing something the target has.
6. **New patterns beat repetition.** Prefer drills that exercise a sentence frame or a
   vocabulary/context combination the lesson's existing cards do not already cover. Several
   near-identical siblings (the same frame with the noun swapped) are worth far less than one example
   of each of several frames — a later pass will delete the repeats, so returning them wastes the
   slot.
7. **Natural sentence-case English.** The `english` reads as ordinary written English: capitalized
   first letter, sentence punctuation on a full sentence (`Is this a pen?`, `It's at three o'clock.`),
   never a lowercased clip.
8. **Write the target the way the deck does.** No trailing `。` (the audio stage adds one itself where
   the language wants it) and no editorial word-separation spaces. Keep any mid-sentence `、`.
9. **Get the counter's own reading right — they are frequently irregular.** A number's reading changes
   with the counter or measure word that follows it, and guessing produces a card that is spoken
   aloud confidently and wrongly. {{COUNTER_EXAMPLES}} If the source gives the reading in brackets —
   textbooks routinely print the spoken form in parentheses after the digits — use that, and if you
   are unsure of one, leave the number out of the sentence rather than guess.
10. **Spell out digits in `ttsText`.** `ttsText` is the text TTS speaks instead of the target
    whenever the written target would be misread (numerals AND kanji-bearing targets); it is never
    rendered on any card face. When a sentence contains a numeral (a price, a floor, a time), set
    `ttsText` to the whole sentence with that number written out in {{TARGET_LANGUAGE}}'s own script.
    It drives both the romanization and the audio, both of which mishandle raw digits.
11. **Aim for {{TARGET_COUNT}} cards or fewer.** Quality over volume — returning nothing at all is a
    valid answer for a lesson whose source has no usable drills.

## Earlier lessons

{{EARLIER_VOCAB}}

## Output Format

Return ONLY a JSON object. No prose, no explanation.

```json
{
  "cards": [
    {
      "id": "fib-shinkansen-de-ikimasu",
      "english": "I'm going by Shinkansen.",
      "category": "Travel & Tourism",
      "target": "しんかんせんでいきます",
      "ttsText": "しんかんせんでいきます",
      "pronunciation": "shinkansen de ikimasu",
      "scene": "answering how you are getting to Osaka",
      "note": "で (de) marks the means of transport — the vehicle you go BY.",
      "sourcePattern": "[transport] で いきます"
    }
  ]
}
```

Field by field:

- `id` (string): a unique kebab-case handle, prefixed `fib-`. Must not collide with an existing card id.
- `english` (string): the English side, sentence case.
- `category` (string): reuse one of the categories already present on the lesson's cards.
- `target` (string): the {{TARGET_LANGUAGE}} sentence, as the card face shows it.
- `ttsText` (string, optional): what TTS speaks instead of `target` — set it only when the written
  `target` would be misread (rule 10). Never rendered on a card face.
- `pronunciation` (string): the romanization of the spoken form, in the deck's pinned style. Every
  rule below is a rule the deck is linted against, so a card that breaks one is reported to the
  reviewer:
  {{ROMANIZATION_STYLE_RULES}}
- `scene` (string, optional): a short situation cue, shown on the front of BOTH card directions.
  REQUIRED on the answer half of a question/answer pair (rule 4), naming the question it replies to.
  Omit it on a card that stands on its own. Never restate the English and never leak the answer.
- `note` (string, optional): a short back-of-card note, only when there is something genuinely useful
  to say about using the sentence. Omit it rather than restating the English.
- `sourcePattern` (string): the sentence frame this card drills, written as a short skeleton with the
  variable part in brackets. Used to group near-identical cards later — two cards that drill the same
  frame must carry the same `sourcePattern` string.
