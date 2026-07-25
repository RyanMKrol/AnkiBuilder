# Task: Mine Fill-in-the-Blank Practice Cards

## Overview

You are adding extra practice cards to a {{TARGET_LANGUAGE}} flashcard lesson. Textbook lessons carry
fill-in-the-blank drills, substitution tables and practice exercises whose example lines make good
sentence cards — but only once each blank is resolved into a concrete word. Your job is to mine those
patterns and return complete, level-appropriate sentences.

These cards are shown to a human reviewer before anything is built, badged as AI-generated practice,
so a card you are unsure about costs a moment's glance. A card built on vocabulary the learner has
not met costs them a broken lesson, so the vocabulary rule below is absolute.

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
4. **New patterns beat repetition.** Prefer drills that exercise a sentence frame or a
   vocabulary/context combination the lesson's existing cards do not already cover. Several
   near-identical siblings (the same frame with the noun swapped) are worth far less than one example
   of each of several frames — a later pass will delete the repeats, so returning them wastes the
   slot.
5. **Natural sentence-case English.** The `english` reads as ordinary written English: capitalized
   first letter, sentence punctuation on a full sentence (`Is this a pen?`, `It's at three o'clock.`),
   never a lowercased clip.
6. **Write the target the way the deck does.** No trailing `。` (the audio stage adds one itself where
   the language wants it) and no editorial word-separation spaces. Keep any mid-sentence `、`.
7. **Spell out digits in `reading`.** When a sentence contains a numeral (a price, a floor, a time),
   set `reading` to the sentence with that number written out in {{TARGET_LANGUAGE}}'s own script. It
   drives both the romanization and the audio, both of which mishandle raw digits.
8. **Aim for {{TARGET_COUNT}} cards or fewer.** Quality over volume — returning nothing at all is a
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
      "category": "Travel",
      "target": "しんかんせんでいきます",
      "reading": "しんかんせんでいきます",
      "pronunciation": "shinkansen de ikimasu",
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
- `reading` (string, optional): the spoken form — set it only when it differs from `target` (rule 7).
- `pronunciation` (string): the romanization of the spoken form.
- `note` (string, optional): a short back-of-card note, only when there is something genuinely useful
  to say about using the sentence. Omit it rather than restating the English.
- `sourcePattern` (string): the sentence frame this card drills, written as a short skeleton with the
  variable part in brackets. Used to group near-identical cards later — two cards that drill the same
  frame must carry the same `sourcePattern` string.
