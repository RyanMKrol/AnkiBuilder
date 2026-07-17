# Pipeline internals

This is the detailed technical reference for how each stage of the AnkiBuilder pipeline works
internally — file formats, caching, dedup logic, prompt wiring. If you just want to use the tool,
see the [README](../README.md) and the `build-anki-deck` skill instead; come here when you need to
understand or modify the implementation.

## Pipeline stages

`assemble` → `review` → `translate` → `audio` → `deck`, each stage reading/writing JSON in a run
directory (`--run <dir>`) — or, for an `--epub`-sourced run, an auto-resolved chapter directory
under a book-organized `output/` tree (`--output-root <dir>`; see [Output layout](#output-layout)).

### `assemble`

Four sources:

- `--template <name> --lang <language>`: bundled word lists (language-agnostic; `--lang` picks the
  target language at build time). Pass `--run <dir>` for an ad hoc build, or `--output-root <dir>`
  to file the deck under the organized `output/templates/<name>/<language>/` tree
  (`resolveTemplateRunDir`) — see [Output layout](#output-layout).
- `--chapter <path> --lang <language>`: one already-extracted EPUB chapter `.xhtml` file, read
  directly by a model (no book-level context, no dedup/registry tracking) — a manual/ad hoc mode.
- `--words <path> --course <name> --lesson-number <N> --lang <language>`: a plain text file, one
  English phrase per line, dictated from a real-life lesson rather than extracted from a book —
  for example, vocabulary you learned in an in-person class. Unlike `--chapter`/`--epub`, there's
  no bilingual source text to extract a translation from, so every item's `target` stays `null`
  (`assembleCorpusFromLessonWords`, `src/corpus/lessonCorpus.js`) — it flows into `translate` the
  same way a template's items do. The only judgment call this source makes itself is category
  assignment, via a small batched Haiku pass (same "fail open, never block" idiom as the rest of
  this project — a batch that fails to parse defaults to category `"Other"` rather than blocking
  assembly; the corpus review gate is where a wrong category actually gets fixed). Optional
  `--lesson-label <text>` overrides the sub-deck's display name, defaulting to `"Lesson <N>"`.
  Like `--epub`, pass `--output-root <dir>` instead of `--run <dir>`; `assemble` resolves (or
  creates) the named course's folder (`resolveCourseSlug`, keyed by course name rather than a
  content hash, since there's no source file to hash) and then that lesson's `lesson-<seq>/`
  folder within it (`resolveLessonRunDir`) — see [Output layout](#output-layout).
- `--epub <path> --chapter-number <N> --lang <language>`: reads chapter `N` directly out of a
  real `.epub` archive in spine (reading) order (`src/corpus/epubArchive.js` — a dependency-free
  zip reader + `META-INF/container.xml`/OPF spine parser), registers the book into the local
  library, and automatically runs two passes before writing `corpus.json` — both non-destructive:
  a backward pass (`dedupBackward`, `src/corpus/epubDedup.js`) flags anything that exact-matches
  (case-insensitive `english`, or exact `target`) an item already introduced in an earlier
  (reviewed) chapter of the same book, deterministically and with zero API cost; a forward pass
  (`flagForwardConcerns`, `src/corpus/epubForwardFlags.js`) asks a Sonnet-medium model to flag
  anything that looks premature, either because a later chapter explicitly re-teaches it or
  because it relies on grammar/vocabulary the book hasn't introduced yet. Neither pass ever drops
  an item — each flagged item comes back with `uncertain: true` and a note appended (`"Possibly
already taught — ..."` for a backward match, `"Possibly premature — ..."` for a forward one), so
  the corpus review gate is where the human actually decides, rather than the item silently
  vanishing before anyone sees it. Every flagged item is logged individually, naming the item and
  the reason — never just a count. The _first_ `assemble --epub` call for a never-before-seen book
  also triggers a one-time, whole-book conventions pass (`src/corpus/epubBookConventions.js`) — a
  Sonnet-medium agent reads every chapter and characterizes this specific book's own structural
  conventions (placeholder notation, what content markup vs. exercise markup looks like, and which
  chapters embed real teaching content inside images rather than extractable text — see
  `## Image-Embedded Content` in
  [`epub-book-conventions-prompt.md`](./epub-book-conventions-prompt.md)), caching the result at
  `.anki-builder/epubs/<hash>/conventions.md`. Every subsequent chapter for that book (this run or
  a future one) reuses the cache and feeds it into the extraction prompt as grounding context,
  instead of each chapter re-inferring the book's conventions from just its own content. Manual
  `--chapter` mode has no book identity to cache this under, so it doesn't get this context.

The `--epub` source has two ways to choose _what_ to assemble.
`--epub <path> --lesson <selector> --lang <language>` (or `--book <slug> --lesson ...`) is the
preferred one, because a `--chapter-number` is a raw spine index (the Nth
internal content file) and a spine file is **not guaranteed** to correspond to a lesson — a lesson
can span several files, and dividers/quizzes/front matter are their own files. `--lesson` selects one
of the book's **own** lessons from its navigation document via `resolveLesson`/`listLessons`
(`src/corpus/epubLessons.js`, built on `listExternalChapters`): a purely-numeric selector is the
nav-list ordinal (`--list-lessons` prints these), anything else is a unique case-insensitive label
substring. The selector resolves to a spine-position **range**; `extractChapterRangeToFile`
(`src/corpus/epubArchive.js`) concatenates that whole range into one cache file (a distinct
`<first>-<last>.xhtml` path, so it never clobbers the per-spine-file caches the conventions/forward
passes use) before the single-file extractor runs, so a multi-file lesson isn't under-covered.
Internally `--lesson` desugars to `--chapter-number <first spine file>` (so run-dir allocation, the
backward dedup, and the saved corpus all key on it exactly as before) plus a stashed range;
`corpus.meta.lastChapterNumber` records the last spine file only when a lesson spans more than one,
and the forward pass checks chapters _after_ that last file so the lesson's own later files aren't
mistaken for "taught later". `--list-lessons` prints the book's lessons (number, type, spine range,
label) and exits. A book with no usable nav document has no selectable lessons — `--list-lessons`
says so and the raw `--chapter-number` path remains the fallback.

For an `--epub` source, pass `--output-root <dir>` instead of `--run <dir>` and `assemble` picks
the run directory itself: it derives a filesystem-safe slug from the book's own `<dc:title>`
(`getBookTitle`/`slugify`, falling back to the book's content hash when there's no title), then
resolves (or reuses, if this exact chapter was already assembled) `<dir>/<slug>/chapter-<seq>/` —
a simple sequential index scoped to that book, unrelated to the book's own internal chapter
numbering. The resolved path is printed (`resolved run directory: ...`) for you to reuse as
`--run <dir>` on every later stage for that chapter. See [Output layout](#output-layout).

Any chapter number shown to a person — in a flagged item's log line or note, or the corpus review
page's meta row — is the book's own human-readable title (e.g. `"Lesson 6: Going Places (1)"`),
never the raw 1-indexed spine position that's an internal implementation detail with no
relationship to how the book itself numbers or names its chapters (an "internal chapter" — a
spine file — vs. an "external chapter" — the book's own declared chapter). `describeChapter`
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
`dedupBackward`'s flag log can name it too, without that pure function needing epub access itself.

Both the `--chapter` and `--epub` paths call the same extractor (`src/corpus/epubLlmCorpus.js` /
`src/corpus/epubLlmExtract.js` — `claude -p`, pinned to Sonnet at medium effort by default). The
prompt template lives at [`epub-extraction-prompt.md`](./epub-extraction-prompt.md), parameterized
by target language, chapter file path, and the canonical category list
(`src/model/categories.js`) — it also instructs the model not to rule out images as a content
source purely because their `alt` text is empty, and to open image files directly with its Read
tool when they sit in a content section. For the `--epub` path, `extractChapterToFile`
(`src/corpus/epubArchive.js`) makes this possible by also extracting every image the chapter's
`<img src>` tags reference, at the same relative path from the cached chapter file that the src
attribute encodes from the original chapter file inside the archive — so those references resolve
to real files on disk instead of a directory that was never unpacked. All three paths produce the
same superset item shape: `{ id, english, category, notes, target }`, with `notes`/`target`
explicitly `null` when the source path can't populate them, plus two optional flags carried
through when the extractor sets them: `uncertain` (the model wasn't sure the item belonged) and
`aiSuggested` (a critical-gap item the model added itself, not present in the source).

### `review`

A hard gate before `translate` will run. Interactively lists the corpus (numbered, via
`src/audit/index.js`'s `renderReviewTable`), lets you exclude items by number, and marks
`meta.reviewed: true` once confirmed. For an `--epub`-sourced corpus, also saves the approved
corpus into the local library (`src/corpus/epubLibrary.js`), so later chapters' backward dedup
pass has something to check against.

### `translate`

Items with `target: null` get a full translation; items with a real `target` already set (e.g.
from the EPUB path) only ever get a pronunciation guide — the model cannot override a pre-existing
target (see `src/translate/index.js`). Prompts are Markdown-structured (Overview / Input Format /
Example Input / Output Format / Example Output / Important / Input Data). How `pronunciation` gets
filled in depends on whether the target language has a configured romanization library
(`src/translate/romanizationLibraries.js`, keyed by ISO 639-1 code — currently Japanese, Mandarin,
Korean, Russian, Hebrew, Hindi, Arabic): with a library configured, the model is asked for
`target` only, the library romanizes it deterministically, and a Haiku pass judges that output
(flagging `uncertain: true` with a note if it disagrees — never silently correcting it, same
"flag, don't override" idiom as the corpus-assembly dedup passes); with no library configured, the
model is asked for `pronunciation` directly, preferring a standard romanization system when one
exists and falling back to a phonetic respelling otherwise, unchanged from before this distinction
existed. See [`translate-prompts.md`](./translate-prompts.md) for the full templates and
[`.harness/custom/docs/LIMITATIONS.md`](../.harness/custom/docs/LIMITATIONS.md) for the dependency
trade-offs this introduces.

### `audio`

`generateAudio` (`src/audio/index.js`) resolves `cards.meta.targetLanguage` against
`src/model/iso639.js`'s `resolveIso639Code` (the full ISO 639-1 code set) once per run and, when
it's a real code (not a full language name like `"Japanese"`, which resolves to `null`), passes it
through to `fetchTts` as a 4th argument. The default `fetchTts` (`src/cli/index.js`) includes it in
the ElevenLabs request body as `language_code` only when non-null — omitted entirely otherwise, so
ElevenLabs falls back to its own auto-detection exactly as it always did before this parameter
existed. This is on top of `voiceId` (sent as part of the request URL path,
`.../text-to-speech/<voiceId>`, not the body) and `model_id: "eleven_multilingual_v2"`. `--voice
<voiceId>` can be omitted once a language has a configured default (`src/audio/voiceLibrary.js`'s
`DEFAULT_VOICES`, keyed by the same ISO 639-1 code) — an explicit `--voice` always overrides it;
with neither, the stage still throws asking for one.

### `deck`

Builds a single-template Anki note type (`src/deck/collection.js`): **Production** — the question
shows `English`, and the answer reveals `Target`/`Pronunciation`/`Audio`. Each note yields exactly
one card, in the one direction where the answer is the target-language text the learner must
produce (write). The reverse Recognition direction (`Target` → `English`) was intentionally dropped:
every deck this tool builds feeds Kakitori, a handwriting-practice app, where "produce the Japanese"
is the only meaningful direction and a second card would just duplicate scheduling with no writing
value (see `.harness/custom/docs/LIMITATIONS.md`).

- `--run <dir>`: the ordinary one-chapter/one-lesson mode — one `cards.json` in, one `deck.apkg`
  out.
- `--book-dir <dir>`: the book/course-level merge mode — scans `<dir>/chapter-*/cards.json` AND
  `<dir>/lesson-*/cards.json` (in ascending folder-seq order; an EPUB book only ever has the
  former, a lesson-sourced course only ever has the latter) and merges every one into a SINGLE
  `<dir>/deck.apkg`, each as its own real Anki sub-deck (`Book/Course Title::Chapter/Lesson
Label`, via `buildMultiDeckCollection`) nested under one parent deck named for the book or
  course (title looked up from the local library by the first chapter's `epubHash`, or from the
  course folder's own `course.json` marker when there's no `epubHash` — `loadCourseMeta`,
  `src/cli/outputPaths.js` — falling back to `--name` then a generic string). Always rebuilds from
  scratch — no "already exists, reusing" short-circuit — since it's merging inputs that can change
  between runs (a re-translated chapter, a newly added one, regenerated audio), and reusing a
  stale merge would be a correctness footgun for a recompute this cheap.

### `render-review --stage <corpus|translate|audio>`

Generates a self-contained, ready-to-publish HTML review artifact (`<runDir>/review-<stage>.html`)
from `corpus.json` or `cards.json`, so the corpus/translate/audio review gates are produced from
one shared, checked-in template (`src/review/`) rather than hand-authored HTML each time — keeping
look and interaction identical across stages and across runs. Corpus/translate reviews use a
click-to-mark-for-exclusion interaction; the audio review embeds each clip as a base64 `<audio>`
element and uses a "flag for regeneration" interaction instead. The corpus review's `Flags` column
surfaces `uncertain`/`aiSuggested` as badges when the extractor set them.

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

When you pass `assemble --output-root <dir>`, every source type lands under its own **reserved
top-level segment** of that root — `epubs/` for books, `courses/` for courses, `templates/` for
templates — so a book slug, a course slug, and a template name can never collide at the root
(`EPUBS_DIR`/`COURSES_DIR`/`TEMPLATES_DIR`, `src/cli/outputPaths.js`).

For an `--epub`-sourced book, artifacts land under `epubs/`, organized by book then by chapter —
instead of an arbitrary flat `--run <dir>` per chapter:

```
output/epubs/<book-slug>/
  .epub-hash                     # binds this slug to one epubHash (collision guard — see
                                  #   resolveBookSlug, src/cli/outputPaths.js)
  book.epub                      # copy of the source EPUB, kept so a later chapter can be built
                                  #   with `--book <slug>` (no need to re-find the original file)
  book.json                      # { title, slug, epubHash, targetLanguage } — written by
                                  #   materializeBookInOutput, read back by listBooks for book
                                  #   discovery (the course.json analogue for books)
  chapter-0/corpus.json, cards.json, audio/, review-*.html    # ordinary per-chapter artifacts,
  chapter-1/...                                               #   unchanged in shape
  deck.apkg                      # single merged book-level package (`deck --book-dir`)
```

`chapter-<seq>` is a simple sequential index scoped to that book folder (`0`, `1`, `2`, ...) —
unrelated to the EPUB's own internal spine/chapter numbering (still tracked faithfully inside each
chapter's own `corpus.meta`/`cards.meta`: `epubHash`, `chapterNumber`, `chapterLabel`).
Re-assembling the same `(epubHash, chapterNumber)` pair reuses its existing folder rather than
allocating a new one. A manual `--chapter` source has no identity to organize by, so it keeps
using a plain, freely-named `--run <dir>`.

Every `--epub` assemble also copies the source file to `book.epub` and refreshes `book.json`
(`materializeBookInOutput`), making the book folder a self-contained record. A later chapter can
then be assembled with `--book <slug>` in place of `--epub <path>`: the CLI desugars it to the kept
copy via `resolveBookEpubPath` (preferring `output/epubs/<slug>/book.epub`, falling back to the
local-library copy through `.epub-hash` for a book worked on before this copy existed), then the
flow proceeds identically to `--epub`. `listBooks` enumerates these folders (by `book.json`,
`book.epub`, or the legacy `.epub-hash`) so a caller can offer "pick a previously-worked book".

A `--words`-sourced course (see [`assemble`](#assemble) above) mirrors this exact shape under its
own `courses/` segment — `courses/<course-slug>/lesson-<seq>/` instead of
`epubs/<book-slug>/chapter-<seq>/` — since both sourceTypes need the same "numbered sub-deck of a
bigger merged collection" structure:

```
output/courses/<course-slug>/
  course.json                    # { name, targetLanguage } — written by resolveCourseSlug on
                                  #   first use, read back by loadCourseMeta for deck --book-dir's
                                  #   course-name fallback and by listCourses for course discovery
  lesson-0/corpus.json, cards.json, audio/, review-*.html    # ordinary per-lesson artifacts,
  lesson-1/...                                               #   same shape as a chapter's
  deck.apkg                      # single merged course-level package (`deck --book-dir`)
```

`lesson-<seq>` is likewise a simple sequential folder index, unrelated to the lesson number you
gave `--lesson-number` (tracked faithfully in `corpus.meta.chapterNumber`, reused as-is for a
lesson's number rather than adding a near-duplicate `lessonNumber` field — see the `courseSlug`
comment on `CORPUS_SCHEMA` in `src/model/index.js`). Re-assembling the same `(courseSlug,
lessonNumber)` pair reuses its existing folder rather than allocating a new one, exactly like
`resolveChapterRunDir`.

A `--template`-sourced deck assembled via `assemble --output-root <dir>` lands under a reserved
`templates/` segment, keyed by template name then target language:

```
output/templates/<template-name>/<language>/
  corpus.json, cards.json, audio/, review-*.html    # ordinary per-run artifacts, same shape
  deck.apkg                                          # this deck's final package (`deck --run`)
```

Unlike a book or course, a template yields exactly one unit per `(template, language)`, so the
`<language>` folder IS the run directory — there's no `chapter-<seq>`/`lesson-<seq>` level and no
book-level `deck --book-dir` merge (nothing to merge; the `deck --run` output is already final).
The path is a pure deterministic function of `(template, language)` (`resolveTemplateRunDir`), both
segments slugified so `--lang ja` and `--lang Japanese` become stable folder names (`ja`,
`japanese`); re-assembling the same pair reuses the folder via assemble's "corpus.json already
exists — reusing" guard. A template built with a plain `--run <dir>` (no `--output-root`) still
lands wherever you point it, unchanged.
