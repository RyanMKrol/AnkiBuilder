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

The pilot covered Lesson 6 (`chapter-7`). The full run covers every chapter in book order;
`findings.jsonl` is the union of `findings/*.jsonl` after verification.
