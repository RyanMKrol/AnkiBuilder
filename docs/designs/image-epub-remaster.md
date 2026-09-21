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
3. **Model.** Transcription runs Sonnet 5 at high effort (`REMASTER_PASS_PINS`). Lesson 1 gave no
   reason to move it. A page the cross-check flags could go to Opus for a second reading rather
   than to a person.

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
