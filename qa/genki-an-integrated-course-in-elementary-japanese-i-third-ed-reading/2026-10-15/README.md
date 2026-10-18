# QA run: Genki 1 reading deck, 2026-10-15

Method: `qa/README.md`. Prompts: `qa/prompts/`.

## Parameters

- **Learner:** no Japanese before this deck; reads kana. Studies in **book order** (chapter order).
  A reading card has one face: the written form alone on the front, silent; English, romaji and
  audio on the back. Single kanji are meaning-only cards.
- **Book:** EPUB hash `af43edd86648b83e` (the remastered Genki), chapter text from
  `.anki-builder/epubs/<hash>/cache-v2/`.
- **Models:** Learner and Reader on Opus 5.5; Verifier and Synthesizer on Fable 5.1.
- **Deck state reviewed:** main at `45ccac6`, 27 units, 1,701 notes.
- **Read-only:** no file under `output/` or `.anki-builder/` was changed by this run.

## Chapters

`chapters.json` lists every chapter in book order with its units and card counts. Six units ship no
cards (Greetings, Numbers, Lessons 1 and 2, and the two kana chapters: their words were folded into
the kana unit or cut by the words-only ruling) and are not reviewed. The pilot covered Lesson 6
(`chapter-7`); the full run covers the other 20. `findings.jsonl` is the union of `findings/*.jsonl`
after verification.

Pilot result: 7 findings, 2 confirmed, 1 plausible, 4 rejected. Two rejections were design decisions
the Reader did not know (kana-only words live in the kana unit) and two were collisions the owner
had already accepted in preflight; the Reader prompt now says to check both.

## Result

Run 2026-10-15 to 2026-10-18 (agents cut off by usage limits were rerun from the start). All 21
chapters with cards, 1,701 cards, reviewed by both roles and verified. The last four Verifiers
(Reading and Writing 8, 9, 10 and 12) ran on Opus 5.5 rather than Fable 5.1, after a Fable-only
limit cut the first attempts off.

- `findings.jsonl`: 115 lines. 64 CONFIRMED, 4 PLAUSIBLE, 47 REJECTED.
- The 68 live findings by severity: 0 blocker, 24 should-fix, 44 polish.
- By kind: book-gap 21, other 17, book-mismatch 16, missing-info 7, wrong-content 6,
  unanswerable 1.
- By source: Reader 69, Learner 37, both roles independently 9.
- `themes.md` groups them. The rejection rate is high because reading cards have no note field and
  teach whole-word readings on the back by design; the Learner prompt did not say so, and the next
  run's should.
