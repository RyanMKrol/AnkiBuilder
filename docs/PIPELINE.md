# Pipeline internals

This is the detailed technical reference for how each stage of the AnkiBuilder pipeline works
internally — file formats, caching, dedup logic, prompt wiring. If you just want to use the tool,
see the [README](../README.md) and the `build-anki-deck` skill instead; come here when you need to
understand or modify the implementation.

## Pipeline stages

`assemble` → `prepare` → `audio` → `deck`, each stage reading/writing JSON in a run
directory (`--run <dir>`) — or, for an `--epub`-sourced run, an auto-resolved chapter directory
under a book-organized `output/` tree (`--output-root <dir>`; see [Output layout](#output-layout)).
`prepare` is itself four passes (`translate` → fill-in-the-blank → semantic de-dup → cross-lesson
notes) run under a single claim, and `assemble` chains into it automatically.

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
For a language written without spaces between words (Japanese today), a card's stored `target`/`reading`
is normalized so the deck renders natural script: **(1)** editorial spaces are stripped (the JBP kana
textbook uses 分かち書き word-separation as a beginner aid, which isn't part of real written Japanese),
and **(2)** a trailing sentence-final `。` is stripped — **a card never ends in a period by default**. A
mid-string `。` (two sentences) is kept. `assemble` applies it to `corpus.json` and `translate` to the
resulting `cards.json`. This is independent of the romaji (which keeps its own spacing/punctuation) and
the audio-side space strip (`src/audio/ttsText.js`). Languages whose spaces/terminal punctuation are
meaningful (Spanish, French, …) are untouched.

The stripped display text is dot-less, but the `。` lives on in the **audio**: the per-language
transform (`src/audio/altAudio.js`, ja appends `。`) produces the **with-dot** take, and that take is
the single **default** clip embedded in the deck, while the displayed face/reading stays dot-less. The
terminal `。` measurably steadies ElevenLabs' prosody (it anchors a sentence boundary), which is why
with-dot is the default. The plain dot-less take is no longer pre-generated as a second recording —
it's one of the on-demand variants you can synthesize and switch to in the dashboard's audio review.

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
   with every earlier lesson as context. Skipped for a `template` source.

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

### `translate`

Runs as the first pass of `prepare` — there is **no review gate before it** (the review moved onto its
output). Items with `target: null` get a full translation; items with a real `target` already set
(e.g. from the EPUB path) only ever get a pronunciation guide — the model cannot override a
pre-existing target (see `src/translate/index.js`). The resulting `cards.json` is what the **Corpus
review** operates on.

**Spoken form (`reading`).** An item may carry an optional `reading` — a spoken version of the
target with anything the romanizer/TTS mishandles spelled out in the target language's own script.
The one case that needs it today is **numbers**: kuroshiro leaves a digit verbatim (`2,000えん` →
`2 , 000 en`) and ElevenLabs may read it as an English number, so extraction keeps the digits in
`target` (natural card display) and emits `reading: "にせんえん"`. When present, `reading` drives BOTH
the romaji `pronunciation` (the romanizer/pronunciation prompt romanizes `reading ?? target`) and
the `audio` (the audio stage's `speechText` speaks `reading ?? target`); the deck still shows
`target`. Absent a `reading`, everything falls back to `target` exactly as before, so only
number-bearing cards are affected. Prompts are Markdown-structured (Overview / Input Format /
Example Input / Output Format / Example Output / Important / Input Data). How `pronunciation` gets
filled in depends on whether the target language has a configured romanization library
(`src/translate/romanizationLibraries.js`, keyed by ISO 639-1 code — currently Japanese, Mandarin,
Korean, Russian, Hebrew, Hindi, Arabic): with a library configured, the model is asked for
`target` only, the library romanizes it deterministically, and a Sonnet-medium pass then **corrects that
output in place** — the library (kuroshiro et al.) is a starting point, not ground truth (it mis-splits
words, mishandles the sokuon っ, and spells unfamiliar kana letter-by-letter), so the model returns the
right romanization for every item, keeping the library's when it's already correct and fixing it when
it's not (see `correctRomanizations` in `src/translate/romanizationEval.js`). The correction lands
directly in `pronunciation` — no `uncertain` flag or note; the fix IS the resolution. It fails open (a
malformed/missing response keeps the library value). With no library configured, the
model is asked for `pronunciation` directly, preferring a standard romanization system when one
exists and falling back to a phonetic respelling otherwise, unchanged from before this distinction
existed. See [`translate-prompts.md`](./translate-prompts.md) for the full templates and
[`.harness/custom/docs/LIMITATIONS.md`](../.harness/custom/docs/LIMITATIONS.md) for the dependency
trade-offs this introduces.

**Optional simplified target script (`--simple-script`).** A language may define a beginner/learner
script constraint in the language plug-in `src/translate/targetScript.js` (`getSimpleScriptRule`, keyed
by ISO code — Japanese → "kana only, no kanji"). When `translate --simple-script` is passed,
`translateCorpus` resolves that rule for the target language and injects it into the target-generation
prompt; the translate core is script-agnostic (it just forwards the instruction string), and a language
with no rule ignores the flag. This is the same per-language plug-in pattern as voices / alt-audio /
romanization / fonts — nothing language-specific lives in the core.

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

**Default take only (per-language transform).** The stage generates exactly ONE clip per card — the
default (`audio`). For a language listed in `src/audio/altAudio.js`'s `ALT_AUDIO_TRANSFORMS`, that
default is the _transformed_ take: Japanese appends a `。`, because a trailing full stop gives
ElevenLabs a sentence boundary and empirically fixes many mis-rendered short/bare clips (lone kana,
some numbers). Languages with no transform get the plain take. Every OTHER variant — the no-`。` take,
comma/bracket forms, and kana+kanji — is generated **on demand** in the dashboard (see the audio
review below), not up front. The displayed `target`/`reading` never carries a `。`; the dot is
audio-only.

**Per-language TTS text normalization (`src/audio/ttsText.js`'s `normalizeTtsText`).** The exact text
sent to TTS (and used as the cache key) is the card's spoken text run through a per-language
normalizer. Japanese strips whitespace: `target`/`reading` keep their editorial spaces for the learner
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
ででで` never has more), each at most 1.0s long. A LONE trailing segment must still sit behind a 0.3s
  gap, the original rule and the only evidence it isn't just the phrase's last word; extending a run
  needs only 0.15s.
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
field is no longer written — switching a Japanese card to its plain no-`。` take is now an on-demand
dashboard action (the **Generate** button synthesizes the no-`。` / comma / bracket variants to
audition and pick), not a pre-baked second recording. The schema still tolerates `altAudio` on cards
from older runs; the deck build never embeds it.

A second on-demand action, **Generate (kanji)** (Japanese decks only — `src/audio/generateKanjiVariants.js`),
addresses ElevenLabs mis-parsing all-kana input: it first asks Claude (`src/audio/kanjiOrthography.js`,
via the same `runClaude` as translate) to render the card's kana reading as natural kanji+kana
orthography — preserving the exact reading, only the script changes — then synthesizes fresh no-`。` /
with-`。` takes from THAT text and shows the produced kanji in the audition modal. Both on-demand paths
write content-addressed preview files (`-gen-` / `-genkanji-` infixes) that never collide with the
built clip, and neither touches `cards.json` until you pick a take.

### `deck`

Builds a two-template Anki note type (`src/deck/collection.js`): **Recognition** (question shows
`Target` and autoplays `Audio` — the target-language listening/recall direction — answer reveals
`English`) and **Production** (question shows `English`, answer reveals
`Target`/`Pronunciation`/`Audio` for the native-pronunciation check). Both directions play the
target-language audio; Recognition plays it on the question side, since that's the direction meant
to exercise listening comprehension, not just script recognition.

The note type is **per-language**: named `AnkiBuilder <lang>` (the resolved ISO 639-1 code, e.g.
`AnkiBuilder ja`) with a stable, language-derived id (`languageModelId`). Anki keys note types by
id, so every deck of a language shares ONE note type — no pile-up of duplicates on repeated imports
— and different languages never collide. When the language has a configured deck font
(`fontLibrary.js`'s `LANGUAGE_FONTS`; Japanese → Klee One), the builder auto-embeds it: the font
file goes into the deck's media (`embedLanguageFont`, `src/deck/index.js`) and the model's CSS gains
the scoped `@font-face` + `.card` rule (`languageFontCss`), so kana/kanji render in the textbook font
on every client while Latin stays Latin. (`restyle-font` applies the same to third-party decks.)

- `--run <dir>`: the ordinary one-chapter/one-lesson mode — one `cards.json` in, one `deck.apkg`
  out.
- `--book-dir <dir>`: the book/course-level merge mode — scans `<dir>/chapter-*/cards.json` AND
  `<dir>/lesson-*/cards.json` (in ascending folder-seq order; an EPUB book only ever has the
  former, a lesson-sourced course only ever has the latter). It merges **only FINISHED lessons** —
  those whose `cards.meta.done === true` (the human's final "Mark done" sign-off in the dashboard);
  a lesson not yet translated or not marked done is **skipped**, so an un-reviewed lesson never gets
  baked into the package (`rebuildBookDir`, `src/deck/rebuild.js`). If no lesson is done it errors
  clearly. The finished lessons merge into a SINGLE
  `<dir>/deck.apkg`, each as its own real Anki sub-deck (`Book/Course Title::Chapter/Lesson
Label`, via `buildMultiDeckCollection`) nested under one parent deck named for the book or
  course (title looked up from the local library by the first chapter's `epubHash`, or from the
  course folder's own `course.json` marker when there's no `epubHash` — `loadCourseMeta`,
  `src/cli/outputPaths.js` — falling back to `--name` then a generic string). Always rebuilds from
  scratch — no "already exists, reusing" short-circuit — since it's merging inputs that can change
  between runs (a re-translated chapter, a newly added one, regenerated audio), and reusing a
  stale merge would be a correctness footgun for a recompute this cheap.

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
  epubs/<epubHash>/book.json                    # { title, slug } — title from <dc:title>, slug
                                                 #   filled in lazily on first --output-root use
  epubs/<epubHash>/chapters/<chapterNumber>.xhtml   # extracted-chapter cache
  epubs/<epubHash>/images/<...>                     # images the cached chapters reference,
                                                     #   at whatever relative path their own
                                                     #   <img src> resolves to from chapters/
  epubs/<epubHash>/corpora/<chapterNumber>.json     # reviewed corpus, saved on "Mark reviewed"
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
  chapter-0/corpus.json, cards.json, audio/    # ordinary per-chapter artifacts,
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
  lesson-0/corpus.json, cards.json, audio/    # ordinary per-lesson artifacts,
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
  corpus.json, cards.json, audio/    # ordinary per-run artifacts, same shape
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

## Deck dashboard (`serve`)

`anki-builder serve` runs a local `node:http` web app (`src/server/index.js`) over the runs under
`output/`. The **home page splits by status at the sub-deck (lesson) level** (`renderDashboard`) into
two sections — **In review** (lessons where `cards.meta.done !== true`, each with a _Review_ action)
and **Built · ready to study** (done lessons → a single **Open** action) — with a deck's lessons
grouped under its heading. A deck with lessons in both states appears (grouped) in **both** sections,
so a finished lesson is never stranded behind an in-progress sibling. There is **no download action** —
the server is local, so the single group `.apkg` is already on disk. A built lesson's **Open** goes to
the unit-scoped Review view: the audio-review page is a superset of read-only Browse (same cards +
inline players, plus Replace/Generate and Mark done/Reopen), so it's the one default view — not a
separate Browse. Actions are per-lesson and link to the **unit-scoped** views:

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
- `POST …/unit/:unit/card/:cardId/review/edit` `{target?,pronunciation?,reading?}` — whitelisted
  field edit.
- `POST …/unit/:unit/review/reviewed` — set `cards.meta.reviewed: true` (the gate `audio` checks);
  for an EPUB source, also `saveChapterCorpus` the excluded-filtered corpus (derived from the cards)
  to the dedup library (injected as a server dep) — `markCardsReviewed`.

**Audio review** (a unit-scoped review `/review/:type/:id/:unit` edits when THAT lesson is at the audio
stage — independent of its siblings; a whole-deck `/review/:type/:id` edits only when EVERY unit is at
audio). An audio-stage lesson also shows **Mark done** (`.../unit/:unit/done`) / **Reopen**
(`.../unit/:unit/reopen`) — `setLessonDone` in `applyCards.js` sets/clears `cards.meta.done`, the final
sign-off that gates the merge; both handlers then `rebuildGroupQuiet` (best-effort group rebuild) so
the single package tracks the done-set.

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
  `<deckDir>/deck.apkg` via `adapter.rebuild` → `rebuildBookDir` (`src/deck/rebuild.js`) — the **same**
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
