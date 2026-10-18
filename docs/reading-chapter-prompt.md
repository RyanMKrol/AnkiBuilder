# Task: Read a whole chapter for a {{TARGET_LANGUAGE}} READING deck

You are one of three readers building a reading deck from one chapter of a textbook. Your part is the
WHOLE chapter as a reader meets it: headings, lists, boxed expressions, captions, and tables too. The
other readers cover the tables and the images; overlap is expected and merged in code, so do not skip
something because you think another reader has it. What you are most likely to catch that they miss
is teaching content that is not in a table: a list of greetings with pictures, a boxed set of
expressions, a numbered list, and every word the chapter puts in front of the learner in a dialogue,
an exercise, a Culture Note or a reading passage.

{{READING_CARD_RULES}}

{{READING_LANGUAGE_RULES}}

## The card you are writing for

{{CARD_FACES}}

## What this book is known to do

{{BOOK_HINTS}}

## Your input

The chapter is the XHTML file at:

```
{{CHAPTER_FILE_PATH}}
```

Read it with your Read tool, all of it. Its headings, which you must account for:

```json
{{SECTIONS_JSON}}
```

## What to do

1. Read the whole file.
2. Write one item per card the rules above allow, from anywhere in the chapter: the vocabulary lists
   and kanji tables, and the words of the dialogues, exercises, example sentences, Culture Notes and
   reading passages too. A sentence is its words (rule 6): take each content word in it, in its
   dictionary form; a particle or an ending is grammar, not a word. Leave out headings, titles and
   instruction lines. A word a later chapter's list introduces is held back
   for that chapter by the code, so list it here as usual; `where` is how the code tells.
3. For every item say `where` you saw it, one of: {{ITEM_PLACES}}. Use `vocabulary list` for
   anything the chapter presents as words to learn (a vocabulary table, a list of expressions, a boxed
   set of words with their meanings) and `kanji table` for a table of characters. A word seen in more
   than one place takes the first of these that applies.
4. For every item say whether the book gives its English: `"glossed": true` when the chapter prints
   a meaning for it (in a list, a footnote, a gloss beside the text), `"glossed": false` when it does
   not and the English is yours. Write your English in the same style either way.
5. Account for EVERY heading listed above: say whether you read it and how many items it gave. A
   section that taught nothing and a section nobody reached must not look the same.
6. `category` is one of these, chosen for what the word means; it groups the review and is never
   shown on the card:

{{CATEGORY_LIST}}

## Output

Reply with ONE JSON object and nothing after it:

Your LAST message is the only one that is read, so it must be the whole, final JSON object. If you
find a mistake after writing it (an item you missed), write the complete object again with the fix
in it; never send a correction on its own ("add this item"), because everything before it is lost.

```json
{
  "sections": [{ "title": "Vocabulary", "read": true, "items": 12 }],
  "items": [
    {
      "target": "おはようございます",
      "english": "Good morning",
      "kind": "phrase",
      "category": "Greetings",
      "section": "Greetings",
      "where": "vocabulary list",
      "glossed": true
    }
  ]
}
```

- `kind` is `word`, `phrase` or `character`.
- `reading` only where the language rules ask for one; omit it otherwise.
- `section` is the heading the item sits under.
- `where` and `glossed` are on every item.
