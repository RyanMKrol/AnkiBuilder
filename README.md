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

- **`assemble`** — `--template <name>` (bundled word lists) or `--chapter <path> --lang <language>`
  (one already-extracted EPUB chapter `.xhtml` file, read directly by a model via
  `src/corpus/epubLlmCorpus.js` / `src/corpus/epubLlmExtract.js` — `claude -p`, pinned to Sonnet at
  medium effort by default, no pre-split text blocks). The prompt template lives at
  [`docs/epub-extraction-prompt.md`](./docs/epub-extraction-prompt.md), parameterized by target
  language, chapter file path, and the canonical category list (`src/model/categories.js`). Both
  paths produce the same superset item shape: `{ id, english, category, notes, target }`, with
  `notes`/`target` explicitly `null` when the source path can't populate them. `assemble --chapter`
  takes a single chapter file, not a whole `.epub` archive — multi-chapter/whole-book orchestration
  (spine-order enumeration, looping, merging) doesn't exist yet.
- **`review`** — a hard gate before `translate` will run. Interactively lists the corpus (numbered,
  via `src/audit/index.js`'s `renderReviewTable`), lets you exclude items by number, and marks
  `meta.reviewed: true` once confirmed.
- **`translate`** — items with `target: null` get a full translation; items with a real
  `target` already set (e.g. from the EPUB path) only ever get a pronunciation guide — the model
  cannot override a pre-existing target (see `src/translate/index.js`). Both prompts are
  Markdown-structured (Overview / Input Format / Example Input / Output Format / Example Output /
  Important / Input Data) and ask for a target language's standard romanization system (e.g.
  romaji, pinyin) when one exists, falling back to a phonetic respelling otherwise — see
  [`docs/translate-prompts.md`](./docs/translate-prompts.md) for the full templates.
- **`audio`** / **`deck`** — unchanged from before.

## Implementation status

| Task | Description                                   | Status     |
| ---- | --------------------------------------------- | ---------- |
| T001 | Project scaffold + CI green on an empty build | ⬜ pending |
