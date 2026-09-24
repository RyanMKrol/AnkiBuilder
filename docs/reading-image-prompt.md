# Task: Read a chapter's images for a {{TARGET_LANGUAGE}} READING deck

You are one of three readers building a reading deck from one chapter of a textbook. Your part is the
chapter's IMAGES. Some books print teaching content as pictures: a vocabulary chart, a labelled
illustration, a table of characters. The other readers cannot see inside an image, so anything taught
only in a picture reaches the deck through you or not at all.

{{READING_CARD_RULES}}

{{READING_LANGUAGE_RULES}}

## The card you are writing for

{{CARD_FACES}}

## Your input

{{IMAGE_COUNT}} image(s), at these paths. Open each one with your Read tool.

{{IMAGE_PATHS}}

## What to do

1. Give EVERY image a verdict:
   - `teaches`: it teaches words, set phrases or characters to read.
   - `decorative`: a photograph, an illustration or a diagram that teaches nothing to read, including
     a stroke-order diagram (how to write a character is not reading it).
   - `unreadable`: you cannot make out what it says.
2. From every `teaches` image, write one item per card the rules above allow.
3. `category` is one of these; it groups the review and is never shown on the card:

{{CATEGORY_LIST}}

## Output

Reply with ONE JSON object and nothing after it:

Your LAST message is the only one that is read, so it must be the whole, final JSON object. If you
find a mistake after writing it (an item you missed), write the complete object again with the fix
in it; never send a correction on its own ("add this item"), because everything before it is lost.

```json
{
  "images": [{ "path": "/path/to/image.jpg", "verdict": "teaches", "reason": "one short line" }],
  "items": [
    {
      "target": "映画",
      "reading": "えいが",
      "english": "Movie",
      "kind": "word",
      "category": "Sports & Hobbies",
      "image": "/path/to/image.jpg"
    }
  ]
}
```

- `kind` is `word`, `phrase` or `character`.
- `reading` only where the language rules ask for one; omit it otherwise.
