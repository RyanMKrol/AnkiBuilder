# 07 Checks

Depends on: 04, 05 and 06. Status: built (branch `feat/reading-checks`): `src/audit/checks/reading.js`,
tested in `test/audit/readingChecks.test.js`. Check 2 is split in two: furigana, a bracketed reading
and sentence punctuation FAIL (`reading-front`), and Latin letters are an ACK (`reading-latin`),
because Japanese writes some words with them (Ｔシャツ). Check 10 is the existing `audio-files`
check, which now exempts a silent card; check 12 is `reading-skipped-speaking-checks`. The
speaking-only list lives in `src/audit/checks/index.js`.

A rule in prose is a hope, so each rule in 04 and 05 that code can see becomes a check. All of them
run on one reading collection at a time; none reads another collection. They run in preflight, and
the ones marked "build" also refuse the deck build, so a bad card cannot reach Anki by skipping
preflight.

| #   | check                                                                                                              | level         | rule                                                                                                                                                                         |
| --- | ------------------------------------------------------------------------------------------------------------------ | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | the reading template's front is `{{Target}}` alone                                                                 | test          | 02                                                                                                                                                                           |
| 2   | a target has no ruby markup, Latin letters, bracketed reading (`大学 (だいがく)`) or sentence punctuation (。？！) | refuse, build | 04 rule 2, the front gives nothing away                                                                                                                                      |
| 3   | no two cards in the collection have the same target                                                                | refuse, build | 04 rule 3                                                                                                                                                                    |
| 4   | no target is a single kana or letter                                                                               | refuse        | 04 rule 5                                                                                                                                                                    |
| 5   | a single-character target is one the plugin allows as a character card                                             | refuse        | 04 rule 4, 05                                                                                                                                                                |
| 6   | a target longer than 16 characters                                                                                 | warn          | 04 rule 6, word-sized. The number is a starting point, tuned on the pilot; a long set phrase the book teaches is accepted by hand                                            |
| 7   | a Japanese word containing kanji has a `reading`, and the reading is kana only                                     | refuse, build | 05 part 4                                                                                                                                                                    |
| 8   | a word the book printed with a kanji spelling is not carded as kana only                                           | warn          | 05 part 1, so the rule cannot quietly slide back to kana                                                                                                                     |
| 9   | every card has English                                                                                             | refuse, build | 04 rule 8                                                                                                                                                                    |
| 10  | every card has audio unless the plugin says its target is silent                                                   | refuse, build | 02, 05 part 3 (`assertEveryCardHasAudio`)                                                                                                                                    |
| 11  | a silent card has no audio                                                                                         | refuse        | 05 part 3; a kanji card with a clip means the audio stage ignored the plugin                                                                                                 |
| 12  | the speaking checks that do not apply are listed as not run                                                        | report        | a reading collection skips the Production face length, collision cue, romanisation and base/extras split checks, and preflight says so, so "not run" never reads as "passed" |

Check 8 needs the book's printed kanji spelling, which the table reader records in its candidates
file; the check reads that file, not the book.

## Where

Preflight's check registry (`src/audit/checks/`), in a new `reading.js`, selected when the collection's
`deckKind` is `reading`. The speaking checks are skipped for a reading collection by the same
selection, and the skip list is what check 12 prints.

## Done when

- Each check has a test with a passing and a failing fixture.
- Preflight on a speaking collection runs no reading check and prints the same output as before.
