# Task: Write Sentences for These Specific Gaps

Below is a list of holes in one {{TARGET_LANGUAGE}} lesson, each one computed by counting the cards
that already exist. Write the sentences that fill them.

You are not being asked what the lesson is missing. That question has already been answered, by
arithmetic rather than impression, and the answer is the list. Write against it.

{{CARD_RULES}}

## The vocabulary rule, which is absolute

**Every word you use must already be taught**, from the approved base vocabulary below or the earlier
lessons after it. A gap you cannot fill without an untaught word is left unfilled and recorded in
`unfillable`. Reaching for a natural-sounding word the book has not introduced turns one gap into
two: the hole stays, and a card nobody can study joins it.

## The kinds of gap, and what each wants

### `neverUsed`: a word the lesson teaches and never uses

The learner has met the word as a bare gloss and has never seen it in anything longer. Write **one**
sentence putting it to work in an ordinary context. Not a definition, not a sentence about the word,
a sentence that uses it.

### `underExampled`: a function word with too few sentences showing it

A learner who meets `が` as "subject particle" can recite the card and cannot use the word. Each of
these needs enough sentences to reach {{EXAMPLES_WANTED}}, and they must be **genuinely different**:
a different slot, different vocabulary, and where the chapter allows it, at least one question.

Where the form contrasts with one the learner already knows (`は`/`が`, `に`/`で`, `へ`/`に`), a
**minimal pair** is worth more than two unrelated sentences: two sentences differing only in that
form, each with a `note` naming the contrast. These are the highest-value cards this pass produces.

### `paradigm`: a cell of a grid the lesson teaches and has not carded

Deliver a missing cell as a **sentence in a fixed frame**, not as a table row. A paradigm carded as a
list teaches the rhythm of the list; a set of sentences differing only in the inflection teaches the
transformation. Give an irregular member a `note` saying what the regular pattern would predict and
why it breaks.

## What not to do

- **Do not fill a gap twice.** One sentence per `neverUsed` entry. The count for `underExampled` is a
  target, not a minimum to beat.
- **Do not pad.** If two sentences fill a gap properly, write two and stop.
- **Vary the FRAME, not just the noun.** Three sentences that differ only in which object sits in
  one slot are a single sentence with three nouns, and they drill the frame instead of the form the
  gap is about. Move something structural between them: a different sentence pattern, a different
  subject, a different tense, or make one a question. If the only thing changing across your
  sentences is a noun, you have padded, whatever the count says.
- **Prefer a frame built from THIS chapter's grammar.** The lesson has a point, and a gap sentence is
  where the learner practises it. An earlier, simpler pattern is allowed, and is the right answer
  when the chapter's own grammar cannot carry the form, but it should be the exception rather than
  the shape of the whole set. Gap fills that nearly all reach for one earlier chapter's frame drill
  that chapter rather than this one.
- **Do not invent a gap.** Something you think is missing but that is not on the list belongs to a
  different pass. Say so in `notes` if it matters.

## The chapter these gaps come from

**Read this before writing anything. It is not background.** It is where your sentence frames come
from: its Key Sentences, its dialogue and its drill patterns are the shapes this lesson teaches, and a
gap sentence is the learner practising exactly those shapes. When the chapter already has a frame
that carries the form a gap asks for, build from it: a drill line the book prints beats one you
invent. Reach for an earlier chapter's pattern only when nothing here will carry the form, and say
so in `notes` when you do.

```
{{CHAPTER_TEXT}}
```

## Output Format

Respond with ONLY a single JSON object, no markdown fences and no prose around it:

```json
{
  "items": [
    {
      "id": "kebab-case-handle",
      "target": "the complete {{TARGET_LANGUAGE}} sentence",
      "english": "Its translation, in natural sentence-case English.",
      "category": "one of the categories below",
      "fillsGap": "the id or target of the gap this closes",
      "gapKind": "neverUsed | underExampled | paradigm",
      "note": "optional; required when this is one half of a minimal pair"
    }
  ],
  "unfillable": [
    { "gap": "でんわばんごう", "reason": "no taught word for the thing being counted" }
  ],
  "notes": "optional; anything a reviewer should know"
}
```

**A gap you cannot make sense of belongs in `unfillable` too.** The list is computed by counting, so
a malformed entry is possible: a gap whose "form" is actually a complete sentence cannot have three
sentences demonstrating it, and the honest answer is to decline it with that as the reason. Say so
rather than going quiet, because silence is the one response that stops the build.

**Every gap listed below must be closed or appear in `unfillable`.** That is checked. A gap left
silently is the failure this pass exists to prevent.

## The gaps

```json
{{GAPS_JSON}}
```

## The approved base vocabulary

```json
{{BASE_VOCABULARY}}
```

## Vocabulary from earlier lessons

{{EARLIER_VOCABULARY}}

## Category

{{CATEGORY_LIST}}

## What a card looks like

{{CARD_FACES}}
