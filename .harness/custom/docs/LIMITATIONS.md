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
  romanizationLibraries.js`), `pronunciation` now comes from a real deterministic library,
  Haiku-evaluated (`src/translate/romanizationEval.js`) — see the next entry. For a language with
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

## Lesson word-list categorization is a single unverified Haiku pass, unlike EPUB extraction

- **What:** `assembleCorpusFromLessonWords` assigns each item's `category` via one batched Haiku
  call with no evaluation/verification step — contrast with the library-first romanization
  pipeline's Haiku-eval-over-a-library's-output pattern, or the EPUB path's two dedicated dedup
  passes. A wrong category here has no automated check at all; it silently ships as whatever the
  model returned (or `"Other"` on a parse failure).
- **Why:** category assignment for a already-curated, user-dictated word list is a much lower-
  stakes judgment call than translation correctness or romanization accuracy — the corpus review
  gate (`render-review --stage corpus`, the same gate every other source goes through) is a cheap,
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
  Haiku-eval-style second pass.
