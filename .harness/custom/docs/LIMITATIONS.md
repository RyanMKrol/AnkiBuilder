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

## `assemble --chapter` handles one chapter file, not a whole `.epub` archive

- **What:** the mechanical, regex-based EPUB extractor (formerly `src/corpus/epub.js`) has been
  deleted entirely. `assemble --chapter <path> --lang <language>` now uses the LLM-based extractor
  (`src/corpus/epubLlmCorpus.js` → `epubLlmExtract.js`), which reads ONE already-extracted chapter
  `.xhtml` file directly via the model's own Read tool. There is no code anywhere in this
  repository that opens a real `.epub` archive, enumerates its chapters in correct (spine) reading
  order, or loops the extractor across a whole book — a user has to already have a single chapter
  file extracted on disk to pass to `--chapter`.
- **Why:** the extraction primitive and the whole-book orchestration (unzip, spine-order chapter
  enumeration, per-chapter looping, merging results into one corpus) are separable concerns; the
  former was built and validated first rather than guessing at the orchestration design up front.
- **Impact:** building a deck from a real textbook currently requires manually extracting each
  chapter file from the `.epub` zip and running `assemble --chapter` once per chapter, then merging
  the resulting `corpus.json` files by hand — there's no single-command "build my whole book" path.
- **When to revisit:** when whole-book support is actually needed — requires a spine-order chapter
  enumerator (reading `content.opf`) and a loop that merges each chapter's corpus into one.

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
