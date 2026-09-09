---
name: onboard-epub
description: Prepare a new EPUB for deck building. Survey its structure, work out where this publisher differs from the last one, and draft the book's config for a human to review and commit. Run this once per book, before its first chapter.
---

# Onboard a new EPUB

Run this **once per book, before its first chapter is built**. It produces one artifact: a draft
`hints` block for the book's `book.json`, ready for a human to read and commit.

Nothing here spends money and nothing here writes to the library. Every step is a read.

## Why a book needs onboarding at all

Because no two publishers mark anything up the same way, and because the pipeline's own failure mode
is that an absent thing looks exactly like a working one.

`vocabCoverage` decided what a vocabulary table was by matching `class="voca"`. On the one book this
project is proven on, that is right. On any other book it returned an empty list, reported zero
uncovered headwords, and **printed clean**. Nothing was broken, nothing was logged, and the check
that existed to catch missing vocabulary was silently answering a question about a different book.

v2's answer is a split. Facts about a book that code may branch on are `invariants`, and adding one
is a reviewed change to an allow-list in `src/corpus/bookConfig.js`. Everything else this survey
learns is a **hint**: it reaches prompts as orientation and nothing branches on it, so a wrong or
missing hint costs recall, never correctness.

**That is why guessing is worse than leaving a hint unset.** A wrong hint is silent. A missing one
makes the check say *unknown*, which is a state somebody looks at.

## 1. Will this book work at all?

```sh
node scripts/epub-probe.mjs <path/to/book.epub>
```

Free and read-only. It reports the spine, the navigation document, how each nav entry classifies, the
Anki deck path each label would produce, and a flat list of warnings: label collisions, spine files
the nav never names, chapters that are almost all image and barely any text, and a size well past
anything that has been through here.

**Read the warnings before anything else.** Two of them decide whether onboarding is even the right
next step:

- **A label collision** means `--lesson "<label>"` is ambiguous and two lessons would file into one
  Anki deck. That is a blocker, not a note.
- **No navigation document** means lesson selection falls back to raw spine indices, so this book
  will be built by `--chapter-number` throughout. Worth knowing before the first build rather than
  during it.

## 2. What is this publisher's markup?

```sh
node scripts/epub-hints.mjs <path/to/book.epub>      # or an epubHash already in the library
```

Free and read-only. It samples spine files spread across the book (not the first N, because front
matter is the part least likely to look like a lesson) and prints frequency tables for the four
things a hint is about.

**It counts and it concludes nothing**, on purpose. Which class means vocabulary is a judgement, and
a script making it is how `class="voca"` got hardcoded in the first place.

## 3. Judge the evidence

This is the step that is yours. Four hints, and for each one the question is the same: is there a
signal here, and am I confident enough to write it down?

| Hint | What to look for |
| --- | --- |
| `vocabularyTableClass` | one class on `<table>` far more common than the rest. Open a chapter and confirm those tables really are vocabulary before you write it. |
| `vocabularySubRowClass` | a class inside tables marking rows that CONTINUE the entry above rather than starting a new one. Rarer, and easy to get wrong; leave it unset unless you have looked. |
| `numberedBlockMarkers` | image stems appearing in runs across many chapters, e.g. `enum` and `wnum`. Each entry is `{ filenamePrefix, label }`, and the label is what the block is called in the book's own words. |
| `lessonLabelWords` | the words this book's lesson labels begin with. Usually two or three, with a long tail of front-matter words to ignore. |

**Open the book and check.** The counts tell you what is frequent, never what it means. A class that
appears 45 times can be the vocabulary table or it can be the page furniture, and the only way to
know is to read one.

**Write down only what you would defend.** Every hint you leave out is a check that will honestly say
it does not know. Every hint you guess at is a check that will confidently be wrong.

## 4. Draft the config, and hand it over

`book.json` lives at `.anki-builder/epubs/<hash>/book.json` and is created by the book's first
`assemble`. Add a `hints` block to it:

```json
{
  "title": "…",
  "slug": "…",
  "hints": {
    "vocabularyTableClass": "voca",
    "vocabularySubRowClass": "sub",
    "numberedBlockMarkers": [
      { "filenamePrefix": "enum", "label": "EXERCISES" },
      { "filenamePrefix": "wnum", "label": "WORD POWER" }
    ],
    "lessonLabelWords": ["Lesson", "Unit"]
  }
}
```

**Do not put anything else in `hints` expecting code to read it.** Nothing branches on a hint. If a
fact about this book really does need to change behaviour, it belongs in `invariants`, and putting it
there means adding its key to `INVARIANT_KEYS` in `src/corpus/bookConfig.js`, which is a reviewed
change to code. `assertConfigSeparation` exists to keep that honest.

**Hand the draft to the user with your reasoning, one line per hint**: what you saw, what you
concluded, and which ones you left unset and why. The unset ones matter most, because those are the
checks that will report *unknown* on this book, and the user should know that is deliberate.

**This file is versioned and pinned.** A book's config is not a thing to iterate on casually once
chapters have been built against it.

## What onboarding is NOT

**It does not read the book's prose, and so it cannot tell you what the book teaches.** That is
`conventions.md`, it costs a paid whole-book pass, and it is a separate deliberate step that the
first `assemble` runs and caches. Onboarding produces structure; the paid passes produce meaning.

Keeping them apart is what makes onboarding something you can run on a book you are only considering,
which is the point: the whole survey costs nothing, so there is no reason to skip it and find out
during chapter 4 that this publisher marks its tables differently.

The book's other once-per-book paid pass is the taught index:

```sh
anki-builder epub taught-index <epubHash>
```

Build it deliberately, after the config is committed and before the first chapter. It is what the
forward-flag pass consults to judge whether an item is premature. A book without one is not blocked,
but the pass falls back to reading every later chapter on **every single lesson**, and it used to
build itself lazily, which meant a 57-chapter pass firing unasked in the middle of lesson 15's build
and exhausting the usage window with four passes queued behind it.
