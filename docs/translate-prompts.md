# Translate stage — the prompts

`translateCorpus` (`src/translate/index.js`) splits corpus items into two groups depending on whether `item.target` is already set, and sends each group through a different prompt — one `claude -p` call per group, unbatched (the whole group goes in a single call, pinned to Sonnet at medium effort by default, overridable via `ANKI_BUILDER_TRANSLATE_MODEL` / `ANKI_BUILDER_TRANSLATE_EFFORT`, or for every LLM pass at once via `ANKI_BUILDER_LLM_MODEL` / `ANKI_BUILDER_LLM_EFFORT`; every call runs with a timeout, one retry, and the prompt piped over stdin — see `src/util/runClaude.js`).

**Spoken form (`ttsText`).** `ttsText` is the text TTS speaks instead of the target whenever the written target would be misread (numerals AND kanji-bearing targets); it is never rendered on any card face. Anywhere the target text is romanized or pronounced, an item's optional `ttsText` is used in place of `target` when set (`ttsText ?? target`): the romanization library romanizes it, and the pronunciation-only prompt is handed it as the text to pronounce. This is how a number card displays digits (`target: "2,000えん"`) but pronounces and romanizes the spelled-out spoken form (`ttsText: "にせんえん"`), since digits break both the romanizer and TTS. The `ttsText` is carried through onto the resulting card for the audio stage. See `src/model/index.js` (schema) and `src/translate/romanizationEval.js`.

**Per-language style rules.** Both translation prompts inject any register/orthography rules the target language defines in `src/translate/languageRules.js` (`translationStyle`, keyed by ISO 639-1 code) as extra bullets under the `target` field — for Japanese that means defaulting generated translations to the polite です／ます register and textbook phrasing. The `--simple-script` flag separately injects the language's script constraint from `src/translate/targetScript.js`. The prompt cores stay language-neutral; a language with no rules gets no extra bullets.

**Which prompts run depends on whether the target language has a configured romanization library** (`src/translate/romanizationLibraries.js`, keyed by ISO 639-1 code):

- **No library configured** (the original design, unchanged): the two prompts below — full-translation and pronunciation-only — both ask the model for `pronunciation` directly.
- **Library configured** (e.g. Japanese, Mandarin, Korean, Russian, Hebrew, Hindi, Arabic — see `romanizationLibraries.js` for the current list): the translation call asks for `target` only (§1a, below) — never `pronunciation` — and a separate romanization eval pass (§3) runs the real library and has a Sonnet-medium model correct its output in place instead. See `src/translate/romanizationEval.js`.

## The four prompts, and where they live

Every one of these is now a real template in `docs/`, rendered through `renderPromptTemplate`
(`src/util/promptTemplate.js`) like every other prompt in the pipeline. They used to be string
arrays inside `src/translate/`, which made them the only prompts a human could not edit without a
code change, the only ones with no automated contract, and the only ones whose documentation was a
hand-maintained transcript. The transcript drifted, as transcripts do: it documented a
counter-hyphen paragraph and `rok-kai` while the shipped prompt had neither and produced `rokkai`.
So this file no longer copies them. Read the template.

`test/docs/promptTemplates.test.js` holds each one to its placeholder set and its output contract,
so a hand edit that deletes a placeholder fails a test instead of silently sending the model a
prompt with a missing input.

| Prompt                         | Template                                                                   | Renderer                       | When it runs                                                                                                                                                                       |
| ------------------------------ | -------------------------------------------------------------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1. Full translation**        | [`translate-full-prompt.md`](./translate-full-prompt.md)                   | `buildFullTranslationPrompt`   | `item.target === null` and the language has NO configured romanization library. Asks for `target` + `pronunciation` in one call.                                                   |
| **1a. Target only**            | [`translate-target-only-prompt.md`](./translate-target-only-prompt.md)     | `buildTargetOnlyPrompt`        | `item.target === null` and the language HAS a library. Asks for `target` only, because the library plus §3 produces the romanization.                                              |
| **2. Pronunciation only**      | [`translate-pronunciation-prompt.md`](./translate-pronunciation-prompt.md) | `buildPronunciationOnlyPrompt` | `item.target !== null` (a target extracted from a bilingual source). The model is never given the chance to second-guess a target we already trust.                                |
| **3. Romanization correction** | [`romanization-prompt.md`](./romanization-prompt.md)                       | `buildRomanizationPrompt`      | After the library has romanized, for library-configured languages. The model is the final authority: it returns the correct value, keeping the library's when it is already right. |

### The placeholders each one takes

- **All four**: `{{TARGET_LANGUAGE}}`, `{{ITEM_COUNT}}`, `{{INPUT_JSON}}` (the real batch).
- **1 and 1a**: `{{STYLE_RULES}}` — the target language's register/orthography rules from
  `src/translate/languageRules.js` (`translationStyle`), rendered as sub-bullets under `target`. A
  language with no entry gets an empty string and the prompt reads as if the section never existed.
- **1a only**: `{{TARGET_SCRIPT_RULE}}` and `{{TARGET_SCRIPT_REMINDER}}` — the `--simple-script`
  constraint from `src/translate/targetScript.js`, as a sub-bullet and as an `## Important` line.
  Both empty when the language has no constraint.
- **3 only**: `{{ROMANIZATION_STYLE_RULES}}` — the **pinned romanization spec** for the target
  language, from `src/translate/romajiStyle.js` (`ROMAJI_STYLES`, surfaced through
  `languageRules.js`'s `romanizationStyle`). For Japanese that is modified Hepburn as this deck
  writes it: macrons for long vowels, `ei`/`ii` kept doubled, ん always `n` (so `konbini`, never
  `kombini`), the ん apostrophe, particles spelled as spoken, the sokuon, no terminal ASCII
  punctuation, proper-noun-only capitals, hyphenated honorifics, hyphenated counters.

  The same array is injected into the number-reading prompt and the fill-in-the-blank prompt, and
  `scripts/preflight.mjs`'s `romaji-style` check lints the finished cards against the very same
  rules — one constant, three prompts, one lint. Before that constant existed each pass described
  the style in its own words and the result drifted per batch: a trailing period on 253 cards
  (100% of chapter-2/3/4-extras, 0% of chapters 6-13), `-san` hyphenated 32/32 in one unit and
  spaced 40/40 in the next, `kombini` beside `konbini`.

  Two rules in the spec are marked as taught-but-not-linted (proper-noun casing and a missing ん
  apostrophe), because neither is decidable from the romanization alone. The check reports them by
  name rather than letting them read as checked.

## Design notes

- **Input is a real JSON array**, mirroring the output format, instead of an ad hoc bullet-list notation — one JSON-in/JSON-out convention throughout, so there's no bespoke format to get wrong.
- **Markdown structure** (`# Task`, `## Overview`, `## Input Format`, `### Example Input`, `## Output Format`, `### Example Output`, `## Important`, `## Input Data`) gives each part of the prompt a single, clear job instead of one undifferentiated block of prose.
- **`Example Input`/`Example Output`** are a fixed, illustrative pair — not the real batch — so the model has a concrete instance of the full round-trip to pattern-match against. **`Input Data`** is the real batch of items for this call; it's what the model is actually asked to act on.
- **The templates are the source of truth, and this file is not a copy of them.** Everything above points at a file; nothing above transcribes one. That is deliberate: the previous version of this document was a transcript, and it drifted from the shipped prompt within one release.
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
- `src/translate/romajiStyle.js`: the pinned per-language romanization spec (`JA_ROMAJI_STYLE`) — the prose the prompts are taught AND the detector preflight lints with, in one object per rule
