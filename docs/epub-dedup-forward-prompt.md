# Task: Check for Later Teaching

## Overview

You are checking whether any candidate flashcard items from chapter {{CHAPTER_NUMBER}} of a {{TARGET_LANGUAGE}}-language textbook are explicitly, deliberately taught again in a later chapter of the same book.
An item that is only casually reused inside an example sentence later does NOT count — only a dedicated vocabulary entry or a "Key Sentence"-style teaching moment counts.
The later-chapter file paths are listed under `## Input Data` below — read each of them yourself using your Read tool; their content is not pasted into this prompt.

## Input Format

The candidate items are a JSON array of objects, one per item already extracted from chapter {{CHAPTER_NUMBER}}:

- `id` (string): a unique identifier for this item — reuse it unchanged in your response.
- `english` (string): the English side of the item.
- `target` (string): the {{TARGET_LANGUAGE}} side of the item.

### Example Input

```json
[{ "id": "department-store", "english": "department store", "target": "デパート" }]
```

## Output Format

Respond with ONLY a JSON object (no markdown fences, no extra prose, no commentary before or after it).
Produce exactly one `drop` entry per item you are confident is explicitly taught in a later chapter — omit any item you are not confident about:

- `drop` (array): the items to drop.
  - `id` (string): the SAME id as the corresponding candidate item.
  - `laterChapter` (number): which later chapter number explicitly teaches it.
  - `reason` (string): a short, specific reason (e.g. "explicitly taught as shopping-places vocabulary").

### Example Output

```json
{
  "drop": [
    {
      "id": "department-store",
      "laterChapter": 3,
      "reason": "explicitly taught as shopping-places vocabulary"
    }
  ]
}
```

## Important

- If nothing qualifies, respond with `{"drop": []}` — never omit the `drop` key.
- When uncertain whether an item is genuinely, explicitly taught later, do NOT include it.
  - Bias toward keeping content — an item wrongly kept is a minor redundancy, an item wrongly dropped is lost content.
- Every entry in `drop` needs all three fields: `id`, `laterChapter`, `reason`.
- Do not wrap the response in markdown code fences.
- Do not include any text before or after the JSON object.

## Input Data ({{ITEM_COUNT}} candidate item(s) from chapter {{CHAPTER_NUMBER}})

```json
{{CANDIDATE_ITEMS_JSON}}
```

Later chapter files to Read yourself:

{{LATER_CHAPTER_FILE_PATHS}}
