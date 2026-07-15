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
directory (`--run <dir>`) — or, for an `--epub`-sourced run, an auto-resolved chapter directory
under a book-organized `output/` tree (`--output-root <dir>`; see
[Output layout](#output-layout)).

- **`assemble`** — three sources:
  - `--template <name>`: bundled word lists.
  - `--chapter <path> --lang <language>`: one already-extracted EPUB chapter `.xhtml` file, read
    directly by a model (no book-level context, no dedup/registry tracking) — a manual/ad hoc mode.
  - `--epub <path> --chapter-number <N> --lang <language>`: reads chapter `N` directly out of a
    real `.epub` archive in spine (reading) order (`src/corpus/epubArchive.js` — a dependency-free
    zip reader + `META-INF/container.xml`/OPF spine parser), registers the book into the local
    library, and automatically runs two passes before writing `corpus.json`: a backward pass
    (`dedupBackward`, `src/corpus/epubDedup.js`) drops anything already introduced in an earlier
    (reviewed) chapter of the same book; a forward pass (`flagForwardConcerns`,
    `src/corpus/epubForwardFlags.js`) asks a Sonnet-medium model to flag — never drop — anything that
    looks premature, either because a later chapter explicitly re-teaches it or because it relies on
    grammar/vocabulary the book hasn't introduced yet. A flagged item comes back with `uncertain:
true` and a "Possibly premature — ..." note appended, so the corpus review gate is where the
    human actually decides, rather than the item silently vanishing before anyone sees it. Every
    dropped or flagged item is logged individually, naming the item and the reason — never just a
    count. The _first_ `assemble --epub`
    call for a never-before-seen book also triggers a one-time, whole-book conventions pass
    (`src/corpus/epubBookConventions.js`) — a Sonnet-medium agent reads every chapter and
    characterizes this specific book's own structural conventions (placeholder notation, what
    content markup vs. exercise markup looks like, and which chapters embed real teaching content
    inside images rather than extractable text — see `## Image-Embedded Content` in
    [`docs/epub-book-conventions-prompt.md`](./docs/epub-book-conventions-prompt.md)), caching the
    result at `.anki-builder/epubs/<hash>/conventions.md`. Every subsequent chapter for that book
    (this run or a future one) reuses the cache and feeds it into the extraction prompt as
    grounding context, instead of each chapter re-inferring the book's conventions from just its own
    content. Manual `--chapter` mode has no book identity to cache this under, so it doesn't get
    this context.

  For an `--epub` source, pass `--output-root <dir>` instead of `--run <dir>` and `assemble` picks
  the run directory itself: it derives a filesystem-safe slug from the book's own `<dc:title>`
  (`getBookTitle`/`slugify`, falling back to the book's content hash when there's no title), then
  resolves (or reuses, if this exact chapter was already assembled) `<dir>/<slug>/chapter-<seq>/` —
  a simple sequential index scoped to that book, unrelated to the book's own internal chapter
  numbering. The resolved path is printed (`resolved run directory: ...`) for you to reuse as
  `--run <dir>` on every later stage for that chapter. See [Output layout](#output-layout).

  Any chapter number shown to a person — in a dropped/flagged item's log line or note, or the
  corpus review page's meta row — is the book's own human-readable title (e.g. `"Lesson 6: Going
Places (1)"`), never the raw 1-indexed spine position that's an internal implementation detail
  with no relationship to how the book itself numbers or names its chapters (an "internal chapter" —
  a spine file — vs. an "external chapter" — the book's own declared chapter). `describeChapter`
  (`src/corpus/epubArchive.js`) resolves this through a layered fallback: the EPUB's own navigation
  document first (`nav.xhtml`'s `<nav epub:type="toc">` for EPUB3, or `toc.ncx`'s `<navMap>` for
  EPUB2/legacy — both parsed by `listExternalChapters`, the new primitive this sits on top of, which
  represents each external chapter as a spine-position **range** since one human chapter can span
  several spine files or vice versa), falling back to the original `<title>`-tag heuristic (comma/
  colon splitting) when a book has no usable nav document, falling back further to plain
  `"chapter N"` wording when even that yields nothing. `corpus.meta.chapterLabel` stores the current
  chapter's own label (computed once per `assemble --epub` call); `flagForwardConcerns` resolves a
  flagged item's `laterChapter` (the raw spine number the model reports, matching the file list it
  was given) to this same label rather than trusting the model to transcribe the book's title text
  itself; `loadPriorChapterItems` carries a saved chapter's label forward as `__chapterLabel` so
  `dedupBackward`'s drop log can name it too, without that pure function needing epub access itself.

  Both the `--chapter` and `--epub` paths call the same extractor
  (`src/corpus/epubLlmCorpus.js` / `src/corpus/epubLlmExtract.js` — `claude -p`, pinned to Sonnet
  at medium effort by default). The prompt template lives at
  [`docs/epub-extraction-prompt.md`](./docs/epub-extraction-prompt.md), parameterized by target
  language, chapter file path, and the canonical category list (`src/model/categories.js`) — it
  also instructs the model not to rule out images as a content source purely because their `alt`
  text is empty, and to open image files directly with its Read tool when they sit in a content
  section. For the `--epub` path, `extractChapterToFile` (`src/corpus/epubArchive.js`) makes this
  possible by also extracting every image the chapter's `<img src>` tags reference, at the same
  relative path from the cached chapter file that the src attribute encodes from the original
  chapter file inside the archive — so those references resolve to real files on disk instead of a
  directory that was never unpacked. All three paths produce the same superset item shape:
  `{ id, english, category, notes, target }`, with `notes`/`target` explicitly `null` when the
  source path can't populate them, plus two optional flags carried through when the extractor sets
  them: `uncertain` (the model wasn't sure the item belonged) and `aiSuggested` (a critical-gap item
  the model added itself, not present in the source).

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
- **`audio`** — `generateAudio` (`src/audio/index.js`) resolves `cards.meta.targetLanguage`
  against `src/model/iso639.js`'s `resolveIso639Code` (the full ISO 639-1 code set) once per
  run and, when it's a real code (not a full language name like `"Japanese"`, which resolves
  to `null`), passes it through to `fetchTts` as a 4th argument. The default `fetchTts`
  (`src/cli/index.js`) includes it in the ElevenLabs request body as `language_code` only
  when non-null — omitted entirely otherwise, so ElevenLabs falls back to its own
  auto-detection exactly as it always did before this parameter existed. This is on top of
  `voiceId` (sent as part of the request URL path, `.../text-to-speech/<voiceId>`, not the
  body) and `model_id: "eleven_multilingual_v2"`.
- **`deck`** — builds a two-template Anki note type (`src/deck/collection.js`): **Recognition**
  (question shows `Target` and autoplays `Audio` — the target-language listening/recall
  direction — answer reveals `English`) and **Production** (question shows `English`, answer
  reveals `Target`/`Pronunciation`/`Audio` for the native-pronunciation check). Both directions
  play the target-language audio; Recognition plays it on the question side, since that's the
  direction meant to exercise listening comprehension, not just script recognition.
  - `--run <dir>`: the ordinary one-chapter mode — one `cards.json` in, one `deck.apkg` out.
  - `--book-dir <dir>`: the book-level merge mode — scans `<dir>/chapter-*/cards.json` (in
    ascending folder-seq order) and merges every chapter into a SINGLE `<dir>/deck.apkg`, each
    chapter as its own real Anki sub-deck (`Book Title::Chapter Label`, via
    `buildMultiDeckCollection`) nested under one parent deck named for the book (title looked up
    from the local library by the first chapter's `epubHash`, falling back to `--name` then a
    generic string). Always rebuilds from scratch — no "already exists, reusing" short-circuit —
    since it's merging inputs that can change between runs (a re-translated chapter, a newly added
    one, regenerated audio), and reusing a stale merge would be a correctness footgun for a
    recompute this cheap.
- **`render-review --stage <corpus|translate|audio>`** — generates a self-contained,
  ready-to-publish HTML review artifact (`<runDir>/review-<stage>.html`) from `corpus.json` or
  `cards.json`, so the corpus/translate/audio review gates are produced from one shared,
  checked-in template (`src/review/`) rather than hand-authored HTML each time — keeping look and
  interaction identical across stages and across runs. Corpus/translate reviews use a
  click-to-mark-for-exclusion interaction; the audio review embeds each clip as a base64
  `<audio>` element and uses a "flag for regeneration" interaction instead. The corpus review's
  `Flags` column surfaces `uncertain`/`aiSuggested` as badges when the extractor set them.

## Local library

All durable state that survives between runs — the ElevenLabs audio cache and the EPUB registry —
lives inside this checkout at `.anki-builder/` (gitignored, never committed or pushed), via
`libraryHome()` in `src/model/index.js`. There's no env-var override and nothing to configure; it's
always relative to the repo itself, regardless of which directory you invoke the CLI from.

```
.anki-builder/
  audio/<voiceId>/<hash>.mp3                    # ElevenLabs TTS cache
  epubs/<epubHash>/book.epub                    # idempotent copy of a registered .epub
  epubs/<epubHash>/book.json                    # { title, slug } — title from <dc:title>, slug
                                                 #   filled in lazily on first --output-root use
  epubs/<epubHash>/chapters/<chapterNumber>.xhtml   # extracted-chapter cache
  epubs/<epubHash>/images/<...>                     # images the cached chapters reference,
                                                     #   at whatever relative path their own
                                                     #   <img src> resolves to from chapters/
  epubs/<epubHash>/corpora/<chapterNumber>.json     # reviewed corpus, saved by `review`
  epubs/<epubHash>/conventions.md               # one-time whole-book conventions analysis
```

## Output layout

For an `--epub`-sourced book assembled via `assemble --output-root <dir>` (see `assemble` above),
artifacts land in an `output/`-style tree organized by book, then by chapter — instead of an
arbitrary flat `--run <dir>` per chapter:

```
output/<book-slug>/
  .epub-hash                     # binds this slug to one epubHash (collision guard — see
                                  #   resolveBookSlug, src/cli/outputPaths.js)
  chapter-0/corpus.json, cards.json, audio/, review-*.html    # ordinary per-chapter artifacts,
  chapter-1/...                                               #   unchanged in shape
  deck.apkg                      # single merged book-level package (`deck --book-dir`)
```

`chapter-<seq>` is a simple sequential index scoped to that book folder (`0`, `1`, `2`, ...) —
unrelated to the EPUB's own internal spine/chapter numbering (still tracked faithfully inside each
chapter's own `corpus.meta`/`cards.meta`: `epubHash`, `chapterNumber`, `chapterLabel`). Re-assembling
the same `(epubHash, chapterNumber)` pair reuses its existing folder rather than allocating a new
one. Templates and manual `--chapter` sources have no book identity to organize by, so they keep
using a plain, freely-named `--run <dir>`.

## Implementation status

| Task | Description                                   | Status     |
| ---- | --------------------------------------------- | ---------- |
| T001 | Project scaffold + CI green on an empty build | ⬜ pending |
