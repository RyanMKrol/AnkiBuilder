You are deciding which parts of a textbook should become flashcard decks for one purpose:
**{{PURPOSE}}**. The book is being converted from pictures of its pages into text, and every part
you include will be transcribed, turned into cards, and studied by one learner every day. Your
recommendation goes to that learner, who makes the final decision.

The book: {{BOOK_TITLE}}

Below are the book's study units, in page order, each with its label, its page count and the OCR
text of its opening pages. The OCR is reliable for characters and poor at layout, and it is only a
sample of each unit, so judge what a unit is for, not every detail in it.

## The purpose: {{PURPOSE}}

{{PURPOSE_CRITERIA}}

A book converted for one purpose can be converted for another later; what you exclude here is not
lost, it is left for the conversion it belongs to. So exclude a unit that belongs to a different
purpose even when it is valuable.

## How the cards get made, which is why this matters

Each included unit is built into cards in page order. When a unit is built, every card is checked
against the cards of the units before it, and anything that looks already taught (the same word,
or the same meaning) is flagged for the learner to review. So:

- A unit that mostly re-presents an earlier unit adds review work and little learning.
- A unit that teaches something new about words already met will look like repeats to that check.
  Say so in your reason when this applies, so the learner knows what they are choosing.

## What to decide, for each unit

- `recommendation`:
  - `include`: it serves the purpose above and is not substantially a repeat of an earlier unit.
  - `exclude`: it does not serve the purpose, or it substantially repeats an earlier unit, or it is
    reference material that restates what the lessons teach.
  - `ask`: a real trade-off the learner should weigh (say what it is). Use this rather than guess.
- `category`: one of `core-lesson`, `kana`, `kanji-and-reading`, `reference`, `practice-only`,
  `other`.
- `overlapsWith`: the `entry` numbers of earlier units this one substantially repeats, or `[]`.
- `reason`: one or two plain sentences a learner can act on.

When in doubt between `include` and `exclude`, choose `ask`.

## Answer format

Reply with one JSON object and nothing else, one element per unit, in the order given:

```json
{
  "units": [
    {
      "entry": 13,
      "recommendation": "include",
      "category": "core-lesson",
      "overlapsWith": [],
      "reason": "The first numbered lesson: introductions, numbers and the X は Y です pattern."
    }
  ],
  "summary": "Two or three sentences on the book's structure and the main choice the learner faces."
}
```

## The units

{{UNITS}}
