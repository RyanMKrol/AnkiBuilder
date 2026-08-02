# Task: Build the Book's Taught-Content Index

## Overview

Read EVERY chapter file listed below yourself, using your Read tool, in order. Read each chapter file in FULL, start to end — every page/section inside it, not just the opening portion. If a chapter file is long enough that your Read tool would otherwise truncate it (e.g. a default line-count limit), issue additional reads with an offset to cover the rest of that same file before moving on to the next chapter — never treat a partial read of a chapter as if you'd read the whole thing. This is a {{TARGET_LANGUAGE}}-language textbook for English speakers, split across {{CHAPTER_COUNT}} chapter files, each listed with its spine chapter number:

{{CHAPTER_FILE_PATHS}}

You are NOT extracting vocabulary here. Your job is to produce a compact INDEX of what each chapter INTRODUCES — the vocabulary sets, grammar points, forms, and sentence patterns each chapter formally teaches for the first time.

## Why

A separate review pass looks at flashcards freshly extracted from one chapter and asks two questions: "does a LATER chapter explicitly re-teach this item?" and "does this item rely on grammar or vocabulary the book has not introduced yet?". Handing that pass every later chapter's full text on every single lesson is slow and expensive, and it repeats for each of the book's lessons. You build the answer key ONCE here; that pass then consults your index instead of re-reading the book.

## Output Format

Respond with ONLY a JSON object (no markdown fences, no prose before or after):

```
{"chapters": [{"chapter": <spine chapter number>, "label": "<the chapter's own title/heading, or null if it has none>", "teaches": ["<concise entry>", ...]}]}
```

Rules:

- **One entry per chapter listed above — EVERY chapter**, including front matter, dividers, quizzes, and appendices. A chapter that introduces nothing new gets `"teaches": []`. This completeness is verified mechanically: a response missing any listed chapter number is rejected outright.
- Each `teaches` entry is one short string naming something the chapter formally INTRODUCES. Be specific enough that the review pass can match a flashcard against it:
  - Vocabulary sets, with the concrete headwords when the chapter formally teaches them — e.g. `"shopping-places vocabulary: デパート, スーパー, ぎんこう, ゆうびんきょく"`.
  - Grammar and forms — e.g. `"て-form of verbs"`, `"particle で marking means of transportation"`, `"counter 〜まい for flat objects"`.
  - Key sentence patterns — e.g. `"noun 1 は noun 2 です (identification)"`.
- List only what the chapter itself introduces or formally re-teaches as a dedicated vocabulary entry or Key Sentence. Casual REUSE of earlier material inside an example sentence does not belong in the index.
- Keep each chapter's list tight — typically 3-15 entries for a teaching chapter. This is an index, not a summary; favor entries a reviewer could match a flashcard against.

## Important

- Never omit the `chapters` key, and never omit a listed chapter from it.
- Do not wrap the response in markdown code fences.
- Do not include any text before or after the JSON object.
