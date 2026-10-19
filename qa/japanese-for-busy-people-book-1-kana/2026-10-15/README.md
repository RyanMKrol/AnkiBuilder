# QA run: Japanese for Busy People Book 1 (Kana), 2026-10-15

Method: `qa/README.md`. Prompts: `qa/prompts/`.

## Parameters

- **Learner:** no Japanese before this deck; reads kana. Studies in **book order** (spine order, so
  Casual Style 1 follows Lesson 17 and Casual Style 2 follows Lesson 24). Owner ruling 2026-10-15.
- **Book:** EPUB hash `1fab0f99d1195ad9`; chapter text from `.anki-builder/epubs/<hash>/cache-v2/`.
- **Models:** Learner and Reader on Opus 5.5; Verifier and Synthesizer on Fable 5.1.
- **Deck state reviewed:** main at the commit that merged Casual Style 2 (`45ccac6`), 53 units,
  3,570 notes.
- **Read-only:** no file under `output/` or `.anki-builder/` was changed by this run.

## Chapters

`chapters.json` lists every chapter in book order with its units and card counts. The pilot covered
Lesson 8 (`chapter-8`, `chapter-8-extras`); the full run covers the other 26. `findings.jsonl` is the
union of `findings/*.jsonl` after verification.

Pilot result: 17 findings, 11 confirmed, 1 plausible, 4 rejected, 1 merged (both roles caught the
same wrong note on `nani`).

## Result

Run 2026-10-15 to 2026-10-18 (the agents were cut off by usage limits several times and relaunched;
a chapter whose agent was cut off was rerun from the start, so no partial report is in the files).
All 27 chapters, 3,570 cards, reviewed by both roles and verified.

- `findings.jsonl`: 579 lines. 481 CONFIRMED, 43 PLAUSIBLE, 55 REJECTED.
- The 524 live (non-rejected) findings by severity: 2 blocker, 196 should-fix, 326 polish.
- By kind: other 119, ambiguous 82, wrong-content 63, missing-info 50, unanswerable 46, book-gap
  44, book-mismatch 38, leaks-answer 31, untaught-prerequisite 26, note-unverifiable 22,
  note-restates-card 2, ordering 1.
- By source: Learner 363, Reader 136, both roles independently 80.
- `themes.md` groups them into the patterns a fixer should attack first.

Where a Verifier found two agents had used the same finding id for different problems, it
renumbered one and said so in `verdictReason`. One id that was still duplicated at the merge got
a `#chapter` suffix.

## Fixed

The fix pass (`docs/designs/qa-fix-pass-2026-10.md`, 2026-10-18 to 2026-10-19) worked through
every live finding. Each line in `findings.jsonl` now carries its outcome in `status` and
`statusReason`; the fixers' own ledgers are kept in `status/`.

- 524 live findings: 512 fixed, 12 skipped (each with a reason: hand-curated clips the owner
  regenerates, exclusions that cannot move a delivered note, and findings the fixer disagreed with).
- The 55 REJECTED findings keep `status: open` and were not acted on.
- 28 new cards went in as additions (batch `qa-fix-2026-10`) through the additions gates rather
  than as edits.
- The tooling that produced each theme was changed in the same pass (Wave A of the design doc), so
  a chapter built after it would not repeat them.
- `spot-check/` holds a Learner rerun of Lesson 8 against the fixed deck, for comparison with the
  11 live findings the original run had there.
