# Task: Judge a Chapter's Tables

You are given EVERY table in one chapter of a {{TARGET_LANGUAGE}} textbook, dumped verbatim from its
markup. Your job is to decide which of them are **vocabulary** and read the entries out of those, and
to say plainly what each of the others is.

Nothing upstream has judged these tables. A previous version of this pipeline picked vocabulary
tables by matching one publisher's CSS class, which meant that on a book marking tables any other way
it found none and reported that the chapter's vocabulary was fully covered. You are the judgement
that replaces that pattern, so the honest "this one is not vocabulary, because…" matters as much as
the extraction.

## Output Format

Respond with ONLY a single JSON object, no markdown fences and no prose around it, with two keys:

```json
{
  "items": [
    {
      "id": "kebab-case-handle",
      "target": "the {{TARGET_LANGUAGE}} headword exactly as printed",
      "english": "Its gloss, in sentence case.",
      "category": "one of the categories below",
      "fromTable": 0,
      "note": "optional; only when it earns its place",
      "uncertain": true,
      "reviewNote": "optional; why you are unsure, for the human reviewer"
    }
  ],
  "tables": [
    { "index": 0, "verdict": "vocabulary", "reason": "glossed headword/gloss pairs" },
    { "index": 1, "verdict": "paradigm", "reason": "one word across its forms, not a word list" }
  ]
}
```

**Every table index you were given must appear exactly once in `tables`.** That is checked. A table
you ignored and a table that held nothing are the same thing from the outside, and the whole reason
this pass exists is that they must not be.

### Verdicts

- `vocabulary` — glossed entries, each a word or fixed expression paired with its meaning.
- `paradigm` — one word or pattern laid out across its forms (present/past, affirmative/negative).
  Real teaching content, but it is not a word list and its cells are not headwords.
- `reference` — a chart of numbers, counters, times, kana. Often holds real entries; say so in the
  reason if it does, and extract them.
- `example` — model sentences or a dialogue laid out as a table.
- `layout` — the table is being used for positioning and carries no content of its own.
- `unreadable` — you could not make sense of it. A real answer, and the one that should send a
  human to look.

## What to extract

- **A headword is not always in the first column.** A numbers chart prints the digit in column 0 and
  the reading in column 1. Read the table's shape before assuming which cell is the entry.
- **One cell can hold two entries.** `ゼロ ／ れい` teaches two readings, and taking only the first
  silently loses one: in the deck this prompt was written for, `ゼロ` and `よん` are taught and
  `れい`, `し`, `しち` and `く` appear on no card at all. Emit the primary reading as `target` and
  record the alternate in `note`, or give it its own item when the book treats it as a full entry.
- **Indented sub-rows are entries too.** A compound broken into its parts beneath it (`お〜`, `かし`
  under `おかし`) is individually glossed vocabulary, not an annotation of the row above.
- **Take the book's own English.** A row glossed "tell, teach" covers both senses; carding it as
  "teach" narrows what the learner is taught and nothing downstream can restore the half you dropped.
- **Do not invent a gloss you cannot support.** Where the table gives the word but no meaning, supply
  your best English, set `"uncertain": true`, and say so in `reviewNote`.
- **Leave placeholders alone.** A bare morpheme printed with `〜` is a real entry; keep the `〜` and
  do not resolve it into a word the book did not print.

## What NOT to extract

- Column headers, row labels, and anything that is describing the table rather than taught by it
  (`Present form`, `aff.`, `い-adj.`).
- Cells of a `paradigm` table. Its content is the transformation, and a later pass handles that.
- Complete sentences. Those belong to the extras unit, not the base vocabulary this pass feeds.

## Category

Every item needs one of these, chosen by topic rather than grammatical role:

{{CATEGORY_LIST}}

## What a card looks like

{{CARD_FACES}}

## This book's conventions

The notes below are what earlier analysis recorded about THIS book's markup. They are orientation,
not instructions: they describe where things have usually been, and a book is free to be
inconsistent with itself. Where a hint disagrees with the table in front of you, the table wins, and
say so in that table's `reason`.

{{BOOK_HINTS}}

## The tables

Every table in this chapter, in document order. `index` is what you must account for in `tables`.

```json
{{TABLES_JSON}}
```
