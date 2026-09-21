# Books the pipeline cannot read: the remaster

Status: prototype, 2026-09-21. Branch `feat/image-epub-remaster`. Proven on one lesson of one book.

## The problem

The pipeline reads EPUBs whose content is text in XHTML and whose table of contents names the
lessons. Some books arrive as neither. The one that started this is Genki I (3rd edition), which
reached us as a Calibre "PDF Reflow" of a PDF:

- 393 page images (1360×1920 JPEG), one XHTML file listing them, 132 characters of text in total
- a table of contents with one entry, "Start"

It parses without an error. The shape report gives two soft warnings, and a build would treat all
393 pages as one lesson. Nothing stops it.

## The decision: convert once, then use the normal path

Two ways to handle a book like this were on the table:

1. Teach the pipeline's passes to read page images (image-based agents throughout).
2. Convert the book once into an ordinary EPUB, then onboard and build it like any other.

We chose the second. Everything after extraction already works from a chapter XHTML file
(`chapterFilePath` in `assemble.js`), so a converted book needs no pipeline change at all. Image
passes would make every pass read pixels on every run, pay for that each time, and read the same
page differently on different runs. A conversion is paid once, checked once, and is plain text
from then on.

## What was built

`scripts/remaster-epub.mjs`, one step per subcommand so a paid step can be checked before the
next one runs:

| Step                   | What it does                                                                                                                                         | Cost                          |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| `check`                | eligibility verdict (below)                                                                                                                          | free, read-only               |
| `ocr`                  | Apple Vision reads every page (`src/remaster/vision-ocr.swift`, compiled once)                                                                       | free, local, about 2 s a page |
| `outline`              | one text-only model call rebuilds the table of contents from the OCR's running headers, page numbers, side tabs and contents pages                   | one call                      |
| `transcribe --entry N` | one Claude vision call per page writes XHTML: `<ruby>` for furigana, tables for column lists, `class="vocabulary"` on the lesson's vocabulary tables | one call per page             |
| `crosscheck`           | compares each transcript with the OCR                                                                                                                | free                          |
| `build --out`          | writes an EPUB 3 with one XHTML file per outline entry and a real nav document                                                                       | free                          |

The workspace is `.anki-builder/remaster/<source hash>/`, gitignored. **Transcripts must never be
committed.** They are the text of a commercial textbook and this repository is public.

### Eligibility

`src/corpus/epubEligibility.js` turns the shape report into one verdict:

- `native`: the normal path can use it (onboard-epub, then build-anki-deck)
- `remaster`: the content is page images (under 20 characters of text per image, at least 10
  images); run the remaster, then onboard the EPUB it writes
- `blocked`: neither path fits, with the reason (a parser rejection, or a text book whose TOC
  names no lessons)

Measured on 2026-09-21: Genki is 0.3 characters per image, Japanese for Busy People about 400.

### The cross-check

Claude and Vision fail differently, which is the point of having both. Vision gets characters right
and layout wrong: furigana comes out as stray lines, columns interleave, list numbers vanish.
Claude gets layout right. The check counts kana, kanji and English words on each side, ignoring
order, and reports:

- what the OCR saw that the transcript has nowhere (a dropped line looks like this)
- printed-size transcript text the OCR never saw (an invented word looks like this)

Furigana the OCR missed and the model's own illustration descriptions are not counted as
disagreements. The thresholds are in `src/remaster/ocrCrossCheck.js` with the reasoning.

## What the Lesson 1 run showed

Lesson 1 is pages 45 to 64 (20 pages). The outline found those bounds from the book's own
contents page and running headers, and they were right.

- **18 pages transcribed cleanly on the first attempt**, about 20 seconds each, 4 at a time.
- **1 page (53) came back as two `<page>` elements**: the model corrected itself mid-reply. The
  parser now takes the last one, and the saved reply was re-read for free.
- **1 page (46, the second dialogue) was refused on the first run.** The model declined to
  reproduce a copyrighted textbook page word for word and wrote a summary instead. The parser
  rejected the summary, as it should. At the owner's request the page was retried (up to three
  attempts allowed) and the first retry transcribed it cleanly, matching the image line for line.
  So refusals are not deterministic, and one in twenty pages on the first pass is the rate seen so
  far. See open question 1.
- **Cross-check, after tuning: 2 of 20 pages flagged (50 and 54), and both were OCR errors.**
  Pages 47 and 60 were compared with the image by eye and had no errors. On pages 45, 50, 52 and 54
  every disagreement was traced to its source, and each one was an OCR misread (the transcript
  agreed with the page's own English, e.g. "Ms. Hart" and "Canadian" for ハート and カナダ). The first
  thresholds flagged 13 pages. The causes were OCR misreads of katakana under furigana (アメリカ read
  as エイタ, ソラ as シラ), a decorative dotted border read as 17 `・`, footnotes treated as margin
  text, and English word noise. Each is handled and commented where it is handled. The check has
  not yet caught a real error, because none turned up in Lesson 1. Its detection rests on tests with
  an artificially dropped line and an invented one, and the other 13 pages have not been read by eye.
- **The pipeline read the result as a normal book.** The eligibility check says `native` with no
  shape warnings. The nav gives "Lesson 1: New Friends", filed as `Lesson 01 :: New Friends`. The
  chapter parsers find the lesson's sections (Dialogue, Vocabulary, Grammar, Expression Notes,
  Culture Notes, Practice, Useful Expressions) and its 4 vocabulary tables (28 rows).

Found and fixed on the way:

- The outline's first attempt invented the reading-and-writing lesson titles, because that part's
  contents page is page 304 and the prompt only carried the first 16 pages in full. Any page that
  names three or more lessons is now included in full.
- `plainText` (`src/corpus/chapterOutline.js`) kept furigana inline, so a headword read
  "アメリカ あめりか". No earlier book had ruby. It now drops `<rt>`, as the nav decoder already did.
- The build stamped the current time into the EPUB, so every rebuild had a new hash and would have
  registered as a new book. It is now deterministic.

## Two readings, and pictures (second iteration)

Asked next: would several runs guard against a process that samples, and could the book keep its
pictures? Both were tried on Lesson 1 with one more run of 20 pages (reading B), using a prompt that
also marks where each figure sits.

**Two readings.** A plain string comparison of A and B matched on 9 of 20 pages. Most differences
were harmless: letter case, a colon, ruby grouped differently (表現 against 表 + 現), and side-by-side
columns read in a different order. Ignoring those (`compareReadings.js`), 17 of 20 agreed. The 3 that
did not held three real errors, and every one was confirmed against the page image:

- page 45, reading B dropped the printed dialogue line numbers 1 to 5
- page 56, reading B wrote なななさい where the page has ななさい (the OCR check did not flag it)
- page 45, reading A dropped the いっ in the furigana だい いっ か over 第1課

So a single run carried a small error on about one page in ten, and the two runs never made the
same one. `settle` sent those 3 pages to Opus with the image and both readings; it fixed all three
correctly, and its answers passed the guard that rejects added or dropped content. Cost: 20 more
Sonnet calls and 3 Opus calls for the lesson.

Three or more runs with a vote were not tried. Two runs find the disputed spans, and a stronger
model with the image resolves them, which is cheaper than a third run and gives an answer where a
vote over formatted text would be ambiguous.

**The line check.** Counting characters could not see a dropped short line. A second check now
looks for each OCR line in the transcript. Measured by deleting each line of each correct Lesson 1
transcript in turn, it catches 61% of single dropped lines (77% of lines of 25 characters or more)
while flagging 2 of 20 correct pages. Tighter settings caught a few more and flagged up to half the
book; the numbers are in `ocrCrossCheck.js`. Its ceiling is the OCR's own, which is why the second
reading matters more.

**Pictures.** The build cuts each boxed figure out of the page image and puts it in the book as a
real image, with the description kept as its caption, so the image passes have something to read.
Lesson 1 has 44 figures (688 KB). The boxes are roughly right but not exact: a portrait and a clock
came out clean, a wristwatch's label lost its last letters, and one portrait on page 59 was cut off
at the chin. The crop pads each box by 1.5% of the page; a wider pad, or snapping a box to the
picture's edges, is the next thing to try if clipping matters for cards.

## Where robustness stands (third iteration)

**Calls per page.** With two readings, each page gets two Sonnet transcriptions, one more for each
retry (2 in 41 calls on Lesson 1, both copyright refusals), and one Opus call when the two disagree
(3 of 20 pages).
That is about 2.2 model calls a page, plus the OCR, which is free and local. The whole book at that
rate is roughly 860 calls.

**What each layer caught on Lesson 1**, against what a person found checking against the images:

| Layer                      | Real errors caught                                                                                  | False alarms           |
| -------------------------- | --------------------------------------------------------------------------------------------------- | ---------------------- |
| Retry on an unusable reply | 2 copyright refusals (page 46 in reading A, page 54 in reading B), both cleared on the next attempt | none                   |
| Second reading + settle    | all 3 real transcription errors                                                                     | none after normalizing |
| OCR character counts       | 0                                                                                                   | 2 pages                |
| OCR line check             | 0 (it would have missed all 3: a line number, one extra kana, one furigana run)                     | 2 pages                |
| `verify`                   | nothing to catch in the real run; catches a deleted page in the tampered test                       | none                   |

So on this lesson, every real error was caught by comparing two Claude runs, and none by the OCR.
The OCR still earns its place for three reasons. It builds the outline (the running headers are
where lesson boundaries come from, and that part has been right). It is the only reader that does not
share Claude's blind spots, so it is the one check that could notice an error both runs make the same
way. And it costs nothing. But it is a backstop, not the main defence: its noise on furigana and
letter-spaced headings sets its thresholds, and those thresholds let small errors through. On this
evidence it should stay in, and nobody should read "the OCR check passed" as "the page is right".

**What would still get through:** an error both readings make identically, at a spot the OCR also
misreads or cannot check (a short line, a furigana run). One lesson is too little to say how often
that happens. The cheapest way to find out is to proofread one more lesson fully against the images
and count.

**Pinning.** The environment is now checked as well as the tables: an override that would put the
settle pass (or any other checker) at or below what it checks stops the run before its first call.
Every transcript records the model and effort that wrote it; the Lesson 1 pages predate that and
show as "not recorded".

## The second half of the book (pilot, Reading and Writing 3)

The reading-and-writing half has layouts the first half does not: kanji tables, stroke-order
diagrams and reading passages. Reading and Writing 3 (pages 313 to 316, the first kanji lesson) was
run with two readings.

- The kanji tables came through intact: each kanji's number, its on and kun readings (the ▶ and ▷
  markers), meaning and example compounds. The orange highlighting that marks the words to learn
  became `<em>` exactly where it is printed (一時 highlighted, 一分 not).
- Stroke-order diagrams were the one real problem. Both runs faked the partial strokes with
  look-alike characters (冇, 亣, 丶), disagreed on which, and the settle pass could only pick between
  two wrong answers. The prompt now keeps the printed stroke count as text and makes the sequence a
  boxed `stroke-order` figure, so the build crops it as an image. Rerun, all four pages agreed with no
  settling needed, and the crops hold the full sequences (all ten strokes of 時).
- The OCR check flags page 314 now, because it reads the partial strokes of 時 as 日 and 月. Expected
  on stroke-order pages, and one more reason the OCR is a backstop rather than the verdict.

## How a missing page is caught

Asked after the Lesson 1 run: would we notice if pages went missing? At that point, only partly.
Each step checked its own output, but nothing checked the finished file, and a whole-book build
skipped an incomplete lesson without saying so. That is now closed. The guards, in order:

| Where a page could go missing                                                                | What catches it                                                                                        |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| The outline leaves a page out of every lesson                                                | `parseOutline` refuses anything but every page once, in order                                          |
| The model refuses a page or returns something unusable                                       | retried up to 3 times with the same prompt; still failing, the page is reported and has no transcript  |
| A page never gets a transcript                                                               | `build` refuses the lesson (named or not) unless `--allow-missing`, which writes a visible placeholder |
| The built file lacks a page, a lesson, or has a placeholder, a repeat or a page out of order | `verify` reads the EPUB back against the outline, page by page; `build` runs it on its own output      |
| A transcript exists but drops part of its page                                               | the OCR cross-check flags it, if the drop is large enough                                              |

The first four are exact: they count page numbers, so a missing page cannot pass them. Tests cover
each case, and on the real Lesson 1 file a copy with page 50 deleted fails `verify` while `check`
still calls it `native`.

The last one was the weak point and is now covered twice. The OCR checks have a ceiling set by the
OCR's own mistakes. The second reading does not share them, and in Lesson 1 it found the one error
the OCR checks missed. What is left is an error both runs make the same way, which neither the
comparison nor, if the OCR misreads the same spot, the line check would see. Proofreading against
the image is still the only complete answer.

## Open questions for the owner

1. **Copyright refusals.** One page in twenty was refused on the first pass, and a single retry
   fixed it. Options for the whole book: (a) retry a refused page a small, fixed number of times
   (what Lesson 1 did), (b) add honest context to the prompt: this is the owner's own
   copy, the output stays on this machine, and it is used only to make the owner's study cards,
   (c) accept a placeholder and let the extraction pass work without that page, or (d) change the
   design so the vision pass extracts study items from each page rather than transcribing it. We
   should not reword the prompt just to get past a refusal. (b) is only acceptable if every part of
   it is true, and only the owner can confirm that.
2. **Whole book up front, or lesson by lesson?** The library identifies a book by its bytes. A
   book rebuilt with Lesson 2 added is a new file with a new hash, and the dedup library would
   start again. So either transcribe the whole book once before onboarding (about 373 more calls,
   roughly 35 minutes at 4 at a time), or teach the library that a remastered book keeps its
   source's identity. The first is simpler and is the recommendation.
3. **Model and cost.** Transcription runs Sonnet 5 at high effort and settling runs Opus 5
   (`REMASTER_PASS_PINS`). Two readings of the whole book is about 786 Sonnet calls, plus Opus on
   roughly the one page in seven that disagreed in Lesson 1. Whether every book gets two readings,
   or only the lessons being built, is the owner's call.

## Where this goes next

The long-term shape is a skill (working name `ingest-book`) that takes a PDF or an EPUB and ends
with an EPUB the normal path can onboard:

1. Run `check`. `native` goes straight to onboard-epub. `blocked` stops with the reason.
2. `remaster` runs ocr and outline, then stops for a person to read the outline, because every
   deck name comes from it.
3. Transcribe, cross-check, and hand the flagged pages to a person with the image beside the
   transcript.
4. Build, confirm `check` now says `native`, then hand over to onboard-epub.

PDF input is a small addition to the same path. A PDF with a text layer may need no transcription
at all (PDFKit can read the text and render each page for the OCR and the vision pass); a PDF
without one is rendered to page images and joins the path at `ocr`. The eligibility check would
learn one more verdict for that case.
