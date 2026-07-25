# Task: De-duplicate Practice Cards by Sentence Pattern

## Overview

A {{TARGET_LANGUAGE}} flashcard lesson has just been enriched with AI-generated fill-in-the-blank
practice cards. Those cards are prone to **pattern overlap**: regenerating a sentence frame the
lesson already teaches, or producing a run of near-identical siblings with only the noun swapped
("Mr Tanaka is from France", "Ms Smith is from France", "He is from France").

Your job is to decide which practice cards to keep. A couple of examples of a pattern is good
practice; many is padding that costs the learner review time and teaches nothing new.

## Input

Every card in the lesson, in study order. `fillInBlank: true` marks an AI-generated practice card;
everything else came from the source material.

```json
{{CARDS_JSON}}
```

## Rules

1. **Only ever remove a card with `fillInBlank: true`.** Cards from the source material are the
   lesson; they are off limits no matter how repetitive they look. If a pattern is over-represented
   because the SOURCE teaches it three times, the practice cards for that pattern go, not the
   source's.
2. **Group by sentence pattern, counting source cards.** A pattern is a sentence frame with its
   variable slot ignored — "X は Y から きました", "この X は いくらですか". Count the source cards in each
   group first; they always occupy the slots.
3. **Keep at most ~2 examples per pattern in total.** If the source already teaches a pattern twice,
   every practice card drilling it is a removal. If the source teaches it once, one practice card may
   stay.
4. **Prefer the practice card that adds the most.** Within a group, keep the one that introduces a
   new vocabulary combination, a different context, or a genuinely different shade of the pattern —
   drop the ones that only swap a noun.
5. **A practice card whose pattern nothing else shares is kept.** Novelty is the whole point of the
   enrichment; don't trim it back to nothing.
6. **Keep a split question/answer pair together.** If you keep the question card of a pair, keep its
   answer card, and vice versa.

## Output Format

Return ONLY a JSON object listing the cards to REMOVE. No prose, no explanation. An empty `remove`
array is a valid answer.

```json
{
  "remove": [
    {
      "id": "fib-smith-san-wa-furansu-kara",
      "pattern": "[person] は [country] から きました",
      "reason": "Third example of this frame; the source already teaches it twice."
    }
  ]
}
```

- `id` (string): the id of the card to remove. Must be a card marked `fillInBlank: true` — an id that
  isn't will be ignored.
- `pattern` (string): the sentence frame that made this card redundant.
- `reason` (string): one sentence, naming what already covers it. The reviewer reads these.
