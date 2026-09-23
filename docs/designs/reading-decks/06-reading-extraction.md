# 06 Reading extraction

Depends on: 01, 04 and 05. Status: not built.

## What

The phase that takes one chapter of a book to a reviewable reading corpus. It is built the way phase 1
is (`scripts/build-base.mjs`, `src/agents/basePhase.js`): the steps are data, one script drives them,
`--dry` prints the steps and what each would write and spends nothing, and the run checks its own
artifacts at the end.

```
node scripts/build-reading.mjs <unitDir> <epubHash> <n> --lang <code> [--dry]
```

It refuses a collection whose `deckKind` is not `reading` (01), before any paid step.

## The steps

`READING_PHASE_STEPS`, beside `BASE_PHASE_STEPS` in `src/agents/basePhase.js` or in its own module
next to it.

| #   | step                     | kind          | artifact                   | notes                                             |
| --- | ------------------------ | ------------- | -------------------------- | ------------------------------------------------- |
| 1-3 | tables, sections, images | deterministic | `candidates/*-raw.json`    | the same raw material phase 1 uses                |
| 4   | table reader             | agent         | `candidates/tables.json`   | vocabulary and kanji tables                       |
| 5   | chapter reader           | agent         | `candidates/chapter.json`  | set phrases and lists outside a table (greetings) |
| 6   | image reader             | agent         | `candidates/images.json`   | only when the chapter has images with text        |
| 7   | reconcile                | deterministic | `corpus.json`              | merge, one card per front, backward dedup         |
| 8   | snapshot                 | deterministic | `as-generated.json`        | the pre-review baseline                           |
| 9   | coverage adversary       | agent         | `candidates/coverage.json` | enumerates independently; the diff is code        |

The three orderings phase 1 pins with tests hold here too, and get the same tests: raw material before
judgement, the merge before the snapshot, and the adversary last and never shown the corpus.

### The agents

Each agent is a reading variant of the phase 1 role with the same name (`tableSpecialist.js`,
`chapterReader.js`, `imageSpecialist.js`, `coverageAdversary.js`), with its own prompt in `docs/`:
`reading-table-prompt.md`, `reading-chapter-prompt.md`, `reading-image-prompt.md` and
`reading-coverage-prompt.md`. Every one includes `docs/card-rules-reading.md` (04) and the language
plugin's block (05).

Each returns items with `target`, `english`, and `reading` where the plugin requires one. Nothing
else: no scene, hint, category, note or pronunciation.

They are registered in the role registry and pinned like every other pass, with the coverage
adversary pinned above the roles it checks, for the reasons PIPELINE.md gives for phase 1's adversary.
The runtime pin-order check covers them.

### Reconcile

Deterministic, and where three of the rules in 04 are enforced rather than hoped for:

- Items with the same target merge into one, their English joined (rule 3).
- A single character that is also a word keeps the word (rule 4).
- A target already carded in an earlier chapter of this collection is dropped, using the reading
  collection's own dedup corpora (01). Dropped items are listed in the run report, never discarded
  silently.

### After extraction

`prepare` runs as it does for a speaking unit, minus romanisation, which a reading card never shows.
Then Gate 1.

## Done when

- `--dry` on a fixture chapter lists the nine steps and spends nothing.
- A test pins the step order and the three orderings above.
- A fixture chapter with a vocabulary table and a kanji table produces the expected corpus: kanji
  spellings as targets with kana readings, kanji cards with meanings, a merged homograph, and a
  backward-deduplicated word listed in the report.
- A speaking collection passed to the script is refused before step 4.
