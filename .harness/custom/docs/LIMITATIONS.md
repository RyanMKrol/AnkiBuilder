# custom/docs/LIMITATIONS.md — this project's trade-offs & limitations log

Customization overlay for `.harness/docs/LIMITATIONS.md`. **This is where your project's own
limitation/trade-off rows go** (golden rule 5): when a change introduces a trade-off, bottleneck, or known
limitation, add a row **here** — not in the pristine `docs/LIMITATIONS.md`, which is plugin-owned and
refreshed on upgrade. Harness upgrades never touch this file. (See `.harness/custom/CLAUDE.md`.)

Each row: what it is, *why* it was chosen, its **impact**, and *when to revisit*.

## The Corpus review translates every item before you can exclude it

- **What:** the review flow is two steps — a combined **Corpus** review (English + target +
  pronunciation) then **Audio**. The Corpus review operates on `cards.json`, so `translate` runs on the
  **whole** assembled corpus before the human sees it; exclusion happens *after* translation (on the
  cards), not before it. There is no longer an English-only pre-translation gate.
- **Why:** the point of the merge is to green-light the English AND see the actual target translation at
  one gate (to catch a word that comes back with several unfamiliar variants). You can't judge a
  translation you haven't generated, so pre-translation exclusion is incompatible with the goal.
- **Impact:** a little LLM cost is spent translating items you then exclude (they never reach the deck).
  For a typical lesson this is a handful of items — negligible — but a very large corpus with many
  throw-away rows pays for translating all of them. The old English-only gate (which let you drop items
  *before* paying to translate them) is gone.
- **When to revisit:** if translate cost on large corpora becomes a real concern, consider an optional
  lightweight pre-pass exclusion (by id, no UI) before `translate`, keeping the combined review as the
  primary gate.

## Kana→kanji audio variants cost an LLM + TTS call per click and aren't reading-validated automatically

- **What:** the dashboard's **Generate (kanji)** button (Japanese only) makes one `claude -p` call to
  convert the card's kana reading into kanji orthography, then a fresh ElevenLabs call per take —
  every click, no cache. The prompt PINS the reading (kanji only where it doesn't change
  pronunciation), but there's no automatic round-trip check that the generated kanji actually reads
  back to the intended kana.
- **Why:** the safeguard is the human ear — the produced kanji text is shown in the audition modal and
  you listen before picking, so a bad conversion (an ambiguous kanji voiced with the wrong reading) is
  caught on audition rather than by code. A round-trip romanize-and-compare would add a second LLM/
  library pass for a feature used a few times per deck.
- **Impact:** each kanji generation spends a Claude call + TTS credits; a wrong-reading kanji is
  possible and only caught by listening. It's an on-demand spot-fix, not a bulk transform.
- **When to revisit:** if kanji variants get used at scale, add a round-trip check (romanize the kanji
  via kuroshiro, compare to the kana reading, auto-discard on mismatch) before offering the take.

## ~~Dashboard editing unlocks only when EVERY unit of a deck has reached the audio stage~~ (RESOLVED)

- **Resolved** by the unit-scoped review (`/review/:type/:id/:unit`): a lesson now edits when THAT
  lesson is at the audio stage, independent of its siblings. So you can finalize a done chapter's audio
  while an earlier chapter is still pre-audio. `renderReviewPage`'s `canEdit` is computed over the
  *filtered* units, so a single-lesson view unlocks on its own.
- **One package per group, no per-lesson `.apkg`, no download.** Rebuilds always target the single
  group package (`rebuildBookDir` merge of `done` lessons, or a template's own deck) — there is no
  per-lesson build. The dashboard keeps that file current: marking a lesson done, and
  audio edits to an already-done lesson, rebuild the group (`rebuildGroupQuiet`, best-effort). The
  server is local so there's no download route — import the collection's on-disk `.apkg` directly.
- **Residual (by design):** a *whole-deck* review (`/review/:type/:id`, no `:unit`) still only edits
  when EVERY unit is at audio, and the merge packages only `done` lessons (409 if none). Intentional —
  the merge is the shippable artifact and must not bake in an un-finished lesson.

## Switching the TTS model re-fetches every clip (cache is model-segmented)

- **What:** the audio cache lives at `.anki-builder/audio/<voiceId>/<model>/…`, keyed by model
  (`src/audio/ttsModel.js`). This is deliberate — it stops a clip made by one model being served for
  another — but it means changing `TTS_MODEL` (or `ANKI_BUILDER_TTS_MODEL`) is a **cold cache**: every
  term is re-fetched from ElevenLabs under the new model directory, re-spending credits, and the old
  model's clips sit on disk unused until manually cleared.
- **Why:** correctness over disk/credits — a v2 clip and a v3 clip of the same text are genuinely
  different audio, so they must not collide on one hash.
- **Impact:** a model switch re-bills the whole corpus's audio (a few cents per lesson at 1
  credit/char) and leaves orphaned clips under the old `<model>/` dir.
- **When to revisit:** if orphaned caches pile up, add a `deck audio --prune-models` or a cache GC that
  drops model dirs no longer referenced by any `cards.json`.

## Number `reading`s are LLM/hand-authored and only checked at review

- **What:** numbers are kept as digits in `target` (natural display) with a spelled-out `reading`
  (kana) that drives the romaji pronunciation and the audio, because digits break both kuroshiro
  (`2,000えん` → `2 , 000 en`) and ElevenLabs (reads it in English). That `reading` is produced by the
  extraction LLM (or by hand), and Japanese counter readings are irregular (`いっぽん`/`にほん`/`さんぼん`,
  `いっかい`/`ごかい`), so a wrong reading is possible and is only caught at the corpus review's
  **Reading (spoken)** column. Nothing validates that a `reading` actually matches its `target`.
- **Why:** the alternative (a lookup table of every counter × number) is a lot of machinery for a
  human-reviewed deck; the review gate is the backstop, and the mechanism itself is language-agnostic
  (`reading` is just "the spoken form") even though numbers are the only trigger in practice today.
- **Impact:** a mis-read number reaches the review looking plausible; if the reviewer misses it, the
  card's pronunciation guide and audio are wrong while the (correct) digit display looks fine.
- **When to revisit:** if wrong readings recur, add a deterministic number→kana speller (per language,
  with counter tables) to generate/verify `reading` instead of trusting the extraction LLM.

## Translate response parsing strips markdown fences, but a call can still fail outright

- **What:** `translateCorpus` (`src/translate/index.js`) sends each group (full-translation,
  pronunciation-only) to Sonnet-medium via `claude -p` in a **single unbatched call** (BATCH_SIZE is
  `Infinity` — the whole group in one shot). The model is instructed to respond with raw JSON only, but
  sometimes wraps the array in a ` ```json ... ``` ` fence anyway; `parseBatch` strips a single
  leading/trailing fence before parsing. If the response is malformed in some other way (truncated,
  extra prose, nested fences), the whole group's items fail together and must be retried by re-running
  `translate` after deleting `cards.json` (the CLI only regenerates when the file is absent — it does
  not resume just the failed ids).
- **Why:** every LLM pass in the toolset is now pinned to one model/effort (Sonnet medium), and a
  capable model handles a whole lesson in one call — which also keeps translations self-consistent
  instead of split across independent batches. The fence-stripping fix only guards the one failure mode
  actually observed (occasional markdown wrapping), not every possible malformed response.
- **Impact:** one unparseable response now fails the *whole* group's translation at once (there are no
  smaller batches to partially succeed); re-running re-spends the call. For a lesson-sized corpus this
  is one call, so the blast radius is a single lesson, not the toolset.
- **When to revisit:** if whole-group failures recur, add per-item retry (re-invoke `runClaude` for
  just the ids missing from the response) instead of requiring a full re-run; and if a corpus ever grows
  large enough to strain a single call's context/output, reintroduce a (larger) batch cap.

## Pedagogical sort is a non-deterministic LLM pass

- **What:** `assemble` re-orders every corpus for learning flow via `sortItemsPedagogically`
  (`src/corpus/pedagogicalSort.js`) — a Sonnet-medium `claude -p` pass. Because it's an LLM call, the
  chosen order is **not deterministic**: re-assembling the same lesson could produce a slightly
  different sequence. It's a *re-ordering only* (the reorder defensively appends omitted ids, ignores
  invented ones, de-dupes — so it can never add/drop/rewrite a card), and it fails open (any
  parse/shape error keeps the extracted order).
- **Why:** the core rule — "a sentence comes after the vocabulary it's built from" — needs morpheme-level
  judgment across spaceless, conjugating target text that a substring algorithm would miss; the LLM
  reads meaning. The user explicitly wanted "the agent to have an opinion" on ordering.
- **Impact:** the order isn't reproducible run-over-run, and a wrong call (a sentence before its
  vocabulary) is possible; it's caught at the corpus review gate, which shows the sorted order for a
  human to approve/nudge. The order is cached in `corpus.json` once written, so it's stable after that.
- **When to revisit:** if reproducibility matters or the LLM mis-orders often, add a deterministic
  guardrail (flag any sentence landing before a substring-matched component vocab) or replace the pass
  with a rules-based sort (bucket by length/type; sentences after their matched vocabulary).

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
  then only for content it judges is *explicitly re-taught*, not merely similar.
- **Why:** exact-string matching is deterministic, free, and instant — the intentional trade-off
  for a pass that runs on every `assemble --epub` call with zero API cost. It used to be a hard
  drop; it's now purely advisory, same as the forward pass — matched items are kept in the corpus
  with `uncertain: true` and a `"Possibly already taught — ..."` note (naming the earlier chapter
  and which field matched) rather than silently removed, so a false-positive match (e.g. a grammar
  particle whose earlier occurrence taught a different point) doesn't quietly disappear before a
  human ever sees it.
- **Impact:** near-duplicate phrasing across chapters can still slip through uncaught and needs to
  be noticed during `review` instead; conversely, an exact match that IS a legitimate re-teach
  (rather than a true duplicate) now shows up as a flagged row the reviewer must actively dismiss,
  rather than vanishing invisibly.
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

## Human-readable chapter labels come from the EPUB's nav document, with a `<title>`-tag heuristic as fallback

- **What:** `describeChapter`/`listExternalChapters` (`src/corpus/epubArchive.js`) resolve a
  chapter's human-facing label (e.g. `"Lesson 6: Going Places (1)"`) through four tiers, each
  falling through to the next on absence/failure: (1) `nav.xhtml`'s `<nav epub:type="toc">` — the
  EPUB3-required navigation document, located via the OPF manifest item whose `properties` include
  `"nav"`; (2) `toc.ncx`'s `<navMap>` — the EPUB2/legacy equivalent, located via `<spine toc="...">`
  or a `media-type="application/x-dtbncx+xml"` fallback; (3) the original `<title>`-tag heuristic
  (splits off a comma-delimited book-title suffix, keeps at most two `":"`-separated segments) —
  kept verbatim as a fallback for books with no usable nav document; (4) plain `"chapter N"`
  wording, unchanged from before this feature existed. This replaces tier 1's original,
  book-tuned-only heuristic (the `<title>`-tag approach was previously the sole mechanism — see the
  entry this one replaces, still an accurate description of tier 3's behavior) with the book's own
  declared chapter structure as the preferred source, since a nav document carries real titles and a
  real chapter-boundary structure, not prose to guess at. Each external chapter is a spine-position
  **range** (`firstChapterNumber`..`lastChapterNumber`), not a single number, since one human chapter
  can span several spine files (or vice versa) — confirmed as a real EPUB pattern by inspecting a
  real book's NCX, which has both a flat `navMap` (1 entry per spine file, for this specific book)
  and a completely separate, much finer-grained `pageList` using `#fragment` anchors within files.
- **Why:** the nav document is the EPUB spec's own mechanism for exactly this — a book's declared
  table of contents with real titles — so it's strictly more principled than parsing arbitrary
  `<title>`-tag prose. The parser follows this file's existing hand-rolled regex/tag-scanning
  convention (see "OPF/container.xml parsing is a hand-rolled scanner" above) rather than adding a
  real XML/HTML parser dependency.
- **Impact / new limitations specific to this mechanism** (the tier-3/4 limitations from the
  previous version of this entry still apply to books that fall through to them):
  - Nested nav/NCX structures (`<ol>` sub-lists, nested `navPoint`s) are fully **flattened into one
    list in document order**, with no level/depth distinction tracked — a book with
    Part/Chapter/Section nesting gets one external-chapter entry per node at every level, which can
    be finer-grained than a person would naturally call "a chapter."
  - Consecutive nav/NCX entries that resolve to the **same spine file collapse to the first entry's
    label**; later entries mapped to that file are silently dropped from the list — there's no
    addressing finer than a chapter number for `describeChapter` to disambiguate "the 2nd of 3
    chapters in this file."
  - A **malformed nav document is indistinguishable from "no nav document"** to the caller — both
    fall through silently to tier 2/3 with no warning that the preferred mechanism was attempted and
    failed (only unresolvable individual *entries* within an otherwise-parseable nav doc get logged,
    via `listExternalChapters`'s `log` callback).
  - Same hand-rolled-scanner caveat as OPF parsing: CDATA, comments containing tag-like text, or
    unusual whitespace/attribute ordering could misparse silently.
- **When to revisit:** if a real book is found where nested-nav flattening produces confusingly
  fine-grained labels, or where the same-spine-file collapse drops a label a reviewer actually
  wanted to see — consider representing external chapters as a tree instead of a flat list, or
  surfacing collapsed entries somewhere in the audit trail rather than discarding them.

## `assemble --template` now requires `--lang` — a breaking change to the template CLI

- **What:** templates are now language-agnostic — `templates/*.json` carry only English terms +
  categories, no `meta.targetLanguage`. `loadTemplate(name, targetLanguage)` (`src/corpus/
  templates.js`) takes the language from its caller and injects it into the assembled corpus's meta,
  and `assemble --template <name>` now **requires** `--lang <language>` (throws if absent), the same
  way the `--epub`/`--chapter`/`--words` paths already do. Previously `--template` ignored `--lang`
  entirely and the template file's own baked `targetLanguage` (`travel-essentials` → `"Spanish"`)
  drove translation.
- **Why:** creating a template and building a deck are orthogonal concerns — a template is reusable
  vocabulary, and which language you study it in is a build-time choice, not a property of the word
  list. Baking one language into the file meant a second Spanish-only "numbers" template couldn't be
  reused for French without duplicating the JSON. Dropping the language entirely (rather than keeping
  it as an overridable default) was the deliberate choice for the cleanest separation.
- **Impact:** a caller that ran `assemble --template travel-essentials` with no `--lang` now errors
  instead of silently defaulting to Spanish — a breaking CLI change (there is no released
  compatibility contract, so no deprecation shim was added). The corpus's `targetLanguage` is now
  whatever `--lang` supplies (typically an ISO code like `es`, consistent with the other sources),
  not the full name `"Spanish"` the old template baked in.
- **When to revisit:** if a template ever genuinely needs a default language (e.g. one so
  language-specific it's meaningless in another), reintroduce an *optional* `meta.targetLanguage`
  that `--lang` overrides, rather than making it required-in-file again.

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

- **What:** for a language with a configured romanization library (`src/translate/
  romanizationLibraries.js`), `pronunciation` comes from a real deterministic library, then
  **corrected in place by a Sonnet-medium pass** (`src/translate/romanizationEval.js`'s
  `correctRomanizations`) — the model is the final authority and fixes the library's frequent errors. For a language with
  no configured library, `translate` still asks the model to prefer a standard system when one
  exists (romaji, pinyin, etc.), falling back to an invented phonetic respelling otherwise, exactly
  as before. Both cases are still written into the same `pronunciation` string field on the card —
  there's no way to tell, from the card alone, which of these three cases (library-backed,
  model-preferred-standard-system, model-invented-phonetic) produced a given value.
- **Why:** the pipeline now has an internal signal for at least the first split (library-backed vs.
  not — whether `getRomanizationLibrary(languageCode)` returned an entry), but surfacing it on
  `CARDS_SCHEMA` is a deliberately separate, deferred follow-up (see
  `docs/translate-prompts.md`'s "Open question") — it would commit every downstream consumer (deck
  template rendering, review tooling) to a two-field shape before there's a concrete presentation
  reason to need one.
- **Impact:** a deck built for a language with a real romanization system still can't distinguish
  "this came from a real deterministic library" / "this is the model's own attempt at a standard
  system" / "this is just a rough phonetic hint" from the card alone — all render identically in
  the Anki template.
- **When to revisit:** if a deck's presentation ever wants to treat these differently (e.g. show
  library-backed romanization more prominently), split `pronunciation` into a
  `romanization`/`phonetic` pair on `CARDS_SCHEMA` and have both the library path and the model
  report which kind they produced.

## Romanization libraries are lazy-loaded, real npm dependencies — a deliberate, bounded exception to this project's dependency-free stance

- **What:** `package.json` now has a real `"dependencies"` block for the first time — seven
  packages backing `src/translate/romanization/*.js`'s per-language adapters:
  `kuroshiro`/`kuroshiro-analyzer-kuromoji` (Japanese, kana+kanji → romaji), `pinyin-pro`
  (Mandarin), `koroman` (Korean), `cyrillic-to-translit-js` (Russian/Cyrillic),
  `hebrew-transliteration` (Hebrew), `@indic-transliteration/sanscript` (Hindi/Devanagari), and
  `arabic-transliterate` (Arabic). The Japanese case is the one genuinely costly dependency:
  `kuromoji`'s bundled IPADIC morphological dictionary is **~41MB unpacked** — real linguistic data
  needed for kanji-aware analysis, not something that can be hand-rolled small. Every adapter's
  library import is a dynamic `import()` inside the adapter function itself (never a static
  top-level import anywhere in `src/translate/`), gated behind `getRomanizationLibrary(languageCode)`
  actually returning an entry for the run's target language — so a run in an unconfigured language
  (Spanish, French, Greek, Thai, ...) never evaluates `import("kuroshiro")` at all, never pays
  kuromoji's dictionary-load cost. `kuroshiro`/`kuromoji` are CJS-only; interop is a plain dynamic
  `import()` (Node wraps CJS `module.exports` transparently), not `createRequire` — nothing here
  needs `createRequire`'s synchronous semantics, since every adapter's `romanize()` is async by
  contract regardless of whether the underlying library itself is sync or async.
- **Why:** this project's existing "genuinely dependency-free" stance (`src/corpus/epubArchive.js`'s
  hand-rolled zip/XML parsing) was a decision to hand-roll something narrow and fully specifiable
  rather than pull in a general-purpose parser — a handful of well-understood XML tags, a zip
  central-directory format. Romanization doesn't have a narrow hand-rollable version: kanji
  morphological analysis, pinyin generation, and script-specific transliteration rules all require
  real linguistic data/rulesets that can't be hand-written small. That earlier precedent doesn't
  transfer to this problem. The alternative to taking these dependencies was the literal status quo
  this feature replaced: an LLM guessing at romanization with zero deterministic backing, which is
  the exact gap this feature exists to close (see `docs/translate-prompts.md`).
- **Impact:** `npm ci` now installs real third-party packages instead of dev-tooling only;
  `node_modules` gains kuromoji's ~41MB dictionary specifically (only paid once per process, per
  Node's module cache, and never paid at all for a run in an unconfigured language).
- **When to revisit:** if a future maintainer wants to shrink the Japanese dependency further,
  investigate whether a lighter kanji-aware alternative to `kuromoji` has emerged — none was found
  during this feature's own research (`wanakana` is lighter but kana-only, insufficient for real
  sentences containing kanji). If another CJS-only romanization library is added for a new language
  later, follow this same dynamic-`import()` interop pattern rather than introducing
  `createRequire` as a second mechanism.

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

## `.apkg` media manifest keys must be plain sequential integers — chapter-prefixing broke real Anki imports

- **What:** `buildBookDeck` (`src/deck/index.js`) originally keyed its media manifest with a
  `${chapterIndex}-${mediaIndex}` scheme (e.g. `"0-0"`, `"1-3"`) to keep keys unique across merged
  chapters. This looked like a reasonable unique key, and passed every unit test, but Anki's real
  `.apkg` importer rejects it outright with `"500: A number was invalid or out of range"` — media
  keys must be plain sequential non-negative integers ("0", "1", "2", ...) that also literally match
  the zip entry filename for that media file. Fixed by threading one shared mutable `{ next }`
  counter through every chapter's `resolveChapterAudio` call, so numbering is globally sequential
  across the whole merged book with no resets and no prefixes.
- **Why:** this bug (and two others fixed alongside it in the same debugging arc — `col.crt` stored
  in milliseconds instead of seconds, and note `csum` values exceeding the signed 32-bit range) all
  passed `npm test` and every synthetic check, because nothing in the test suite actually ran a real
  Anki import. They were only found by installing the real `anki` Python package and reproducing the
  exact import error, then bisecting a known-good `genanki`-built reference file against ours,
  swapping pieces until the exact culprit was isolated.
- **Impact:** a merged book deck could build, pass all tests, and still fail to import into Anki with
  a generic, unhelpful error — three real format bugs shipped invisibly until a human tried a real
  import. There is still no automated test that runs a real Anki import in CI (that would require the
  `anki` Python package as a dev dependency, which hasn't been added).
- **When to revisit:** if another silent `.apkg`-format bug surfaces, consider adding a scripted
  real-import smoke test (via a pinned `anki` Python package, shelled out to from a test or a
  standalone verification script) to the Definition of Done, rather than relying on structural
  assertions about the zip/SQLite contents alone.

## ElevenLabs `language_code` only fires for a real ISO 639-1 code — no name-to-code lookup

- **What:** `generateAudio` (`src/audio/index.js`) passes ElevenLabs' `language_code` request
  parameter only when `cards.meta.targetLanguage` resolves against `src/model/iso639.js`'s
  `resolveIso639Code` — the full, hardcoded ISO 639-1 code set (no npm dependency, following this
  project's existing "hand-rolled over adding a dependency" pattern from `epubArchive.js`'s OPF/
  container.xml parsing). A value like `"ja"`/`"JA"`/`"Ja"` resolves and gets sent; a full language
  name like `"Japanese"` does not — it resolves to `null`, and `language_code` is simply omitted
  from the request, falling back to ElevenLabs' own auto-detection from the text (unchanged from
  before this parameter existed).
- **Why:** deliberately narrow scope — resolving `"Japanese"` → `"ja"` needs a real name-to-code
  lookup (and handling ambiguity: "Chinese" alone doesn't disambiguate Mandarin from Cantonese,
  multiple English names can map to one code, etc.), a fuzzier problem than validating an
  already-code-shaped value against a fixed, authoritative set. Every EPUB-driven run in this
  project already stores a real code (`--lang ja`, `--lang es`, etc., per the CLI's own `--lang`
  flag convention), so the gap only bites hand-authored or template corpora that used a full name.
- **Impact:** a corpus/cards file with `targetLanguage: "Japanese"` (rather than `"ja"`) gets no
  `language_code` sent — TTS still works via ElevenLabs' auto-detection, just without the extra
  hint, so this is a missed *improvement*, not a broken *pipeline*.
- **When to revisit:** if a real run's `targetLanguage` value turns out to commonly be a full name
  rather than a code, add a small, explicit name→code map for the common cases actually seen,
  rather than attempting a general natural-language lookup.

## Lesson-sourced courses (`--words`) have no cross-lesson dedup, unlike EPUB chapters

- **What:** `assemble --words` (`src/corpus/lessonCorpus.js`, `resolveCourseSlug`/
  `resolveLessonRunDir` in `src/cli/outputPaths.js`) deliberately does NOT run anything analogous
  to the EPUB path's `dedupBackward`/`flagForwardConcerns` passes. A word re-taught across two
  lessons of the same course (e.g. "Yes" appearing in both Lesson 1 and Lesson 3) is assembled
  twice, independently, with no cross-lesson awareness at all — no flag, no note, nothing.
- **Why:** those passes exist for EPUBs specifically because a whole book's chapter text is
  available up front to check a new item against (`loadPriorChapterItems`) and to scan forward
  into (`flagForwardConcerns`'s later-chapter re-teach detection) — real source text to compare
  against. A `--words` lesson has no equivalent: it's a flat list of English phrases the user
  dictated, with no source text a later/earlier lesson's content could be compared against beyond
  the phrases themselves. Building real dedup for this source wasn't requested when this path was
  added and would need its own design (exact-string match against every prior lesson in the same
  course, most likely) rather than reusing the EPUB passes as-is, which assume book-chapter shape.
- **Impact:** a real-life course that revisits vocabulary across lessons (common in language
  teaching) will get duplicate cards across the merged course deck, with no automated signal
  during assembly — only a human skimming the corpus review page would catch it.
- **When to revisit:** if a real course's merged deck turns out to have noticeable duplicate cards
  across lessons, add an exact-string backward-dedup pass scoped to `--words` assembly (mirroring
  `dedupBackward`'s matching logic, but reading prior lessons' `corpus.json` files directly from
  `output/<courseSlug>/lesson-*/`, since there's no by-EPUB-hash library entry to read from —
  `resolveLessonRunDir` already knows how to enumerate a course's lesson folders).

## Lesson word-list categorization is a single unverified model pass, unlike EPUB extraction

- **What:** `assembleCorpusFromLessonWords` assigns each item's `category` via one batched
  `claude -p` call with no evaluation/verification step — contrast with the romanization pipeline's
  library-first-then-eval pattern, or the EPUB path's two dedicated dedup passes. A wrong category
  here has no automated check at all; it silently ships as whatever the model returned (or
  `"Other"` on a parse failure). (This entry, and the code comment beside the pass, both said
  "Haiku" until 2026-08. No pass in this project has ever run Haiku: every `claude -p` call goes
  through `src/util/runClaude.js`, which defaults to Sonnet at medium effort.)
- **Why:** category assignment for a already-curated, user-dictated word list is a much lower-
  stakes judgment call than translation correctness or romanization accuracy — the corpus review
  gate (the dashboard corpus review, the same gate every other source goes through) is a cheap,
  fast place for a human to catch and fix a wrong category, and this project's own category enum
  (`src/model/categories.js`) is itself documented as a first-cut list "revisit if it proves too
  coarse or fine in practice" — adding a second model pass to verify a coarse categorization judgment
  felt like more machinery than the risk warranted.
- **Impact:** occasional miscategorized cards (e.g. a greeting phrase filed under "Other") that
  only get fixed if a human notices them during corpus review — no different in practice from a
  wrong category slipping through the EPUB extraction path's own single-pass categorization (that
  path has no dedicated category-verification step either), just called out explicitly here since
  this is a newer, less-exercised path.
- **When to revisit:** if miscategorization turns out to be common enough in practice to be an
  actual review-burden problem, consider a lightweight self-consistency check (e.g. asking the
  model to re-categorize with the full category list restated and comparing) rather than a full
  eval-style second pass.

## Per-card `reading` is still not auto-generated — but a missing one can no longer reach TTS

- **What:** cards now support an optional `reading` field — a phonetic spelling in the target
  language's own script (e.g. hiragana for Japanese) that the **audio** stage speaks instead of
  `target`, so a deck can show kanji 二十一 on the face while TTS says にじゅういち. The audio stage
  (`src/audio/index.js`, `speechText`) and the cards schema (`src/model/index.js`) fully support it,
  but the **translate** stage does not yet emit `reading` — it still produces only `target` +
  `pronunciation`. So today a `reading` must be supplied out-of-band after translate (e.g. the
  deterministic Japanese number→kana conversion used for the `numbers` deck, or a hand edit to
  `cards.json`). A run that goes straight through `translate` → `audio` with no injected `reading`
  behaves exactly as before (TTS speaks `target`).
- **Why:** the mechanism (audio honoring `reading`, with a clean `target` fallback) is small,
  general, and safe to land with tests; making the LLM translate stage generate readings is a
  separate, riskier change — the model produced several *wrong* Japanese readings during this work
  (e.g. 九十九 as *tsukumo*, 万 as *ban*), so an auto-reading path needs its own review gate and
  validation rather than being bolted on here.
- **Impact:** logographic-script decks (Japanese, Chinese) only get correct spoken audio if a
  `reading` is injected before the audio stage; there's no one-command path from a dictated/EPUB
  Japanese corpus to reading-driven audio yet.
- **When to revisit:** when adding reading generation to `translate` — surface `reading` in the
  translate review artifact and validate it (ideally a deterministic generator for numerics, LLM +
  review for open vocabulary) so the whole pipeline can produce reading-driven audio unattended.

## `--output-root` reorg has no automatic migration for pre-existing flat `output/` folders

- **What:** every source type now nests under a reserved top-level segment of `outputRoot` —
  `epubs/` (books), `courses/` (courses), `templates/` (templates) — via `EPUBS_DIR`/`COURSES_DIR`/
  `TEMPLATES_DIR` in `src/cli/outputPaths.js`. This eliminates cross-source slug collisions at the
  root (a book titled "Templates" now lands at `output/epubs/templates/`, never alongside the
  template tree). But the resolvers only ever look under the new segments: any book/course folder
  created by an OLDER version directly at `output/<slug>/` (flat, pre-reorg) is invisible to
  `resolveBookSlug`/`resolveChapterRunDir`/`listCourses`/`resolveCourseSlug`/`resolveLessonRunDir`
  until it's physically moved under the right segment (`output/<slug>/` → `output/epubs/<slug>/` or
  `output/courses/<slug>/`). There's no built-in migration command.
- **Why:** the reserved-segment layout was the explicit ask, and `output/` is gitignored build
  output — a one-time manual `mv` (or re-assemble) is cheaper than shipping and testing a migration
  path for what is, for most users, a single machine's throwaway folder.
- **Impact:** after upgrading, a pre-existing flat book/course won't be found (a re-assemble would
  allocate a fresh folder under the new segment instead of reusing the old one) until its folder is
  moved; the persisted book slug in `.anki-builder/` and the `.epub-hash`/`course.json` markers all
  still match once the folder is in the new location, so a manual move is sufficient — nothing needs
  regenerating.
- **When to revisit:** if this reorg ever ships to users with real populated `output/` trees, add a
  one-shot `migrate-output` helper (or a lazy "found a flat `<slug>/` with a marker — relocating it
  under `<segment>/`" fallback in the resolvers) instead of a manual move.

## EPUB lesson selection is TOC-driven and file-level — it can't split two lessons that share one spine file

- **What:** `--lesson` (`src/corpus/epubLessons.js`, built on `listExternalChapters` in
  `src/corpus/epubArchive.js`) resolves a lesson to an inclusive RANGE of whole spine files from the
  book's navigation document (nav.xhtml / toc.ncx), and `extractChapterRangeToFile` concatenates that
  whole range. This correctly handles a lesson that spans multiple files, and stops the old
  "one spine file == one lesson" assumption from silently under-covering a lesson. But it stays at
  **file granularity** in three ways: (a) if two lessons live in the *same* spine file (a nav entry
  with only a `#fragment` differing), `listExternalChapters` collapses them to one entry (keeping the
  first label), so the second lesson can't be selected on its own — its content rides along with the
  first; (b) there is **no LLM reconciliation** of the TOC — whatever the nav document says the
  boundaries are is taken as truth, with no cross-check against the actual file contents; (c) a book
  with **no usable nav/NCX** returns no lessons at all, so `--lesson`/`--list-lessons` can't be used
  and the user must fall back to `--chapter-number <spine index>`.
- **Why:** the nav document is the book's own authoritative statement of its structure and is
  deterministic and free to parse, so it carries the whole feature with no extra model calls. The
  three deferred cases are rarer and each needs a real step up in machinery (fragment-level XHTML
  slicing; a whole-book LLM structure pass; LLM-only inference when there's no TOC) that wasn't
  warranted for the first cut.
- **Impact:** for a well-structured textbook (the common case) lesson selection is exact and
  multi-file-safe. For a book that packs multiple lessons into one file, a shared-file lesson is
  silently merged into its predecessor; for a TOC-less book, only the raw spine-index path is
  available. No case produces *wrong* content silently for the multi-file span itself — the gap is
  strictly "can't address finer than a file" and "can't select at all without a TOC".
- **When to revisit:** if a real book is hit where a lesson boundary falls mid-file (add a warning
  when consecutive nav entries collapse to one spine file, then fragment-level slicing), or where the
  EPUB has no nav document (add the LLM-only structure-inference fallback). A `--list-lessons` that
  emitted a "couldn't detect structure" note for the no-TOC case would make the fallback discoverable.

## Alt audio doubles TTS calls and is a heuristic, not a guaranteed improvement

- **What:** for a language listed in `src/audio/altAudio.js`'s `ALT_AUDIO_TRANSFORMS` (currently only
  Japanese → append `。`), the audio stage generates a SECOND recording per card from the transformed
  spoken text, so every card fetches two ElevenLabs clips instead of one. The alt is offered in the
  audio review to switch to or drop; the deck only ever embeds the card's final `audio`.
- **Why:** empirically a trailing `。` gives ElevenLabs a sentence boundary that fixes many
  mis-rendered short/bare Japanese clips (lone kana like はん/ふん, some numbers) — a real, recurring
  quality problem found while building the JBP Kana Lesson 3 deck. Generating both (rather than
  guessing which clip is better per card) lets a human pick in the review.
- **Impact:** ~2× the TTS API calls (and cache files, and audio-review artifact size) for a
  configured language. The `。` transform is a blunt heuristic — it helps short clips but isn't
  guaranteed better for every card (e.g. a card whose target already ends in `。` gets a doubled
  `。。`), which is exactly why it's an opt-in *alt* per card, never the silent default.
- **When to revisit:** if cost matters, `audio --no-alt` skips the pass for a run; longer term,
  generate alt clips lazily (only for rows the review actually flags) instead of for every card, and
  make the transform smarter (skip cards already ending in sentence punctuation).

## Deck font is embedded whole and only supports the classic .apkg format

- **What:** the deck builder (per-language `LANGUAGE_FONTS`, `src/deck/fontLibrary.js`) and
  `restyle-font` embed a script-appropriate font so a deck renders identically everywhere. Two edges:
  (1) the **full font** is embedded — Klee One with kanji is ~1.9 MB, added to every Japanese deck
  built or restyled; (2) `restyle-font` only handles the **classic `.apkg`** format (a `media` JSON
  map + `collection.anki2`/`.anki21`) — the newer `anki21b`/protobuf-media export is rejected with a
  clear error rather than silently mangled. (The font is scoped to the target script via
  `@font-face`'s `unicode-range`, so it renders *only* the target-language glyphs and leaves
  Latin/romaji/English text alone.)
- **Why:** embedding whole avoids a build-time font-subsetting dependency (fonttools/Python) in a
  Node/CI project; the classic format is what this tool builds and what the target decks (e.g. Tofugu)
  use, and parsing zstd/protobuf exports is a much bigger lift.
- **Impact:** +~1.9 MB per Japanese deck; a very new third-party `.apkg` can't be restyled until
  re-exported in the classic format (Anki can do this).
- **When to revisit:** subset the font to the glyphs a deck actually uses (needs a subsetter) to
  shrink it; add `anki21b` support to `restyle-font` if a real deck needs it.

### Deck dashboard (`serve`) reads build folders, is localhost-only, no `.apkg` ingestion yet
- **What:** the `serve` dashboard discovers decks from the `output/` **build folders** (`cards.json` +
  `audio/`), not from arbitrary `.apkg` files, and binds `localhost` with **no authentication**. Only
  the built-in formats (book/course/template) are ingested — a new layout needs a new adapter.
- **Why:** build folders are richer (reading/notes/category) and always current, and their layouts map
  1:1 to adapters (the "new format ⇒ new adapter" extension model). HTTP audio streaming removes the
  base64 size cap that forces `view-deck` to split into parts. Localhost/no-auth is fine for a
  single-user local tool.
- **Impact:** can't point the dashboard at a loose downloaded `.apkg`; not safe to expose on a shared
  network as-is.
- **When to revisit:** add an `apkg.js` adapter (buffer-backed media route, since `readApkg` returns
  in-memory audio) behind the same interface if browsing arbitrary packages is wanted; add auth/bind
  options before exposing beyond localhost.

### Dashboard editing: orphaned clips, last-writer-wins, credit cost
- **What:** editing a card's audio from the dashboard leaves the **previous clip on disk** (the card
  just stops referencing it); two rapid edits to the **same** card are last-writer-wins; **Generate**
  makes up to 8 ElevenLabs calls per card (billed) on EVERY click — fresh takes by design (no cache
  reuse), so re-rolling a card spends credits each time.
- **Why:** deleting the old clip risks removing a hash-named TTS file another card still references;
  serialized per-card locking is overkill for a local single-user tool; generating the full variant
  set is the whole point of the feature and fresh renderings are the point of a re-roll.
- **Impact:** `audio/` accumulates unreferenced files over many edits; a same-card double-submit could
  keep the earlier pick; a careless Generate spends a handful of credits.
- **When to revisit:** add a "prune unreferenced audio" pass; a per-run-dir write lock if concurrent
  editing ever matters; a confirm/estimate before Generate, or a per-card generate cap, if credit cost becomes a concern.

### Trailing-silence trim is best-effort and needs an optional system ffmpeg
- **What:** ElevenLabs clips are auto-trimmed of trailing silence + the end blip via ffmpeg
  (`src/audio/trimSilence.js`), but ffmpeg is a system binary the project does not bundle and isn't
  installed by default. The trim uses fixed `silencedetect` thresholds and re-encodes (pass 2).
- **Why:** never let an optional audio-polish step break the audio build (Node can't decode/re-encode
  mp3 alone, and bundling a binary is out of scope) — so it degrades to a no-op; and fixed thresholds
  keep it deterministic and dependency-free to test.
- **Impact:** without `brew install ffmpeg` clips keep their trailing silence + blip (one warning, then
  a silent no-op). The fixed thresholds may under/over-trim an unusual clip; pass 2 re-encodes (tiny
  quality/size cost). Only ElevenLabs-generated clips are trimmed — manual dashboard uploads are not.
- **When to revisit:** if under/over-trimming recurs, tune the `ANKI_BUILDER_TRIM_*` env knobs or add a
  start-trim / loudness-normalize pass; add a one-time backfill over existing on-disk clips if wanted.

### Deliver-to-Anki matches notes by content on the first run (no GUID from AnkiConnect)
- **What:** `src/anki/deliver.js` pushes corpus state to Anki via AnkiConnect using explicit
  `updateNoteFields`/`addNotes` (not `.apkg` `importPackage`). `notesInfo` doesn't return a note's GUID
  on the user's Anki, so notes are matched to cards by a durable `abid:<card.id>` tag — but that tag
  only exists AFTER a first delivery stamps it. On the first run, un-tagged notes are matched by a
  `Target` (then `English`, then prefix) fingerprint; anything not uniquely resolvable is reported
  `ambiguous` and skipped.
- **Why:** determinism. `.apkg` "update existing notes on import" is version/setting-dependent and
  unpreviewable; explicit field writes touch only `notes.flds`, never scheduling, and make `--dry`
  exact. Guessing a content match would risk overwriting the wrong note, so ambiguity fails closed.
- **Impact:** a genuine duplicate (two cards sharing Target+English) or a card whose Target AND English
  both changed since import stays `ambiguous` — not delivered until a human stamps its `abid` tag or
  resolves it. Field-content and structure changes are otherwise applied in place with scheduling kept.
- **When to revisit:** if AnkiConnect exposes GUIDs, key directly off `card.id`; add a small "resolve
  ambiguous" helper (stamp the tag by hand-picked noteId) if the tail of ambiguous cards grows.

### Deliver-to-Anki does not push card ORDER, delete orphans, or back up the whole collection
- **What:** the deliverer never repositions new cards (order isn't delivered), never deletes an Anki
  note whose card left the corpus (reported as `orphaned`), and backs up only the *managed* decks
  (`exportPackage` with scheduling) + a note-type structure snapshot — not the whole collection.
- **Why:** AnkiConnect can't cleanly reposition already-imported cards and order barely matters for
  studied cards; deletion is irreversible and risks mis-mapping; a per-deck backup + structure snapshot
  is enough to undo everything the tool itself can change, and Anki keeps its own automatic collection
  backups.
- **Impact:** a re-jumble/reorder only reaches Anki via a destructive fresh import (rarely worth it);
  removed cards linger in Anki until deleted by hand; a catastrophe outside the managed decks relies on
  Anki's own backups, not this tool's.
- **When to revisit:** add an opt-in `--prune` to delete orphans; a full `.colpkg` backup if AnkiConnect
  gains a reliable action; a fresh-import path if delivering order ever becomes important.

### Deliver auto-syncs with AnkiWeb, but a schema change still needs one manual Upload click
- **What:** the deliverer calls AnkiConnect `sync` before (pull) and after (push) each run. A
  content-only delivery syncs incrementally with no prompt; a delivery that changes the note-type SCHEMA
  (adds a field, edits a template/CSS) forces a one-way full sync that Anki gates behind its GUI
  Upload/Download dialog. AnkiConnect's `sync` can't answer that dialog, so the user must click "Upload
  to AnkiWeb" once. The report sets `schemaChanged` so the CLI/dashboard warns about it.
- **Why:** AnkiConnect exposes only `sync` (no direction, no `fullUpload`), and the full-sync direction
  is a deliberate GUI decision in Anki. Sync failures are non-fatal (offline / no AnkiWeb creds) so they
  never block a local delivery.
- **Impact:** one unavoidable manual click on the rare deliveries that change fields/templates; none on
  the common content-only deliveries.
- **When to revisit:** if AnkiConnect ever adds a directional full-sync action, drive it from
  `schemaChanged` to make even structural deliveries fully hands-off.

### Atomic writes protect concurrent readers, not power loss

- **What:** `src/util/atomicWrite.js` publishes a file by writing a temp file in the destination's own
  directory and `rename`-ing it into place, so a concurrent reader always sees a whole file. It does
  **not** `fsync`. A power cut or kernel panic can still lose a write that the process believed had
  landed.
- **Why:** `rename(2)` is atomic with respect to other processes regardless of fsync, which is the
  property that matters here — several files are written by one process while another reads them. That
  is not about running two builds (which is no longer supported): the dashboard (`serve`) runs for the
  whole of a build and reads and writes the same `cards.json` a CLI stage is writing, saves the
  reviewed-corpus dedup library from "Mark reviewed" while an assemble may be reading it, and serves
  clips out of the TTS cache while the audio stage writes into it. fsync only adds crash durability, and on a 10 MB `.apkg` rebuild it costs real time on every
  build for a failure mode that costs one re-run.
- **Impact:** none in normal operation. After a hard crash a just-written file may be missing or stale;
  re-run the stage.
- **When to revisit:** never, unless these artifacts stop being cheaply reproducible from their inputs.

### Some writes are deliberately left non-atomic

- **What:** `restyle-font --out` and `view-deck --out` (`src/cli/index.js`), the delivery backup
  (`src/anki/deliver.js`), and every `scripts/*.mjs` maintenance script still write directly.
- **Why:** the two `--out` paths are arbitrary user-chosen destinations with no concurrent reader, and
  rename is actively worse there — it replaces the inode, discarding any hardlinks/ACLs/xattrs set on an
  existing destination, and fails `EXDEV` if the destination is on another volume. The delivery backup
  writes into a freshly created timestamped directory with a single writer. The `scripts/` migrations
  are run by hand, one at a time, never concurrently.
- **Impact:** a torn file is possible at those sites only if you deliberately run two of them at once
  against the same path.
- **When to revisit:** if a script ever runs unattended alongside a build. The cross-lesson note pass
  is the one to watch: it reads every sibling lesson's `cards.json`, so running the whole-book form of
  `scripts/enhance-card-notes.mjs` while a lesson is being prepared reads that lesson mid-flight.

### Run directories are reserved up front, which changes three behaviours

- **What:** a chapter/lesson directory is created and claimed the moment it is allocated, rather than
  appearing minutes later when `corpus.json` is written. So (1) assembling a chapter a live build
  already owns is a hard error rather than two runs silently building it twice, (2) an empty reserved
  directory is a normal state a retry reclaims, and (3) there is a microsecond window between the
  `mkdir` and the claim write where a crash leaves a directory nothing will ever reclaim.
- **Why:** the old allocator computed `max(seq)+1` and returned the path without creating it, so
  nothing on disk recorded that a chapter was being worked on until the extraction finished. A
  filesystem CAS fixes that with no lock to hold or leak.
- **Impact:** (1) is a guard against a double-run, not concurrency support — building several lessons
  at once is not a supported mode, but the accident is easy to have (extraction is minutes of silence,
  so a stuck-looking run invites a second terminal) and the consequence without the guard is two
  directories for one chapter, merged into the deck twice. (3) is rare and self-inflicted; deleting the
  stray directory is the fix.
- **When to revisit:** if run directories are ever renamed to `chapter-<chapterNumber>` instead of an
  autoincrement seq (see the row below), the whole reuse ladder collapses into an idempotent
  `mkdir(recursive:true)` and can be deleted.

### Run directories keep their autoincrement `seq`, not the chapter number

- **What:** run dirs stay `chapter-<seq>`/`lesson-<seq>`, so allocating one needs a compare-and-swap.
  Naming them `chapter-<chapterNumber>` instead would have made allocation a plain idempotent
  `mkdir(recursive:true)` and deleted the whole reservation mechanism.
- **Why:** `seq` is load-bearing in three places — it is the stable key in the dashboard's URL space
  (`/review/:type/:id/:seq`, `/media/...`), it is the canonical deck ordering key in
  `selectDoneChapterDecks` (deliberately independent of the displayed chapter number), and two
  different `--lesson` selections can resolve to the same first spine number and would collide on one
  directory. Changing it would break existing bookmarks and re-order sub-decks inside `.apkg` files
  already imported into Anki.
- **Impact:** the reservation ladder in `outputPaths.js` exists only because of this choice.
- **When to revisit:** only alongside a deliberate migration of the URL space and deck ordering.

### A cached chapter file is trusted without checking its images

- **What:** `extractChapterToFile`/`extractChapterRangeToFile` skip re-extracting when the cached
  `.xhtml` exists and is non-empty. They do not verify that the images it references are still on
  disk. If you delete an image out of `.anki-builder/epubs/<hash>/chapters/` but leave the chapter
  file, extraction will keep skipping and the LLM will be handed a chapter whose `<img>` refs don't
  resolve.
- **Why:** the extractors publish images FIRST and the chapter file LAST, so the chapter file's
  existence is the commit point for the whole unit — an interrupted extraction leaves no chapter file
  and is simply redone. Given that, verifying every image on every call would be pure cost: the
  forward-flag pass alone touches 30-50 chapters per lesson build.
- **Impact:** only reachable by hand-editing the cache. The repair is to delete the chapter file (or
  the whole cache — it is disposable and rebuilds from the EPUB).
- **When to revisit:** if anything ever prunes the cache selectively rather than wholesale.

### Two rebuilds can't interleave only because the rebuild path never yields

- **What:** `rebuildBookDir` reads the done-set and publishes the collection package with no `await` anywhere in
  between — `readdirSync`/`readFileSync`, a synchronous `buildBookDeck`, then `writeFileAtomic` +
  rename. Node cannot schedule a second rebuild between the read and the write, so the later of two
  concurrently-requested rebuilds always observes every `done` flag written before it started.
- **Why:** this used to be enforced by a per-book `.rebuild.lock`, removed with the rest of the
  multi-process support. Two rebuilds can still be REQUESTED at once inside the dashboard (marking a
  lesson done awaits its own rebuild, and that await is a yield point), so the property still has to
  hold — it is just held by the code being synchronous rather than by a lock.
- **Impact:** the no-yield property is now load-bearing and invisible. Making `buildBookDeck` (or
  anything it calls) async would silently reintroduce the lost update: a rebuild publishing a done-set
  missing a lesson finished while it ran. Separately, the cross-process case is no longer defended at
  all — the dashboard rebuilding while `deck --book-dir` runs in a terminal can leave the `.apkg`
  briefly missing a just-finished lesson. Never corrupt (the rename guarantees that), and the next
  rebuild picks it up.
- **When to revisit:** the moment anything on the rebuild path needs to be async — that is the trigger
  to bring back a lock or an in-process queue, not a reason to make it async and hope. There is a
  regression test in `test/deck/rebuild.test.js` that fails if the property is lost.

### "Building" is derived from a claim file, which can be left behind by a crash

- **What:** the dashboard renders a lesson read-only with a `building (<stage>)` badge whenever its
  `claim.json` names a live process. A crash can leave that claim behind. It does not wedge the
  lesson — a claim whose pid is gone reads as *stale*, so the lesson is editable again and the page
  shows an "interrupted" notice plus a Clear button — but the file itself lingers until cleared or
  until the next run of that stage reclaims it.
- **Why:** the alternative was inferring "building" from stage markers and file mtimes, which needs
  no lifecycle but cannot name the stage or its start time, and cannot tell "pending" from "running".
  A liveness probe (`process.kill(pid, 0)`) is exact for the local single-machine case this targets,
  and makes staleness self-healing rather than time-based.
- **Impact:** a claim from ANOTHER host cannot be probed and is treated as live (conservative), so a
  lesson built on a different machine over a shared filesystem would stay read-only there. Not a
  supported setup — `output/` and `.anki-builder/` are local and gitignored.
- **When to revisit:** if these directories are ever shared between machines, replace the pid probe
  with a lease the owner renews.

### The audio stage merges rather than overwrites, but only for the `audio` field

- **What:** `runAudio` re-reads `cards.json` after the TTS pass and applies only each item's `audio`
  filename onto the fresh copy, so dashboard edits made during the (minutes-long) stage survive.
  Cards ADDED to the file mid-stage keep no audio, and a card deleted mid-stage stays deleted.
- **Why:** the stage owns exactly one field. Anything more would need real conflict resolution, and
  the review flow does not add or delete cards at that point.
- **Impact:** none in the normal flow. The server also refuses writes to a lesson with a live claim
  (409), so the overlap window is small in practice.
- **When to revisit:** if a future stage ever writes more than one field of a file a human can edit
  concurrently.

### `prepare` bundles four passes behind one claim, so a partial failure is invisible in the exit code

- **What:** `prepare` runs translate → fill-in-the-blank → semantic de-dup → cross-lesson notes as one
  stage. Every pass but translate **fails open**: a model or parse error logs a line and leaves the
  cards as they were. So `prepare` can exit 0 having silently skipped drill enrichment or notes, and
  the only trace is a log line the operator may not have watched.
- **Why:** the alternative — failing the whole stage when an optional enrichment pass hiccups — would
  leave the lesson un-translated and unreviewable over something cosmetic. Enrichment is genuinely
  optional; translation is not, and it is the one pass that throws.
- **Impact:** a lesson can reach the corpus review with no practice cards or no cross-lesson notes and
  look identical to one that legitimately had no drills to mine. The `.pre-fib.bak` /
  `.pre-enhance.bak` files beside `cards.json` are the on-disk tell, and `cards.meta.enriched` /
  `notesEnhanced` mark that a pass *ran*, not that it *produced* anything.
- **When to revisit:** if a skipped pass ever ships to a deck unnoticed. The fix would be a per-pass
  outcome recorded in `cards.meta` (ran / failed / nothing-to-do) and surfaced as a banner at the
  corpus review, rather than only in the CLI log.

### An `INCOMPLETE` lesson is detected from file presence, not from a recorded build outcome

- **What:** a run dir counts as unfinished purely because it has `corpus.json` and no `cards.json`.
  Nothing records *why* — a crash, a Ctrl-C, an `--no-prepare` run, and a translate that threw all
  look identical.
- **Why:** file presence needs no bookkeeping and cannot itself go stale, which is what made the old
  three-stage model wrong in the first place (it treated the absence of work as a kind of progress).
  The claim file already covers the "and it died mid-run" case with an *interrupted* badge.
- **Impact:** the dashboard can say a lesson is unfinished and how to finish it, but not what went
  wrong. For a repeatable failure the operator has to re-run `prepare` and read the error.
- **When to revisit:** if diagnosing failed builds after the fact becomes common — a `lastError` in
  the claim (kept on failure, which `prepare` already does) would carry the reason.

### The test-runner guard covers the LLM spawn, not the TTS fetch

- **What:** `assertExternalCallAllowed` (`src/util/testEnv.js`) makes both `runClaude` wrappers refuse
  to spawn `claude` under `node --test`. The ElevenLabs fetch has no equivalent guard; it relies on
  every audio test injecting `fetchTts`.
- **Why:** the leak that actually happened was an LLM one — `assemble` chaining into `prepare` made
  every assemble test spawn a real translate call, silently and slowly. The audio path has always been
  injected at every call site, so the same failure mode hasn't arisen there.
- **Impact:** a future audio test that forgets to inject `fetchTts` would spend real TTS credits and
  pass. Same class of bug as the one this guard was written for, one layer over.
- **When to revisit:** next time `src/audio/` grows a call site, or the first time a test bill shows
  up. `fetchElevenLabsTts` should call the same guard.

### A lesson's build reads the book's REVIEWED history, so lessons must be built in order

- **What:** backward de-dup reads the library at `.anki-builder/epubs/<hash>/corpora/`, which is
  written by the dashboard's "Mark reviewed" and by nothing else. The drill and cross-lesson-note
  passes read each earlier unit's `cards.json`, written by that lesson's own `prepare`. So a lesson
  built before its predecessors are reviewed (or even built) silently sees less than it should.
- **Why:** the de-dup library is deliberately the REVIEWED corpus — the point is to compare against
  what a human actually kept, not against everything an extractor proposed. That makes a human action,
  not a build step, the thing that publishes a lesson to its successors.
- **Impact:** `assemble` and `prepare` both warn and continue rather than refusing, so getting ahead
  on extraction stays possible; `prepare` additionally withholds its enrichment markers so a re-run
  repairs the result. But a warning is easy to scroll past, and the de-dup half has no repair path
  short of re-assembling the lesson. Measured on this repo's Japanese book: three reviewed lessons
  that never reached the library cost 12 unflagged repeats across the next three lessons.
- **When to revisit:** if building out of order becomes common, make `assemble` refuse without
  `--force`. A deeper fix would decouple the library from the review — saving a provisional corpus at
  `prepare` and replacing it at Mark reviewed — but that trades the "compare against what a human
  kept" property away, so it needs thought rather than a patch.

### Rebuilding a missing dedup-library entry re-derives history rather than recovering it

- **Status:** the script this described (`backfill-dedup-library.mjs`, once in `scripts/`) was
  deleted; the reasoning is kept because it applies to any future backfill.
- **What:** a backfill can only rebuild a missing library entry from the lesson's CURRENT
  `cards.json`, not from what the lesson looked like when it was reviewed.
- **Why:** there is no record of the latter. The library entry IS the record, and it's the thing that's
  missing.
- **Impact:** a lesson edited after review is backfilled in its edited state. For de-dup — exact-match
  on `english`/`target` — that is almost always the same set, and being slightly newer is harmless.
  It would matter if the entry were ever used for something order-sensitive.
- **When to revisit:** if the library grows a second consumer that cares about the state at review
  time rather than the current state.

### Readiness is inferred from markers, so a pass that lies about itself is undetectable

- **What:** `lessonReadiness` trusts `cards.meta.enriched` / `notesEnhanced`. Those are set by
  `prepare` when the pass had complete inputs — but "the pass ran with what it needed" is not the same
  as "the pass produced something good". A drill pass that returned nothing usable still marks itself
  complete, because a lesson whose source genuinely has no drills must not re-run forever.
- **Why:** the alternative is asserting on output (at least N drills, at least N notes), which would
  block legitimate lessons — plenty of chapters have no usable drills, and most cards should end up
  with no note at all.
- **Impact:** the gate catches a pass that never RAN, which is the failure that actually happened
  repeatedly. It cannot catch a pass that ran and fell open. The `[dedup:semantic]` and
  `fill-in-the-blank:` log lines are the only signal for that, and nobody reads logs after the fact.
- **When to revisit:** if a fail-open pass ever ships something wrong unnoticed. The fix is to record
  each pass's OUTCOME in meta (ran / failed / nothing-to-do) rather than a boolean, and surface a
  "this lesson has no drills — is that right?" note at the review.

### The gate can be bypassed by hand-editing cards.json

- **What:** setting `"enriched": true` in a `cards.json` by hand makes a lesson reviewable without the
  pass having run. Same for `"reviewed": true` and the done gate.
- **Why:** these files are plain local JSON in a gitignored directory, deliberately hand-editable —
  that's how several of this repo's own repairs were done. A tamper-proof marker would need signing,
  which is absurd for a single-user local tool.
- **Impact:** none in normal use; the gate is there to catch a pipeline that didn't finish, not an
  operator who means it. Worth knowing that "the marker is set" means "something claimed the pass ran".
- **When to revisit:** never, unless this stops being a local single-user tool.

### Numerals are auto-filled by a model, so the counter needs a human eye

- **What:** `findUnreadableNumbers` (`src/cards/spokenNumbers.js`) checks two things — the spoken text
  handed to TTS, and the romaji the learner reads — and the REVIEW gate holds a lesson back until both
  are clean, with `prepare` warning earlier still. The `audio` stage keeps the same check as a backstop,
  because the review gate exempts an already-reviewed lesson and something has to cover one signed off
  before the check existed. What none of it does is produce the reading — that still comes from the
  extraction prompt asking the model for one.
- **Why:** detecting the fault needs no judgement (a digit in Japanese spoken text is always wrong),
  but writing the reading does: 4がつ is しがつ, not よんがつ, and 1998ねん is
  せんきゅうひゃくきゅうじゅうはちねん. Guessing it in code would produce confidently wrong audio,
  which is worse than refusing.
- **Impact:** the failure mode changes from "seven clips silently read in English, discovered by
  listening" to "the audio stage stops and names the cards". Someone still has to supply each reading
  by hand. Scoped by language via the TTS text transforms, so Spanish `2000 euros` is untouched.
- **Update:** that pass now exists (`src/cards/numberReadings.js`). `prepare` fills both fields and
  marks every card it touches `uncertain` with a reviewNote, so the fix is proposed rather than
  slipped in. What still needs a human is the COUNTER: 4がつ is しがつ, 9じ is くじ, 1ぷん is いっぷん,
  and a plausible-but-wrong reading gets spoken aloud confidently. The `uncertain` badge is the whole
  safeguard there.
- **When to revisit:** if a wrong counter ever ships. A check against a table of known irregular
  counter readings would catch the common ones deterministically, leaving the model only the cases a
  table cannot cover.

### A stale clip is detected by filename, which only works for clips the stage generated

- **What:** the `audio` stage now treats a card's clip as current only if its filename still matches
  the hash of the card's spoken text — so editing a `reading` and re-running regenerates just that
  card. But it only applies the test to a bare `<hash>.mp3`. A `-gen-` / `-genkanji-` variant picked in
  the dashboard, or a Replace upload, is never considered stale.
- **Why:** those are deliberate human choices. An earlier version of this check compared every clip and
  would have regenerated over 57 hand-picked takes across this repo's own book — destroying real work
  to fix a cosmetic mismatch.
- **Impact:** edit the text of a card whose audio you hand-picked, and the clip silently stays as it
  was. That is the right default, but it is silent: nothing tells you the picked clip no longer matches
  the card.
- **When to revisit:** if that bites. The fix is to report it — "this card's chosen clip predates its
  current text" at the audio review — rather than to regenerate it.

## Clips generated before originals were kept can never get one back

- **What:** the trailing-silence trim used to run inside `fetchElevenLabsTts`, so the raw take was
  discarded before it ever reached disk. Every clip cached or copied before that changed exists only in
  its trimmed form. Those cards have no `audioOriginal`, the review has nothing longer to show beside
  the shipping clip, and a hand trim can only cut further in — never back out past what the algorithm
  already removed. The absence of a `.orig.mp3` sibling is what marks them.
- **Why:** the alternative was to refetch on a missing original, which spends ElevenLabs credits on
  every affected card AND re-rolls a non-deterministic voice — so cards the reviewer already approved
  would come back sounding different. Silently changing approved audio to backfill a file is worse than
  leaving the gap visible.
- **Impact:** on an existing deck, the over-trim failure mode stays unfixable until those cards are
  regenerated. Regenerating is a deliberate, explicit act: `rm -rf .anki-builder/audio` and re-run the
  `audio` stage, accepting the credit cost and the changed takes. Replace and Generate also mint a real
  original for a single card, which is the cheap per-card escape hatch.
- **When to revisit:** not really revisitable — the bytes are gone. If it ever matters at scale, the
  fix is a one-off backfill script the owner runs knowingly, not automatic recovery.

## Every clip is stored twice

- **What:** the cache and each run's `audio/` now hold both `<hash>.orig.mp3` and `<hash>.mp3`. The
  original is written even when the trim changed nothing, so the two files can be byte-identical.
- **Why:** an always-present sibling is what makes its ABSENCE mean exactly one thing ("this clip
  predates originals"). Writing it conditionally would conflate "the trim was a no-op" with "there is no
  original", and the review would have no way to tell a reviewer which one they're looking at.
- **Impact:** roughly 2x audio disk in `.anki-builder/audio` and in every run dir. A clip is tens of KB,
  so a large book is single-digit MB either way — but it does double, and the cache is not pruned.
  Only the shipping clip is embedded in the `.apkg`; originals never reach the deck.
- **When to revisit:** if the local library ever gets large enough to matter, prune `.orig.mp3` files
  for lessons already marked done — they're only needed while a lesson is still being reviewed.

## Regenerating never overwrites a hand-picked clip, even when the card's text changed

- **What:** the `audio` stage writes its results back only for cards whose current clip is one it owns
  (a bare `<hash>.mp3`). A card pointing at a Replace upload, a `-gen-` pick or a `-manual-` hand cut is
  skipped entirely, so editing such a card's `reading` and re-running `audio` leaves its audio saying
  the old text.
- **Why:** the opposite default is worse. Regenerating over a clip the reviewer deliberately chose
  silently destroys their work, and they'd have no signal it happened; a clip that lags a text edit is
  at least audible when they play it. This also matches `clipIsCurrent`, which has always exempted
  hand-picked clips from the staleness check on the read side — the write side now agrees.
- **Impact:** after editing the text of a card whose audio was hand-picked or hand-trimmed, the clip has
  to be re-made explicitly (Generate, or Replace) — re-running the stage won't do it.
- **When to revisit:** if this bites, the fix is a dashboard warning on a card whose hand-picked clip no
  longer matches its text, not a change to the overwrite rule.

## The manual trim needs ffmpeg, and unlike every other trim it fails loudly

- **What:** `src/audio/trimToRange.js` throws when ffmpeg is missing or the cut fails, and the endpoint
  answers 422 with the reason. Its sibling `trimTrailingSilence` does the opposite — no ffmpeg, or any
  error, silently returns the input unchanged.
- **Why:** the automatic trim runs unattended during a build, where breaking the whole audio stage over
  a cosmetic nicety would be worse than skipping it. A manual trim is the opposite situation: a reviewer
  has dragged a selection and pressed Apply. A silent no-op tells them their edit landed when the card
  still holds the untrimmed clip, and they'd go on to sign the lesson off believing it was fixed.
- **Impact:** on a machine with no ffmpeg the audio build still works (untrimmed), but the Trim button
  reports an error every time instead of degrading. That's deliberate, though it does mean ffmpeg is a
  real requirement for the trim editor rather than an optional nicety.
- **When to revisit:** only if a pure-JS mp3 cutter ever becomes worth the dependency — the ffmpeg
  dependency is shared with the automatic trim either way.

## A hand-cut clip is kept forever, and the range can outlive the audio it described

- **What:** reverting a manual trim clears `audioManual`/`audioTrim` but leaves the cut `.mp3` on disk.
  Separately, `audioTrim` is only cleared by the writers that install a NEW recording (the audio stage,
  Replace, Generate-pick) — nothing re-validates that a saved range still fits its original.
- **Why:** keeping the file means an accidental revert is undone by re-applying the same range rather
  than re-cutting audio the reviewer already approved, and the file is tens of KB and never reaches the
  deck. The range is bounded on load (clamped to the decoded duration, and reset to the full clip if it
  comes out shorter than the minimum), so a stale one degrades to "the whole clip" rather than an error.
- **Impact:** a run dir accumulates one orphaned `-manual-` file per reverted trim. Negligible per
  lesson; unbounded in principle if someone trims and reverts repeatedly.
- **When to revisit:** if run dirs get noticeably cluttered, sweep `-manual-` files no card references
  when a lesson is marked done.

## Backfilling originals can't just re-run the `audio` stage

- **What:** giving already-built cards an `audioOriginal` needed a dedicated one-off script, not
  `rm -rf .anki-builder/audio` plus a re-run of `audio`. (That script has since been removed: every
  card on disk now has an original. Kept here because the reasoning still applies if it recurs.) Two things defeat the obvious route:
  `alreadyDone` checks the RUN DIR rather than the cache, so with every clip still sitting there the
  stage reports "already generated — reusing" and does nothing; and the stage's copy loop is
  `if (!existsSync(dest))`, so even forced past that it would leave the run dir's OLD trimmed clip in
  place while adding a NEW `.orig.mp3` from a different generation — a mismatched pair where the
  review's Original column plays a different recording than In use.
- **Why:** both behaviours are right for the stage itself (don't re-spend credits on work already done;
  don't clobber files that are already correct). They're simply wrong for a backfill, which has to
  replace a card's two takes *together* so they always come from one recording.
- **Impact:** the backfill is a separate, explicitly-invoked tool. It's dry by default, skips
  hand-picked clips (a `-gen-` pick or Replace upload — regenerating those would discard the reviewer's
  work), and costs one call per unique spoken term.
- **When to revisit:** if the stage ever grows a `--force` flag, make sure it replaces both takes
  together rather than only the missing one.

## Noise cleanup is tuned to one voice family, and the corner frequency is the risk

- **What:** the cleanup chains cut everything below 110–130 Hz. That is safe for the Japanese voices
  this project ships, whose fundamental sits comfortably above it, and it is where ~94% of the
  measured noise energy lives. A deeper voice — a male speaker, or another language — could have
  fundamental energy inside the stop band, and the filter would thin it.
- **Why:** the noise is genuinely low-frequency, so a low-cut is the surgical fix; a spectral denoiser
  alone bought only 1–2 dB where the low-cut gives 12+. Picking a corner necessarily means picking a
  voice range.
- **Impact:** the `aggressive` chain (130 Hz) already shows this — measured across 14 clips it costs up
  to 5.7 dB of voice peak on the lowest-pitched ones, which is why it is NOT the default despite the
  name. Adding a low-voiced language without re-tuning would degrade its audio.
- **When to revisit:** when a non-Japanese voice is added. The fix is a per-language corner frequency
  rather than the single global set; `ANKI_BUILDER_AUDIO_CLEANUP` and the per-card picker are the
  stopgaps until then.

## A few clips are barely improved by any chain, because their noise isn't low-frequency

- **What:** in the measurement sweep, one clip (`ア`) improved by only 2–6 dB under every chain while
  its neighbours improved by 30–46 dB.
- **Why:** the chains target sub-100 Hz rumble, which is what the noise turned out to be on almost
  every clip. A clip whose noise sits higher up the spectrum is out of their reach, and the broadband
  denoisers that would catch it (`afftdn`, `anlmdn`) measurably risk smearing consonants.
- **Impact:** a small number of cards stay noisier than the rest. They are audible outliers rather
  than a systemic problem.
- **When to revisit:** if these become annoying, `arnndn` (RNN speech denoiser) is the next step up in
  ffmpeg — but it needs a third-party model file committed to the repo, which is a supply-chain
  decision rather than a purely technical one.

## The review row carries editor state in data-* attributes, and every writer must keep it current

- **What:** the audio editor reads its source clip, saved trim range and cleanup chain straight off the
  `<tr>` (`data-original-url`, `data-trim-start/end`, `data-filter`) so opening the modal costs no
  extra request. The cost is that EVERY write which changes a card's audio has to refresh those
  attributes, or the editor silently operates on the previous recording.
- **Why:** the alternative is a fetch per modal open. For a lesson of a hundred rows that is a hundred
  potential round trips to avoid one class of staleness bug; server-rendered attributes match how the
  rest of this dashboard works (card id, unit, stage are all carried the same way).
- **Impact:** a new write path that forgets `refreshRow` reintroduces the bug, and it is invisible
  until someone opens the editor after a Replace. It has already happened once: adding the second
  audio column silently broke `swap`, because `td.au` began matching the Original column first.
- **When to revisit:** if a third write path appears, fold the refresh into a single helper both the
  server response shape and the client agree on, rather than remembering to call it.

## The Japanese end marker is tuned to one voice, and both its guards are empirical

- **What:** `ででで` is appended to Japanese TTS text and cut back off before the clip ships. Removing it
  relies on two thresholds derived from 12 generated clips of a single voice: the position rule (last
  segment, ≤1.0s, behind a ≥0.3s gap) and the pulse-shape veto (2–4 pulses, with a hysteresis/smoothing
  set found by grid search). Neither is a principled constant.
- **Why:** the alternative is trusting the position rule alone, which has no way to tell a marker from a
  short final word after a pause. The shape veto is what makes the failure mode safe. But "what a
  repeated syllable looks like" genuinely depends on the voice's articulation and pacing, so the numbers
  had to come from measurement rather than theory.
- **Impact:** a different Japanese voice — or a change to ElevenLabs' model — could move the pulse shape
  enough that the veto starts refusing valid markers. That failure is loud (a stray ででで is audible,
  and it also defeats the trim so the clip keeps all its silence) rather than silent, which is the
  direction it was designed to fail in. The dangerous direction, cutting real speech, needs BOTH guards
  to be wrong at once.
- **When to revisit:** on any voice or TTS-model change. Re-derive the parameters against a fresh sample
  rather than assuming they carry over; the grid-search approach is quick to repeat.

## Which window is the end marker is decided by pulse count, because no gap threshold works

- **What:** `markerCandidates` returns up to three trailing windows (longest first) instead of one
  answer, and the pulse-shape check picks the first that passes. A lone trailing segment still needs
  the original 0.3s standing-apart gap; extending a run needs only 0.15s, and a run is capped at three
  segments.
- **Why:** the gaps genuinely don't separate the cases. On `ら` the pause opening the marker is 0.25s
  while the `で` sit ~0.9s apart; on `あれはわにです` it is 1.09s and the `で` sit ~0.28s apart. A single
  threshold has to read ~0.28s as "inside the marker" on one clip and "marker starts here" on the
  other. Shape can tell them apart — a window that has swallowed a real word reads as 5 pulses rather
  than 2–4 — so selection moved there, and position was demoted to proposing candidates.
- **Impact:** the veto is no longer a pure safety net; it now chooses, so a mis-selection cuts a real
  word rather than merely leaving a marker audible. That is not hypothetical — it shipped and had to be
  fixed. Preferring the LONGEST passing window over-cut 3 of lesson-3's 89 clips: はいいろの came back as
  just "はい" because the voice paused 0.56s mid-word and `いろの` looked like another `で`. Per-segment
  pulse count does NOT separate the two (a real segment and a single `で` both read as 1 pulse); WIDTH
  does, so a segment joined to a run is now capped at 0.35s. Residual risk is a real final word that is
  BOTH syllable-width and behind a gap. Costs up to three ffmpeg decodes per clip instead of one.
  Re-measured over all 89: marker stripped on 89, speech intact on 89.
- **Watch for:** verifying a trim by trailing silence and total-cut alone will NOT catch over-cutting —
  that check passed all 89 while three were truncated. Compare retained speech against the target's
  mora count (~0.13s/mora is a safe floor) instead.
- **When to revisit:** if a marker ever renders as four or more segments, or a voice change moves the
  pulse shape. Note the fix applies to future renders only — the audio cache keys on
  `(voice, model, text)` and encodes nothing about processing. To repair existing decks WITHOUT
  respending credits, run `scripts/clean-audio.mjs --apply --force`, which re-derives the shipping take
  from each card's kept `.orig.mp3`; dropping the cache and re-running `audio` refetches instead.

## Provenance moved to the original's filename, and the old test failed silently

- **What:** `isStageOwnedCard` decides whether the audio stage may regenerate a card. It reads the
  ORIGINAL's name, because the shipping clip's name encodes the processing applied and changes whenever
  that processing does.
- **Why:** the previous test asked `isDefaultClipFilename(item.audio)`. When the cleanup sweep renamed
  every shipping clip to `<hash>.standard.mp3`, that test began answering "hand-picked" for all 1179
  cards — so the stage considered every clip current and would never have regenerated one after a text
  edit. Nothing failed; it just quietly stopped working, and was only caught because a backfill dry run
  reported an implausible zero.
- **Impact:** any future naming change to derived clips must not touch `<hash>.orig.mp3`, or the same
  class of silent failure returns.
- **When to revisit:** if derived-clip naming changes again, add a test asserting a stage card is still
  recognised after the rename — the existing ones now cover exactly that case.

## The cross-lesson pass now writes `hint`, and nothing detects a gloss collision it misses

- **What:** `enhanceLessonNotes` used to own `note` only, leaving `hint` entirely to extraction. It now
  writes `hint` as well, but only when the model chooses to return one. There is no programmatic check
  that every same-gloss pair in a deck actually ended up with hints on both sides.
- **Why:** a gloss collision (two cards reachable from one English prompt with different answers) is
  structurally invisible to the extraction, which sees a single chapter at a time. The cross-lesson pass
  is the only one fed the whole book, so it is the only place the pair can be seen at all. Making it
  return `hint` was a much smaller change than teaching a second pass to read every lesson.
- **Impact:** collision coverage is model judgment, not a gate. A pair the model doesn't notice ships
  as two identical-looking cards, and the learner discovers it by failing one. The collisions fixed by
  hand in the JBP Book 1 deck were found with an ad-hoc script that groups every card by normalized
  `english` and by `target` and reports any group with more than one distinct answer — that grouping is
  cheap and deterministic, and would make a good `audit` check if this recurs.
- **When to revisit:** if a review turns up same-gloss pairs the pass left unhinted, promote the
  grouping script into `src/audit/` and fail the readiness check on an unhinted collision.

## `hint` is now written by two passes, and the second one wins

- **What:** extraction sets `hint` from the source's contextual parentheticals; the cross-lesson pass
  can now overwrite it. An omitted `hint` in the model's response leaves the existing value alone, and
  only an explicit `""` clears it, so the common case is safe — but a returned hint silently replaces a
  hand-written one.
- **Why:** the alternative, never letting the later pass touch an existing hint, would have made it
  impossible to fix a hint that is wrong precisely because extraction couldn't see the colliding card.
- **Impact:** a hint edited by hand between `prepare` and review can be overwritten by a re-run of the
  pass. `<file>.pre-enhance.bak` is the recovery path, and a lesson already marked `reviewed` is skipped
  entirely, so this only bites in the pre-review window.
- **When to revisit:** if hand-edited hints start getting clobbered in practice, add a `hintLocked`
  flag (or reuse the reviewed marker at card granularity) rather than reverting the capability.

## A card id is unique per DECK, not per lesson, and nothing said so until it broke

- **What:** `syncDeckContent` now calls `assertUniqueCardIds` and throws rather than delivering a deck
  whose card ids repeat across units.
- **Why:** the durable note key is the `abid:<card.id>` tag, and it is looked up in one deck-wide map.
  Two lessons naming a card the same thing therefore resolved to a single Anki note, which the loop
  updated twice, last write winning. JBP Book 1 carried ten such pairs from the day delivery shipped:
  seven were one word taught in two lessons (おはようございます, あした, きょう, あさごはん, ばんごはん),
  and three were genuinely different cards that collided (`yasumi` = "break" and "vacation",
  `to-particle` = "and" and "with", `ni-particle` = direction and time). For those three the learner
  studied one sense and never saw the other, including the cross-lesson notes written to distinguish
  them. Nothing failed; the counters just reported one update instead of two.
- **Impact:** id uniqueness is now a delivery precondition, so a deck that has drifted stops the
  delivery rather than losing half a pair. The extraction still assigns ids per chapter with no
  knowledge of its siblings, so a fresh collision is entirely possible; it will surface as a refusal at
  delivery, which is late but at least loud.
- **When to revisit:** if collisions recur often, move the check earlier — a readiness gate or a
  `prepare` post-pass could catch it at build time, when the fix is cheap, instead of at delivery.

## An answer card's context lives in a hint, and the hint is a judgment the model has to make

- **What:** `mineFillInBlankCards` now carries `hint` through (it silently dropped it before) and logs a
  warning naming any produced card whose English is answer-shaped and has no hint. The prompt requires
  the hint on every answer half of a split Q/A pair, and requires the `english` to render whatever topic
  the `target` states.
- **Why:** rule 3 has always told the pass to split "When is the presentation? — It's at 3:00 today."
  into two cards. Nothing said the answer card had to remain answerable once separated. In JBP Book 1
  that produced eleven answer cards with no trace of their question, and one, `パーティーはごじです`
  glossed "It's at 5:00.", where the English could not have produced the target at all.
- **Impact:** the warning is a log line at build time, not a gate, and it only recognizes a leading
  pronoun stand-in ("It's", "That's", "They're"). An answer phrased any other way ("From 12:30 to
  1:30.") passes unremarked. The deeper check — does this English produce this target — is not
  automatable here and stays a review-gate judgment.
- **When to revisit:** if un-hinted answer cards keep appearing, promote the warning to a readiness
  check, and consider having the pass return the question card's id alongside the answer so the link is
  data rather than prose.

## An extras unit is keyed by folder-name suffix, not by a first-class unit type

- **What:** a chapter's drill unit is a sibling folder suffixed `-extras` (`chapter-5-extras/`), and
  everything that enumerates units recognizes it by that suffix: `BOOK_UNIT_DIR_PATTERN` in
  `src/deck/rebuild.js`, the folder regex in `scanNumberedUnits`, and the `UNIT_PATTERN` whitelist in
  the book/course server adapters. Its dashboard unit key is the suffix verbatim (`"5-extras"`), a
  string where a base lesson's is a number.
- **Why:** the alternative was a real unit-type field plus a seq allocator that could mint distinct
  numbers for two units of the same chapter. That is a much wider change (allocation, claims, the
  media key, every URL) for a distinction the filesystem already expresses unambiguously. The suffix
  keeps `unitDir` a straight `${prefix}-${seq}` join, so no path assembly changed anywhere.
- **Impact:** three regexes now have to agree, and they are in three files. A fourth place that
  enumerates units and is written to expect only digits will silently skip extras units rather than
  fail loudly. The mixed number/string `seq` also means any new sort over units must not do
  `a.seq - b.seq` (NaN); sort on `number` then the `extras` flag, as `scanNumberedUnits` does. The
  unit-token regex is also the path-traversal guard, so it must stay an anchored whitelist.
- **When to revisit:** if a third kind of unit appears (a review unit, a listening unit), promote it
  to a real unit type with its own allocator rather than adding a second suffix. Two suffixes in these
  regexes would be the point where this stops paying for itself.

## The extras pass can't see later chapters, so cross-chapter duplicates are caught after the fact

- **What:** the Step 3b extras pass runs one agent per chapter, fed that chapter plus every EARLIER
  one. It therefore cannot know what a LATER chapter already teaches, and will happily propose a card
  for a word Lesson 8 has covered while working on Lesson 3.
- **Why:** the backward-only context is deliberate and load-bearing everywhere else in the pipeline
  (it is what makes a forward reference structurally impossible rather than merely discouraged).
  Giving the extras pass full-book context to solve duplicates would reintroduce exactly the failure
  mode the rest of the design works to prevent.
- **Impact:** duplicates are real and must be swept up by a separate whole-book pass after the merge
  (group every card by `target`; keep the earliest, exclude the later). On the first run across eight
  chapters this caught 7 duplicate groups. If that sweep is skipped, the deck ships two cards with
  the same answer and the learner meets both.
- **When to revisit:** if the sweep is ever forgotten in practice, fold it into a command rather than
  leaving it as a documented step, the same way the old loose `node scripts/…` content passes became
  `prepare`.

## A deck that holds cards is never given children

- **What:** units that belong together (a lesson and its extras drills) nest under a **grouping deck**
  that holds no cards of its own — `Book::Lesson 5::Shopping (2)…` beside
  `Book::Lesson 5::Shopping (2)… (Extras)`. A deck containing cards is never made a parent.
  `src/deck/deckPath.js` derives every unit's path, for the `.apkg` and AnkiConnect alike.
- **Why:** Anki studies a parent deck together with every deck beneath it, so a card-holding parent
  cannot be studied on its own. This was learned twice. First the drills were nested under the LESSON
  deck, which made the lesson unstudyable alone. Then they were flattened to siblings, which fixed
  that but produced an unreadable wall of long names and lost the ability to study a lesson and its
  drills together. The grouping deck gives all three modes because it holds nothing.
- **Impact:** the tree is derived from a label convention (`"Lesson N: Title"`) by regex in
  `unitDeckSegments`, so a book whose TOC labels its units differently gets no grouping and falls back
  to one flat level. That is a silent degradation, not an error. Renaming a base lesson also re-groups
  it, orphaning its extras under the old group name until both are renamed together.
- **When to revisit:** if a second book's labels don't match the convention, replace the regex with an
  explicit `meta.deckGroup` field rather than widening the pattern.

## The forward-flag pass judges from a compact index, not the later chapters' full text

- **What:** `flagForwardConcerns` no longer has the model re-read every later chapter on each
  assemble. A one-time whole-book pass (`src/corpus/epubTaughtIndex.js`) records what each chapter
  introduces into `taught-index.json` under the book's hash dir, and the per-lesson forward call
  hands the model that index instead. The legacy read-everything path survives only as the fallback
  when the index cannot be built.
- **Why:** the old shape was O(n squared) over a book's build: an early lesson of this 57-file book
  asked one model call to read roughly 50 files (about 1.9 MB), and that repeated for every lesson.
  The conventions pass had already proven the read-once-cache-forever shape.
- **Impact:** flag quality now depends on the index's fidelity. A subtle re-teaching the index pass
  summarized away is invisible to the per-lesson call, where the old path could in principle have
  caught it by re-reading the chapter. Coverage is verified mechanically (every spine chapter must
  appear or the index is rejected), but entry quality is not. The index is keyed by content hash, so
  a changed EPUB re-indexes; a hand-edited index is trusted as-is.
- **When to revisit:** if premature items start slipping through the corpus review unflagged, spot
  check the index's entries for the chapters involved; the fix is regenerating (delete the file) or
  hand-editing the index, not reverting to the O(n squared) reads.

## Lesson classification and the final nav entry's range are convention-bound

- **What:** two next-book assumptions live in the lesson-selection layer. `classifyLesson`
  (`src/corpus/epubLessons.js`) recognizes unit/lesson/quiz/front-matter by English regexes
  (`^unit`, `^lesson`, `quiz|review|test`), so a TOC titled in another language (a Japanese-published
  book's TOC, or any non-English textbook) classifies every entry as `other`. And the last nav
  entry's spine range extends to the end of the spine (`listExternalChapters`,
  `src/corpus/epubArchive.js`), so a book whose nav omits back matter folds glossary/index files
  into the final lesson's extraction range.
- **Why:** both are deliberate simplicity for the one book actually being built. Classification is
  cosmetic (a `(type)` tag in `--list-lessons` output), and this book's nav covers its back matter,
  so neither assumption has bitten.
- **Impact:** on a mismatched next book, `--list-lessons` mislabels entry types (selection by number
  or label still works), and the final lesson of a nav-truncated book would extract with appended
  back matter, inflating that one corpus.
- **When to revisit:** at the second real book. Fix classification against that book's actual TOC
  conventions (or drop the type tag), and bound the final entry's range by the nav's own last
  covered file rather than the spine end.

## The current book's .apkg guids are bare card ids, unprotected across books

- **What:** `.apkg` note guids are the semantic card slugs (`konnichiwa`), and Anki matches guids
  COLLECTION-wide on import. Books and courses created after guid namespacing landed carry a
  `guidNamespace` in their dir marker and ship `<namespace>/<card.id>` guids; the JFBP Book 1 deck
  (and any other pre-namespace dir) keeps bare guids forever.
- **Why:** rewriting an existing book's guids would make every one of its notes look new on the
  next import, orphaning the live collection's scheduling. The cutover is therefore
  creation-time-only, recorded once in the dir marker and never changed.
- **Impact:** if a second Japanese book ever ships a card whose id collides with a JFBP one
  (`konnichiwa` is likely), importing the second book's `.apkg` into the same collection would
  overwrite the JFBP note. The AnkiConnect deliver path is deck-scoped (`abid:` tags) and safe.
- **When to revisit:** before importing a second book's `.apkg` into the live collection, check for
  id overlaps with the JFBP deck (the deliver path's duplicate-id guard shows the shape of the
  check). New books are protected automatically.

## No un-done control in the dashboard (clearing meta.done is a hand edit)

- **What:** the review UI can mark a lesson done but offers nothing to clear the flag. The old
  Reopen button was removed when done lessons became fully editable, and no replacement was added.
  `setLessonDone(runDir, false)` still exists in `applyCards.js` as the programmatic path; the only
  user-facing route is editing the lesson's `cards.json` by hand.
- **Why:** deliberate. Reopen existed only to unlock editing, and that job is gone: done gates
  delivery and `.apkg` inclusion, not the tools. Pulling a finished lesson back out of the shipping
  deck is rare enough that a button for it would mostly invite accidental unshipping.
- **Impact:** removing a lesson from the shippable deck means deleting `meta.done` from its
  `cards.json` and rebuilding (any dashboard edit, or `/api/deck/:type/:id/rebuild`, triggers it).
- **When to revisit:** if un-shipping a lesson turns out to happen with any regularity, add a small
  guarded control (confirm dialog) rather than resurrecting the old read-only flow.

## Scene cues on ambiguous single-word cards partially reveal the answer (by design)

- **What:** the `Scene` field renders on the front of BOTH card directions. For sentence cards a
  scene names the question just asked and reveals nothing. For an ambiguous single-word card
  (に "2" vs the direction particle, ほん "Book" vs the counter), any cue that disambiguates the
  Recognition front necessarily points partway at the answer ("counting, not the particle").
  Three degenerate pairs were left with no scene at all because no non-revealing wording exists and
  their glosses barely differ: です ("To be" vs "Is / am / are"), ばん ("Evening" vs the number
  suffix), and ばんごはん ("Dinner" twice).
- **Why:** an answerable-but-easier card beats an unanswerable one; the Production direction keeps
  full rigor because definitional hints stay off the Recognition front (they show on its back).
- **Impact:** a handful of Recognition cards are softer tests than a purist would like, and the
  three skipped pairs still show identical Recognition fronts with different expected answers.
- **When to revisit:** if the です / ばん / ばんごはん pairs cause real study friction, merge each
  pair into one card with a combined gloss instead of inventing a leaky scene. The migration's
  pre-change state is in `*.pre-scene.bak` beside every `cards.json` / `corpus.json`.

## TTS fetch pool is pinned to the ElevenLabs plan's concurrency cap

- **What:** `CONCURRENT_TTS_FETCHES` in `src/audio/index.js` is a hardcoded 3, matching the
  current ElevenLabs subscription's 3-concurrent-request limit. The pool was 4, and the 4th
  in-flight request drew a hard 429 that aborted every `audio` run.
- **Why:** the API rejects (not queues) requests over the plan cap, and the audio stage treats the
  first fetch failure as fatal by design, so the pool must sit at or under the plan limit.
- **Impact:** audio generation walks a lesson slightly slower than it could on a bigger plan, and
  the constant silently under-uses a plan upgrade.
- **When to revisit:** if the ElevenLabs plan changes, update the constant to the new concurrency
  limit (or make it an env knob if plans start changing often).

## The collision audit judges cues per FACE, so a hint no longer passes a target group

- **What:** `findCollisions` used to accept a `hint` OR a `scene` for both collision faces. A hint
  renders on the Production front only (on a Recognition card it is part of the answer and shows on
  the back), so target-face groups were passing the audit while still being unanswerable. It now
  demands a `scene` for target groups; English-gloss groups still accept either cue.
- **Why:** the audit's whole purpose is "can a learner answer this card", and that question has a
  different answer per direction. A single permissive check made the audit report a clean deck that
  was not clean.
- **Impact:** the stricter rule surfaces pre-existing target collisions that previously read as
  "hint ok", so a book audited before this change can newly report work to do (it found one on the
  first run here). Exit code 2 now fires on cases that used to exit 0.
- **When to revisit:** if the card templates ever change which fields render on which front, this
  per-face rule has to move with them, since it encodes the template layout in a script.

## Anki deck names carry a zero-padded lesson number

- **What:** `unitDeckSegments` pads a label's lesson number to two digits when deriving the Anki
  deck name (`Lesson 9: Title` -> deck `Lesson 09::Title`). The unit's label is untouched
  everywhere else, so `cards.json`, the dashboard and the card faces still read "Lesson 9".
- **Why:** Anki sorts sibling decks as text, with no natural-number sort and no manual ordering, so
  an unpadded deck list runs 1, 10, 11, 2, 3. Padding is the only lever available.
- **Impact:** two digits caps a book at 99 lessons before the sort breaks again, and the deck list
  reads "Lesson 01" where the book says "Lesson 1". Any collection created before this change needs
  the one-shot `scripts/migrate-deck-numbering.mjs` (create + changeDeck + delete the empty
  original, since AnkiConnect has no rename action), or delivery will file new cards in the padded
  deck while old cards sit in the unpadded one.
- **When to revisit:** if a book ever exceeds 99 lessons, or if Anki gains a natural sort, in which
  case the padding can be dropped and migrated the same way.

## Un-shipping a unit changes the package, never the live Anki collection

- **What:** `scripts/undone-unit.mjs` backs up `cards.json`, clears `meta.done` and rebuilds the
  collection package. It does not talk to Anki, so notes already delivered stay in the live
  collection with their scheduling; the unit simply stops being in the next package.
- **Why:** removing delivered notes is a destructive, unrecoverable act on a deck the user studies
  daily, and it is a different decision from "this unit is not finished after all". `deliver-to-anki`
  already reports orphans and refuses to delete them, for the same reason.
- **Impact:** after un-shipping a delivered unit, its cards keep coming up in study until someone
  removes them in Anki by hand. The script requires `--force` on a collection carrying
  `anki-delivered.json` so the gap is stated at the moment it matters, not discovered later.
- **Status:** open
- **When to revisit:** if un-shipping delivered units becomes common, give the deliverer an opt-in
  `--suspend-orphans` (already specified for the exclusion case) and point this script at it.

## The review watcher polls; it does not subscribe

- **What:** `scripts/await-review.mjs` re-reads `cards.json` every 15 seconds rather than watching
  the file. Its resolution is therefore one poll interval, and a sign-off during a long `--interval`
  is noticed late.
- **Why:** `fs.watch` semantics differ per platform and miss atomic-rename publishes on some of
  them — and every writer here publishes by rename. A poll cannot miss an event it can re-derive
  from the file's current contents.
- **Impact:** up to `--interval` of latency after a click, and one `stat` + `JSON.parse` per poll on
  a file of a few hundred KB. Negligible next to a human clicking a button.
- **Status:** open
- **When to revisit:** only if a watcher is ever needed for something with a real latency budget.

## `finalize-extras` bakes the extras tail's ORDER into code, but not its steps

- **What:** `src/cards/finalizeExtras.js` names six commands and the order to run them in. It spawns
  each as a child process and prints its output, rather than calling the underlying functions.
- **Why:** the reports are the product. Each of those tools already prints something a human has to
  read and judge, and re-implementing that reporting in a chainer would fork it — the drift this
  project keeps paying for. Spawning keeps exactly one implementation of each step.
- **Impact:** a step's output cannot be inspected programmatically (the chain only sees exit codes),
  and adding a step means editing the plan as well as writing the tool. The plan is unit tested for
  order and for the absence of `--apply`, so the part that has actually gone wrong in production is
  the part that is pinned.
- **Status:** open
- **When to revisit:** if a step ever needs a decision made FROM another step's findings, that step
  belongs in `src/` behind a function, not in the chain.
