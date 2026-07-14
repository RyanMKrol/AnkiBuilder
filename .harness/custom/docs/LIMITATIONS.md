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

## EPUB block extraction is regex-based HTML parsing, not a real parser

- **What:** `extractTextBlocks` (`src/corpus/epub.js`) finds text blocks with a regex over tag names
  (`p|li|dt|dd|td`) rather than a proper HTML/XML parser. A tag-name lookahead now guards against the
  specific bug found in practice (`<link .../>` in `<head>` matching as a prefix of `<li>`, causing the
  regex to swallow everything up to the next unrelated `</li>` into one corrupted block — observed
  first-hand on a real textbook EPUB, where it merged CSS/meta tags and an entire dialogue+vocabulary
  section into a single ~6,500-character "block"). The fix only closes this one prefix-collision class
  of bug; it is not a general HTML-correctness guarantee (e.g. it still doesn't handle self-nesting or
  malformed/unclosed tags of the matched types themselves).
- **Why:** a full HTML parser is heavier than this mechanical extractor's stated scope; the regex
  approach was accepted as "good enough" for well-formed EPUB content, and this class of bug wasn't
  caught until tested against a real, messy production EPUB rather than hand-written fixtures.
- **Impact:** any future tag added to the matched set (or any oddly-formed real-world EPUB) could
  reintroduce a similar corruption silently — the extractor doesn't detect or warn when a block looks
  anomalously large.
- **When to revisit:** if another prefix-collision or similar corruption surfaces again, replace the
  regex with a real (even minimal) HTML tokenizer rather than patching another one-off boundary case.

## EPUB LLM extraction is a standalone primitive, not yet wired into the corpus/cards pipeline

- **What:** `extractChapterViaLlm` (`src/corpus/epubLlmExtract.js`) extracts vocabulary/key-sentence
  items from ONE chapter file at a time, by having the model read the raw chapter XHTML directly
  (validated empirically against `assemble --epub`'s existing mechanical, regex-based path — this
  approach caught vocabulary an un-glossed section required inferring, which the regex extractor
  cannot do at all). Its output shape (`id`/`english`/`target`/`notes`/`uncertain`/`aiSuggested`)
  does not match either `CORPUS_SCHEMA` or `CARDS_SCHEMA` in `src/model/index.js` — neither
  produces a `category`, and `CARDS_SCHEMA` also requires `pronunciation`, which this pipeline
  does not generate. There is also no CLI command wired up yet, and no multi-chapter orchestration
  (a real book needs EPUB spine-order chapter enumeration, which nothing in this codebase does yet
  — `extractTextBlocks`'s mechanical path doesn't either, it iterates zip central-directory order).
- **Why:** the extraction primitive (prompt template + `claude -p` invocation + response parsing)
  and the pipeline-integration questions (schema fit, category assignment, whether/how to generate
  pronunciation, chapter ordering, multi-chapter merging) are separable concerns; the primitive was
  validated and built first rather than guessing at the integration design.
- **Impact:** `extractChapterViaLlm` cannot currently be used to produce a real deck end-to-end —
  it has to be called directly (not via the `anki-builder` CLI), on one already-known chapter file
  path, and its output isn't consumable by the existing `audio`/`deck` stages as-is.
- **When to revisit:** before or when building the CLI-facing command for this path — needs a
  decision on schema fit (extend `CARDS_SCHEMA` to make `pronunciation`/`category` optional, or
  define a new schema for LLM-extracted cards) and a spine-order chapter enumerator.
