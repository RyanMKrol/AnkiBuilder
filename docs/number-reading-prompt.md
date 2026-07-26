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
   rather than a regex: the correct form is often irregular and depends on the counter that follows.
   In Japanese, 4がつ is **しがつ** (not よんがつ), 7がつ is **しちがつ**, 9じ is **くじ** (not
   きゅうじ), 1ぷん is **いっぷん**. Get the counter right; a plausible-but-wrong reading is worse
   than no card, because it will be spoken aloud confidently.
3. **`pronunciation` is the romanization of the `reading` you just wrote**, and must match the deck's
   existing style:
   - Long vowels take macrons: `jūji`, `tōkyō`, `nijūgo`.
   - ん before a vowel takes an apostrophe: `sanzen'en`.
   - A month is one word: `shigatsu`, `hachigatsu`.
   - A number and the counter it modifies are one word, but a long number breaks at its thousand /
     ten-thousand groups: `ichiman sanzen'en`, `nisen nijūgonen`, `jūninichi`.
   - Everything that is not part of the number keeps the spacing it already has.
   - A number and its counter are joined by a HYPHEN: `jūni-nichi`, `shi-gatsu`, `go-ji`,
     `nijūgo-nen`, `ip-pon`, `san-gai`. Never fuse them into one token — `jūninichi` reads as if it
     contains an "ichi" that is not there. An ordinary word that merely looks like a counter keeps its
     spelling: にほん "Japan" is `nihon`, not `ni-hon`.
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
