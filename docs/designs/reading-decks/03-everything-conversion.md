# 03 Converting a book for everything

Depends on: nothing. Status: not built.

## Why

A converted book is converted for a purpose (`src/remaster/purpose.js`), and today there are two:
`speaking-listening` leaves out the units about the writing system, and `reading-writing` leaves out
the vocabulary and grammar lessons. A reading deck wants both. In Genki, the vocabulary tables are in
the conversation half and the kanji the book teaches are in the reading and writing half (pages 305 to
366), so either purpose on its own misses part of what the book teaches you to read.

Owner decision, 2026-09-23: add an `everything` purpose, so a book can be converted whole and a
reading deck misses nothing.

This amends the 2026-09-21 ruling ("A conversion has a purpose, and each purpose is its own
collection"), which said there is deliberately no "everything" purpose. That ruling's reason was that
feeding the kanji lessons to the speaking pipeline flagged nearly every kanji card as already taught.
The reason still holds for speaking decks, so it is kept as a check (below) rather than as the absence
of a purpose.

## The change

- **A third purpose, `everything`**, in `PURPOSES`. Its criteria for the selection agent: include
  every study unit (conversation and grammar lessons, warm-up units, alphabet and kana lessons, kanji
  lessons, reading passages); exclude front matter, back matter and reference material that restates
  the lessons (indexes, a conjugation chart, a map). The owner still reviews the recommendation and
  decides, as for the other purposes.
- **`hasDeckPipeline: true`**, because the reading pipeline consumes it.
- **Chapter numbering is unchanged**: page order, `Chapter NN: <the book's own name>`, only included
  units (DECISIONS.md, "Converted books number their study units as chapters").
- **The speaking pipeline refuses an `everything` book.** A converted book records its purpose in its
  OPF `dc:source` (`src/remaster/epubWriter.js`). `build-anki-deck`'s scripts read it and refuse
  `everything` and `reading-writing`, naming the speaking-listening conversion as the one to use.
  This is the 2026-09-21 reason, turned into a check.
- **Transcripts stay shared.** Converting Genki for everything only pays for the pages the
  speaking-listening conversion did not cover: the reading and writing half is 62 pages, about 124
  transcription calls with two readings each, plus settling and auditing the pages that need it.

## Where

| site                                   | change                                                               |
| -------------------------------------- | -------------------------------------------------------------------- |
| `src/remaster/purpose.js`              | add `everything`; rewrite the header comment that says there is none |
| `docs/remaster-select-prompt.md`       | nothing, the criteria are injected per purpose                       |
| `scripts/remaster-epub.mjs`            | nothing beyond accepting the purpose; test that it does              |
| the speaking phase scripts             | read the converted book's purpose and refuse the wrong ones          |
| `.claude/skills/convert-book/SKILL.md` | list the purpose and say which deck skill uses which                 |
| `.harness/custom/docs/DECISIONS.md`    | amend the 2026-09-21 entry                                           |

## Done when

- `select --purpose everything` on a fixture outline recommends study units from both halves, and the
  selection file is `selection-everything.json`.
- A speaking phase script given an `everything` fixture book stops before any paid step with a
  message naming the speaking-listening conversion.
- The Genki conversion itself is part of the pilot (08), not this step.
