---
name: convert-book
description: Turn a book the deck pipeline cannot read (an EPUB of page images, a scan) into an ordinary EPUB it can, for one purpose (speaking and listening, reading and writing, or everything). Checks eligibility first, has the owner review the outline and choose the chapters, converts with two readings, and verifies the result before handing over to onboard-epub.
---

# Convert a book the pipeline cannot read

Run this **before `onboard-epub`**, on any book whose eligibility check does not say `native`, and
on any PDF (the pipeline reads EPUBs, so a PDF always needs converting; its pages are rendered to
images and it follows the identical path from there). It
ends with a converted EPUB that onboards and builds like any other book. The tool it drives is
`scripts/remaster-epub.mjs`; the design, the measurements behind every threshold and the decisions
already taken are in `docs/designs/image-epub-remaster.md`, and how the steps are wired is in the
remaster section of `docs/PIPELINE.md`.

**This spends real money**, mostly in one step: two vision readings of every page you convert. Every
paid step waits for the owner, and each has its own cost line below. Say the cost before you run it.

**Nothing this produces is ever committed.** The workspace (`.anki-builder/remaster/<hash>/`) holds a
book's full text, and this repository is public. It is gitignored; keep it that way. It is also not
backed up by git, so do not delete the worktree or checkout it lives in without moving it first.

Throughout, `$BOOK` is the absolute path of the source file and `$TOOL` is
`node scripts/remaster-epub.mjs`.

## 1. Is conversion the right path?

```sh
$TOOL check "$BOOK"
```

Free and read-only. Three verdicts:

- `native`: stop. The book does not need converting; go to `onboard-epub`.
- `blocked`: stop, and tell the owner the reason it prints. Do not work around it.
- `remaster`: carry on.

## 2. Read the pages, then find the lessons

```sh
$TOOL ocr "$BOOK"        # free: Apple Vision, local, about 2 seconds a page
$TOOL outline "$BOOK"    # one text-only model call
```

The outline replaces the table of contents the book does not have. It prints every entry with its
page range, and every study unit as `Chapter NN: <the book's own name>`.

**Show the outline to the owner and wait for them to accept it.** Every deck name comes from it.
Check the boundaries against the book's own contents page: a lesson should start on the page its
title appears. If an entry is wrong, re-run the outline (it is one call) rather than hand-editing
`outline.json`.

## 3. What is this conversion for?

Ask the owner with `AskUserQuestion`. Three purposes (`src/remaster/purpose.js`):

- **`speaking-listening`** (the default): vocabulary, phrases and grammar with audio. This is what the
  deck pipeline builds today.
- **`reading-writing`**: the script and its characters. No deck pipeline builds these cards yet;
  converting for it works, but say so.
- **`everything`**: every study unit, from both halves of a book like Genki. This is the book a
  reading deck is built from (the `build-reading-deck` skill), so it misses nothing the book teaches.
  The speaking pipeline refuses it (and `reading-writing`): a speaking deck is built from the
  `speaking-listening` conversion, because a book holding the kanji lessons makes the speaking
  pipeline flag every kanji card as already taught.

Each purpose's converted book is its own collection, so they are never deduplicated against each
other (`DECISIONS.md`, "A conversion has a purpose, and each purpose is its
own collection"). Page transcripts are shared, so converting for the second purpose later only pays
for pages the first did not cover.

## 4. Which chapters?

```sh
$TOOL select "$BOOK" --purpose <purpose>     # one Opus call
```

It prints a recommendation for every study unit (include, exclude or ask), a category, the units it
repeats, and a reason, then a summary of the main choice. **The owner decides; the agent only
advises.** Present the recommendations, and put every `ask` and anything the owner might disagree
with to them with `AskUserQuestion`. Record the answers:

```sh
$TOOL decide "$BOOK" --purpose <purpose> --accept-recommendations \
  [--include <entry> ...] [--exclude <entry> ...]
```

`decide` prints the final chapters. Nothing is transcribed while any unit is undecided. If the owner
is unsure what a choice means, explain its consequence before asking again; for the kanji case this
turned on what the deck pipeline is for, which is why purposes exist.

## 5. Convert: two readings, then settle

Say the cost first: about **2.2 model calls per page** (two Sonnet readings, the odd retry, and Opus
on the pages where the readings disagree, about one in seven). On Genki, 4 at a time, a page took
about 20 seconds.

```sh
$TOOL transcribe "$BOOK" --purpose <p> --concurrency 6               # reading A, every chapter
$TOOL transcribe "$BOOK" --purpose <p> --concurrency 6 --reading b   # reading B
$TOOL settle "$BOOK" --purpose <p>                                   # Opus, only where they differ
```

Run them in the background, one after the other, **chained with `&&`, never `;`**: a usage-limit stop
exits non-zero, and `;` would start the next stage straight into the same limit. **Watch them with
a Monitor** that reports stage changes and failures, not every page. Do not edit `src/remaster/` or the script while the run is
going: each stage starts a new process on whatever code is in the tree.

What to expect, and what to do:

- **A copyright refusal** (the model declines to copy a page and writes a summary) is retried up to 3
  times with the same prompt. It happened on about 1 call in 20 and every one cleared on retry.
  **Never reword the prompt to get past a refusal.**
- **A usage-limit refusal stops the run.** Everything finished is kept; re-run the same command once
  the limit resets and it picks up where it stopped.
- **A page that fails all its attempts** is listed at the end. Tell the owner. The build will refuse
  its chapter until it has a transcript, or until they accept a placeholder (`--allow-missing`, which
  embeds the page image instead).

## 6. Build, verify, and look at the flagged pages

```sh
$TOOL build "$BOOK" --purpose <p> --out <converted.epub>
```

The build runs `verify` on its own output: every page of every chapter present once, in order, and
every image it shows packed in the book. **A failed verify is a stop.** It also prints which models
wrote the pages and which pages the OCR cross-check flagged.

**Audit the flagged pages before you read any of them yourself:**

```sh
$TOOL audit "$BOOK" --purpose <p>     # one Opus call per flagged page
```

Each flagged page goes to an auditor with the page image, the transcript and the specific
disagreements. It answers about those spans only, and any correction is an exact swap that is
applied only if its text occurs once and the whole audit changes little. Pages it confirms or
corrects drop off the build's list; what remains (`unclear`, a rejected correction, a failure) is
what you read against the image yourself (`.anki-builder/remaster/<hash>/images/`).

On Genki: 51 of 265 pages flagged, all 51 confirmed correct, each with a reason naming what the OCR
had misread. Tested by deleting one printed line from a page: the check flagged it and the auditor
restored exactly that line. Expect stroke-order pages to flag, because the OCR reads partial strokes
as characters.

Then confirm the result is an ordinary book:

```sh
$TOOL check <converted.epub>             # must say native
node scripts/epub-probe.mjs <converted.epub>
```

## 7. Hand over

Tell the owner where the converted EPUB is, how many chapters it has, and what it cost, then run
`onboard-epub` on the **converted** file, never the original. A converted book always carries two
hints: `vocabularyTableClass` is `vocabulary` and `lessonLabelWords` is `["Chapter"]`.

## What to read when something looks wrong

- `.anki-builder/remaster/<hash>/journal.jsonl`: one line per decision (each retry and why, each
  cross-check, each comparison, each settle verdict and its guard, the build, the verify), naming the
  model call behind it.
- `.anki-builder/remaster/<hash>/agent-logs/`: every model call in full, rejected replies included.
- `transcripts/page-NNN.meta.json`: which model and prompt wrote a page.

A checking agent reviewing a conversion should start from the journal.
