# Task: Produce Pronunciation Guides

## Overview

You are producing pronunciation guides for flashcards in a language-learning deck.
Target language: {{TARGET_LANGUAGE}}.
Each item below already has a correct, final translation — do NOT alter, correct, retranslate, or comment on it in any way.
Only produce a pronunciation guide for the given `target` text.

## Input Format

The input is a JSON array of objects, one per flashcard:

- `id` (string): a unique identifier for this item — reuse it unchanged in your response.
- `english` (string): the English phrase, given for context only.
- `target` (string): the final {{TARGET_LANGUAGE}} translation.
  - Already correct — do not change it, and do not return it.
  - When the card carries a `ttsText` (what TTS speaks instead of the written target, e.g. a kana spelling for a target printed with digits), that is the text you are given here, because it is the text that is actually spoken.
- `hint` (string, optional): context about how this phrase is used, taken from the source material.
- `scene` (string, optional): the situation the phrase is used in, given for context only.

### Example Input

```json
[{ "id": "cheese", "english": "Cheese", "target": "Fromage", "hint": "as in the food" }]
```

## Output Format

Respond with ONLY a JSON array (no markdown fences, no extra prose, no commentary before or after it).
Produce exactly one object per input item:

- `id` (string): the SAME id as the corresponding input item.
- `pronunciation` (string): a pronunciation guide for the given `target`, readable by an English speaker unfamiliar with {{TARGET_LANGUAGE}}.
  - If {{TARGET_LANGUAGE}} has a standard, widely-used romanization or transliteration system (e.g. romaji for Japanese, pinyin for Mandarin Chinese), use that system instead of inventing a phonetic spelling.
  - Otherwise, fall back to a phonetic respelling using English spelling and stress conventions (e.g. "froh-MAHZH").
- `hint` (string, optional): a short usage hint.
  - Only include this key when you have something worth adding — omit it entirely otherwise.

Do not include a `target` key at all — the translation is already final and is not requested back.

### Example Output

```json
[{ "id": "cheese", "pronunciation": "froh-MAHZH", "hint": "casual, singular" }]
```

## Important

- Do NOT alter, correct, retranslate, or comment on the given target in any way.
- Include every id from the input exactly once.
  - Order does not matter.
- Do not include a `target` key in your response.
- Do not wrap the response in markdown code fences.
- Do not include any text before or after the JSON array.

## Input Data ({{ITEM_COUNT}} item(s))

```json
{{INPUT_JSON}}
```
