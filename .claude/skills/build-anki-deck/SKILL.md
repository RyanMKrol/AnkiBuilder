---
name: build-anki-deck
description: Build an Anki deck from a real-life lesson, template, or custom EPUB
---

# Build an Anki Deck

This skill guides you through building a complete Anki flashcard deck for vocabulary practice.

## Getting Started

### Prerequisites

- A run directory where artifacts will be stored
- Optional: `.env` file with `ELEVENLABS_API_KEY` (see [Setup](#setup))
- Optional: an EPUB file if building from a book

### Setup

If you want to generate audio (ElevenLabs TTS), you need an API key:

1. Get an API key at https://elevenlabs.io
2. Create a `.env` file in your working directory by copying `.env.example`:
   ```sh
   cp .env.example .env
   ```
3. Add your key to `.env`:
   ```
   ELEVENLABS_API_KEY=sk_...your_key...
   ```

The CLI loads `.env` automatically — no need to export by hand. The file is gitignored and stays on your machine.

## Workflow

### Step 1: What do you want to build a deck for?

Use the `AskUserQuestion` tool to ask which source to build from, with these three options:

1. **A real-life lesson** — a list of English words/phrases you learned in an actual class, to
   organize into a course.
2. **A bundled template** (ready-made vocabulary, e.g. `travel-essentials`, `numbers`). Templates
   are language-agnostic — the target language is a build-time choice, so the *same* template can
   become a deck in any language.
3. **Your own EPUB**: path to an .epub file on your machine

Once they answer, disambiguate with follow-up questions specific to that source:

- **Template:** ask which bundled template before assembling — see the sub-question below.
- **EPUB:** first offer any **previously-worked-on books** to pick from (see below); only if they
  want a new book ask for the file path. Either way, ask which target language to prepare
  translations for.
- **Lesson:** walk through the sub-questions below before assembling anything.

- **Which book? (new or already-worked-on)** Before asking for a file path, list the EPUBs already
  worked on under this output root by calling `listBooks(outputRoot)` (`src/cli/outputPaths.js`) —
  each is `{ slug, title, epubHash, targetLanguage, epubPath }` — and offer each (labelled by
  `title`, falling back to `slug`) as an `AskUserQuestion` option, plus an explicit "a new EPUB
  (I'll give a path)" choice. Every `--epub` build keeps a copy of the source file inside the book's
  output folder (`output/epubs/<book-slug>/book.epub`), so a book that shows up here can be built
  from **without re-locating the original file**. If they pick an existing book, use the
  `--book <book-slug>` form in Step 2 (no path needed); if they choose the new-EPUB option (or there
  are no books yet), ask for the `.epub` path and use the `--epub <path>` form. If `listBooks`
  returns nothing, skip straight to asking for a path.

- **Which lesson? (select by the book's OWN table of contents — NOT a raw spine index.)** An EPUB
  "chapter number" is just the position of an internal content file, which is **not guaranteed** to
  correspond to a lesson: a lesson can span several files, and unit dividers / quizzes / front matter
  are their own files. So don't ask the user for a chapter number. Instead, **list the book's own
  lessons** and let them pick one. Run
  `anki-builder assemble --output-root output {--epub <path> | --book <slug>} --list-lessons --lang <lang>`
  (or call `listLessons(epubPath)` in `src/corpus/epubLessons.js` directly) — each entry is
  `{ number, label, type, firstChapterNumber, lastChapterNumber }`, where `type` is
  `lesson`/`unit`/`quiz`/`front-matter`/`other` and the range is the span of spine files that lesson
  covers. Offer the `lesson`-typed entries as `AskUserQuestion` options (label by `label`), and pass
  the chosen one's `label` (or its `[number]`) to `assemble --lesson` in Step 2 — assemble resolves it
  to the right file range and extracts them all as one unit. Only fall back to
  `--chapter-number <spine index>` if the book has **no** navigation document (`--list-lessons` says
  so and returns nothing) — then you must pick spine indices by inspection.

- **Which template?** List the available templates by calling `listTemplates()`
  (`src/corpus/templates.js`) and offer each as an `AskUserQuestion` option — describe it by its
  *vocabulary* (the English terms and categories it covers), read from `templates/<name>.json`.
  Templates no longer carry a target language, so **don't** describe them by language — every
  template works for any language. If only one option exists, `AskUserQuestion` still needs a second
  option, so pair it with a "None of these fit" choice. If they pick that (or "Other"), see
  **Creating a new reusable template** below.
- **Which target language?** Because templates are language-agnostic, once a template is chosen you
  must ask which language to build the deck in (e.g. Spanish, `es`, Japanese, `ja`). This value is
  the `--lang` you pass to `assemble` in Step 2 — `assemble --template` now *requires* it and errors
  without it. Use an ISO 639-1 code where you can (`es`, `ja`, `fr`) so the audio stage's default
  voice lookup and ElevenLabs `language_code` resolve; a full name still works but is a weaker hint.

#### Creating a new reusable template

Template *creation* is orthogonal to deck *building*: a template is just reusable English vocabulary
+ categories, with no language baked in. When the user wants a new **reusable** template added to the
bundle (not a one-off word list — that's the **Lesson** or **EPUB** path instead), treat it as its
own small flow that completes *before* you return to the deck build:

1. **Confirm it's really a reusable template**, not a one-off deck. If they just want e.g. a numbers
   deck once, redirect to the **Lesson** path (dictate the words) — don't add a template.
2. **Gather the vocabulary, language-agnostically.** Ask for the English terms (dictated or pasted).
   **Do not ask what language it's for** — that's chosen later at build time. Group each term under a
   category from the enum in `src/model/categories.js` (`category` is validated against that fixed
   list — an unknown category fails schema validation; use `"Other"` if nothing fits).
3. **Author the files** (this is a codebase change, so do it on a branch per the repo conventions):
   - `templates/<name>.json` — `{ "meta": { "sourceType": "template" }, "items": [ { "id", "english",
     "category" }, ... ] }`. **No `targetLanguage`** in meta. `id`s are short kebab/snake handles
     unique within the file (e.g. `num_one`); `target`/`notes` are omitted (backfilled to `null` on
     load).
   - Register it in `AVAILABLE_TEMPLATES` in `src/corpus/templates.js` (`"<name>": "<name>.json"`).
   - Add a `test/corpus/templates.test.js` case (or extend the "every bundled template validates"
     loop) so the new template is schema-checked.
4. **Review the template with the user** before moving on — inspect the item list and confirm the
   terms and categories look right (a quick corpus-style review; you can `assemble --template <name>
   --lang <lang>` into a scratch run dir and open it in the dashboard (`npm run serve`) for the same
   corpus review the deck flow uses).
5. **Then hand off to the deck build**: with the new template committed and reviewed, proceed into
   Step 2 exactly as for any bundled template — ask the **Which target language?** question above and
   run `assemble --template <name> --lang <lang>`.

- **Which course?** List existing courses by reading `output/courses/*/course.json` (each is
  `{ name, targetLanguage }`, keyed by the folder name — `listCourses(outputRoot)` in
  `src/cli/outputPaths.js` if you'd rather call it directly than read files by hand) and offer them
  as `AskUserQuestion` options, plus an explicit "start a new course" option. For a new course, ask
  its name (e.g. "Intensive Japanese 1") and target language.
- **Which lesson number?** Suggest the next free one (`nextLessonNumber(outputRoot, courseSlug)` —
  one past the highest lesson number already assembled for this course, or `1` for a brand-new
  course) and let them confirm or override it. Also ask if they want a custom sub-deck label
  (defaults to `"Lesson <N>"` if they don't say).
- **The word list itself.** Ask them to paste or dictate the English terms from the lesson, one
  per line. Write what they give you to a plain text file (e.g. `<scratchpad>/lesson-words.txt`,
  one phrase per line, blank lines are fine — they're skipped) — `assemble --words` reads from a
  file, not inline text, so this file is how their dictated list gets in.

### Step 2: Build the lesson — `assemble`, which runs the whole pre-review pipeline

Once the source is decided, one command builds the lesson all the way to its first review gate:

```sh
anki-builder assemble ...        # chains straight into `prepare`
```

`assemble` writes `corpus.json` and then **automatically chains into the `prepare` stage** —
translate → fill-in-the-blank enrichment → semantic de-dup → cross-lesson notes — under a single
build claim. There is **no stopping point in the middle**, by design: every one of those steps
changes which cards exist or what they say, so a lesson that halts partway through them is a
half-built lesson with nothing anyone can meaningfully sign off on.

**Do not report a lesson to the user until `assemble` has returned.** Its last line is
`prepare: <runDir> is ready for the corpus review` — that, not `wrote corpus with N item(s)`, is the
point at which you hand over. If you only need the corpus (rare — a debugging run), pass
`--no-prepare` and say plainly that the lesson isn't reviewable yet.

If a build did stop partway (a crash, an interrupted session), **re-run the same `assemble` command**.
It reuses the existing `corpus.json` and picks up the remaining `prepare` steps; each step records
that it ran (`cards.meta.enriched`, `cards.meta.notesEnhanced`) so nothing is redone or re-charged.
The dashboard lists such a lesson under **Not finished**, never under In review.

**For a template**, pass `--output-root output` so the deck is filed under the organized
`output/templates/<templateName>/<lang>/` tree (one folder per language). Templates are
language-agnostic, so `--lang` is **required** here (it's the target language gathered in Step 1):

```sh
anki-builder assemble --output-root output --template <templateName> --lang <lang>
```

This prints `resolved run directory: output/templates/<templateName>/<lang>` — **capture that path**
as the `<runDir>` for every later `translate`/`audio`/`deck` call (and for the dashboard), exactly
like the lesson/EPUB forms below. Re-running `assemble` for the same template+language reuses that
folder. There's no book-level merge for a template (only one unit per language), so the Step 5
`deck --run <runDir>` output is already the final artifact — skip Step 6. (A one-off ad hoc build can
still use a plain `--run <anyDir>` instead of `--output-root`.)

**For a manual `--chapter` source** (no identity to organize by), pick any run directory and pass it
directly with `--run <runDir>` (also requires `--lang`).

**For a real-life lesson**, pass `--output-root` (same idea as an EPUB below) along with the
course/lesson details gathered in Step 1:

```sh
anki-builder assemble --output-root output --words <wordsFile> \
  --course "Intensive Japanese 1" --lesson-number <N> --lang <lang> \
  [--lesson-label "Lesson <N>: <topic>"]
```

**A `--lesson-number` the course has already used is refused**, with the next free number in the
error. `nextLessonNumber` only ever *suggests* a number, so two lessons prepared at the same time are
both told "next is N" and would otherwise both build as "Lesson N" and merge into the deck as
duplicate sub-decks. Pass `--force` if you genuinely mean to build over an existing lesson.

This resolves (or creates) `output/courses/<course-slug>/lesson-<seq>/` — every item's `target` stays
`null` here (there's no bilingual source text to translate from, unlike an EPUB chapter), so
`translate` fills it in fresh just like it does for a template. Category assignment for each word
is a quick automated pass — check it during the corpus review below same as any other source.

**For an EPUB**, pass `--output-root` instead of `--run` and let `assemble` resolve the run
directory itself — this keeps every chapter of the same book organized together under one
book-level folder (see [Output layout](../../../README.md#output-layout) in the README). This also
copies the source `.epub` into that book folder (`output/epubs/<book-slug>/book.epub`) and writes a
`book.json` marker, so the book becomes something you can pick again later:

```sh
# Prefer selecting the book's OWN lesson (from Step 1's --list-lessons) — assemble resolves it
# to the right span of spine files, however many, and extracts them together:
# A new book (first time) — give the file path:
anki-builder assemble --output-root output --epub <path> --lesson "<label or number>" --lang <lang>
# A book already worked on (chosen via listBooks in Step 1) — pick it by slug, no path:
anki-builder assemble --output-root output --book <book-slug> --lesson "<label or number>" --lang <lang>
# Fallback ONLY for a book with no table of contents: address a single spine file directly.
anki-builder assemble --output-root output --epub <path> --chapter-number <N> --lang <lang>
```

`--lesson` takes a `[number]` from `--list-lessons` or a label substring (e.g. `"Lesson 3"`); it
resolves to the lesson's spine-file range via the book's navigation document and extracts the whole
range as one unit, so a lesson that spans multiple files isn't under-covered. `--book <book-slug>`
reads the copy the book folder kept (falling back to the local-library copy for
a book worked on before this copy existed), so you never have to re-find the original file for a
later lesson. All forms print `resolved run directory: output/courses/<course-slug>/lesson-<seq>`
or `output/epubs/<book-slug>/chapter-<seq>`. **Capture that path** — it's the `<runDir>` to reuse for
every subsequent
`translate`/`audio`/`deck` call (all of those commands still take a plain
`--run <runDir>`; only `assemble` knows how to resolve one from `--output-root`, and the dashboard
finds runs under `output/` itself). Re-running
`assemble --output-root` for the same lesson-of-course or chapter-of-book reuses its existing
folder rather than allocating a new one.

The result is `corpus.json` in the run directory, containing:
- English phrases (the terms to memorize)
- Categories (Greetings, Food, etc.)
- Optional translations or hints from the source

**Every English gloss reads as natural sentence-case English — capitalized, never a lowercased clip.**
Each card's `english` starts with a capital letter (sentence case, *not* Title Case): a single common
noun is `Bag` / `Water` / `Green tea`, a phrase is `Nice to meet you`, a full sentence is punctuated
(`Is this a pen?`, `This is my pen.`). This holds no matter how the source arrived — when you author a
word list from a dictated/pasted lesson (the `--words` path), capitalize each gloss *as you write the
words file*, since `assemble` stores the English verbatim and later stages never re-case it. Proper
nouns keep their own casing (`UK`, `French Person`); items opening with a digit or symbol keep it and
capitalize the first letter (`5 AM`, `9 PM`). Match the existing lessons in the same course/book so the
deck reads consistently — a lowercase `bag` next to `Good morning` looks wrong.

The items in `corpus.json` are **already pedagogically sorted** — as the last step of `assemble`, a
dependency-aware LLM pass (`sortItemsPedagogically`, Sonnet-medium) re-orders them for learning flow
so a learner meets vocabulary before the sentences built from it (atoms → molecules), rather than raw
textbook order (which often prints a Key Sentence before the words inside it). This is on by default
for every source; pass `--no-sort` to `assemble` to keep the raw extracted order instead. It's purely
a re-ordering (never adds/drops/rewrites a card) and fails open. The order you see in the corpus
review below **is** the study order the deck will use, so the review is your chance to sanity-check the
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
the **whole interleaved block as one run** and shuffle it as a unit. Keep `corpus.json` and `cards.json`
in the same jumbled sequence so the reviews and deck stay aligned.

**Every review stage reflects this one pedagogical order.** The sort runs once, at assemble, and the
order flows straight through: `translate` and `audio` preserve the item order, so the corpus,
translate, and audio review artifacts all present the cards in the same pedagogical sequence, and the
deck's study order matches it. There's no per-stage re-sort — fix the order once (in `corpus.json`,
or by telling me) and every downstream stage and review inherits it. When you hand-edit the order (or
I split/add/reorder rows), keep `corpus.json` and `cards.json` in the same sequence so the reviews and
the deck stay aligned.

**Japanese (and other space-free scripts) render without editorial spaces, and cards never end in 。.**
A textbook writes Japanese with word-separation spaces (a beginner aid) and terminal `。` periods, but
the deck face, reading, and reviews strip both — `normalizeDisplayText` in `src/model/scriptSpacing.js`,
applied at assemble + translate. So `これは ワインです。` is stored/shown as `これはワインです`. The `。` is
**audio-only** — the displayed face/reading never carries one. The terminal `。` steadies ElevenLabs'
prosody, so **the with-dot take is the DEFAULT audio** (the only clip generated up front, via
`src/audio/altAudio.js`); the dot-less take and every other variant are generated on demand in the
dashboard's audio review. (Romaji keeps its own punctuation.)

**Audio review happens in the dashboard.** Open a lesson's own Review view (`/review/:type/:id/:unit`)
— a lesson edits once IT reaches the audio stage, independent of its siblings' stages. Each card plays
its default clip inline, and per card you can:

- **Replace** — upload a hand-made clip.
- **Generate** — synthesize the card's variant takes FRESH via ElevenLabs and audition them in a
  modal, then **Use this** to pick one. The variants are the Cartesian product of three with/without
  **audio-only** axes (the displayed `target`/`reading` keeps its punctuation; these only change what's
  spoken):
  - **Dot** — with vs without a trailing `。` (every card; the `。` adds a terminal pause and is the
    default take).
  - **Comma** — with vs without a mid-sentence `、` (any card containing one; e.g. じゃ、また).
  - **Brackets** — full vs short spoken form for a card with an optional bracketed part
    (`おつかれさま（でした）`). (English-only parentheticals like `goodbye (formal)` are a display variant,
    not audio.)

  So a card offers **minimum 2** takes (just dot, plain card) up to **8** (dot × comma × brackets).
- **Generate (kanji)** — Japanese only. Converts the card's kana reading into natural kanji+kana
  orthography (which ElevenLabs voices more naturally than all-kana) and synthesizes takes from THAT
  text; the modal shows the produced kanji so you can sanity-check the reading before picking.

Picking a take writes the card's `audio` and auto-rebuilds `deck.apkg`. There's no ◆/★-marked HTML
artifact any more — the dashboard IS the audio-review surface, and the currently-selected clip is
simply the one playing inline on the card. The variant axes are codified in `src/audio/variants.js`;
the on-demand generators are `src/audio/generateVariants.js` and `src/audio/generateKanjiVariants.js`.

**Numbers carry a spoken `reading`.** When a `target` contains a numeral (a price, floor, count —
e.g. `2,000えん`, `５かい`), the item also gets a `reading` field with the number spelled out in the
target language's own script (`にせんえん`, `ごかい`). The digits stay in `target` for a natural card
face, but the spelled-out `reading` is what drives the romaji pronunciation AND the audio — because
digits break both (kuroshiro renders `2,000えん` as `2 , 000 en`, and ElevenLabs may read it in
English). The `reading` drives the **Pronunciation** you see in the Corpus review, so a wrong counter
shows up as wrong romaji there — if a number's pronunciation looks off, tell me and I'll fix the
`reading`.

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

**Never put a question and its answer on the same card — split them into two.** A single card that
holds both a question and its answer (e.g. `プレゼンはいつですか。きょうのさんじからです` / "When is the
presentation? It's at 3:00 today.") reviews awkwardly — flashcards are one prompt → one response. When
generation produces a combined Q&A line, split it into **two separate items**: a question card and an
answer card, each with its own `target`/`reading`/`english`/`pronunciation` and its own audio (the
Japanese splits on the internal `。`, the English on the `?`). Keep both marked `fillInBlank` when they
came from a drill. This holds for any source, not just FIB.

**Review gate — in the dashboard, never a terminal table.** Start the dashboard once and leave it
running for the whole build:

```sh
npm run serve   # then open the printed http://localhost:… URL (Ctrl+C to stop)
```

**A lesson that hasn't been through every pre-review pass can't be reviewed — the dashboard enforces
it.** You won't see a **Mark reviewed** button on a lesson whose drill, de-dup or cross-lesson-note
pass hasn't recorded a complete run; it says what's still to run and sits under **Not finished**
instead. So you never have to verify the pipeline ran by hand, and I can't hand you a half-built
lesson that looks final. If you land on that message, `anki-builder prepare --run <dir>` finishes it.
(A template is exempt — it has no drills to mine and no sibling lessons, so those passes correctly
never run.) The same applies at the second gate: a lesson that hasn't passed the corpus review can't
be marked done, because done is what ships it into the deck.

**Build a book's lessons in ascending order, and mark each one reviewed before assembling the next.**
A lesson's build reads what the book has already taught, from two different places: the backward-dedup
library, which is written by the dashboard's **Mark reviewed** (not by the build), and each earlier
lesson's `cards.json`, which is written by its `prepare`. So assembling Lesson 8 before Lesson 7 is
reviewed means Lesson 8's de-dup cannot see Lesson 7 at all, and every word Lesson 7 taught goes
unflagged as a repeat. Preparing Lesson 8 before Lesson 7 is even built means the drill and note passes
treat Lesson 8 as the first lesson of the book.

Neither is blocked — `assemble` and `prepare` both warn and carry on, and `prepare` deliberately leaves
its enrichment markers unset so a re-run repairs the result once the earlier lessons are there. But the
warnings are easy to scroll past, so treat the order as the rule: **finish and sign off lesson N before
you assemble lesson N+1.** Never build two lessons of one book at the same time; they are not
independent units of work.

**There are exactly TWO review gates, and a lesson only ever rests at one of them:**

| Gate                        | What you check                                     | Sign-off        |
| --------------------------- | -------------------------------------------------- | --------------- |
| **1 — Corpus** (Step 3)     | English + target + pronunciation, on the final cards | **Mark reviewed** |
| **2 — Audio** (Step 4)      | Every card's clip                                    | **Mark done**   |

That's the whole state space. A lesson is either mid-build (the dashboard says *building* or
*interrupted*, or lists it under **Not finished**), sitting at gate 1, sitting at gate 2, or done.
There is no third review, and nothing to review before translation.

**Gate 1 must see the FINAL card set.** Everything that changes which cards exist *or what they say* —
extraction, translation, fill-in-the-blank mining, the semantic de-dup pass, the cross-lesson note pass
— runs inside `assemble`/`prepare`, before the review opens, never after it. The pipeline order is:
`assemble` (→ `translate` → FIB + de-dup → cross-lesson notes) → **corpus review** → `audio` → **audio
review** → **Mark done**. A human signs off once, on the complete lesson.

**This is enforced by the CLI, not by discipline.** Those content steps used to be separate commands
and a loose `node scripts/…` invocation, which is exactly why they got skipped on lesson after lesson.
They are now one `prepare` stage that `assemble` runs for you.

#### What `prepare` does, step by step

**Translation.** Each term is translated and given a pronunciation guide via `claude -p` (the local
Claude tool). Available on its own as `anki-builder translate --run <runDir>` for a re-run, but you
never need to invoke it by hand in a normal build. It:
- Reads `corpus.json`
- Generates translations and pronunciations for each phrase
- Writes `cards.json` (the translated cards, ready for audio/images)

For languages with a configured romanization library (Japanese, Mandarin, Korean, …), the
`pronunciation` (romaji/pinyin) is produced by the library **and then corrected by a Sonnet-medium
pass** (`src/translate/romanizationEval.js`): the library (kuroshiro for Japanese) is only a starting
point — it mis-splits words, mishandles the sokuon っ, and spells unfamiliar kana letter-by-letter —
so the model returns the correct romanization in place, keeping the library's when it's already right.
The fix lands directly in `pronunciation` (no flag/note). So garbled romaji should be rare now; if you
still spot one in the translate review, tell me and I'll fix that card.

**Fill-in-the-blank enrichment** (`src/cards/fillInBlank.js`, prompt in
`docs/fill-in-blank-prompt.md`). Runs for an EPUB or real-life-lesson source; skipped for a template,
which is a fixed vocabulary list with no drills to mine. Textbook lessons contain
fill-in-the-blank drills and practice exercises whose example lines are a rich source of natural
sentence cards. After translation, mine those patterns into extra **practice sentence cards**: resolve
each blank into a concrete, level-appropriate word drawn from **already-introduced lesson vocabulary**
(never fabricate new words or grammar the lesson hasn't taught), producing a complete sentence with
`target`/`reading`/`english`/`pronunciation`. Mark every such card `"fillInBlank": true` so it is
**clearly delineated** in the reviews (badged, tinted) and targetable by the de-dup gate.

**This runs BEFORE the corpus review, not after** — `prepare` guarantees the ordering. The FIB cards,
their notes, and the de-dup decisions are all things the human signs off on, so they must be in place
by the time the review opens. Never show a reviewer a card set that is about to change underneath
them: a lesson reviewed at 69 cards and then quietly grown to 79 has 10 cards that passed no gate, and
any audio generated for them is credits spent on unreviewed content.

**Placement — a contiguous drill block at the END of the lesson.** Append the kept FIB cards after all
of that lesson's vocabulary and textbook sentences; do **not** interleave them earlier. A drill only
ever reuses vocabulary the lesson has already introduced, so putting the whole block last keeps the
lesson's dependency order intact (vocab → textbook sentences → practice drills) and is what the
pedagogical-order check expects. Keep each split Q&A pair adjacent (question card immediately followed
by its answer card).

**Semantic de-dup** (`src/cards/semanticDedup.js`, prompt in `docs/semantic-dedup-prompt.md`) then
runs over the enriched set: it groups every card (source **and** FIB) by sentence pattern and keeps at
most ~2 examples per pattern, favouring FIB that introduce a new pattern or new vocabulary. A redundant
practice card is **excluded, not deleted** — `excluded: true` plus a `reviewNote` naming what already
covers it — so the reviewer sees each call with its reasoning at gate 1 and can restore any card with
one click. It only ever touches cards marked `fillInBlank`; source material is off limits.

Check every FIB card against the lesson's **excluded** rows too: a drill sentence must not lean on
vocabulary the reviewer has already dropped. Substitute an equivalent kept word instead (if `あした`
was excluded, build the sentence on `らいしゅう`).

The kept FIB cards are ordinary cards from here on. They go into the Step 3 corpus review alongside
every other card, badged by their `fillInBlank` flag, so the human vets the additions and your de-dup
calls at the same single gate as the rest of the lesson.

**Cross-lesson notes** (`src/cards/crossLessonNotes.js`, prompt in
`docs/cross-lesson-note-prompt.md`). Runs for every lesson of a book or course; skipped for a template,
which has no earlier lessons to reference. This is the step that turns a flat vocabulary list into a
connected knowledge base where each card knows what came before it.

It runs **one pass per lesson**, fed that lesson **plus every earlier lesson** as context, and writes
notes for the current lesson only. Cross-references are therefore **structurally backward**: the model
literally never sees a later lesson, so referencing material the learner hasn't met is impossible
rather than merely discouraged. Within a lesson, cards may reference each other freely — the constraint
is per-lesson, not per-card. It writes `note` on any card it improves and `hint` only on a card that
collides with another card's English gloss (see the collision rule above); a card it returns no `hint`
for keeps whatever hint it already had. It leaves `reviewNote` untouched and backs each file up once to
`<file>.pre-enhance.bak`.

For a one-off backfill across a whole book that's already been built, the same pass has a batch driver:

```sh
ANKI_BUILDER_TRANSLATE_EFFORT=high node scripts/enhance-card-notes.mjs --only <unit> <bookDir>
# e.g. … --only chapter-6 output/epubs/japanese-for-busy-people-book-1-kana
```

**Never run the bare `<bookDir>` form on a book with finished lessons** — it rewrites their notes and
overwrites their `.pre-enhance.bak` backups. You do NOT need this script for a new lesson; `prepare`
already ran the pass for it.

### Step 3: Gate 1 — the corpus review

Open the deck's **Review** view (the **Review**
link on the dashboard, `/review/...` — distinct from the read-only **Browse** view). Now that
`cards.json` exists the unit renders the combined **Corpus review**: columns #, **English**,
**Category**, **Target**, **Pronunciation** (romaji), **Note**, **AI-suggested**, **Uncertain**,
**Exclude** — the English you verify AND the target + pronunciation you sanity-check, together.
Target/Pronunciation are inline-editable (click a cell, edit, click away to save); AI-suggested /
Uncertain are ✓ tick columns (persisted provenance); each row has an **Exclude** checkbox and each
lesson a **Mark reviewed** button. This is the point to catch a translation with several unfamiliar
variants before it becomes a pain to organise — fix or exclude it right here (or tell me the rows and
I'll edit `cards.json`). Excluding a card writes a reversible `excluded` flag: the **`audio` stage
skips excluded cards** (no TTS spent, `audio` cleared so no player shows) AND the **deck build drops
them**. Un-excluding a card and re-running `audio` regenerates its clip.

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

**Irregular members of a counter series each earn a `note`.** Number and counter cards usually want
no note at all, but the ones that BREAK the series are the exception, because the learner has just
been taught a pattern that these violate. ひとり (hitori) and ふたり (futari) take no にん (nin) at
all; よにん (yo-nin) uses よ (yo) and not よん (yon); とお (tō) is the one general-object number with
no つ (tsu). Say what the regular pattern would predict and why this one does not follow it, and
name the counter card the exception belongs to.

**`category` is REQUIRED on every card and is SHOWN ON THE CARD FRONT.** Category is never optional —
the schema requires it, the extraction validates it against the fixed enum in `src/model/categories.js`
(fall back to `"Other"` only when nothing fits), and the dictated-lesson path auto-assigns it. The deck
build renders a small category chip on the FRONT of both templates (Recognition and Production), so a
word is always studied *with* its domain — you don't recognize/produce a word cold, out of context. A
card missing a category is a bug; if you author cards by hand, set one.

**The TEACHABILITY / CROSS-REFERENCE pass is part of `prepare` (Step 2), not an afterthought.** The
extraction runs one chapter at a time, so it can only cross-reference within that chapter — genuinely
useful comparisons that span lessons (おねがいします vs ください, the greeting time-chain, その vs それ)
have to be added by a pass that can see across lessons. It runs
automatically inside `prepare` (Sonnet; raise it with `ANKI_BUILDER_TRANSLATE_EFFORT=high`)
for **every** lesson, as part of building it — `prepare` does this for you. (Without `--only` it processes the whole
book, which is the right form for a one-off backfill but **wrong** for a new lesson: it rewrites notes
on lessons already reviewed and done, and clobbers their `.pre-enhance.bak` backups.)
It runs **one pass PER LESSON**, each fed only that lesson **plus all EARLIER lessons** as context, and
writes notes for the current lesson only — so cross-references are **structurally backward at the
CHAPTER level** (the model literally never sees later lessons, so a forward reference — clarifying a card
against something the learner hasn't met yet — is impossible, not merely discouraged). Within a lesson,
cards may reference each other freely (it's one unit the learner studies together — the constraint is
per-chapter, NOT per-card). It leaves `reviewNote` untouched and backs up each file. This is what
turns a flat vocabulary list into a connected knowledge base where each card knows what came before it.
The pass writes three kinds of note: backward cross-references (near-synonyms, register), usage/register
tips, and — highest-value — **false-friend disambiguations**: a card that reuses a form the learner
already knows but in a different role, e.g. どこ (doko) "where is it?" vs どこの (doko no) "which place's /
what make of" (それはどこのコーヒーカップですか), だれ (dare) "who" vs だれの (dare no) "whose", or a pronoun
vs a determiner (それ (sore) "that one" vs その (sono) "that ___"). These are the cards a learner silently
misreads, so a full sentence that hinges on one earns a note even though sentences usually don't. A note
must ALWAYS add something the card doesn't already show — **never restate the card.** The SAME rule applies to `hint`s: a hint must ADD a disambiguation
cue (WHEN/WHERE/WHY it's used), never restate the gloss. A note that just repeats the English gloss
("Where is the wine shop?"), a hint that echoes it (`phrased as "wine from France"`), or a field that
re-gives the reading already in Pronunciation ("First floor (read いっかい)") teaches nothing — on a
recognition card a restating hint even hands over the answer; most number/counter cards and self-evident
sentences should have NO note or hint. The extraction prompt is told not to emit these, and the enhance
pass now DELETES a note that only restates its card. (Companion one-off migrations for older decks live
alongside it: `split-front-hint.mjs` splits front hints out of the English, `romanize-card-notes.mjs`
adds readings, `jumble-number-runs.mjs` de-sequences number runs, `strip-restatement-notes.mjs` clears
notes AND hints that just echo the card — each reversible via a `.bak`.)

When it looks right, click **Mark reviewed** — that sets `cards.meta.reviewed: true` (the gate
`audio` checks — it won't spend TTS credits on an un-reviewed lesson) and, for an EPUB source, saves
the reviewed (excluded-filtered) corpus to the dedup library for later chapters' backward-dedup. Then
move straight into Step 4 in the same turn — marking reviewed IS the go-ahead.

**Nothing may be added to the lesson after this gate.** By the time you open the review, the card set
must be final: extraction, FIB mining, and de-dup all done. If you later realize a card is missing,
don't quietly append it — say so, add it, and send the reviewer back through the corpus review for the
lesson, so no card ever reaches the deck without a human having seen it in these columns.

### Step 4: Audio generation, then Gate 2 — the audio review

If you want to generate audio (pronunciation recorded by ElevenLabs TTS):

```sh
anki-builder audio --run <runDir> --voice <voiceId>
```

This:
- Requires `ELEVENLABS_API_KEY` in your environment (or `.env`)
- Reads `cards.json`
- Fetches audio from ElevenLabs (model `eleven_v3` by default — `src/audio/ttsModel.js`'s `TTS_MODEL`,
  override with `ANKI_BUILDER_TTS_MODEL`; v3 is markedly more natural than the old `eleven_multilingual_v2`
  at the same cost)
- Normalizes the spoken text per language before sending it (`src/audio/ttsText.js`): Japanese strips
  editorial spaces so ElevenLabs doesn't voice them as pauses (`target`/`reading` keep their spaces for
  display; only the audio drops them)
- Trims each clip's trailing silence + end "blip" (`src/audio/trimSilence.js`) — **best-effort, needs an
  optional system `ffmpeg`** (`brew install ffmpeg`); without it, clips just keep their trailing silence
  (one warning, then a silent no-op). Off with `ANKI_BUILDER_TRIM_AUDIO=0`. Applies to every
  clip that reaches a card — the build stage, the dashboard's Generate, and a hand-uploaded Replace alike, so an uploaded clip never sits next to generated ones with silence they had removed. A trimmed upload is stored as `.mp3`, since trimming re-encodes
- Caches audio in `.anki-builder/audio/<voiceId>/<model>/` (gitignored; **segmented by model** so a
  model switch never reuses a stale clip) so reruns are fast
- Copies audio files into the run directory
- Writes updated `cards.json` with audio file references

**⚠️ Drop the whole audio cache whenever the audio-GENERATION algorithm changes.** The cache key is
only `(voiceId, model, sha256(spoken text))` — it does **not** encode the *processing* applied to a
clip (silence-trim, normalization, the `。`/variant transforms, or anything else about HOW the clip is
produced). So a **cache hit reuses the old bytes and skips the fetch AND all post-processing** — meaning
any clip cached before an algorithm change is served **stale forever** on reuse, silently. (This bit us:
trimming lives on the fetch/miss path only, so clips cached before trimming worked kept their untrimmed
trailing blip on every reuse — audible as a click at the end, e.g. row 3 「さいふ」.) The cache isn't
valuable enough to nurse around this: when you change trimming, TTS text normalization, the model
wiring, an alt/variant transform, or any other core audio step, **delete the whole cache and let it
rebuild** — `rm -rf .anki-builder/audio` (leave `.anki-builder/epubs`, the EPUB library, alone). Regenerating costs ElevenLabs
credits but correctness wins; don't try to surgically re-process cached clips. Re-running `audio` after
the drop refetches every clip through the current pipeline. (Run-directory copies are separate — a
lesson already built keeps its clips; the drop only forces the *next* generation to refetch.)

**Default take only (per-language transform).** The `audio` stage generates exactly ONE clip per
card. For a language listed in `src/audio/altAudio.js`'s `ALT_AUDIO_TRANSFORMS` (Japanese appends a
`。`), that default is the transformed (with-`。`) take — a trailing `。` gives ElevenLabs a sentence
boundary and fixes many mis-rendered short/bare clips (lone kana, some numbers). Languages with no
transform get the plain take. Every OTHER variant — the no-`。` take, comma/bracket forms, and
kana+kanji — is generated **on demand** in the dashboard's audio review (the Generate / Generate
(kanji) buttons), not up front.

**Voice choice:** if this target language already has a configured default voice
(`src/audio/voiceLibrary.js`'s `DEFAULT_VOICES`), `--voice` can be omitted entirely — the CLI
uses the default and says so. Otherwise I'll help you pick one; available voices vary by
language. Popular choices:
- For English: `21m00Tcm4TlvDq8ikWAM` (Bella), `EXAVITQu4vr4xnSDxMaL` (Premom)
- For other languages, visit https://elevenlabs.io/voice-lab

Once you've settled on a voice for a language you'll keep using (e.g. continuing the same
book), add it to `DEFAULT_VOICES` so future chapters don't need `--voice` repeated.

If you skip audio, the deck will still work — cards just won't have pronunciation recordings.

**Review gate — the Review view's audio stage.** Open the lesson's own Review view
(`/review/:type/:id/:unit`, or its **Review** link on the home page): once that lesson is at the audio
stage it renders an inline player per card plus **Replace** / **Generate** / **Generate (kanji)**
controls **and an Exclude checkbox** (see "Audio review happens in the dashboard" above for how the
variant axes and the kana+kanji option work). A lesson edits on its own — you don't need its siblings
finished. Play each card's default clip; for any that sound wrong, **Generate** fresh takes, audition
them in the modal, and **Use this** to pick — each pick writes the card's `audio`. For a short string
ElevenLabs mishandles even with a `reading`, **Replace** with a hand-made clip (uploads are stored as
`<cardId>-user-<hash>.<ext>` and are NOT trimmed). **Exclude** drops a card straight from the audio
review — no need to go back to the Corpus review (which is meant to be one-and-done). These edit
controls only appear while the lesson is **in review** (not done). Rebuilds are **fully automatic —
there's no manual button**: while you finish an in-review lesson, edits don't rebuild the package (it
isn't in the deck yet); **Mark done** folds it in and rebuilds then.

**A DONE lesson opens read-only (a VIEW, not the review).** Once a lesson is marked done, opening it
(its home-page row, or `/review/:type/:id/:unit`) renders a **view**: inline players you can listen to,
the header reads *View* (not *Review*), and the **only** action is **Reopen**. The Exclude checkbox and
the Replace/Generate/Generate-(kanji) controls are gone — a finished lesson can't be edited in place.
**Reopen** (which removes it from the merged `.apkg`) pushes it back into the review flow, restoring all
those controls; then **Mark done** re-finalizes and rebuilds. So the edit path for a shipped lesson is
always Reopen → change → Mark done.

**Mark done — Gate 2, the final sign-off.** When a lesson's audio is finalized, click **Mark done** on that
lesson (sets `cards.meta.done`). This is the gate the book/course merge checks: `deck --book-dir` (and
the dashboard build) package **only `done` lessons**, so an un-finished lesson never ships. A done
lesson moves to the dashboard's **Built** section; **Reopen** returns it to review to tweak.

**Re-run footgun.** The `audio` CLI stage re-derives every card's default `audio` from the card text,
so **once you've picked variants / uploaded clips in the dashboard, do NOT re-run `anki-builder audio`
over the whole run** — it would overwrite those hand-picked selections (and adding even one new card
defeats the stage's `alreadyDone` skip, triggering exactly that recompute). To add audio for new or
changed cards only, generate for just those items and leave every already-selected card untouched. The
deck embeds whatever is in each card's `audio`, so that field is the source of truth for its final
take.

### Step 5: Deck Build

Once translation (and optionally audio) is complete:

```sh
anki-builder deck --run <runDir> [--name "My Deck"]
```

This:
- Reads `cards.json`
- Assembles a two-template Anki deck (question → answer format)
- Includes audio files if present
- Writes `deck.apkg` to your run directory

The `.apkg` file is a complete, importable Anki deck.

### Step 6: Build the Book/Course-Level Package (EPUB books and lesson-sourced courses only)

If you're working through an EPUB book chapter by chapter, or a course lesson by lesson (both via
`--output-root`), each unit so far has its own `cards.json`/`deck.apkg` under
`output/epubs/<book-slug>/chapter-<seq>/` or `output/courses/<course-slug>/lesson-<seq>/`. Once you've
finished Steps 2–5 for every chapter/lesson you want included, build ONE merged package for the whole
book/course:

```sh
anki-builder deck --book-dir output/epubs/<book-slug>      # an EPUB book
anki-builder deck --book-dir output/courses/<course-slug>  # a lesson-sourced course
```

This scans every `chapter-*/cards.json` AND `lesson-*/cards.json` under that folder (a given
folder only ever has one or the other) and writes a single `<that-folder>/deck.apkg` containing
all of them, each as its own real Anki sub-deck (`Book/Course Title::Chapter/Lesson Label`) nested
under one parent deck named for the book (from the EPUB library) or the course (from its
`course.json` marker). Run this once after all of that book's/course's units are individually
complete — and again any time you add or change one, since (unlike the per-unit `deck --run`
command) this always rebuilds from scratch rather than reusing a stale merge. Skip this step
entirely for template/manual decks — there's only ever one unit, so the `deck.apkg` from Step 5 is
already the final artifact.

### Step 7: Import & Verify

Open Anki:
1. File → Import → select the book/course-level `deck.apkg` (or the per-unit one, for a
   template/manual deck)
2. Review the imported cards, including the sub-deck hierarchy for a book or course
3. Test playback (audio should play if audio was generated)
4. Start studying!

If something looks wrong (missing translations, bad pronunciation, etc.), you can:
- Edit the source corpus.json / cards.json and re-run from that stage
- Re-run `anki-builder` commands to regenerate later stages
- Stages are resumable — running a stage whose output already exists reuses it

**Deliver changes to Anki with the deliver tool — don't drag-and-drop `.apkg`.** `scripts/deliver-to-anki.mjs`
(module `src/anki/deliver.js`) pushes the on-disk corpus state into the running collection over
AnkiConnect, deterministically and idempotently: it backs up every managed deck (with scheduling) + a
note-type snapshot, force-syncs the note type to the code's canonical `noteTypeSpec` (fields/templates/CSS
— the SAME definition the `.apkg` uses, exported from `src/deck/collection.js`), then updates each note's
fields **in place by GUID** (`updateNoteFields` — touches only fields, never scheduling) and adds any new
cards. Run it dry first to preview:

```sh
node scripts/deliver-to-anki.mjs --dry            # preview every managed deck (read-only)
node scripts/deliver-to-anki.mjs                  # back up, then deliver
node scripts/deliver-to-anki.mjs course:my-course # limit to one deck (type:id)
```

Or click **Deliver to Anki** on the dashboard home page (previews, confirms, then delivers). Anki must be
open with the AnkiConnect add-on. It's safe to re-run — a second run is a no-op.

**It syncs with AnkiWeb automatically** (default; `--no-sync` to skip): a `sync` before delivery (pull — so
a review done on another device merges in before the push) and a `sync` after (push local → remote). A
content-only delivery syncs incrementally with no prompt. A **schema change** (adding a field, editing a
template) is the exception: Anki forces a one-way full sync gated behind its GUI **Upload/Download**
dialog, which AnkiConnect can't answer — the tool flags `schemaChanged` and you click **Upload to AnkiWeb**
once. Schema changes are rare (only when `FIELD_NAMES`/templates/CSS change), so this is a one-off.

Notes ↔ cards map by a durable `abid:<card.id>` tag; on the FIRST run un-tagged notes are matched by the
Japanese `Target` (falling back to `English` for shared-Target pairs, then a prefix match if a gloss was
edited since import), then stamped. Anything it can't resolve uniquely (a genuine duplicate, a
too-changed card) is **reported as ambiguous and left alone — never guessed, never duplicated**.

**What it does / doesn't do:**
- **Field content** (translations, `hint`/`note`, romanized notes) and **note-type STRUCTURE** (new
  field like `Note`, template/CSS changes, the category chip, the front `hint`) → both applied in place,
  **scheduling preserved**. (Structure changes never land on a plain `.apkg` re-import — this tool is how
  they reach Anki.)
- **New cards** → added, with their audio if a clip exists on disk (generate audio in the dashboard
  first; new cards without audio are added silent and flagged in the report).
- **Card ORDER** (the jumble/reorder) → NOT delivered; new-card position can't be set in place and barely
  matters for already-studied cards. A fresh import is the only way, and it's rarely worth the scheduling
  reset.
- **Deletions** → never automatic; a note whose card left the corpus is reported as `orphaned` for you to
  remove by hand.

## Command Reference

All commands use `--run <dir>` to specify the run directory and read/write artifacts there.

### Assemble corpus
```sh
anki-builder assemble --output-root output --template travel-essentials --lang es
anki-builder assemble --run <dir> --template travel-essentials --lang es   # ad hoc, unorganized
anki-builder assemble --output-root output --epub <path> --list-lessons --lang es  # list the book's own lessons
anki-builder assemble --output-root output --epub <path> --lesson "Lesson 3" --lang es  # select a lesson (label or [number])
anki-builder assemble --output-root output --book <book-slug> --lesson 17 --lang es  # a previously-worked book
anki-builder assemble --run <dir> --epub <path> --chapter-number <N> --lang es  # low-level: the Nth spine file (no TOC)
anki-builder assemble --output-root output --epub <path> --chapter-number <N> --lang es
anki-builder assemble --output-root output --words <path> --course "Intensive Japanese 1" \
  --lesson-number <N> --lang ja [--lesson-label "Lesson <N>: <topic>"]
```

### Prepare (everything between assemble and the first review)
```sh
anki-builder prepare --run <dir>
```
Translate → fill-in-the-blank enrichment → semantic de-dup → cross-lesson notes, under one build
claim. **`assemble` runs this for you** — invoke it directly only to finish a lesson whose build was
interrupted, or after an `assemble --no-prepare`. Idempotent: each step records that it ran, and a
lesson already marked reviewed is left completely alone. On failure it deliberately keeps its claim,
so a crash shows up as *interrupted* rather than looking finished.

### Translate (one step of `prepare`)
```sh
anki-builder translate --run <dir>
anki-builder translate --run <dir> --simple-script   # constrain the target to the language's beginner script
```
`--simple-script` asks the language plug-in (`src/translate/targetScript.js`) to constrain the
generated `target` to that language's beginner/learner script — for Japanese that means **kana only,
no kanji**. It's language-agnostic: a language with no such rule configured ignores the flag. Use it
for a beginner dictated-lesson deck where the learner reads the simpler script.

### Generate audio
```sh
anki-builder audio --run <dir> --voice 21m00Tcm4TlvDq8ikWAM
```

### Build deck
```sh
anki-builder deck --run <dir> --name "Travel Spanish"
```

### Build book/course-level deck
```sh
anki-builder deck --book-dir output/epubs/<book-slug>       # an EPUB book
anki-builder deck --book-dir output/courses/<course-slug>   # a lesson-sourced course
```
Merges every `chapter-*/cards.json` or `lesson-*/cards.json` under the folder into one
`deck.apkg`, one Anki sub-deck per chapter/lesson. Always rebuilds from scratch. EPUB books and
lesson-sourced courses only — nothing to merge for a template/manual deck.

### Restyle a deck's font
```sh
anki-builder restyle-font --apkg <path.apkg> --lang ja [--out <path.apkg>]
```
Embeds the language's configured font (`src/deck/fontLibrary.js`; Japanese → **Klee One**, a
Kyōkashō/textbook face) into an existing `.apkg` and points every note type at it, so kana/kanji
render the same on every client. Works on any classic `.apkg`, including third-party decks (e.g. a
downloaded Tofugu deck). Idempotent; `--out` defaults to the input path with the font name appended.
The embedded `@font-face` is scoped to the target script via `unicode-range`, so it renders **only**
the target-language text (kana/kanji) — English mnemonics, romaji, and numbers stay in a Latin font.

Add **`--fresh-notetype`** when you'll import into a collection that already has this deck's note
type: Anki keeps your *existing* note type's styling on a same-id re-import (so the font silently
won't apply), whereas a fresh note type (new id + name suffixed with the font) always imports clean.
Use it when re-importing a restyled version of a deck you've had before; skip it for a genuinely new
deck.

### Review a run (corpus, then audio)
Review happens in the dashboard's **Review** view, not a CLI command:
```sh
npm run serve   # open the printed URL → a deck's "Review" link (/review/...) → the stage's review UI
```
Two gates, and a lesson badges as whichever it's sitting at: **`corpus`** shows English + target +
pronunciation together, signed off with **Mark reviewed**; **`audio`** adds players + generate/pick,
signed off with **Mark done**. A lesson whose build stopped before it had any cards badges
**`incomplete`** and is listed under **Not finished**, not under In review — it renders read-only with
the command that completes it. The read-only **Browse** link, `/deck/...`, is for looking at a finished
deck.

### Browse a built deck (`.apkg`) as an artifact
```sh
anki-builder view-deck --apkg <path/to/deck.apkg> [--out <file.html>]
```
Reads a finished `.apkg` back and writes a **read-only deck-browser** HTML page in the same editorial
format as the audio review — every card grouped by its sub-deck, fields laid out for scanning, and the
deck's own audio clip embedded inline per card (one player each, the take that's actually in the deck).
Each sub-deck is a **collapsible `<details>` section, collapsed by default** (its summary shows the
lesson name, card count, and global row range), plus **Expand all / Collapse all** controls — so you
can work through the deck one lesson at a time. Publish the output as a Claude Artifact. It reads the legacy `collection.anki2`/`collection.anki21`
format a deck built here uses (modern zstd `collection.anki21b` exports are not supported). A large
deck is split into numbered parts (`<out>-part1.html`, …) so no page exceeds the Artifact size limit;
card numbering runs continuously across the parts. Use this to review or re-read a whole deck at a
glance without importing it into Anki.

### Browse decks in the local dashboard (no size cap)
```sh
npm run serve                                  # convenience wrapper, from the repo root
npm run serve -- --port 5000                   # …with a different port
anki-builder serve [--output-root output] [--port 4321]   # the underlying command
```
Starts a small local web app (Node builtins, no external deps) and prints a `http://localhost:<port>`
URL. The home page lists **every built deck** discovered under `output/` — grouped into Books,
Courses, and Templates — and clicking one opens a deck page with the **same editorial style as the
`view-deck` artifact**: collapsible per-lesson `<details>` sections (collapsed by default) with a card
table and an inline audio player each. Unlike the `view-deck` artifact, the dashboard **serves audio
over HTTP** rather than inlining it as base64, so a whole deck browses on **one page with no ~16 MB
size cap** (no part-splitting). This is the preferred way to browse a large deck; `view-deck` remains
for producing a self-contained shareable artifact. It serves from the build folders, so it always
reflects the current `cards.json`/audio; stop it with Ctrl+C.

**Edit a card's audio + rebuild, from the dashboard (2–3 clicks).** By default the dashboard is
**editable** — each card row has **Replace** and **Generate** controls, and the header has a **Rebuild
deck** button:
- **Replace** — pick a local audio file; it's stored in the deck's `audio/` under a server-generated
  name and set as that card's `audio` (validated), and the row's player updates in place.
- **Generate** — calls **ElevenLabs** to synthesize the card's usual variant takes (the dot × comma ×
  brackets Cartesian, codified in `src/audio/variants.js`) and shows them in a modal to audition;
  **Use this** applies one. Every click makes **fresh** calls (ElevenLabs is non-deterministic, so this
  is how you re-roll a take that sounds wrong) — it does **not** reuse cached clips, and the fresh
  clips are written under distinct `…-gen-<hash>.mp3` names so they never overwrite the deck's built
  audio. Requires `ELEVENLABS_API_KEY` (the server loads `.env` on start); pick the voice with
  `--voice` if the language has no default. Costs credits on every click (one call per variant, up to
  8) and doesn't touch `cards.json` until you pick.
  These edit controls (Replace/Generate/Exclude) only appear on an **in-review** lesson — a **done**
  lesson is view-only (see the audio-review section above), so you **Reopen** it first to edit.
- **Rebuild (automatic, no button)** — there is **one `.apkg` per group** (the book/course merge of
  done lessons, or a template's own deck); rebuilds always target it (never a per-lesson file), **using
  the exact same assembly as `deck --book-dir`/`deck --run`** (shared `src/deck/rebuild.js`). It's
  **fully automatic**: **Mark done** / **Reopen** rebuild the group — so the on-disk
  `output/<…>/deck.apkg` always tracks the done-set with no manual step. There is **no download
  button** — the server is local, so just import the on-disk `.apkg` into Anki (stable note GUIDs →
  updates in place).

So a spot-check is just: **Reopen** a done lesson → Replace/Generate/Exclude on its row → **Mark done**
(rebuilds the group) → import the on-disk `.apkg`. Start with **`serve --read-only`** to disable all of this (the edit controls
disappear and the write routes 403). Edits write straight to `cards.json` + `audio/`; the previous
clip is left on disk.

**Extending the dashboard for a new deck format (required pipeline step).** The dashboard ingests each
deck layout through a **format adapter** in `src/server/adapters/` (`book.js`, `course.js`,
`template.js`), registered in `src/server/adapters/index.js`. Each adapter implements
`listDecks` / `loadDeck` / `resolveMedia`. **If a new on-disk deck format/layout is ever introduced**
(a new folder shape under `output/`, or a fundamentally different deck source), **add a new adapter
module for it and register it** — that one change is what makes the dashboard ingest the new type.
Treat this as part of shipping any new deck format, alongside the assemble/build changes.

## Environment Variables

Set in `.env` or export to your shell:

- `ELEVENLABS_API_KEY` (required for audio): Your ElevenLabs API key

No env var needed for local state — it always lives in `.anki-builder/` inside this repo
(gitignored), nothing to configure.

## State & Artifacts

Each chapter's own artifacts live in its run directory (`--run <dir>`, or the directory
`assemble --output-root` resolved for you):

- `corpus.json` — assembled from template or EPUB
- `cards.json` — translated and enriched corpus
- `audio/` — generated audio files (if audio stage ran)
- `deck.apkg` — this chapter's own Anki deck (for template/manual sources, this is the final
  artifact; for an EPUB book, it's superseded by the book-level merge below)

Review is done live in the dashboard (`serve`), which reads these files directly — there are no
per-stage `review-*.html` artifacts any more.

Under `--output-root`, each source type nests under its own reserved segment of `output/`
(`epubs/`, `courses/`, `templates/`). For an EPUB book, chapters nest under one book folder beneath
`epubs/`, with a single merged package at the book root:

```
output/epubs/<book-slug>/
  book.epub               # copy of the source EPUB, kept so `--book <slug>` can build later chapters
  book.json               # { title, slug, epubHash, targetLanguage } — powers listBooks discovery
  chapter-0/corpus.json, cards.json, audio/, review-*.html, deck.apkg
  chapter-1/...
  deck.apkg              # built by `deck --book-dir output/epubs/<book-slug>` (Step 6)
```

A lesson-sourced course assembled via `--words --output-root` mirrors this exact shape under
`courses/` — `courses/<course-slug>/lesson-<seq>/` instead of `epubs/<book-slug>/chapter-<seq>/`:

```
output/courses/<course-slug>/
  course.json             # { name, targetLanguage } — written on first use of this course
  lesson-0/corpus.json, cards.json, audio/, review-*.html, deck.apkg
  lesson-1/...
  deck.apkg               # built by `deck --book-dir output/courses/<course-slug>` (Step 6)
```

A template deck assembled via `--output-root` lands under the reserved `templates/` segment, keyed
by template name then language — one unit per language, so its `deck.apkg` is the final artifact (no
book-level merge, no Step 6):

```
output/templates/<template-name>/<language>/
  corpus.json, cards.json, audio/, review-*.html, deck.apkg
```

Audio is cached in `.anki-builder/audio/<voiceId>/` so reruns don't regenerate the same audio. The
cache key ignores *how* a clip was processed, so **drop the whole cache (`rm -rf .anki-builder/audio`)
whenever the audio-generation algorithm changes** — see the ⚠️ note under Step 4 (Audio Generation).

## Troubleshooting

**"corpus.json already exists — reusing"**  
Not an error — assemble found an existing corpus, skipped re-extracting it, and carried on into
`prepare`. That's how re-running the same `assemble` command resumes a lesson whose build stopped
partway. To genuinely start fresh:
```sh
rm <runDir>/corpus.json <runDir>/cards.json
anki-builder assemble --run <dir> ...
```

**A lesson shows as "incomplete" / sits under "Not finished" in the dashboard**  
Its build stopped before it had any cards — corpus.json exists, cards.json doesn't. Re-run the same
`anki-builder assemble` command for that lesson, or `anki-builder prepare --run <runDir>` directly.
Nothing already done is redone.

**"ELEVENLABS_API_KEY not set"**  
Ensure `.env` is copied from `.env.example` and contains your key, or export it:
```sh
export ELEVENLABS_API_KEY=sk_...
```

**Translation/audio failed**  
Check the error message — it usually names the stage that failed. Re-run that stage after fixing the input (e.g., edit `corpus.json` if assemble failed). Stages are resumable.

**Anki import failed**  
Ensure the `.apkg` file exists and is not corrupted. Check that the run directory path is correct.

## Learn More

- [README.md](../../../README.md) — project overview
- `.env.example` — environment variable reference
- ElevenLabs docs: https://elevenlabs.io/docs
- Anki docs: https://docs.ankiweb.net/
