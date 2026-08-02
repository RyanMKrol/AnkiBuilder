# Card-authoring rules

Every rule about what a card may contain and how the card set must be shaped. These apply to every
source (EPUB chapter, dictated lesson, template) and to every pass that writes cards: the extraction,
the fill-in-the-blank miner, the cross-lesson note pass, the extras pass, and you, when you author or
edit cards by hand. The workflow spine ([SKILL.md](../SKILL.md)) states each rule once, briefly; this
file is the canonical, full statement.

## English glosses read as natural sentence-case English

**Every English gloss reads as natural sentence-case English — capitalized, never a lowercased clip.**
Each card's `english` starts with a capital letter (sentence case, *not* Title Case): a single common
noun is `Bag` / `Water` / `Green tea`, a phrase is `Nice to meet you`, a full sentence is punctuated
(`Is this a pen?`, `This is my pen.`). This holds no matter how the source arrived — when you author a
word list from a dictated/pasted lesson (the `--words` path), capitalize each gloss *as you write the
words file*, since `assemble` stores the English verbatim and later stages never re-case it. Proper
nouns keep their own casing (`UK`, `French Person`); items opening with a digit or symbol keep it and
capitalize the first letter (`5 AM`, `9 PM`). Match the existing lessons in the same course/book so the
deck reads consistently — a lowercase `bag` next to `Good morning` looks wrong.

## Display text: no editorial spaces, no terminal 。

**Japanese (and other space-free scripts) render without editorial spaces, and cards never end in 。.**
A textbook writes Japanese with word-separation spaces (a beginner aid) and terminal `。` periods, but
the deck face, reading, and reviews strip both — `normalizeDisplayText` in `src/model/scriptSpacing.js`,
applied at assemble + translate. So `これは ワインです。` is stored/shown as `これはワインです`. (Romaji
keeps its own punctuation.) The displayed face and reading never carry a `。` at all: for Japanese TTS
the audio stage appends a throwaway end marker (`。ででで`) to the *spoken* text only, and the trim cuts
it back off. See [audio-pipeline.md](audio-pipeline.md) for how that works.

## Pedagogical order, and the number-run jumble

The items in `corpus.json` are **already pedagogically sorted** — as the last step of `assemble`, a
dependency-aware LLM pass (`sortItemsPedagogically`, Sonnet-medium) re-orders them for learning flow
so a learner meets vocabulary before the sentences built from it (atoms → molecules), rather than raw
textbook order (which often prints a Key Sentence before the words inside it). This is on by default
for every source; pass `--no-sort` to `assemble` to keep the raw extracted order instead. It's purely
a re-ordering (never adds/drops/rewrites a card) and fails open. The order you see in the corpus
review **is** the study order the deck will use, so the review is your chance to sanity-check the
sequence — if a sentence still lands before its vocabulary, tell me and I'll nudge it.

**Jumble any run of sequential numbers — never leave 1, 2, 3, 4, 5… in ascending order.** When a source
teaches a sequence of numbers or counters in order (plain 1–10, `いっぷん/にふん/さんぷん` minutes,
`いちじ/にじ/さんじ` o'clock, floors, prices climbing by one, …), studying them in that order teaches the
*position* — the learner recalls "what comes next" and looks fluent until the numbers show up shuffled
in real life. So the numbers in such a run must be **shuffled into a non-sequential order**. The
pedagogical-sort pass does this automatically (principle 6 in `docs/pedagogical-sort-prompt.md`), and
you should apply it by hand whenever you author/reorder a corpus with numbers in it. Two rules keep it
tidy: **(1) jumble ONLY within the number run** — keep those cards contiguous as their own numbers block
and never interleave them with the surrounding non-number cards (a "dog, cat, horse, 1, 2, 3, 4, 5"
section keeps dog/cat/horse put and only shuffles the 1–5 among their five slots); and **(2) each
distinct run is jumbled on its own** (a minutes run and an o'clock run are shuffled separately). One
trap: a run can be **interleaved by counter type** — e.g. `1-flat, 1-long, 1-general, 2-general, 3-flat,
3-long, 3-general, 4-flat, …` (Japanese counters ～まい/～ほん/～つ taught side by side). No single counter
forms a clean contiguous 1→10 run, so a naive detector skips it and the numbers stay predictable; treat
the **whole interleaved block as one run** and shuffle it as a unit. (For an older deck built before
this rule, `scripts/jumble-number-runs.mjs` de-sequences its number runs, reversibly via a `.bak`.)

**Every review stage reflects this one pedagogical order.** The sort runs once, at assemble, and the
order flows straight through: `translate` and `audio` preserve the item order, so the corpus,
translate, and audio review surfaces all present the cards in the same pedagogical sequence, and the
deck's study order matches it. There's no per-stage re-sort — fix the order once (in `corpus.json`,
or by telling me) and every downstream stage and review inherits it. When you hand-edit the order (or
I split/add/reorder rows), keep `corpus.json` and `cards.json` in the same sequence so the reviews and
the deck stay aligned.

## Numbers carry a spoken `reading`

**Numbers carry a spoken `reading`.** When a `target` contains a numeral (a price, floor, count —
e.g. `2,000えん`, `５かい`), the item also gets a `reading` field with the number spelled out in the
target language's own script (`にせんえん`, `ごかい`). The digits stay in `target` for a natural card
face, but the spelled-out `reading` is what drives the romaji pronunciation AND the audio — because
digits break both (kuroshiro renders `2,000えん` as `2 , 000 en`, and ElevenLabs may read it in
English). The `reading` drives the **Pronunciation** you see in the Corpus review, so a wrong counter
shows up as wrong romaji there — if a number's pronunciation looks off, tell me and I'll fix the
`reading`. (The `audio` stage refuses to run while any card would send a raw numeral to the TTS
voice, so a missing `reading` surfaces before credits are spent.)

## Provenance flags: `aiSuggested` and `uncertain`

**Provenance flags are core, persisted, and shown at EVERY review stage.** Two boolean fields track
where an item came from: **`aiSuggested`** (you/the model added this item as a critical-gap suggestion,
not from the source) and **`uncertain`** (the extractor flagged it as possibly premature or already
taught). Both are first-class fields carried **all the way through the pipeline** — set at assemble,
preserved by `translate` into `cards.json` (never auto-cleared), so the record survives for auditing
over time. The dashboard **badges them at every gate** — a coloured **AI-suggested** / **Uncertain**
badge in the corpus Flags column and inline under the English gloss at the translate and audio reviews
— so a reviewer can always see, without asking, which items are AI-added or flagged. When you author
items yourself (e.g. AI suggestions on a dictated lesson), set `aiSuggested: true` on them so they're
visibly delineated. Reviewing a flagged item does **not** clear the flag; it's informational
provenance, kept indefinitely.

## Every Grammar & Function Words card needs a worked example

**Every `Grammar & Function Words` card needs a worked example somewhere in the lesson.** This is not
just a particle rule. Any card whose gloss describes a form's *function* rather than a meaning you can
picture (particles が, は, を, も, と, で, から, まで, か; copulas and polite forms like でございます;
suffixes and prefixes; conjunctions; question words) has to be met somewhere as a full sentence that
actually uses it. A bare gloss like "(polite form of です)" teaches nothing on its own: the learner can
recite the card and still have no idea what a sentence containing it looks like. So for each such card,
check the lesson for a sentence card whose `target` contains that form. If the chapter supplies one
(a Key Sentence, a dialogue line, a Speaking Practice exchange), that satisfies it, and you add nothing.
If the chapter introduces the form but demonstrates it nowhere, add the example yourself as a separate
card marked `"aiSuggested": true`, reusing vocabulary already introduced, with a `reviewNote` naming
the form it illustrates. The form's own vocabulary entry still stays the bare morpheme; the example is
an additional card, never a rewrite of the entry.

Two things make this easy to get wrong. First, chapters often DO demonstrate the form, but only inside
a section the extraction skips (the Speaking Practice dialogue is the usual culprit), so the sentence
exists in the book and simply never became a card. Look there before inventing one. Second, one example
shows the form; two show the *pattern*. Where a form generalizes (でございます works for any business
naming itself), prefer the book's own sentence plus one built from earlier vocabulary, so the learner
sees it is a slot and not a fixed phrase.

Audit an existing deck for this the same way: list every `Grammar & Function Words` card whose `target`
is a bare morpheme, and check whether any longer `target` in the deck contains it. The gaps are real
bugs, not stylistic preferences.

## Fill-in-the-blank cards and the semantic de-dup

**Fill-in-the-blank (FIB) cards must be semantically de-duped against the corpus.** When AI-generated
fill-in-the-blank practice sentences are added (marked `"fillInBlank": true`, mixed into the lesson
and clearly delineated in reviews), they are prone to **pattern overlap** — regenerating a sentence
frame the corpus already teaches, or producing many near-identical siblings (e.g. "X is from France"
vs "Y is from France", or the same shopping dialogue with the nouns swapped). Before finalizing, run a
**semantic de-dup pass** (not just exact-string): group every card — corpus **and** FIB — by its
sentence pattern, then keep **at most ~2 examples per pattern counting the corpus lines**, preferring
FIB that introduce a **new** pattern or genuinely new vocabulary/context, and **remove the rest**. A
couple of same-pattern examples is fine; many is not. Record the keep/remove decision per card (frame
+ reason), back up removed cards so any can be restored, and surface the result in the review so the
human can push back before the deck is built. This applies both to any FIB extraction going forward
**and** as a gate on FIB content already in a book.

In the pipeline this is `src/cards/semanticDedup.js` (prompt in `docs/semantic-dedup-prompt.md`),
run by `prepare` after FIB enrichment. A redundant practice card is **excluded, not deleted** —
`excluded: true` plus a `reviewNote` naming what already covers it — so the reviewer sees each call
with its reasoning at gate 1 and can restore any card with one click. It only ever touches cards
marked `fillInBlank`; source material is off limits.

Check every FIB card against the lesson's **excluded** rows too: a drill sentence must not lean on
vocabulary the reviewer has already dropped. Substitute an equivalent kept word instead (if `あした`
was excluded, build the sentence on `らいしゅう`).

**FIB placement — a contiguous drill block at the END of the lesson.** Append the kept FIB cards after
all of that lesson's vocabulary and textbook sentences; do **not** interleave them earlier. A drill only
ever reuses vocabulary the lesson has already introduced, so putting the whole block last keeps the
lesson's dependency order intact (vocab → textbook sentences → practice drills) and is what the
pedagogical-order check expects. Keep each split Q&A pair adjacent (question card immediately followed
by its answer card).

## Split every combined question-and-answer card

**Never put a question and its answer on the same card — split them into two.** A single card that
holds both a question and its answer (e.g. `プレゼンはいつですか。きょうのさんじからです` / "When is the
presentation? It's at 3:00 today.") reviews awkwardly — flashcards are one prompt → one response. When
generation produces a combined Q&A line, split it into **two separate items**: a question card and an
answer card, each with its own `target`/`reading`/`english`/`pronunciation` and its own audio (the
Japanese splits on the internal `。`, the English on the `?`). Keep both marked `fillInBlank` when they
came from a drill. This holds for any source, not just FIB.

## The three note fields: `hint`, `note`, `reviewNote`

**Three note fields — front `hint`, back `note`, internal `reviewNote`.** Each card carries three
distinct note fields (the review shows a **Hint** + **Note** + **Review note** column):

- **`hint`** — a short FRONT-of-card cue (shown small/italic under the prompt on BOTH card templates)
  that helps the learner produce/recall the answer. Its main job is **disambiguation**: when two cards
  share a `target` (e.g. しつれいします (shitsurei shimasu) = both "excuse me, entering" and "goodbye,
  formal"), the hint tells them apart. Textbook contextual parentheticals live here — "Excuse me. (said
  when entering a room)" becomes `english` "Excuse me." + `hint` "said when entering a room". Keep
  meaning-integral parentheticals like "(person)" in the `english`.
- **`note`** — BACK-of-card context shown after answering (when/how to use it, register, how it differs
  from a related card, cross-references). Renamed from the old `cardNote`.
- **`reviewNote`** — internal rationale (why `uncertain` / why `aiSuggested`), shown ONLY at the review
  gate, NEVER in the deck or viewer.

**Any `hint`/`note` that quotes non-Roman target script ALWAYS shows its romanization in brackets** —
`はじめまして (hajimemashite)`, `お (o) + かし (kashi) = おかし (okashi)` — because the learner may not
yet read the script (this is a learner-facing rule; `reviewNote` is internal and needs none).
**Back-note cross-references look BACKWARD only** — a card may compare itself to a card from the SAME or
an EARLIER lesson, never a later one the learner hasn't met (so その (sono) references それ (sore) from
an earlier lesson, not vice-versa). The extraction prompt enforces all of this
(`docs/epub-extraction-prompt.md`); apply it by hand when you author or edit a `hint`/`note`.

## Hints are mandatory on an English-gloss or target collision

**Two cards that share an English gloss MUST each carry a `hint`.** A `hint` is usually optional. It
stops being optional the moment two cards in the same DECK (not just the same lesson) can be reached
by the same English prompt with different answers. On a Production card the learner sees only the
English, so two cards reading "How many people?" are literally the same question with two different
right answers, and the only honest way to study either one is a front-of-card cue saying which is
wanted: なんにん (nan-nin) gets "the plain, everyday way to ask", なんめいさまですか (nanmeisama desu
ka) gets "what a restaurant asks a customer". Without that the learner is guessing, then failing a
card they actually knew. The same applies in reverse when one `target` carries two glosses
(すみません (sumimasen) = "Excuse me." / "I'm sorry."). Pair the hint with a `note` on the back that
explains the *relationship* (which is politer, which register, which one answers the other), because
the hint only has room to point.

The collision is easy to miss during a single-lesson build, since the two cards often live in
different chapters and neither pass ever sees both. Check for it deck-wide: group every card by its
normalized English and by its `target`, and any group with more than one distinct answer needs hints.
Common shapes in a Japanese course: a polite/plain register pair (なんにん (nan-nin) vs なんめいさま
(nanmeisama), じゃ (ja) vs では (dewa), はい (hai) vs ええ (ē)), a noun and its noun+します verb
(しごと (shigoto) "Work" vs しごとをします (shigoto o shimasu) "Work"), two particles glossed with the
same English, and a number that sounds like a word (さん (san) "3" vs さん (san) "Mr., Mrs., Ms.,
Miss"; ほん (hon) "Book" vs the ほん (hon) long-object counter).

## An answer card must be answerable alone

**An ANSWER card must be answerable alone.** Textbook drills and dialogues are question/answer pairs,
and the pipeline splits them into two cards that are then studied shuffled, weeks apart. The answer
card arrives with no memory of the question, so two things have to hold.

First, the `english` must be able to produce the whole `target`. `パーティーはごじです` glossed "It's at
5:00." cannot: the target states its topic, the English doesn't, and nothing in the prompt tells the
learner to reach for パーティーは. Gloss it "The party is at 5:00." Dropping the topic in English is
correct ONLY when the target drops it too (`にちようびです` → "It's on Sunday."). The check is
mechanical: read the English alone and ask whether it could yield that exact target.

Second, an elliptical answer card needs a `hint` naming the question it replies to — "answering where
the computer is", "answering when the presentation is". State the QUESTION, never leak the answer.
Without it "It's on Sunday." is a card with no discoverable right answer.

This is enforced where the pairs are made: `docs/fill-in-blank-prompt.md` rules 4 and 5, with `hint`
carried through by `src/cards/fillInBlank.js`, which also logs a warning naming any answer-shaped card
that came back without one. Audit an existing deck by listing cards whose English starts with a
pronoun stand-in ("It's", "That's", "They're") and checking each for a hint.

## Irregular members of a counter series each earn a `note`

**Irregular members of a counter series each earn a `note`.** Number and counter cards usually want
no note at all, but the ones that BREAK the series are the exception, because the learner has just
been taught a pattern that these violate. ひとり (hitori) and ふたり (futari) take no にん (nin) at
all; よにん (yo-nin) uses よ (yo) and not よん (yon); とお (tō) is the one general-object number with
no つ (tsu). Say what the regular pattern would predict and why this one does not follow it, and
name the counter card the exception belongs to.

## `category` is required and shown on the card front

**`category` is REQUIRED on every card and is SHOWN ON THE CARD FRONT.** Category is never optional —
the schema requires it, the extraction validates it against the fixed enum in `src/model/categories.js`
(fall back to `"Other"` only when nothing fits), and the dictated-lesson path auto-assigns it. The deck
build renders a small category chip on the FRONT of both templates (Recognition and Production), so a
word is always studied *with* its domain — you don't recognize/produce a word cold, out of context. A
card missing a category is a bug; if you author cards by hand, set one.

## The cross-lesson note pass (teachability / cross-reference)

**Cross-lesson notes** (`src/cards/crossLessonNotes.js`, prompt in
`docs/cross-lesson-note-prompt.md`) run for every lesson of a book or course; skipped for a template,
which has no earlier lessons to reference. This is the step that turns a flat vocabulary list into a
connected knowledge base where each card knows what came before it. The extraction runs one chapter at
a time, so it can only cross-reference within that chapter — genuinely useful comparisons that span
lessons (おねがいします vs ください, the greeting time-chain, その vs それ) have to be added by a pass
that can see across lessons. It runs automatically inside `prepare` (Sonnet; raise it with
`ANKI_BUILDER_TRANSLATE_EFFORT=high`) for **every** lesson, as part of building it.

It runs **one pass PER LESSON**, each fed only that lesson **plus all EARLIER lessons** as context, and
writes notes for the current lesson only — so cross-references are **structurally backward at the
CHAPTER level** (the model literally never sees later lessons, so a forward reference — clarifying a card
against something the learner hasn't met yet — is impossible, not merely discouraged). Within a lesson,
cards may reference each other freely (it's one unit the learner studies together — the constraint is
per-chapter, NOT per-card). It writes `note` on any card it improves and `hint` only on a card that
collides with another card's English gloss (see the collision rule above); a card it returns no `hint`
for keeps whatever hint it already had. It leaves `reviewNote` untouched and backs each file up once to
`<file>.pre-enhance.bak`.

The pass writes three kinds of note: backward cross-references (near-synonyms, register), usage/register
tips, and — highest-value — **false-friend disambiguations**: a card that reuses a form the learner
already knows but in a different role, e.g. どこ (doko) "where is it?" vs どこの (doko no) "which place's /
what make of" (それはどこのコーヒーカップですか), だれ (dare) "who" vs だれの (dare no) "whose", or a pronoun
vs a determiner (それ (sore) "that one" vs その (sono) "that ___"). These are the cards a learner silently
misreads, so a full sentence that hinges on one earns a note even though sentences usually don't.

For a one-off backfill across a whole book that's already been built, the same pass has a batch driver:

```sh
ANKI_BUILDER_TRANSLATE_EFFORT=high node scripts/enhance-card-notes.mjs --only <unit> <bookDir>
# e.g. … --only chapter-6 output/epubs/japanese-for-busy-people-book-1-kana
```

**Never run the bare `<bookDir>` form on a book with finished lessons** — it rewrites their notes and
overwrites their `.pre-enhance.bak` backups. You do NOT need this script for a new lesson; `prepare`
already ran the pass for it.

## Never restate the card

A note must ALWAYS add something the card doesn't already show — **never restate the card.** The SAME
rule applies to `hint`s: a hint must ADD a disambiguation cue (WHEN/WHERE/WHY it's used), never restate
the gloss. A note that just repeats the English gloss ("Where is the wine shop?"), a hint that echoes
it (`phrased as "wine from France"`), or a field that re-gives the reading already in Pronunciation
("First floor (read いっかい)") teaches nothing — on a recognition card a restating hint even hands over
the answer; most number/counter cards and self-evident sentences should have NO note or hint. The
extraction prompt is told not to emit these, and the enhance pass DELETES a note that only restates its
card. (A companion migration for older decks, `scripts/strip-restatement-notes.mjs`, clears notes and
hints that just echo the card; reversible via a `.bak`.)
