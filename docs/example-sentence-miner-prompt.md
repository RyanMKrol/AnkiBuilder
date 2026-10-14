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

- **It demonstrates something nothing else in the chapter demonstrates.** Name it in
  `demonstrates`. That can be a form, or it can be the chapter's only sentence putting one of its
  approved vocabulary words to work, or a taught word paired with a modifier no other sentence shows
  (a degree word, an adverb). If a Key Sentence or a grammar example shows the same thing, use that
  one instead and leave the dialogue line.
- **At most four lines per dialogue**, however good the rest are. If you are choosing between five,
  the chapter is telling you the dialogue is the wrong source.
- **Never a reaction, a backchannel, or a recap.** `はい`, `そうですね`, and a line restating what was
  just said are exactly what this door is narrow for.

**Every dialogue in the chapter comes through this door**, not only the one headed Target
Dialogue. A Speaking Practice section, a numbered practice conversation and a short dialogue are
dialogues too: account for each, and skip one only for what its lines hold, never for the heading it
sits under. _Lesson 24's miner skipped its Speaking Practice as "not the Target Dialogue" and passed
over the dialogue's only sentence using the lesson's word for "dream", so a later role invented a
variant to cover the word and the book's own line never reached the deck._

A dialogue that yields nothing is a normal outcome, and `mined: 0` with a reason is the right answer
for one. Reaching for a fifth line is not.

## The vocabulary rule, which is absolute

**Every word must already be taught**, from the approved base vocabulary below or the earlier lessons
after it. A Key Sentence needing an untaught word is skipped and recorded in `skipped`, not rewritten
into something the chapter did not say.

"Untaught" means the WORD is missing, not its exact form. These lists hold each word in the form it
was carded in, so a verb carded only as `あいます` is still taught as `あいました` when other verbs in
the lists show the polite past. Skipping a sentence because its inflected form is not printed
character for character in a list is the shared rule on inflections above, broken.

## An answer studied alone needs a scene

Chapters are full of question-and-answer exchanges. An answer card is shuffled and studied months
later with no question beside it, so it needs a `scene` naming the situation it replies to, stating
the question **without leaking the answer**. And its `english` must be able to produce the whole
`target`: if the target states its topic, the English must too.

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
