# AnkiBuilder

A CLI that turns vocabulary — from a real-life lesson, a book, or a ready-made word list — into a
studyable Anki deck, complete with translations, pronunciation guides, and spoken audio.

> **Status:** built autonomously by an implementation harness (`.harness/`), one verified task at
> a time. See [`.harness/README.md`](./.harness/README.md) for how it's built, or
> [Implementation status](#implementation-status) below for what's done.

## How it works

Every deck moves through the same four CLI stages. You **review** the result of each stage in the
local dashboard (`npm run serve`) — the dashboard surfaces every run at its current stage and is
where you exclude items, fix fields, and pick audio; the CLI advances a run to the next stage.

| Stage         | What happens                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **assemble**  | Pull a word list together — from a bundled template, an EPUB chapter, or a lesson you dictate. Review it in the dashboard (exclude items, mark the lesson reviewed) before translating.                                                                                                                                                                                                                                                                |
| **translate** | Each term gets translated and given a pronunciation guide, via Claude. Review/fix target + pronunciation in the dashboard.                                                                                                                                                                                                                                                                                                                             |
| **audio**     | Each term gets one spoken recording (the default take), via ElevenLabs. A card may carry an optional `reading` (a phonetic spelling in the target script) that TTS speaks instead of `target`. For a language with an "alt audio" transform (Japanese appends `。`) the default is the with-`。` take. Every other variant — the no-`。` take, comma/bracket forms, kana+kanji — is generated on demand in the dashboard's audio review, not up front. |
| **deck**      | Everything is packaged into a `.apkg` file, ready to import into Anki.                                                                                                                                                                                                                                                                                                                                                                                 |

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
# Review the corpus in the dashboard (npm run serve): exclude anything wrong, then
# open the deck and click "Mark reviewed" — that's the gate `translate` checks.
anki-builder translate --run "$RUN"
# ...review/fix translations in the dashboard...
anki-builder audio --run "$RUN" --voice <voiceId>
# ...audition audio + generate variants in the dashboard...
anki-builder deck --run "$RUN" --name "Travel Spanish"
```

```sh
# From a book — organizes everything under output/epubs/<book-slug>/ and keeps a copy of
# the EPUB (book.epub) inside that folder.
#
# Prefer selecting by the book's OWN lesson (from its table of contents) rather than a raw
# spine index: an EPUB "chapter" is just one internal content file, which is NOT guaranteed
# to line up with a lesson — a lesson can span several files, and dividers/quizzes/front
# matter are their own files. First list the book's lessons, then pick one:
anki-builder assemble --output-root output --epub mybook.epub --list-lessons --lang ja
anki-builder assemble --output-root output --epub mybook.epub --lesson "Lesson 3" --lang ja
# --lesson takes a [number] from --list-lessons or a label substring, resolves it to the
# right span of spine files (however many), and extracts them all as one unit.
#
# --chapter-number <N> still works as a low-level escape hatch (the Nth spine file), e.g.
# for a book whose EPUB has no usable table of contents:
anki-builder assemble --output-root output --epub mybook.epub --chapter-number 1 --lang ja
# For a later lesson of a book you've already worked on, pick it by slug instead of
# re-locating the file — assemble reads the copy it kept:
anki-builder assemble --output-root output --book <book-slug> --lesson "Lesson 4" --lang ja
# ...review in the dashboard, then translate / audio for that lesson; repeat for each lesson...
anki-builder deck --book-dir output/epubs/<book-slug>   # merges every chapter into one deck
```

Audio generation needs an ElevenLabs API key — copy `.env.example` to `.env` and add
`ELEVENLABS_API_KEY=...`. Everything else works without any external account.

Optional: install `ffmpeg` (`brew install ffmpeg`) to auto-trim the trailing silence/artifact
ElevenLabs leaves on each clip. It's best-effort — audio still builds fine without it.

Run the local dashboard (`npm run serve`) and each deck offers two views:

- **Review** (`/review/...`) — the guided, editable workflow, one purpose-built page per stage:
  **① Corpus** (English only — "is this the right list?" — exclude items, mark reviewed) →
  **② Translation** (English + target + romaji — exclude / fix inline) → **③ Audio** (play a clip,
  **Replace** it, or **Generate** fresh ElevenLabs variants to audition and pick — including, for
  Japanese, **Generate (kanji)**, which turns the card's kana reading into natural kanji+kana
  orthography that ElevenLabs voices more naturally than all-kana). Then **Rebuild deck** to
  regenerate the `.apkg`. AI-suggested / uncertain items are badged at every stage.
- **Browse** (`/deck/...`) — a **read-only** look at a finished deck: collapsible lessons, audio
  played inline (served over HTTP, so no size limit). No editing.

Start with `--read-only` to disable all editing (Review becomes read-only too).

```sh
npm run serve                 # then open the printed http://localhost:… URL (Ctrl+C to stop)
npm run serve -- --read-only  # browse only, no editing
```

(`npm run serve` is just `anki-builder serve`; pass a different port with `npm run serve -- --port 5000`.)

Or render a single finished deck to a self-contained, shareable HTML page (audio embedded inline;
auto-split into parts for a large deck):

```sh
anki-builder view-deck --apkg output/epubs/<book-slug>/deck.apkg
```

For the full command reference (every flag, every source type), see the skill's
[Command Reference](./.claude/skills/build-anki-deck/SKILL.md#command-reference).

## Where things live

- Each run's artifacts (`corpus.json`, `cards.json`, `deck.apkg`) live in its run
  directory, wherever you pointed `--run`. (Review happens live in the dashboard, not as a per-stage
  HTML file.)
- Every source type lives under its own reserved folder of `output/` when you pass `--output-root`:
  EPUB books under `output/epubs/<book-slug>/`, lesson-based courses under
  `output/courses/<course-slug>/` (each one folder per chapter/lesson, plus a merged `deck.apkg` at
  the top), and bundled templates under `output/templates/<template-name>/<language>/` (one folder
  per language, its `deck.apkg` right inside — no merge step, since there's only ever one unit per
  language).
- An EPUB book folder also keeps its own copy of the source file (`book.epub`) and a `book.json`
  marker, so it's a self-contained record of a book you've worked on. That's what lets you build a
  later chapter with `--book <book-slug>` (no need to re-find the original `.epub`), and lets the
  skill offer a list of previously-worked books to pick from.
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
- [x] Pedagogical sort — every assembled corpus is re-ordered (dependency-aware LLM pass) so a
      learner meets vocabulary before the sentences built from it; on by default, `--no-sort` opts out
- [x] Translation stage (Claude — one Sonnet-medium call per group, no batching)
- [x] Spoken-form `reading` field — numbers stay as digits in `target` (natural display, e.g. `2,000えん`)
      while a spelled-out `reading` (`にせんえん`) drives BOTH the romaji pronunciation and the audio,
      since digits break the romanizer and TTS
- [x] Audio stage (ElevenLabs `eleven_v3`, cache segmented by model; speaks the per-card `reading` when set; default take only — Japanese default appends `。`, other variants generated on demand in the dashboard; per-language TTS text normalization — Japanese strips editorial spaces so they aren't voiced as pauses)
- [x] `.apkg` deck builder (two-template model; per-language `AnkiBuilder <lang>` note type that
      auto-embeds the language's font, e.g. Japanese → Klee One)
- [x] Per-language deck font — embeds a script-appropriate font (Japanese → Klee One, a Kyōkashō
      textbook face) so kana/kanji render the same on every client; `restyle-font` applies it to any
      existing `.apkg`, including third-party decks
- [x] Review at every stage in the dashboard — corpus (exclude items / mark reviewed), translate
      (exclude / inline-edit target + pronunciation), audio (audition + Generate variants, incl.
      Japanese kana+kanji) — with write-back to the run's JSON. Replaces the old per-stage HTML
      artifacts + `review`/`render-review` CLI commands
- [x] `view-deck` — reads a built `.apkg` back and renders a read-only deck-browser artifact (cards
      grouped by sub-deck, audio embedded inline per card; auto-splits large decks into parts)
- [x] `serve` — local deck-dashboard web app (Node builtins only) with two views per deck: a
      **Review** view (`/review/...`) — the guided, editable per-stage workflow (corpus English-only →
      translation → audio, with exclude / edit / mark-reviewed / generate / rebuild write-back and
      AI-suggested/uncertain badges) — and a read-only **Browse** view (`/deck/...`) that streams audio
      over HTTP with no size cap. Pluggable per-format adapters (`src/server/adapters/`); `--read-only`
      disables all editing
- [x] CLI orchestrator (resumable run directories)
- [x] `build-anki-deck` conversational skill
- [ ] End-to-end: build a real travel deck and verify it in Anki

See `.harness/tracking/TASKS.json` for the authoritative, up-to-date backlog.
