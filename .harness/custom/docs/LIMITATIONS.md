# custom/docs/LIMITATIONS.md — this project's trade-offs & limitations log

Customization overlay for `.harness/docs/LIMITATIONS.md`. **This is where your project's own
limitation/trade-off rows go** (golden rule 5): when a change introduces a trade-off, bottleneck, or known
limitation, add a row **here** — not in the pristine `docs/LIMITATIONS.md`, which is plugin-owned and
refreshed on upgrade. Harness upgrades never touch this file. (See `.harness/custom/CLAUDE.md`.)

Each row: what it is, *why* it was chosen, its **impact**, and *when to revisit*.

## Translate batch parsing strips markdown fences, but a batch can still fail outright

- **What:** `translateCorpus` (`src/translate/index.js`) calls the pinned Haiku model via `claude -p`
  per batch of up to 10 items. The model is instructed to respond with raw JSON only, but sometimes
  wraps the array in a ` ```json ... ``` ` fence anyway; `parseBatch` now strips a single leading/trailing
  fence before parsing. If the response is malformed in some other way (truncated, extra prose,
  nested fences), the whole batch's items still fail together and must be retried by re-running
  `translate` after deleting `cards.json` (the CLI only regenerates when the file is absent — it
  does not resume just the failed ids).
- **Why:** batching keeps the cheap pinned model's context small per call; the fence-stripping fix
  only guards against the one failure mode actually observed (occasional markdown wrapping), not
  every possible malformed response.
- **Impact:** on a run with several batches, one bad batch means re-running translation for the
  *whole* corpus, re-spending API calls on batches that already succeeded.
- **When to revisit:** if malformed-batch failures keep recurring after this fix, add per-item retry
  (re-invoke `runClaude` for just the ids missing from a batch) instead of requiring a full corpus
  re-run.

## `assemble --epub` reads one chapter per command — no whole-book, one-shot loop yet

- **What:** `src/corpus/epubArchive.js` now reads a real `.epub` archive directly (a dependency-free
  zip reader, ported from the deleted mechanical extractor, plus new `META-INF/container.xml`/OPF
  spine parsing) — `assemble --epub <path> --chapter-number <N> --lang <language>` self-extracts
  chapter `N` in correct reading order, no manual pre-extraction step required. What's still
  missing: a single command that builds every chapter of a book in one shot. Today that's still one
  `assemble`/`review` cycle per chapter number, even though `listChapters(epubPath).chapters.length`
  already gives the loop bound needed to build that command.
- **Why:** the per-chapter primitive (real archive access, dedup, registry) was the harder, riskier
  part and needed validating first; a whole-book loop over an already-working per-chapter command is
  comparatively mechanical.
- **Impact:** building a deck from a real textbook still requires running `assemble`/`review` once
  per chapter by hand — there's no single-command "build my whole book" path yet.
- **When to revisit:** when that's actually annoying enough to be worth a `--epub <path> --all`
  (or similar) loop over `listChapters(...).chapters`.

## OPF/container.xml parsing is a hand-rolled scanner, not a real XML parser

- **What:** `src/corpus/epubArchive.js` isolates `<tag ...>` occurrences with a narrow per-tag-name
  regex, then extracts `attr="value"` pairs from within each isolated tag separately — deliberately
  order-independent (EPUB doesn't guarantee attribute order), but not a real XML parser. CDATA
  sections, XML comments containing tag-like text, or other unusual-but-legal XML wouldn't parse
  correctly.
- **Why:** every other EPUB-processing piece of this codebase already avoids an XML/HTML-parser
  dependency the same way (regex-based, targeted extraction) — this keeps the project genuinely
  dependency-free rather than making an exception for one module.
- **Impact:** low in practice — real-world EPUBs are near-universally produced by consistent tooling
  (Calibre, Sigil, publisher pipelines) that emits plain, well-formed `container.xml`/OPF documents —
  but a hand-authored or unusually-generated EPUB could misparse silently rather than erroring.
- **When to revisit:** if a real EPUB is found to misparse — add a targeted case to the scanner
  rather than reaching for a full parser unless several distinct cases pile up.

## Backward dedup only catches exact-string duplicates, not paraphrases

- **What:** `dedupBackward` (`src/corpus/epubDedup.js`) matches `english` case-insensitively and
  `target` exactly (both trimmed) against every earlier reviewed chapter of the same book. A
  differently-worded duplicate (e.g. "How much is this?" vs. "What does this cost?") is not caught
  by this pass — only the forward flag pass has any chance of surfacing semantic overlap, and even
  then only as a flag for the human reviewer to act on, not an automatic drop, and only for content
  it judges is *explicitly re-taught*, not merely similar.
- **Why:** exact-string matching is deterministic, free, and instant — the intentional trade-off
  for a "hard drop" pass that runs on every `assemble --epub` call with zero API cost.
- **Impact:** near-duplicate phrasing across chapters can still slip through and needs to be caught
  during `review` instead.
- **When to revisit:** if near-duplicate leakage across chapters proves common in practice — would
  need a semantic-similarity check (embeddings or an LLM call), a real cost/complexity step up from
  the current pure-function pass.

## Forward flag pass re-reads every later chapter's content on every `assemble --epub` call

- **What:** `flagForwardConcerns` (`src/corpus/epubForwardFlags.js`) extracts (or reuses a cached
  extraction of) every chapter after the current one and asks the model to Read each of them fresh,
  every time `assemble --epub` runs for a book. The extracted *bytes* are cached
  (`epubs/<epubHash>/chapters/<N>.xhtml`), but the pass's *result* is not — there's no memoization of
  "I already checked chapter 3's items against chapters 4-10 and got this answer." This pass used to
  be a hard drop (`dedupForward`); it's now purely advisory — flagged items are kept in the corpus
  with `uncertain: true` and a "Possibly premature — ..." note, and it was also broadened to flag
  items that look too complex for this point in the book (not just ones explicitly re-taught later),
  so the human reviewer — not a second blind LLM pass — makes the actual keep/drop call. None of that
  changes this entry's cost characteristics: it's still one model call per `assemble --epub`
  invocation reading every later chapter in sequence, not a fan-out.
- **Why:** keeping the pass simple (re-derive the answer every call) was chosen over adding a
  result-cache invalidation story (what invalidates it — a later chapter's content changing? the
  candidate item list changing? both are plausible and neither was worth the complexity yet).
- **Impact:** real latency/cost that scales with how early you are in a long book — chapter 1 of a
  20-chapter book means the model reads chapters 2 through 20 on every `assemble` call for chapter 1.
- **When to revisit:** if this cost/latency becomes a real practical annoyance — cache the forward
  pass's `{items, flagged}` result keyed by (epubHash, chapterNumber, a hash of the candidate item
  ids), invalidated whenever any later chapter's registry entry changes.

## Human-readable chapter labels are a heuristic over `<title>` text, not a real EPUB convention

- **What:** `describeChapter` (`src/corpus/epubArchive.js`) turns a chapter's `<title>` tag into a
  short human-facing label (e.g. `"Lesson 6: Going Places (1)"`) by splitting off everything after
  the first comma (assumed to be a repeated book-title suffix) and keeping at most two
  `":"`-separated segments of what's left. This was discovered manually: forward-flag notes and
  dedup log lines were naming chapters by raw 1-indexed EPUB spine position (e.g. "chapter 43"),
  which has no relationship to the book's own numbering (a book might only have 20 real lessons
  spread across 57 spine entries once front matter, unit openers, and quizzes are counted) and read
  as confusing/wrong to a human reviewer. There's no EPUB spec that guarantees `<title>` follows a
  `"<page title>, <book title>"` shape or that a page title is `":"`-delimited into label/title/
  description — this is an observed convention for the one real book exercised so far, applied as a
  general best-effort heuristic to every EPUB.
- **Why:** parsing an actual, guaranteed-correct chapter number/title mapping would need either a
  book-specific convention (which the whole-book conventions pass could arguably supply, but that's
  an LLM call, not a deterministic one) or a real EPUB navigation-document (`nav.xhtml`/NCX) parser
  cross-referencing spine position — meaningfully more machinery than a comma/colon split. The
  heuristic was judged good enough because the fallback (plain `"chapter N"` wording) is always at
  least as good as today's behavior, so this can only improve labeling, never make it worse than the
  status quo it replaced.
- **Impact:** a book whose `<title>` tags don't follow the observed convention could get an
  oddly-truncated or unhelpful label (e.g. a title with no comma keeps a real book-title suffix; a
  title using colons for something other than label/subtitle gets cut at the wrong point) — never
  wrong data (nothing downstream depends on the label's exact shape), just a worse-than-ideal display
  string.
- **When to revisit:** if a book is found where the heuristic produces a genuinely confusing label —
  consider parsing the EPUB's actual nav document (`nav.xhtml`/NCX, already read once during
  `analyzeBookConventions`) for chapter titles instead of re-deriving them from raw `<title>` tags
  per chapter.

## The category enum is a first-cut list, not yet validated against real usage

- **What:** `src/model/categories.js`'s `CATEGORIES` list (25 entries) was drafted in one sitting
  to give every corpus item a shared, enum-constrained `category` — 8 entries match the
  travel-essentials template's existing categories, the rest are new and aim for general textbook
  coverage (family, work, school, nationalities, grammar/function words, etc.), plus an `"Other"`
  fallback.
- **Why:** some categorization is needed now (item 1–3 of this feature), but the "right" set of
  categories can really only be judged against real extracted corpora across multiple chapters/
  languages — that data doesn't exist yet.
- **Impact:** some items may end up in `"Other"` more than intended, or a category may prove too
  broad/narrow once used against real textbook content.
- **When to revisit:** after running the LLM extractor across several real chapters — check the
  `"Other"` rate and whether any category is doing too much or too little work, then adjust
  `CATEGORIES` (this is a single, centrally-imported list, so renaming/splitting an entry is a
  small change).

## `pronunciation` conflates a real romanization system with an ad hoc phonetic respelling

- **What:** both translate prompts (`buildFullTranslationPrompt` / `buildPronunciationOnlyPrompt`
  in `src/translate/index.js`) ask the model to prefer a target language's standard romanization
  or transliteration system when one exists (e.g. romaji for Japanese, pinyin for Mandarin
  Chinese), falling back to an invented English-spelling phonetic respelling otherwise. Both cases
  are written into the same `pronunciation` string field on the card — there's no way to tell,
  from the card alone, which kind of value it holds.
- **Why:** a single field was the smallest change that let the guidance be added without touching
  `CARDS_SCHEMA`; deciding whether the distinction actually needs its own schema field was
  deliberately left open rather than guessed at (see `docs/translate-prompts.md`'s "Open
  question").
- **Impact:** a deck built for a language with a real romanization system (Japanese, Mandarin,
  etc.) can't distinguish "this is the standard romanization, worth its own display treatment"
  from "this is just a rough phonetic hint" — both render identically in the Anki template.
- **When to revisit:** if a deck's presentation ever wants to treat the two differently (e.g. show
  romaji more prominently than an ad hoc respelling), split `pronunciation` into a
  `romanization`/`phonetic` pair on `CARDS_SCHEMA` and have the model report which kind it
  produced.

## Book-conventions pass reads every chapter in one call — no automated coverage check

- **What:** `analyzeBookConventions` (`src/corpus/epubBookConventions.js`) asks a single
  Sonnet-medium call to read EVERY chapter of a book (via its own Read tool, one file per chapter)
  before producing a conventions summary. This was a deliberate choice over sampling a
  representative subset of chapters, made explicitly aware that a whole-book pass echoes the
  earlier whole-book *extraction* attempt that failed this session (74,504 output tokens
  generated, only an 8,487-char tail returned, no error surfaced). The risk profile differs here —
  this pass's output is a small, bounded summary document, not a large structured item array that
  scales with book length — but the risk isn't zero, especially for very long books. The prompt
  instructs the model to self-report which chapters it did/didn't actually read in a `## Coverage`
  section rather than silently presenting partial coverage as complete, but nothing in the code
  parses or verifies that self-report — a silently-incomplete analysis is possible and would only
  surface as a real chapter mis-extracted downstream.
- **Why:** most thorough option, chosen deliberately over the cheaper/safer sampling alternative
  after weighing both explicitly during planning.
- **Impact:** for a long book, this is the single most expensive/slowest step in first-time
  processing (one call reading dozens of files) and its correctness has no automated check —
  only the resulting corpus quality on later chapters serves as an indirect signal.
- **When to revisit:** if a very long book's conventions pass turns out unreliable or too
  slow/costly in practice — switch to a representative-chapter sample (first, a few middle,
  last, plus any chapter self-identified as exercise-heavy) instead of reading every chapter, or
  parse the `## Coverage` section and warn explicitly when it reports incomplete coverage.

## Image-embedded EPUB content relies on model diligence — no forced inspection, no OCR fallback

- **What:** `docs/epub-book-conventions-prompt.md` and `docs/epub-extraction-prompt.md` instruct the
  model to open referenced image files with its own Read tool when they sit in a content section,
  rather than trusting (often-empty) `alt` text. This was discovered manually: a real textbook's
  "Frequently Used Expressions" page (a whole chapter's worth of vocabulary) is rendered entirely as
  illustrated images with no extractable text at all. The original manual discovery actually hit a
  more fundamental bug, since fixed: `extractChapterToFile` (`src/corpus/epubArchive.js`) wrote only
  the chapter's XHTML to the local library cache and never unpacked the images it referenced, so the
  `../images/...` paths the prompt tells the model to resolve and open pointed at nothing on disk —
  the model couldn't have opened them no matter how diligent it was. `extractChapterToFile` now also
  extracts every `<img src>` the chapter references, at the same relative path from the cached
  chapter file that the src attribute encodes from the original chapter file, so the images genuinely
  exist for the model's Read tool to find. With that fixed, the remaining gap is the one this entry
  originally named: there is still no code-level enforcement that the model actually opens any given
  image once it exists, and no OCR/vision fallback if it declines or misjudges an image as
  decorative — the guidance is prose in the prompt, not a mechanism.
- **Why:** neither prompt template has any way to programmatically detect "this image contains
  text" ahead of the model call — that judgment call is exactly what the model is being asked to
  make. Building a real enforcement mechanism (e.g. a separate vision pass that always runs and is
  cross-checked against the extraction output) was not justified without first seeing whether
  prompt-level guidance already closes the gap in practice, now that the images are actually present.
- **Impact:** a book that embeds significant content in images could still silently under-extract if
  the model skips an image it should have opened — this would look identical to "this chapter
  genuinely has little vocabulary," with no automatic signal that content was missed.
- **When to revisit:** if a real run is later found to have silently skipped image content despite
  this guidance, add a deterministic check — e.g. flag any chapter where the source has `<img>` tags
  in content sections but the extractor returned few/no items, so a human is prompted to check
  manually, rather than relying solely on the model choosing to look.

## Audio review artifact embeds every clip as base64 in one HTML file — no chunking

- **What:** `renderAudioReviewPage` (`src/review/renderAudioReviewPage.js`), invoked via
  `anki-builder render-review --stage audio`, base64-encodes every card's mp3 and inlines it as a
  `data:audio/mpeg;base64,...` `<audio>` element in a single `review-audio.html` file — there's no
  size cap or splitting into multiple pages.
- **Why:** simplest correct behavior, and matches how the other two review stages already produce
  one file per stage; splitting introduces real complexity (deciding a chunk size, threading
  chunk index through the CLI/publish step) that wasn't justified without a real deck actually
  hitting a size problem.
- **Impact:** a large deck (many dozens of cards) can produce a large HTML file that's slow to
  generate/publish/open as a Claude Artifact. There's no automatic warning when this happens —
  it has to be noticed by whoever runs `render-review`.
- **When to revisit:** if a real deck's audio review artifact becomes noticeably slow or fails to
  publish, add a `--chunk-size <n>` flag to `render-review` that splits the audio stage's output
  into `review-audio-1.html`, `review-audio-2.html`, etc.
