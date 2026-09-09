# Task: Card This Chapter's Own Sentences

Return the sentences this {{TARGET_LANGUAGE}} chapter itself supplies as models: its Key Sentences,
its grammar examples, and the small number of dialogue lines that earn a card.

You write the chapter's **extras** unit. The base unit already holds the vocabulary, approved by a
human. These are the sentences that show those words working together.

{{CARD_RULES}}

## Two sources, two different rules

### Key Sentences and grammar examples: take them all

These are the chapter's curated core. The author chose them, numbered them, and the rest of the
chapter refers back to them. There is no cap and no sampling here: if the chapter presents a sentence
as one of its models, it belongs in the deck.

### The dialogue: a narrow door, not an open one

A modeled conversation is written for listening and rehearsal, and walking it line by line produces
reaction noise: `そうですか`, `ええ`, recap lines, and turns that merely sound useful. Carding those
fills a unit with things nobody can study alone.

So the door is narrow, and a line only comes through it by earning its way:

- **It demonstrates a form that nothing else in the chapter demonstrates.** Name that form in
  `demonstrates`. If a Key Sentence or a grammar example shows the same form, use that one instead
  and leave the dialogue line.
- **At most four lines per dialogue**, however good the rest are. If you are choosing between five,
  the chapter is telling you the dialogue is the wrong source.
- **Never a reaction, a backchannel, or a recap.** `はい`, `そうですね`, and a line restating what was
  just said are exactly what this door is narrow for.

A dialogue that yields nothing is a normal outcome, and `mined: 0` with a reason is the right answer
for one. Reaching for a fifth line is not.

## The vocabulary rule, which is absolute

**Every word must already be taught**, from the approved base vocabulary below or the earlier lessons
after it. A Key Sentence needing an untaught word is skipped and recorded in `skipped`, not rewritten
into something the chapter did not say.

## An answer studied alone needs a scene

Chapters are full of question-and-answer exchanges. An answer card is shuffled and studied months
later with no question beside it, so it needs a `scene` naming the situation it replies to, stating
the question **without leaking the answer**. And its `english` must be able to produce the whole
`target`: if the target states its topic, the English must too.

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
      "target": "the complete {{TARGET_LANGUAGE}} sentence",
      "english": "Its translation, in natural sentence-case English.",
      "category": "one of the categories below",
      "source": "key-sentence",
      "fromSection": "KEY SENTENCES",
      "demonstrates": "required for a dialogue line: the form it uniquely shows",
      "scene": "required for an answer card: the situation, without the answer in it"
    }
  ],
  "sections": [
    { "section": "KEY SENTENCES", "mined": 4, "note": "all four, as the chapter presents them" },
    {
      "section": "TARGET DIALOGUE",
      "mined": 1,
      "note": "only line showing のまえに in an utterance"
    }
  ],
  "skipped": [{ "section": "SPEAKING PRACTICE 2", "reason": "every line needs でんわばんごう" }]
}
```

`source` is `key-sentence`, `grammar-example` or `dialogue`. **Every section listed below must appear
exactly once**, in `sections` or in `skipped`. A section nobody read and a section that held nothing
produce the same empty output otherwise.

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

## The sections you must account for

{{SECTIONS_JSON}}
