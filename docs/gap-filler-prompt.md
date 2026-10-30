# Task: Card What the Chapter Teaches and the Corpus Missed

{{CARD_RULES}}

An independent reader enumerated everything this {{TARGET_LANGUAGE}} chapter teaches. A script diffed
that list against the corpus the extraction produced. Below are the items the reader found and the
corpus does not have.

Your job is to turn each one into a finished card, or to say why it should not be one.

## Why this is not "review these suggestions"

The gaps are already evidence: another reader found them in the chapter, and a set operation in code
confirmed the corpus lacks them. Nobody is going to read this list and act on it later. **If you
leave a real gap unfilled, the card does not get made.**

So the default is to FILL. Decline only for a concrete reason, not because a gap looks uncertain.

## When to decline

- **An earlier chapter already teaches it.** A later chapter re-using a word is normal and does not
  earn a second card. Say which chapter if you can tell.
- **It is a sentence, not an entry.** This unit holds lexical entries. A sentence belongs to the
  chapter's extras unit, which is built separately, so decline it here and it will be picked up
  there.
- **It is a fragment of something already carded.** A piece of a phrase the corpus holds whole.

**An inflected form is NOT a fragment.** If this chapter teaches `あいました` and the corpus has only
`あいます`, that is a gap and it earns a card: a learner who meets one form cannot use the word. Card
it with a gloss that distinguishes it ("Met", not "To meet"). The one thing you must not do is invent
a form this chapter has not reached.

- **It is not taught by the chapter at all**: a name in an example, a word used in passing that the chapter never presents as vocabulary.
- **You cannot tell what it is.** Say so; that is a real answer.

Everything else gets a card.

## A gap with `carriedForm` is not in the chapter, and is still owed

Some gaps carry a `carriedForm` field (`"dictionary form"`, `"て-form"` or `"ない-form"`). Those did
not come from the reader. A script found that an EARLIER lesson of this book taught that form, and
that this chapter teaches the verb in the gap without it. The book will never print it, so "not
taught by the chapter" is not a reason to decline one. The owner ruled that every verb is owed these
forms, in the lesson that teaches the verb: the dictionary form on 2026-10-12, the て-form and the
ない-form on 2026-10-30.

Card the form itself, not the verb you were given:

- **`target`**: the form, written out. When the gap has an `expected` field, that IS the target:
  the script computed it from the verb's dictionary form, and a different target is replaced with it.
  Otherwise write it yourself (`ねます` gives `ねる`; `ダウンロードします` gives `ダウンロードする`).
  For a phrase, card the verb alone when that is the part being conjugated (`シャワーをあびます`
  gives `あびる`, `あびて`, `あびない`).
- **`english`**, in the shape every card of that form in the deck already has, because the check that
  found the gap recognises a card by it:
  - dictionary form: the verb's gloss and the label, `Sleep, go to bed (dictionary form)`;
  - て-form: the gloss and the polite form, `Sleep, go to bed (て-form of ねます)`;
  - ない-form: a plain negative, `Does not sleep`, with **`hint`** `casual form`.
- **`category`**: `Grammar & Function Words`.
- **`note`**: the verb class and the change that derives the form, naming a verb already in the deck
  that makes the same change. For example:
  `Dictionary form of ねます (nemasu, "sleep", Lesson 17), which is also its casual form. Regular 2: ます becomes る.`
  `Regular 1: み (mi) → んで (nde), the same change as のみます (nomimasu) → のんで (nonde).`
  A ない-form note starts `Casual: for friends and family. The polite equivalent is ねません.`
- **`fillsGap`**: the gap's `key` verbatim (`ねます (て-form)`), not the form you wrote. One verb can
  owe all three forms in the same chapter, and the key is what tells the three cards apart.

Decline one only if the verb's class genuinely cannot be determined, and say so.

## What a finished card needs

The gap gives you a target and a rough gloss. You supply the rest, to the same standard as any other
card in this deck:

- **`english`**: natural sentence-case English. Improve the gloss you were given if it reads as a
  dictionary stub.
- **`category`**: exactly one from the list below.
- **`note`**, **`scene`**, **`hint`**: only where they earn their place. A note that restates the
  card is worse than no note.
- **`uncertain`**: set it when you are filling a gap you are not fully confident belongs. A reviewer
  sees the flag and decides; a silent guess does not give them that.

`foundIn` tells you where in the chapter the reader saw it, which is the fastest way to check what
it actually is. Read the chapter at that point before writing a card you are unsure of.

## The forms this language inflects

{{INFLECTION_SCHEME}}

## The chapter

{{CHAPTER_FILE_PATH}}

## Pages the chapter sends the learner to

A script found the places where this chapter points elsewhere in the same book ("see the appendix,
p. 244") and pulled those pages out for you. Read them as part of the chapter: what they hold, for the
point the chapter is teaching, is taught here. A table they hold follows the paradigm rule like any
other. A row the page itself says belongs to a later volume or lesson is not taught yet.

{{REFERENCED_MATERIAL}}

## Cards the corpus already has

Do not duplicate these. A gap that is a restatement of one of these should be declined.

{{CORPUS_JSON}}

## The gaps

{{GAPS_JSON}}

## Categories

{{CATEGORY_LIST}}

## Output

Return ONLY this JSON object. Every gap must appear exactly once, in `items` or in `declined`.

```json
{
  "items": [
    {
      "id": "kebab-case-handle",
      "target": "the {{TARGET_LANGUAGE}} text, exactly as the chapter prints it",
      "english": "Natural sentence-case English.",
      "category": "one of the categories above",
      "fillsGap": "the gap's key if it has one, otherwise its target, verbatim",
      "note": "optional",
      "scene": "optional",
      "hint": "optional",
      "uncertain": true
    }
  ],
  "declined": [{ "gap": "the gap's key or target, verbatim", "reason": "one short line" }]
}
```
