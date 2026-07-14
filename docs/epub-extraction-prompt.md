# Overview

Read the file at this exact path yourself using your Read tool — it is the raw XHTML source of ONE chapter from a {{TARGET_LANGUAGE}}-language textbook for English speakers:

{{CHAPTER_FILE_PATH}}

Use the file's structure (headings, CSS classes, tag nesting) as signal for what kind of content each part is. Go through the ENTIRE file top to bottom — do not skip any part of it.

## Why

The data you extract here will become flashcards in an Anki deck used to learn this language. Prioritize content that actually helps someone learn to speak and recognize the language — real vocabulary, real sentences — over exhaustively cataloguing every explanatory detail in the chapter.

## Handling Uncertainty

If you're genuinely unsure whether something should be included, include it anyway and set `"uncertain": true` with a brief reason in `"notes"`, rather than silently deciding either way.

## Output Format

Respond with ONLY a single JSON array (no markdown fences, no prose before or after). One object per flashcard:

**Important: preserve textbook order.** Emit items in exactly the order they appear in the chapter, top to bottom — do not reorder them, do not group them by type (e.g. all vocabulary together, then all key sentences), and do not sort them any other way. The sequence in the output must match the sequence in the source file.

```
{"id": "<short slug>", "english": "<English side>", "target": "<{{TARGET_LANGUAGE}} text, verbatim from the file>", "notes": "<optional short context, omit if none>", "uncertain": <true, only if genuinely unsure this item should be included — omit otherwise>, "aiSuggested": <true, only if this is a critical-gap suggestion you added yourself, not something literally in the file — omit otherwise>}
```

## Example Output

Showing a plain item, an item with a note, an uncertain item, and an AI-suggested item:

```json
[
  { "id": "sumimasen", "english": "Excuse me.", "target": "すみません。" },
  {
    "id": "yoroshiku",
    "english": "I look forward to working with you.",
    "target": "よろしく おねがいします。",
    "notes": "Usually combined with はじめまして when being introduced"
  },
  {
    "id": "nihonjin",
    "english": "Japanese (person)",
    "target": "にほんじん",
    "notes": "Translation inferred by combining にほん + じん; not separately glossed in the source",
    "uncertain": true
  },
  {
    "id": "arigatou-suggestion",
    "english": "thank you",
    "target": "ありがとう",
    "notes": "Basic thanks — not present in this chapter's text, but a genuine gap for a learner at this level",
    "aiSuggested": true
  }
]
```

## Step 1: Extract

Evaluate BOTH the English and the {{TARGET_LANGUAGE}} text; do not favor one language when deciding what counts as content.

### What to extract

- Every vocabulary word or short phrase presented as an individual term with its translation — including particles and other short function words, wherever they're listed as vocabulary (not buried in a grammar explanation paragraph).
- Every curated model/example sentence presented as one of the chapter's core spoken examples (often labeled "Key Sentences" or similar, often numbered, often the sentences the rest of the chapter refers back to).

### What to skip entirely

- Grammar explanation prose — paragraphs explaining a grammar rule, particle usage, or conjugation pattern in depth. (This does not include a short particle vocabulary entry — see above.)
- Practice/drill exercises in full — anything instructing the learner to produce their own sentences by substituting into a pattern. These are for manual practice; do not extract them, including their "e.g." example lines.
- Dialogue/conversation scripts in full — a modeled conversation between named speakers is for listening/rehearsal practice, not a flashcard source. Do not extract dialogue lines, reactions, or recap sentences, even ones that seem useful — treat the whole dialogue as off-limits for this test.
- Supplementary/culture notes as standalone cards — fold a clarification into the "notes" field of the item it clarifies instead.
- Proper nouns naming a specific person (e.g. a surname like "Harris") or a specific organization/business (e.g. "ABC Foods," "Nozomi Department Store," real or fictitious) as standalone vocabulary. Country and city names ARE genuine vocabulary and should be extracted. A name inside a key sentence you're otherwise keeping should stay in that sentence — this only blocks a standalone "here's a name" card.

## Step 2: Add Critical Gap Suggestions

If, after Step 1, you believe there's a genuinely important word or sentence a learner at this chapter's level would need that the chapter's own text simply does not contain, you may add it — but it MUST be marked `"aiSuggested": true` with a one-line reason in `"notes"`.

## Step 3: De-duplicate

Across everything gathered in Steps 1 and 2, de-duplicate across the whole chapter — if the same word or sentence would otherwise appear twice, keep it once. Do not treat two genuinely different words as duplicates just because they're related (e.g. a country name and its nationality-form counterpart, like "Japan" and "Japanese (person)," are two separate real words, NOT duplicates of each other).
