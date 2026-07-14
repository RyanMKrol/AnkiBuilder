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

## Implementation status

| Task | Description                                   | Status     |
| ---- | --------------------------------------------- | ---------- |
| T001 | Project scaffold + CI green on an empty build | ⬜ pending |

### EPUB chapter extraction (LLM-based, in progress)

`src/corpus/epubLlmExtract.js` extracts a flashcard item list from a single EPUB chapter file
by having a model (`claude -p`, pinned to Sonnet at medium effort by default) read the raw
chapter XHTML directly via its own Read tool — no pre-split text blocks. The prompt template
lives at [`docs/epub-extraction-prompt.md`](./docs/epub-extraction-prompt.md) and is rendered
with `{{TARGET_LANGUAGE}}` / `{{CHAPTER_FILE_PATH}}` substituted per call.

This is the extraction primitive only. Not yet wired up: a CLI command, multi-chapter/whole-book
orchestration (including proper EPUB spine-order chapter enumeration), and a decision on how its
output (`id`/`english`/`target`/`notes`/`uncertain`/`aiSuggested`) maps onto the existing
`corpus.json`/`cards.json` schemas (which currently require `category` and `pronunciation`,
neither of which this pipeline produces).
