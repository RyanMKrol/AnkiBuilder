# Task: Order Items for Learning (Vocabulary → Sentences)

## Overview

You are given the complete set of flashcard items just extracted from ONE lesson of a
{{TARGET_LANGUAGE}}-language textbook for English speakers. Your job is to decide the **order** a
learner should meet these cards in — the sequence that best builds understanding, from the smallest
pieces up to the full sentences made out of them.

You are ONLY re-ordering. You never add, remove, merge, split, reword, or re-translate an item — the
set of items is fixed and every item must appear in your output exactly once. Think of yourself as
arranging cards already written, not editing them.

## Why this matters

Textbooks frequently print a model sentence FIRST (e.g. a "Key Sentence") and only introduce the
vocabulary it's built from further down the page. Studied in that raw printed order, a learner is
asked to recall a whole sentence before ever meeting the words inside it. Re-ordering fixes that: a
learner should meet さんぜん and えん as vocabulary **before** the sentence これは さんぜんえんです。
that uses them.

## Ordering principles

Apply these together, using your judgment — they are priorities, not a rigid algorithm:

1. **Dependency first (the core rule).** An item that is a phrase or full sentence should come
   **after** the standalone vocabulary items whose words appear inside it. Read each item's `target`
   and see which other items' `target` words it contains; place the building-block words earlier.
2. **Build up complexity.** Roughly, single vocabulary words and short function words come before
   short phrases, which come before full sentences. A learner climbs from atoms to molecules.
3. **Keep related items together.** Don't scatter a topical or grammatical group across the whole
   lesson to satisfy a minor dependency. Items about the same topic (a set of numbers, a family of
   greetings, a country and its nationality) should stay near each other; order _within_ the group by
   the rules above.
4. **Particle, then its example.** When the lesson has both a particle/function word as its own
   vocabulary entry AND an example sentence that demonstrates it, put the bare particle entry first,
   then the sentence that shows it at work.
5. **Don't churn.** Where the extracted order is already sensible and no dependency argues for moving
   an item, leave it where it is. Prefer the smallest set of moves that satisfies the rules above over
   a gratuitous global reshuffle — a mostly-preserved order with the key sentences pushed after their
   vocabulary is exactly right.

## Book-Wide Conventions

{{BOOK_CONVENTIONS}}

Use this only as background on how this book teaches; the ordering decision is about the dependencies
_within this lesson's own items_.

## Input Format

The items are a JSON array of objects, in the order they were extracted from the lesson:

- `id` (string): a unique identifier — reuse it unchanged in your response.
- `english` (string): the English side.
- `target` (string): the {{TARGET_LANGUAGE}} side — read this to spot which items are built from which.
- `category` (string, optional): the item's topic, useful for keeping related items grouped.
- `notes` (string, optional): any extra context.

## Output Format

Respond with ONLY a JSON object (no markdown fences, no prose before or after it):

- `order` (array of strings): EVERY input `id`, each exactly once, in the learning order you've
  chosen. It must be a pure permutation of the input ids — same ids, no additions, no omissions, no
  duplicates.

### Example

Input (extracted order — a Key Sentence printed before its vocabulary):

```json
[
  {
    "id": "kore-wa-3000",
    "english": "This is 3,000 yen.",
    "target": "これは さんぜんえんです。",
    "category": "Shopping"
  },
  { "id": "sanzen", "english": "3,000", "target": "さんぜん", "category": "Numbers" },
  { "id": "en", "english": "Yen", "target": "えん", "category": "Shopping" }
]
```

Output (vocabulary first, then the sentence built from it):

```json
{ "order": ["sanzen", "en", "kore-wa-3000"] }
```

## Important

- `order` must contain each input id exactly once — never drop an item, never invent an id, never
  repeat one.
- Do not wrap the response in markdown code fences, and include no text before or after the JSON.
- You are only choosing an order. Do not alter any item's content.

## Input Data ({{ITEM_COUNT}} item(s) from this lesson)

```json
{{ITEMS_JSON}}
```
