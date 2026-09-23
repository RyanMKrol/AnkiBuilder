# 01 Collection identity: a book plus a deck kind

Depends on: nothing. Status: built (branch `feat/collection-deck-kind`), tested in
`test/cli/collectionDeckKind.test.js`. `validate:decks` and `preflight` are clean on the tracked
output afterwards.

## Why

Today a collection is identified by its book alone. The book's hash picks the output folder
(`materializeBookInOutput`, `src/cli/outputPaths.js`, and `saveBookSlug`,
`src/corpus/epubLibrary.js`) and the library folder that holds the dedup corpora
(`.anki-builder/epubs/<hash>/corpora/`). A reading deck built from the same file under that scheme
would land in the speaking deck's folder and read the speaking deck's dedup corpora, so every reading
card would look already taught.

Owner ruling, 2026-09-23 (DECISIONS.md, "A collection is a book plus a deck kind"): a collection is
identified by its book and its deck kind, and the skill used decides the kind.

## The change

- **The kind is recorded** in the collection's `book.json` marker as `deckKind`, either
  `speaking-listening` or `reading`. A marker without one is `speaking-listening`, so every existing
  collection is already correct and none of their files is rewritten.
- **The marker keeps it.** `materializeBookInOutput` rewrites the marker whole, and its comment
  records what happens to a field it does not carry forward (`retired` was nearly lost that way). It
  carries `deckKind` forward the same way.
- **The output folder** is `output/epubs/<slug>/` for speaking-listening, unchanged, and
  `output/epubs/<slug>-reading/` for reading. The library's hash-to-slug record becomes a slug per
  kind; the existing `slug` field keeps meaning the speaking-listening one.
- **Card GUIDs** are already namespaced by the collection's slug, so the two collections' notes can
  never overwrite each other in Anki. Nothing to change, but a test pins it.
- **Book facts stay shared; card content does not.** Everything in the library that describes the
  source book is shared by both kinds: the registered EPUB, its hints, the chapter cache and
  `conventions.md`. Everything that records cards is per collection. The reading collection's dedup
  corpora live in `.anki-builder/epubs/<hash>/reading/corpora/`; the speaking-listening path is
  unchanged, because those files are tracked and hand-reviewed. `taught-index.json` belongs to the
  speaking pipeline and the reading pipeline does not read it.
- **The Anki parent deck** is named from the book and the kind: `<book title> (Reading)`.
- **The note type** is chosen by the kind (see 02).
- **Each skill refuses the other kind.** `build-anki-deck` and every speaking phase script refuse a
  reading collection, and the reading scripts refuse a speaking one, each with a message naming the
  right skill.

Everything above is decided from the collection's own marker. Nothing has to look at the other
collection to keep the two apart, so golden rule 7 holds unchanged.

## Where

| site                                                | change                                                                                                                                                                                                           |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/cli/outputPaths.js`, `resolveBookSlug`         | a slug per kind, `-reading` suffix for reading. Today it claims a folder by matching the `.epub-hash` marker, and a reading folder for the same book carries the same hash, so the match must check the kind too |
| `src/cli/outputPaths.js`, `materializeBookInOutput` | write and carry forward `deckKind`                                                                                                                                                                               |
| `src/cli/outputPaths.js`, `listBooks`               | report each collection's kind                                                                                                                                                                                    |
| `src/corpus/epubLibrary.js`, `saveBookSlug`         | record the slug per kind                                                                                                                                                                                         |
| the library's corpora path                          | per kind, with the speaking-listening path unchanged                                                                                                                                                             |
| `src/deck/rebuild.js`, `resolveBookName`            | append ` (Reading)` for a reading collection, used by both the `.apkg` build and delivery so the two can never name it differently                                                                               |
| the phase scripts under `scripts/`                  | refuse the wrong kind, before any paid step                                                                                                                                                                      |

## Done when

- A test builds a speaking and a reading collection from one fixture EPUB, and neither can read the
  other's output folder or corpora.
- Every existing collection comes through byte-identical: a test runs the new code over a copy of a
  pre-change marker and library folder and diffs them.
- `npm run validate:decks` and `npm run preflight` pass on the real `output/` by hand afterwards, as
  CLAUDE.md asks after touching deck data paths.
