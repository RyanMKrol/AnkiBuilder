# Translate stage — the two prompts

`translateCorpus` (`src/translate/index.js`) splits corpus items into two groups depending on whether `item.target` is already set, and sends each group through a different prompt, batched independently in groups of up to 10 items per `claude -p` call (pinned to Haiku by default, overridable via `ANKI_BUILDER_TRANSLATE_MODEL`).

## 1. Full-translation prompt

Used when `item.target === null`.
Asks the model to produce both a translation and a pronunciation guide.

### Template

````
# Task: Translate Flashcards

## Overview
You are translating flashcards for a language-learning deck.
Target language: <targetLanguage>.
You will be given a JSON array of English phrases and must translate each one, producing both a translation and a pronunciation guide.

## Input Format
The input is a JSON array of objects, one per flashcard:

- `id` (string): a unique identifier for this item — reuse it unchanged in your response.
- `english` (string): the English phrase to translate.
- `notes` (string, optional): context or a hint about how this phrase is used, taken from the source material.
  - This is NOT a translation — use it only to disambiguate meaning or tone.

### Example Input
```json
[
  { "id": "hello", "english": "Hello" },
  { "id": "cheese", "english": "Cheese", "notes": "as in the food, not a smile" }
]
```

## Output Format
Respond with ONLY a JSON array (no markdown fences, no extra prose, no commentary before or after it).
Produce exactly one object per input item:

- `id` (string): the SAME id as the corresponding input item.
- `target` (string): the translation into <targetLanguage>.
- `pronunciation` (string): a pronunciation guide for `target`, readable by an English speaker unfamiliar with <targetLanguage>.
  - If <targetLanguage> has a standard, widely-used romanization or transliteration system (e.g. romaji for Japanese, pinyin for Mandarin Chinese), use that system instead of inventing a phonetic spelling.
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

## Input Data (<N> item(s) to translate)
```json
<JSON array of the actual items, same shape as Example Input>
```
````

### Rendered example

Input item: `{ id: "hello", english: "Hello", category: "Greetings", notes: null, target: null }`

````
# Task: Translate Flashcards

## Overview
You are translating flashcards for a language-learning deck.
Target language: Japanese.
You will be given a JSON array of English phrases and must translate each one, producing both a translation and a pronunciation guide.

## Input Format
The input is a JSON array of objects, one per flashcard:

- `id` (string): a unique identifier for this item — reuse it unchanged in your response.
- `english` (string): the English phrase to translate.
- `notes` (string, optional): context or a hint about how this phrase is used, taken from the source material.
  - This is NOT a translation — use it only to disambiguate meaning or tone.

### Example Input
```json
[
  { "id": "hello", "english": "Hello" },
  { "id": "cheese", "english": "Cheese", "notes": "as in the food, not a smile" }
]
```

## Output Format
Respond with ONLY a JSON array (no markdown fences, no extra prose, no commentary before or after it).
Produce exactly one object per input item:

- `id` (string): the SAME id as the corresponding input item.
- `target` (string): the translation into Japanese.
- `pronunciation` (string): a pronunciation guide for `target`, readable by an English speaker unfamiliar with Japanese.
  - If Japanese has a standard, widely-used romanization or transliteration system (e.g. romaji for Japanese, pinyin for Mandarin Chinese), use that system instead of inventing a phonetic spelling.
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

## Input Data (1 item(s) to translate)
```json
[
  { "id": "hello", "english": "Hello" }
]
```
````

## 2. Pronunciation-only prompt

Used when `item.target` is already set (e.g. extracted directly from a bilingual source).
The model is explicitly told not to alter the given target — it's only ever asked for a pronunciation guide, and the final card's `target` is read from `item.target`, never from the model's response at all, so there's no way for the model's opinion to leak through even if it tried.

### Template

````
# Task: Produce Pronunciation Guides

## Overview
You are producing pronunciation guides for flashcards in a language-learning deck.
Target language: <targetLanguage>.
Each item below already has a correct, final translation — do NOT alter, correct, retranslate, or comment on it in any way.
Only produce a pronunciation guide for the given `target` text.

## Input Format
The input is a JSON array of objects, one per flashcard:

- `id` (string): a unique identifier for this item — reuse it unchanged in your response.
- `english` (string): the English phrase, given for context only.
- `target` (string): the final <targetLanguage> translation.
  - Already correct — do not change it, and do not return it.
- `notes` (string, optional): context or a hint about how this phrase is used, taken from the source material.

### Example Input
```json
[
  { "id": "cheese", "english": "Cheese", "target": "Fromage", "notes": "as in the food" }
]
```

## Output Format
Respond with ONLY a JSON array (no markdown fences, no extra prose, no commentary before or after it).
Produce exactly one object per input item:

- `id` (string): the SAME id as the corresponding input item.
- `pronunciation` (string): a pronunciation guide for the given `target`, readable by an English speaker unfamiliar with <targetLanguage>.
  - If <targetLanguage> has a standard, widely-used romanization or transliteration system (e.g. romaji for Japanese, pinyin for Mandarin Chinese), use that system instead of inventing a phonetic spelling.
  - Otherwise, fall back to a phonetic respelling using English spelling and stress conventions (e.g. "froh-MAHZH").
- `hint` (string, optional): a short usage hint.
  - Only include this key when you have something worth adding — omit it entirely otherwise.

Do not include a `target` key at all — the translation is already final and is not requested back.

### Example Output
```json
[
  { "id": "cheese", "pronunciation": "froh-MAHZH", "hint": "casual, singular" }
]
```

## Important
- Do NOT alter, correct, retranslate, or comment on the given target in any way.
- Include every id from the input exactly once.
  - Order does not matter.
- Do not include a `target` key in your response.
- Do not wrap the response in markdown code fences.
- Do not include any text before or after the JSON array.

## Input Data (<N> item(s))
```json
<JSON array of the actual items, same shape as Example Input>
```
````

### Rendered example

Input item: `{ id: "sumimasen", english: "Excuse me.", category: "Greetings", notes: "polite form", target: "すみません" }`

````
# Task: Produce Pronunciation Guides

## Overview
You are producing pronunciation guides for flashcards in a language-learning deck.
Target language: Japanese.
Each item below already has a correct, final translation — do NOT alter, correct, retranslate, or comment on it in any way.
Only produce a pronunciation guide for the given `target` text.

## Input Format
The input is a JSON array of objects, one per flashcard:

- `id` (string): a unique identifier for this item — reuse it unchanged in your response.
- `english` (string): the English phrase, given for context only.
- `target` (string): the final Japanese translation.
  - Already correct — do not change it, and do not return it.
- `notes` (string, optional): context or a hint about how this phrase is used, taken from the source material.

### Example Input
```json
[
  { "id": "cheese", "english": "Cheese", "target": "Fromage", "notes": "as in the food" }
]
```

## Output Format
Respond with ONLY a JSON array (no markdown fences, no extra prose, no commentary before or after it).
Produce exactly one object per input item:

- `id` (string): the SAME id as the corresponding input item.
- `pronunciation` (string): a pronunciation guide for the given `target`, readable by an English speaker unfamiliar with Japanese.
  - If Japanese has a standard, widely-used romanization or transliteration system (e.g. romaji for Japanese, pinyin for Mandarin Chinese), use that system instead of inventing a phonetic spelling.
  - Otherwise, fall back to a phonetic respelling using English spelling and stress conventions (e.g. "froh-MAHZH").
- `hint` (string, optional): a short usage hint.
  - Only include this key when you have something worth adding — omit it entirely otherwise.

Do not include a `target` key at all — the translation is already final and is not requested back.

### Example Output
```json
[
  { "id": "cheese", "pronunciation": "froh-MAHZH", "hint": "casual, singular" }
]
```

## Important
- Do NOT alter, correct, retranslate, or comment on the given target in any way.
- Include every id from the input exactly once.
  - Order does not matter.
- Do not include a `target` key in your response.
- Do not wrap the response in markdown code fences.
- Do not include any text before or after the JSON array.

## Input Data (1 item(s))
```json
[
  { "id": "sumimasen", "english": "Excuse me.", "target": "すみません", "notes": "polite form" }
]
```
````

## Design notes

- **Input is a real JSON array**, mirroring the output format, instead of an ad hoc bullet-list notation — one JSON-in/JSON-out convention throughout, so there's no bespoke format to get wrong.
- **Markdown structure** (`# Task`, `## Overview`, `## Input Format`, `### Example Input`, `## Output Format`, `### Example Output`, `## Important`, `## Input Data`) gives each part of the prompt a single, clear job instead of one undifferentiated block of prose.
- **`Example Input`/`Example Output`** are a fixed, illustrative pair — not the real batch — so the model has a concrete instance of the full round-trip to pattern-match against. **`Input Data`** is the real batch of items for this call; it's what the model is actually asked to act on.
- **`hint` is symmetric across both prompts.** An already-translated (pronunciation-only) item can be just as deserving of a usage hint as a freshly-translated one.
- **`pronunciation` accounts for standard romanization systems** (romaji for Japanese, pinyin for Mandarin Chinese, etc.) where one exists for the target language, falling back to an ad hoc phonetic respelling only when no such standard exists.

### Open question: does `pronunciation` need its own on-card field for "romanization"?

Right now `pronunciation` is one field serving two different jobs depending on the target language: sometimes it's a real, standard system (romaji, pinyin) that a learner might want displayed as its own thing, and sometimes it's an ad hoc phonetic respelling that only exists to help pronounce the word aloud.
Both currently get flattened into the same `pronunciation` string on the card.
That's left as-is here — flagging it in case a `romanization` vs `phonetic` distinction on the card schema is worth a follow-up.

## Source

Both prompts are built in `src/translate/index.js`:

- `buildFullTranslationPrompt(items, targetLanguage)`
- `buildPronunciationOnlyPrompt(items, targetLanguage)`
