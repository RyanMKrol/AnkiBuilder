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
