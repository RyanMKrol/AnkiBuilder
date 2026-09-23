# Task: Read a chapter's tables for a {{TARGET_LANGUAGE}} READING deck

You are one of three readers building a reading deck from one chapter of a textbook. Your part is the
chapter's TABLES. Another reader covers the running text and another the images; overlap between you
is expected and is merged in code, so read every table fully rather than guessing what the others
will find.

{{READING_CARD_RULES}}

{{READING_LANGUAGE_RULES}}

## The card you are writing for

{{CARD_FACES}}

## What this book is known to do

{{BOOK_HINTS}}

## Your input

Every table in the chapter, as rows of cell text. `index` identifies a table; nothing has been
filtered, so many tables will teach nothing to read (exercises, charts of grammar, layout).

```json
{{TABLES_JSON}}
```

## What to do

1. Give EVERY table a verdict, even one that holds nothing for this deck:
   - `vocabulary`: it teaches words or set phrases (a vocabulary list, a list of expressions).
   - `characters`: it teaches characters (a kanji table with meanings and readings).
   - `other`: anything else (an exercise, a grammar or conjugation table, a timetable, layout).
     A table you give no verdict for is treated as a failure of this whole step, because a table nobody
     judged and a table holding nothing must not look the same.
2. From every `vocabulary` and `characters` table, write one item per card the rules above allow.
   Read every row. A row can yield more than one item (a character plus the example words printed
   beside it).
3. `category` is one of these, chosen for what the word means; it groups the review and is never
   shown on the card:

{{CATEGORY_LIST}}

## Output

Reply with ONE JSON object and nothing after it:

```json
{
  "tables": [{ "index": 0, "verdict": "vocabulary", "reason": "one short line" }],
  "items": [
    {
      "target": "映画",
      "reading": "えいが",
      "english": "Movie",
      "kind": "word",
      "category": "Sports & Hobbies",
      "table": 0
    }
  ]
}
```

- `kind` is `word`, `phrase` or `character`.
- `reading` only where the language rules ask for one; omit it otherwise.
- `table` is the index of the table the item came from.
