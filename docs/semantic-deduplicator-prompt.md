# Task: Decide Which of These Are the Same Card

{{CARD_RULES}}

You are given groups of flashcard items from ONE {{TARGET_LANGUAGE}} lesson that has just been
built. Every group was found mechanically: its members share a target, or share an English gloss.
Sharing is not the same as duplicating, and telling those apart is the entire job.

For each group, decide whether its members are **one card written twice** or **genuinely different
cards that happen to look alike**.

## Why a script cannot do this

The build merges items on an exact key: same target AND same gloss. That is deliberately strict,
because loosening it deletes senses. `はし` glossed "Bridge" and `はし` glossed "Chopsticks" are two
words that share a spelling, and a rule that merged them would silently remove one from the deck.

The cost of that strictness is that `とけい` glossed "Watch, clock." and `とけい` glossed
"Watch; clock." survive as two cards. Those are the same word, described twice by two different
readers of the same chapter.

No amount of string comparison separates those cases. The difference is meaning.

## What each verdict means

**`duplicate`**: these are one card. Say which id to KEEP and which to DROP.

Keep the one that teaches better, not the first one:

- the fuller, more natural gloss ("Watch, clock" over "Watch")
- the one whose category is right
- the one carrying a useful note, scene or hint
- where they are equal, keep the shorter id

**`distinct`**: these are different cards and both must stay. Two senses of one spelling, two
different words with a loose shared gloss, or a word and a phrase built from it.

When you return `distinct` for a group sharing a TARGET, the learner will see the same front twice
with different answers, so each member needs something on the card to tell them apart. Say so in
`reason`, naming what distinguishes them. A later check enforces that the cue exists.

## Judging carefully

**Punctuation and connector differences are not meaning.** "Sweets." / "Sweets; confectionery." and
"My, mine." / "My; mine." are the same card. So is a gloss that merely adds a synonym.

**A number and its reading are one card.** "One (1)." and "One." for `いち` are one entry.

**Watch for a real distinction hiding in a small difference.** "Please tell me." and
"Please tell me (the ~)." may be one card, or may be a bare request versus a pattern with a slot. If
the targets differ in a way that matters (`〜を おしえてください` versus `おしえてください`), they are
distinct.

**A word and a phrase containing it are distinct**, even when the glosses overlap.

**When you genuinely cannot tell, return `distinct`.** Keeping a redundant card costs a reviewer one
line to read. Dropping a real one removes it from the deck, and nobody will notice it is gone.

## The groups

{{GROUPS_JSON}}

## Output

Return ONLY this JSON object, with one entry per group, in the order given:

```json
{
  "groups": [
    {
      "group": 1,
      "verdict": "duplicate",
      "keep": "<id to keep>",
      "drop": ["<id to drop>"],
      "reason": "<one short line: why they are the same card>"
    },
    {
      "group": 2,
      "verdict": "distinct",
      "reason": "<one short line: what distinguishes them, and so what cue each needs>"
    }
  ]
}
```

Every group must appear exactly once. `keep` and `drop` are required for `duplicate` and must
together name every id in the group. Omit them for `distinct`.
