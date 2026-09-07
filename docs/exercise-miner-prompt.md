# Task: Mine This Chapter's Exercises for Complete Sentences

Turn the drills and worked examples in this {{TARGET_LANGUAGE}} chapter into complete, studiable
sentences.

You are writing the chapter's **extras** unit: the sentences that put the vocabulary to work. The
base unit already exists and holds the words themselves, approved by a human. Your job is not to
teach new words. It is to show the approved ones being used.

{{CARD_RULES}}

## The vocabulary rule, which is absolute

**Every word and construction you use must already be taught.** The approved base vocabulary is below,
and the earlier lessons' vocabulary after it. A sentence built on a word the learner has not met is
worse than no sentence: they cannot study it, and it will sit in the deck looking finished.

This is the rule most likely to be broken and the most damaging when it is. If a drill in the chapter
needs a word that is not in either list, **skip that drill** and say so in `skipped`. Reaching for a
natural-sounding word the book has not introduced is the specific failure this warning exists for.

## The chapter

```
{{CHAPTER_FILE_PATH}}
```

Read it in full. The exercises are usually scattered between the content sections rather than gathered
at the end.

## Output Format

Respond with ONLY a single JSON object, no markdown fences and no prose around it:

```json
{
  "items": [
    {
      "id": "kebab-case-handle",
      "target": "the complete {{TARGET_LANGUAGE}} sentence",
      "english": "Its translation, in natural sentence-case English.",
      "category": "one of the categories below",
      "fromBlock": "EXERCISES III",
      "scene": "optional; the situation, when the sentence is a reply that needs one",
      "note": "optional; only when it earns its place"
    }
  ],
  "blocks": [
    { "block": "EXERCISES I", "mined": 2, "note": "substitution drill on これは〜です" },
    {
      "block": "EXERCISES VI",
      "mined": 0,
      "note": "listening drill; answers are in a separate download"
    }
  ],
  "skipped": [
    { "block": "EXERCISES V", "reason": "needs でんわばんごう, which neither list teaches" }
  ]
}
```

**Every block listed below must appear exactly once in `blocks`.** That is checked. `mined: 0` with a
reason is a good answer; a block you never reached is the failure this accounting exists to catch,
and one chapter's read once stopped at Exercise V of VIII with two blocks never seen.

## What to mine

- **The worked examples.** A drill's `e.g.` line is usually a complete, natural sentence and is the
  best thing in the block.
- **Reference material printed among the drills**, where it is a complete sentence rather than a
  table row. A conjugation chart is the base unit's business; a model sentence beside it is yours.
- **Both halves of a question-and-answer pair**, kept together and in order, question first. An
  answer studied alone months later needs a `scene` naming the question it replies to, and that scene
  must state the question without leaking the answer.

## What not to mine

- **Anything needing an untaught word.** See the rule above.
- **Substitution frames and their fillers.** A frame plus a list of alternatives
  (`1. (タクシーで) 2. (でんしゃで)`) is not a printed sentence, it is a recipe for several. The
  fill-in-the-blank miner owns those, and it is bounded because their number is a choice rather than
  a fact about the chapter. Mine what the book PRINTS; it expands what the book IMPLIES.
- Lines with an unresolved blank, and empty answer slots.
- A reference table printed among the drills. Those are the base unit's business, not yours.

## Restraint

Mine what the chapter actually contains. You are not bounded by a target count, and if a block holds
eight good sentences then eight is the right answer.

What you should not do is pad: ten sentences on one frame with only the noun swapped is one sentence
repeated ten times, and the learner memorises the position rather than the pattern. **Vary the frame,
not just the noun.** Where a block genuinely only supports two, mine two.

## The approved base vocabulary

Everything this chapter's base unit teaches, already reviewed by a human.

```json
{{BASE_VOCABULARY}}
```

## Vocabulary from earlier lessons

{{EARLIER_VOCABULARY}}

## Category

{{CATEGORY_LIST}}

## What a card looks like

{{CARD_FACES}}

## The exercise blocks you must account for

{{BLOCKS_JSON}}
