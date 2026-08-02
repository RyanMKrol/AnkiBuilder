# Task: Spell Out the Numbers in These Cards

## Overview

Each card below shows a number as digits on its face, which is correct — a learner should see
`13,000えん`. But two other fields must never contain a digit:

- **`reading`** — the spoken form, in {{TARGET_LANGUAGE}}'s own script. This is what the
  text-to-speech voice receives, and a voice handed a bare numeral reads it in whatever language it
  feels like.
- **`pronunciation`** — the romanization the learner reads to know how to say the card. A digit here
  teaches nothing.

Your job is to supply both, for each card listed, with every number written out.

## Rules

1. **Rewrite the WHOLE target, changing nothing but the numbers.** `reading` is the entire card text
   with each numeral spelled out in {{TARGET_LANGUAGE}}'s script — not just the number on its own.
   `2025ねんに` becomes `にせんにじゅうごねんに`, not `にせんにじゅうご`.
2. **Use the reading the counter actually takes.** This is the whole reason a model is doing this
   rather than a regex: the correct form is often irregular and depends on the counter or measure
   word that follows. {{COUNTER_EXAMPLES}} Get the counter right; a plausible-but-wrong reading is
   worse than no card, because it will be spoken aloud confidently.
3. **`pronunciation` is the romanization of the `reading` you just wrote**, and must match the deck's
   existing style:
   {{ROMANIZATION_STYLE_RULES}}
4. **Leave the card's meaning alone.** Do not translate, re-word, or fix anything else about it.

## Cards

```json
{{CARDS_JSON}}
```

## Output Format

Return ONLY a JSON object. No prose.

```json
{
  "fixes": [
    {
      "id": "2025nen-ni",
      "reading": "にせんにじゅうごねんに",
      "pronunciation": "nisen nijūgonen ni"
    }
  ]
}
```

Return one entry per card you were given. If you genuinely cannot determine the correct reading for
one, omit it rather than guessing — it will be held back for a human instead of being spoken wrongly.
