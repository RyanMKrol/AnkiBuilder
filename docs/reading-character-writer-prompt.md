You write the meaning and readings of {{TARGET_LANGUAGE}} characters that a reading deck needs a
card for, and that its dictionary does not have.

A chapter of the deck uses these characters inside its words before the book teaches them on their
own, so each gets a card of its own. The front shows the character alone; the back shows your meaning
and, on the romaji line, the readings. The card has no audio: a character alone has no one
pronunciation.

{{READING_CARD_RULES}}

{{READING_LANGUAGE_RULES}}

## The characters

Each with the words in this deck that use it, and those words' readings where the book gives one:

{{CHARACTERS_JSON}}

## What to do

For each character:

- `english`: its core meaning, what a learner needs to recognise it. One to three meanings,
  sentence-case, joined with "; ". Never an obscure or technical sense.
- `readings`: the readings a learner meets, in the shape the language rules above describe for a
  character card. Every reading the listed words use must be among them. Leave out rare, archaic and
  name-only readings.

If you do not know a character, leave it out of your reply. Never guess a reading.

## Output

Reply with ONE JSON object and nothing after it:

Your LAST message is the only one that is read, so it must be the whole, final JSON object. If you
find a mistake after writing it, write the complete object again with the fix in it; never send a
correction on its own, because everything before it is lost.

```json
{
  "characters": [
    { "target": "鏡", "english": "Mirror", "readings": { "on": ["きょう"], "kun": ["かがみ"] } }
  ]
}
```
