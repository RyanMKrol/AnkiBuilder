# Task: Translate Flashcards

## Overview

You are translating flashcards for a language-learning deck.
Target language: {{TARGET_LANGUAGE}}.
You will be given a JSON array of English phrases and must translate each one.

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
  {{TARGET_SCRIPT_RULE}}
  {{STYLE_RULES}}
- `hint` (string, optional): a short usage hint.
  - Only include this key when you have something worth adding — omit it entirely otherwise.

Do not include a `pronunciation` key — pronunciation is produced separately for this language.

### Example Output

```json
[
  { "id": "hello", "target": "Bonjour" },
  { "id": "cheese", "target": "Fromage", "hint": "casual, singular" }
]
```

## Important

{{TARGET_SCRIPT_REMINDER}}

- Include every id from the input exactly once.
  - Order does not matter.
- Do not include a `pronunciation` key in your response.
- Do not wrap the response in markdown code fences.
- Do not include any text before or after the JSON array.

## Input Data ({{ITEM_COUNT}} item(s) to translate)

```json
{{INPUT_JSON}}
```
