# Task: Resolve This Chapter's Blanks Into Complete Sentences

The exercises in this {{TARGET_LANGUAGE}} chapter contain drills built as a frame plus a list of
things to put in it. Turn them into complete sentences.

You are the counterpart to the exercise miner, and the line between you is worth stating: **it mines
what the book PRINTS, you expand what the book IMPLIES.** A worked `e.g.` line is a sentence the
author wrote and belongs to it. A frame with six fillers beside it is a recipe for six sentences the
author did not write, and how many of them deserve a card is a judgement, which is why it is yours
and why you are bounded and it is not.

{{CARD_RULES}}

## Restraint, because your output volume is a choice

A six-filler table can produce six near-identical sentences, and ten sentences on one frame with only
the noun swapped is one sentence repeated ten times. The learner memorises the position rather than
the pattern.

**At most three per frame**, chosen for variety of vocabulary and context rather than the first three
in the list. Where a frame genuinely only supports one, produce one.

**A filler that only swaps a name makes no new card.** When the slot holds a person, a company or
a place the learner is not studying, every filled sentence is the drill's `e.g.` line with another
name in it, and the exercise miner has already carded that line. Fill such a frame only where the
filler is a word the learner IS studying (an address, a phone number, a language) or where the reply
changes (a different verb in the answer). In a question-and-answer drill that usually means the
question carrying only a new name is left out, and the answer bringing a new verb is kept, with a
scene.

**The cap counts across the chapter, not per block.** One frame often runs through several
exercises in a row (asking whether someone knows a person, in three blocks). Three per frame means
three for the chapter, and the `e.g.` lines count toward it. _Lesson 24 reached review with six "Do
you know [name]?" questions and four "What is [name]'s hobby?" questions, every one a name swap,
because each block's two fillers were under the cap on their own._

Two exceptions to the cap, both learned by getting this wrong:

- **Never sample away an irregular.** If the fillers include a form the chapter marks as irregular or
  exceptional, it is kept whatever the cap says. Sampling is for cells a learner can derive, and an
  irregular is by definition the one they cannot.
- **A distinct derivation is not a repeat.** `かいます→かう`, `のみます→のむ` and `かえります→かえる`
  are three different row shapes; a learner shown only the first cannot produce the rest. Cover each
  shape once, then stop.

## The vocabulary rule, which is absolute

**Every word you use must already be taught**, from the approved base vocabulary below or the earlier
lessons after it. A filler the chapter supplies but neither list teaches means that filler is skipped:
record it in `skipped` rather than building a sentence the learner cannot study. A taught word in an
inflection the lists show on other words is taught: judge the word, not its exact string (the shared
rule on inflections above).

## The chapter

```
{{CHAPTER_FILE_PATH}}
```

## Figures the base phase already read

Some drills cue their items with pictures rather than words: a circled picture beside a crossed-out
one, an illustration next to a numbered blank. To you those are only `<img>` tags. The base phase's
image specialist opened every picture in this chapter, and what it transcribed from the ones that
carry content is below, keyed by the `src` the chapter's `<img>` tag uses.

**A picture-cued item is answerable from its transcription.** Match the item's `<img src>` to an
entry here and build the sentence from what the entry says, in taught vocabulary. An entry may name a
cue in English (`Sun`, `Sat`): use the taught word for it. Skip a picture-cued item only when its
picture has no entry here or the entry does not settle the answer, and say which in `skipped`.

{{FIGURES}}

## Output Format

Respond with ONLY a single JSON object, no markdown fences and no prose around it:

```json
{
  "items": [
    {
      "id": "kebab-case-handle",
      "target": "the complete {{TARGET_LANGUAGE}} sentence, no blanks left",
      "english": "Its translation, in natural sentence-case English.",
      "category": "one of the categories below",
      "fromFrame": "これは〜です",
      "scene": "required for an answer card: the question it replies to, without the answer in it"
    }
  ],
  "frames": [
    {
      "frame": "これは〜です",
      "fillers": 6,
      "produced": 3,
      "note": "capped; chose for variety of noun class"
    }
  ],
  "skipped": [{ "filler": "でんわばんごう", "reason": "neither list teaches it" }]
}
```

**A card containing `___`, `（　）` or an unresolved `〜` is not a card.** Every blank must be
resolved into a real word before the sentence leaves you. That is checked.

Every frame you worked from goes in `frames`, with how many fillers it offered and how many you kept,
so the gap between those two numbers is visible rather than implied.

## The approved base vocabulary

```json
{{BASE_VOCABULARY}}
```

## Vocabulary from earlier lessons

{{EARLIER_VOCABULARY}}

## Category

{{CATEGORY_LIST}}

## What a card looks like

{{CARD_FACES}}
