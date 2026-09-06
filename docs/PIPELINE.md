# Pipeline internals

This is the detailed technical reference for how each stage of the AnkiBuilder pipeline works
internally — file formats, caching, dedup logic, prompt wiring. If you just want to use the tool,
see the [README](../README.md) and the `build-anki-deck` skill instead; come here when you need to
understand or modify the implementation.

**This file describes how the code is wired, and carries no procedure.** Anything that tells an
operator what to do, in what order, or when to stop and wait for a human belongs in
`.claude/skills/build-anki-deck/SKILL.md`, which is normative for that; if a procedure has ended up
here, move it rather than maintaining it twice. This file's job is to stay true to the code.

## Pipeline stages

`assemble` → `prepare` → `audio` → `deck`, each stage reading/writing JSON in a run
directory (`--run <dir>`) — or, for an `--epub`-sourced run, an auto-resolved chapter directory
under a book-organized `output/` tree (`--output-root <dir>`; see [Output layout](#output-layout)).
`prepare` is itself five passes (`translate` → fill-in-the-blank → semantic de-dup → cross-lesson
notes → number readings, the last running only when a card still has a digit in its reading or
romaji) run under a single claim, and `assemble` chains into it automatically.

**Review happens in the dashboard** (`serve`), not as a CLI stage — see
[Deck dashboard](#deck-dashboard-serve). There are exactly **two review gates**, and they are the only
states a lesson rests in: the **Corpus** review (English + target + pronunciation, on `cards.json`,
signed off with "Mark reviewed") and the **Audio** review (signed off with "Mark done"). The one gate
the CLI enforces is `audio`, which refuses to run until `cards.meta.reviewed` is set.

A run dir with `corpus.json` but no `cards.json` is **not** a stage — it is `INCOMPLETE`, a build that
stopped partway through `prepare`. Every one of those passes changes what a reviewer would be signing
off, so a lesson stopped among them has nothing reviewable in it. The dashboard lists it under "Not
finished" rather than "In review", and re-running `assemble` (or `prepare` directly) completes it.

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
  assignment, via a single Sonnet-medium pass (same "fail open, never block" idiom as the rest of
  this project — a response that fails to parse defaults to category `"Other"` rather than blocking
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
  (reviewed) chapter of the same book, deterministically and with zero API cost (both sides of the
  target comparison are display-normalized first, so editorial spaces / a trailing `。` never defeat
  the match); a forward pass
  (`flagForwardConcerns`, `src/corpus/epubForwardFlags.js`) asks a Sonnet-medium model to flag
  anything that looks premature, either because a later chapter explicitly re-teaches it or
  because it relies on grammar/vocabulary the book hasn't introduced yet. The forward pass judges
  from a once-per-book **taught-content index** (`src/corpus/epubTaughtIndex.js`): one whole-book
  model pass, cached as `taught-index.json` under the book's hash dir, recording what each chapter
  introduces. The per-lesson forward call then hands the model that compact index instead of
  re-materializing every later chapter (which repeated a near-whole-book read on each assemble).
  A build only ever READS that index — building it is `anki-builder epub taught-index <hash>`, a
  deliberate one-off, because a pass over every chapter of the book firing unannounced in the
  middle of one lesson is the worst thing a dwindling usage window can be spent on. Index coverage
  is verified mechanically (every spine chapter must appear, or the build is rejected); a book with
  no index falls back to the original read-the-later-chapters behavior and says so, naming the
  command that would make every later lesson cheaper. Either way the outcome lands on the unit's
  pass ledger (`meta.passes.taughtIndex`, `ok` when the index was used, `skipped` when it wasn't),
  so which source a lesson was judged against is a fact on the unit rather than a log line. Neither pass ever drops
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

  **Precedence, and how the cache is kept honest.** The conventions doc is authoritative about
  MARKUP and about where things are. It is never authoritative about what to extract: on any
  conflict the extraction prompt's own rules win, and the conventions block is rendered at the END
  of the extraction prompt, after those rules, saying so. This is not theoretical. The cached doc
  for the one book built so far (14 Jul) names a chapter's paradigm image as exercise material to
  skip, while the extraction prompt (9 Aug) uses that exact shape as its worked example of
  "reference material, extract in full"; the chapter shipped none of those eight forms. A cached
  artifact silently outranking a prompt edited a month later is the failure, so both cached
  artifacts (conventions.md, taught-index.json) now carry a sibling `<artifact>.meta.json` with the
  prompt path, a sha256 of the prompt TEMPLATE, the model and effort that ran it, the chapter count,
  and a timestamp (`src/corpus/artifactMeta.js`). When the template's hash no longer matches, the
  next `assemble` prints a WARNING naming the drift. It never regenerates: that is a paid whole-book
  pass and a judgement call, so it stays a human decision. An artifact cached before this existed has
  no meta sibling and warns about that instead of staying silent.

**Pedagogical sort (every source).** As the final step before writing `corpus.json` — for _every_
source, not just EPUB — `assemble` re-orders the items for learning flow via `sortItemsPedagogically`
(`src/corpus/pedagogicalSort.js`): a Sonnet-medium `claude -p` pass that returns the items
re-sequenced so a learner meets vocabulary **before** the sentences built from it (atoms → molecules),
keeping topical groups together. Textbooks routinely print a Key Sentence before the words inside it
(これは さんぜんえんです。 before さんぜん / えん); this undoes that. It is purely a re-ordering — the model
returns only a permutation of the item ids, and `reorderByIds` defensively appends any id the model
omitted, ignores ids it invents, and de-dupes, so a malformed answer can never add, drop, or rewrite a
card (worst case it degrades toward the extracted order). On by default; `--no-sort` opts out; and it
fails open — any parse/shape error leaves the extracted order untouched and logs why. The re-ordered
corpus is what the review gate then shows, so the human is always the final check on the sequence.

**Space-free scripts — normalize the display text (`src/model/scriptSpacing.js`, `normalizeDisplayText`).**
For a language written without spaces between words (Japanese today), a card's stored `target`/`ttsText`
is normalized so the deck renders natural script: **(1)** editorial spaces are stripped (the JBP kana
textbook uses 分かち書き word-separation as a beginner aid, which isn't part of real written Japanese),
and **(2)** a trailing sentence-final `。` is stripped — **a card never ends in a period by default**. A
mid-string `。` (two sentences) is kept. `assemble` applies it to `corpus.json` and `translate` to the
resulting `cards.json`. This is independent of the romaji (which keeps its own spacing/punctuation) and
the audio-side space strip (`src/audio/ttsText.js`). Languages whose spaces/terminal punctuation are
meaningful (Spanish, French, …) are untouched.

The stripped display text is dot-less, but the `。` lives on in the **audio**, via the TTS end
marker (`src/audio/ttsMarker.js`): for a marker-using language (Japanese) the text sent to
ElevenLabs gets `。ででで` appended, so the voice reads the card with sentence-final prosody — the
`。` anchors a sentence boundary, which measurably steadies short/bare clips — and the throwaway
ででで syllables absorb ElevenLabs' end-of-clip artifacts. The automatic trim then finds and cuts
the marker back off the clip (with a "Marker audible" review badge on the rare card where it
cannot). The displayed face and `target` stay dot-less throughout; there is no separate with-dot /
without-dot take to choose between.

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

### The shape report

`--list-lessons` also prints a **shape report** (`src/corpus/epubShapeReport.js`), and the same
report is available standalone as `node scripts/epub-probe.mjs <book.epub>` (add `--json` for the
raw structure, and the probe prints the per-entry and per-file detail the CLI summary omits). Both
are read-only: they open the archive, count, and print. Nothing is registered, extracted or spent.

The report exists because an EPUB that the parser handles badly looks exactly like one it handles
well: nothing throws, and every degradation is a silent fallback. It reports the nav source (`nav`
vs `ncx` vs none), the spine size, and per nav entry: its spine range, how many files in that range
the nav actually **named** (the rest are swallowed into the entry above them), the
`classifyLesson` type as an annotation, and the Anki deck path `unitDeckSegments` turns its label
into. Then the things that have no other reporting at all — nav entries that resolve to no spine
file, entries collapsed onto an earlier entry's file, spine files falling before the first nav entry
(reachable only by `--chapter-number`, never by `--lesson`), labels that collide with each other or
with a `describeChapter` `<title>` fallback, image filenames from different archive directories that
resolve to one path in the shared `chapters/` cache, per-file text length against image count,
chapters that are not UTF-8 (this reader decodes and caches every chapter as UTF-8, so their text
would reach the model mangled), and a size warning for a book materially larger than the one book
this pipeline is proven on.

Warnings are advisory, never a gate — every one of them describes a book that still builds, just
not the way its own table of contents suggests. Run the probe before spending a pass on a new book.

### What the nav parser now refuses to drop quietly

Four things used to disappear without a word, all of them in `src/corpus/epubArchive.js`:

- **NCX labels with attributes or inline markup.** `<navLabel xml:lang="en">` or
  `<text><span>Lesson 1</span></text>` is what a real EPUB2 toolchain emits, and the old bare-shape
  match dropped every such navPoint. This is the live path: an EPUB2 book resolves source `ncx`.
  Each skipped navPoint is now logged with its reason.
- **Comments and CDATA.** `stripInertMarkup` runs before every scan (container, OPF, nav, NCX,
  `<title>`, image srcs). A commented-out nav anchor used to become a phantom lesson, which shifts
  every ordinal after it, so `--lesson 7` builds lesson 6. A commented-out `<item properties="nav">`
  could be picked as the navigation document. Chapter content written to disk is still raw: the
  extraction model reads the real file.
- **Inverted ranges.** A nav document not in reading order produces arithmetic like spine 5-2.
  `extractChapterRangeToFile` throws on it, `assemble` falls back to single-file extraction, and
  `flagForwardConcerns` treats the lesson's own files as later chapters. The range is now clamped to
  the entry's own file and logged loudly, and `resolveLesson` asserts the invariant so a
  hand-constructed lesson fails at the gate rather than mid-build.
- **Anchors the parser could not read.** The gap between how many entries the nav document declares
  and how many parsed is logged and reported.

### DRM, and how the navigation document is found

Two rejections and three discovery tiers, all in `src/corpus/epubArchive.js`:

- **Zip-level encryption** (general-purpose bit 0) throws while walking the central directory.
- **`META-INF/encryption.xml`** throws only when an encrypted `<CipherReference URI>` names a
  **spine document**. Adobe ADEPT (the DRM on most retail EPUBs) leaves the zip perfectly readable,
  so without this a retail book parses "successfully" into ciphertext and hands 40+ garbage files to
  a paid whole-book pass. The check is narrow on purpose: IDPF and Adobe **font obfuscation** use
  this same file on completely readable books, so the file's presence alone means nothing.

Navigation discovery tries, in order: the OPF manifest item with `properties="nav"` (EPUB3), then
`toc.ncx` via `<spine toc="...">` or the NCX media type (EPUB2), then — last resort — a sweep of
every XHTML manifest item for a `<nav>` whose `*:type` token list includes `toc` (prefix-agnostic;
the `epub` prefix is only a convention) or whose `role` is `doc-toc`. The sweep runs only when both
spec-blessed tiers came up empty, so no book that resolves today changes behaviour, and it reports
`source: "nav-sweep"` so the probe says how the book was actually resolved.

### Per-book config: invariants and hints

`book.json` has two sections and they are not interchangeable, because they grant different powers
(`src/corpus/bookConfig.js`).

- **`invariants`** are facts code may branch on, because they really are stable for this book.
  `labelDecoding` is the archetype: stamped once, frozen forever, because a chapter label flows into
  a live Anki deck name. `bookInvariants` returns **only** keys named in `INVARIANT_KEYS`.
- **`hints`** are what onboarding noticed about this publisher, for example that vocabulary tables
  tend to carry `class="voca"`. They reach **prompts only** (`renderBookHints`), as orientation for
  a model that is free to disagree. Nothing branches on them, so a wrong or missing hint costs
  recall and can never cost correctness.

The separation is enforced rather than merely documented: a hint cannot become a code dependency by
being read, only by being **promoted** into `INVARIANT_KEYS`, which is a reviewed change to code.
`assertConfigSeparation` rejects a book that declares the same key as both.

Why the split exists at all: three modules once hardcoded one publisher's markup, and the
vocabulary-table selector failed silently: on a book that marks tables differently the regex
matched nothing and the coverage check reported zero misses, which is indistinguishable from a
chapter that was fully carded. Moving those selectors into config without the split would have kept
the same failure and merely relocated it, because no EPUB is reliably consistent enough for a
selector to be a guarantee.

A book registered before this split keeps its flat file and is **never rewritten**; `bookInvariants`
reads the legacy top-level shape too. A pinned config a delivered deck depends on is not migrated as
a side effect of a refactor.

### Label decoding is versioned per book

A chapter label is not just text a person reads: `unitDeckSegments` turns it into a live Anki deck
name, and renaming a deck in Anki is not a rename — it is a new deck, and the existing notes stay in
the old one with all their scheduling. So the decoder that produces labels is **versioned per book**,
stamped once into `book.json` at registration by `registerEpub` and read back by
`resolveLabelDecoding` (`src/corpus/epubLibrary.js`). It lives under that file's `invariants`
section, which is the section code is permitted to branch on — see _Per-book config_ below.

- **v1** — the five original entities (`&amp;` `&lt;` `&gt;` `&quot;` `&#39;`), tags removed with
  nothing in their place. Any book registered before this existed stays here forever.
- **v2** — full numeric (`&#8212;`), hex (`&#x2026;`) and common named entity decoding; a space
  where an inline tag was, so `<span>Lesson</span><span>5</span>` is "Lesson 5" rather than
  "Lesson5" (which also defeats `deckPath`'s grouped-label regex, flattening the deck); ruby
  annotations dropped from labels, so `漢<rt>かん</rt>字` is 漢字 and not 漢かん字. `&nbsp;` becomes
  an ordinary space, since a non-breaking space in a deck name is invisible and unsearchable.

Migrating an already-delivered book to v2 is a deliberate, previewed, one-time re-file — never a
side effect of the decoder improving. An unknown entity is left visible (`&notarealentity;`) rather
than turned into a replacement character: a visible oddity is a better bug report than a silent one.

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
by target language, chapter file path, the canonical category list (`src/model/categories.js`) and
`{{CARD_FACES}}` — it also instructs the model not to rule out images as a content source purely
because their `alt` text is empty, and to open image files directly with its Read tool when they sit
in a content section.

**`{{CARD_FACES}}` shows the authoring model what a card looks like** (`src/deck/cardFaces.js`): both
fronts and both backs, rendered from the real `CARD_TEMPLATES` with one example card filled in, and
injected into the extraction and fill-in-the-blank prompts. It is generated, never retyped, so it
cannot drift from the templates. The reason it exists: the field semantics were defined entirely by
prose about a rendering the model had never seen, which is why the three most valuable authoring
rules (the scene must not leak the answer, the hint must not restate the gloss, a note must add
something the card does not already show) were claims about a rendered front no surface showed
anyone. A leaky scene is obvious on a face and invisible in a JSON row. `CARD_TEMPLATES` lives in
`src/deck/cardTemplates.js` rather than `collection.js` so rendering a prompt does not open a sqlite
database. For the `--epub` path, `extractChapterToFile`
(`src/corpus/epubArchive.js`) makes this possible by also extracting every image the chapter's
`<img src>` tags reference, at the same relative path from the cached chapter file that the src
attribute encodes from the original chapter file inside the archive — so those references resolve
to real files on disk instead of a directory that was never unpacked.

That path is not decorative: the model opens these files, so a wrong image is wrong card content
with nothing to show for it. Three detectors guard it (all in `extractReferencedImages` /
`copyImageAsset`):

- **Collision byte-compare.** Every chapter's images land in one shared `chapters/` directory, so
  two chapters in different archive directories referencing the same relative filename (the standard
  Sigil/InDesign layout) overwrite each other. On write, differing bytes are logged loudly naming
  both archive paths, both referring chapters, and the shared destination; identical bytes stay
  quiet. The count is also computed statically in the shape report, before any extraction.
- **Containment.** An image `src` comes from the archive and `../` in it is unfiltered, so a crafted
  zip could write through the cache into repo source. Any destination resolving outside the book's
  own cache directory is refused and logged. A legitimate `../images/foo.png` is unaffected.
- **SVG wrappers.** An `.svg` is very often a wrapper whose whole content is
  `<image href="the-real-page.jpg">`. A copied SVG is re-scanned one level deep and what it
  references is copied too, and every copied SVG is logged so the shape report's SVG count can be
  read as "these may be wrappers".

**The extraction response is an ENVELOPE, and its coverage half is checked.** The model replies with
`{ items, coverage }`, where `coverage` is `{ imagesOpened, imagesSkippedAsDecorative, concerns }`:
its own account of which images it opened, which it dismissed without opening, and anything that
stopped it covering the chapter fully. `referencedImageSrcs` (`src/corpus/epubArchive.js`, the same
function that decides which images get written to disk) gives the set the chapter actually
references, and `diffImageCoverage` reports every image in neither list, matching on basename since
the model reports the path it resolved. Each unaccounted-for image and each stated concern is logged
as a WARNING and nothing more: the model's account of its own work is evidence, not proof, and an
extraction is not worth discarding over a side-channel. A **bare array** is still accepted forever
(older cached responses, smaller models, partial answers), and reported as "coverage unknown" rather
than treated as full coverage. The gap this closes: a chapter the model could not read produced
exactly the output shape of a chapter with nothing in it — `taught-index.json` records
`teaches: []` for the two image-only kana chapters, indistinguishable from "read it, nothing taught".

All three paths produce the
same superset item shape: `{ id, english, category, hint, note, reviewNote, target }` — the three
note fields are strictly separated (`hint` front-of-card cue, `note` back-of-card context,
`reviewNote` internal review-only rationale; a legacy blended `notes` folds into `reviewNote`) —
with the note fields and `target` explicitly `null` when the source path can't populate them, plus
an optional `ttsText` (what TTS speaks when the written target would be misread) and two optional flags
carried through when the extractor sets them: `uncertain` (the model wasn't sure the item
belonged) and `aiSuggested` (a critical-gap item the model added itself, not present in the
source).

### The review gates check state, not history

A lesson is only offered for review once **every pre-review pass has recorded a complete run**.
`lessonReadiness(cards.meta)` (`src/cards/readiness.js`) is the single answer, a pure function of the
meta so the CLI, the dashboard's render and its write-back cannot disagree. It requires
`enriched` (drills + semantic de-dup) and `notesEnhanced` (cross-lesson notes), both set by `prepare`
only when the pass had everything it needed.

It is enforced in three places, all reading the same verdict:

- `markCardsReviewed` refuses with a 409 naming what is still to run
- the review view withholds the **Mark reviewed** button entirely
- the home page files the lesson under **Not finished**, so "In review" means exactly one thing

Two carve-outs: a **template** is always ready (no source drills, no sibling lessons — `prepare` skips
both passes by design), and an **already-reviewed** lesson stays ready, so tightening the rule never
retroactively unreviews finished work.

The second gate has its own precondition: `setLessonDone` refuses a lesson that has not passed the
corpus review, because `done` is what puts a lesson into the merged `.apkg` and from there into the
live Anki collection.

This replaces trusting the route. Previously any `cards.json` was reviewable, so a bare
`anki-builder translate --run <dir>`, a `prepare` that died after translate, and a lesson built before
a pass existed all rendered identically to a finished lesson.

### Corpus review (in the dashboard)

There is no `review` CLI command — the **Corpus review** is performed in the dashboard, on the
**translated** cards (English + target + pronunciation together), and it is a **hard gate before
`audio`** (not before `translate`, which now runs unconditionally right after `assemble`). Open the
run's deck, exclude anything wrong (a reversible `excluded` flag on the card — the deck build drops
those), fix target/pronunciation inline, and click **Mark reviewed** to set `cards.meta.reviewed:
true`. For an `--epub`-sourced run, marking reviewed also saves the approved corpus (excluded items
filtered out, derived from the cards) into the local library (`src/corpus/epubLibrary.js`
`saveChapterCorpus`), so later chapters' backward-dedup pass has something to check against
(`markCardsReviewed` in `src/server/adapters/applyCards.js`). See
[Deck dashboard](#deck-dashboard-serve) for the routes.

Every exclusion carries its provenance: optional `excludedBy` (`"human"`, or the name of the script
or pass that applied it) and `excludedReason`. Both are optional and absent means human-or-legacy, so
files written before the fields existed still validate. It matters because the machine exclusions are
the ones worth re-reading: `extras-duplicate-check --apply` false-positives on roughly a third of the
groups it reports, and on disk its sweep used to look exactly like a reviewed decision. The dashboard
review badges a script-authored exclusion above the card's review note, and `npm run preflight`
reports the per-unit counts.

### Build a book's lessons in order

**A lesson's build reads the book's already-REVIEWED history, not its already-built history.** Three
passes depend on earlier lessons, and they read two different things:

| Pass                           | Reads                                                             | Written by                        |
| ------------------------------ | ----------------------------------------------------------------- | --------------------------------- |
| backward dedup (`assemble`)    | `.anki-builder/epubs/<hash>/corpora/<n>.json` for every lower `n` | the dashboard's **Mark reviewed** |
| fill-in-the-blank (`prepare`)  | each earlier unit's `cards.json`                                  | `prepare` (translate)             |
| cross-lesson notes (`prepare`) | each earlier unit's `cards.json`                                  | `prepare` (translate)             |

So assembling lesson N before lesson N-1 has been **marked reviewed** means N's de-dup cannot see
N-1 at all — every word N-1 already taught goes unflagged. And preparing lesson N before N-1 has
been **built** means the drill and note passes treat N as though it opened the book.

Neither is refused; both are reported. `assemble` warns and names the un-reviewed lessons
(`warnIfBuiltOutOfOrder`), and `prepare` warns and, crucially, **leaves `cards.meta.enriched` /
`notesEnhanced` unset** with a `prepareDegraded` breadcrumb, so re-running once the earlier lessons
exist redoes the passes rather than skipping them (`lessonOrderContext`, `src/cli/index.js`).

Building several lessons at once is not supported, and this is why: two lessons of one book are not
independent units of work. Running them concurrently guarantees the later one is built against a
history the earlier one hasn't finished writing.

### `prepare`

Everything between `assemble` and the first human review, as one stage
(`runPrepare`/`runPrepareInner` in `src/cli/index.js`):

1. **translate** — the pass below, skipped when `cards.json` already exists.
2. **fill-in-the-blank enrichment** (`src/cards/fillInBlank.js`) — mines the source's drills into
   practice cards, appended as a contiguous block at the END and marked `fillInBlank` + `aiSuggested`.
   Skipped for a `template` source.
3. **semantic de-dup** (`src/cards/semanticDedup.js`) — excludes (never deletes) practice cards that
   only repeat a pattern the lesson already covers, recording the reason in `reviewNote`.
4. **cross-lesson notes** (`src/cards/crossLessonNotes.js`) — one backward-only pass over this lesson
   with every earlier lesson as context. It writes back-of-card `note`s, plus a front-of-card `hint` on
   the cards that need one to be studiable at all: two cards reachable from the SAME English prompt with
   different answers (なんにん (nan-nin) and なんめいさまですか (nanmeisama desu ka), both glossed "How
   many people?"). That collision is invisible inside a single chapter, so this whole-book pass is the
   only place it can be caught. `hint` is written only when the model returns one, so cards it says
   nothing about keep the hints they have. Skipped for a `template` source.

`assemble` chains into it unless `--no-prepare` is given, which is what removes the un-translated
resting state: falling through assemble's "corpus.json already exists — reusing" branch into `prepare`
is also what makes re-running `assemble` the resume command for an interrupted build.

Each pass is **idempotent** — `cards.meta.enriched` and `cards.meta.notesEnhanced` record that steps
2–3 and 4 have run, so a re-run resumes instead of re-spending model calls (and never re-mines a lesson
whose source simply had no usable drills). Each **fails open**: a model or parse error logs and leaves
the cards as they were rather than blocking the build. A lesson already marked `reviewed` is skipped
entirely — growing or rewriting a signed-off card set is the one thing this stage must never do.

Unlike every other stage, `prepare` keeps its claim on failure (`clearOnFailure: false`), so a crash
mid-prepare surfaces in the dashboard as _interrupted_ instead of looking finished.

**Every pass here merges, it never overwrites.** Each one reads `cards.json`, spends minutes in a
model call, and writes back — and the dashboard is editable for that whole window, since a lesson at
the translate stage is exactly what someone reviews while `prepare` is still running. Writing back
the object read at the start would silently discard any exclude or inline edit made in between.
`mergeIntoCardsFile` (`src/cards/mergeIntoCardsFile.js`) is the shared path: re-read the file, apply
only the fields the calling pass owns (plus its own appends, removals and meta markers), then write
through `writeUnitJson` — validate, stamped backup, atomic write, re-read and validate. What each
pass owns:

| pass                                | owns                                                                                                                                                        |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| fill-in-the-blank + semantic de-dup | the drill block: stale drills removed, mined drills appended (already carrying the de-dup pass's exclusion marks), `meta.enriched` / `meta.prepareDegraded` |
| cross-lesson notes                  | `note` and `hint` on this lesson's cards, plus the same fields in `corpus.json`                                                                             |
| number readings                     | `ttsText`, `pronunciation`, `uncertain`, `reviewNote` on the cards it fixed                                                                                 |
| audio (a later stage)               | each item's audio filenames — its own merge, with extra rules about clips the reviewer chose by hand                                                        |

The backups are STAMPED (`cards.json.pre-prepare-fib-<YYYYMMDDHHmm>.bak`), so a second run of a pass
does not clobber the restore point for the state it actually found.

### `translate`

Runs as the first pass of `prepare` — there is **no review gate before it** (the review moved onto its
output). Items with `target: null` get a full translation; items with a real `target` already set
(e.g. from the EPUB path) only ever get a pronunciation guide — the model cannot override a
pre-existing target (see `src/translate/index.js`). The resulting `cards.json` is what the **Corpus
review** operates on.

**Spoken form (`ttsText`).** `ttsText` is the text TTS speaks instead of the target whenever the
written target would be misread (numerals AND kanji-bearing targets); it is never rendered on any
card face. It is the target rewritten in the language's own phonetic script, with whatever the
romanizer or the voice mishandles spelled out. The case that needs it today is **numbers**:
kuroshiro leaves a digit verbatim (`2,000えん` → `2 , 000 en`) and ElevenLabs may read it as an
English number, so extraction keeps the digits in `target` (natural card display) and emits
`ttsText: "にせんえん"`. When present, `ttsText` drives BOTH the romaji `pronunciation` (the
romanizer and pronunciation prompt romanize `ttsText ?? target`) and the `audio` (the audio stage's
`speechText` speaks `ttsText ?? target`); the deck still shows `target`. Absent a `ttsText`,
everything falls back to `target`, so only cards that need it are affected.

The field was called `reading` until the 2026-08 rename. `reading` read like a display field, and
the deck's own Anki note type has a field of that name, so the two were easy to confuse; nothing
renders either one. The Anki field is still named "Reading" (the live collection was not touched)
and `src/deck/collection.js`'s `fieldValue` maps `ttsText` onto it in one line.
`scripts/migrate-reading-to-ttstext.mjs` did the one-time data migration (key rename only, no value
touched, through `writeUnitJson`); it is kept so the change is auditable and re-runnable against any
older unit that turns up, and it is a no-op on a file that has already been migrated.

Prompts are Markdown-structured (Overview / Input Format /
Example Input / Output Format / Example Output / Important / Input Data). How `pronunciation` gets
filled in depends on whether the target language has a configured romanization library
(`src/translate/romanizationLibraries.js`, keyed by ISO 639-1 code — currently Japanese, Mandarin,
Korean, Russian and Hindi; only ja/zh/ko are proven, and Arabic and Hebrew were removed because both
libraries return a vowel-less consonant skeleton, see below): with a library configured, the model is asked for
`target` only, the library romanizes it deterministically, and a Sonnet-medium pass then **corrects that
output in place** — the library (kuroshiro et al.) is a starting point, not ground truth (it mis-splits
words, mishandles the sokuon っ, and spells unfamiliar kana letter-by-letter), so the model returns the
right romanization for every item, keeping the library's when it's already correct and fixing it when
it's not (see `correctRomanizations` in `src/translate/romanizationEval.js`). The correction lands
directly in `pronunciation` — no `uncertain` flag or note; the fix IS the resolution. It fails open (a
malformed/missing response keeps the library value). With no library configured, the
model is asked for `pronunciation` directly, preferring a standard romanization system when one
exists and falling back to a phonetic respelling otherwise, unchanged from before this distinction
existed.

**Which languages the romanization path is actually proven for.** Only ja / zh / ko have been run end
to end. Hindi is configured but half right: Sanscript's devanagari→IAST is a _Sanskrit_ scheme, so it
writes the inherent schwa that spoken Hindi deletes (कमल → `kamala` for `kamal`) and can leak a raw
combining nukta (सड़क → `saḍa़ka` for `saṛak`); it keeps its library and gets explicit schwa-deletion
and nukta rules in the prompt instead. Arabic and Hebrew were REMOVED from the registry: both scripts
omit short vowels and neither library restores them (كتاب → `ktab`, مدرسة → `mdrsa`, ספר → `spr`,
שלום → `šlwm`), and since the prompt presents the library's value as a trustworthy starting point,
leaving them wired in anchored the model on an unpronounceable answer. They now take the LLM-only
path, which can supply the vowels.

Everything language-specific in the romanization prompt is a placeholder fed from
`src/translate/languageRules.js` — the style rules, the romanization system's name, what that
language's library gets wrong, and the few-shot pair. It used to be written into the template, so a
Hindi or Arabic run was shown ろっかい / こんにちは and told about the small っ; few-shot examples
dominate a one-line instruction, so the model was being anchored on Japanese regardless of the input.

All four of these prompts are hand-editable Markdown templates in `docs/`, rendered through
`renderPromptTemplate`: [`translate-full-prompt.md`](./translate-full-prompt.md),
[`translate-target-only-prompt.md`](./translate-target-only-prompt.md),
[`translate-pronunciation-prompt.md`](./translate-pronunciation-prompt.md) and
[`romanization-prompt.md`](./romanization-prompt.md). They were string arrays inside
`src/translate/` until the 2026-08 move, which made them the only prompts requiring a code change to
edit and the only ones with no automated contract; `test/docs/promptTemplates.test.js` now pins each
one's placeholders and output contract. [`translate-prompts.md`](./translate-prompts.md) says which
prompt runs when and which language fragments each takes, and
[`.harness/custom/docs/LIMITATIONS.md`](../.harness/custom/docs/LIMITATIONS.md) covers the dependency
trade-offs this introduces.

**One pinned romanization spec, three prompts, one lint.** `src/translate/romajiStyle.js` holds the
target language's romanization style as `{ id, rule, detect }` triples: `rule` is the prose injected
verbatim into every prompt that produces a `pronunciation` (the romanization-correction pass, the
number-reading pass, the fill-in-the-blank pass, via `languageRules.js`'s `romanizationStyle`), and
`detect` is what `preflight`'s `romaji-style` check runs over the finished cards. Prose and detector
live in the same object so a rule cannot be linted without being taught, or taught without being
checked. A rule that no regex can decide (proper-noun casing; a missing ん apostrophe) carries
`detect: null` and the check names it as taught-but-not-linted rather than letting it read as
checked. Before this constant existed, four passes each described the style in their own words and
the output drifted per batch — a trailing ASCII period on 253 cards, `-san` hyphenated in one unit
and spaced in the next, `kombini` beside `konbini`.

**Optional simplified target script (`--simple-script`).** A language may define a beginner/learner
script constraint in the language plug-in `src/translate/targetScript.js` (`getSimpleScriptRule`, keyed
by ISO code — Japanese → "kana only, no kanji"). When `translate --simple-script` is passed,
`translateCorpus` resolves that rule for the target language and injects it into the target-generation
prompt; the translate core is script-agnostic (it just forwards the instruction string), and a language
with no rule ignores the flag. This is the same per-language plug-in pattern as voices / alt-audio /
romanization / fonts — nothing language-specific lives in the core.

**The retry halves the failed set.** Each group goes to the model as one unbatched call, so when the
whole response is unusable — truncated, unparseable — every item in the group fails at once. Retrying
that set at the same size would rebuild a byte-for-byte identical prompt and fail identically, having
spent a second full-size call to learn nothing. The retry therefore sends it as two half-size prompts,
which is a genuinely different request: it fits where one did not, and a response that still breaks
costs only half the lesson. Only items that fail both attempts surface in `meta.translateErrors`.

**Provenance flags carry forward.** The corpus's `aiSuggested` / `uncertain` flags are copied onto the
translated card by `translateCorpus` (matched by `id`), so they persist into `cards.json` and every
downstream review rather than being lost at translate. `aiSuggested` is a field on both
`CORPUS_SCHEMA` and `CARDS_SCHEMA`; the dashboard badges both at every review stage
(`src/server/adapters/runDir.js` render mappers → `deckViewChrome`). They're never auto-cleared.

### `audio`

`generateAudio` (`src/audio/index.js`) resolves `cards.meta.targetLanguage` against
`src/model/iso639.js`'s `resolveIso639Code` (the full ISO 639-1 code set) once per run and, when
it's a real code (not a full language name like `"Japanese"`, which resolves to `null`), passes it
through to `fetchTts` as a 4th argument. The default `fetchTts` (`src/cli/index.js`) includes it in
the ElevenLabs request body as `language_code` only when non-null — omitted entirely otherwise, so
ElevenLabs falls back to its own auto-detection exactly as it always did before this parameter
existed. This is on top of `voiceId` (sent as part of the request URL path,
`.../text-to-speech/<voiceId>`, not the body) and `model_id` (`src/audio/ttsModel.js`'s `TTS_MODEL`,
default `eleven_v3` — noticeably more natural than the older `eleven_multilingual_v2` at the same
1-credit/character cost; override with `ANKI_BUILDER_TTS_MODEL`). The audio cache is **segmented by
model** (`audio/<voiceId>/<model>/…`) so switching models never serves a stale clip generated by a
different one. `--voice
<voiceId>` can be omitted once a language has a configured default (`src/audio/voiceLibrary.js`'s
`DEFAULT_VOICES`, keyed by the same ISO 639-1 code) — an explicit `--voice` always overrides it;
with neither, the stage still throws asking for one.

**Default take only (end marker per language).** The stage generates exactly ONE clip per card — the
default (`audio`). For a marker-using language (`src/audio/ttsMarker.js`'s `MARKED_LANGUAGES`,
Japanese today) the text sent to TTS carries the `。ででで` end marker described above, and the trim
strips it from the recording. Every OTHER variant — comma/bracket forms and kana+kanji — is
generated **on demand** in the dashboard (see the audio review below), not up front; the variant
set is comma × brackets (1 to 4 takes, `src/audio/variants.js`). The displayed `target`/`ttsText`
never carries a `。`; the sentence-final prosody is audio-only.

**Per-language TTS text normalization (`src/audio/ttsText.js`'s `normalizeTtsText`).** The exact text
sent to TTS (and used as the cache key) is the card's spoken text run through a per-language
normalizer. Japanese strips whitespace: `target`/`ttsText` keep their editorial spaces for the learner
(これは フランスの ワインです。), but the audio is generated from the space-free form
(これはフランスのワインです。) — because ElevenLabs voices each space as an audible pause (a spaced clip
runs ~20-25% longer than its unspaced twin). Languages whose spaces are real word boundaries (Spanish,
etc.) have no transform and are sent unchanged. The `。` default transform composes on top of the
normalized text.

**Trailing-silence trim (`src/audio/trimSilence.js`).** ElevenLabs leaves ~0.3s of silence plus a tiny
end artifact ("blip") on every clip. The mechanism: ffmpeg `silencedetect` locates the last real speech
segment (≥ `minSpeechSec`, so a short trailing blip is skipped and a genuine mid-clip pause is
preserved) and the clip is cut at the **midpoint of the trailing silence** (never at the speech edge —
the buffer scales with the silence, with `padSec` as a floor) and re-encoded. **Best-effort:** if
ffmpeg isn't installed (a one-time warning) or any step fails or the result isn't smaller, the input is
returned unchanged — the audio build never breaks. Off with `ANKI_BUILDER_TRIM_AUDIO=0`; thresholds via
`ANKI_BUILDER_TRIM_SILENCE_DB` / `_MIN_SILENCE_SEC` / `_MIN_SPEECH_SEC` / `_PAD_SEC`.

**Background-noise cleanup (`src/audio/cleanupFilter.js`).** ElevenLabs clips carry low-frequency
rumble under the voice. Measured across this project's own decks, the noise floor in a clip's silence
sits around -37 to -51 dBFS where clean audio is below -70, and **~94% of that energy is below 80 Hz**
— it reads as a low whoosh, not a hiss. Speech has nothing down there (a Japanese TTS voice's
fundamental is comfortably above 100 Hz), so a steep low-cut removes it without touching anything
audible. `asubcut` (a high-order Butterworth) is the workhorse: at the same corner frequency a
20th-order cut attenuates 50 Hz by ~60 dB where two cascaded 2-pole `highpass` stages manage ~24 dB.

Three chains, picked by ear against measurements over 14 clips spanning every deck:

| chain                | noise    | voice peak | worst voice | notes                                                          |
| -------------------- | -------- | ---------- | ----------- | -------------------------------------------------------------- |
| `standard` (default) | -35.0 dB | -0.94 dB   | -3.20 dB    | low-cut + FFT denoise + downward expander                      |
| `gentle`             | -21.1 dB | -0.19 dB   | -2.90 dB    | plain highpass + light denoise; least invasive                 |
| `aggressive`         | -29.1 dB | -0.69 dB   | -5.70 dB    | 130 Hz corner — cleans LESS than standard and costs more voice |

`aggressive` is not the strongest cleaner despite the name; its higher corner cuts into the
fundamental of lower-pitched clips. Both alternatives exist as escape hatches for the occasional clip
the default handles badly, selectable per card in the trim modal and stored on the card as
`audioFilter` so a later re-trim re-applies the same one. `ANKI_BUILDER_AUDIO_CLEANUP` sets the
default (or `off` to disable), and chains are only ever selected BY NAME from a fixed table — a
request can never supply a raw ffmpeg filter string that would reach a command line.

**Cleanup runs BEFORE the trim, in the same pass.** Not cosmetic ordering: rumble peaks around -38 dB,
above `silencedetect`'s -40 dB threshold, so on a noisy clip the trailing "silence" reads as sound and
the trim gives up entirely — measured at roughly 1 clip in 16 on this project's decks. The chain is
prepended to BOTH of `trimTrailingSilence`'s ffmpeg invocations (the detect pass and the cut pass)
rather than cleaning into a temp file that is then trimmed, so detection sees cleaned audio while the
output stays a SINGLE encode from the original instead of two stacked lossy generations.

**Japanese end marker (`src/audio/ttsMarker.js`).** ElevenLabs frequently clips the end of an
utterance — it usually gets the last mora out, but the release is cut short so the clip ends abruptly
instead of decaying. Measured on this project's decks, a substantial share of Japanese clips came back
with speech running to the final sample and no trailing silence at all.

The fix is to give the model something it is ALLOWED to truncate: `ででで` is appended to Japanese TTS
text, so whatever gets clipped is the marker rather than the card's words.
The marker is cut back off before the clip ships. It is part of the text SENT and therefore part of the
cache key, so a marked clip is never reused as an unmarked one. Japanese only — it relies on ja being
written without spaces and on で being a clean repeated syllable no card ends with three of. Off with
`ANKI_BUILDER_TTS_END_MARKER=0`.

**The marker is `。ででで`, and the `。` is load-bearing.** It is what makes the model treat the marker
as a separate utterance and leave a gap in front of it — and that gap is what makes the marker findable
at all. Measured: `はちじ。ででで` leaves a 1.12s gap and strips cleanly, while `はちじででで` leaves 0.24s
and is not recognised, so the clip ships the marker AND all its silence (0.82s becomes 3.20s). `ふん`
without the dot came back as a single 0.96s segment with no separation whatever.

That `。` used to be a per-language "alt audio" transform appended to the card's TEXT, which also made
every Japanese card offer a with-dot / without-dot pair of takes. It existed to work around clipping and
mis-rendered short clips; the marker covers both. Folding the dot into the marker produces a
byte-identical string, so that whole module was deleted with no change to what is sent and no cache
invalidation. `cardAudioVariants` keeps its other two axes — brackets and commas — because those choose
WHICH WORDS are spoken (`おつかれさま（でした）` with or without the optional part) rather than working around
a TTS defect.

Removing it takes **two independent checks**, and both must agree:

- **Position** (`markerCandidates`) proposes the windows the marker could occupy, longest first. The
  voice renders the three `で` either as one blob or as up to three separate utterances, and
  `silencedetect` splits the latter into three segments — so how many segments the marker occupies
  isn't knowable from position alone. Each candidate is a trailing run of at most three segments (`。
ででで` never has more). A LONE trailing segment must sit behind a 0.3s gap — the original rule, and
  the only evidence it isn't just the phrase's last word — and may be up to 1.0s wide, since it can
  hold all three `で` at once. A segment JOINED to a run needs only a 0.15s gap but must be at most
  **0.35s** wide, because it has to be a single `で` on its own: measured, one `で` runs 0.22–0.32s
  while the real-speech segments this walk otherwise swallowed (`いろの` in はいいろの, `なんですか` in
  あれはなんですか, `かい` in じゅっかい) run 0.39–0.98s, with nothing in between.
- **Shape** (`src/audio/pulseShape.js`) then **decides between the candidates**, not merely vetoes the
  one: the marker is one syllable three times, so its amplitude envelope rises and falls 2–4 times, and
  a window that has swallowed a real word reads as more. The first candidate to pass wins. "Exactly
  three" was deliberately NOT required — it identified the marker only 11 times in 12 (one clip merged
  two で into a single 0.245s pulse), which would leave audible nonsense on roughly one card in six.

**Why shape has to choose, rather than a gap threshold.** The gaps do not separate the two cases. On
`ら` the pause opening the marker is 0.25s while the `で` sit ~0.9s apart; on `あれはわにです` the opening
pause is 1.09s and the `で` sit ~0.28s apart. So the same ~0.28s gap means "inside the marker" on one
clip and "the marker starts here" on the other, and no threshold reads both correctly. Selecting by
shape does: on `じゅっかい` the two-segment window reads as 5 pulses and is rejected, leaving the correct
one-segment window; on `あれはわにです` the one-segment window reads as 1 pulse and is rejected, leaving
the correct three-segment one. Taking only the last segment — the original behaviour — shipped the
whole marker on 39 cards, concentrated in the short single-mora lessons where the voice has most room
to draw it out.

If no candidate passes, nothing is cut. A reviewer then hears a stray marker and fixes it by hand,
which is a far better failure than silently cutting the words off a card. Note that an unstripped
marker also defeats the trim entirely (the marker becomes the last speech, so there is nothing after it
to cut), so the failure is loud rather than subtle. `audioMarked` records that a card's original still
carries the marker, so a later cleanup switch or re-trim strips it too.

**Both takes are kept.** The trim used to run inside `fetchElevenLabsTts` — the single choke point — so
every clip arrived pre-trimmed and the raw take was discarded before it reached disk. That made the
algorithm's mistakes permanent and invisible: it only ever cuts the END, so leading silence survives
every clip by design, and when it cut too early the clipped audio was simply gone. `fetchElevenLabsTts`
now returns the raw bytes and each producer derives the trimmed take itself with `autoTrim`, storing
the pair side by side:

| Where                 | Untouched take                     | Trimmed take                |
| --------------------- | ---------------------------------- | --------------------------- |
| audio cache / run dir | `<hash>.orig.mp3`                  | `<hash>.mp3`                |
| Generate preview      | `<hash>-gen-<bytes>.orig.mp3`      | `<hash>-gen-<bytes>.mp3`    |
| Replace upload        | `<cardId>-user-<bytes>.orig.<ext>` | `<cardId>-user-<bytes>.mp3` |

`<hash>.mp3` keeps its long-standing meaning (the trimmed clip the deck embeds), so existing caches and
`isDefaultClipFilename`'s staleness rule are untouched, and a MISSING `.orig.mp3` means exactly one
thing: that clip predates this change. Those cards get an original again the next time they're
regenerated or replaced; nothing already on disk is reinterpreted, and a missing original never
triggers a refetch (that would spend credits re-rolling a non-deterministic voice, changing how an
already-approved card sounds). The cache writes the original FIRST, so a crash mid-write leaves the
shipping clip missing and self-heals on the next run rather than orphaning a clip whose absent sibling
would read as "predates originals" forever.

Because the trimmer re-encodes to mp3, a take it actually changed is stored as `.mp3` regardless of
what it arrived as — writing mp3 bytes under a `.wav` name would be a worse bug than not trimming. An
upload the trim left alone is stored once, under its own extension, and ships as-is. Uploads and
generated clips go through the identical path, so a hand-uploaded Replace never sits next to generated
clips that had their silence removed.

`generateAudio` fetches only the default clip per card (cache misses only). The legacy `altAudio`
field is no longer written — the **Generate** button synthesizes fresh comma/bracket variants
(1 to 4 takes, `src/audio/variants.js`; per-take Re-roll costs one credit) to audition and pick,
not a pre-baked second recording. There is no with-`。` / no-`。` choice any more — every take gets
the sentence-final prosody via the end marker. The schema still tolerates `altAudio` on cards from
older runs; the deck build never embeds it.

A second on-demand action, **Generate (kanji)** (Japanese decks only — `src/audio/generateKanjiVariants.js`),
addresses ElevenLabs mis-parsing all-kana input: it first asks Claude (`src/audio/kanjiOrthography.js`,
via the same `runClaude` as translate) to render the card's kana reading as natural kanji+kana
orthography — preserving the exact reading, only the script changes — then synthesizes fresh no-`。` /
with-`。` takes from THAT text and shows the produced kanji in the audition modal. Both on-demand paths
write content-addressed preview files (`-gen-` / `-genkanji-` infixes) that never collide with the
built clip, and neither touches `cards.json` until you pick a take.

**Kanji-orthography TTS, opt-in per unit (`meta.kanjiTts` + `ttsKanji`).** ElevenLabs mis-parses
all-kana Japanese — it is out of distribution against how the language is actually written — so a
kanji+kana form often voices more naturally. Two separate things control it, and keeping them apart
is the point:

- **`ttsKanji` on a card** is the orthography itself, produced by
  `scripts/generate-kanji-tts.mjs --run <unit-dir> --apply` (one model call per card, no TTS). It is
  never rendered: the learner sees `target`, exactly as with `ttsText`. The audio review shows it
  under the kana so a human can read the conversions.
- **`meta.kanjiTts` on a unit** is whether the voice actually reads it, set at unit creation with
  `translate --kanji-tts`. `clipSourceText` consults it; nothing else does.

The split exists because kana→kanji is ONE-TO-MANY (はし is 橋 / 箸 / 端, いま is 今 / 居間), so a
conversion can put a different word in the audio of a card whose kana face gives the learner no way
to notice. Storing the text first makes that catchable on screen, for free, before a credit is spent.

Opt-in **per unit**, never globally: `defaultClipText` feeds both the ElevenLabs cache key and the
staleness filename, so flipping it for Japanese wholesale would invalidate every existing ja clip
(paid refetches, discarded trim tuning) while hand-touched cards stayed exempt from regeneration —
a silently mixed-orthography deck. Whether it is worth doing at all is unmeasured;
`scripts/kanji-tts-ab.mjs` is the blind A/B that would settle it, written and never run (it spends
credits, which is the owner's call).

**What text a clip actually says (`audioTextHash`, `src/audio/textHash.js`).** The stage's own
staleness rule (`clipIsCurrent` in `src/cli/commands/audio.js`) asks whether the card's stored clip
name still matches a hash of its current text — but it short-circuits to "current" whenever
`isStageOwnedCard` is false, which it is for every picked variant, every Replace upload and every
hand trim. About 200 live cards are therefore exempt from the text-changed check permanently, while
the dashboard's inline edit rewrites `target` and `ttsText` freely.

`audioTextHash` closes that. Every path that installs audio records the 16-hex hash of the text the
take was generated from, read off the take's own content-addressed name rather than computed from
the card:

| Take             | Name                               | Hash is over                        |
| ---------------- | ---------------------------------- | ----------------------------------- |
| audio stage      | `<hash>.orig.mp3`                  | `defaultClipText` (marker included) |
| Generate         | `<hash>-gen-<bytes>.orig.mp3`      | the picked variant's text           |
| Generate (kanji) | `<hash>-genkanji-<bytes>.orig.mp3` | the generated kanji text            |
| Replace upload   | `<cardId>-user-<bytes>.orig.<ext>` | nothing — unverifiable              |

The audio review compares that hash against every hash the card's CURRENT text can produce and
badges a card whose clip no longer matches with **Text changed**. `npm run preflight` counts the
same three outcomes per collection under `audio text hash`.

"Can produce" is deliberately wide, because the text sent to TTS has changed twice without any
card's own text changing: each spoken form (the default clip, each comma/bracket variant, the stored
`ttsKanji`) is accepted bare, with the end marker, with the legacy Japanese trailing `。` the marker
replaced, and with both. That last pair is not indulgence — 52 of the 53 clips the first live run
flagged were generated under the with-`。` convention and speak their card's words perfectly. Badging
them would have put 52 false positives on screen on landing day and buried the one card whose clip
really is of other words.

Three rules make the record trustworthy rather than decorative:

- It is **never bulk-stamped from a card's current text.** That would declare every drifted clip
  correct in one pass and permanently destroy the signal. Existing clips were backfilled from their
  filenames by `scripts/backfill-audio-text-hash.mjs` (2,143 of 2,173 recoverable; 30 hand-named or
  uploaded takes carry no hash and report as unverifiable).
- It is a **badge, never a gate.** "Mark done" has no gate of any kind, and a mismatch has no exit
  that does not destroy the reviewer's trim or pick — so a block would only teach an override habit.
- The reviewer's exit is the **Keep this clip** button beside the player. It re-stamps the hash from
  the card's current text and records `audioTextHashAcceptedBy` / `audioTextHashAcceptedAt`, so a
  one-click certification of drift is at least auditable. It installs no audio and spends nothing.

### `deck`

**What the package is called (`src/deck/deckFileName.js`).** A built `.apkg` is named after the deck
it contains, not the legacy `deck.apkg` — otherwise every package is indistinguishable the moment it leaves its
folder, and picking the right one in a downloads directory or Anki's import dialog means reading the
path. The name is derived from the directory PATH alone, never from a title read out of a metadata
file: the writer and any reader looking for the same package compute it independently, so they cannot
disagree and no failed lookup can invent a different name. The folder slugs are already derived from
the human names (a book's from its `<dc:title>`, a course's from its name), so naming after the folder
IS naming after the EPUB or course, canonicalized once at assemble time rather than twice.

| directory                          | package                       |
| ---------------------------------- | ----------------------------- |
| `output/epubs/<book-slug>/`        | `<book-slug>.apkg`            |
| `output/courses/<course-slug>/`    | `<course-slug>.apkg`          |
| `output/templates/<name>/<lang>/`  | `<name>-<lang>.apkg`          |
| `output/…/<course-slug>/lesson-3/` | `<course-slug>-lesson-3.apkg` |
| any other run dir                  | `<folder>.apkg`               |

The last two shapes fold their parent in because their own basename identifies nothing — every course
has a `lesson-3`, every template a `ja`. Readers go through `resolveDeckPathForDir`, which prefers the
named file but falls back to the legacy `deck.apkg` left by an older build, so a deck built before this
convention is still readable. The one-off script that renamed existing packages has been removed now
that every package on disk uses the new names; the fallback stays because it costs nothing.

Builds a two-template Anki note type: **Recognition** (ordinal 0 — question shows `Target` and
autoplays `Audio`, the target-language listening/recall direction; answer reveals `English`) and
**Production** (ordinal 1 — question shows `English`, answer reveals `Target`/`Pronunciation`/`Audio`
for the native-pronunciation check). Both directions play the target-language audio; Recognition
plays it on the question side, since that's the direction meant to exercise listening comprehension,
not just script recognition. The ordinals are a contract, not a detail — a card's `dirSuspended`
names them.

The note type is assembled by `src/deck/collection.js` out of three modules, each the single source
for its half: `cardTemplates.js` (the two `{name, qfmt, afmt}` templates), `cardStyles.js` (the CSS)
and `noteFields.js` (the field list and the card → field mapping). They are separate because
`collection.js` opens a sqlite database at import time, and the surfaces that only DESCRIBE a card —
the authoring prompts' `{{CARD_FACES}}` block, the reviewer's card-face preview — must not pay for
that to do it.

**What each face shows, and why.** `scene` renders on the front of BOTH directions (it sets the
situation and must never leak the answer either way); `hint` renders on the Production front and the
Recognition BACK (it describes the target word, which on a Target→English front IS the answer); the
category chip renders on the **Production front only** — on a Recognition front it is an uncontrolled
answer cue, stronger than any scene the collision doctrine permits, on 2,150 fronts of which 86% have
no scene at all. `Reading` (the note type's field holding `ttsText`) is rendered by NO template, on
purpose. The prompt on either front is wrapped in `.prompt` and set at the answer's 26px/600, because
the same sentence used to render at 20px as a question and 26px bold as an answer — sizing the harder
direction smaller. Every text style clears WCAG AA against both the light and night-mode backgrounds,
computed and asserted in `test/deck/cardStyles.test.js` rather than eyeballed.

**Per-card direction (`dirSuspended`).** A card may name the template ordinals it should not be
studied in — `dirSuspended: [1]` is "Recognition only". The `.apkg` builder still emits **both** card
rows for it; the DELIVERER suspends the unwanted ordinal
(`src/anki/directionSuspension.js`). Both halves of that are load-bearing. Gating a template's front
on a field produces an EMPTY card, which Anki's Tools → Empty Cards deletes along with its interval
and review log; omitting the card row at build time is inert on the AnkiConnect path (`addNote` makes
Anki generate one card per template) and self-reversing on the `.apkg` path (Check Database and any
template update regenerate it). Suspension is the only per-note direction suppression that survives
routine housekeeping.

Consent is graded. A note **this deliver created** is suspended unconditionally and tagged
`dir-suspended::<ord>` — it has never been studied, so there is no scheduling to disturb. A note that
was **already in the collection** is left alone and the unapplied flag is reported; applying it needs
`--suspend-delivered`, which is itself refused until two behaviour probes are recorded
(`suspend-on-filtered`, `housekeeping-unsuspends` — see `src/anki/probeResults.js`). A card that is
unsuspended AND already carries its tag was turned back on by a **person**, and that decision is
permanent unless the distinct second flag `--re-suspend-human-unsuspended` is passed. Suspending
every direction is refused by name: that is a note with no studiable card, which is what `excluded`
is for.

**Deletion is not on this path at all.** `deleteNotes` and `deleteDecks` exist on the client
(`src/anki/ankiConnect.js`) and nothing in the delivery code calls either. Deliver reports a card
that left the corpus as `orphaned` and stops there, because deleting a note takes its cards and its
whole review log with it and Anki cannot undo that. The two actions are there for retiring a whole
collection, which is a decision a person makes once. `deleteDecks` defaults `cardsToo` to `false`, so
a deck that turns out not to be empty gives its cards up to Default rather than to deletion; that
default is a safety property rather than a convenience, and a test asserts it.

**Stated consequence:** because the `.apkg` keeps both rows while delivery suspends one, a built
package deliberately no longer reproduces the delivered deck card-for-card. That is the right trade —
the two builders must not drift STRUCTURALLY — but it is a real difference and the freshness check
compares packages, not scheduling.

⚠️ **Any edit to those templates or that CSS is a change to a SHARED note type.** It is keyed on
language alone, so the next deliver of any deck in that language rewrites the card faces of every
other deck using it and flips Anki's schema, forcing a one-way full AnkiWeb sync the owner completes
by hand. `deliver --dry` prints the unified diff plus every deck and card count it reaches;
`--allow-model-change` is the consent step (`syncStructure`, `src/anki/deliver.js`).

It is **per-language**: named `AnkiBuilder <lang>` (the resolved ISO 639-1 code, e.g.
`AnkiBuilder ja`) with a stable, language-derived id (`languageModelId`). Anki keys note types by
id, so every deck of a language shares ONE note type — no pile-up of duplicates on repeated imports
— and different languages never collide. When the language has a configured deck font
(`fontLibrary.js`'s `LANGUAGE_FONTS`; Japanese → Klee One), the builder auto-embeds it: the font
file goes into the deck's media (`embedLanguageFont`, `src/deck/index.js`) and the model's CSS gains
the scoped `@font-face` + `.card` rule (`languageFontCss`), so kana/kanji render in the textbook font
on every client while Latin stays Latin. (`restyle-font` applies the same to third-party decks.)

- `--run <dir>`: the ordinary one-chapter/one-lesson mode — one `cards.json` in, one `.apkg`
  out.
- `--book-dir <dir>`: the book/course-level merge mode — scans `<dir>/chapter-*/cards.json` AND
  `<dir>/lesson-*/cards.json` (in ascending folder-seq order; an EPUB book only ever has the
  former, a lesson-sourced course only ever has the latter). It merges **only FINISHED lessons** —
  those whose `cards.meta.done === true` (the human's final "Mark done" sign-off in the dashboard);
  a lesson not yet translated or not marked done is **skipped**, so an un-reviewed lesson never gets
  baked into the package (`rebuildBookDir`, `src/deck/rebuild.js`). If no lesson is done it errors
  clearly. The finished lessons merge into a SINGLE
  `<dir>/<slug>.apkg`, each as its own real Anki sub-deck (`Book/Course Title::Chapter/Lesson
Label`, via `buildMultiDeckCollection`) nested under one parent deck named for the book or
  course (title looked up from the local library by the first chapter's `epubHash`, or from the
  course folder's own `course.json` marker when there's no `epubHash` — `loadCourseMeta`,
  `src/cli/outputPaths.js` — falling back to `--name` then a generic string). Always rebuilds from
  scratch — no "already exists, reusing" short-circuit — since it's merging inputs that can change
  between runs (a re-translated chapter, a newly added one, regenerated audio), and reusing a
  stale merge would be a correctness footgun for a recompute this cheap.

**The zip builder refuses past 65,535 entries.** `buildZip` (`src/deck/zip.js`) writes a plain
no-zip64 archive, and the end-of-central-directory record holds the entry count in a uint16. Past
65,535 that count wraps, and what comes out is still a structurally valid zip that any reader
trusting the EOCD opens happily — just missing 65,536 entries. A `.apkg` is exactly that kind of
consumer, so the corruption would surface as cards that quietly never arrived rather than as an
import error. It throws instead. Current decks run to roughly 1,900 entries, so this guards a future
that has not happened; the point is that its failure mode is invisible.

### `restyle-font`

`restyle-font --apkg <path> --lang <code> [--out <path>]` embeds a language's configured deck font
into an existing `.apkg` and points every note type at it — including third-party decks not built
here. The per-language font map is `src/deck/fontLibrary.js`'s `LANGUAGE_FONTS` (keyed by the same
ISO 639-1 code as voices/alt-audio); Japanese → **Klee One**, a Kyōkashō (教科書体, "textbook") face
that keeps the hand-written stroke separations screen Gothic fonts smooth over, so kana/kanji read
correctly for a learner. The font ships in `assets/fonts/` under the SIL OFL (`KleeOne-OFL.txt`).

`restyleApkgBuffer` (`src/deck/restyleFont.js`) reads the archive (`readZip`, `src/deck/zip.js`),
rewrites each note type's CSS (`restyleModelsCss`: drops any external-URL `@font-face`, adds an
`@font-face` for the embedded file — scoped to the target script via `unicode-range`, so it renders
only kana/kanji and leaves English/romaji/numbers in a Latin font — and appends a
`.card { font-family: "<font>", <Latin sans>… }` rule that wins over the deck's own), registers the
font in the `media` manifest under a `_`-prefixed name (so
Anki's Check Media never purges it), and re-zips (`buildZip`). It's idempotent, and embeds the font
so it renders identically on every client. Only the classic `.apkg` format (a `media` JSON map +
`collection.anki2`/`.anki21`) is supported — the newer `anki21b`/protobuf-media export is rejected
with a clear error.

## Local library

All durable state that survives between runs — the ElevenLabs audio cache and the EPUB registry —
lives inside this checkout at `.anki-builder/` (gitignored, never committed or pushed), via
`libraryHome()` in `src/model/index.js`. There's no env-var override and nothing to configure; it's
always relative to the repo itself, regardless of which directory you invoke the CLI from.

```
.anki-builder/
  audio/<voiceId>/<model>/<hash>.mp3            # ElevenLabs TTS cache (segmented by model)
  epubs/<epubHash>/book.epub                    # idempotent copy of a registered .epub
  epubs/<epubHash>/book.json                    # { title, slug, invariants, hints } — title from
                                                 #   <dc:title>, slug filled in lazily on first
                                                 #   --output-root use. See "Per-book config".
  epubs/<epubHash>/cache-v<N>/chapters/<chapterNumber>.xhtml   # extracted-chapter cache
  epubs/<epubHash>/cache-v<N>/images/<...>          # images the cached chapters reference,
                                                     #   at whatever relative path their own
                                                     #   <img src> resolves to from chapters/
  epubs/<epubHash>/corpora/<chapterNumber>.json     # reviewed corpus, saved on "Mark reviewed"
  epubs/<epubHash>/conventions.md               # one-time whole-book conventions analysis
  epubs/<epubHash>/conventions.md.meta.json     # which prompt/model/effort produced it, and when
  epubs/<epubHash>/taught-index.json            # one-time whole-book taught-content index
  epubs/<epubHash>/taught-index.json.meta.json  # same provenance record, for that index
```

Three of those are **tracked in git** rather than ignored — the reviewed corpora, `conventions.md`
and `taught-index.json` (see the `.gitignore` re-include block). They are months of human review and
two expensive one-time model passes, and they are what the eval fixtures below read as their
reference data.

### Cache versioning and clearing

`CACHE_VERSION` (`src/corpus/epubLibrary.js`) names the `cache-v<N>` root. Bump it whenever
chapter extraction or image resolution changes: a cached chapter file is treated as a COMPLETE
extraction forever, which is what makes a parser fix inert for a book already read once. The
chapter file sits one level inside the versioned root so an image's own `../images/foo.png` still
resolves within it — a bump therefore invalidates chapters and their images together. Output from
an older version is orphaned, never deleted behind your back. (v1 was the flat
`<book>/chapters/` + `<book>/images/` layout.)

Only the free zip-inflate cache is versioned. `conventions.md` and `taught-index.json` are outputs
of paid whole-book passes and are never invalidated automatically. Each one does carry a
`<artifact>.meta.json` sibling naming the prompt template (by path and sha256), the model, the
effort and the chapter count that produced it, so a later run can say the artifact predates the
current prompt. It says so and stops there: regenerating is a paid pass and a judgement call.

```sh
anki-builder epub cache <hash>                    # what is cached, and when it was generated
anki-builder epub cache <hash> --clear            # chapters only (free to rebuild)
anki-builder epub cache <hash> --clear --conventions --taught-index --dry
```

`--clear` takes the free chapter cache by default; the paid artifacts must be named. `corpora/` is
never touched, whatever is asked for, and the refusal is checked at the point of deletion rather
than assumed from how the target list was built — it holds human-reviewed chapters that no amount
of compute can rebuild, one directory away from everything the command does delete.

## The pass ledger, and `resume`

Every model pass in a build records its outcome on the unit, at `meta.passes`:

```json
"passes": {
  "forwardFlags": { "status": "failed", "reason": "usage limit reached" },
  "pedagogicalSort": { "status": "ok" },
  "taughtIndex": { "status": "skipped", "reason": "this book has no cached taught index — ..." }
}
```

`recordPass` / `failedPasses` live in `src/cards/passLedger.js`. The ledger travels corpus -> cards
(translate copies `meta` verbatim), so an entry written during `assemble` survives into the deck.

**Three stages write to it:** `assemble` (taught index, forward flags, pedagogical sort), `translate`
(romanization), and `prepare` (translate, drill mining, semantic de-dup, cross-lesson notes, number
readings). `prepare`'s half matters more than it looks: a hand-authored **extras** unit never runs
`assemble` or `translate`, so before `prepare` stamped its own passes those units carried no ledger at
all — and the `pass-ledger` check goes silent on a unit with no ledger by design. "preflight clean"
therefore said strictly less about an extras unit than about a base lesson, and said so nowhere. Each
stage merges into what is already recorded rather than overwriting, so the halves coexist.

This extends a convention that already existed rather than inventing a second one. `prepare`'s two
enrichment passes have always written markers (`enriched`, `notesEnhanced`), which is exactly why a
failure there was trivially recoverable: no marker means not done, so a re-run retries those and
only those. The passes outside `prepare` — the taught index, the forward flags, the pedagogical
sort, the romanization correction — wrote nothing at all. Nothing on disk knew they had failed, so
nothing could retry them, and the failure surfaced weeks later as one wrong card.

Three things read the ledger:

- **`preflight`'s `pass-ledger` check** (FAIL tier, `src/audit/checks/passLedger.js`) refuses to let
  a unit with an incomplete pass present itself as ready for a review gate. Silent for units built
  before the ledger existed — no `meta.passes`, nothing to report.
- **`prepare`'s closing line** names what did not complete instead of saying "ready for the corpus
  review" regardless.
- **`anki-builder resume --run <dir>`** (`src/cli/commands/resume.js`) re-runs exactly what failed.

### `resume`

The plan is data (`planResume`, `src/cards/resumePasses.js`), so `--dry` and the real run cannot
disagree. Passes split three ways:

| group         | passes                                                                            | how                                                                            |
| ------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| **resumable** | `forwardFlags`, `pedagogicalSort`, `romanization`                                 | driven directly against the files on disk — all three only annotate or reorder |
| **delegated** | `translate`, `fillInBlank`, `semanticDedup`, `crossLessonNotes`, `numberReadings` | `runPrepare`, which already recovers them through its markers                  |
| **blocked**   | `extraction`, `bookConventions`, `taughtIndex`                                    | reported with the command that fixes each; none can be repaired in place       |

Three properties are load-bearing:

- **Romanization runs LAST**, after `prepare`. `prepare` can mine a whole drill block, and those
  cards need correcting too. (Re-running `translate` is not a substitute: it short-circuits on an
  existing `cards.json`, and when it doesn't it rebuilds the file from the corpus, discarding the
  drill block, every audio reference and the cross-lesson notes.)
- **Writes go through `patchUnitItems`**, which applies the same patch to `corpus.json` and
  `cards.json`, refuses any patch that changes the item count, and writes through `writeUnitJson`
  (validate, stamped backup, atomic write, re-validate). The count assertion is what makes the
  resumable passes safe by construction: a patch that adds or drops an item has done something its
  pass is not allowed to do.
- **The ledger is updated after each pass.** A resume that fixed a unit but left it reading "failed"
  would keep `preflight` blocking the review and make the next resume redo work that already
  succeeded. It **stops at the first pass that fails again**: a usage window that just refused one
  pass will refuse the next four too, and the retry is recorded so the next `resume` picks up there.

`resume` refuses a unit that is `reviewed` or `done` — every pass it runs would change what was
signed off.

## Model passes: pinning, env scopes and timeouts

Every `claude -p` call in the pipeline goes through `runClaudeWithPrompt` (`src/util/runClaude.js`):
prompt on stdin, a hard timeout, one retry. What differs per pass is the **pinning** — model, effort
and timeout — and each pass now has its own knobs rather than sharing one with a pass whose blast
radius is nothing like it. Chapter extraction, whose misses are silent and unrecoverable, used to
share a knob with the pedagogical sort, which is a permutation that is checked mechanically and fails
open.

Resolution order, most specific wins:

```
ANKI_BUILDER_<PASS>_MODEL   →  ANKI_BUILDER_<FAMILY>_MODEL   →  ANKI_BUILDER_LLM_MODEL
ANKI_BUILDER_<PASS>_EFFORT  →  ANKI_BUILDER_<FAMILY>_EFFORT  →  ANKI_BUILDER_LLM_EFFORT
ANKI_BUILDER_<PASS>_TIMEOUT_MS → ANKI_BUILDER_<FAMILY>_TIMEOUT_MS → ANKI_BUILDER_LLM_TIMEOUT_MS
```

…then the pass's own built-in default, then Sonnet / medium / 10 minutes. The two family prefixes
(`ANKI_BUILDER_EPUB_LLM`, `ANKI_BUILDER_TRANSLATE`) still work exactly as before, so anything you
already set keeps moving the passes it always moved.

**The timeout travels with the scope, and that is load-bearing.** Effort and wall clock are the same
decision. Raising a slow agentic pass to `high` under a shared 10-minute ceiling does not buy quality,
it buys a hard mid-pass abort with a misleading error, after the money is spent.

| pass                | module                              | prompt                                   | model / effort              | env scope                      | batched?                                        | typical wall clock |
| ------------------- | ----------------------------------- | ---------------------------------------- | --------------------------- | ------------------------------ | ----------------------------------------------- | ------------------ |
| chapter extraction  | `src/corpus/epubLlmExtract.js`      | `docs/epub-extraction-prompt.md`         | sonnet / **high**, 25 min   | `ANKI_BUILDER_EXTRACT`         | no — one call per chapter                       | 4-8 min            |
| book conventions    | `src/corpus/epubBookConventions.js` | `docs/epub-book-conventions-prompt.md`   | sonnet / medium, 15 min     | `ANKI_BUILDER_CONVENTIONS`     | **yes** — chapter ranges, merged                | 3-6 min per batch  |
| taught index        | `src/corpus/epubTaughtIndex.js`     | `docs/epub-taught-index-prompt.md`       | sonnet / medium, 15 min     | `ANKI_BUILDER_TAUGHT_INDEX`    | no — once per book, and only when asked for     | 3-8 min            |
| forward flags       | `src/corpus/epubForwardFlags.js`    | `docs/epub-forward-flag-index-prompt.md` | sonnet / medium, 10 min     | `ANKI_BUILDER_FORWARD_FLAGS`   | no                                              | 30-90 s            |
| pedagogical sort    | `src/corpus/pedagogicalSort.js`     | `docs/pedagogical-sort-prompt.md`        | sonnet / medium, 10 min     | `ANKI_BUILDER_SORT`            | no                                              | 30-90 s            |
| fill-in-the-blank   | `src/cards/fillInBlank.js`          | `docs/fill-in-blank-prompt.md`           | sonnet / medium, 10 min     | `ANKI_BUILDER_FILL_BLANK`      | no                                              | 1-3 min            |
| translation         | `src/translate/index.js`            | `docs/translate-*-prompt.md` (three)     | sonnet / medium, 10 min     | `ANKI_BUILDER_TRANSLATE`       | one call per group; retry halves the failed set | 1-4 min            |
| romanization eval   | `src/translate/romanizationEval.js` | `docs/romanization-prompt.md`            | sonnet / medium, 10 min     | `ANKI_BUILDER_ROMANIZATION`    | yes                                             | 30-90 s            |
| category assignment | `src/corpus/lessonCorpus.js`        | inline                                   | sonnet / medium, 10 min     | `ANKI_BUILDER_CATEGORIZE`      | yes                                             | 20-60 s            |
| semantic de-dup     | `src/cards/semanticDedup.js`        | `docs/semantic-dedup-prompt.md`          | sonnet / medium, 10 min     | `ANKI_BUILDER_DEDUP`           | no                                              | 30-90 s            |
| number readings     | `src/cards/numberReadings.js`       | `docs/number-reading-prompt.md`          | sonnet / medium, 10 min     | `ANKI_BUILDER_NUMBER_READINGS` | no                                              | 20-60 s            |
| cross-lesson notes  | `src/cards/crossLessonNotes.js`     | `docs/cross-lesson-note-prompt.md`       | sonnet / medium, **20 min** | `ANKI_BUILDER_CROSS_LESSON`    | no — one call, prompt grows with book progress  | 2-6 min            |
| kanji orthography   | `src/audio/kanjiOrthography.js`     | inline                                   | sonnet / medium, 10 min     | `ANKI_BUILDER_KANJI`           | no — per card, on demand                        | 5-15 s             |

Family fallbacks: everything in the first six rows also honors `ANKI_BUILDER_EPUB_LLM_*`; everything
in the last seven also honors `ANKI_BUILDER_TRANSLATE_*`.

Two of those defaults are deliberate departures from Sonnet-medium-10-minutes:

- **Extraction runs at `high`.** It is the only pass whose failure is both silent and unrecoverable,
  and it is agentic — the model reads the chapter file itself, against several competing inclusion
  rules, which is exactly where effort buys reading discipline. Its ceiling goes to 25 minutes to
  match: a measured live run of one mid-book chapter at medium already took over four minutes.
- **The conventions pass is batched.** It used to hand the model all 57 chapter files in one call
  under a 10-minute cap and then self-certify ("All 57 chapter files were read in full") with no
  partial-progress path — the silent-degradation signature, in the artifact that then steers every
  chapter extraction. It now runs over chapter ranges and merges, and each batch has to quote a
  per-chapter anchor that is verified against the cached file (see below).

## Per-pass eval fixtures

Every prompt in `docs/` is edited by hand, and nothing else in the repo can tell an improvement from
a regression. Chapter extraction is the worst case: an item the prompt stops picking up is never seen
by anyone again, so a narrowed rule or a reworded precedence line can cost a whole class of cards and
leave no trace downstream. The fixtures exist so that a prompt edit is an **observed** change rather
than a plausible one.

```sh
node scripts/eval-pass.mjs --list                    # what fixtures exist and what each one reads
node scripts/eval-pass.mjs extraction                # offline: replay a recorded response, spend nothing
node scripts/eval-pass.mjs extraction --live         # against the real model, at the pass's own pinning
node scripts/eval-pass.mjs extraction --live --save  # ... and store the response as the new recording
```

The before/after workflow around a prompt edit:

```sh
node scripts/eval-pass.mjs extraction --live > /tmp/before.txt
$EDITOR docs/epub-extraction-prompt.md
node scripts/eval-pass.mjs extraction --live > /tmp/after.txt
diff /tmp/before.txt /tmp/after.txt
```

| fixture         | pass                            | module                           | input                                                                 | reference                                                           |
| --------------- | ------------------------------- | -------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `extraction`    | chapter extraction              | `src/corpus/epubLlmExtract.js`   | `test/fixtures/evals/chapters/25.xhtml` + the book's `conventions.md` | the reviewed `corpora/25.json`, minus the drills a later pass mined |
| `forward-flags` | premature-item review           | `src/corpus/epubForwardFlags.js` | the same chapter's items + `taught-index.json`                        | the items the reviewer left flagged `uncertain`                     |
| `sort`          | pedagogical sort                | `src/corpus/pedagogicalSort.js`  | those items in a fixed shuffle                                        | the reviewed order of `corpora/25.json`                             |
| `categories`    | lesson-word category assignment | `src/corpus/lessonCorpus.js`     | the English glosses only                                              | the reviewed category on each item                                  |
| `dedup`         | semantic de-dup                 | `src/cards/semanticDedup.js`     | `chapter-10/cards.json` with its exclusions undone                    | the practice cards that run excluded                                |

**It never passes or fails.** Extraction is generative: two good runs disagree about a handful of
borderline items, so an exact-match assertion would either sit permanently red or force the prompt to
be tuned toward one historical sample. The output is evidence for a person to read. The exit code
says whether the fixture ran, never whether the result was good.

Some mechanics worth knowing before you add a fixture:

- **The replay seam is `runClaude`, and the recording is the model's raw stdout** — not the parsed
  result. That is what makes the offline mode worth having: a replay still runs the pass's own
  fence-stripping, JSON parse, schema validation and merge logic, so the free run exercises
  everything except the network. A recording with fewer responses than the pass now asks for throws,
  rather than reading as a quiet zero-diff.
- **Matching is by content, never by `id`.** Ids are model-authored slugs that a rewritten prompt
  renames freely, which would report an unchanged chapter as total churn. Items pair on the
  display-normalized `target` first (so editorial spaces or a trailing `。` never split a match), then
  on `english` for the leftovers (so a resolved placeholder still pairs with its reference).
- **The spoken-form field is read under either name** (`ttsText`, and the pre-2026-08 `reading`), so
  a recording or a corpus predating that rename does not diff as a change to every spoken form.
- **CI never spends money.** The suite only ever runs the recorded mode, and `--live` is hard-blocked
  under `node --test` by `assertExternalCallAllowed` (`src/util/testEnv.js`).
- The chapter `.xhtml` under `test/fixtures/evals/chapters/` is committed because the extracted-chapter
  cache is not tracked and a fixture with no input is not a fixture. This is a private repo; see
  `.harness/custom/docs/LIMITATIONS.md`.

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
  chapter-0/corpus.json, cards.json, audio/    # ordinary per-chapter artifacts,
  chapter-1/...                                               #   unchanged in shape
  <book-slug>.apkg               # single merged book-level package (`deck --book-dir`)
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
  lesson-0/corpus.json, cards.json, audio/    # ordinary per-lesson artifacts,
  lesson-1/...                                               #   same shape as a chapter's
  <course-slug>.apkg             # single merged course-level package (`deck --book-dir`)
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
  corpus.json, cards.json, audio/    # ordinary per-run artifacts, same shape
  <template>-<lang>.apkg                             # this deck's final package (`deck --run`)
```

Unlike a book or course, a template yields exactly one unit per `(template, language)`, so the
`<language>` folder IS the run directory — there's no `chapter-<seq>`/`lesson-<seq>` level and no
book-level `deck --book-dir` merge (nothing to merge; the `deck --run` output is already final).
The path is a pure deterministic function of `(template, language)` (`resolveTemplateRunDir`), both
segments slugified so `--lang ja` and `--lang Japanese` become stable folder names (`ja`,
`japanese`); re-assembling the same pair reuses the folder via assemble's "corpus.json already
exists — reusing" guard. A template built with a plain `--run <dir>` (no `--output-root`) still
lands wherever you point it, unchanged.

## Deck dashboard (`serve`)

`anki-builder serve` runs a local `node:http` web app (`src/server/index.js`) over the runs under
`output/`. The **home page splits by status at the sub-deck (lesson) level** (`renderDashboard`) into
two sections — **In review** (lessons where `cards.meta.done !== true`, each with a _Review_ action)
and **Built · ready to study** (done lessons → a single **Open** action) — with a deck's lessons
grouped under its heading. A deck with lessons in both states appears (grouped) in **both** sections,
so a finished lesson is never stranded behind an in-progress sibling. Every page shares one chrome
(`pageChrome` in `pages.js`): the full header plus a slim `.topbar` that pins once the header
scrolls out, carrying the back link, the page title, and (editable servers) the **Deliver to Anki**
button. Deliver is global — it pushes every managed deck over AnkiConnect from whichever page you
press it on (`DELIVER_SCRIPT` is class-wired, one flow driving both button instances). There is
**no download action** —
the server is local, so the single group `.apkg` is already on disk. A built lesson's **Open** goes to
the unit-scoped Review view: the audio-review page is a superset of read-only Browse (same cards +
inline players, plus Replace/Generate and Mark done), so it's the one default view — not a
separate Browse. A done lesson opens into the same editable review; done gates delivery, not
editing. Actions are per-lesson and link to the **unit-scoped** views:

- **Browse** — `GET /deck/:type/:id` (whole deck) or `GET /deck/:type/:id/:unit` (one lesson)
  (`renderDeckPage`, `unit` filters `deck.units` to that lesson): a **read-only** look at a deck's
  cards, lessons as collapsible `<details>` sections with an inline `<audio>` per card, in the same
  editorial style as the `view-deck` artifact (shared chrome in `src/review/deckViewChrome.js`). Audio
  is **served over HTTP** from `/media/...` rather than base64-inlined, so a whole deck renders on one
  page with no ~16 MB Artifact ceiling. No editing.
- **Review** — `GET /review/:type/:id` (whole deck) or `GET /review/:type/:id/:unit` (one lesson)
  (`renderReviewPage`): the guided, editable per-stage workflow (see
  [Dashboard editing](#dashboard-editing-serve-editable-by-default) below). Corpus is English-only,
  translate adds target + romaji, audio adds players + generate/pick + **Mark done**; provenance flags
  badge on every stage. An out-of-range `:unit` (no matching lesson) 404s.
- **Card faces** — `GET /faces/:type/:id` (whole deck) or `GET /faces/:type/:id/:unit` (one lesson)
  (`renderFacesPage`, linked from the Review lede): every card rendered through the note type's real
  `qfmt`/`afmt` (`src/deck/cardTemplates.js`) and real CSS (`src/deck/cardStyles.js`), against the
  real field mapping (`src/deck/noteFields.js`) — both directions, front and back, flippable per card
  or all at once. This is a **render, not a reimplementation**: `src/deck/cardFacePreview.js` restates
  nothing a template says, so a template edit changes the preview in the same commit, and it shares
  its Mustache subset with the authoring prompts' `{{CARD_FACES}}` block. The three most valuable
  rules in `references/card-authoring-rules.md` (answerable alone, a scene must not leak the answer,
  a hint belongs on the Production front) are all claims about a rendered FRONT, and nothing showed
  that front to anyone before this. **Read-only**: it renders the note type, never pushes it, so it
  is not behind `deliver --allow-model-change`. `[sound:x]` and `<img>` become a chip or a real
  `/media/...` image, and a card whose front renders EMPTY is called out by name (an empty front is
  an empty card, which Anki's Tools → Empty Cards deletes along with its scheduling).

Discovery is pluggable through a **format-adapter registry** (`src/server/adapters/`). Each adapter
(`book`, `course`, `template`) implements `listDecks(outputRoot)`, `loadDeck(outputRoot, id)`, and
`resolveMedia(outputRoot, id, unit, file)`, and is registered in `adapters/index.js`. Books/courses
scan their `chapter-*/`/`lesson-*/` units and order them by `meta.chapterNumber` (not folder seq);
templates have a single unit (the `<lang>` folder). The deck `id` is the slug (books/courses) or
`<template>__<lang>` (templates). **Contract: a new on-disk deck format ⇒ a new adapter module +
registry line** — that one change is what makes the dashboard ingest it. `/media` enforces
path-safety (filename regex + a `realpath`-within-`outputRoot` check) and supports `Range` requests.

### Dashboard editing (the Review view, `/review`, editable by default)

The **Review view** (`renderReviewPage`) surfaces every unit at its **stage**
(`src/server/adapters/stage.js` `detectStage`: `cards.json` with no audio → `corpus`; a card has audio
→ `audio`; `corpus.json` only → `INCOMPLETE`) and renders the stage-appropriate columns + review
controls (the Browse view at `/deck` renders the same units read-only). The badge word IS the stage
name — there is no remapping between what the code calls a stage and what the UI shows. An `INCOMPLETE`
unit renders **read-only** with the command that completes its build, and is bucketed on the home page
under "Not finished" rather than "In review". Beyond the read routes, the server
(`src/server/index.js`) exposes, gated on `editable` (disable all editing with `serve --read-only`):

**Corpus review** (`src/server/adapters/applyCards.js`) — the combined first review, on `cards.json`:
English + target + pronunciation with an Exclude checkbox, inline-editable target/pronunciation cells
(contentEditable, saved on blur), AI/Uncertain provenance ticks, and a per-lesson Mark reviewed
button:

- `POST …/unit/:unit/card/:cardId/review/exclude` `{excluded}` — toggle the card's reversible
  `excluded` flag (the deck build drops excluded cards).
- `POST …/unit/:unit/card/:cardId/review/edit` `{target?,pronunciation?,ttsText?}` — whitelisted
  field edit.
- `POST …/unit/:unit/review/reviewed` — set `cards.meta.reviewed: true` (the gate `audio` checks);
  for an EPUB source, also `saveChapterCorpus` the excluded-filtered corpus (derived from the cards)
  to the dedup library (injected as a server dep) — `markCardsReviewed`.

**Audio review** (a unit-scoped review `/review/:type/:id/:unit` edits when THAT lesson is at the audio
stage — independent of its siblings; a whole-deck `/review/:type/:id` edits only when EVERY unit is at
audio; `done` never blocks editing). A not-yet-done audio lesson shows **Mark done**
(`.../unit/:unit/done`) — `setLessonDone` in `applyCards.js` sets `cards.meta.done`, the final
sign-off that gates the merge; the handler then `rebuildGroupQuiet` (best-effort group rebuild) so
the single package tracks the done-set. A done lesson shows a badge instead; there is no un-done
control (clear `meta.done` by hand if a lesson must be pulled from the shipping deck).

The editable audio review carries **two audio columns**, so the transformation is on screen rather than
implied:

| Column       | Plays                                                         | Controls                                                                                         |
| ------------ | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| **Original** | `audioOriginal` — the untouched take                          | Replace · Generate · Generate (kanji) — these mint a NEW recording, which is what that column is |
| **In use**   | `audio` — the auto-trimmed take, or the hand cut once applied | Trim…                                                                                            |

Both columns are gated on `canEdit`, via `renderLessonSections`' optional `originalCell` hook (the same
mechanism the Exclude column uses). The read-only **Browse** view and the `view-deck` artifact are about
what the deck sounds like, not how it got there, so they pass no `originalCell` and render exactly one
audio column, byte-identically to before.

**The audio editor** (`AUDIO_TRIM_SCRIPT`). **Edit** opens a modal showing the card's ORIGINAL as a
waveform with draggable start/end handles, a **Snap to speech** starting point, and selection/original
playback. The handles open at where the clip is CURRENTLY trimmed, not at the ends of the original:
trimming happens by default, so opening on the full clip would misrepresent every card as untrimmed
and dragging from there would silently undo the automatic cut. A saved hand cut is authoritative;
otherwise the range is derived as `[0, length of the clip in use]` — exact, because the automatic trim
only ever removes from the end — which needs no stored value and so works for clips built before the
editor existed. The waveform is computed client-side — the browser already fetches the mp3 to play it and
`decodeAudioData` gives the samples for free, so there's no dependency, no extra round trip and no peaks
file to keep in step. One clip is decoded per modal open, not one per row.

Only the `{ start, end }` pair is sent; the server re-cuts from the real file with
`src/audio/trimToRange.js`, so nothing the browser computed is trusted. That cutter uses an OUTPUT-side
`-ss` (after `-i`) for sample accuracy and expresses length as `-t <duration>` — what `-to` measures
against depends on whether `-ss` was an input or output option, so the pair is a genuine footgun.

Crucially the cut is **always made from the original, never from the previous cut**: re-trimming a cut
clip would compound the edits, so a selection made slightly too tight could only ever get tighter and
the handles would be one-way. Cutting from the full-length take every time is what lets a reviewer drag
the end handle back OUT past where the automatic trim landed — the whole reason originals are kept.
`audioTrim` stores the applied range so reopening the modal restores the selection.

Each drag is applied **as soon as you let go** — on `pointerup`, never on `pointermove`, so a drag
costs one ffmpeg cut rather than one per pixel. Overlapping drags collapse to the latest position
instead of racing, and the previous `-manual-` clip is deleted as the new one lands (a manual file is
named for its own card, so nothing else can reference it) — otherwise iterating on an edge would leave
a dead file per nudge. Everything a request needs is captured before it goes out, so closing the modal
mid-flight cannot orphan it; failures are reported on the ROW as well as in the modal, since a modal
that has been closed can't show anything.

Unlike every other trim in this codebase, `trimToRange` **throws** rather than failing open. A reviewer
who drags a selection and gets a silent no-op has been told their edit landed when it didn't, and would
sign the lesson off believing the clip was fixed.

The audio-review write endpoints:

- `POST …/card/:cardId/audio?ext=<mp3|m4a|ogg|wav>` — raw-body upload of a replacement clip
  (`applyCardAudio`, 10 MB cap). Stored as the card's new original with the trimmed take derived from
  it, exactly like a generated clip; any manual trim from the previous recording is cleared.
- `POST …/card/:cardId/generate` — FRESH ElevenLabs takes of the card's variant axes
  (`generateCardVariants` + `src/audio/variants.js`), written `…-gen-<hash>.mp3` with their
  `.orig.mp3` originals; no cache reuse; does not modify cards.json.
- `POST …/card/:cardId/generate-kanji` — **Japanese only** (422 otherwise). Generates a kanji
  orthography from the kana reading via `runClaude` (`src/audio/kanjiOrthography.js`) and synthesizes
  fresh takes from it (`generateCardKanjiVariants`, `…-genkanji-<hash>.mp3`); returns the produced
  kanji text for the audition modal.
- `POST …/card/:cardId/audio/select` — apply a generated variant (`selectCardAudio`). Body carries
  `{ audio, original }` so the pick brings its own untouched take along and stays re-trimmable.

Both of those install a whole NEW recording, so both answer with the full set of takes plus
`mediaUrl` AND `originalUrl` (`takeUrls`). The client repoints the row's `data-original-url`, swaps
BOTH players, and drops the stale `data-trim-*`; without that the editor would go on offering the
previous recording to cut from. Note the in-use swap must select `td.au:not(.au-orig)` — a bare
`td.au` matches the Original column, which renders first.

- `POST …/card/:cardId/audio/trim` — body `{ start, end }` in seconds. Cuts that range out of
  `audioOriginal` (`trimCardAudio`), writes `<cardId>-manual-<hash>.mp3`, and sets `audioManual` +
  `audioTrim`. 422 with the reason if the range is nonsensical or ffmpeg can't apply it.
- `POST …/card/:cardId/audio/trim/revert` — drop the hand cut (`revertCardAudio`); `audio` falls back to
  `audioAuto`. The cut file is left on disk, so re-applying the same range costs nothing.
- `POST …/card/:cardId/audio/clean` — body `{ filter }`, one of the chain names. Re-derives the card's
  takes under a different cleanup chain (`recleanCardAudio`), always from the untouched original so
  chains can never stack on one another; a saved hand trim is re-cut under the new chain rather than
  dropped. 400 on any name that isn't in the table.
- `POST /api/deck/:type/:id/rebuild` (`handleRebuild`) — regenerate the **single group package**
  `<deckDir>/<name>.apkg` via `adapter.rebuild` → `rebuildBookDir` (`src/deck/rebuild.js`) — the **same**
  assembly the CLI's `deck --book-dir` uses, so a browser rebuild is byte-identical, and it packages
  **only done lessons** (409 if none are done). This is the ONLY rebuild endpoint — there is no
  per-lesson rebuild and no per-lesson `.apkg`. Rebuilds are **fully automatic — there is no manual
  button**: `DECK_EDIT_SCRIPT` auto-fires this endpoint after every successful Replace/Generate, but
  only when the lesson in view is already done (`#deckctx` `data-done="1"`), so finishing a fresh
  lesson doesn't trigger pointless whole-book rebuilds (Mark done folds it in and rebuilds then). There
  is **no download route** — the file is served off the local disk directly.

Card targeting is by cards.json/corpus.json item `id`; all written filenames are server-generated +
validated, and every write path is realpath-checked to stay inside `outputRoot`. Note the same
folder-seq vs `chapterNumber` nuance as a CLI rebuild: the merged deck orders sub-decks by folder seq,
the dashboard displays by `chapterNumber` (they coincide unless a book was built out of order).
