# Task: Flag Possibly Premature Items

## Overview

You are reviewing candidate flashcard items just extracted from chapter {{CHAPTER_NUMBER}} of a {{TARGET_LANGUAGE}}-language textbook, deciding whether any of them seem premature for this point in the book. A human reviewer sees whatever you flag here and makes the final keep/drop call themselves — you are never removing anything yourself, only surfacing a genuine concern for them to weigh. Bias toward flagging when you have a real concern rather than staying silent; a wrongly-flagged item just costs the reviewer a moment's glance, but a wrongly-unflagged one reaches them with no warning at all.

Two independent reasons make an item worth flagging:

1. **Explicitly re-taught later.** A later chapter teaches this same item as a dedicated vocabulary entry or a "Key Sentence"-style teaching moment. Judge this from the book's taught-content index under `## Input Data` below — a one-time whole-book pass already read every chapter and recorded what each one introduces. An entry that merely relates to the item's topic does NOT count; flag only when the index shows the item itself (or the vocabulary set it belongs to) being formally taught in a later chapter. When flagging for this reason, name that later chapter's number.
2. **Too complex for this point in the book.** The item relies on grammar, a construction, or vocabulary that — per the index — no chapter up to and including chapter {{CHAPTER_NUMBER}} has introduced, even when it is never literally re-taught anywhere else.

## Book-Wide Conventions

{{BOOK_CONVENTIONS}}

Use this as grounding for the book's own teaching order and level progression alongside the index.

## Input Format

The candidate items are a JSON array of objects, one per item already extracted from chapter {{CHAPTER_NUMBER}}:

- `id` (string): a unique identifier for this item — reuse it unchanged in your response.
- `english` (string): the English side of the item.
- `target` (string): the {{TARGET_LANGUAGE}} side of the item.

The taught-content index is a JSON array of objects, one per LATER chapter of the book (chapters after {{CHAPTER_NUMBER}}), in book order:

- `chapter` (number): the spine chapter number.
- `label` (string or null): that chapter's own title.
- `teaches` (array of strings): what that chapter formally introduces.

### Example Input

```json
[{ "id": "department-store", "english": "department store", "target": "デパート" }]
```

## Output Format

Respond with ONLY a JSON object (no markdown fences, no extra prose, no commentary before or after it).
Produce one `flag` entry per item you have a genuine concern about — omit any item you have no concern about:

- `flag` (array): the items to flag for the reviewer.
  - `id` (string): the SAME id as the corresponding candidate item.
  - `reason` (string): a short, specific, human-readable explanation of the concern — e.g. "explicitly taught as shopping-places vocabulary" or "uses the て-form, not introduced until a later chapter."
  - `laterChapter` (number, optional): which later chapter number explicitly re-teaches it — include this ONLY when the concern is reason 1 (explicitly re-taught later); omit it entirely for a reason-2 (too-complex) flag.

### Example Output

```json
{
  "flag": [
    {
      "id": "department-store",
      "reason": "explicitly taught as shopping-places vocabulary",
      "laterChapter": 3
    },
    {
      "id": "te-form-example",
      "reason": "uses the て-form, which this book doesn't introduce until later in the book"
    }
  ]
}
```

## Important

- If nothing qualifies, respond with `{"flag": []}` — never omit the `flag` key.
- You are producing an opinion for a human reviewer, not filtering the corpus — never omit an item from your consideration just because you're unsure; if genuinely uncertain whether a concern is real, flag it anyway with a reason that says so, rather than silently deciding either way.
- Every entry in `flag` needs `id` and `reason`; `laterChapter` is optional and reason-1-only.
- Do not wrap the response in markdown code fences.
- Do not include any text before or after the JSON object.

## Input Data ({{ITEM_COUNT}} candidate item(s) from chapter {{CHAPTER_NUMBER}})

```json
{{CANDIDATE_ITEMS_JSON}}
```

Taught-content index of the LATER chapters (chapters after {{CHAPTER_NUMBER}}):

```json
{{LATER_CHAPTERS_INDEX_JSON}}
```
