---
name: augment-anki-deck
description: Use when notes arrive covering material a deck ALREADY taught, and those cards have to be threaded back into finished lessons. Class handouts, a dictated word list, a PDF of lesson notes, or a second deck being absorbed into the first. Not for building a new lesson, which is build-anki-deck.
---

# Retrofitting notes into a deck that is already finished

`build-anki-deck` takes a source and produces units. This skill takes notes about material the deck
has ALREADY covered and threads them into units that exist, which is a different job with different
failure modes.

It happens whenever a class runs ahead of, or alongside, a book: the notes cover Lesson 6 grammar and
Lesson 3 counters, and both of those lessons were signed off months ago.

**Every card rule still lives in
[build-anki-deck/references/card-authoring-rules.md](../build-anki-deck/references/card-authoring-rules.md).**
This file does not restate any of them. What it covers is routing, and the traps, because those have
no home anywhere else.

## The shape of the work

1. Read the deck to learn what each unit teaches.
2. Route each incoming item to a destination unit, by judgement.
3. Sweep for duplicates the deck already ships.
4. Merge, stamping every card with the batch.
5. Hand over the **additions review**, not the corpus gate.
6. Audio for the approved cards, then cross-check.

Steps 2 and 3 are the work. The rest is mechanical.

## 1. Learn what each unit teaches, before routing anything

Read the full English gloss list of every base unit, not the chapter titles. The titles will tell you
Lesson 7 is "Going Places (2)"; they will not tell you the book asks by-what-means as `なんで`, never
`どうやって`, which is what actually decides where a `どうやって` card can go. Routing without this is
guessing with extra steps.

```sh
node -e 'const fs=require("fs"),p=require("path");const b="output/epubs/<slug>";
for(const d of fs.readdirSync(b).sort()){const f=p.join(b,d,"cards.json");if(!fs.existsSync(f))continue;
const c=JSON.parse(fs.readFileSync(f));if(d.includes("-extras"))continue;
console.log("##",d,c.meta.chapterLabel);console.log("  "+c.items.filter(i=>!i.excluded).map(i=>i.english).join(" · "));}'
```

## 2. Route by judgement, with one mechanical rule on top

The rule is the extras pass's own: **a card may use only vocabulary and grammar from its destination
chapter or an earlier one**. Where topical fit and prerequisite disagree, **prerequisite wins**. That
is why `しゅっしんはどこですか` belongs at Lesson 5 rather than with the other introductions: Lesson 1
teaches only the polite `どちら`.

**Do not route by counting new words.** That heuristic was tried and it produced nonsense, because a
card introducing ONE new word inside a frame the deck already teaches is the normal shape of an extras
card, not a problem to be solved. Counting flagged 60 cards as unplaceable when the true number was
zero.

Bare vocabulary has no prerequisite at all, so it can go anywhere and the only question is topical
fit. Use the card's own `category` as the signal, and check it by hand.

Where a chapter has no `-extras` sibling to receive cards, say so and pick a neighbour rather than
inventing a unit.

## 3. The duplicate sweep, which has three traps in it

**Compare on the target, and filter `excluded` on BOTH sides.** A card matching one the deck's own
reviewer excluded is not a duplicate: the deck ships neither. Not filtering overcounted by two on a
set of 236.

**Exact matching is not enough.** Normalize away `、。？！` and a leading honorific `お`/`ご` and compare
again. `じゃあまた` is the deck's own `じゃ、また` spelled differently, and exact matching missed it
entirely.

**Read the near-matches, do not act on them.** That same normalization reports `ごふん` as a duplicate
of the counter `ふん`, because it strips a `ご` that is the number five. Roughly a third of what any
duplicate sweep reports is two senses of one word rather than a duplicate.

**Record which card each duplicate duplicates, by id.** Not by string equality: two cards can be the
same expression and different strings, and a retirement step that checks "is the twin still shipping?"
by comparing targets will refuse for a reason that is not true.

## 4. Merging: four things that will bite

**Keep the card id.** The id becomes the `abid:` tag `deliver-to-anki.mjs` matches notes by, so
keeping it is the entire mechanism by which a relocated card keeps its Anki review history instead of
arriving as new with fresh scheduling. Before anything moves, check no incoming id collides with one
the destination collection already ships.

**Strip `fillInBlank`.** It means "the drill miner produced this card for THIS unit", which stops
being true the moment the card moves. `prepare` DELETES a flagged card it does not recognise as its
own, printing a line it is easy to scroll past, and the semantic de-dup only ever considers flagged
cards. The first of those silently deleted a card with real review history.

**Build `corpus.meta` explicitly, never by copying `cards.meta`.** The corpus schema is
`additionalProperties: false` and a cards-only field invalidates the file.

**Stamp every card with `addition: "<batch-id>"` as you append it.** That is what holds it out of the
deck until it is reviewed, and it is never cleared afterwards, so which retrofit a card arrived in
stays answerable for the life of the deck.

`scripts/absorb-nihongo.mjs` is a worked example of all of this, kept as a spent migration for that
reason.

## 5. Hand over the ADDITIONS review

Not the destination units' own gates. The whole point is that they keep their sign-off:
`/additions/<type>/<id>` shows the batch's cards grouped by destination deck, and nothing else.

It has the SAME two gates a lesson has, per card rather than per unit: **Approve** signs off the
content, then audio is generated, then **Mark ready** signs off the clip. A card ships only with
both. That ordering is not ceremony: the content gate is what stops TTS credits being spent on a
card that might be cut, and the audio gate is what stops a silent or mis-generated clip reaching a
deck unheard.

**Never clear `done` on a destination unit to get cards reviewed.** That was the only way before the
gate existed, and it puts hundreds of approved cards back in front of a reviewer to approve a dozen
new ones.

The dashboard's home page lists pending batches, so the work is findable.

## 6. Audio, then cross-check

A content-approved addition has no clip, and it CANNOT ship without one: `assertEveryCardHasAudio`
refuses a build or a deliver holding a silent shipping card, and preflight's `audio-files` check
catches the sneakier case where a clip is named but missing from disk.

The destination unit is still `reviewed: true`, so `anki-builder audio --run <unit>` works untouched
and regenerates only cards whose clip is missing or stale, costing exactly the new cards. Moved cards
bring their existing clips and need nothing, but they still pass the audio gate: a clip that was
right in its old deck is worth hearing once in its new context.

Then **cross-check, because every failure in this kind of work is silent.** A card the drill miner
deleted, a routing row that drifted from the card file, a duplicate whose twin had gone missing, a
unit whose model pass died on a usage limit: each looked exactly like success from the outside, and
each was found by hand. Write a pass that re-derives every claim and exits non-zero when one stops
holding. `scripts/absorption-crosscheck.mjs` is the shape to copy.

## Deliver

Unchanged, with one addition specific to this work: if cards are moving between COLLECTIONS, their
Anki notes have to be moved into the destination deck tree BEFORE delivering, or the deliver cannot
see them and adds them fresh with no review history. That is a migration, not a flag, and
[build-anki-deck/references/deliver.md](../build-anki-deck/references/deliver.md) describes its shape.
