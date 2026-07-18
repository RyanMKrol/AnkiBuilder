# Translate stage — the prompts

`translateCorpus` (`src/translate/index.js`) splits corpus items into two groups depending on whether `item.target` is already set, and sends each group through a different prompt — one `claude -p` call per group, unbatched (the whole group goes in a single call, pinned to Sonnet at medium effort by default, overridable via `ANKI_BUILDER_TRANSLATE_MODEL` / `ANKI_BUILDER_TRANSLATE_EFFORT`).

**Spoken form (`reading`).** Anywhere the target text is romanized or pronounced, an item's optional `reading` is used in place of `target` when set (`reading ?? target`) — the romanization library romanizes it, and the pronunciation-only prompt is handed it as the text to pronounce. This is how a number card displays digits (`target: "2,000えん"`) but pronounces/romanizes the spelled-out spoken form (`reading: "にせんえん"`), since digits break both the romanizer and TTS. The `reading` is carried through onto the resulting card for the audio stage. See `src/model/index.js` (schema) and `src/translate/romanizationEval.js`.

**Which prompts run depends on whether the target language has a configured romanization library** (`src/translate/romanizationLibraries.js`, keyed by ISO 639-1 code):

- **No library configured** (the original design, unchanged): the two prompts below — full-translation and pronunciation-only — both ask the model for `pronunciation` directly.
- **Library configured** (e.g. Japanese, Mandarin, Korean, Russian, Hebrew, Hindi, Arabic — see `romanizationLibraries.js` for the current list): the translation call asks for `target` only (§1a, below) — never `pronunciation` — and a separate romanization eval pass (§3) runs the real library and has a Sonnet-medium model judge its output instead. See `src/translate/romanizationEval.js`.

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

## 1a. Target-only prompt (library-configured languages)

Used instead of the full-translation prompt above when `item.target === null` **and** the target language has a configured romanization library. Same shape, minus the `pronunciation` ask entirely — that instruction is now the library's + the eval pass's job, not the model's.

### Template

````
# Task: Translate Flashcards

## Overview
You are translating flashcards for a language-learning deck.
Target language: <targetLanguage>.
You will be given a JSON array of English phrases and must translate each one.

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
- Include every id from the input exactly once.
  - Order does not matter.
- Do not include a `pronunciation` key in your response.
- Do not wrap the response in markdown code fences.
- Do not include any text before or after the JSON array.

## Input Data (<N> item(s) to translate)
```json
<JSON array of the actual items, same shape as Example Input>
```
````

## 2. Pronunciation-only prompt

Used when `item.target` is already set (e.g. extracted directly from a bilingual source) **and no library is configured for the target language** — or as the per-item fallback when a configured library's adapter throws (missing dependency, dictionary load failure, etc.), reusing this exact same prompt.
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

## 3. Romanization eval prompt (library-configured languages)

Used by `romanizeAndEvaluate` (`src/translate/romanizationEval.js`) once the configured library (§1a's flow) has produced a candidate romanization for `target`. The model is shown the library's own output and asked only to judge it — **it cannot substitute a replacement of its own.** The output schema has no key a rewritten romanization could travel through: only `ok` (approve/flag) and, when flagging, `concern` (why). This mirrors the same "flag, never silently override" idiom already used by the corpus-assembly dedup passes (`src/corpus/epubDedup.js`'s `dedupBackward`, `src/corpus/epubForwardFlags.js`'s `flagForwardConcerns`) — deliberately, not by coincidence: if the model disagrees with a deterministic library, that disagreement is a signal for a human reviewer, not a license for the model to silently overwrite ground truth. A flagged item keeps the library's `pronunciation` value, gets `uncertain: true`, and a `"Possibly incorrect romanization — <concern>"` note appended.

### Template

````
# Task: Judge Machine-Generated Romanizations

## Overview
A deterministic romanization library has already converted each flashcard's translated text
(`target`, in <targetLanguage>) into a romanization (`romanization`). Your job is only to
judge whether that romanization correctly represents the given `target` text — you are a
reviewer, not a translator or a romanizer.

## Input Format
The input is a JSON array of objects, one per flashcard:

- `id` (string): a unique identifier for this item — reuse it unchanged in your response.
- `english` (string): the English phrase, given for meaning context only.
- `target` (string): the final <targetLanguage> text that was romanized.
- `romanization` (string): the library-generated romanization of `target`, to be judged.

### Example Input
```json
[{ "id": "hello", "english": "Hello", "target": "こんにちは", "romanization": "konnichiwa" }]
```

## Output Format
Respond with ONLY a JSON array (no markdown fences, no extra prose, no commentary before or after it).
Produce exactly one object per input item:

- `id` (string): the SAME id as the corresponding input item.
- `ok` (boolean): `true` if `romanization` correctly represents `target`, `false` if it looks wrong.
- `concern` (string, required when `ok` is `false`): a brief, specific reason the romanization looks wrong.

## Important
- Do not invent, correct, or improve the romanization yourself — you are only judging the one you were given.
- If it looks wrong, say so via `concern`; never provide a replacement value.
- Include every id from the input exactly once.
  - Order does not matter.
- Do not wrap the response in markdown code fences.
- Do not include any text before or after the JSON array.

### Example Output
```json
[
  { "id": "hello", "ok": true },
  { "id": "cheese", "ok": false, "concern": "romanization reads as a different word entirely" }
]
```

## Input Data (<N> item(s) to judge)
```json
<JSON array of the actual items, same shape as Example Input>
```
````

**Fails open** on a malformed response, or on a specific item missing from an otherwise-valid response: every affected item is approved unflagged (with a warning logged), same philosophy as `flagForwardConcerns`'s own documented "fails open... never blocking assemble" — the romanization is already a real deterministic value, not an invented one needing a safety net.

## Design notes

- **Input is a real JSON array**, mirroring the output format, instead of an ad hoc bullet-list notation — one JSON-in/JSON-out convention throughout, so there's no bespoke format to get wrong.
- **Markdown structure** (`# Task`, `## Overview`, `## Input Format`, `### Example Input`, `## Output Format`, `### Example Output`, `## Important`, `## Input Data`) gives each part of the prompt a single, clear job instead of one undifferentiated block of prose.
- **`Example Input`/`Example Output`** are a fixed, illustrative pair — not the real batch — so the model has a concrete instance of the full round-trip to pattern-match against. **`Input Data`** is the real batch of items for this call; it's what the model is actually asked to act on.
- **`hint` is symmetric across both prompts.** An already-translated (pronunciation-only) item can be just as deserving of a usage hint as a freshly-translated one.
- **`pronunciation` accounts for standard romanization systems** (romaji for Japanese, pinyin for Mandarin Chinese, etc.) — for a language with no configured library, by asking the model to prefer that system over an invented phonetic respelling; for a language WITH a configured library, by using the library directly (§1a/§3) instead of asking the model at all.
- **The eval prompt (§3) deliberately excludes a "correct it" option.** Giving the model a way to silently substitute its own romanization would reintroduce the exact "no ground truth, can't tell what's real" problem the library-first design exists to fix — see `.harness/custom/docs/LIMITATIONS.md`'s dependency-exception entry for the fuller reasoning.

### Open question: does `pronunciation` need its own on-card field for "romanization"?

Right now `pronunciation` is one field serving two different jobs depending on the target language: sometimes it's a real, standard system (romaji, pinyin) that a learner might want displayed as its own thing, and sometimes it's an ad hoc phonetic respelling that only exists to help pronounce the word aloud.
Both currently get flattened into the same `pronunciation` string on the card.

The library-first design (§1a/§3) resolves the underlying ambiguity _internally_ — the pipeline now knows, per corpus, whether `pronunciation` came from a real deterministic library or from the model inventing one (`getRomanizationLibrary(languageCode)` returning an entry or not). That signal is **not** currently surfaced on the card schema itself; `CARDS_SCHEMA` still has just one `pronunciation` field either way. Splitting it into `romanization`/`phonetic` remains a deliberately deferred, separate follow-up — it would need every downstream consumer (deck template rendering, review tooling) to decide what to do with two fields, which hasn't been designed yet. If that follow-up happens, the signal for which value a card should get lives in `src/translate/romanizationLibraries.js`.

## Source

- `src/translate/index.js`: `buildFullTranslationPrompt`, `buildTargetOnlyPrompt`, `buildPronunciationOnlyPrompt`, `translateCorpus` (the entry point, decides which prompts run per §1a above)
- `src/translate/romanizationLibraries.js`: the per-language library config (`ROMANIZATION_LIBRARIES`, `getRomanizationLibrary`)
- `src/translate/romanization/*.js`: one adapter per configured language, each a uniform `async romanize(targetText) => string`
- `src/translate/romanizationEval.js`: `buildRomanizationEvalPrompt`, `romanizeAndEvaluate` (§3)
