# AnkiBuilder

A CLI that turns vocabulary — from a real-life lesson, a book, or a ready-made word list — into a
studyable Anki deck, complete with translations, pronunciation guides, and spoken audio.

> **Status:** built autonomously by an implementation harness (`.harness/`), one verified task at
> a time. See [`.harness/README.md`](./.harness/README.md) for how it's built, or
> [Implementation status](#implementation-status) below for what's done.

## How it works

Every deck moves through the same CLI stages, with **exactly two human review gates** in the local
dashboard (`npm run serve`): a **Corpus** review (English + target + pronunciation) and an **Audio**
review. Those two are the only states a lesson rests in — everything between assembling a lesson and
its first review runs as one uninterrupted `prepare` stage, so a lesson is never left half-built and
offered for review. The dashboard surfaces each lesson at its gate and is where you exclude items, fix
fields, and pick audio; the CLI advances it.

| Stage        | What happens                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **assemble** | Pull a word list together — from a bundled template, an EPUB chapter, or a lesson you dictate. Writes the English corpus, then chains straight into `prepare`.                                                                                                                                                                                                                                                                                              |
| **prepare**  | Everything between assembling and the first review, as one stage: translate each term and give it a pronunciation guide (via Claude); for an EPUB or dictated lesson, mine the source's fill-in-the-blank drills into extra practice cards and semantically de-dup them; then write each card's cross-lesson notes. Runs under one build claim so the card set is final — and complete — before anyone reviews it. The **Corpus** review is the first gate. |
| **audio**    | Each term gets one spoken recording (the default take), via ElevenLabs. A card may carry an optional `reading` (a phonetic spelling in the target script) that TTS speaks instead of `target`. For a language with an "alt audio" transform (Japanese appends `。`) the default is the with-`。` take. Every other variant — the no-`。` take, comma/bracket forms, kana+kanji — is generated on demand in the dashboard's audio review, not up front.      |
| **deck**     | Everything is packaged into a `.apkg` file, ready to import into Anki.                                                                                                                                                                                                                                                                                                                                                                                      |

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
# assemble already chained into `prepare`, so $RUN is translated and reviewable.
# Corpus review in the dashboard (npm run serve): check the English AND the target +
# pronunciation together, exclude/fix anything, then click "Mark reviewed" — that's the
# gate `audio` checks (don't spend TTS credits on an un-reviewed lesson).
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
# ...Corpus-review in the dashboard, then audio for that lesson; repeat per lesson...
anki-builder deck --book-dir output/epubs/<book-slug>   # merges every chapter into one deck
```

Audio generation needs an ElevenLabs API key — copy `.env.example` to `.env` and add
`ELEVENLABS_API_KEY=...`. Everything else works without any external account.

Optional: install `ffmpeg` (`brew install ffmpeg`) to auto-trim the trailing silence/artifact
ElevenLabs leaves on each clip. It's best-effort — audio still builds fine without it.

Run the local dashboard (`npm run serve`). Readiness is tracked **per lesson (sub-deck)**, not per
deck: a lesson passes **two review gates** (Corpus, then Audio) and becomes **Built** only when you
click **Mark done** — the final human sign-off. The home page splits your lessons into **Not finished**
(a build that stopped before there was anything to review — re-run `assemble` to resume it),
**In review** (each with a _Review_ action) and **Built · ready to study** (a single **Open** action)
— with a deck's lessons grouped under its heading. A deck with some lessons done and others still in
review appears (grouped) in **both** sections, so a finished lesson is never stranded behind an
in-progress sibling. **Open** on a built lesson lands on the same edit-audio view — browsing and
audio-editing are one page, not two. The two views behind them:

- **Review** (`/review/:type/:id` for the whole deck, or `/review/:type/:id/:unit` for one lesson) —
  the guided, editable workflow, **two steps**: **① Corpus** (English **+ target + pronunciation**
  together — verify the list and the translation at one gate; exclude items, fix target/pronunciation
  inline, **Mark reviewed**) → **② Audio** (play a clip, **Replace** it, or **Generate** fresh
  ElevenLabs variants to audition and pick — including, for Japanese, **Generate (kanji)**, which
  turns the card's kana reading into natural kanji+kana orthography that ElevenLabs voices more
  naturally than all-kana), then **Mark done**. A lesson edits at the audio stage on its own,
  independent of its siblings' stages. AI-suggested / uncertain items are badged at every step.
- **Browse** (`/deck/:type/:id`, or `/deck/:type/:id/:unit` for one lesson) — a **read-only** look
  at a finished deck: collapsible lessons, audio played inline (served over HTTP, so no size limit).
  No editing.

There is **one `.apkg` per group** (a book/course, or a template) — never a per-lesson file. It's the
merge of **only done lessons** (`deck --book-dir`, or the dashboard rebuild), so an in-review lesson
is never packaged into the shippable deck. The dashboard keeps that file current automatically —
marking a lesson done (or reopening one) rebuilds it, and audio edits to an already-done lesson
rebuild it too. There's **no download button**: the dashboard runs on your machine, so the `.apkg` is
already on disk (`output/<…>/<deck-name>.apkg`) — import it into Anki directly.

**Delivering updates to an existing collection: use the deliver tool, not drag-and-drop.** Once you
already study these decks, re-importing an `.apkg` won't apply note-type structure changes (a new field,
a template/CSS tweak) and you don't want to touch scheduling. `scripts/deliver-to-anki.mjs` (or the
dashboard's **Deliver to Anki** button) pushes the on-disk state into a running Anki over AnkiConnect:
it backs up first (with scheduling), force-syncs the note type to the code's definition, and updates
each note's fields in place by GUID — deterministic, idempotent, scheduling preserved. It also syncs with
AnkiWeb before and after (default; `--no-sync` to skip). Preview with
`node scripts/deliver-to-anki.mjs --dry`. It refuses outright if two cards in a deck share an `id`,
because the note key is `abid:<card.id>` deck-wide: two such cards would resolve to one Anki note and
the later one would quietly overwrite the earlier. See the
[skill](./.claude/skills/build-anki-deck/SKILL.md) for details.

Start with `--read-only` to disable all editing (Review becomes read-only too).

```sh
npm run serve                 # then open the printed http://localhost:… URL (Ctrl+C to stop)
npm run serve -- --read-only  # browse only, no editing
```

(`npm run serve` is just `anki-builder serve`; pass a different port with `npm run serve -- --port 5000`.)

Or render a single finished deck to a self-contained, shareable HTML page (audio embedded inline;
auto-split into parts for a large deck):

```sh
anki-builder view-deck --apkg output/epubs/<book-slug>/<book-slug>.apkg
```

For the full command reference (every flag, every source type), see the skill's
[Command Reference](./.claude/skills/build-anki-deck/SKILL.md#command-reference).

## Where things live

- Each run's artifacts (`corpus.json`, `cards.json`, `<name>.apkg`) live in its run
  directory, wherever you pointed `--run`. (Review happens live in the dashboard, not as a per-stage
  HTML file.)
- Every source type lives under its own reserved folder of `output/` when you pass `--output-root`:
  EPUB books under `output/epubs/<book-slug>/`, lesson-based courses under
  `output/courses/<course-slug>/` (each one folder per chapter/lesson, plus a merged `<slug>.apkg` at
  the top), and bundled templates under `output/templates/<template-name>/<language>/` (one folder
  per language, its `<template>-<lang>.apkg` right inside — no merge step, since there's only ever one unit per
  language).
- An EPUB book folder also keeps its own copy of the source file (`book.epub`) and a `book.json`
  marker, so it's a self-contained record of a book you've worked on. That's what lets you build a
  later chapter with `--book <book-slug>` (no need to re-find the original `.epub`), and lets the
  skill offer a list of previously-worked books to pick from.
- A chapter may also have an **extras** unit beside it, `chapter-<n>-extras/`, holding the drill cards
  built from the same chapter (the skill's Step 3b). It is an ordinary unit with its own two review
  gates. It ships as a **sibling** of its base lesson, `Book::<lesson label> (Extras)`, never nested
  under it: Anki studies a parent deck together with everything beneath it, so a nested drill unit
  would make the lesson impossible to study on its own. Side by side, the two decks sort adjacent and
  each gets its own new-cards-per-day limit, which keeps the base lesson the size the normal pipeline
  produced. An extras unit deliberately carries **no** `epubHash`, so marking it reviewed can't
  overwrite its base lesson's entry in the dedup library.
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
- [x] Audio stage (ElevenLabs `eleven_v3`, cache segmented by model; speaks the per-card `reading` when set; default take only, other variants generated on demand in the dashboard; per-language TTS text normalization — Japanese strips editorial spaces so they aren't voiced as pauses)
- [x] Every clip keeps its untouched original beside the auto-trimmed take (`<hash>.orig.mp3` next to
      `<hash>.mp3`, and the same pair for Generate previews and Replace uploads). The trailing-silence
      trim used to run inside the ElevenLabs fetch and throw the raw take away, which made its mistakes
      permanent — it only ever cuts the end, so leading silence always survived and an over-eager cut
      was unrecoverable. A card now carries `audioOriginal` / `audioAuto` / `audioManual`, and the
      `audio` the deck embeds is derived from them
- [x] Manual trim editor in the audio review — the table shows **Original** (with Replace / Generate)
      beside **In use** (the auto-trimmed take, or your hand cut), and **Trim…** opens a waveform with
      draggable start/end handles, snap-to-speech, and selection playback. Every cut is made from the
      original, so the handles drag freely in both directions — including back out past where the
      automatic trim landed — and "revert to automatic" is always one click away
- [x] Background-noise cleanup, on by default. ElevenLabs clips carry low-frequency rumble under the
      voice (~94% of the noise energy sits below 80 Hz), which a steep low-cut removes without touching
      speech. It runs BEFORE the trim, because the rumble is loud enough to defeat silence detection
      and make the trim give up. Three chains (`standard` / `gentle` / `aggressive`) are selectable per
      card in the trim modal for the occasional clip the default handles badly;
      `ANKI_BUILDER_AUDIO_CLEANUP` sets the default or turns it off
- [x] `.apkg` deck builder (two-template model; per-language `AnkiBuilder <lang>` note type that
      auto-embeds the language's font, e.g. Japanese → Klee One)
- [x] Per-language deck font — embeds a script-appropriate font (Japanese → Klee One, a Kyōkashō
      textbook face) so kana/kanji render the same on every client; `restyle-font` applies it to any
      existing `.apkg`, including third-party decks
- [x] Two review gates in the dashboard — **corpus** (exclude / inline-edit target + pronunciation /
      mark reviewed) and **audio** (audition + Generate variants, incl. Japanese kana+kanji) — with
      write-back to the run's JSON. Replaces the old per-stage HTML artifacts + `review`/`render-review`
      CLI commands
- [x] `view-deck` — reads a built `.apkg` back and renders a read-only deck-browser artifact (cards
      grouped by sub-deck, audio embedded inline per card; auto-splits large decks into parts)
- [x] `serve` — local deck-dashboard web app (Node builtins only) with two views per deck: a
      **Review** view (`/review/...`) — the guided, editable workflow across the two gates (corpus →
      audio, with exclude / edit / mark-reviewed / generate / rebuild write-back and
      AI-suggested/uncertain badges) — and a read-only **Browse** view (`/deck/...`) that streams audio
      over HTTP with no size cap. Pluggable per-format adapters (`src/server/adapters/`); `--read-only`
      disables all editing
- [x] `prepare` — translate → fill-in-the-blank enrichment → semantic de-dup → cross-lesson notes as
      ONE stage, chained automatically from `assemble` (`--no-prepare` opts out), so a lesson has no
      resting state between "assembled" and "reviewable". Idempotent and fail-open per step; keeps its
      claim on failure so a crash shows as interrupted. A corpus-only run dir is `incomplete` — not a
      review stage — and the dashboard files it under **Not finished**
- [x] CLI orchestrator (resumable run directories)
- [x] Build-aware dashboard — a lesson a CLI stage is currently writing renders read-only with a
      badge naming the stage, and the server refuses writes to it (409) so a stale browser tab can't
      clobber the run; a crashed build shows as interrupted and can be cleared. The audio stage merges
      its results into the current file rather than overwriting, so edits made while it ran survive
- [x] Safe deck rebuilds — the merged `.apkg` is published by atomic rename, so a reader never sees a
      half-written package, and a rebuild reads the done-set and publishes in one event-loop turn, so
      two dashboard-triggered rebuilds can't interleave
- [x] Write-once chapter cache — an extracted chapter is published images-first, chapter-file-last and
      then reused, so a re-run (or a later lesson of the same book) neither re-extracts the same 30-50
      files nor hands the extractor a chapter whose images haven't landed yet
- [x] Reserved run directories — a chapter/lesson folder is created and claimed the moment it is
      allocated, so a crashed build's claim lets the retry reclaim its own folder instead of leaking a
      fresh sequence number, and an accidental second run of the same chapter is refused outright
      rather than quietly building it twice
- [x] Review gates that check state, not history — a lesson is only offered for review once every
      pre-review pass has recorded a complete run, and only mergeable into the deck once it has passed
      that review. Enforced in the write-back, the render and the home-page bucketing from one shared
      verdict, so however a lesson got here (a bare `translate`, an interrupted `prepare`, a lesson
      built before a pass existed) it cannot present as finished when it isn't
- [x] Build lessons in order — `assemble` warns when an earlier lesson of the same book hasn't been
      marked reviewed, since the backward-dedup library is written by that sign-off; and `prepare`
      leaves its enrichment markers unset when the earlier lessons it reads aren't built yet, so a
      re-run repairs the result instead of freezing a thin one in
- [x] Atomic artifact writes — every file written while something else may be reading it (`cards.json`,
      `corpus.json`, the TTS cache, the EPUB copies, the dedup library, the markers) is published by
      writing a temp file beside it and renaming into place. The dashboard (`serve`) runs for the whole
      of a build and `JSON.parse`s these files with no try/catch, so a torn read would be a hard
      failure, not a glitch
- [x] `build-anki-deck` conversational skill
- [ ] End-to-end: build a real travel deck and verify it in Anki

See `.harness/tracking/TASKS.json` for the authoritative, up-to-date backlog.
