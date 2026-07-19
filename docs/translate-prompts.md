# Translate stage — the prompts

`translateCorpus` (`src/translate/index.js`) splits corpus items into two groups depending on whether `item.target` is already set, and sends each group through a different prompt — one `claude -p` call per group, unbatched (the whole group goes in a single call, pinned to Sonnet at medium effort by default, overridable via `ANKI_BUILDER_TRANSLATE_MODEL` / `ANKI_BUILDER_TRANSLATE_EFFORT`).

**Spoken form (`reading`).** Anywhere the target text is romanized or pronounced, an item's optional `reading` is used in place of `target` when set (`reading ?? target`) — the romanization library romanizes it, and the pronunciation-only prompt is handed it as the text to pronounce. This is how a number card displays digits (`target: "2,000えん"`) but pronounces/romanizes the spelled-out spoken form (`reading: "にせんえん"`), since digits break both the romanizer and TTS. The `reading` is carried through onto the resulting card for the audio stage. See `src/model/index.js` (schema) and `src/translate/romanizationEval.js`.

**Which prompts run depends on whether the target language has a configured romanization library** (`src/translate/romanizationLibraries.js`, keyed by ISO 639-1 code):

- **No library configured** (the original design, unchanged): the two prompts below — full-translation and pronunciation-only — both ask the model for `pronunciation` directly.
- **Library configured** (e.g. Japanese, Mandarin, Korean, Russian, Hebrew, Hindi, Arabic — see `romanizationLibraries.js` for the current list): the translation call asks for `target` only (§1a, below) — never `pronunciation` — and a separate romanization eval pass (§3) runs the real library and has a Sonnet-medium model correct its output in place instead. See `src/translate/romanizationEval.js`.

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

## 3. Romanization correction prompt (library-configured languages)

Used by `romanizeAndEvaluate` (`src/translate/romanizationEval.js`, `correctRomanizations` → `buildRomanizationPrompt`) once the configured library (§1a's flow) has produced a candidate romanization for the spoken text (`reading ?? target`). The library (kuroshiro et al.) is a **starting point, not ground truth** — empirically it mis-splits single words with spurious spaces, mishandles the sokuon っ (emitting a literal "tsu"), and spells unfamiliar kana letter-by-letter. So the model is shown the library's output and asked to return the **correct** romanization for every item: keep the library's value when it's already right, fix it when it's wrong. The corrected value lands directly in `pronunciation` — **no `uncertain` flag or note**, the correction is the resolution. Fails open: a malformed/missing response keeps the library value. (This replaced an earlier flag-only design that could only surface a concern for a human — see the git history; kuroshiro turned out to be wrong too often for "library = ground truth" to hold.)

### Template

````
# Task: Produce the Correct Romanization

## Overview
Each flashcard has a <targetLanguage> `target` text and a `libraryRomanization` — a romanization
produced by a deterministic library. That library is a useful starting point but is frequently
WRONG: it mis-splits a single word into pieces with spurious spaces, mishandles the Japanese small
っ (sokuon) by emitting a literal "tsu" instead of doubling the next consonant, and falls back to
spelling out unfamiliar kana letter-by-letter. Your job is to return the CORRECT romanization for
each item — keep the library's value when it is already right, and fix it when it is wrong. You are
the final authority on the romanization.

## Input Format
- `id` (string): a unique identifier — reuse it unchanged in your response.
- `english` (string): the English phrase, for meaning context.
- `target` (string): the <targetLanguage> text to romanize (the spoken `reading` when the card has one).
- `libraryRomanization` (string): the library's attempt — a starting point, often wrong.

## Output Format
Respond with ONLY a JSON array. One object per input item:

- `id` (string): the SAME id as the corresponding input item.
- `pronunciation` (string): the correct romanization of `target`, using the standard system for
  <targetLanguage> (Hepburn for Japanese, pinyin for Mandarin, etc.) — the library's value if already
  correct, otherwise your corrected version.

## Important
- Return the final, correct `pronunciation` for EVERY item — never leave a known-wrong value in place.
- Romanize a single word as a single token (no spurious internal spaces); double the consonant for a
  sokuon (ろっかい → `rokkai`, not `ro tsu kai`); keep natural word spacing in a full sentence.
- Include every id exactly once. No markdown fences, no text around the JSON array.

### Example Output
```json
[
  { "id": "sixth-floor", "pronunciation": "rokkai" },
  { "id": "hello", "pronunciation": "konnichiwa" }
]
```

## Input Data (<N> item(s) to romanize)
```json
<JSON array of the actual items, same shape as Input Format>
```
````

**Fails open** on a malformed response, or on a specific item missing from an otherwise-valid response: every affected item is approved unflagged (with a warning logged), same philosophy as `flagForwardConcerns`'s own documented "fails open... never blocking assemble" — the romanization is already a real deterministic value, not an invented one needing a safety net.

## Design notes

- **Input is a real JSON array**, mirroring the output format, instead of an ad hoc bullet-list notation — one JSON-in/JSON-out convention throughout, so there's no bespoke format to get wrong.
- **Markdown structure** (`# Task`, `## Overview`, `## Input Format`, `### Example Input`, `## Output Format`, `### Example Output`, `## Important`, `## Input Data`) gives each part of the prompt a single, clear job instead of one undifferentiated block of prose.
- **`Example Input`/`Example Output`** are a fixed, illustrative pair — not the real batch — so the model has a concrete instance of the full round-trip to pattern-match against. **`Input Data`** is the real batch of items for this call; it's what the model is actually asked to act on.
- **`hint` is symmetric across both prompts.** An already-translated (pronunciation-only) item can be just as deserving of a usage hint as a freshly-translated one.
- **`pronunciation` accounts for standard romanization systems** (romaji for Japanese, pinyin for Mandarin Chinese, etc.) — for a language with no configured library, by asking the model to prefer that system over an invented phonetic respelling; for a language WITH a configured library, by using the library directly (§1a/§3) instead of asking the model at all.
- **The correction prompt (§3) now lets the model fix the romanization in place.** An earlier design deliberately excluded a "correct it" option (the model could only flag a concern, never substitute), on the theory that the library was ground truth and letting the model overwrite it would reintroduce a "can't tell what's real" problem. In practice kuroshiro is wrong too often (mis-splits, sokuon, letter-by-letter kana) for that to hold, so the model is now the final authority on `pronunciation` — it returns the correct value, keeping the library's only when it's already right.

### Open question: does `pronunciation` need its own on-card field for "romanization"?

Right now `pronunciation` is one field serving two different jobs depending on the target language: sometimes it's a real, standard system (romaji, pinyin) that a learner might want displayed as its own thing, and sometimes it's an ad hoc phonetic respelling that only exists to help pronounce the word aloud.
Both currently get flattened into the same `pronunciation` string on the card.

The library-first design (§1a/§3) resolves the underlying ambiguity _internally_ — the pipeline now knows, per corpus, whether `pronunciation` came from a real deterministic library or from the model inventing one (`getRomanizationLibrary(languageCode)` returning an entry or not). That signal is **not** currently surfaced on the card schema itself; `CARDS_SCHEMA` still has just one `pronunciation` field either way. Splitting it into `romanization`/`phonetic` remains a deliberately deferred, separate follow-up — it would need every downstream consumer (deck template rendering, review tooling) to decide what to do with two fields, which hasn't been designed yet. If that follow-up happens, the signal for which value a card should get lives in `src/translate/romanizationLibraries.js`.

## Source

- `src/translate/index.js`: `buildFullTranslationPrompt`, `buildTargetOnlyPrompt`, `buildPronunciationOnlyPrompt`, `translateCorpus` (the entry point, decides which prompts run per §1a above)
- `src/translate/romanizationLibraries.js`: the per-language library config (`ROMANIZATION_LIBRARIES`, `getRomanizationLibrary`)
- `src/translate/romanization/*.js`: one adapter per configured language, each a uniform `async romanize(targetText) => string`
- `src/translate/romanizationEval.js`: `buildRomanizationPrompt`, `correctRomanizations`, `romanizeAndEvaluate` (§3)
