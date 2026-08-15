# Task: Produce the Correct Romanization

## Overview

Each flashcard has a {{TARGET_LANGUAGE}} `target` text and a `libraryRomanization` — a romanization
produced by a deterministic library. That library is a useful starting point but is frequently
WRONG: it mis-splits a single word into pieces with spurious spaces, mishandles the Japanese small
っ (sokuon) by emitting a literal "tsu" instead of doubling the next consonant, and falls back to
spelling out unfamiliar kana letter-by-letter. Your job is to return the CORRECT romanization for
each item — keep the library's value when it is already right, and fix it when it is wrong. You are
the final authority on the romanization.

## Input Format

The input is a JSON array of objects, one per flashcard:

- `id` (string): a unique identifier — reuse it unchanged in your response.
- `english` (string): the English phrase, for meaning context.
- `target` (string): the {{TARGET_LANGUAGE}} text to romanize. When the card carries a `ttsText` (what TTS speaks instead of the written target, e.g. a kana spelling for a target printed with digits), that is the text you are given here — the romanization must match what is spoken, not a digit or kanji display form.
- `libraryRomanization` (string): the library's attempt — a starting point, often wrong.

### Example Input

```json
[
  {
    "id": "sixth-floor",
    "english": "Sixth floor",
    "target": "ろっかい",
    "libraryRomanization": "ro tsu kai"
  },
  {
    "id": "hello",
    "english": "Hello",
    "target": "こんにちは",
    "libraryRomanization": "konnichiwa"
  }
]
```

## Output Format

Respond with ONLY a JSON array (no markdown fences, no extra prose, no commentary before or after it).
Produce exactly one object per input item:

- `id` (string): the SAME id as the corresponding input item.
- `pronunciation` (string): the correct romanization of `target`, using the standard system for
  {{TARGET_LANGUAGE}} (Hepburn for Japanese, pinyin for Mandarin, etc.) — the library's value if it is
  already correct, otherwise your corrected version.

## Important

- Return the final, correct `pronunciation` for EVERY item — never leave a known-wrong value in place.
- Romanize a single word as a single token (no spurious internal spaces); double the consonant for a
  sokuon (ろっかい → `rok-kai`, not `ro tsu kai`); keep natural word spacing in a full sentence.
- **The deck's pinned style, which every romanization must follow.** These are not preferences: the
  finished deck is linted against this exact list, and a value that breaks one of them is reported
  back to a human. Where a rule and the library's output disagree, the rule wins.
  {{ROMANIZATION_STYLE_RULES}}
- Include every id from the input exactly once. Order does not matter.
- Do not wrap the response in markdown code fences, and include no text before or after the JSON array.

### Example Output

```json
[
  { "id": "sixth-floor", "pronunciation": "rok-kai" },
  { "id": "hello", "pronunciation": "konnichiwa" }
]
```

## Input Data ({{ITEM_COUNT}} item(s) to romanize)

```json
{{INPUT_JSON}}
```
