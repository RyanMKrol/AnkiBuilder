# 09. The kana deck

Owner decisions, 2026-09-24. Code: `src/reading/kanaUnits.js` (sound units and the selection),
`src/reading/kanaDeck.js` (the unit), the kana routing in `reconcileReading`
(`src/reading/readingPhase.js`), and `build-reading.mjs --book-pass`.

## Why

Reading kana is a finite skill. Genki's first three chapters came to 181 kana-only cards, 124 of them
in Lesson 1, and every later chapter would have added more of the same syllabary. The owner already
studies vocabulary and phrases in the speaking deck; this deck is only for learning to read, and
after a few hundred kana words another one teaches nothing new.

## What was decided

- A Japanese reading collection cards its kana-only words ONCE, in one kana deck, chosen from the
  whole book in one pass. Its chapters card kanji only: words containing a kanji, and single kanji.
  Kanji is never limited.
- Budgets: 150 hiragana-only words and 150 words with katakana (a mixed word counts as katakana,
  the scarcer script).
- Coverage comes first. A **sound unit** is what a reader recognises as one thing: a kana with its
  voicing (が); a kana plus a small ゃゅょ (にゃ); a katakana plus a small ァィゥェォ (ティ, ファ);
  small っ; ー. Every unit the book uses is in at least 3 chosen words, even past a budget. The
  budgets then fill in book order.
- Phrases count like words. The kana deck is reading practice, not vocabulary.
- Its unit is `Chapter 00: Kana` (chapter number 0), so its Anki deck sorts before every chapter.

## How it fits

- The merge drops a chapter's kana words with the reason "carded in the collection's kana deck" and
  keeps them in `reading-report.json` as `kanaPool`. Choosing the deck reads those pools, so it calls
  no reader again and can be re-run for free until the kana unit is reviewed.
- A chapter left with no cards is written anyway (its `corpus.json` is how a re-run finds its folder
  and its saved readings), marked reviewed and done, and skipped by the package, the delivery and the
  dashboard.
- Preflight: `reading-kana-in-chapter` (FAIL) catches a kana word still in a chapter; the one card per
  written form check already stops a word being in both places.
- A language without `kanaDeck` on its reading scheme behaves exactly as before.
