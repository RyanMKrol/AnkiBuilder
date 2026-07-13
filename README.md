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

| Task | Description | Status |
|------|-------------|--------|
| T001 | Project scaffold + CI green on an empty build | ⬜ pending |
