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
