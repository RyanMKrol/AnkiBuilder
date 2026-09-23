# 08 The skill, and the Genki pilot

Depends on: 01 to 07. Status: the skill is built (`.claude/skills/build-reading-deck/SKILL.md`),
and the dashboard's card-faces view renders a reading collection's one card. The pilot has run to
the content gate; see "Pilot results" at the end.

## The skill

`.claude/skills/build-reading-deck/SKILL.md`, separate from `build-anki-deck` because the procedure is
different enough that branching one document would make both harder to follow. It is normative for
the reading procedure the way `build-anki-deck` is for speaking.

0. **Which book.** Any registered book. A book not yet registered goes through `onboard-epub` first,
   and through `convert-book` before that if it needs converting. For a converted book, use the
   `everything` conversion (03), so the deck misses nothing the book teaches.
1. **Register the reading collection** for that book. This creates `<slug>-reading` with
   `deckKind: "reading"` (01).
2. **Extract a chapter** with `scripts/build-reading.mjs` (06). `--dry` first.
3. **Gate 1, content.** The owner reviews the chapter in the dashboard, which previews the one card
   face per item. Kanji cards are shown as such.
4. **Audio, then Gate 2.** Generated for word and phrase cards only (05), reviewed as the speaking
   decks' audio is.
5. **Build and preflight** (07).
6. **Deliver.** A human step, as always. The first delivery creates the note type (02).

There is no extras phase, no learning pass and no final review pass in the first version. The skill
says so, so an operator used to `build-anki-deck` does not look for them.

The other skills learn about it in the same commit: `build-anki-deck` names it where a reading
collection is refused, `convert-book` says which deck skill consumes which purpose, and CLAUDE.md's
orientation lists it.

## The pilot

1. **Convert Genki for everything** with `convert-book`. The owner reviews the selection. Only the
   reading and writing half is new transcription (03).
2. **Onboard** the converted book, and register its reading collection.
3. **Build two chapters end to end**, reviewed by the owner at both gates:
   - **Greetings**: kana set phrases and nothing else. Proves kana cards, the phrase rule and audio.
   - **The first kanji lesson** (Reading and Writing 3): kanji cards with no audio, example words
     with readings and audio, and dedup against the vocabulary tables of earlier chapters.
4. **Import into a scratch Anki profile** and look at the cards before any live delivery.
5. **Review the session** (golden rule 5a) and put what it teaches into the rules, prompts and checks
   before building further chapters.

Delivery to the live collection is the owner's step, after the pilot is signed off.

## Pilot results (2026-09-23)

The tooling pilot, run unattended while the owner was away. Nothing was delivered and no TTS was
spent; the owner will rerun everything from scratch to review it by hand.

**Conversion.** Genki converted for `everything`: 27 chapters, 335 pages (the 14 conversation
chapters, the writing-system unit, and all 12 reading and writing lessons). Only the 70 pages the
speaking-listening conversion had not covered were transcribed. 38 of 74 OCR-flagged pages went to
the auditor: 35 confirmed, 3 corrected. Page 256 could not be settled, as in the speaking run, and
builds from reading A. `verify` passed and `check` says `native`.

**Reading chapters built to the content gate**, all preflight-clean:

| chapter               | cards | notes                                                                |
| --------------------- | ----- | -------------------------------------------------------------------- |
| Greetings             | 22    | set phrases in kana                                                  |
| Lesson 1              | 121   | kana words (the lesson prints romaji, not kanji); no romaji carded   |
| Lesson 3              | 63    | the vocabulary table's kanji spellings, each with the book's reading |
| Reading and Writing 1 | 0     | its only words are proper names; no single kana                      |
| Reading and Writing 3 | 67    | the kanji table: character cards (万 and 時 silent), example words   |

**What it found, and where each fix went** (all merged, each with a test):

- A book's full stop and a beginners' book's spaces made two cards of one phrase: the merge key now
  drops both.
- Every reader's paraphrase was joined onto one back: a card's English now comes from one reader.
- A furigana heading ("単 語 Vocabulary") failed the section check against the reader's "単語
  Vocabulary", in the reading and the speaking chapter readers alike: headings compare on
  `sectionTitleKey`.
- Kana labels in an illustration carded たべる beside 食べる: a kana form that is a kanji word's
  reading is dropped. 〜ごろ and ごろ were two cards: the tilde is dropped.
- Words from a chapter title (約束) were carded: the card rules now say a heading teaches nothing.
- "しち／なな" and "なん／なに" came through whole: alternative readings and written forms are split.
- A chapter built out of book order left はい in two chapters: the script now names the later
  chapters and prints their `--remerge` command, and `--remerge` re-runs a merge for free.
- Settle re-paid for a page already judged unsettled, and exited 1 for it, which an unattended
  chain cannot tell from a usage-limit stop: it now skips the page and exits 3.

Preflight caught every merge problem above on its own before the fix landed, which is the evidence
that the reading checks work on real output.

**Left for the owner**: the two review gates, the audio (TTS spend), the scratch-profile import and
the first delivery, which creates the reading note type. The converted book's title carries its
purpose, so the deck is named "... (everything) (Reading)"; renaming the purpose is a one-line
change if that reads wrong.
