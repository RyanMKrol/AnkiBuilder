# The QA fix pass, October 2026: tooling first, then cards

## Context

A read-only QA pass (`qa/`, merged to main as `78c93cf`) studied both collections from a learner's
side and a book's side: Busy People Book 1 (27 chapters, 3,570 cards) and the Genki reading deck
(21 chapters, 1,701 cards). It produced two backlogs:

- `qa/japanese-for-busy-people-book-1-kana/2026-10-15/findings.jsonl`: 579 verified findings, 524
  live (2 blocker, 196 should-fix, 326 polish), grouped into 14 themes in `themes.md`.
- `qa/genki-an-integrated-course-in-elementary-japanese-i-third-ed-reading/2026-10-15/findings.jsonl`:
  115 verified findings, 68 live (24 should-fix, 44 polish), 10 themes.

The owner ruled on the seven decisions the findings needed; the rulings are in
`.harness/custom/docs/DECISIONS.md` (merged as `e36baef`). The owner's standing instruction for the
fix pass: **for every finding, fix the tooling that produced it (skill, prompt, script, check) and
the cards it produced.** The deck is studied daily and will be shared, so it must read as the book
for someone going through the book in order.

### The seven rulings (2026-10-18), and the tooling cause behind each

1. **Book order is the study order.** "Taught so far" means taught by book position. _Cause:_
   `loadEarlierUnitItems` and `loadEarlierTaughtItems` in `src/cards/earlierUnits.js:37-104` sort
   and filter by directory number (`chapter-N`), while the dedup library, taught index and
   `taughtNeverUsed` use the spine number (`meta.chapterNumber`). `chapter-25` (Casual Style 1,
   spine 40) therefore saw Lessons 18 to 24 as "taught".
2. **Reading deck: a kanji the book teaches as a word is the word card, across chapters.** _Cause:_
   `dropCharactersCardedEarlier` (`src/reading/characterGaps.js:232-271`) drops any single-kanji
   target already carded, word or character, and logs nothing; `reconcileReading`
   (`src/reading/readingPhase.js:334-341`) does the same at merge time, where 19 of the 27 drops
   happened. Exceptions: 年 (nen/toshi) and 後 (go/ato) stay silent with both senses; colour nouns
   赤 青 白 黒 count as taught words.
3. **Reading deck: a word with two book readings lists both, voices the first.** _Cause:_ alternates
   are recorded in `readingConflicts` (`readingPhase.js:355-381`) but no card field carries them;
   `romanizeReadingItems` (`src/reading/readingRomaji.js:26-80`) romanizes `ttsText` only.
4. **Proper names are not cards, even when the book lists them.** _Cause:_ the rule landed
   2026-09-22 and was applied to Lesson 20 only; `findUncoveredVocab`
   (`src/cards/vocabCoverage.js:157-170`) lists "(fictitious ...)" names as uncarded vocabulary.
5. **Deck-written sentences with untaught words:** gloss in the note by default, swap where
   incidental, cut where the grammar is untaught. _Cause:_ `docs/card-rules-shared.md:40-46` has
   the rule but no check enforces it, and the additions pathway (`augment-pathway.md`) has no
   "taught by here" step. 13 of 26 findings came through that pathway.
6. **The book wins over the class.** Retrofitted cards follow the book's conventions. _Cause:_ the
   additions gates check English, target, pronunciation and audio, not conventions.
7. **Reading deck rule 1 widened:** card vocabulary from anywhere in the chapter; English from the
   book or the translate pass; a word a later chapter's list teaches is carded there; headings and
   instructions are not carded. _Cause:_ `docs/card-rules-reading.md:25-29` and the prompts
   `docs/reading-chapter-prompt.md:39-41`, `reading-table-prompt.md:23,33-34`,
   `reading-coverage-prompt.md:28` say the opposite.

### Constraints that shape the plan

- Collections are isolated (CLAUDE.md golden rule 7): no task reads both decks' cards together.
- Field edits on done, delivered units are allowed in place (`writeUnitJson`,
  `src/util/unitWrite.js:29-46`, on BOTH cards.json and corpus.json, corpus shape via
  `projectCorpusItem(item).item`). **Adding a card is not**: a new card goes through the additions
  gates so the owner sees it before it ships.
- A schema field belongs in both `cards` and `corpus` schemas (`src/model/index.js`) or neither.
- No two agents edit the same unit at once: card work is partitioned by chapter, and every agent
  works on its own branch in its own worktree (cards.json and corpus.json are tracked, so a
  worktree has them; audio and packages are not, so preflight runs from the main checkout after
  the merge).
- TTS is spent only on cards the owner has approved; delivery is the dashboard button.
- Every change: branch, `npm run ci` green, `--no-ff` merge, push. Deck-data commits stage explicit
  files. `npm run validate:decks` and `npm run preflight` after touching deck data (from main).
- `build-audio.mjs` refuses a unit whose text changed (exit 3, by design); re-voicing an edited card
  uses `node src/cli/bin.js audio --run <unitDir>` (regenerates stage-made clips whose text changed,
  never hand-curated ones). A hand-curated clip whose text changed is badged "Text changed" and is
  redone by the owner in the dashboard (Generate, then select). `isSilentReadingCard` keys on the
  reading, so a kanji card rewritten with a `ttsText` is voiced on the next audio run.
- The reading book pass never re-merges a done unit (`scripts/build-reading.mjs:503-530`,
  `characterGaps.js:244`, `src/reading/studyOrder.js:58`). All 27 Genki units are done, so T2 fixes
  future builds only; the existing 27 cards need the one-shot backfill in F3.

## Context management (the owner asked for this explicitly)

This conversation is at ~80% of its context. The plan is written so a fresh context can execute it.

- **Step 0 copies this plan into the repo** as `docs/designs/qa-fix-pass-2026-10.md`, with a
  checklist table (task, branch, status, merge hash). That file is what any fresh agent reads first.
- **Progress lives in files:** each finding's `status` in `findings.jsonl` (`open` ->
  `fixed` / `skipped` / `wont-fix`, with `statusReason`), the checklist in the design doc, and git.
- **Compact at the end of each wave** (marked below). Before compacting: update and commit the
  checklist, so nothing needed to continue is only in the context.
- **Agents do the reading.** Every task runs in a subagent (worktree) and returns a report under
  150 words. The orchestrator never opens cards.json, findings.jsonl or themes.md in full.
- **Batch size:** at most 10 agents at once. The QA run showed usage limits cut agents off with no
  partial output; a cut-off task is rerun from the start.

## Layer 1: tooling (ten tasks, each its own branch in its own worktree)

Each task: code + tests + docs in the same commit (README status, PIPELINE.md where wiring
changes, the skill or prompt where the rule lives), `npm run ci` green, merged to main by the agent
from its worktree (`git fetch && git checkout --detach origin/main && git merge --no-ff <branch> &&
git push origin HEAD:main`, retry on rejection). Prose without em-dashes. Tests use tmp fixtures.

**T1 `fix/taught-by-book-order`** (ruling 1)

- `src/cards/earlierUnits.js`: `loadEarlierUnitItems` and `loadEarlierTaughtItems` sort and filter
  by `cards.meta.chapterNumber` (spine), base before extras. Callers to check: `scripts/build-extras.mjs:84`
  (passes the directory number today; read `meta.chapterNumber` instead), `phaseExtraction.js:71`,
  `scripts/build-base.mjs:95`, `scripts/build-extras.mjs:124`, `scripts/shadow-run.mjs`.
- `.claude/skills/build-anki-deck/references/augment-pathway.md`: a routing step (a retrofitted
  card's words are checked against what the book has taught by the destination unit's book
  position; gloss the new word in the note or route the card to the lesson whose list teaches it)
  and the "book wins over class" conventions rule (ruling 6).
- `.claude/skills/build-anki-deck/SKILL.md`: one line under "Build a book's lessons in ascending
  order": taught means by book position; a supplement built late is judged where the book puts it.
- Test: a fixture with `chapter-3` at spine 20 between `chapter-1` (spine 10) and `chapter-2`
  (spine 30) orders by spine.

**T2 `fix/reading-word-wins-across-chapters`** (ruling 2, future builds)

- `dropCharactersCardedEarlier`: when the item has `ttsText` (a word), do not drop it; rewrite the
  earlier unit's card in place under the same id (English, `ttsText`, `pronunciation`, a
  `reviewNote` naming the teaching chapter) with `writeUnitJson` on both cards.json and corpus.json
  (not `applyBookCharacters`, which writes cards.json only), and update that unit's
  `candidates/characters.json` `cards[char]` so the book pass does not turn it back into a kanji
  card. Same rule in `reconcileReading`'s already-carded drop (`readingPhase.js:334-341`).
- Exceptions in the Japanese scheme (`src/reading/readingSchemes.js`): a kanji whose book readings
  as a word differ (detected from `readingConflicts` across the book) stays silent with both senses
  joined in the English; colour nouns the book derives by rule (赤 青 白 黒) are taught words.
- Log every drop, word or character, in `reading-report.json` `dropped` (writer at
  `readingPhase.js:~628-640`); `build-reading.mjs:474` prints them.
- Preflight tier in `src/audit/checks/reading.js` (model `readingSilentCheck` 390-409; add to
  `READING_CHECKS`): a silent single-kanji card whose target any unit's `as-generated.json` records
  with `kind: word`. The snapshot is written by the shared `src/agents/snapshot.js` (speaking phases
  use it too), so add `kind` as an optional pass-through field there, nothing else changes.
- Docs: `docs/card-rules-reading.md` rule 4, `docs/designs/reading-decks/10-character-cards.md`
  (what happens when a hoisted kanji is later taught as a word), `05-japanese-plugin.md`.

**T3 `feat/reading-alternate-readings`** (ruling 3; after T2, same file)

- `readingPhase.js:355-381` keeps the alternates on the item; `romanizeReadingItems` romanizes each
  and `pronunciation` becomes `first / second` ("shichi-nin / nana-nin"); audio from `ttsText`. If
  alternates are stored as a field, add it to both schemas in `src/model/index.js`.
- Docs: `docs/card-rules-reading.md`, `docs/designs/reading-decks/04-card-rules.md`,
  `.claude/skills/build-reading-deck/SKILL.md` "What a card is".

**T3b `fix/kana-deck-merged-english`** (Genki theme 8)

- `src/reading/soundDeck.js:23-38`: the dedup keeps a `Map<target, entry>` and joins the glosses of
  repeated forms ("Three; Mr./Ms."), carried on `words[].entry` into `kanaDeck.js:116-123`.

**T4 `feat/reading-vocab-from-anywhere`** (ruling 7; after T3, both edit `04-card-rules.md`)

- Rewrite rule 1 in `docs/card-rules-reading.md:25-29` and `04-card-rules.md:20-21`, and the
  matching lines in `docs/reading-chapter-prompt.md:39-41`, `reading-table-prompt.md:23,33-34`,
  `reading-coverage-prompt.md:28`, `06-reading-extraction.md:31`. "Carded where a later list teaches
  it" uses the reading collection's own later chapters' vocabulary tables from the chapter cache.
- New read-only script `scripts/reading-vocab-scan.mjs <collectionDir>`: runs the reading chapter
  reader with the widened rule over every chapter (one model call each, 21 calls) and writes
  `qa/<slug>/2026-10-15/vocab-scan.jsonl`: candidate word, chapter, where it appeared, whether the
  book glossed it, whether a later chapter's list teaches it ("skip, carded there"), whether a card
  exists. Register it as STANDING in `test/scripts/spentMigrations.test.js` and name it in a doc.
- Also carries T9: `qa/prompts/learner.md` (a reading card has no note field; a compound's reading
  is taught on its own back; a narrower gloss is a finding only if a right answer would be marked
  wrong) and `qa/prompts/reader.md` (the kanji-versus-word carve-out; name `.preflight-accepted.json`).

**T5 `fix/proper-name-checks`** (ruling 4)

- `docs/card-rules-shared.md` proper-name rule: a name inside a book sentence is fine; a named
  facility is a name even when the book's list carries it.
- `findUncoveredVocab` skips entries whose gloss matches `/\(fictitious\b/i`.
- New INFO check in `src/audit/checks/vocab.js`: a word card whose target is katakana plus a place
  suffix (タワー, えき, どおり, デパート, ホテル, こうえん) with vocabulary provenance.

**T6 `feat/untaught-word-check`** (rulings 5 and 6; after T1)

- New check `src/audit/checks/untaughtWords.js` (ACK tier), registered in
  `src/audit/checks/index.js`: for every `aiSuggested` or `addition` card, tokenise the target
  against the items taught before the unit in book position (T1's `loadEarlierTaughtItems`),
  reusing `teachableVocabulary` and `findUnteachable` from `src/agents/extrasVocabulary.js:21,40`;
  a content word with no earlier card and not glossed in the note is a finding; INFO when glossed.
- One line each in `docs/example-sentence-miner-prompt.md:47-56`,
  `docs/inventive-author-prompt.md:20-29`, `docs/gap-author-prompt.md:11-16`: a sentence uses only
  grammar frames this chapter or an earlier one teaches (named example: a verb clause modifying a
  noun, as in ははがくれるおかし, is not taught in this book). One line in
  `docs/cross-lesson-note-prompt.md` "## Rules" (101-121): a note explains a word only with words the
  learner has met, or glosses what it introduces.

**T7 `fix/collision-match-is-fuzzier`** (themes 1 and 4 going forward)

- `normalizeEnglish` in `src/cards/extrasTools.js:9-14`: also strip square-bracketed optional words
  ("[here]") and leading articles. Round-bracketed cues like "(casual)" are kept: they are the deck's
  disambiguators. Passed as `keyOf` at line 135 so target grouping is unaffected; both callers
  (`src/audit/checks/collection.js:76-97`, `scripts/extras-collision-audit.mjs:37`) get it.

**T8 `feat/card-quality-checks`** (themes 2, 7, 9, 11 going forward)

- `src/audit/checks/cardQuality.js`, INFO tiers: builder-facing note text (`GRAMMAR \d`,
  `Exercise`, `above`, `below`, `Member \d of the set`, `this lesson's dialogue`); a hint or scene
  that contains the card's target or English; a note that labels a ます form "plain" or "dictionary".
- `src/translate/romajiStyle.js:42` `JA_SAFE_COUNTER` gains `fun`/`pun`;
  `src/audit/checks/romanization.js` gains a collection-wide consistency finding for a word romanized
  two ways (iie/īe) and unmarked long vowels uu/ee/aa.
- T5, T6 and T8 all append to `src/audit/checks/index.js`; trivial merge conflicts, resolved by the
  later merger.

## Layer 2: cards

Protocol for every fixer agent: own branch, own worktree (`git worktree add`), units assigned by
chapter. For each assigned finding: re-read the card on disk, apply the fix with `writeUnitJson` to
both cards.json and corpus.json, set `status` and `statusReason` on the finding's line in
`findings.jsonl` (the fixer owns the lines for its chapters only), `npm run validate:decks`, commit
per chapter with explicit paths (`cards.json`, `corpus.json`, `findings.jsonl`), merge to main from
the worktree as in Layer 1. A finding the fixer disagrees with is `skipped` with a reason, never
dropped silently. REJECTED findings are left `open` and untouched. Preflight runs once from the
main checkout after each wave.

**F1 Busy People field edits** (themes 1 to 9, 11, and theme 13's exclusion-reason rewrites): ~470
findings. Four agents by chapter so no two touch one unit: F1a `chapter-0` to `chapter-6`, F1b 7 to
12, F1c 13 to 18, F1d 19 to 26 (including 25). Fix shapes per theme are in `themes.md` "The
attack"; theme 1 fixes are a `hint` naming the structure or a `scene`, never a target change;
`scene` must not leak on the Recognition front (check with `node scripts/qa-render-unit.mjs
<unitDir>`). A target change on a hand-curated clip is `skipped` ("hand-curated clip, owner to
regenerate") and listed for the owner. Depends on T1, T7, T8 (the verifier uses their checks).

**F2 Busy People structural** (themes 10, 12, 14; the two Casual Style 1 notes; theme 13's
duplicate exclusions). Untaught words per ruling 5; the three place-name exclusions and the
レストランローマ rewrite (ruling 4); book gaps (theme 12, 14 findings: じゅうまん ひゃくまん せんまん, だれも
and the rest) become new cards in one additions batch `qa-fix-2026-10`: appended with `addition`
set and no review flags, mirrored into corpus.json, per `augment-pathway.md` (template
`scripts/add-verb-forms-family.mjs:138-154`). Runs after F1 so it sees final text.

**F3 Genki** (one agent). A one-shot SPENT script `scripts/backfill-reading-word-cards.mjs`: for
each unit, read `reading-report.json` `dropped` and `candidates/*.json` (kind `word`, with reading)
for single-kanji words that lost to an earlier character card, and rewrite the earlier card in
place (same id) as the word, applying ruling 2's two exceptions; `--dry` first, prints the 27.
Themes 2, 3, 4, 6, 7 are field edits in the same agent. Theme 8 (kana deck, unit `chapter-26`) and
theme 10 (two readings) are field edits too, since the book pass skips reviewed units. Theme 5
(exclusion promises a later card) and theme 9 (日本, 中国) become an additions batch
`qa-fix-2026-10`. Then the vocab scan (T4) output is reviewed by the owner and approved words join
that batch. Depends on T2 (for the rule's wording and the exceptions logic to reuse), T3, T3b.

**F4 Audio**: per unit with a changed target or `ttsText`: `node scripts/build-audio.mjs
<collectionDir> <n> --lang ja --dry` to see the refetch line, then `node src/cli/bin.js audio --run
<unitDir>`. New additions get audio after the owner approves them at the content gate.
Hand-curated "Text changed" clips: listed for the owner.

**F5 Close-out**: `node src/cli/bin.js deck --book-dir <collectionDir>` for both collections,
`npm run check`, `node scripts/deliver-to-anki.mjs --dry`; the orphan list (excluded delivered
cards, printed as "orphaned in Anki (kept)") written into the design doc for the owner to delete by
hand; `findings.jsonl` statuses committed; the two run READMEs get a "Fixed" section with counts.
Regression spot-check as two agents (one per collection): rerun the Learner on Lesson 8 and on
Genki Lesson 6 and compare live-finding counts (11 and 3 before).

## Order and waves

| Wave | Runs                                                                                                       | Parallel | Compact after |
| ---- | ---------------------------------------------------------------------------------------------------------- | -------- | ------------- |
| 0    | Copy this plan to `docs/designs/qa-fix-pass-2026-10.md` with the checklist; branch, merge.                 | 1        | no            |
| A1   | T1, T2, T5, T7, T8 in worktrees (disjoint files). Restart the dashboard after (server code).               | 5        | no            |
| A2   | T3 (after T2), T3b, T4 with T9 (after T3), T6 (after T1).                                                  | 4        | **yes**       |
| B    | F1a to F1d (Busy People, disjoint chapters) and F3 (Genki).                                                | 5        | **yes**       |
| C    | F2; T4's vocab scan; then owner reviews both additions batches at `/additions/book/<slug>/qa-fix-2026-10`. | 2        | **yes**       |
| D    | F4 audio (after content approval), owner Mark ready, F5 close-out.                                         | 2        | no            |

## Commands

```sh
# Layer 1 merge, from a worktree
git fetch origin && git checkout --detach origin/main && git merge --no-ff <branch> -m "Merge <branch>" && git push origin HEAD:main

# Layer 2 fixer worktree
git worktree add ../anki-builder-<task> -b <branch> origin/main

# Deck data checks (main checkout)
npm run validate:decks
node scripts/preflight.mjs output/epubs/<slug>
node scripts/qa-render-unit.mjs output/epubs/<slug>/<unit>

# Audio
node scripts/build-audio.mjs output/epubs/<slug> <n> --lang ja --dry
node src/cli/bin.js audio --run output/epubs/<slug>/<unit>

# Rebuild, check, preview delivery
node src/cli/bin.js deck --book-dir "$PWD/output/epubs/<slug>"
npm run check
node scripts/deliver-to-anki.mjs --dry

# Reading book pass (future builds; does not touch done units)
node scripts/build-reading.mjs --output-root output --book <slug> --book-pass --lang ja
```

## Verification

- Layer 1: `npm run ci` per branch; each new check has a tmpdir fixture with one positive and one
  negative case; T2's fixture has a character card in chapter A and the same kanji as a word in
  chapter B, asserting the in-place rewrite of both files and the log line; T1's fixture asserts
  spine ordering.
- Layer 2: after each wave, `npm run validate:decks` and preflight are clean from main (no new
  FAIL; the three audio-marker ACKs are pre-existing); a verification agent per fixer re-renders
  every touched card with `qa-render-unit.mjs` and checks the finding's claim no longer holds
  (theme 1: both competing cards carry distinguishing cues; theme 7: no hint contains the answer),
  and runs T7's and T8's checks on the touched units.
- End to end: `deliver-to-anki.mjs --dry` sums updated + added + unchanged to the package count; the
  Learner spot-checks report fewer live findings than the QA run did.

## What the owner does

1. Waves A and B: keep the dashboard idle while fixers merge (the pre-push hook snapshots `output/`).
2. Wave C: review the additions batches at `/additions/book/<slug>/qa-fix-2026-10` (content gate);
   read `vocab-scan.jsonl`'s summary and approve which scanned words become cards.
3. Wave D: audition the new clips and click Mark ready; redo any "Text changed" hand-curated clips
   with Generate; delete the orphan notes listed in the design doc from Anki; press Deliver.

## Checklist

Wave A finished 2026-10-18. Notes from it: T7 leaves preflight with 4 FAIL collisions (2 groups, both theme-1 findings) until F1d adds hints; T6 ships `untaught-words` as ACK with 8 live instances to judge in F1/F2; T2 ships `reading-kanji-taught-as-word` as ACK with 38 Genki instances cleared by F3; READING_MERGE_VERSION is now 4, so the book pass reports every reviewed Genki unit as out of date (none is re-merged).

Updated by the orchestrating session as tasks land. Status: todo, running, merged, skipped.

| Task                                                                                                                                                          | Branch                                | Status | Merge         |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | ------ | ------------- |
| 0 design doc                                                                                                                                                  | docs/qa-fix-pass-design               | merged | (this commit) |
| backups: tag `pre-qa-fix-2026-10-18`, tarballs in `anki-backups/pre-qa-fix-2026-10-18/`, live Anki export `anki-backups/2026-10-18T22-40-29-011Z-pre-qa-fix/` | feat/backup-anki-decks                | merged | e32ca99       |
| T1 taught by book order                                                                                                                                       | fix/taught-by-book-order              | merged | 66569d9       |
| T2 reading word wins across chapters                                                                                                                          | fix/reading-word-wins-across-chapters | merged | 814d463       |
| T3 reading alternate readings                                                                                                                                 | feat/reading-alternate-readings       | merged | db3352d       |
| T3b kana deck merged English                                                                                                                                  | fix/kana-deck-merged-english          | merged | cdd20cb       |
| T4 reading vocab from anywhere (+T9 prompts)                                                                                                                  | feat/reading-vocab-from-anywhere      | merged | 5c7a202       |
| T5 proper-name checks                                                                                                                                         | fix/proper-name-checks                | merged | 3af626b       |
| T6 untaught-word check                                                                                                                                        | feat/untaught-word-check              | merged | 5e2e970       |
| T7 fuzzier collision match                                                                                                                                    | fix/collision-match-is-fuzzier        | merged | 714c284       |
| T8 card quality checks                                                                                                                                        | feat/card-quality-checks              | merged | d17cf75       |
| F1a Busy People chapters 0 to 6                                                                                                                               | qa-fix/jfbp-ch0-6                     | merged | 0fff2d5       |
| F1b Busy People chapters 7 to 12                                                                                                                              | qa-fix/jfbp-ch7-12                    | merged | f3a337b       |
| F1c Busy People chapters 13 to 18                                                                                                                             | qa-fix/jfbp-ch13-18                   | merged | 574330f       |
| F1d Busy People chapters 19 to 26                                                                                                                             | qa-fix/jfbp-ch19-26                   | merged | ffaf325       |
| F3 Genki field edits and backfill                                                                                                                             | qa-fix/genki                          | merged | 9124b9b       |
| F2 Busy People structural and additions                                                                                                                       | qa-fix/jfbp-structural                | merged | 0dfcf31       |
| T4 vocab scan run                                                                                                                                             | qa/genki-vocab-scan                   | merged | 6fc77c8       |
| owner content-gate approvals (28 Busy People, 6 Genki)                                                                                                        | chore/additions-content-approvals     | merged | 4f8ac85       |
| vocab scan words into the Genki `qa-fix-2026-10` batch (54 cards)                                                                                             | qa-fix/genki-vocab-scan-words         | merged | efec3b1       |
| vocab scan reports an owner-excluded card as `excluded`                                                                                                       | fix/vocab-scan-reports-excluded       | merged | cdeb3a8       |
| F4 audio (35 units, 101 clips, none failed)                                                                                                                   | chore/qa-fix-audio                    | merged | bfce29b       |
| F5 close-out                                                                                                                                                  | qa-fix/close-out                      | merged | (this commit) |

## Wave B notes (2026-10-19)

Busy People: 456 of 466 field-edit findings fixed, 10 skipped (statuses in `qa/<slug>/2026-10-15/status/*.jsonl`, to be folded into findings.jsonl by F5). Genki: 62 of 68 fixed, 5 skipped, 1 wont-fix; 39 silent kanji cards became voiced words (backfill script, SPENT); six additions appended in batch `qa-fix-2026-10`. Cards needing audio are listed in `status/*.changed-text.txt` (58 lines). Preflight after the wave: Busy People has no collision FAIL left, 12 untaught-words ACK instances for F2 to judge, and the stale-package FAIL until F5 rebuilds; Genki has the 39 new voiced cards without clips (F4) and one ACK (有, whose reading the reader gave as 有る).

For the owner, from the fixers: three target changes on hand-trimmed clips were skipped (chapter-1-extras irl-l1-28 needs さん added; irl-l1-26 and irl-l1-27 need a ？), plus chapter-18-extras party-no-ato-bar-whiskey; the iie/īe spelling is a collection-wide choice (deck style rule says iie); あさごはん/ばんごはん and 高い/出す/右側/々 cannot move to an earlier chapter without replacing a delivered note (a card id is its written form), so their exclusion reasons were corrected instead; four duplicate or fragment cards were excluded in chapters 1 and 5 (irl-l1-41, irl-l1-42, 5th-floor, 1st-floor) and will appear as orphans.

Session-review items: corpus.json and cards.json already differed in chapters 13 to 18 before the pass (fill-in-the-blank cards exist only in cards.json; chapters 17 and 18 have corpus items with no card); the shared scratchpad folder let two agents overwrite each other's helper scripts; the pre-push hook failed and then passed with no change for two agents.

## Wave C notes (2026-10-19)

F2: 66 fixed, 2 skipped, 5 untaught-words instances accepted (names and one false match); 28 Busy People additions pending in batch `qa-fix-2026-10`; eight more delivered cards excluded (seven will be orphans). The Genki scan ran over all 26 chapters: 792 candidate rows, of which 701 are kana-only (kana unit, by budget) and 91 rows (77 forms) are kanji words; `vocab-scan-review.md` lists the 77 for the owner. Six Genki additions pending. Next: owner approves both batches and the review list, then F4 voices everything and F5 closes out.

Owner review (2026-10-19): both additions batches approved at the content gate (4f8ac85), and the 77-word list approved whole. Of the 77, 21 were already in the deck as cards the owner excluded under the words-only ruling of 2026-10-13 (phrases such as 背が高い, 知っています, 結構です, the three 言い方 labels): the scan's `cardedForms` skips excluded cards, so it reported them as having no card. They stay excluded; the owner can un-exclude any of them in the dashboard. 不思議 and 新鮮 duplicate the existing 不思議な and 新鮮な word cards and were dropped. The remaining 56 are pending additions in the Genki `qa-fix-2026-10` batch (efec3b1), one per chapter of first appearance, awaiting the content gate.

## Wave D notes (2026-10-19)

F4: `node src/cli/bin.js audio --run` over the 35 units with a missing or stale stage-made clip
(18 Genki, 17 Busy People), 101 clips fetched, none failed, about three and a half minutes in all.
Preflight afterwards: Genki clean apart from the package-freshness FAIL (rebuilt in F5) and the
accepted 有 ACK; Busy People has four audio-marker ACKs for the owner to hear at audition
(chapter-2/ja-arimasen, chapter-22-extras/nai-kasanai-ex1, chapter-25/suffix-kun,
chapter-25/adj-ii-present-neg; three were there before the pass).

F5: statuses folded into both `findings.jsonl` (no live finding left open), Fixed sections in
both run READMEs, both packages rebuilt, the delivery previewed and the orphans listed below.
Learner spot-checks of Lesson 8 and Genki Lesson 6 are in each run's `spot-check/`.

Session review (golden rule 5a), each put where it is enforced:

- **The scan reported the owner's own exclusions as candidates.** `cardedForms` skipped excluded
  cards, so 21 phrases cut under the words-only ruling came back on the review list and were
  approved again. Fixed in `src/reading/vocabScan.js` (`excludedForms`, decision `excluded` with the
  reason) with a test, and the reading-deck skill now says to keep such rows off the list.
- **This checklist was not kept up as tasks landed.** Every row still said `todo` after three waves,
  although the wave notes beneath it were written. The notes carried the state; the table did not.
  Filled in from `git log` in Wave D. A fresh session reading only the table would have restarted
  Wave A.
- **A one-off audit that re-derives a stage's rule drifts from it.** The scratchpad audio audit
  flagged 240 hand-curated Busy People clips as "text changed" because it compared their names
  against the default naming, which hand-picked clips never follow. Preflight's `audio text hash`
  check is the detector that already knows this; use it, not a re-derivation.

Spot-check follow-up (2026-10-19): the Genki Learner rerun found the scan words had come in without
the kanji cards a chapter build makes for them (夏休み with no 夏). The scan-to-additions step has no
character-gap step, so 21 kanji had no card anywhere (専 攻 菜 韓 室 帽 歴 史 義 務 呼 蒸 参 止 極 絵 劇 厳 険
証 夕); a scratch run of `fillCharacterGaps` over each unit's additions (dictionary, model, review, the
build's own path) appended them as silent kanji additions in the same batch, seven of them voiced
because they have one reading. Seventeen more kanji the words use are carded in a later chapter and
stay there: moving a delivered note between units is a migration. Two tooling fixes came out of it:
the additions audio gate accepts a silent card with no clip (a1faa14; before this a kanji addition
could never be marked ready), and preflight's `reading-uncarded-kanji` names a word whose kanji has no
card. The Busy People Lesson 8 rerun found five small new findings, fixed in place (efe1911).

## Orphan notes for the owner to delete in Anki

From `node --env-file=.env scripts/deliver-to-anki.mjs --dry` on 2026-10-19 (read-only). Deliver
never deletes a note, so a card the pass excluded stays in Anki until the owner removes it by
hand. Genki has none. Busy People has twelve, all under `Japanese for Busy People Book 1`; search
Anki for the card id (it is the note's first field tag) or the note id:

| Card id                                   | Note id       | Why it was cut                                                                                                 |
| ----------------------------------------- | ------------- | -------------------------------------------------------------------------------------------------------------- |
| irl-l1-41                                 | 1784422913964 | chapter-2-extras: a frame with its value missing (わたしのじゅうしょは); the complete sentence card carries it |
| irl-l1-42                                 | 1784422913974 | chapter-2-extras: a frame with its value missing (ホテルのじゅうしょは)                                        |
| amazing                                   | 1784680025356 | chapter-15-extras: duplicate of chapter-15/sugoi-great, the same すごい with a second English                  |
| 1st-floor                                 | 1785197980083 | chapter-5-extras: duplicate of chapter-5/ikkai-sub (same clip)                                                 |
| 5th-floor                                 | 1785197980281 | chapter-5-extras: duplicate of chapter-5/fifth-floor (same clip)                                               |
| zehi-3                                    | 1789935067168 | chapter-17-extras: untaught grammar, みてください needs the て-form Lesson 18 teaches (ruling 5)               |
| tokyo-tower                               | 1790023602550 | chapter-19: a named facility is a name, not a card (ruling 4)                                                  |
| ebisu-eki                                 | 1790023602601 | chapter-19: a named station is a name, not a card (ruling 4)                                                   |
| ginza-dori                                | 1790023602651 | chapter-19: a named street is a name, not a card (ruling 4)                                                    |
| nihongo-no-anime-ga-wakaru-no-wa-tanoshii | 1791843759892 | chapter-15-extras: untaught grammar, nominalising の outside the のが すきです frame (ruling 5)                |
| haha-ga-kureru-okashi-ga-suki             | 1791843760141 | chapter-15-extras: untaught grammar, a verb clause modifying a noun (ruling 5)                                 |
| niau-fuku-wo-kau-no-ga-suki               | 1791843760237 | chapter-15-extras: untaught grammar, a verb clause modifying a noun (ruling 5)                                 |

The same dry run previewed the delivery itself: Genki 88 updated, 0 added, 1,613 unchanged; Busy
People 640 updated, 121 added, 2,797 unchanged. Those counts were taken before the additions'
audio gate, so the approved additions (28 Busy People, 60 Genki) are not in them yet; they ship
once each is marked ready.
