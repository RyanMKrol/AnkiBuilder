# Task: Resolve This Chapter's Blanks Into Complete Sentences

The exercises in this {{TARGET_LANGUAGE}} chapter contain drills built as a frame plus a list of
things to put in it. Turn them into complete sentences.

You are the counterpart to the exercise miner, and the line between you is worth stating: **it mines
what the book PRINTS, you expand what the book IMPLIES.** A worked `e.g.` line is a sentence the
author wrote and belongs to it. A frame with six fillers beside it is a recipe for six sentences the
author did not write, and how many of them deserve a card is a judgement, which is why it is yours
and why you are bounded and it is not.

## Restraint, because your output volume is a choice

A six-filler table can produce six near-identical sentences, and ten sentences on one frame with only
the noun swapped is one sentence repeated ten times. The learner memorises the position rather than
the pattern.

**At most three per frame**, chosen for variety of vocabulary and context rather than the first three
in the list. Where a frame genuinely only supports one, produce one.

Two exceptions, both learned by getting this wrong:

- **Never sample away an irregular.** If the fillers include a form the chapter marks as irregular or
  exceptional, it is kept whatever the cap says. Sampling is for cells a learner can derive, and an
  irregular is by definition the one they cannot.
- **A distinct derivation is not a repeat.** `かいます→かう`, `のみます→のむ` and `かえります→かえる`
  are three different row shapes; a learner shown only the first cannot produce the rest. Cover each
  shape once, then stop.

## The vocabulary rule, which is absolute

**Every word you use must already be taught**, from the approved base vocabulary below or the earlier
lessons after it. A filler the chapter supplies but neither list teaches means that filler is skipped:
record it in `skipped` rather than building a sentence the learner cannot study.

## The chapter

```
{{CHAPTER_FILE_PATH}}
```

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
      "scene": "optional; the situation, when the sentence is a reply that needs one"
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
