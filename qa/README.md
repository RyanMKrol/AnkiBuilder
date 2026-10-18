# Deck QA: the learner pass

A read-only review of a finished collection from the learner's side, and from the book's side,
producing a backlog another agent can work through. Nothing under `output/` or `.anki-builder/` is
changed by a QA run. The only writes are the report files under `qa/<collection>/<date>/`.

This is different from the review gates in `.claude/skills/build-anki-deck/SKILL.md`. The gates ask
"is this unit right?" once, when it is built. This pass asks "what is it like to learn from the whole
deck?" after the fact, with every unit in front of it at once.

## What the learner is

- Has never studied Japanese before this deck. Can read kana (the book assumes it, with its own kana
  chapters), nothing else.
- Studies the units in **book order**: the order the book prints them, so a supplement the book
  places between two lessons is met there. `scripts/qa-ledger.mjs` prints that order. Owner ruling,
  2026-10-15.
- At any unit, knows exactly what the earlier units' cards taught, including their notes, and
  nothing else. Does not have the book open.
- Meets each card in isolation, both directions (Recognition: target on the front; Production:
  English on the front), with the cards shuffled, months after the unit was first studied.

## The roles

Four roles per collection, three of them per chapter. A chapter is a base unit plus its extras unit
(a reading collection has one unit per chapter).

| Role            | Sees                                                                                                                  | Asks                                                                                                                                                | Prompt                   |
| --------------- | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| **Learner**     | the ledger of earlier cards; this chapter's cards rendered as faces; preflight's notes on the unit. **Not the book.** | can I tell what the card wants, can I answer it from what I was taught, does the back teach me, is anything wrong, confusing, missing or given away | `prompts/learner.md`     |
| **Reader**      | the chapter's text and pictures; this chapter's cards.json files                                                      | what does the chapter teach, is each thing carded, is each card faithful to the book                                                                | `prompts/reader.md`      |
| **Verifier**    | the Learner's and Reader's findings; the cards; the chapter                                                           | is each finding real                                                                                                                                | `prompts/verifier.md`    |
| **Synthesizer** | every chapter's reports                                                                                               | what patterns run across the deck                                                                                                                   | `prompts/synthesizer.md` |

The Learner must not see the book: a learner reviewing in Anki does not have it open, so a card has
to stand on its own. The Reader must not simulate a learner: it is checking fidelity. Keeping the two
apart is what makes each one's verdict mean something.

Model choice for the run is recorded in the run's README. The judgement passes (Learner, Reader)
need a strong model; the Verifier and Synthesizer the strongest available.

## The tools

```sh
node scripts/qa-render-unit.mjs <unitDir>          # every shipping card as its Anki faces
node scripts/qa-ledger.mjs <unitDir> [--notes]     # everything taught before this unit, in study order
node scripts/chapter-outline.mjs <epubHash> <n>    # the chapter's text (the Reader's source)
node scripts/chapter-images.mjs <epubHash> <n>     # its pictures, with paths to open
node scripts/preflight.mjs <collectionDir> --verbose   # the deterministic findings, not to be re-reported
```

For a reading collection there is one more, and it is the only QA tool that spends money:

```sh
node scripts/reading-vocab-scan.mjs <collectionDir> [--dry] [--date YYYY-MM-DD]
```

It runs the reading chapter reader over every chapter under the widened card rules 1 (a word from
anywhere in the chapter is a card; owner ruling, 2026-10-18), one model call per chapter, and writes
`qa/<slug>/<date>/vocab-scan.jsonl`: one line per candidate word with its chapter, where it appeared,
whether the book glossed it, whether a later chapter's list introduces it ("skip, carded there"), and
whether a card already exists. `--dry` prints the plan and spends nothing; the real run waits for the
owner's approval of the spend. It writes nothing under `output/`.

The renderer goes through the deck's real templates (`src/deck/cardFaces.js`), so a face it prints
is the face Anki shows. Both scripts are read-only and tested against temp fixtures
(`test/scripts/qaTools.test.js`).

## The report

```
qa/<collection>/<YYYY-MM-DD>/
  README.md              run parameters: learner model, study order, models used, chapters covered
  findings.jsonl         the backlog: one line per actionable finding, after verification
  themes.md              cross-deck patterns, ranked by how many cards they touch
  units/<chapter>.learner.md     the Learner's narrative for the chapter
  units/<chapter>.reader.md      the Reader's narrative for the chapter
  findings/<chapter>.jsonl       that chapter's verified findings (findings.jsonl is their union)
```

`<chapter>` is the base unit's directory name (`chapter-8`), covering its extras unit too.

### A finding

One JSON object per line:

```json
{
  "id": "chapter-8/tempura-o-tabemasu/unanswerable/1",
  "collection": "japanese-for-busy-people-book-1-kana",
  "unit": "chapter-8-extras",
  "cardId": "tempura-o-tabemasu",
  "face": "production",
  "kind": "unanswerable",
  "severity": "should-fix",
  "source": "learner",
  "claim": "The English fits three different targets the learner has met.",
  "evidence": "Production front: 'I eat tempura.' Cards tempura-o-tabemasu, ex8-tempura and f8-tabemasu-tempura all carry that gloss.",
  "fix": "Add a hint naming the particle or the register, or a scene.",
  "verdict": "CONFIRMED",
  "verdictReason": "All three cards ship with the same English and no cue.",
  "status": "open"
}
```

- `face`: `recognition`, `production`, `reading`, or `unit` for a finding about the unit as a whole.
- `kind`: one of `wrong-content` (target, romaji or English is wrong), `unanswerable` (the front
  does not determine the answer), `ambiguous` (collides with another card the learner knows),
  `missing-info` (needs a scene, hint or note), `leaks-answer` (a scene or hint gives it away),
  `untaught-prerequisite` (uses a word or form the learner has not met by this point),
  `note-restates-card`, `note-unverifiable` (a claim the learner cannot check and the book does not
  make), `book-gap` (the chapter teaches it, no card does), `book-mismatch` (the card disagrees with
  the book), `ordering` (a card lands before what it depends on), `other`.
- `severity`: `blocker` (teaches something false, or cannot be studied), `should-fix`, `polish`.
- `verdict`: `CONFIRMED`, `PLAUSIBLE` or `REJECTED`, with the Verifier's one-line reason. Rejected
  findings stay in the file so the rejection is on record; a fixer skips them.
- `status`: `open` when written. The fixer sets `fixed`, `skipped` (with a `statusReason`) or
  `wont-fix`. That is how the backlog is worked through and how a second run can see what the first
  one caused.

The book is respected: a finding never says the book is wrong. If a card is faithful to the book and
the book's choice looks odd, that is not a finding.

## Running it

1. Build the tooling branch is merged and `npm run ci` is green.
2. Create `qa/<collection>/<date>/` with a README naming the parameters.
3. Per chapter, in parallel: Learner and Reader. Then the Verifier on their findings.
4. Concatenate `findings/*.jsonl` into `findings.jsonl`.
5. Synthesizer over `units/` and `findings.jsonl`, writing `themes.md`.
6. Hand `findings.jsonl` and `themes.md` to the fixing agent, which works on a branch per theme and
   flips `status` as it goes.

A pilot on two chapters, read by a human, comes before the full run.
