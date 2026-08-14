# Step 3b: The extras pass — build the lesson's drill unit (EVERY chapter, always)

This is the full operating procedure for the extras pass summarized in
[SKILL.md](../SKILL.md) Step 3b. Load it whenever you are about to build an extras unit.

**Run this for every chapter of a book (and every lesson of a course), once the base unit is DONE
(gate 2).** The audits below diff the new cards against the base unit's card set, and a gate-2
exclusion changes that set — so extras authored while the lesson is still in review are audited
against a card set that no longer exists. A textbook chapter always teaches far more than the
extraction turns into cards. Two things get lost every time:
the chapter's own spoken material (Target Dialogue, Speaking Practice, Short Dialogues), which the
extraction skips while mining the vocabulary tables dry; and any sense of *coverage*, so a lesson ends
up with forty bare nouns that appear in no sentence, a particle taught with one example, and a
conjugation chart that is carded half-way. The result reads complete and drills badly.

The extras pass fixes both. It is not optional polish, and it is not a one-off migration: treat it as
a standard step of building any chapter.

## Why it is a SEPARATE unit, not more cards in the lesson

The additions roughly double a lesson. Folding them into the base lesson makes the first encounter
with a new chapter enormous, which is exactly how a learner burns out on a deck. So the drills ship as
their own unit, a SIBLING of the lesson under a shared grouping deck:

```
Japanese for Busy People Book 1: Kana
├── Frequently Used Expressions                          ← ungrouped label: stays one level up
└── Lesson 5                                             ← grouping deck, HOLDS NO CARDS
    ├── Shopping (2): Two Bottles of That Wine, Please           ← the base lesson, unchanged size
    └── Shopping (2): Two Bottles of That Wine, Please (Extras)  ← the drill unit
```

This gives all three study modes: the lesson alone, the drills alone, or both together by clicking
the group. Anki gives every deck its own new-cards-per-day limit, so a learner can meet a chapter at
a comfortable pace and turn its drills up (or off) on their own.

**⚠️ THE RULE: a deck that HOLDS CARDS must never have children.** Anki studies a parent deck
together with every deck beneath it, so a card-holding parent can never be studied on its own. This
was first built with the drills nested under the LESSON deck (`Book::Lesson 5::Extras`), which made
Lesson 5 unstudyable without its drills — the exact opposite of why they were split out. It looked
tidier and was completely wrong, and it had to be undone after the cards were in a live collection.
Grouping decks are fine *because they hold nothing*.

`src/deck/deckPath.js` owns this: `unitDeckSegments(label)` splits a `"Lesson N: Title"` label into
`["Lesson N", "Title"]`, and a label with no such prefix stays one level up. It is called by BOTH the
`.apkg` builder and the AnkiConnect deliverer — deriving the deck name in two places is what once
delivered a unit into a differently-named deck than the package created. Any new unit type goes
through that one function too.

**The grouping depends on the label, so give a unit a `"Lesson N: Title"` label.** An EPUB's own
table of contents already does this (`"Lesson 5: Shopping (2): …"`). A **course** built from dictated
words does NOT: `--lesson-label` defaults to a bare `"Lesson 5"`, which has no title to group with, so
the lesson and its extras end up as two flat siblings instead of nesting. If a course is going to get
extras units, pass a real title — `--lesson-label "Lesson 5: Ordering Food"` — when you assemble it.
On disk a course's drill unit is `lesson-<n>-extras/`, exactly mirroring `chapter-<n>-extras/`.

**On disk** the drill unit is a sibling folder of its lesson, suffixed `-extras`:

```
output/epubs/<book-slug>/
  chapter-5/          cards.json, audio/, …     ← base lesson
  chapter-5-extras/   cards.json, audio/, …     ← its drills
```

Its `cards.meta` carries:

- `chapterNumber` — **the same number as the base lesson**, so it sorts immediately after it everywhere.
- `chapterLabel` — `"<base label> (Extras)"`. This is both the dashboard's display name and what the
  Anki deck path is derived from, so the `" (Extras)"` suffix is what keeps the two decks distinct.
  Because the base label already starts `"Lesson N: "`, the suffixed label groups under the SAME
  `"Lesson N"` deck as its lesson, which is the whole mechanism — see `unitDeckSegments` above.
- `baseChapterLabel` — the base lesson's label, recorded so the pairing is discoverable. It does not
  affect the deck name; see the warning above about never nesting.
- **NO `epubHash`.** The dedup library is keyed by `(epubHash, chapterNumber)`, so an extras unit
  carrying one would overwrite its base lesson's entry the moment it is marked reviewed, corrupting
  every later chapter's backward-dedup.

**Do NOT build `corpus.meta` by copying `cards.meta`.** They are different schemas, and the corpus one
is `additionalProperties: false`, so `baseChapterLabel` (a cards-only field) makes `corpus.json`
invalid the moment it is copied across. Every extras unit built before this was written carried it,
because copying the whole meta object is the obvious thing to do and nothing ever complained: the
corpus schema is only enforced on the `assemble` path, which a hand-authored unit never takes. Build
`corpus.meta` explicitly from the fields the corpus schema declares, and likewise keep card fields
that only exist on the cards side (`reading`, `pronunciation`, `audio*`, `aiSuggested`) out of corpus
items.

**Give every field the type the schema declares, and NEVER a `null` placeholder.** Only `note`,
`cardNote`, `reviewNote`, `hint` and `scene` accept `null`. Everything else is a plain `string`, which
means an absent value must be an ABSENT KEY — `"reading": null` fails validation. A hand-authored unit
is the one place this bites, because it skips the translate stage that would otherwise shape the
fields, and the failure surfaces late and unhelpfully: the dashboard refuses the review click with
`invalid card data after edit: Property reading in items[0] must be of type string`, naming one field
of one item, so fixing it one message at a time is a trap. Check the whole unit at once:

```sh
npm run validate:decks        # every corpus.json/cards.json under output/, against src/model
```

Run that before handing over the review link, not after the reviewer hits a wall. It is not part of
`npm run ci` because `/output` is gitignored, so CI has no deck data to check.

Everything else works unchanged: the dashboard lists it as its own reviewable unit, it has its own two
gates, and `deck --book-dir` merges it only once it is `done`.

## How to run the pass

Give **one subagent per chapter**, and run **two waves**. Wave 2 must receive wave 1's output so the
two do not collide.

**Wave 1 — what the book prints and the deck missed.** Read the chapter text and propose the
sentences and questions the book itself contains that never became a card. Prefer the book's wording
verbatim. The Target Dialogue and Speaking Practice sections are where the misses concentrate: check
them first, every time.

**Wave 2 — systematic coverage.** This wave constructs sentences, which is expected and sanctioned.
Three jobs, and let the counts decide the size:

1. **Particles.** For every particle the chapter uses, aim for at least three genuinely different
   examples (different slot, different vocabulary, at least one in question form). Where a particle
   contrasts with one already known (は/が, に/で, へ/に, を/が), write a **minimal pair**: two
   sentences differing only in the particle, each with a `note` naming the contrast. These are the
   highest-value cards the pass produces.
2. **Vocabulary.** Every content word in the chapter's vocabulary that appears in no sentence gets
   one, built only from vocabulary already introduced.
3. **Forms.** Whatever the chapter teaches (です/じゃありません/ですか, ます/ません/ました/ませんでした,
   〜から〜まで). Supply a contrast set **on fixed vocabulary** so the transformation is visible rather
   than three unrelated sentences.

Extraction of the chapter text: `extractChapterToFile(epubPath, n, dest)` in `src/corpus/epubArchive.js`.
Strip the XHTML to plain text before handing it to an agent, or it burns context on markup.

## First, look at the chapter's IMAGES (nothing records whether extraction did)

This sweep is a **required step of the BUILD** ([SKILL.md](../SKILL.md) Step 2), run while
`assemble` is still working so the finding reaches the reviewer with the gate-1 link. It is repeated
here because this is the pass that acts on it: if you arrive at an extras unit and no image sweep was
reported for the chapter, do it now before either wave.

**Find the chapter's images and LOOK at anything that isn't decoration.** The extraction pass is
given them (the images are written beside the cached chapter file, and its prompt tells it to open
each one), but nothing records what it opened or what it concluded — so a table it skipped and a
chapter that had no table produce identical output. Every stage after it (the drill miner, the note
pass) genuinely does read text only. Either way the failure looks the same: not a gap, but a chapter
that appears never to have taught the material. Publishers do this constantly for grid-shaped
content, which is exactly the content that carries a grammar paradigm.

```sh
grep -o '<img[^>]*>' <chapter>.xhtml                       # find them; alt text is usually empty
unzip -o -j <book>.epub '*<ImageName>*' -d <scratchpad>/imgs   # pull the ones near teaching prose
```

Then **read the extracted files** (the Read tool renders images) and transcribe what they teach into
the Wave 2 brief. Two cheap signals that an image is load-bearing rather than decorative: it sits
directly under an exercise or grammar heading whose text then runs out (a heading followed by nothing
is the giveaway), and it is referenced by prose that has no visible referent. Judge by position, not
by filename.

## Audit a paradigm across the WHOLE deck, cell by cell

When a chapter teaches a **paradigm** (a form that varies over a closed set of slots: present/past ×
affirmative/negative, plain/polite, a counter series, a case or gender table), do not eyeball whether
it "feels covered". Enumerate the grid, then check every cell against **every card in the book**, not
just this chapter's, because earlier lessons often fill part of it and later gaps are invisible from
inside one unit. Write the check as a script over all `chapter-*/cards.json` targets rather than
reading tables by eye; it takes a minute.

**Do not trust a bare substring match, and sanity-check the hits before you report them.** For an
adjective table it is usually safe, because `おおきくないです` appears in nothing else. For a verb
paradigm it is badly wrong: `いました` matches inside `かいました`, `ちがいます` contains `が` + `います`,
and `ありません` sits inside the copula's `じゃありません`, so a naive audit of あります/います reports
almost full coverage of a paradigm the deck barely touches. Require the form in **predicate position**
(preceded by a particle such as が, は, も, に, or the start of the string), exclude the longer forms
of the same paradigm when testing a shorter one, and then **read the matching cards** before believing
the result. If a cell's only "hit" is a word you did not expect, it is a false positive.

Report the result as a grid before authoring anything, and let the misses drive the Wave 2 forms
brief. Expect real holes: the passes that built earlier lessons never saw the paradigm as a paradigm,
so coverage tends to be lumpy (every cell for one or two words, one cell for the rest).

**Deliver the missing cells as sentences, never as table rows.** A paradigm table with a dozen entries
is a recitation list, and carding it directly produces exactly the padding this pass exists to avoid:
the learner memorises the table's rhythm instead of the transformation. Use **fixed frames**, one
sentence per cell with only the inflection changing, so the transformation is the sole variable; give
the irregular members a `note` naming what the regular pattern would predict and why it breaks; and
spend a card on any member that looks like it belongs to another class (a な-adjective that ends in
い, a noun that takes an unexpected counter), since that is where a learner silently goes wrong.

## Rules the pass must not break

Everything in [card-authoring-rules.md](card-authoring-rules.md) still applies (kana-only for a kana
deck, sentence-case English, no editorial spaces, no terminal `。`, a `reading` for any numeral, a scene
or hint on every collision, split Q&A, an answer card that is answerable alone). On top of those:

- **Only vocabulary and grammar from this chapter or an EARLIER one.** Feed each agent an index of
  every card from all previous chapters. This is the rule most likely to be broken and the most
  damaging when it is.
- **Never use a form the chapter has not reached.** An agent that reaches for past tense in Lesson 4
  because it is natural Japanese has produced a card the learner cannot study.
- **Mark every card `aiSuggested: true`** with a `reviewNote` saying which job it serves and whether
  it was lifted from the book (name the section) or constructed.
- **Do not add bare vocabulary cards, numbers, or counter recitations.** Those are already
  over-drilled. Deliver a missing word inside a sentence.
- **Vary the frame, not just the noun.** Ten sentences on one pattern with interchangeable nouns is
  padding, not practice.

## The gate that catches what the agents cannot

Each agent sees earlier chapters but **not later ones**, so a card added to Lesson 3 can duplicate one
that already exists in Lesson 8. The agents structurally cannot catch this. After merging, always run:

1. **A cross-chapter duplicate check** — run the script, don't re-derive it:

   ```sh
   node scripts/extras-duplicate-check.mjs output/epubs/<book-slug>            # report
   node scripts/extras-duplicate-check.mjs output/epubs/<book-slug> --apply   # exclude later copies
   ```

   It groups every card in the whole book by `target`, keeps the EARLIEST occurrence, and (with
   `--apply`) excludes later ones with a `reviewNote` naming the keeper. It refuses to touch
   reviewed/done units without `--force`, and it always SKIPS a duplicate that looks like a
   question: excluding a question can strand an elliptical answer whose `scene` names it, so
   resolve those by hand (excluding an answer is always safe, because a question card is
   answerable alone).

   **Run this at the end of every chapter, not only during an extras pass.** It is the same rule the
   collision audit follows, and for the same reason: a duplicate is created by a LATER lesson
   re-teaching an earlier one's word, so no single-lesson pass can see it. There is a second, sharper
   reason to catch it early. When two cards share a `target` they very often share a generated `id`
   too, and a card id becomes the Anki note guid, so the book build **refuses to package the deck at
   all** rather than collapse two cards onto one note. That refusal fires at **Mark done**, which is
   the worst moment: the corpus review has already passed, the unit is signed off, and fixing it
   means editing a finished unit. Running the check while the lesson is still at gate 1 turns the
   same problem into one tick of an Exclude box.
2. **A deck-wide collision audit** — also scripted:

   ```sh
   node scripts/extras-collision-audit.mjs output/epubs/<book-slug>
   ```

   It groups by normalized `english` and by `target` and lists every group with more than one
   distinct answer, flagging any member with no cue **on the face it actually collides on**: a
   `hint` or a `scene` for an English-gloss group, a `scene` ONLY for a target group, since a hint
   renders on the back of a Recognition card (exit 2 when any are missing). It is
   report-only: fix the collisions the pass introduced, and report pre-existing ones rather than
   inventing wording for cards the human already signed off.

   Run it at the end of every chapter, not only when an extras unit is in flight: collisions
   accumulate across lessons and no single-lesson pass can see them. Before wording a cue, check the
   two glosses actually differ, since some collisions are duplicates that want excluding instead.
   Both points are in [card-authoring-rules](card-authoring-rules.md).

## Order the unit: shuffle, then hoist its foundations

Run the script rather than hand-rolling it:

```sh
node scripts/extras-order.mjs output/epubs/<book-slug>/chapter-<n>-extras            # preview
node scripts/extras-order.mjs output/epubs/<book-slug>/chapter-<n>-extras --apply    # write
```

It applies both passes below (seeded shuffle, then hoist), keeps `corpus.json` in the same order,
defaults the seed to the unit folder name so re-runs are stable, and refuses a reviewed/done unit
without `--force`. The rationale, so you can sanity-check its output:

An extras unit must NOT ship in the order it was built. The cards come out grouped by how they were
made — each Q&A pair adjacent, each contrast set adjacent, one coverage job after another — and that
grouping is a crutch. A learner who has just seen "Is this a key?" can predict that the next card is
"Yes, it's a key" and answers from position rather than knowledge. Run two passes, in this order.

**1. Shuffle the whole unit.** This is safe *only* because of the rule enforced when the cards were
written: every elliptical answer carries a `scene` naming the question it replies to, so no card
depends on its neighbour. If that rule was skipped, fix the scenes before shuffling, not after.
**Seed the shuffle.** An unseeded one re-orders the deck on every re-run, and card order is what a
fresh `.apkg` import turns into new-card position.

**2. Hoist the unit's foundations to the front.** A card is foundational when at least **2 other
cards in the same unit contain its target verbatim**: `おしえてください` sits inside
`〜をおしえてください`, `きません` inside a full negative sentence. Meeting the atom before the
molecules is the same atoms-first principle the pedagogical sort applies at assemble. Order the
hoisted cards **shortest first**, which both puts the most atomic material first and guarantees a
substring is never introduced after a card that contains it.

Two kinds of false positive must be filtered out, or the front of the deck fills with noise:

- **Elliptical answers.** `くじからです` ("It opens at 9:00.") is a substring of several longer
  sentences but teaches nothing alone; it is a reply, not a building block. Identify these by the
  authoring rule above: their `scene` starts with "answering".
- **Fragments ending in a bare particle.** `ささきさんは` is a name plus a topic marker, so it
  prefixes every sentence about that person for a boring grammatical reason. The card is fine; it
  just isn't a foundation.

A unit with no shared atoms legitimately hoists nothing — don't force it.

Keep `corpus.json` in the SAME order as `cards.json`, or the reviews and the deck disagree.

## Run `prepare` on the unit, or the review gate stays shut

Authoring the unit's files is not the last build step. The readiness gate
(`src/cards/readiness.js`) holds every non-template unit out of review until `prepare`'s two pass
markers (`enriched`, `notesEnhanced`) are set, and a hand-authored extras unit has neither. The
dashboard will say "Not ready to review" and hide the Mark reviewed button. So after the audits and
ordering, always run:

```sh
anki-builder prepare --run output/epubs/<book-slug>/chapter-<n>-extras
```

What it does to an extras unit, concretely: the translate step no-ops (cards.json already exists and
is complete); the fill-in-the-blank miner runs with no chapter file (extras meta has no `epubHash`),
so it composes a handful of drills from the unit's own patterns, and its semantic de-dup usually
excludes most of them as repeats of ground the pass already drilled; the cross-lesson note pass adds
backward references, backing up first. None of your cards are dropped or rewritten (only
`fillInBlank`-marked cards are ever touched by the de-dup). Afterwards, re-run the duplicate check
and collision audit on the grown unit, and re-run `extras-order.mjs` with a NEW seed so any surviving
mined cards fold into the shuffle instead of sitting as a predictable block at the end.

## Reviewing and shipping it

The extras unit has no audio when created, so it lands at the **corpus stage**, which is the right
place: Target and Pronunciation are inline-editable there. Set `reviewed: true` only once the human has
actually signed it off. Then Step 4 generates audio for it exactly like any other unit, and **Mark
done** folds it into the package as its own sub-deck beside the lesson.

Build the extras unit for chapter N **before** moving on to chapter N+1, same as the base lessons.
