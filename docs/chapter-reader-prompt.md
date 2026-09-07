# Task: Read a Whole Chapter for Vocabulary

Read this chapter of a {{TARGET_LANGUAGE}} textbook end to end and return every word or fixed
expression it teaches, wherever that word appears.

You are not the only pass looking. A separate specialist reads the chapter's TABLES, and its results
are merged with yours. **Overlap is expected and is not waste** — you two disagreeing is the signal
this design is built on, and an entry you both find costs one merge. What only you can find is the
word that is taught somewhere a table is not: in a note, in a caption, inside a drill's cue, in a
sentence the chapter never glosses anywhere else.

{{CARD_RULES}}

## The chapter

Open and read this file yourself, in full:

```
{{CHAPTER_FILE_PATH}}
```

**It is already exactly one lesson.** The file's bounds are the chapter's bounds, so there is no
judgement to make about where to start or stop, only the discipline to reach the end. If your reading
tool truncates it, issue further reads with an offset until you have seen the last line. A chapter you
stopped reading looks exactly like a chapter that ended, which is why the accounting below exists.

## Output Format

Respond with ONLY a single JSON object, no markdown fences and no prose around it:

```json
{
  "items": [
    {
      "id": "kebab-case-handle",
      "target": "the {{TARGET_LANGUAGE}} word or fixed expression, exactly as printed",
      "english": "Its gloss, in sentence case.",
      "category": "one of the categories below",
      "foundIn": "the section heading it came from",
      "note": "optional; only when it earns its place",
      "uncertain": true,
      "reviewNote": "optional; why you are unsure, for the human reviewer"
    }
  ],
  "sections": [
    {
      "title": "VOCABULARY",
      "read": true,
      "contributed": 12,
      "note": "the chapter's main word list"
    },
    {
      "title": "EXERCISES VI",
      "read": true,
      "contributed": 0,
      "note": "listening drill; answers are in a separate download"
    }
  ]
}
```

**Every section heading listed below must appear exactly once in `sections`.** That is checked, and it
is the point of this pass as much as the words are. A section that taught nothing and a section you
never reached produce the same empty output otherwise, and this pipeline has lost real content to
exactly that: one chapter's read stopped at line 780 of 942, two exercises were never seen, and one
of them held the only use of two words in the whole book.

`contributed: 0` with a note saying why is a good answer. `read: false` is an honest answer too, and
far better than a silent gap.

## What counts as vocabulary here

- Single words and bound morphemes (`お〜`, `〜さん`), as the book prints them.
- Fixed expressions the book treats as one unit (`いただきます`, `もういちどおねがいします`).
- Counters and numbers, including a reading printed as an alternate.
- **A word that appears ONLY in a drill's cue or a caption still counts.** Scaffolding is skipped
  because it is mechanical, not because its content is worthless. If a word appears nowhere the
  chapter glosses it, the deck will never teach it: two words were dropped from one lesson on exactly
  that reasoning and turned out to be carded nowhere in the entire book. Supply your best English,
  set `"uncertain": true`, and name where you found it in `reviewNote`.

## What NOT to return

- **Complete sentences.** A subject and a predicate is an utterance, not a lexical entry, and it
  belongs to a later pass. A fixed expression is an entry even at twelve characters; a short clause
  is not. The test is what the book is treating it as, never the length.
- Grammar explanation prose, and the labels that describe a table rather than being taught by it.
- A proper noun naming a person or a business. Country and city names are real vocabulary.
- A word you are only guessing at because it appeared once in running text with no gloss and no
  prominence. Say so in a section note instead of inventing an entry.

## Category

{{CATEGORY_LIST}}

## What a card looks like

{{CARD_FACES}}

## This book's conventions

Orientation, not instructions. They describe where things have usually been, and a book is free to be
inconsistent with itself. Where a hint disagrees with the page in front of you, the page wins.

{{BOOK_HINTS}}

## The sections you must account for

These are the chapter's own headings, in document order.

```json
{{SECTIONS_JSON}}
```
