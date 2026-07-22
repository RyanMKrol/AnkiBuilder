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
6. **Jumble a run of sequential numbers (the one deliberate reshuffle).** If several items teach a
   sequence of numbers or counters in ascending order — e.g. 1, 2, 3, 4, 5; or いっぷん / にふん / さんぷん
   (one/two/three minutes); or いちじ / にじ / さんじ (one/two/three o'clock) — do NOT leave them in that
   ascending order. A learner drilling numbers in order memorizes _the position_ ("what comes next"),
   not the number itself, and looks fluent until the numbers are shuffled in real life. So **shuffle the
   number items among themselves into a clearly non-sequential order** (e.g. 3, 1, 5, 2, 4). Do this
   ONLY within the run: keep the numbers **contiguous** as one block (principle 3 still applies — they
   stay the "numbers" group) and **never interleave them with the surrounding non-number cards**. If a
   section reads "dog, cat, horse, 1, 2, 3, 4, 5", leave dog/cat/horse exactly where they are and jumble
   only the 1–5 among their own five positions. This is the single case where you reorder items with no
   dependency reason to move — everywhere else, principle 5 (don't churn) still holds. Apply it to each
   distinct number run separately (a minutes run and a separate o'clock run are each jumbled on their
   own).

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
