# AnkiBuilder

A Node CLI/library for building Anki flashcard decks — it reads input sources and generates
Anki deck files (e.g. `.apkg`).

> **Status:** greenfield. The project is built autonomously by the implementation harness
> (`.harness/`), one fully-verified task at a time, gated on green CI. See
> [`.harness/README.md`](./.harness/README.md) and [`.harness/docs/HARNESS.md`](./.harness/docs/HARNESS.md).

## Development

Definition of Done (mirrored verbatim in `.github/workflows/ci.yml`):

```sh
npm ci
npm run format:check
npm run lint
npm test
npm run build
```

## Pipeline stages

`assemble` → `review` → `translate` → `audio` → `deck`, each stage reading/writing JSON in a run
directory (`--run <dir>`).

- **`assemble`** — three sources:
  - `--template <name>`: bundled word lists.
  - `--chapter <path> --lang <language>`: one already-extracted EPUB chapter `.xhtml` file, read
    directly by a model (no book-level context, no dedup/registry tracking) — a manual/ad hoc mode.
  - `--epub <path> --chapter-number <N> --lang <language>`: reads chapter `N` directly out of a
    real `.epub` archive in spine (reading) order (`src/corpus/epubArchive.js` — a dependency-free
    zip reader + `META-INF/container.xml`/OPF spine parser), registers the book into the local
    library, and automatically runs two deduplication passes (`src/corpus/epubDedup.js`) before
    writing `corpus.json`: a backward pass drops anything already introduced in an earlier
    (reviewed) chapter of the same book; a forward pass asks a Sonnet-medium model whether anything
    is explicitly taught in a later chapter and should wait. Every dropped item is logged
    individually, naming the item and the reason — never just a count. The _first_ `assemble --epub`
    call for a never-before-seen book also triggers a one-time, whole-book conventions pass
    (`src/corpus/epubBookConventions.js`) — a Sonnet-medium agent reads every chapter and
    characterizes this specific book's own structural conventions (placeholder notation, what
    content markup vs. exercise markup looks like), caching the result at
    `.anki-builder/epubs/<hash>/conventions.md`. Every subsequent chapter for that book (this run
    or a future one) reuses the cache and feeds it into the extraction prompt as grounding context,
    instead of each chapter re-inferring the book's conventions from just its own content. Manual
    `--chapter` mode has no book identity to cache this under, so it doesn't get this context.

  Both the `--chapter` and `--epub` paths call the same extractor
  (`src/corpus/epubLlmCorpus.js` / `src/corpus/epubLlmExtract.js` — `claude -p`, pinned to Sonnet
  at medium effort by default). The prompt template lives at
  [`docs/epub-extraction-prompt.md`](./docs/epub-extraction-prompt.md), parameterized by target
  language, chapter file path, and the canonical category list (`src/model/categories.js`). All
  three paths produce the same superset item shape: `{ id, english, category, notes, target }`,
  with `notes`/`target` explicitly `null` when the source path can't populate them.

- **`review`** — a hard gate before `translate` will run. Interactively lists the corpus (numbered,
  via `src/audit/index.js`'s `renderReviewTable`), lets you exclude items by number, and marks
  `meta.reviewed: true` once confirmed. For an `--epub`-sourced corpus, also saves the approved
  corpus into the local library (`src/corpus/epubLibrary.js`), so later chapters' backward dedup
  pass has something to check against.
- **`translate`** — items with `target: null` get a full translation; items with a real
  `target` already set (e.g. from the EPUB path) only ever get a pronunciation guide — the model
  cannot override a pre-existing target (see `src/translate/index.js`). Both prompts are
  Markdown-structured (Overview / Input Format / Example Input / Output Format / Example Output /
  Important / Input Data) and ask for a target language's standard romanization system (e.g.
  romaji, pinyin) when one exists, falling back to a phonetic respelling otherwise — see
  [`docs/translate-prompts.md`](./docs/translate-prompts.md) for the full templates.
- **`audio`** / **`deck`** — unchanged from before.
- **`render-review --stage <corpus|translate|audio>`** — generates a self-contained,
  ready-to-publish HTML review artifact (`<runDir>/review-<stage>.html`) from `corpus.json` or
  `cards.json`, so the corpus/translate/audio review gates are produced from one shared,
  checked-in template (`src/review/`) rather than hand-authored HTML each time — keeping look and
  interaction identical across stages and across runs. Corpus/translate reviews use a
  click-to-mark-for-exclusion interaction; the audio review embeds each clip as a base64
  `<audio>` element and uses a "flag for regeneration" interaction instead.

## Local library

All durable state that survives between runs — the ElevenLabs audio cache and the EPUB registry —
lives inside this checkout at `.anki-builder/` (gitignored, never committed or pushed), via
`libraryHome()` in `src/model/index.js`. There's no env-var override and nothing to configure; it's
always relative to the repo itself, regardless of which directory you invoke the CLI from.

```
.anki-builder/
  audio/<voiceId>/<hash>.mp3                    # ElevenLabs TTS cache
  epubs/<epubHash>/book.epub                    # idempotent copy of a registered .epub
  epubs/<epubHash>/chapters/<chapterNumber>.xhtml   # extracted-chapter cache
  epubs/<epubHash>/corpora/<chapterNumber>.json     # reviewed corpus, saved by `review`
  epubs/<epubHash>/conventions.md               # one-time whole-book conventions analysis
```

## Implementation status

| Task | Description                                   | Status     |
| ---- | --------------------------------------------- | ---------- |
| T001 | Project scaffold + CI green on an empty build | ⬜ pending |
