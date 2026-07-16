# AnkiBuilder

A CLI that turns vocabulary — from a real-life lesson, a book, or a ready-made word list — into a
studyable Anki deck, complete with translations, pronunciation guides, and spoken audio.

> **Status:** built autonomously by an implementation harness (`.harness/`), one verified task at
> a time. See [`.harness/README.md`](./.harness/README.md) for how it's built, or
> [Implementation status](#implementation-status) below for what's done.

## How it works

Every deck moves through the same five stages, each one producing a reviewable artifact before
the next stage runs:

| Stage         | What happens                                                                                                                                                              |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **assemble**  | Pull a word list together — from a bundled template, an EPUB chapter, or a lesson you dictate.                                                                            |
| **review**    | You check the list over (a browsable HTML page) and drop anything that shouldn't be there.                                                                                |
| **translate** | Each term gets translated and given a pronunciation guide, via Claude.                                                                                                    |
| **audio**     | Each term gets a spoken recording, via ElevenLabs. A card may carry an optional `reading` (a phonetic spelling in the target script) that TTS speaks instead of `target`. |
| **deck**      | Everything is packaged into a `.apkg` file, ready to import into Anki.                                                                                                    |

For books and courses, each chapter/lesson goes through this individually and then gets merged
into one deck with a sub-deck per chapter/lesson.

**For the full walkthrough — including how to pick a source, review each stage, and generate
audio — use the [`build-anki-deck`](./.claude/skills/build-anki-deck/SKILL.md) Claude Code skill.**
It drives the CLI commands below for you and knows when to pause for your review.

## Quick start

```sh
# From a bundled template — no source material needed. Templates are
# language-agnostic (English terms + categories only); --lang picks the language.
# --output-root files the deck under output/templates/<name>/<language>/.
anki-builder assemble --output-root output --template travel-essentials --lang es
RUN=output/templates/travel-essentials/es      # the dir assemble just resolved
anki-builder review --run "$RUN"
anki-builder translate --run "$RUN"
anki-builder audio --run "$RUN" --voice <voiceId>
anki-builder deck --run "$RUN" --name "Travel Spanish"
```

```sh
# From a book, chapter by chapter — organizes everything under output/epubs/<book-slug>/
anki-builder assemble --output-root output --epub mybook.epub --chapter-number 1 --lang ja
# ...review / translate / audio for that chapter, then repeat for each chapter...
anki-builder deck --book-dir output/epubs/<book-slug>   # merges every chapter into one deck
```

Audio generation needs an ElevenLabs API key — copy `.env.example` to `.env` and add
`ELEVENLABS_API_KEY=...`. Everything else works without any external account.

For the full command reference (every flag, every source type), see the skill's
[Command Reference](./.claude/skills/build-anki-deck/SKILL.md#command-reference).

## Where things live

- Each run's artifacts (`corpus.json`, `cards.json`, `deck.apkg`, review pages) live in its run
  directory, wherever you pointed `--run`.
- Every source type lives under its own reserved folder of `output/` when you pass `--output-root`:
  EPUB books under `output/epubs/<book-slug>/`, lesson-based courses under
  `output/courses/<course-slug>/` (each one folder per chapter/lesson, plus a merged `deck.apkg` at
  the top), and bundled templates under `output/templates/<template-name>/<language>/` (one folder
  per language, its `deck.apkg` right inside — no merge step, since there's only ever one unit per
  language).
- Cached audio and a registry of EPUBs you've used live in `.anki-builder/` inside this repo
  (gitignored) so re-runs don't redo expensive work.

The exact folder layouts and caching rules are documented in
[`docs/PIPELINE.md`](./docs/PIPELINE.md).

## Development

Definition of Done (mirrored verbatim in `.github/workflows/ci.yml`):

```sh
npm ci
npm run format:check
npm run lint
npm test
npm run build
```

## Learn more

- [`docs/PIPELINE.md`](./docs/PIPELINE.md) — how each stage works internally: dedup logic, prompt
  wiring, caching, file formats.
- [`.harness/docs/HARNESS.md`](./.harness/docs/HARNESS.md) — the autonomous build loop that
  develops this project.
- [`CLAUDE.md`](./CLAUDE.md) — working conventions for contributing (by hand or via the harness).

## Implementation status

10 of 11 backlog tasks are done:

- [x] Project scaffold, CI
- [x] Pipeline data contracts + run-directory conventions
- [x] Bundled template corpora (language-agnostic; `travel-essentials`, `numbers`)
- [x] EPUB → candidate corpus extraction (with dedup + convention-awareness)
- [x] Translation stage (Claude)
- [x] Audio stage (ElevenLabs, cached; speaks an optional per-card `reading` when set)
- [x] `.apkg` deck builder (two-template model)
- [x] Review-gate artifacts for each stage
- [x] CLI orchestrator (resumable run directories)
- [x] `build-anki-deck` conversational skill
- [ ] End-to-end: build a real travel deck and verify it in Anki

See `.harness/tracking/TASKS.json` for the authoritative, up-to-date backlog.
