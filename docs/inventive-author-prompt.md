# Task: Write {{ALLOWANCE}} Sentences This Chapter Does Not Contain

The other roles have finished. Between them they produced {{PRIOR_COUNT}} sentences, all drawn from
what this {{TARGET_LANGUAGE}} chapter actually prints or implies. Your job is different: write
practice the book does not supply, using only what it has already taught.

**You may return at most {{ALLOWANCE}} items.** That is a hard ceiling, not a target, and it is
checked. If {{ALLOWANCE_HALF}} good sentences are all this chapter supports, return
{{ALLOWANCE_HALF}}.

## Why you are capped when the others are not

They mine. If the book prints a sentence, that is a fact about the chapter and there is no reason to
stop at any number. You invent, and an inventive role with no ceiling is exactly how a unit fills
with padding: another sentence is always possible, each one looks reasonable alone, and the unit ends
up twice the size with no more teaching in it.

## The vocabulary rule, which is absolute and matters most here

**Every word and construction must already be taught**, from the approved vocabulary below. You are
the role most likely to break this, because you are writing freely rather than copying, and a natural
sentence is exactly where an untaught word slips in. A sentence using one word the learner has not
met is not a slightly worse card, it is an unstudiable one.

If a good idea needs a word that is not on the list, drop the idea. Do not substitute a near-synonym
you have not checked.

## What is worth inventing

- **A situation the chapter's vocabulary supports and never shows.** The book teaches the words for a
  shop and only ever uses them in a list; a sentence putting them in a shop is worth having.
- **A second context for a form that only appears in one.** If every sentence using a particle is
  about the same topic, one that is not teaches that the form is a slot rather than a fixed phrase.
- **A contrast the chapter sets up and does not complete.** Where two taught words are easily
  confused, a pair of sentences differing only in them is worth more than two unrelated ones.

## What is not

- **Anything already in the list of existing sentences below.** You have them all. Reinventing one
  wastes your allowance and produces a duplicate for a reviewer to find.
- **A variation on an existing sentence with one noun swapped.** That is padding wearing a new noun.
- **A sentence that is only grammatical.** If you cannot say what a learner gets from it that they do
  not already have, it is not worth one of your {{ALLOWANCE}}.

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
      "why": "what a learner gets from this that the existing sentences do not give them",
      "note": "optional; required when this is one half of a contrast pair"
    }
  ],
  "usedAllowance": 7,
  "notes": "optional; why you returned fewer than the allowance, if you did"
}
```

`why` is required on every item. A sentence you cannot justify in one line is one you should not have
written, and writing the line is the cheapest way to find that out.

## The sentences that already exist

Every sentence the other roles produced. Do not reinvent any of them.

```json
{{EXISTING_SENTENCES}}
```

## The approved vocabulary

```json
{{BASE_VOCABULARY}}
```

## Vocabulary from earlier lessons

{{EARLIER_VOCABULARY}}

## Category

{{CATEGORY_LIST}}

## What a card looks like

{{CARD_FACES}}
