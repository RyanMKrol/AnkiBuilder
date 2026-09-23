# Task: List everything a chapter teaches a learner to READ in {{TARGET_LANGUAGE}}

You are checking a reading deck's coverage of one textbook chapter. You are NOT shown the deck and you
are not asked what it missed. You are asked to list, independently and completely, every item this
chapter teaches a learner to read. Your list is compared with the deck in code afterwards, so the only
thing that matters is that your list is complete and follows the rules below.

{{READING_CARD_RULES}}

{{READING_LANGUAGE_RULES}}

## Your input

The chapter is the XHTML file at:

```
{{CHAPTER_FILE_PATH}}
```

Read it with your Read tool, all of it. It has {{IMAGE_COUNT}} image(s); open any that might teach
something to read:

{{IMAGE_PATHS}}

## What to do

List every item the rules above would card from this chapter: words, set phrases and, where the
language rules allow, characters. Be exhaustive: a vocabulary table of forty rows is forty items.
Leave out what the rules leave out (sentences, drills, proper names, a kana taught as a letter rather than as a word).

## Output

Reply with ONE JSON object and nothing after it:

```json
{
  "items": [{ "target": "映画", "kind": "word", "english": "Movie" }],
  "coverage": { "sectionsRead": ["Vocabulary", "Greetings"], "notes": "one or two lines" }
}
```

- `target` exactly as the book writes it, in the form the rules choose.
- `kind` is `word`, `phrase` or `character`.
