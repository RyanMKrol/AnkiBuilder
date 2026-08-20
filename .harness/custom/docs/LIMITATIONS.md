# custom/docs/LIMITATIONS.md — this project's trade-offs & limitations log

Customization overlay for `.harness/docs/LIMITATIONS.md`. **This is where your project's own
limitation/trade-off rows go** (golden rule 5): when a change introduces a trade-off, bottleneck, or known
limitation, add a row **here** — not in the pristine `docs/LIMITATIONS.md`, which is plugin-owned and
refreshed on upgrade. Harness upgrades never touch this file. (See `.harness/custom/CLAUDE.md`.)

Each row: what it is, *why* it was chosen, its **impact**, **status**, and *when to revisit*.

**Every entry carries a `**Status:**` line** — `open`, `resolved <what resolved it>`, or
`superseded by <entry>`. Without it an entry has no way to stop being true, and this file is long
enough that a resolved limitation reads exactly like a live one. Fix the status in the same commit
that changes the situation.

**An entry that asserts a fact about live data also carries `**Verified by:** <command>`** — the
command that re-derives the claim — instead of freezing a count in prose. Counts rot: three entries
here were measurably false when this convention was introduced, and a false limitation is worse than
a missing one, because it closes a question that is still open. If no command can re-derive a claim,
say when it was measured rather than stating it as a standing fact.

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
- **Status:** open
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
- **Status:** open
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
- **Status:** resolved by the unit-scoped review (`/review/:type/:id/:unit`), described in this entry

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
- **Status:** open
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
- **Status:** open
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
- **Status:** open
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
- **Status:** open
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
- **Status:** open
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
- **Status:** open
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
- **Status:** open
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
- **Status:** open
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
- **Status:** open
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
- **Status:** open
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
- **Status:** open
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
- **Status:** open
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
  `arabic-transliterate` (Arabic). **The Arabic and Hebrew adapters are no longer wired into
  `ROMANIZATION_LIBRARIES`** — their packages stay installed and their adapters and tests stay
  accurate about what those packages do, but neither language reaches them any more; see "Only
  ja / zh / ko have a proven romanization path" below. The Japanese case is the one genuinely costly dependency:
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
- **Status:** open
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
- **Status:** open
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
- **Status:** open
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
- **Status:** open
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
- **Status:** open
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
- **Status:** open
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
- **Status:** open
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
- **Status:** open
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
- **Status:** open
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
- **Status:** open
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
- **Status:** open
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
- **Status:** open
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
- **Status:** open
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
- **Status:** open
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
- **Status:** open
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
- **Status:** open
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
- **Status:** open
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
- **Status:** open
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
- **Status:** open
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
- **Status:** open
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
- **Status:** open
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
- **Status:** open
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
- **Status:** open
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
- **Status:** open
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
- **Status:** open
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
- **Status:** open
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
- **Status:** open
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
- **Status:** open
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
- **Status:** open
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
- **Status:** open
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
- **Status:** open
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
- **Status:** open
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
- **Status:** open
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
- **Status:** open
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
- **Status:** open
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
- **Status:** open
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
- **Status:** open
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
- **Status:** open
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
- **Status:** open
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
- **Status:** open
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
- **Status:** resolved — every card on disk has an original and the one-off script was deleted; kept because the reasoning applies to any future backfill
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
- **Status:** open
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
- **Status:** open
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
- **Status:** open
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
- **Status:** open
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
- **Status:** open
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
- **Status:** open
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
- **Status:** open
- **Verified by:** `node scripts/extras-collision-audit.mjs <collection-dir>`
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
- **Status:** open
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
- **Status:** open
- **Verified by:** `npm run preflight` (duplicate card ids)
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
- **Status:** open
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
- **Status:** open
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
- **Status:** open
- **Verified by:** `node scripts/extras-duplicate-check.mjs <collection-dir>`
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
- **Status:** open
- **When to revisit:** if a second book's labels don't match the convention, replace the regex with an
  explicit `meta.deckGroup` field rather than widening the pattern.

## The forward-flag pass judges from a compact index, not the later chapters' full text

- **What:** `flagForwardConcerns` no longer has the model re-read every later chapter on each
  assemble. A one-time whole-book pass (`src/corpus/epubTaughtIndex.js`) records what each chapter
  introduces into `taught-index.json` under the book's hash dir, and the per-lesson forward call
  hands the model that index instead. The legacy read-everything path survives as the fallback for a
  book that has no index. Since 2026-08-18 the index is never built by a lesson build: it is built
  only by `anki-builder epub taught-index <hash>`, and a build that finds none says so and falls
  back.
- **Why:** the old shape was O(n squared) over a book's build: an early lesson of this 57-file book
  asked one model call to read roughly 50 files (about 1.9 MB), and that repeated for every lesson.
  The conventions pass had already proven the read-once-cache-forever shape.
- **Impact:** flag quality now depends on the index's fidelity. A subtle re-teaching the index pass
  summarized away is invisible to the per-lesson call, where the old path could in principle have
  caught it by re-reading the chapter. Coverage is verified mechanically (every spine chapter must
  appear or the index is rejected), but entry quality is not. The index is keyed by content hash, so
  a changed EPUB re-indexes; a hand-edited index is trusted as-is.
- **Status:** open
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
- **Status:** open
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
- **Status:** open
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
- **Status:** open — still no UI control; `scripts/undone-unit.mjs` is now the reviewed way to do it outside the dashboard
- **When to revisit:** if un-shipping a lesson turns out to happen with any regularity, add a small
  guarded control (confirm dialog) rather than resurrecting the old read-only flow.

## Scene cues on ambiguous single-word cards partially reveal the answer (by design)

- **What:** the `Scene` field renders on the front of BOTH card directions. For sentence cards a
  scene names the question just asked and reveals nothing. For an ambiguous single-word card
  (に "2" vs the direction particle, ほん "Book" vs the counter), any cue that disambiguates the
  Recognition front necessarily points partway at the answer ("counting, not the particle").
  Three degenerate pairs were left with no scene at all at the time of the scene migration, because
  no non-revealing wording existed and their glosses barely differed: です ("To be" vs
  "Is / am / are"), ばん ("Evening" vs the number suffix), and ばんごはん ("Dinner" twice).
- **Why:** an answerable-but-easier card beats an unanswerable one; the Production direction keeps
  full rigor because definitional hints stay off the Recognition front (they show on its back).
- **Impact:** a handful of Recognition cards are softer tests than a purist would like. **The three
  named pairs are no longer among them** (checked 2026-08-14 against the live deck): the second です
  card (`desu-suffix-ch15`) and the duplicate ばんごはん (`chapter-3-extras`) are both excluded, so
  neither pair exists any more, and both ばん cards now carry a scene ("the time of day" /
  "labelling something by its number"). The general trade-off stands; the examples do not, which is
  why this row now points at a command instead of a count.
- **Status:** open (the design trade-off), with all three cited instances resolved
- **Verified by:** `node scripts/extras-collision-audit.mjs <collection-dir>` — it lists every group
  sharing a gloss or a target and flags members with no cue on the face they collide on
- **When to revisit:** if a future uncued pair causes real study friction, merge it into one card
  with a combined gloss instead of inventing a leaky scene. The scene migration's pre-change state
  is in `*.pre-scene.bak` beside every `cards.json` / `corpus.json`.

## TTS fetch pool is pinned to the ElevenLabs plan's concurrency cap

- **What:** `CONCURRENT_TTS_FETCHES` in `src/audio/index.js` is a hardcoded 3, matching the
  current ElevenLabs subscription's 3-concurrent-request limit. The pool was 4, and the 4th
  in-flight request drew a hard 429 that aborted every `audio` run.
- **Why:** the API rejects (not queues) requests over the plan cap, and the audio stage treats the
  first fetch failure as fatal by design, so the pool must sit at or under the plan limit.
- **Impact:** audio generation walks a lesson slightly slower than it could on a bigger plan, and
  the constant silently under-uses a plan upgrade.
- **Status:** open
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
- **Status:** open
- **Verified by:** `node scripts/extras-collision-audit.mjs <collection-dir>`
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
- **Status:** open
- **When to revisit:** if a book ever exceeds 99 lessons, or if Anki gains a natural sort, in which
  case the padding can be dropped and migrated the same way.

## The state snapshot in git is JSON-only, so it protects nothing an audio change could destroy

- **What:** `output/` and `.anki-builder/` are now partly tracked (`cards.json`, `corpus.json`,
  `book.json`, `course.json`, `anki-delivered.json`, `.preflight-accepted.json`, the dedup
  `corpora/`, `conventions.md`, `taught-index.json`) so months of hand review are recoverable. The
  140 MB audio cache, the per-unit `audio/` dirs, extracted images, `.apkg` files and `.bak` files
  stay untracked. The single exception is the seven marker-audible clips plus their `.orig.mp3`
  originals, pulled in explicitly by filename.
- **Why:** the unrecoverable half is 3 MB of JSON; the rest is either large, binary, regenerable, or
  re-buyable. Tracking 422 MB of mp3 in git would make every clone and every commit expensive, and
  git handles binary blobs badly. The seven clips are named literally rather than globbed because a
  glob that drifted would pull in 3,610 paid clips.
- **Impact:** any statement of the form "WS0 protects this" is false for audio. If a regeneration or
  a re-trim destroys a clip, recovery rests on that clip's `.orig.mp3` sibling in the unit dir (or
  on paying ElevenLabs again), not on git. Also: `git status` now walks the whole of `output/`, so it
  is measurably slower than it was, and a new artifact kind under `output/` is untracked by default
  until someone adds a re-include line.
- **Status:** open
- **When to revisit:** if audio ever becomes genuinely unrecoverable (an `.orig.mp3` goes missing, or
  a voice is retired at ElevenLabs), revisit with a real out-of-band backup rather than by widening
  the git globs.

## The test-runner library redirect keys on NODE_TEST_CONTEXT, not on isTestEnv()

- **What:** `libraryHome()` returns a throwaway tmpdir when `NODE_TEST_CONTEXT` is set (with
  `ANKI_BUILDER_ALLOW_REAL_LIBRARY_IN_TESTS=1` as the deliberate escape). It does NOT use
  `isTestEnv()`, which also returns true for `NODE_ENV === "test"`.
- **Why:** a real deck build run from a shell that exports `NODE_ENV=test` would silently write its
  library into /tmp and look like it had lost the dedup registry. That failure is worse, hits real
  data instead of test data, and is much harder to diagnose than the leak being fixed.
- **Impact:** the `NODE_ENV=test` case is still uncovered. So is anything that writes to the library
  outside `node --test`: a hand-run script, or a child process that loses the env var. The
  suite-wide durable-write guard is the backstop for that gap, not this redirect. Test processes no
  longer share a library, so a test that expected one file's dedup registry to be visible to another
  file would now fail (none does today).
- **Status:** open
- **When to revisit:** if a second test runner is adopted, add its env marker to the same guard.
  Covering `NODE_ENV=test` safely needs a signal that separates "under a test runner" from
  "someone's shell profile", and no such signal exists.

## The durable-write guard compares (size, mtime), and only wraps `node --test`

- **What:** `scripts/test-with-write-guard.mjs` snapshots every path under `output/`,
  `.anki-builder/` and `anki-backups/` before and after the suite and fails the run on any
  difference. The stamp per path is size plus mtime, not a content hash, and the check happens in
  the wrapper process, not inside the tests.
- **Why:** the three trees hold ~20,000 files and over 500 MB. Hashing them twice a run would cost
  more than the suite itself. node:test has no cross-process global hook and `node --test` runs ~75
  separate processes, so a per-process check would mean roughly a million stat calls per run.
- **Impact:** a write that preserves both size and mtime is invisible to the guard (no plausible
  accident does this, but a deliberate one would). Anything that runs the suite without going
  through `npm test` (a bare `node --test`, an editor's test runner, a future CI step that calls the
  binary directly) is unguarded. The guard also cannot say WHICH test wrote the file, only that the
  run did, so diagnosing means bisecting.
- **Status:** open
- **When to revisit:** if a stealth write is ever suspected, hash the JSON files only (about 3 MB)
  and keep size/mtime for the rest. If the suite ever legitimately needs to write into these trees,
  add an allowlist rather than widening the escape hatch.

## Stamped .bak backups trade disk for reversibility, and nothing prunes them automatically

- **What:** every `scripts/` write to a unit's `cards.json` / `corpus.json` now snapshots the old
  file to `<file>.pre-<reason>-<YYYYMMDDHHmm>.bak` through `writeUnitJson`
  (`src/util/unitWrite.js`), instead of `backupFileOnce`'s single first-run snapshot. Two runs
  inside one minute get `-2`, `-3` suffixes rather than overwriting. `scripts/prune-baks.mjs` keeps
  the newest N per unit, and always the newest backup of each individual file so a unit can never
  end up with a corpus restore point and no cards one.
- **Why:** an unstamped backup answers "what did this file look like before the tool ever ran",
  which is the wrong question after the second run. There were already 330 backups (~10 MB) under
  `output/` from the unstamped era, and re-running a tool silently left the state it found
  unrecoverable.
- **Impact:** backups now grow one pair per run per unit instead of one pair ever, and pruning is a
  manual step nobody is prompted to take. Backup filenames are no longer predictable, so a doc or
  script cannot name one; find them by glob. `writeUnitJson` also standardizes on a trailing
  newline, so the first write by `extras-order` / `extras-duplicate-check` after this change adds
  one to a file that lacked it (matching every other writer, and every file currently on disk).
- **Status:** open
- **When to revisit:** if the backups become a nuisance, wire `prune-baks.mjs` into preflight as a
  report line rather than making it automatic. Deleting a restore point should stay a decision.

## `src/cards/crossLessonNotes.js` still uses the unstamped, first-run-only backup

- **What:** the `prepare` pass and `scripts/enhance-card-notes.mjs` share
  `enhanceLessonNotes`, which backed up through `backupFileOnce(file, ".pre-enhance.bak")`. That one
  writer was left on the old convention while the six `scripts/` writers moved to stamped backups.
- **Why:** it sits on the `prepare` pipeline path rather than in `scripts/`, and other in-flight work
  edits the same file. Changing it was out of scope for the change that introduced stamping.
- **Impact:** re-running the enhance pass over a lesson kept only the pre-first-run snapshot, so the
  state the second run found was not recoverable from a `.bak`.
- **Status:** RESOLVED (WS8 item 4). The pass now writes through `mergeIntoCardsFile`, which uses
  `writeUnitJson` — validate, stamped `<file>.pre-enhance-<YYYYMMDDHHmm>.bak`, atomic write, re-read
  and validate. `references/card-authoring-rules.md` was corrected in the same commit.

## Exclusion provenance is optional, so the 100 exclusions already on disk stay unattributable

- **What:** cards and corpus items now carry optional `excludedBy` ("human" or a script/pass name)
  and `excludedReason`. Absent means human-or-legacy. `setCardExcluded` (the dashboard toggle),
  `semanticDedup` and `extras-duplicate-check --apply` stamp them; preflight counts them per unit;
  the dashboard review badges a script-authored exclusion above the card's review note.
- **Why:** making the fields required would invalidate every file written before they existed, which
  is 100 excluded cards across two delivered collections. Backfilling them would be worse: there is
  no record of which of those were reviewed decisions and which were sweeps, so any value written now
  would be a guess presented as provenance.
- **Impact:** preflight reports those 100 as "unattributed (pre-provenance or human)" and will keep
  doing so forever. Provenance only becomes complete for exclusions made from here on. A card
  excluded by a script and later re-included and re-excluded by a human reads as human, which is
  correct but loses the earlier history (there is no exclusion log, only a current state).
- **Status:** open
- **When to revisit:** if the unattributed count ever needs to go to zero, it has to be a human
  reading each one, not a migration script.

<!-- WS8 — models, pinning and pass mechanics (2026-08) -->

## The eval fixtures are one chapter of one book, and their reference is post-review

- **What:** `scripts/eval-pass.mjs` runs five per-pass fixtures (`src/evals/`) against chapter 25 of
  the one book whose reviewed data is tracked, and diffs the result against that chapter's reviewed
  corpus. A 60 KB chapter `.xhtml` is committed under `test/fixtures/evals/chapters/` as the input.
- **Why:** the extracted-chapter cache is gitignored, so without a committed copy the extraction
  fixture cannot run on a fresh clone (or in any worktree). It is one chapter of a book this private
  repo already tracks the reviewed output of, so committing it adds no new class of content.
- **Impact:** three things. (1) The sample is one chapter, so a prompt edit that helps mid-book and
  hurts chapter 1 reads as an improvement. (2) The reference is the corpus as SIGNED OFF, which has
  been through the forward-flag pass, the reviewer's own edits and the drill miner — the extraction
  fixture filters the mined drills back out by reading `fillInBlank` off the tracked deck, but the
  reviewer's hand edits are indistinguishable from extraction output and count against a run that
  reproduced the original extraction exactly. (3) The de-dup fixture runs without the mined `patterns`
  map, which is not stored anywhere, so its input is thinner than the original run's.
- **Status:** open
- **When to revisit:** add a second and third chapter fixture (early and late) when a prompt edit ever
  disagrees with the chapter-25 result, and persist the mined pattern map if the de-dup fixture is
  ever used to justify a model downgrade.

## Per-pass pinning is thirteen more env scopes, and the defaults are calibrated on one book

- **What:** every model pass now resolves its model, effort and timeout through its own
  `ANKI_BUILDER_<PASS>_*` triple before its family's and the unified pair. Extraction defaults to
  effort `high` with a 25-minute ceiling, cross-lesson notes to 20 minutes, conventions and the
  taught index to 15.
- **Why:** one knob covered chapter extraction (silent, unrecoverable misses) and the pedagogical
  sort (mechanically validated, fails open), so tuning either re-tuned the other. The timeout had to
  move with the scope or raising effort would just have converted a quality knob into a mid-pass
  abort.
- **Impact:** thirteen scopes is more surface than one, and nothing enforces that a pass's runner
  matches its scope name beyond the wiring itself. The raised ceilings are wall-clock numbers
  measured against one book (a 57-chapter Japanese textbook) on one machine; a much longer chapter
  could still hit 25 minutes, and the failure then looks like a timeout rather than "this chapter is
  too big for one call". Extraction at `high` also costs more per chapter than it did, and nothing
  measures whether the extra effort is buying anything except the eval fixture, run by hand.
- **Status:** open
- **When to revisit:** run the extraction fixture at medium and at high on the same chapter and
  compare, rather than assuming. If a timeout is ever hit legitimately, split the chapter rather than
  raising the number again.

## The conventions merge is structural, and its coverage check only reports

- **What:** the whole-book conventions pass now runs in batches of 12 chapters. Each batch's response
  must quote every one of its chapters' `<title>` back, checked against the cached file, and the
  batch documents are merged by grouping them under one copy of each `##` heading with a
  "**Chapters 13-24:**" label per block.
- **Why:** the pass used to take all 57 chapters in one call under a 10-minute ceiling and
  self-certify that it had read them all. Batching gives it a partial-progress path and a per-range
  blame. The merge is structural rather than a second model call because a blending pass would be one
  more place the book's conventions could be quietly rewritten, and the range labels are worth
  keeping anyway.
- **Impact:** two things. (1) The merged document repeats itself: five batches means up to five
  blocks under "Placeholder Notation", and the extraction prompt embeds the whole thing, so the
  grounding text is longer and partly redundant. (2) The coverage check never fails the run. A batch
  that quotes no anchors at all still produces a document, with a `[COVERAGE SHORTFALL]` line in the
  log that nobody is required to read. That is the deliberate trade from the ruling: hard-failing the
  one pass that onboards a book on a fragile anchor trades a silent gap for a hard block.
- **Status:** open
- **When to revisit:** if the merged document grows unwieldy, add a single de-duplicating pass over
  the merged text rather than merging at generation time. If shortfall lines turn out to be common
  and real, surface them in preflight rather than only in the assemble log.

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

## The template path has never been built end to end, and three blind spots meet there

- **What:** no deck has ever been built from a bundled template and taken all the way into Anki.
  `output/templates/` is empty (only a `.DS_Store`), so the path with zero worked examples is also
  the path with the fewest checks: `lessonReadiness` returns ready unconditionally for
  `sourceType: "template"` (no `enriched`/`notesEnhanced` markers to wait for, since neither pass
  applies), and nothing anywhere verifies that a `.apkg` this project builds actually imports.
- **Why:** every real deck so far has been an EPUB book or a dictated course, so the template path
  has had no demand. The readiness exemption is correct on its own terms — a template has no drills
  to mine and no siblings to cross-reference — it just means a template unit passes the gate having
  been through nothing.
- **Impact:** the three gaps compound. A template deck could be built, reviewed, packaged and
  imported with a structural fault that no check here would have caught, and there is no known-good
  example to compare it against. This is the shape of failure the rest of this file is about: an
  absent check reads exactly like a passing one.
- **Status:** open — transplanted from harness task T011 ("End-to-end: build a real travel deck +
  verify in Anki", the loop's only never-run task) when the loop was retired, 2026-08-14. The task
  is gone; the risk it pointed at is not.
- **When to revisit:** the next time a template deck is built for real, treat it as the acceptance
  run — build from `travel-essentials` or `numbers` for one language, generate audio with a real
  key, import the `.apkg`, and check both card directions render and the audio plays — and record
  the result here. Cheaper still: when a headless `.apkg` import verifier exists, make that first
  worked template deck its fixture, which closes all three gaps at once.

<!-- WS2 (EPUB ingestion robustness) — appended as one block, newest last. -->

## The EPUB shape report warns, it never gates

- **What:** `buildShapeReport` (`src/corpus/epubShapeReport.js`), printed by `--list-lessons` and
  `scripts/epub-probe.mjs`, reports unreachable spine files, swallowed files, label collisions,
  image-filename collisions and picture-only pages as WARN lines. Nothing refuses to build, and the
  probe exits 0 even with warnings.
- **Why:** every one of these books still builds; the report describes a book whose own table of
  contents does not mean what the pipeline assumes. A gate here would refuse the one book already
  proven to work (it swallows a spine file and has a 94-character picture page), which is the fastest
  way to teach an operator to ignore the output.
- **Impact:** a person who does not read the report gets exactly today's silence. The report is only
  as useful as the moment it prints, which is why it is folded into `--list-lessons` rather than
  living in a separate command nobody runs.
- **Status:** open
- **When to revisit:** once a second book has actually been built end to end, some of these
  (unreachable spine 1, a nav that names none of its own files) may be safe to promote to a hard
  refusal for a book with no build history.

## The size thresholds are "twice the one proven book", not a measurement

- **What:** `SIZE_WARN` in `src/corpus/epubShapeReport.js` warns above 114 spine files, 4 MB of
  content or 1,454 distinct images — double the figures for Japanese for Busy People Book 1.
- **Why:** the whole-book passes (conventions, taught-index) read every file inside one timeout, and
  the only evidence about what fits is that one book. Doubling it is a deliberate round number, not
  an observed ceiling.
- **Impact:** a book between 1x and 2x the proven size passes silently and may still time out; a
  book over 2x warns even if the passes would have coped.
- **Status:** open
- **When to revisit:** when a second book of a materially different size has been through the
  whole-book passes, replace the factor with the observed limit.

## An inverted nav range is clamped to one file, not repaired

- **What:** when a nav document lists an entry pointing backwards, the range arithmetic in
  `analyzeExternalChapters` yields something like spine 5-2. It is clamped to spine 5-5 and logged;
  `resolveLesson` then asserts the invariant.
- **Why:** the true extent of that lesson is unknowable from a nav document that is not in reading
  order. A one-file lesson is at least a true statement; the alternatives are a range that throws
  mid-build or one that silently poisons the forward-flag pass.
- **Impact:** a lesson on such a book may be missing spine files, and only the warning says so. The
  operator has to fall back to explicit `--chapter-number` builds for that book.
- **Status:** open
- **When to revisit:** if a real book turns up with an out-of-order nav, sorting the resolved
  positions before computing ranges is the obvious next step — but it changes ordinals, so it needs
  that real book to test against.

## Comment stripping is textual, not a parser

- **What:** `stripInertMarkup` removes `<!--...-->` and `<![CDATA[...]]>` spans with a regex before
  every scan.
- **Why:** the hand-rolled scanner stays (the review ruled the parser's failures are policy, not
  parsing), and this is the smallest change that stops a commented-out anchor becoming a phantom
  lesson.
- **Impact:** a literal `<!--` inside an attribute value or a string would truncate wrongly, and
  nested comment-like sequences are not handled. Neither is legal XML, so the exposure is malformed
  books only. It also means a `<!-- -->`-wrapped `<img>` is no longer extracted, which is correct
  but is a behaviour change for any book relying on commented-out images.
- **Status:** open
- **When to revisit:** if a book ever parses to zero manifest items or zero nav entries, check this
  first — it is the only step that rewrites the source before scanning.

## The image collision is detected, not prevented

- **What:** `copyImageAsset` byte-compares before writing and logs a loud collision naming both
  archive paths and the shared destination, but every chapter's images still land in one shared
  `chapters/` directory, so the second write still wins.
- **Why:** the layout that would close it by construction (mirroring the archive layout under
  `chapters/`) moves the cache path and interacts with `isCachedChapterFile`. The review ruled the
  detector ships first and the layout change second, behind the hostile-fixture suite, because this
  is the code path whose last obviously-reasonable change produced an artifact the real consumer
  rejected while every test passed — and the real consumer here (a model opening a file by relative
  path) is exercised by no test.
- **Impact:** on a book with the standard Sigil/InDesign layout, one chapter's figure can be
  replaced by another's, and the only signal is a log line during extraction. A per-chapter
  subdirectory would not fully close it either: two chapters in different directories both
  referencing `../images/foo.png` still collide, so the detector stays in any design.
- **Status:** open
- **When to revisit:** when the archive-layout mirror lands (WS2 item 4). The detector stays.

## SVG re-scanning goes one level deep

- **What:** a copied `.svg` is re-scanned for the images it references and those are copied too, but
  only one level down.
- **Why:** the wrapper idiom (`<svg><image href="page.jpg"/></svg>`) is one level by construction,
  and a depth cap is what makes the recursion incapable of looping on a self-referencing SVG.
- **Impact:** an SVG referencing an SVG referencing a raster image copies the first two and not the
  third. No known book does this.
- **Status:** open
- **When to revisit:** if an SVG-heavy book turns up where images are still missing after
  extraction — the copied-SVG log lines are the trail.

## A non-UTF-8 chapter is reported, not transcoded

- **What:** `detectNonUtf8` flags a spine file whose XML declaration names a non-UTF-8 encoding or
  whose decoded text contains replacement characters. Nothing converts it; the reader still decodes
  and caches every chapter as UTF-8.
- **Why:** transcoding means either a dependency or a hand-rolled decoder for a set of legacy
  Japanese and Chinese encodings, on evidence of exactly zero books. Reporting it turns a silent
  mojibake extraction into a visible refusal to proceed.
- **Impact:** such a book can still be built and will produce garbage cards; only the shape report
  says why. The two signals also miss a file that is validly UTF-8-decodable but was authored in a
  different encoding without declaring it (rare, and undetectable without heuristics).
- **Status:** open
- **When to revisit:** the first time a real book trips this, transcode with `TextDecoder` (which
  Node ships with full ICU for) at read time, keyed on the declared encoding.

## Bumping CACHE_VERSION orphans the old extraction, it does not migrate it

- **What:** `CACHE_VERSION` moved the extraction cache from `<book>/chapters/` + `<book>/images/`
  to `<book>/cache-v2/{chapters,images}/`. The v1 directories are left on disk, unused, until
  `epub cache <hash> --clear` removes them.
- **Why:** deleting anything inside `.anki-builder/epubs/<hash>/` automatically is exactly the
  behaviour this workstream is trying to make impossible — `corpora/` is one directory away. An
  orphan costs disk; a wrong automatic delete costs the dedup registry.
- **Impact:** the already-built book re-inflates its 57 chapters and 727 images on the next build
  (free, seconds) and keeps ~90 MB of stale v1 output until cleared by hand. Every version bump
  repeats this.
- **Status:** open
- **When to revisit:** if the orphan count ever matters, `epub cache --clear` could grow a
  `--stale-only` mode that removes non-current cache roots and nothing else.

## The `epub cache` command takes a hash, not a book slug

- **What:** `anki-builder epub cache <hash>` is keyed on the 16-char content hash, the directory
  name under `.anki-builder/epubs/`.
- **Why:** the hash is the library's own key and the only identifier that is unambiguous. A slug
  is a property of one output tree, so resolving one here would mean taking `--output-root` too.
- **Impact:** the operator has to look the hash up (`ls .anki-builder/epubs/`, or read the
  `.epub-hash` file in the book's output folder) before clearing anything.
- **Status:** open
- **When to revisit:** if this gets used often, accept `--book <slug> --output-root <dir>` and
  resolve through `resolveBookEpubPath` the way `assemble` already does.

## The entity decoder is new-books-only, and the existing book stays on v1 forever

- **What:** `resolveLabelDecoding` returns the version stamped in the book's `book.json`. A book
  registered before that field existed reports v1 and keeps the old five-entity decoder, including
  its "Lesson5" tag-stripping, for good.
- **Why:** a label becomes a live Anki deck name. Changing it does not rename the deck; it creates a
  new one, leaving every existing note and its scheduling behind in the old deck. The re-file path
  that could migrate an existing book does not exist yet and is opt-in and previewed when it does.
- **Impact:** the delivered book keeps whatever its labels currently are, correct or not, until
  someone runs that migration deliberately. Two books in the same library can decode labels
  differently, which is intended but will read as an inconsistency to anyone who does not know why.
- **Status:** open
- **When to revisit:** when the previewed one-time re-file exists and has been proven on a probe
  profile. Migrating means bumping the marker for that one book and re-delivering.

## v2 label decoding tidies spaces around punctuation

- **What:** after replacing an inline tag with a space, v2 removes the space before `,;:.!?)]` and
  after `([`.
- **Why:** the space that correctly separates "Lesson" from "5" is the same space that would sit
  before the ":" that followed `</span>`. Without the tidy, "Lesson 5 : Greetings" reaches the deck.
- **Impact:** a label deliberately authored with a space before its colon is normalised too. Cosmetic,
  and only a newly-registered book can see it.
- **Status:** open
- **When to revisit:** if a language turns up where a space before punctuation is meaningful (French
  typography uses one before `:` and `?`), this needs to be language-aware.

## DRM detection is a spine-document test, not a DRM test

- **What:** `assertSpineNotEncrypted` throws only when `META-INF/encryption.xml` names a spine
  document in a `<CipherReference URI>`. Anything else encrypted (fonts, images, stylesheets) passes.
- **Why:** IDPF and Adobe font obfuscation write to the same file on completely readable books, so
  rejecting on the file's presence would refuse books that work. The spine documents are what the
  extraction model reads, so they are the only thing whose encryption stops this tool cold.
- **Impact:** a book whose *images* are encrypted but whose text is not will parse and extract, and
  the images will be garbage the model reads anyway. Nothing warns about that today.
- **Status:** open
- **When to revisit:** if an encrypted-images book turns up, widen the check to warn (not throw) on
  any encrypted entry that a chapter references.

## The nav sweep matches attribute names, not namespaces

- **What:** the last-resort discovery tier accepts any attribute named `type` or ending in `:type`
  whose token list includes `toc`, plus `role="doc-toc"`.
- **Why:** the hand-rolled scanner has no namespace resolution (the review ruled it stays), and the
  `epub:` prefix is only a convention — a conformant book may bind the namespace to any prefix.
- **Impact:** a `<nav>` carrying some unrelated `type="toc"` attribute would be accepted. It runs
  only after both spec-blessed tiers fail, so the exposure is books that have no discoverable nav at
  all, where the alternative is "no navigation document found".
- **Status:** open
- **When to revisit:** if a real book is mis-swept. Resolving `xmlns:*` declarations properly is the
  fix, and it is the point at which the hand-rolled scanner starts costing more than it saves.

## The archive-layout mirror for the chapter cache is deferred, and why

- **What:** the plan's follow-on to the collision detector was to mirror the archive layout under the
  cache root (chapter at `<cache>/<archive path>`, images at their own mirrored archive paths), which
  is isomorphic to the zip and so preserves every `<img src>` relationship exactly. It is NOT done;
  only the detectors shipped.
- **Why:** the obstacle is not the mirroring, it is who can compute the path.
  `src/cli/commands/prepare.js` resolves the chapter file from `meta.epubHash` and
  `meta.chapterNumber` alone, with no EPUB path in scope — and a mirrored path is a function of the
  archive, so that call site cannot derive it without either opening the library's EPUB copy (this
  reader inflates every entry eagerly, so that is a full 90 MB unpack purely to compute a path) or a
  new sidecar index written at extraction time and read back here. The range cache
  (`<first>-<last>.xhtml`) also has no single archive directory to mirror into. Landing it half-right
  is the one failure the ruling calls out as invisible: `extractReferencedImages` logs only MISSING
  archive entries, `isCachedChapterFile` then treats the chapter as a complete extraction forever,
  and no test exercises image reading because it only happens inside a paid LLM pass.
- **Impact:** the collision stays possible by construction on a book with the standard
  Sigil/InDesign layout. It is detected two ways — statically in the shape report before any spend,
  and by byte-compare at write time — but the second write still wins.
- **Status:** open
- **When to revisit:** with the hostile fixtures now in place, the missing piece is the path
  contract. Decide between a sidecar `cache-v<N>/index.json` (chapterNumber → relative path, written
  at extraction) and passing an EPUB path down to `prepare`; then bump `CACHE_VERSION`, move the
  containment root from "one level up from the chapter file" to an explicit mirror root, and give the
  range cache a home. Note that a per-chapter subdirectory is NOT a shortcut: with the standard
  `../images/foo.png` layout it isolates nothing.

<!-- WS3 (skill-review 2026-08): extraction & prompt quality — appended as one block, newest last. -->

## The Anki note-type field is still called "Reading" after the JSON field became `ttsText`

- **What:** the pipeline's `reading` field was renamed to `ttsText` everywhere (schemas, prompts,
  passes, dashboard, tests, and all 46 tracked cards.json / corpus.json / dedup-corpora files). The
  Anki note type's field keeps the name "Reading", and `src/deck/collection.js`'s `fieldValue` maps
  `ttsText` onto it in one line.
- **Why:** renaming a field on a live note type rewrites every note in both delivered collections and
  forces a one-way AnkiWeb sync, for a field no template renders. The point of the rename was to stop
  future agents reading the name as a display field; inside Anki the field is invisible, so the risk
  it was fixing does not exist there.
- **Impact:** one place in the repo (that `case "Reading":` arm) knows both names, and anyone reading
  the note type in Anki sees a name that no longer matches the JSON. A future note-type migration that
  does touch field names should fold this in.
- **Status:** open (deliberate; the mapping is one line and is commented)
- **When to revisit:** whenever a note-type field migration happens for another reason, or if a
  template is ever given a reason to render the value (which would need a decision first: today the
  rule is that `ttsText` is never rendered on any card face).

## The dedup-library corpora are not schema-validated

- **What:** `.anki-builder/epubs/*/corpora/<n>.json` files are corpus-shaped but carry a `meta.done`
  the corpus schema rejects (`additionalProperties: false`), so neither `validate:decks` nor
  `writeUnitJson` checks them. The `ttsText` migration checked them by re-reading and asserting no
  `reading` key survived, not by schema.
- **Why:** making them validate means either widening the corpus schema's `meta` for a field only the
  library copy uses, or giving the library its own schema. Both are real changes and neither belongs
  in a mechanical rename.
- **Impact:** a malformed dedup corpus reaches the dedup pass unchecked. It is the input to every
  later chapter's de-duplication, so a bad one degrades quietly, which is this project's signature
  failure mode.
- **Status:** open
- **When to revisit:** when WS1's audit scopes land, the library copy is a natural third scope to add.

## The merge discipline covers the fields a pass owns, not the items it never sees

- **What:** `mergeIntoCardsFile` (`src/cards/mergeIntoCardsFile.js`) re-reads `cards.json` after a
  multi-minute model call and writes back only the calling pass's own fields, appends and removals.
  `prepare`'s three passes and `crossLessonNotes` go through it; `audio.js` keeps its own copy of the
  same pattern because it has extra rules (only overwrite a clip THIS stage owns; an absent clip is
  an absent key, never `audio: null`).
- **Why:** each pass reads the cards, spends minutes in a model call, then writes — and the dashboard
  is editable for that whole window. Writing the object read at the start silently discarded any
  exclude or inline edit made in between, with no trace.
- **Impact:** two gaps remain. (1) The window is narrowed, not closed: two writers can still
  interleave between the re-read and the atomic rename, which is microseconds rather than minutes but
  is not zero. Nothing takes a lock. (2) `audio.js` is a second implementation of the same idea; a
  future change to the merge semantics has to be made in both places, and only one of them is named
  after the pattern.
- **Status:** open
- **When to revisit:** if a lost edit is ever actually observed, the answer is a lock on the run
  directory (the claim file already exists and could carry one), not a narrower window. Fold audio.js
  onto the shared helper the next time its rules are touched.

## The zip entry ceiling is a throw, not zip64

- **What:** `buildZip` throws past 65,535 entries instead of emitting an archive whose EOCD count has
  wrapped.
- **Why:** the correct fix for a genuinely larger archive is zip64, which this hand-rolled builder
  does not implement. Emitting a valid-looking but silently truncated `.apkg` is strictly worse than
  refusing.
- **Impact:** a book that somehow needed more than 65,535 media + note entries cannot be packaged at
  all. Current decks are around 1,900 entries, so this is theoretical.
- **Status:** open
- **When to revisit:** only if the throw ever fires. Media memoization (which would reduce the count
  by about 1%) stays deferred until the headless import verifier exists and passes on a memoized
  package — the payoff is 22 entries out of 1,914 against re-entering the one code path whose last
  reasonable-looking change produced a package Anki rejected while passing every test.
## Package freshness is an mtime comparison, so a byte-identical rewrite reads as stale

- **What:** `preflight`'s `package-freshness` check FAILs when a done unit's `cards.json` is newer
  than the collection's `.apkg`. It compares modification times; it does not open the package.
- **Why:** the only content-true alternative is to unzip the `.apkg`, read its SQLite collection and
  diff the notes against `cards.json`, which is a second implementation of the deck writer living
  next to the first, and drift between the two would be a false all-clear. mtime is the signal that
  is actually available, and the remedy for a false positive is the same as for a true one: rebuild,
  which is cheap and idempotent.
- **Impact:** anything that rewrites a `cards.json` without changing it (a `git checkout`, a restore
  from a `.bak`, a fresh clone) turns the check red for every collection until the packages are
  rebuilt. It is red on landing day for exactly this reason. A false positive costs one command; it
  never causes a wrong belief, because "we cannot show the package matches" is the honest state.
- **Status:** open
- **When to revisit:** if the rebuild-on-false-positive habit becomes routine enough to be annoying,
  stamp a build receipt (source file hashes) into the collection dir at build time and compare that
  instead. Wait until WS1 item 9's import verifier exists, since it already opens packages.

## `.preflight-accepted.json` records the decision, not the evidence for it

- **What:** an ACK acknowledgement is keyed on `(checkId, findingKey)`, e.g. a check id plus
  `chapter-3/some-card-id`. It stores the message as it read at the time, plus a timestamp and an
  optional note. It does NOT store a hash of the card content the finding was about.
- **Why:** hashing the content would mean every legitimate edit to an accepted card silently
  un-accepts it, and the operator would meet the same finding again with no way to tell an edit from
  a regression. Keying on identity keeps "I have looked at this pair" true across ordinary editing.
- **Impact:** if an accepted card later changes into a genuinely different problem under the same
  key, the acknowledgement still covers it and the finding stays quiet. A check can narrow this by
  folding the distinguishing fact into the key itself, but the general hole is real. No check is
  ACK-tier today (the only two were the cross-collection comparisons removed by the isolation
  ruling), so the hole is currently theoretical and the machinery is waiting for its first real user.
- **Status:** open
- **When to revisit:** when the first ACK-tier check lands. If its findings can change meaning under
  a stable key, fold the distinguishing fact into the key.

## Gloss agreement is a shallow string normalizer, not a synonym engine

- **What:** `glossAlternatives` lowercases, drops parentheticals and `___` blanks, splits on commas
  and slashes, unifies ordinals, strips a leading article and a trailing plural. Two glosses agree if
  their alternative sets intersect.
- **Why:** it is a safety brake on `extras-duplicate-check --apply`, which must refuse a group whose
  members are not obviously the same card. Ordinary wording differences ("Big" vs "Big, large", "4th
  floor" vs "Fourth floor") must not read as a disagreement, and a real synonym engine would need a
  dictionary and would bring its own wrong answers. It was originally written for a cross-deck report
  as well; that report was removed by the collection-isolation ruling, and this is the surviving,
  strictly within-collection user.
- **Impact:** genuinely equivalent glosses that share no words still read as a difference ("Car park"
  vs "Parking lot"), so `--apply` refuses a pair it could safely have excluded, and glosses that share
  a word but mean different things read as agreement. Failing toward REFUSING is the right direction
  for a tool whose output a human reads anyway.
- **Status:** open
- **When to revisit:** only if `--apply` is ever asked to carry more weight than "propose, human
  disposes". It should not be.

## Preflight is not in `npm run ci`, and deliberately not in the pre-push hook

- **What:** `npm run ci` (which the pre-push hook runs) stays format/lint/test/build. Preflight and
  `validate:decks` are the separate `npm run check`, run by hand.
- **Why:** `npm run ci` asserts on tracked state and passes in a fresh clone. Preflight asserts on
  `output/`, whose bulk is gitignored and untracked. Wiring it into the hook couples `git push` to
  unversioned deck state, is a no-op in CI and a fresh clone by construction, and would block a README
  typo behind a deck rebuild whose only escape is `--no-verify`.
- **Impact:** the deterministic gate is only as reliable as the habit of running it. Nothing forces
  it before a review link is handed over or before a deliver; the skill doc says to, and that is all.
- **Status:** open
- **When to revisit:** if the gate is skipped in practice, add the preflight half to the hook as
  ADVISORY: print, never contribute a non-zero exit.

## The `.apkg` import verifier needs Python, so it can never be part of the automatic gate

- **What:** `scripts/verify-apkg-import.mjs` shells out to the pinned `anki` Python package in a
  virtualenv it bootstraps under `.anki-builder/verify-venv/`. It is not in `npm run ci` and not in
  `npm run check`.
- **Why:** it is the only tool here that can disagree with our own `.apkg` writer, because it runs a
  real import rather than another assertion written by the same repo. But it needs a Python
  toolchain and a one-time wheel download, and `npm run ci` has to stay green in a fresh clone on a
  machine with neither.
- **Impact:** a package-format regression is caught only when someone remembers to run it. It is
  documented as a Definition-of-Done step for the first-ever build of a new source type and for any
  change to how packages are written, and that documentation is the whole enforcement. Its
  end-to-end test is env-gated (`ANKI_BUILDER_VERIFY_APKG=1`) and skips cleanly otherwise, so the
  suite reports "skipped", never "passed", when Python is absent.
- **Status:** open
- **When to revisit:** if CI ever gains a Python-capable job, run the smoke target there. Do not add
  it to the pre-push hook: that couples `git push` to a network fetch.

## The behaviour probes are written, tested and NEVER RUN, so five delivery answers are still blank

- **What:** `scripts/anki-behaviour-probe.mjs` and `src/anki/behaviourProbe.js` exist, are covered by
  17 tests driving an injected fake client, and have never touched a live collection. The results
  table in `references/deliver.md` reads "not yet run" in every row.
- **Why:** running them needs a human to create the `ANKIBUILDER-PROBE` profile, its sentinel deck
  and a filtered deck inside it, and to have that profile open. Creating, resetting and deleting
  that profile stay human steps forever: a script that can delete a profile is a script that can
  delete the wrong profile, and no interlock makes that safe.
- **Impact:** anything gated on a probe answer stays blocked. Per-card direction suspension and the
  one-time deck-name re-file both cite these results, and neither may ship on a guess. The
  interlock's own correctness is tested, but "the interlock refuses the owner's real collection" is
  tested against a fake, not against the real one.
- **Status:** open
- **When to revisit:** the moment the probe profile exists. Run `--check` first (it writes nothing),
  then `--run`, then fill in the table with the date.

## `suspend`, `unsuspend` and `changeDeck` are in the client with no shipping caller

- **What:** three new AnkiConnect actions were added to `src/anki/ankiConnect.js` for the probes.
  Nothing in the delivery path calls them.
- **Why:** the probes need them, and a probe script that reached past the shared client to build its
  own HTTP calls would be a second, unreviewed way to write to a live collection.
- **Impact:** the client now exposes three scheduling-mutating calls that no test of the delivery
  path constrains. A future change could reach for one without the consent machinery that
  `changeDeck` and `suspend` are supposed to carry. The comment above them says so; nothing enforces
  it.
- **Status:** open
- **When to revisit:** when per-card direction suspension lands, route both through the same
  consent-and-preview path the model-change guard uses, and delete this row.

## Spent migrations are marked in place, not moved to `scripts/migrations/`

- **What:** a one-off migration carries a `// SPENT: <date>` header saying not to run it. It stays in
  `scripts/`. `test/scripts/spentMigrations.test.js` requires every `.mjs` in `scripts/` to be listed
  as either a standing tool or a spent migration.
- **Why:** moving the files would break every doc reference, every muscle-memory path, and the
  docs-integrity test, for a distinction that only has to be visible at the top of the file.
- **Impact:** the classification lives in a test's two arrays, so adding a script to `scripts/` makes
  the suite red until it is classified. That is deliberate friction, but it is friction: a worker
  adding a script has to touch a file in `test/` they were not otherwise editing.
- **Status:** open
- **When to revisit:** if the friction is what people notice rather than the distinction, derive the
  lists from the headers themselves (spent = has the marker) and keep only the "no standing tool is
  marked spent" half.

## Collections are isolated, so nothing detects a bare-guid overlap between two decks

- **What:** an owner ruling on 2026-08-14 established that two collections (one book, one course, one
  template) are two separate products and must never be overlapped, compared, cued against each
  other, or considered in reference to each other. Three preflight checks that did exactly that
  (`cross-collection-ids`, `cross-deck-prompts`, `cross-deck-glosses`) had already been written,
  tested and merged. They were removed on branch `ws1-isolation`, along with WS4 item 8, which
  existed only to resolve their findings.
- **Why:** the checks were built on the observation that Anki interleaves every deck studied that day
  and matches note guids collection-wide. That observation is true, and it is not the rule this
  project follows. A deck is authored, reviewed and shipped as one product; making one product's
  wording answer for another's turns every new deck into a re-review of every old one, and the cue
  it would ask for ("say which scarf you mean") is a cue the learner of either deck alone does not
  need.
- **Impact:** the one mechanical concern the removed checks also covered now has nothing watching it.
  Both live collections ship BARE guids, decided once at each folder's creation and deliberately
  frozen there. If both are ever `.apkg`-imported into the same Anki collection, notes sharing an id
  overwrite each other silently. That was measurable at the time of the ruling (ten shared ids, nine
  byte-identical, one differing: スカーフ vs マフラー, both glossed "Scarf"). It is now unwatched by
  design, because detecting it requires reading two collections' cards together.
- **Mitigation, and it needs no comparison:** per-deck guid namespacing (WS6 item 5) makes the
  overlap impossible by construction, and is decided per collection at creation with no reference to
  any other. Alongside it, the delivery runbook rule: never `.apkg`-import a bare-guid deck into a
  collection that already holds another bare-guid deck. In-place AnkiConnect delivery is unaffected,
  because it matches on the `abid:` tag rather than the guid, and it is the normal path for a deck
  the owner already studies.
- **Status:** open
- **Verified by:** `node scripts/preflight.mjs --all` reports no cross-collection findings by
  construction; `grep -rn "guidNamespace" output/*/*/book.json output/*/*/course.json` shows which
  collections are bare.
- **When to revisit:** when WS6 item 5 lands guid namespacing for new collections, note here that new
  decks are safe by construction and that the two pre-namespace decks stay bare forever (renaming an
  existing deck's guids would orphan its live scheduling). Do not revisit by reintroducing a content
  comparison.

## The cached-artifact drift check compares prompt TEMPLATES, not rendered prompts

- **What:** `conventions.md` and `taught-index.json` now carry a `<artifact>.meta.json` recording the
  prompt path, a sha256 of the prompt **template file**, the model/effort, chapter count and
  timestamp. `assemble` (conventions) and `ensureTaughtIndex` (taught index) WARN when that hash no
  longer matches the template on disk.
- **Why:** the rendered prompt embeds absolute chapter paths from the machine that produced it, so
  hashing the rendered text would report drift every time the checkout moved, and a warning that
  fires constantly is a warning nobody reads. The template is what a human edits.
- **Impact:** drift that comes from something OTHER than a template edit is invisible: a changed
  per-language rules fragment, a different chapter set, a model upgrade. The recorded model/effort
  and chapter count make two of those checkable by eye, but nothing compares them automatically.
  Both artifacts already on disk have no meta sibling, so they warn about the absence instead, which
  is the correct answer (nobody can say which prompt produced them) and will keep firing until they
  are regenerated.
- **Status:** open — landing-day WARN on both live artifacts is expected, not a bug.
- **When to revisit:** if a non-template input ever starts changing the artifact's meaning, add it to
  the hash rather than widening the warning.

## The conventions/extraction precedence is stated in prose, and nothing enforces it

- **What:** the extraction prompt now renders `{{BOOK_CONVENTIONS}}` AFTER its own rules, with an
  explicit statement that the conventions are authoritative about markup and location only, and that
  the rules above win on any conflict about what to extract. The conventions prompt was reworded to
  describe drill markup structurally and to classify reference tables printed inside exercise
  sections as reference material.
- **Why:** the conflict that cost chapter 12 its paradigm forms was a policy sentence in a cached
  artifact outranking a prompt rule edited a month later. Prompt ordering plus an explicit precedence
  rule is the direct fix; enforcing it mechanically would mean parsing free-form prose.
- **Impact:** a future conventions run can still emit policy language ("skip the EXERCISES section")
  and a model can still follow it. The precedence sentence and the ordering make that less likely,
  not impossible, and the only detector remains a human noticing missing cards.
- **Status:** open
- **When to revisit:** when the extraction eval fixture (WS8) can be run against a deliberately
  policy-heavy conventions doc, that becomes the real test of whether the precedence rule holds.

## The dialogue ban is now narrow, which trades a hard rule for a judgement call

- **What:** the extraction prompt banned extracting the dialogue outright while Step 2 required every
  function word to have a demonstrating sentence, and dialogue is often where that sentence lives. The
  two rules were mutually unsatisfiable, and the corpus shows the model breaking the ban to satisfy
  Step 2 (にほんのスパですよ is a verbatim dialogue line, extracted to serve the particle よ). The ban
  is now "do not mine the dialogue as a script", with a single stated exception for the chapter's only
  demonstration of a required function word, marked with a `reviewNote` naming the form.
- **Why:** the ban is what had to give. A function word with no sentence showing it at work is a card
  a learner can recite and cannot use, and the extras pass re-mines the same dialogue afterwards
  anyway, so the ban was not even holding the line it claimed to.
- **Impact:** "the ONLY demonstration in the chapter" is a judgement the model makes with the whole
  chapter in front of it and nobody checks. A model that reads it loosely can justify several dialogue
  lines per chapter. The `reviewNote` is the only detector, and it is a human one.
- **Status:** open
- **When to revisit:** if reviewed chapters start showing more than about one exception each, tighten
  the wording or make the reviewNote a required, greppable prefix so the count is mechanical.

## vocab-coverage reports at INFO, and only where the chapter cache exists

- **What:** the vocabulary diff runs two ways: `scripts/vocab-coverage.mjs <chapterFile> <unitDir>`
  for one unit, and a `vocab-coverage` check in preflight (`src/audit/checks/vocab.js`) over every
  base unit of an EPUB collection. The matching lives in `src/cards/vocabCoverage.js` behind tests.
  The check is INFO, and it SKIPS rather than passes when a unit's chapter file is not cached.
- **Why:** INFO because the check has known false positives that only a human can dismiss (a book
  prints its vocabulary in ways no string match resolves), and the standing rule is that a blocking
  check ships with the fix or the ACK for its live instances. Nobody has looked at a live count yet:
  the chapter cache is a free re-inflate of the EPUB and is untracked, so it is absent in a fresh
  clone and in every worktree, and this check has never been run against real chapters.
- **Impact:** the check contributes nothing to the exit code, and on a machine without the chapter
  cache it reports a skip line rather than a number. The skip is the honest answer, but it means the
  gate is only real on the machine that built the book.
- **Status:** open — INFO on purpose, pending a live count.
- **When to revisit:** run `npm run preflight` on the machine holding the chapter cache, read the
  findings once, then either fix them or promote the check to ACK in the same commit that accepts
  the residue.

## The paradigm audit cannot tell a particle from the same kana inside a word

- **What:** `matchesInPredicatePosition` requires a form to start the string or follow a particle
  (が, は, も, に and the other common ones), and excludes the paradigm's own longer cells
  automatically. It still counts `ちがいます` as a hit for `います`, because ち + が + います is
  indistinguishable from a real particle without a tokenizer.
- **Why:** the alternative is a morphological analyzer (kuromoji is already a transitive dependency
  via kuroshiro), which is a much larger change than this check is worth, and would introduce its own
  segmentation errors on beginner all-kana text.
- **Impact:** a cell can read as covered when its only hit is a false positive. The script prints
  every hit with its card so the documented "read the matching cards" step is one glance, and a cell's
  `notForms` records a confusable permanently once someone finds it.
- **Status:** open
- **When to revisit:** if `notForms` lists start repeating across chapters, that is the signal that a
  tokenizer would pay for itself.

## The extraction coverage report is self-reported, and only its image half is checked

- **What:** extraction now answers with `{ items, coverage }`, where coverage names the images the
  model opened, the ones it dismissed as decorative, and any concerns. The image lists are diffed
  against the chapter's real referenced-image set and every gap is logged; `concerns` is logged
  verbatim.
- **Why:** a chapter the model could not read produced the same output shape as a chapter with
  nothing in it. Something had to make the difference visible, and the image set is the one part of
  the claim the code can check independently.
- **Impact:** a model that lists an image as opened without opening it passes the check. `concerns`
  is not checked at all, by construction: an empty list is a claim, not evidence. The warnings go to
  the assemble log, which nobody reads after the fact, so this helps whoever is watching the build
  and nobody else. Nothing yet surfaces it at a review gate.
- **Status:** open
- **When to revisit:** when preflight has scopes, storing the coverage block per unit would let the
  gap be reported at review time instead of only in the build log.

## The romanization style hook exists but is empty

- **What:** `docs/romanization-prompt.md` takes a `{{ROMANIZATION_STYLE_RULES}}` fragment from
  `languageRules.js`'s `romanizationStyle`. No language sets it, so today it renders as nothing.
- **Why:** the move of the four translate prompts into `docs/` had to stay a move. Pinning a Hepburn
  spec is a separate, opinionated change (the deck's romanization drifts per batch: trailing periods
  100% in some units and 0% in others, `-san` hyphenated 32/32 in one unit and spaced 40/40 in the
  next), and mixing it into the move would have made both harder to judge.
- **Impact:** the drift is unchanged until something fills the fragment in. The hook makes that a
  one-place edit rather than four.
- **Status:** open — the hook is deliberate groundwork, not an oversight.
- **When to revisit:** the pinned-Hepburn work. Fill `romanizationStyle` for `ja` and every prompt
  that romanizes inherits it.

## Two new categories exist, but no card has been recategorized

- **What:** `"Descriptions & Qualities"` and `"Everyday Objects"` are in `src/model/categories.js`,
  and both the corpus and the cards schema now hold `category` to that enum (the cards schema had it
  as a bare string, so a value the corpus schema would have rejected could still reach the deck and
  the Recognition front's category chip). The extraction prompt and the authoring rules tell an
  author to try the two new categories before `"Other"`, and state that a worked example takes the
  category of the form it demonstrates.
- **Why:** recategorizing the 222 live `"Other"` cards is a content edit on reviewed, delivered
  material, one card at a time, and it is a different decision from making the categories available.
- **Impact:** the live deck's `"Other"` bucket is exactly as big as it was. The categories only apply
  to what is authored from here, and the two rules only bind a model that reads the prompt.
- **Status:** open
- **When to revisit:** alongside any pass that is already rewriting those cards. The category chip
  renders on the Recognition front, so a recategorization is visible to the learner and belongs
  behind a review gate rather than in a sweep.

## The card-faces block is one hard-coded example card

- **What:** `{{CARD_FACES}}` renders both directions from the real `CARD_TEMPLATES` with one example
  card filled in (a greeting with every optional field populated).
- **Why:** one filled example is what makes the faces concrete, and rendering the model's actual item
  would mean rendering the prompt per item rather than once.
- **Impact:** the example is a short greeting, so it does not show what a long sentence card or an
  image card looks like, and a rule about a face that only misbehaves at length is still invisible.
  The renderer takes a card argument, so a second example is a one-line change if it earns its place.
- **Status:** open
- **When to revisit:** if a length-related authoring rule (a FIB length ceiling, say) needs the model
  to see the failure it is being warned about.

## The extraction eval fixture has no images, so it cannot measure image-borne extraction

- **What:** `test/fixtures/evals/chapters/25.xhtml` references about 50 images, and none of them are
  checked in (`test/fixtures/evals/` holds only `chapters/` and `recorded/`). A live eval run
  therefore cannot open a single one.
- **Why:** found while running the fixture's before/after procedure over the WS3 prompt edits. The
  coverage envelope is what surfaced it: the model reported 0 images opened, 50 skipped, and named
  the specific chart it could not read.
- **Impact:** the eval systematically under-measures anything image-borne, which is precisely the
  content class this book hides its paradigms and counter charts in. In both the before and after
  runs the same three cards were missing (さんにん, よにん, ごにん) and the after run's `concerns`
  correctly predicted them from the unopenable "Numbers of people" chart. A prompt change that
  improved image handling would score as no change at all.
- **Status:** open — the fixture is otherwise sound; this is one missing directory.
- **When to revisit:** check the chapter's images in beside it (they are already in the book's cache
  under `.anki-builder/epubs/<hash>/`), or have the fixture point the extractor at the cached chapter
  path instead of the copy under `test/fixtures/`.

<!-- WS4 -->

## The pinned romanization spec is stated for Japanese only, and lands red on 412 live cards

- **What:** `src/translate/romajiStyle.js` pins one romanization style per language, and only `ja`
  has one. A language with no entry gets no rules in its prompts and no lint — `lintRomaji` returns
  `[]`, `romanizationStyleRules` returns `[]`, and the romanization prompt's style bullet renders
  empty. The other library-configured languages (zh, ko, ru, hi) romanize with nothing pinned, as do ar
  and he, which WS5 moved off the library path entirely.
- **Why:** the deck being built is Japanese, and inventing a pinyin or Hangul-romanization spec
  nobody has looked at would be worse than an honest gap: a wrong pinned rule is injected into every
  prompt and linted against every card.
- **Impact:** the drift the spec exists to stop (per-batch style flips) is still possible in any
  non-Japanese deck, silently. Adding a language is one entry in `ROMAJI_STYLES` and everything else
  picks it up.
- **Status:** open
- **When to revisit:** the first non-Japanese deck that gets past a review gate.
- **Verified by:** `node -e "import('./src/translate/romajiStyle.js').then(m=>console.log(Object.keys(m.ROMAJI_STYLES)))"`

## The romaji lint is INFO-tier and will stay non-zero for a long time

- **What:** `romaji-style` reports 412 of 2,150 shipped cards on the day it lands (trailing ASCII
  punctuation ×253, a spaced honorific ×179, a fused counter ×6, a missing macron ×6, `mb`/`mp` ×5,
  `wo` ×1). `inline-romaji` reports a further 135 notes whose parenthetical spelling disagrees with
  the same collection's own audited `pronunciation`.
- **Why:** every hit is real, but the FIX is a paid pass over the card, not a rewrite rule — `dou` →
  `dō` is safe right up until the word is 同. Promoting either check to FAIL would block every review
  on 547 pre-existing findings, which is exactly how a gate becomes an override habit. ACK was
  rejected too: acknowledging 547 instances one by one is a worse use of the operator than reading a
  count.
- **Impact:** a permanently non-zero INFO line, which is the failure mode the tier system was built
  to name. It is tolerable only because the count is per-unit and drops as batches get re-run; if it
  is still 400 in six months, that is a signal the fix pass never happened.
- **Status:** open
- **When to revisit:** after the first re-run of the romanization pass over a delivered unit — if the
  count for that unit does not fall to zero, the injected spec is not reaching the model.
- **Verified by:** `node scripts/preflight.mjs --all --only romaji-style,inline-romaji --verbose`

## The card-face fixes are landed in code but not in the live collection

- **What:** the note type's templates and CSS changed (prompt sizing, WCAG AA colours, no category
  chip on the Recognition front, distinct scene/hint styling). The two live collections still render
  the OLD faces, and will until someone runs a deliver with `--allow-model-change`.
- **Why:** the note type is keyed on language alone, so pushing it rewrites the card faces of both
  delivered decks at once and flips Anki's schema, forcing a one-way full AnkiWeb sync the owner has
  to complete by hand through a GUI dialog. That is a decision, not a build step. `deliver --dry`
  prints the whole diff plus the deck and card counts it reaches.
- **Impact:** code and live collection disagree about what a card looks like, deliberately, until the
  owner consents. Anything reading the live note type (a `--dry` diff, the probe script) will report
  a difference; that is the guard working, not a fault.
- **Status:** open — awaiting one `deliver --dry` review and an `--allow-model-change` run.
- **When to revisit:** at the next deliver of either collection.
- **Verified by:** `node src/cli/bin.js deliver --book-dir <collection> --dry`

## The Japanese font rule was narrowed differently from the plan

- **What:** the plan asked for the webfont to be scoped "to the target rather than `.card`".
  `languageFontCss` still targets `.card`; what changed is its Latin fallback, from
  `"Helvetica Neue", Helvetica, Arial, sans-serif` to `arial` (the card's own stack).
- **Why:** the `@font-face` already carries a `unicode-range` covering only kana, kanji and CJK
  punctuation, so the font can never render a Latin glyph no matter which selector it is on — the
  scoping the plan wanted is already there, per glyph. Narrowing the SELECTOR to the prompt and
  answer elements would have stripped the textbook face from the Japanese quoted inside a `note` or a
  `scene`, which the learner reads too. The real defect was the fallback: registering a Japanese font
  silently restyled every Latin string on the card.
- **Impact:** none on the target script. Latin text on a `ja` card now renders in `arial` (what
  BASE_CSS asks for) rather than Helvetica Neue.
- **Status:** open — recorded because it is a deliberate deviation from an approved plan item, not
  because anything is wrong.
- **When to revisit:** if a language is ever configured whose font has no `unicode-range`, the
  `.card` selector stops being safe and the narrowing becomes necessary after all.

## The notes truth-check finds claims, it cannot judge them

- **What:** `note-claims` lists every note asserting a decomposition, derivation, distinction or
  identity, and says which of the target-script forms it names have no card in this collection. It
  never says whether the claim is TRUE. 122 findings on the two live decks.
- **Why:** whether お + かし = おかし is a fact about Japanese. A checker that guessed would be a
  fourth pass that looks like it verified something, which is precisely how the false なんの analysis
  survived extraction, the cross-lesson note pass, the corpus review and Mark done.
- **Impact:** the whole value depends on a human reading the list at Gate 1, so it is written into
  SKILL.md as a required step rather than left as a report line. The patterns are also English-shaped
  and Japanese-shaped: "the て-form of" and "X + Y" are what THIS deck's notes look like, and a claim
  worded some other way ("shortened from", "an older reading of") is not detected at all. The
  function-morpheme allowlist (particles and the honorific prefix) is likewise Japanese-only.
- **Status:** open
- **When to revisit:** when a claim gets through that the patterns should have caught, add the wording
  rather than loosening an existing pattern.
- **Verified by:** `node scripts/preflight.mjs --all --only note-claims --verbose`

## The near-sibling check is tuned to one deck's English, on two thresholds

- **What:** `near-siblings` groups cards by blanking digit runs and Capitalised words out of the
  `english`, then reports a frame with 3+ members that still carries 3+ ordinary words. Both numbers
  (`MIN_FRAME_WORDS`, the group floor) were chosen by running the alternatives over the live book.
- **Why:** the untuned version is useless: at a 1-word floor the frame `◇` groups every one-word
  vocab card in the deck and reports 270 of them, and it fires on `Nine minutes` / `Six minutes`,
  which is a counter series a lesson exists to teach, not a near-sibling group. At 3 words it names 7
  frames over 24 cards, all of them real.
- **Impact:** the slot detector is English-shaped (a Capitalised word is a proper noun) and would
  behave differently on a deck whose `english` is not English, or one that sentence-cases every
  gloss. It is also blind to a frame varying by an ordinary lowercase noun (`I drink coffee` /
  `I drink tea`), which is a real near-sibling shape it will never report.
- **Status:** open
- **When to revisit:** if a second collection's report is either empty or enormous, the thresholds
  are wrong for it and belong per-collection rather than as module constants.
- **Verified by:** `node scripts/preflight.mjs --all --only near-siblings --verbose`

## Two pinned romanization rules are taught but not linted

- **What:** `proper-noun-casing` and `n-apostrophe` carry `detect: null`. Nothing checks them.
- **Why:** neither is decidable from the romanization alone. A capital in first position is right for
  `Tanaka-san` and wrong for `Hai, wakarimashita`, and a missing ん apostrophe leaves the same letters
  behind whether the kana was ん+や or に+ょ. A detector for either would report noise forever, and
  this repo's signature failure is a check that cannot see something reading exactly like one that
  looked and found nothing.
- **Impact:** the deck's proper-noun casing is genuinely inconsistent right now (`Sumisu-san` and
  `sumisu-san` both ship) and nothing will catch it. The check names both rules in its report rather
  than letting them read as checked.
- **Status:** open
- **When to revisit:** if a proper-noun list for the collection ever exists (the extraction pass
  could emit one), `proper-noun-casing` becomes checkable against it.

## Direction suspension on ALREADY-DELIVERED notes is built but dormant

- **What:** `dirSuspended` works end to end for notes a deliver CREATES. For a note already in the
  collection the flag is read, reported as unapplied, and never acted on: `--suspend-delivered`
  raises an error naming the probe evidence it is missing (`suspend-on-filtered`,
  `housekeeping-unsuspends`) before performing a single read.
- **Why:** both probes are questions about a card the owner is already studying. Nobody has
  established what AnkiConnect's `suspend` does to a card with a non-zero `odid` (one pulled into a
  filtered deck), or whether a template update or Check Database silently clears the suspension —
  which would make the control stop working with no signal at all. Shipping the path on the
  assumption that it behaves is exactly the pattern this plan exists to stop.
- **Impact:** a `dirSuspended` added to an already-delivered card does nothing until the probes are
  run. That is reported on every deliver rather than being silent, but the flag and the collection
  disagree in the meantime. The gate reads `src/anki/probeResults.js`, whose entries are `null` (not
  `false`) so "we don't know" can never be mistaken for "we know it is safe".
- **Status:** open — dormant pending probe evidence.
- **When to revisit:** after a probe session on the throwaway `ANKIBUILDER-PROBE` profile. Record each
  answer in BOTH `src/anki/probeResults.js` and the table in `references/deliver.md`, then re-read the
  gated path before trusting it.
- **Verified by:** `node --test test/anki/directionSuspension.test.js` (the last two tests assert the
  probes are still unanswered and that the gate opens once they are not)

## The .apkg no longer reproduces the delivered deck card-for-card

- **What:** the `.apkg` builder emits BOTH card rows for every note, including one carrying
  `dirSuspended`; the AnkiConnect deliverer suspends the unwanted ordinal. So a package built from a
  collection differs from the live deck by exactly those suspensions.
- **Why:** omitting the row at build time is inert on the delivery path (Anki generates one card per
  template on `addNote`) and self-reversing on the `.apkg` path (Check Database and any template
  update regenerate it), so the two builders would have drifted STRUCTURALLY for no gain. Keeping
  both rows keeps them structurally identical and puts the difference where it is intentional.
- **Impact:** importing a built `.apkg` into a fresh collection produces a deck with every direction
  live. Anything treating the `.apkg` as a faithful snapshot of the delivered deck — the freshness
  check, a restore-by-import — is comparing packages, not scheduling, and is unaffected; a human
  reading one as "what the owner sees" would be wrong.
- **Status:** open — accepted trade, recorded so it is not rediscovered as a bug.
- **When to revisit:** if `.apkg` import ever becomes the primary delivery path again, this inverts
  and the suspension has to move into the builder.

<!-- WS5 -->

## The audio text-hash badge is a badge, and 30 clips can never be checked at all

- **What:** `audioTextHash` records what text each clip was generated from, so the ~200 hand-picked,
  hand-trimmed and uploaded cards stop being exempt from the text-changed check. It reports, in the
  audio review (a **Text changed** badge) and in `npm run preflight` (`audio text hash`). It does not
  block "Mark done", and 30 live clips carry a hand-given name with no hash in it, so nobody can say
  whether they still match their card.
- **Why:** a block would have been the first ever gate on the owner's daily path, and a mismatch has
  no exit that does not destroy the reviewer's hand trim or hand pick — the "Keep this clip" button
  is the exit, and it is a decision, not a fix. The 30 are unverifiable because the only other way to
  give them a hash is to compute one from the card's current text, which would declare every drifted
  clip correct in a single pass and destroy the signal permanently.
- **Impact:** a stale clip still ships until a human acts on the badge. On the first live run the
  count was ONE (`nihongo-101-course-n5/lesson-0/irl-l1-31`, whose hand-trimmed clip was generated
  from text nobody can now reconstruct); it is left badged rather than regenerated, because deciding
  between spending credits and keeping the take is the owner's call. 106 clips report unverifiable:
  30 whose take carries a hand-given name with no hash in it, and the rest kanji takes generated
  before `ttsKanji` was stored on the card.
- **Status:** open — badge-only by design, pending a measurement of how often it goes red in practice.
- **Verified by:** `node scripts/preflight.mjs --all --only audio-text-hash --verbose`
- **When to revisit:** once the live stale count has been observed over a few chapters. If it stays
  at or near zero, promoting the check to ACK (accept-or-fix, not a hard block) is the next rung —
  the exit action and its provenance fields already exist, which is what a promotion needs.

## A cleared marker-stuck flag rests on where the cut landed, not on the detector

- **What:** `scripts/audit-marker-stuck.mjs` clears `audioMarkerStuck` only when the reviewer's hand
  cut ends at or before the start of the original's trailing run of separated speech — the only place
  an appended marker can be — and the detector also finds nothing in the shipping clip. The detector's
  own verdict is never enough on its own.
- **Why:** these are precisely the clips the detector failed on; that failure is what set the flag.
  Measured on the seven live instances, all of whose originals certainly carry the marker,
  `findEndMarker` locates it in exactly one. Clearing a flag on "the detector found nothing" would be
  reasoning from a known-blind instrument.
- **Impact:** a clip fixed some other way — regenerated, replaced, or hand-cut with no `audioTrim`
  recorded — cannot be cleared by this tool even when it is genuinely clean. It reports those as
  unproven and leaves them flagged, which is the safe direction but means the count can stick above
  zero for a reason that is not a bad clip. All seven live instances cleared; none is currently in
  that state.
- **Status:** open
- **Verified by:** `node scripts/audit-marker-stuck.mjs`
- **When to revisit:** if the ACK count starts holding non-zero on cards nobody can clear. The next
  rung would be storing the marker window on the card at generation time, so "was it cut away" stops
  depending on re-detecting it later.

## Marker detection is re-run on every hand trim, re-clean and revert

- **What:** installing or dropping a hand cut now re-asks whether the shipping take carries the end
  marker, which is one `silencedetect` pass plus up to three short decodes per action.
- **Why:** the flag has to describe the clip that ships, or it goes on asserting a fault the reviewer
  has already fixed — which is what happened to all seven live instances for months.
- **Impact:** an Apply in the trim editor now costs an extra ffmpeg round trip (tens of milliseconds
  on these clip lengths). Only for a take generated with the marker; a non-Japanese card never pays
  it. If ffmpeg is missing the detection returns "no marker", same fail-open rule as the trim itself,
  so an absent ffmpeg silently clears flags rather than keeping them.
- **Status:** open
- **When to revisit:** if the editor starts feeling slow on Apply, or if a machine without ffmpeg is
  ever used for review — the fail-open direction is wrong for that case and would need a third state
  ("could not tell") rather than a boolean.

## Kanji-orthography TTS is opt-in and unmeasured — the A/B has never been run

- **What:** a unit can be voiced from each card's kanji orthography (`meta.kanjiTts` + `ttsKanji`)
  instead of its kana. The machinery is complete: the conversion pass, the per-unit flag, the review
  surfacing, and `scripts/kanji-tts-ab.mjs`, which is the blind A/B that would decide whether it is
  worth using. Nothing in the live tree has the flag set, and the A/B has never been run.
- **Why:** running it costs ElevenLabs credits (two takes per sampled card, 60 for the default
  sample), which is the owner's call and not something an agent should spend. Building the harness
  costs nothing, and the parts that are easy to get wrong — the sample weighting toward
  homophone-bearing cards, the blinding, the scoring — are exactly the parts worth pinning down in
  advance. `--spend` is deliberately not wired to a generator, so no code path in this repo reaches
  ElevenLabs without someone having just written the call.
- **Impact:** the codebase's claim that kanji voices more naturally is still just a claim, and the
  cost side of it — how often kana→kanji picks the wrong word — has no number at all. Until both
  exist, the flag is a capability nobody should turn on by default. The one-to-many risk is real and
  undetectable by the learner: the card face is kana, so a clip saying 箸 where the card means 橋
  sounds perfectly fluent.
- **Status:** open — built, documented, never run.
- **When to revisit:** whenever the owner is willing to spend the ~60 takes. Step 2 of the procedure
  (reading the conversions on screen) is free and worth doing first on its own: the visible mis-pick
  rate is half the answer and might settle it without any audio at all.

## Nothing has changed for units that already exist

- **What:** `translate --kanji-tts` records the flag at unit CREATION. There is no command to flip it
  on a unit that already has audio.
- **Why:** `defaultClipText` feeds both the ElevenLabs cache key and the staleness filename, so
  flipping it on an existing ja unit would invalidate every clip in it — paid refetches, discarded
  trim tuning — while hand-touched cards stayed exempt from regeneration, leaving a unit voiced half
  in kana and half in kanji with nothing saying which is which.
- **Impact:** trying kanji TTS on the existing book means a new unit, not a switch. The staleness
  comparison deliberately accepts BOTH flag states (`expectedAudioTextHashes`), so hand-editing the
  flag onto a unit badges nothing — but it would silently change what the next `audio` run generates
  and re-bill it, which is precisely the mixed-orthography outcome. Do not hand-edit it.
- **Status:** open
- **When to revisit:** if the A/B comes back positive and the owner wants an existing unit converted.
  That needs a previewed migration that regenerates the whole unit at once, not a flag flip.

## Only ja / zh / ko have a proven romanization path

- **What:** seven languages had a romanization library wired in; three have ever been run end to
  end. Measured output for the rest: Arabic كتاب → `ktab` (kitāb), مدرسة → `mdrsa` (madrasa),
  بيت → `byt` (bayt); Hebrew ספר → `spr` (sefer), שלום → `šlwm` (shalom); Hindi कमल → `kamala`
  (kamal), सड़क → `saḍa़ka` (saṛak, with the combining nukta leaking through raw). Arabic and Hebrew
  have been removed from `ROMANIZATION_LIBRARIES`; Hindi keeps its library plus explicit
  schwa-deletion and nukta rules in the prompt.
- **Why:** Arabic and Hebrew script do not write short vowels and neither library restores them, so
  both return a consonant skeleton — not an imperfect romanization but a non-answer, since a learner
  reading `ktab` cannot say the word. The romanization prompt hands the library's value over as a
  useful starting point and tells the model to keep it where it is right, so a systematically empty
  value does not merely fail to help: it anchors. Hindi is a different case. Sanscript's
  devanagari→IAST is a *Sanskrit* scheme, where the inherent schwa is pronounced; Hindi deletes it.
  Every vowel is at least present, so the output is correctable, and telling the model exactly what
  to correct is cheaper than dropping a library that is 80% right.
- **Impact:** an Arabic or Hebrew deck now takes the LLM-only pronunciation path, the same one every
  unconfigured language uses. That is a model guess with no deterministic backing — but a guess that
  can supply vowels beats a skeleton that cannot. Hindi's output depends on the model actually
  applying the schwa rule; nothing verifies it, and there is no Hindi deck to check against.
  Neither has been run on real material, so "improved" here means "no longer anchored on a wrong
  answer", not "measured good".
- **Status:** open
- **Verified by:** `node -e "import('./src/translate/romanization/indic.js').then(m => m.romanize('सड़क')).then(console.log)"`
- **When to revisit:** before anyone builds a deck in one of these languages. Romanize thirty real
  cards, read them, and decide per language — that is the only thing that would turn any of this
  from a reasoned guess into a measurement. If a vocalizing Arabic or Hebrew library appears,
  re-wiring is one line in `romanizationLibraries.js`.

## The romanization prompt's language fragments are hand-written, not measured

- **What:** the per-language `romanizationStyle`, `libraryFailureModes` and `romanizationExamples`
  entries in `languageRules.js` are written from knowledge of each language, not derived from a
  corpus. The Japanese ones restate faults this project has actually seen; the Hindi, Arabic and
  Hebrew ones restate faults measured on a handful of words each.
- **Why:** the alternative was leaving every non-Japanese run anchored on Japanese exemplars, which
  is a definite fault rather than a possible one. A hand-written fragment naming the real failure
  mode is better than a correct-looking fragment about another language.
- **Impact:** a fragment could be wrong or incomplete in a way nobody notices until a deck is built
  in that language. The Arabic sun-letter rule and the Hebrew mater-lectionis rule in particular are
  stated from general knowledge, not from output anyone has checked. They are also only prompt
  text — a wrong rule produces a wrong romanization, not a crash.
- **Status:** open
- **When to revisit:** with the first real deck in each language, alongside the entry above. A
  per-pass eval fixture for romanization would settle it properly; the machinery for that already
  exists (`scripts/eval-pass.mjs`).

## End-marker protection is Japanese-only, so every other language ships whatever ElevenLabs clips

- **What:** `MARKED_LANGUAGES` in `src/audio/ttsMarker.js` holds exactly one entry, `ja`. Every other
  language's TTS text goes to ElevenLabs unmarked, so nothing protects the end of the utterance: the
  model's habit of cutting the final release short lands on the card's own last syllable instead of
  on a throwaway one. A Spanish, Korean or Hindi deck gets clipped endings and nothing reports it.
- **Why:** the marker is `。ででで`, and it works because Japanese is written without spaces and で
  is a clean repeated open syllable no real card ends with three of. Neither assumption transfers.
  In a spaced language the marker is a visible separate word the voice may stress or pause before
  differently; in another script there is no reason `de` is a safe throwaway; and the trim's removal
  of it rests on thresholds measured on twelve Japanese clips of one voice. A wrong guess does not
  degrade quietly — it puts audible nonsense on the end of every card in the deck.
- **Impact:** the ~13% intervention rate this project sees on Japanese audio is with the marker
  helping. Another language starts worse and with no badge for it: `audioMarkerStuck` can only be
  set on a marked take, so an unmarked language's clipped ending is invisible to preflight, to the
  audio review, and to `scripts/audit-marker-stuck.mjs` alike. Only the reviewer's ears would catch
  it, and nothing tells them to listen for it.
- **Status:** open — a known unhandled condition, not a bug.
- **Verified by:** `node -e "import('./src/audio/ttsMarker.js').then(m => console.log(m.usesEndMarker('es'), m.usesEndMarker('ja')))"`
- **When to revisit:** the first non-Japanese deck. Adding a language means choosing a throwaway
  syllable for it, generating a dozen clips, and re-deriving the position and pulse-shape thresholds
  against them — the same measurement the Japanese entry above describes, not a one-line addition to
  the set.

## The か-question prosody trial is written down and has never been run

- **What:** Japanese question cards are generated exactly like statements — `<text>。ででで` — so the
  voice reads a か-final question on a falling contour. 328 delivered cards end in か. A rising
  contour would be more natural, and the obvious way to get one is to put the question mark before
  the marker (`ですか？。ででで`). The procedure for trialling that is written in
  `.claude/skills/build-anki-deck/references/audio-pipeline.md`; it has not been run.
- **Why:** running it costs ElevenLabs credits, which is the owner's call. And it is a trim
  REGRESSION risk before it is a prosody gain: the `。` opening the marker is what makes the model
  leave a gap in front of it, and that gap is the only thing that makes the marker findable
  (measured: `はちじ。ででで` leaves 1.12s and strips cleanly, `はちじででで` leaves 0.24s and is not
  recognised at all). Inserting `？` immediately before the `。` changes the phrasing the model sees
  at exactly the point the mechanism depends on. Seven clips have already shipped with an audible
  marker; a change that makes that more likely has to be measured before it is adopted, not after.
- **Impact:** every question card in the live deck falls where a native speaker would rise. It is
  wrong, it is not misleading (the か is written on the card and is what carries the question), and
  it is on 328 cards that are already scheduled. Bulk-regenerating them would re-bill every one and
  re-open takes a human has already tuned, which is why the trial is specified as new cards only.
- **Status:** open — procedure documented, never executed.
- **When to revisit:** the next Japanese unit that contains question cards, which is when the trial
  is free of any regeneration cost at all. Generate that unit's か-final cards both ways, measure the
  end gap against the trim tolerance FIRST, and only listen for the contour on the takes that still
  strip cleanly. A rise that costs the marker is not a win.

<!-- WS6 -->

## "Delivered" is a collection-level fact, so a unit's delivered state is inferred

- **What:** `anki-delivered.json` records that a COLLECTION was pushed to Anki, not which units were
  in that push. `unitState()` therefore answers `delivered` for a unit by narrowing the collection's
  marker: a unit must be `done` and in a current package before it can count, and when the marker
  records `deliveredCardIds` the answer is exact — a unit is delivered iff one of its own card ids is
  in that baseline.
- **Why:** the precise answer only exists for deliveries made after `deliveredCardIds` landed. For
  the two collections delivered before it, the marker holds only `{note, ankiParent,
  lastDeliveredAt}`, so the honest fallback is to treat every done unit of a delivered collection as
  delivered. Guessing the other way would hand a mutating tool a free pass over live cards.
- **Impact:** on a pre-baseline marker, a done unit that was never actually pushed (added after the
  last deliver) reads as delivered and asks for `--force-delivered` it does not strictly need. That
  is the safe direction of the error, and it self-corrects on the next real deliver, which records
  the baseline.
- **Status:** open — self-resolving on the next deliver of each collection.
- **When to revisit:** once both live markers carry `deliveredCardIds`, the fallback branch in
  `markerCoversUnit` is dead code for this workspace and could become a warning instead.

## The two delivered collections keep bare note guids, and are not being retrofitted

- **What:** `output/epubs/japanese-for-busy-people-book-1-kana` and
  `output/courses/nihongo-101-course-n5` both write BARE card ids as their packages' note guids
  (`book.json` has `"guidNamespace": null`, `course.json` has no such field). Every collection
  created after 024184c gets a namespace from its immutable slug; these two do not, on purpose.
- **Why:** a guid is what Anki matches a note by at import. Changing the guids of an already-imported
  deck makes every note look new, so a retrofit trades a hypothetical import collision for a certain
  one. The owner ruled: namespace new collections from creation, leave these two alone.
- **Impact:** an `.apkg` import of one of them into an Anki collection already holding the other can
  overwrite notes that share a card id. The AnkiConnect path is unaffected (deck-scoped, matched by
  `abid:` tag), and the mitigation is the runbook rule that a bare-guid deck is never `.apkg`-imported
  into a collection holding another. `npm run preflight` prints each collection's mode.
- **Status:** open — deliberate, with a stated trigger.
- **When to revisit:** when `scripts/verify-apkg-import.mjs` has been run against a namespaced and a
  bare build of the same deck and shown what a guid change does to the restore path. That answer, not
  a preference, decides whether a retrofit is worth doing.
- **Verified by:** `node scripts/preflight.mjs --all --only guid-namespace`

## A run-dir deck built before namespacing will not update on re-import

- **What:** a bundled template or one-off run dir now derives its guid namespace from its directory
  identity (`numbers-ja`), because it has no marker file to record a decision in. Any package built
  from such a dir BEFORE this shipped bare ids.
- **Why:** the alternative was inventing a marker file for the run-dir shape, which is more machinery
  than the case needs — a run dir's path is already the immutable identity its package is named after.
  There were no template collections on disk when this landed, so nothing was affected in practice.
- **Impact:** if an older run-dir deck does turn up and is re-imported after a rebuild, the notes
  arrive as new ones rather than updating the existing ones. The remedy is one step: delete the old
  deck in Anki before importing the rebuilt package (that deck has no delivery history to protect —
  the AnkiConnect path does not manage run-dir decks).
- **Status:** open — no known instance.
- **When to revisit:** the first time a pre-namespace template deck is rebuilt and re-imported.

## Three delivery write paths are written but dormant, waiting on the live probes

- **What:** the guarded `modelTemplateAdd` path (`--allow-template-add`), the `--refile` run and the
  `--suspend-orphans` run all exist, are tested, and refuse to execute. `src/anki/probeEvidence.js`
  holds an `answer: null` for every question `scripts/anki-behaviour-probe.mjs` would settle, and
  each feature names the evidence it lacks when it refuses. The `--dry` previews work today.
- **Why:** each is a live write to a card's scheduling state whose behaviour on a card in a filtered
  deck nobody has established. Shipping them on an assumption is the failure this project keeps
  paying for; deleting them would mean re-deriving the design when the answers arrive.
- **Impact:** a deck-name correction cannot reach the existing book yet, a post-delivery exclusion
  still leaves a card the learner drills, and a new card direction has to be added by hand in Anki.
  All three are stated in `references/deliver.md` with the probe each waits on.
- **Status:** open — blocked on a human probe session (two minutes in Anki's profile manager, then
  `node scripts/anki-behaviour-probe.mjs --check`).
- **When to revisit:** as soon as a probe session is run. Record each answer in BOTH halves of the
  record (the runbook table and `probeEvidence.js`) in one commit; a test fails if an id exists in
  one and not the other.

## The delivery add ceiling is a fixed 200, not a proportion

- **What:** `DEFAULT_MAX_ADDS = 200` per collection per deliver, overridable only by
  `--allow-bulk-add` (there is no `--max-adds`).
- **Why:** the ceiling exists to catch a matching failure that would re-add a book, and a proportion
  of the collection's size would have been derived from the same lookup the failure broke. A flat
  number cannot be argued into being wrong by the bug it is watching for.
- **Impact:** the first delivery of any collection larger than 200 cards needs the flag, which is
  exactly the case where reading the `--dry` output is worth the minute. A future 190-card book
  would deliver in one go with no prompt at all.
- **Status:** open — deliberate.
- **When to revisit:** if a legitimate incremental deliver (not a first run) ever trips it.

## The .apkg's own deck-options preset may not survive import at all

- **What:** the package ships preset id 1000001 `anki-builder` (bury on) and points every deck it
  builds at it, deliberately not at `Default` (id 1). Whether Anki's importer honours a non-1 preset
  id — or remaps it, or drops it and reassigns the deck to Default — has never been verified.
  `src/deck/verifyImport.js` documents only the id-1 question, and its `dconfIdOneCollided` answer
  does not cover the new row.
- **Why:** the alternative was writing our scheduling choices into id 1, which is a preset every
  collection already has: that reaches every deck the owner has that we never built. A preset that
  might be ignored is strictly better than one that might overwrite theirs.
- **Impact:** if the importer ignores it, the bury setting silently does not apply on a fresh import
  and the deck's options are whatever its assigned preset says. That is the same position as before
  this change, and the runbook's "tick both bury settings by hand, once" line is what actually
  guarantees the fix — which is why that line is primary and this is called hygiene.
- **Status:** open — unverified, low cost either way.
- **When to revisit:** next time `scripts/verify-apkg-import.mjs` is run; add an assertion for which
  preset the imported decks end up pointing at, and what the collection's dconf table then holds.

<!-- Live-collection incidents -->

### A pre-WS6 deliver cross-bound と and から, and the owner found it in study

**What.** On 2026-08-17 the owner reported that a から card had changed meaning from "from" to
"because". It had. Four live notes were bound to the wrong card ids, and two pairs had their content
straight-swapped, audio included:

| note | deck | showed | should have shown |
|---|---|---|---|
| 1784507481510 | Lesson 03 | から "Because (particle)" | から "From (particle)" |
| 1785019499117 | Lesson 06 | から "From (particle)" | nothing: its card is excluded on disk |
| 1784508481630 | Lesson 04 | と "With, together with" | と "And (particle)" |
| 1785019498813 | Lesson 06 | と "And (particle)" | と "With, together with" |

Note 1784507481510 had accumulated three `abid:` tags (`kara-particle`, `kara-particle-because`,
`kara-particle-place`), which is the fingerprint of the bug: one note claimed by three card ids.

**Why.** `deliver.js` identifies a note by its `abid:<card id>` tag and, failing that, by a content
fingerprint. Both と and から appear several times across this book in different senses, so a card
whose id had no tagged note yet matched a note that merely shared its target, overwrote that note's
fields, and added its own tag. Last writer won. This is the cross-bind the 2026-08 review identified
(17 repeated targets in this book) and WS6 fixed going forward by unit-scoping the fingerprint
indexes, deleting the loose prefix fallback, and reporting rather than silently binding a note it
cannot uniquely identify. The damage already in the collection was not undone by that fix, because
nothing retroactively unpicks a bind.

**Impact.** The owner studied a wrong meaning on a 26-day interval for an unknown period, and heard
the wrong audio with it. Found by a human noticing, not by any check: preflight reads the on-disk
decks, and nothing compares them against the live collection. `deliver --dry` is what surfaced it,
because WS6's version reports a note matched outside its expected deck.

**Repaired 2026-08-17.** Fields rewritten from disk through the repo's own `noteFields()`, tags
reduced to exactly one id per note, and the Lesson 06 から duplicate (whose card is excluded on disk)
tagged `ankibuilder-orphan` and suspended rather than deleted. Every interval and rep count was left
untouched and verified afterwards. `kara-particle-because` now owns no note, so the next content
delivery adds it as a genuinely new card in Lesson 14, which is the right outcome: that sense was
never actually learned.

- **Status:** open
- **Verified by:** `node --env-file=.env scripts/deliver-to-anki.mjs --dry` (every `abid:` tag should
  resolve to exactly one note, and no note should be reported as matched outside its expected deck)
- **When to revisit.** If a delivery ever again reports adopting a note under an old deck name, check
  tag multiplicity on the notes involved before running it. A check that walks the live collection
  looking for a note carrying two or more `abid:` tags would have caught this the day it happened, and
  is the obvious next guard if it recurs.

### A rebuilt-from-scratch lesson lands in a NEW run directory, leaving a husk

**What.** Emptying a unit dir (deleting `corpus.json`/`cards.json`) and re-running the
`--book`/`--lesson` form of `assemble` does not rebuild in place: the run directory is allocated by
taking the next free sequence number, and the number this lesson already holds is only reclaimed via
the claim file that a FAILED build leaves behind (`clearOnFailure: false`). A build that SUCCEEDED and
was then emptied by hand has no claim, so the rebuild takes a fresh number. Lesson 15 rebuilt into
`chapter-16` while `chapter-15` was left holding nothing but `.bak` files.

**Why it does not break anything.** Directory numbers are allocation order, not lesson or spine
numbers, and never matched them (`chapter-14` is spine 34). Deck paths come from `meta.chapterLabel`,
the dedup library is keyed on `(epubHash, meta.chapterNumber)`, and both were correct in the new
directory. The cost is legibility, not correctness.

**Impact.** The tree stops reading as "chapter-N is lesson N-ish" and an empty husk sits where the
work used to be. Preflight does not notice either: a unit-shaped directory with no `cards.json` is
skipped silently rather than reported, so the coverage header counted the new unit and said nothing
about the husk.

**Handled 2026-08-17** by moving the rebuilt unit back into `chapter-15` and deleting the husk, and by
documenting in SKILL.md that a from-scratch rebuild must use `--run <that same runDir>`.

- **Status:** open
- **Verified by:** `ls output/epubs/<book>/` — a unit directory holding only `.bak` files is a husk
- **When to revisit.** If this recurs, the cheap guard is a preflight line for a unit-shaped directory
  with no `cards.json`, which would also have caught it here. The deeper fix is for the `--book`/
  `--lesson` form to reuse the directory whose `meta.chapterNumber` matches the resolved spine index,
  rather than always allocating.

### Paradigm-table restraint outranked the irregular-form rule, and dropped both irregular verbs

**What.** Lesson 15 of the Japanese book teaches the ます→dictionary-form conversion. Its WORD POWER
chart has ten cells in three groups, the third headed **Irregular**. The extraction carded three of
the ten and said so in its coverage report, citing the prompt's paradigm-table restraint rule ("the
complete set of forms for a few representative words teaches the pattern"). Among the seven it dropped
were くる and する, the only two irregular verbs in Japanese and the entire reason the chart has a third
group.

**Why.** The prompt held both rules and connected neither: restraint on large paradigm tables, and "a
form the chapter names as an EXCEPTION is high priority, never optional… watch for the words but,
except, instead, **irregular**". A sampling rule and a never-sample rule met on one table and the
sampling rule won. A second, subtler cause: the chart is a DERIVATION table, one output form per word,
where the derivation differs per row (-ki→-ku, -i→-u, -mi→-mu, -ri→-ru), so "a few representative
words" sampled the wrong unit — a learner shown only ききます→きく cannot produce かいます→かう.

**Impact.** The chapter's own grammar point would have shipped with its two underivable cells missing.
Nothing downstream could have caught it: every later pass reads text only, and the chart is an image.
The gate-1 image sweep caught it, which is the only reason it is a near-miss rather than an incident.

**Fixed 2026-08-18.** `docs/epub-extraction-prompt.md` now states that restraint never applies to a
cell the source marks irregular or exceptional, and that a derivation table is sampled per distinct
derivation rather than per word. `SKILL.md` now says a paradigm found in an image is BASE-lesson work
to be added before gate 1, not material for the Step 3b brief — adding it later is impossible, since
nothing may be added after sign-off. The seven missing cells were authored by hand into Lesson 15.

- **Status:** open
- **Verified by:** open the chapter's chart image and check every cell against `cards.json`; the
  eval fixture in `src/evals/` is the mechanical version once a chart-bearing chapter is added to it
- **When to revisit.** If a future lesson's chart is sampled the same way despite the amended prompt,
  the prompt is not the lever and the check has to be mechanical: a `paradigm-grid` spec authored per
  chart-bearing chapter, run at gate 1.

## The whole-book taught index is a command, not something a lesson build pays for

- **What:** `getTaughtIndex()` (was `ensureTaughtIndex`) no longer builds on demand. It reads the
  book's cached index and returns null when there isn't one; building is `anki-builder epub
  taught-index <hash>`, which refuses to re-spend on a book that already has one unless `--force`.
  A build with no index falls back to reading the later chapters directly and logs the command that
  would fix it for every subsequent lesson.
- **Why:** building lesson 15 of a 57-chapter book fired an unannounced whole-book model pass
  partway through the lesson. It exhausted the usage window, and the four passes after it in the
  same build then failed in turn — the index build, the forward flags, the pedagogical sort, the
  drill mining and the note pass, all lost to one implicit call nobody asked for. The one-time cost
  was never the problem; its timing was.
- **Impact:** a book nobody has run the command for pays the slower per-lesson fallback (the model
  reads every chapter after this lesson) instead of silently paying the whole-book cost once. That
  is the deliberate trade: predictable per-lesson spend by default, the cheap path when an operator
  chooses it. The fallback is a real quality path, not a degraded one — it is what the pass did
  before the index existed.
- **Verified by:** `node -e "import('./src/corpus/epubTaughtIndex.js').then(m => console.log(m.getTaughtIndex.toString().includes('build = false')))"`
- **Status:** resolved (2026-08-18)
- **When to revisit:** if operators keep forgetting to run it and lessons keep taking the slow path,
  make `assemble` refuse to start on a book with no index rather than falling back — but only with
  a flag to override, never by spending on their behalf.

## Recovery is driven by a ledger on the unit, not by a human's memory of what failed

- **What:** every model pass records `ok` / `failed` / `skipped` (with a reason) at `meta.passes`
  (`src/cards/passLedger.js`), a FAIL-tier preflight check refuses a unit with an incomplete pass,
  and `anki-builder resume --run <dir>` re-runs exactly the failed ones. The hand-driven recovery
  script that did the same job from operator-picked flags has been deleted rather than kept
  alongside: two recovery paths drift, and the one that drifts is the one nobody ran this month.
- **Why:** `prepare`'s markers already made its own passes recoverable; the four passes outside it
  wrote nothing, so a quota interruption was both invisible and unrecoverable. The instance: a lesson
  reached its review gate with the romanization correction never having run, and the only thing that
  knew was a log line that had scrolled away.
- **Extras units were a blind spot until 2026-08-19:** only `assemble` and `translate` wrote to the
  ledger, and a hand-authored extras unit runs neither, so all 15 of them carried no `meta.passes` and
  the FAIL-tier check went silent on half the collection without saying so. `prepare` now stamps the
  five passes it owns, which every unit runs.
- **The ledger reports what the UNIT achieved, not what one run did.** `prepare` skips any pass whose
  marker is already set, so on a re-run those branches never execute. The first version stamped from
  this run's actions alone and so recorded `semanticDedup: skipped — no drill cards were mined` on a
  unit holding eleven of them. A pass skipped because its marker says it is done is now recorded `ok`,
  with the marker named as the evidence. A ledger that asserts something false about the unit is worse
  than no ledger at all, because the check that reads it is FAIL-tier.
- **Impact:** three passes are resumable because they only annotate or reorder. `extraction` is not
  and never will be — it IS the item set, so a failed extraction still means rebuilding the unit and
  losing anything hand-added since. `resume` reports that rather than attempting it. The ledger is
  also only as good as the passes that write to it: a pass added later that forgets to call
  `recordPass` is invisible to `resume` exactly as all four were before. `KNOWN_PASSES` is the list
  to check a new pass against.
- **Verified by:** `node --test test/cards/resumePasses.test.js`
- **Status:** resolved (2026-08-18)
- **When to revisit:** if a new model pass lands, confirm it appears in `KNOWN_PASSES` and calls
  `recordPass` on both outcomes; a pass that only records success is worse than one that records
  nothing, because it makes the ledger look complete.

## The package-freshness check reads mtimes, and git rewrites the mtimes of tracked deck JSON

- **What:** `preflight`'s `package freshness` check FAILs when a done unit's `cards.json` is newer
  than the collection's `.apkg`. Since the hand-reviewed JSON became git-tracked, any git operation
  that rewrites one of those files — a branch switch, a merge — bumps its mtime without changing a
  byte of it, and the check reports a stale package that is not stale.
- **Why:** mtime is the only signal available without hashing every card set on every preflight run,
  and before the JSON was tracked nothing but the pipeline ever wrote these files.
- **Impact:** a false FAIL after any branch operation that touches a collection's units. Observed
  2026-08-18: merging `feat/taught-index-command` rewrote `chapter-15/cards.json` at the exact second
  of the merge commit, and preflight then reported the just-rebuilt package as older than the unit.
  The failure mode is safe (it over-reports, never under-reports) and the resolution is a rebuild,
  which is cheap and deterministic — but a check that cries wolf after every merge is on its way to
  being ignored, which is the specific thing the FAIL tier cannot afford.
- **Verified by:** `git log -1 --format=%cI` on the merge commit, compared against
  `stat -f "%Sm" -t "%F %T" output/epubs/<slug>/chapter-*/cards.json`
- **Status:** open
- **When to revisit:** the moment someone dismisses this FAIL without checking. The fix is to compare
  CONTENT, not timestamps: stamp the source card sets' hash into the package build and compare that,
  so a byte-identical file rewritten by git is correctly seen as no change at all.

## A cache hit reports no verdict about the end marker, and that is no longer read as "clean"

- **What:** `fetchTermsToCache`'s cache-hit branch returns no `markerStuck` at all, because nothing was
  fetched and nothing was trimmed — it has no evidence either way. The writeback in
  `generateAudio` now distinguishes three states: `true` and `false` are verdicts from a real
  fetch-and-trim and either may overwrite the card, while `undefined` (a cache hit) leaves whatever
  the card already records untouched.
- **Why:** it used to be two states. `undefined` was falsy, so the writeback took the `delete`
  branch, and re-running `audio` over a unit with cached clips silently erased `audioMarkerStuck`
  from every marker-audible clip it owned. The clip on disk was byte-identical and still spoke the
  `。ででで`; the card asserted clean audio, the dashboard's **Marker audible** badge vanished, and
  preflight's ACK-tier audio-markers check passed. Found on 2026-08-19 on
  `chapter-15-extras/fib-donna-e-kaku-suki-q`: re-running `audio` to re-roll that one clip cleared its
  true flag instead of re-rolling it, and the unit then reported clean.
- **Impact:** the flag can now only be cleared by evidence, which is right, but it also means a flag
  set by a take that has since been replaced by hand outside the stage stays until something re-asks.
  That is what `scripts/audit-marker-stuck.mjs` is for.
- **Blast radius, measured:** ONE card, the one that surfaced the bug. Every removal of an
  `audioMarkerStuck` field from a tracked `cards.json` is in git, and there are only three commits:
  `a0dfa10` (the commit that began tracking the JSON at all), `79327cf` (the deliberate
  `audit-marker-stuck.mjs --apply` run that cleared the seven stale flags on 2026-08-14, each with a
  recorded positional proof that the clip's hand cut lands before its marker), and `6cb84a0` (this
  fix). No silent erasure happened in the tracked period. Before 2026-08-14 `output/` was untracked,
  so that window cannot be audited — but no clip in it has been reported marker-audible by ear
  either. There is no re-listening sweep to do.
- **Verified by:** `node --test test/audio/index.test.js` (the two tests named "a cache hit does NOT
  clear a marker-stuck flag..." and "a real trim that finds no marker DOES clear a stale flag")
- **Status:** resolved (2026-08-19)
- **When to revisit:** if a clip is ever reported marker-audible by ear on a card with no flag, that
  is a pre-fix erasure surfacing — note the unit, since it bounds how many others to re-listen to.

## Words taught but never used are now counted, and the standing count is large

- **What:** a new INFO-tier preflight check, `taught, never used`
  (`src/audit/checks/taughtNeverUsed.js` + `src/cards/taughtNeverUsed.js`), lists every card whose
  target appears inside no other card of the same lesson, judging a base unit and its `-extras`
  sibling together. It complements `vocab-coverage`, which asks whether a headword was carded at all;
  this asks whether a carded word is ever put to work.
- **Why:** lesson 15 reached both review gates with twelve of its twenty-one dictionary forms and
  five of its ます-forms carded bare and used in nothing, on a chapter whose entire grammar point is
  the ます↔dictionary correspondence. Vocabulary coverage was perfect. The extras reference stated the
  rule in prose ("every content word that appears in no sentence gets one") and left the counting to
  whoever remembered, and the natural reading of "the chapter's vocabulary" is the vocabulary TABLE,
  which is exactly the reading that misses conjugation charts.
- **Impact:** it starts at **118 findings on the book and 121 on the course**, and it must stay INFO
  until those have been read. A meaningful share are legitimate standalones — greetings, exclamations,
  fixed replies — which no rule can separate from stranded words without reading the gloss, so the
  message names each one for a glance. The discriminator is a per-lesson median target length rather
  than a per-language constant; on the live book that dropped 68 of 186 raw containment hits, all set
  phrases or whole sentences. It needs a lesson-sized input to mean anything: on a handful of cards
  the median lands on a sentence and the answer is an artefact of the sample.
- **Verified by:** `node --test test/cards/taughtNeverUsed.test.js`
- **Status:** open (check shipped; the live counts are unreviewed)
- **When to revisit:** once a book's count has been read through once. If what remains is genuinely
  all legitimate standalones, that is the moment to consider a `legitimatelyStandalone` marker on the
  card rather than promoting the tier — the count only becomes useful when it can go to zero.

## Un-reviewing a unit that already has audio used to strand it at gate 2

- **What:** the dashboard picked a unit's review gate from "does any card have a clip" alone
  (`loadStageData`, `src/server/adapters/stage.js`). It now requires `meta.reviewed === true` as well,
  so an unreviewed unit sits at the corpus gate whether or not it has been voiced.
- **Why:** the old rule was sound while clips could only exist after a sign-off — the `audio` CLI
  stage refuses an unreviewed unit. `Unreview` breaks that, and so does adding cards to a unit that
  has already been voiced. The unit went back to `reviewed: false`, the stage stayed `audio`, and the
  reviewer was parked at gate 2 where **Mark done** correctly refuses ("this lesson has not passed the
  corpus review") and the page offers no way to do the corpus review it is demanding. A dead end
  reachable from the dashboard's own button, hit on 2026-08-19 on `chapter-15-extras`.
- **Impact:** none on the normal path — a reviewed unit with clips is still the audio stage. The
  clips are kept when a unit moves back to gate 1; only which gate is rendered changes. Two tests had
  encoded the old assumption by giving a fixture audio with no `reviewed` flag, a state the CLI cannot
  produce; both now say so explicitly.
- **Verified by:** `node --test test/server/stage.test.js`
- **Status:** resolved (2026-08-19)
- **When to revisit:** if a third gate is ever added, this is the function that decides which one a
  unit is at, and "the artifact exists" will be the wrong test for that one too.

## The end-marker flag recorded the intent to cut, not whether anything was cut

- **What:** `autoTrim`'s `markerStuck` now requires BOTH that the marker was located
  (`flags.markerStripped`) AND that a trim point was actually applied (`flags.trimmedTo`). It used to
  read only the first.
- **Why:** `markerStripped` is set the moment a candidate passes the pulse-shape check — the decision.
  `computeTrimPoint` can then return null, because the speech runs to the end of the file and there is
  no trailing silence to cut against, which is precisely the shape a marker that ran long produces.
  Nothing is removed, the clip ships whole with the marker audible, and the flags say it was stripped.
- **Impact, measured on the live book:** **52 of 1,978 marked takes (2.6%) came out exactly as long as
  their originals. The badge caught 0 of them. The operator hand-trimmed all 52 by ear** — doing the
  trim's job fifty-two times while the mechanism meant to warn them stayed silent. Re-deriving those
  52 with the fix flags 43; the other 9, and 6 false positives across 1,926 good clips, are mostly the
  trim rules having changed since those clips were made, so the replay is not exact. Going forward the
  invariant is exact, because it is asked of the take as it is produced.
- **Verified by:** `node --test test/audio/trimSilence.test.js test/audio/index.test.js`
- **Status:** resolved (2026-08-19)
- **When to revisit:** a second, independent instrument is still worth having — a preflight check
  comparing each stage-owned marked clip's duration against its `.orig.mp3` would catch this whatever
  the flag says. It is ~2,000 ffprobe calls, so it wants to be its own command rather than part of the
  default sweep.

## The source EPUB's OCR corrupts small kana, and nothing checks the target against its own romaji

- **What:** this book's scan renders small ょ/ゅ/っ as large よ/ゆ/つ in places, so extraction faithfully
  produces cards whose target is not a word — `いっしよに`, `たべましよう`, `しゆうまつ`, `ちよつと`,
  `しよくじ`. Ten such cards reached gate 1 on Lesson 16, including every ましょう cell of the chapter's
  own paradigm table. Corrected by hand at gate 1 and documented in SKILL.md; only chapter 16 of 2,223
  cards was affected.
- **Why extraction is not at fault:** copying the source verbatim rather than silently "correcting" a
  book it cannot second-guess is the right default, and it did flag the two vocabulary rows whose
  gloss made the damage obvious (`つき、` for つぎ, `ゆさ` for ゆき). What it cannot see is that a small
  kana was scanned large, because the result is still valid kana.
- **Impact:** a corrupt target teaches a non-word AND is voiced wrong by TTS (い-っ-し-よ-に). The
  detection is currently a hand sweep with a regex whose false-positive rate is high — 47 hits, 7 real,
  because `にぎやか`, `おみやげ`, `にちようび` and the `や` particle legitimately take a large kana. It
  found the paradigm cells only because the cell-by-cell audit reported them empty.
- **The check worth building:** the romanization pass normalizes to the INTENDED reading, so a corrupt
  target ships beside a correct romaji — `いっしよに` / `issho ni`. Romanizing the target and comparing
  it to the stored `pronunciation` would catch this class deterministically, with no per-book regex and
  no false positives from legitimate large kana. It needs the kuroshiro adapter at check time, which is
  a ~40MB dictionary load, so it belongs in `npm run check` rather than the default sweep.
- **Verified by:** `node scripts/vocab-coverage.mjs <chapterFile> <unitDir>` reports each corrupt card
  as MISSING with the correct form as its nearest card target
- **Status:** open (instances fixed; no automated check yet)
- **When to revisit:** the next book. If a second source shows the same damage, build the round-trip
  check rather than re-deriving the regex — a hand sweep that is 85% false positives will get skipped.

## The dashboard's Exclude toggle wrote only cards.json, so exclusions drifted from the corpus

- **What:** `setCardExcluded` (`src/server/adapters/applyCards.js`) now mirrors the flag into
  `corpus.json` as well, in both directions, and reports whether it did. It is silent when the corpus
  has no such item (a mined `fillInBlank` card exists only on the cards side by design) or when the
  unit has no corpus at all.
- **Why:** the two files are read by different things. The deck build and the review read
  `cards.json`; `translate` and `resume` rebuild the cards FROM `corpus.json`. An exclusion recorded
  in only one is a decision with a shelf life — the next rebuild silently reinstates an excluded card,
  or re-drops a restored one. Every `scripts/` tool that excludes has mirrored for exactly this reason
  and says so in its comments; the dashboard toggle, which is where almost every real exclusion is
  actually made, did not.
- **Impact:** found live on 2026-08-19 when a reviewer restored a card at gate 1 and the two files
  disagreed. Preflight's `corpus drift` check reports it, and it has been quietly accumulating: four
  units of the live book carry unmirrored exclusions from before this fix (`hiragana-sa`,
  `hiragana-ki`, `topic-particle-wa`, `object-particle-o`, and five counter suffixes), plus one corpus
  id with no card at all. **Those are NOT repaired by this change** — they are done, delivered units,
  and rewriting deck data the owner has shipped is their call, not the fix's. `cards.json` is the
  truth for each: it is what the package was built from.
- **Verified by:** `node --test test/server/applyCards.test.js`
- **Status:** resolved for new exclusions (2026-08-19); the four historical units are open
- **When to revisit:** if `corpus drift` is ever promoted above INFO, the historical four have to be
  repaired first or the check lands red on day one.

## Coverage misses come from reading a PREFIX, and three checks now exist because of it

- **What:** `scripts/chapter-outline.mjs` (+ `src/corpus/chapterOutline.js`) prints a chapter's own
  sections and, crucially, the book's numbered runs — `EXERCISES: 8 block(s) — I … VIII`. SKILL.md now
  requires it as the FIRST step of an EPUB build, ahead of the image sweep, and requires accounting for
  every numbered block when the review link is handed over.
- **Why:** three lesson-level misses in two chapters, all the same shape — enumerate, process a
  prefix, conclude. Lesson 15: four charts named, two opened, sweep reported complete; the unread two
  held the chapter's main grammar table. Lesson 16 text: 780 lines of 942 read, EXERCISES VI and VII
  never seen, and VII is the only place the chapter uses `みなみぐち` and `しんじゅく`. Lesson 16 extras:
  33 hand-authored cards against a median of 57, from the same partial read. None of the individual
  steps was wrong, and no amount of reading carefully fixes it, because **a section you did not read is
  indistinguishable from a section with nothing in it.**
- **What it rests on, deliberately separated:** the completeness guarantee is the FILE BOUNDS, which
  are universal — `extractChapterToFile` already writes exactly one lesson's content, so the script
  prints all of it and stamps `END OF CHAPTER`. That works for any EPUB. The structure summary on top
  is a bonus of two different qualities: the text-vs-image balance is generic (a chapter with little
  text and many figures has its content in the pictures, which is a real shape and not an empty
  chapter), while the numbered runs (`EXERCISES: I … VIII`) are read off ONE publisher's marker images
  and are empty for front matter, for a novel, and for any book that numbers differently. The script
  states that explicitly, because an empty checklist must read as "this book does not number things"
  and never as "there is nothing to read". An earlier cut of this had the numbered run as the
  backbone, which would have silently degraded to no signal at all on book #2.
- **Impact:** the outline is structural only — it says nothing about what belongs on a card, which is
  the judgement it exists to make possible about ALL sections rather than a prefix.
- **Verified by:** `node --test test/corpus/chapterOutline.test.js`, and
  `node scripts/chapter-outline.mjs 1fab0f99d1195ad9 38` reports the 8 exercises that were missed
- **Status:** resolved (2026-08-20)
- **When to revisit:** if a fourth miss of this class happens, the answer is not another checklist —
  it is that the extraction pass should report its own coverage per section, so the account is produced
  by the thing doing the reading rather than by the operator watching it.

## A half-covered vocabulary cell reads exactly like a false positive

- **What:** `parseVocaEntries` now splits a headword cell on `／` and emits one entry per word, so
  `つま ／ かない` is checked as two headwords rather than one string. SKILL.md records both this and
  the containment case below.
- **Why:** reporting the cell whole produced `MISSING つま ／ かない … nearest card target: つま` — the
  `nearest` pointing at the half that IS carded, which is indistinguishable from the documented
  optional-parts noise (`(お)てら` vs `おてら`). Two words sat unreported behind that shape for the life
  of the deck: `かない`, and `しゅじん`, which four sentence cards already used with nothing teaching
  it. The check was working; reading it was not.
- **Impact:** a second, related blind spot remains and is NOT fixed. A headword can be hidden by a
  longer word containing it — `しゅじん` still reads as covered because `ごしゅじん` is carded, and those
  are different words. Containment is deliberate elsewhere (a word used inside a sentence does count),
  so narrowing it would create false positives across the whole deck. The honest mitigation is in
  SKILL.md: when a finding's only coverage is another vocabulary entry rather than a sentence, check
  by hand.
- **Verified by:** `node --test test/cards/vocabCoverage.test.js`, and a full-book re-scan that
  surfaced `かない` as its own finding where it had previously been invisible
- **Status:** resolved for the `／` case (2026-08-20); the containment case is open
- **When to revisit:** if a third word is found this way, the fix is for the extraction prompt to emit
  one item per alternate at source, rather than for the coverage check to reconstruct the split later.

## note-claims only matched an identity phrasing the deck never writes

- **What:** the `identity` claim pattern matched `the same word` / `the same as` only. Widened to cover
  `also read`, `also called`, `another word for`, `both mean`, `same meaning as` — the phrasings the
  deck's notes actually use.
- **Why:** `つま`'s note said *"Also read かない (kanai) — both mean 'my wife'"*, and `かない` had no card
  anywhere in the deck. That is precisely the class the check exists to surface — a note naming a form
  the deck does not teach — and it stayed silent, because a pattern that only matches a phrasing
  nobody writes is silent by construction. `おっと`/`しゅじん` was the same. Both words were eventually
  found by hand, from the owner studying a card.
- **Impact:** the widening surfaces 18 identity claims on the live book, of which 3 name a form with
  no card and **all 3 are false positives** — `きのう` and `ソファー` are carded (the note writes `ソファ`
  without its long vowel) and the third quotes a whole sentence. So the immediate yield on this deck is
  zero new real findings, because the two real ones were fixed before the pattern was widened. It is a
  correctness fix for the next book, not a discovery for this one, and it costs a little INFO noise.
- **Verified by:** `node --test test/audit/checks.test.js` — the test fails against the old pattern
- **Status:** resolved (2026-08-20)
- **When to revisit:** if the identity findings become noise nobody reads, the fix is to compare the
  named form against the deck AFTER normalizing long vowels and dropping sentence-length quotes,
  rather than to narrow the pattern back.
