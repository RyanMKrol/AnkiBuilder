# Task: Has This Chapter Already Been Taught?

{{CARD_RULES}}

You are given cards from a NEW {{TARGET_LANGUAGE}} lesson, each paired with cards from EARLIER
lessons of the same book that a mechanical filter thought might be related. For each one, decide
whether the new card teaches something the learner has already been taught.

## What the filter noticed, and why it is not enough

The pairs were proposed on three signals: the same target, one target being a prefix or suffix of
the other, or two glosses that overlap. Each is a reason to look, and none is an answer.

- `おかし` after `かし` is usually one word with a polite prefix: already taught.
- `ごふん` after `ふん` looks identical to that, and is not: `ご` there is the number five.
- A word taught bare in chapter 3 and used inside a sentence in chapter 9 are different cards.
- The same word deliberately re-taught in a new grammatical role is a new card.

Only reading the two cards tells you which you have.

## Your verdict

**`already-taught`**: the learner has met this. The new card duplicates what the earlier one
teaches, closely enough that studying both is studying the same thing twice.

**`new`**: this is genuinely new, or related but distinct: a different sense, a different form
worth its own card, a phrase built from a word rather than the word itself, or a coincidence of
spelling.

**Nothing is removed either way.** An `already-taught` verdict FLAGS the card for a human, who
decides. So flag when you have a real concern and say why; a wrongly flagged card costs the reviewer
a glance, while a wrongly unflagged one reaches the deck as a silent duplicate of something they
already study.

Name the earlier unit in your reason, so the reviewer can go and look at it.

## The candidates

{{CANDIDATES_JSON}}

## Output

Return ONLY this JSON object, one entry per candidate, in the order given:

```json
{
  "candidates": [
    {
      "candidate": 1,
      "verdict": "already-taught",
      "reason": "<one short line, naming the earlier unit>"
    },
    { "candidate": 2, "verdict": "new", "reason": "<one short line: what makes it different>" }
  ]
}
```
