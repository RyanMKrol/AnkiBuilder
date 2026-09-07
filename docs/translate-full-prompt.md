# Task: Translate Flashcards

{{CARD_RULES}}

## Overview

You are translating flashcards for a language-learning deck.
Target language: {{TARGET_LANGUAGE}}.
You will be given a JSON array of English phrases and must translate each one, producing both a translation and a pronunciation guide.

## Input Format

The input is a JSON array of objects, one per flashcard:

- `id` (string): a unique identifier for this item — reuse it unchanged in your response.
- `english` (string): the English phrase to translate.
- `hint` (string, optional): context about how this phrase is used, taken from the source material.
  - This is NOT a translation — use it only to disambiguate meaning or tone.
- `scene` (string, optional): the situation the phrase is used in (e.g. the question it answers).
  - Also NOT a translation — use it only to pick the natural phrasing for that situation.

### Example Input

```json
[
  { "id": "hello", "english": "Hello" },
  { "id": "cheese", "english": "Cheese", "hint": "as in the food, not a smile" }
]
```

## Output Format

Respond with ONLY a JSON array (no markdown fences, no extra prose, no commentary before or after it).
Produce exactly one object per input item:

- `id` (string): the SAME id as the corresponding input item.
- `target` (string): the translation into {{TARGET_LANGUAGE}}.
  {{STYLE_RULES}}
- `pronunciation` (string): a pronunciation guide for `target`, readable by an English speaker unfamiliar with {{TARGET_LANGUAGE}}.
  - If {{TARGET_LANGUAGE}} has a standard, widely-used romanization or transliteration system (e.g. romaji for Japanese, pinyin for Mandarin Chinese), use that system instead of inventing a phonetic spelling.
  - Otherwise, fall back to a phonetic respelling using English spelling and stress conventions (e.g. "bohn-ZHOOR").
- `hint` (string, optional): a short usage hint.
  - Only include this key when you have something worth adding — omit it entirely otherwise.

### Example Output

```json
[
  { "id": "hello", "target": "Bonjour", "pronunciation": "bohn-ZHOOR" },
  { "id": "cheese", "target": "Fromage", "pronunciation": "froh-MAHZH", "hint": "casual, singular" }
]
```

## Important

- Include every id from the input exactly once.
  - Order does not matter.
- Do not wrap the response in markdown code fences.
- Do not include any text before or after the JSON array.

## Input Data ({{ITEM_COUNT}} item(s) to translate)

```json
{{INPUT_JSON}}
```
