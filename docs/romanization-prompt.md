# Task: Produce the Correct Romanization

## Overview

Each flashcard carries a `target` text in {{TARGET_LANGUAGE}}{{LIBRARY_INPUT_CLAUSE}}. Your job is to
return the CORRECT romanization for each item, in {{ROMANIZATION_SYSTEM}}. **You are the final
authority on the romanization** — the output has to be something a learner can read aloud and be
understood.

{{LIBRARY_FAILURE_MODES}}

## Input Format

The input is a JSON array of objects, one per flashcard:

- `id` (string): a unique identifier — reuse it unchanged in your response.
- `english` (string): the English phrase, for meaning context.
- `target` (string): the {{TARGET_LANGUAGE}} text to romanize. When the card carries a `ttsText` (what TTS speaks instead of the written target, e.g. a kana spelling for a target printed with digits), that is the text you are given here — the romanization must match what is spoken, not a digit or kanji display form.
- `libraryRomanization` (string, may be absent): a deterministic library's attempt. When it is
  present it is a starting point, not an answer; when it is absent, romanize from the target alone.

### Example Input

```json
{{EXAMPLE_INPUT}}
```

## Output Format

Respond with ONLY a JSON array (no markdown fences, no extra prose, no commentary before or after it).
Produce exactly one object per input item, of the shape
`{ "id": "<the same id>", "pronunciation": "<the romanization>" }`:

- `id` (string): the SAME id as the corresponding input item.
- `pronunciation` (string): the correct romanization of `target` in {{ROMANIZATION_SYSTEM}} — the
  library's value if it is already correct, otherwise your corrected version.

## Important

- Return the final, correct `pronunciation` for EVERY item — never leave a known-wrong value in place.
- Romanize a single word as a single token (no spurious internal spaces), and keep natural word
  spacing in a full sentence.
- Write every vowel the word is actually pronounced with, even when the script does not write them.
  {{ROMANIZATION_STYLE_RULES}}
- Include every id from the input exactly once. Order does not matter.
- Do not wrap the response in markdown code fences, and include no text before or after the JSON array.

### Example Output

```json
{{EXAMPLE_OUTPUT}}
```

## Input Data ({{ITEM_COUNT}} item(s) to romanize)

```json
{{INPUT_JSON}}
```
