import { runClaudeWithPrompt } from "../util/runClaude.js";

/**
 * The EPUB-family runners — one per pass, not one for the family.
 *
 * These calls are not interchangeable. Chapter extraction is agentic (the model uses its own Read
 * tool on the chapter file), takes minutes, and its misses are silent and unrecoverable: an item it
 * never emits is never seen by anyone again. The pedagogical sort is a permutation that is checked
 * mechanically and fails open. Running both off one knob meant tuning one always re-tuned the other,
 * so each pass now has its own `ANKI_BUILDER_<PASS>_MODEL` / `_EFFORT` / `_TIMEOUT_MS` triple, with
 * the old `ANKI_BUILDER_EPUB_LLM_*` pair still honored underneath it (nothing anyone already set
 * stops working) and `ANKI_BUILDER_LLM_*` under that again.
 *
 * The TIMEOUT is part of the same triple on purpose. Effort and wall clock move together: raising a
 * slow agentic pass to `high` under the shared 10-minute ceiling would convert a quality knob into a
 * hard mid-pass abort, having already spent the money. See docs/PIPELINE.md for the full table.
 *
 * Every pass injects its runner as `runClaude`, so tests pass a stub and no real binary runs.
 */
const FAMILY_PREFIX = "ANKI_BUILDER_EPUB_LLM";
const MAX_BUFFER = 20 * 1024 * 1024;

/**
 * The pin for every pass in this family, as data.
 *
 * Declared in one table rather than at each call because a test asserts over it: every pass must
 * name a model and an effort, and `FORWARD_FLAGS` must outrank the pass it checks. A pin that lives
 * only as an argument is a pin nothing can check, and the whole point of pinning is that it is not
 * a convention people remember.
 */
export const EPUB_PASS_PINS = Object.freeze({
  EXTRACT: { model: "claude-sonnet-5", effort: "high", timeoutMs: 25 * 60 * 1000 },
  CONVENTIONS: { model: "claude-sonnet-5", effort: "high", timeoutMs: 15 * 60 * 1000 },
  TAUGHT_INDEX: { model: "claude-sonnet-5", effort: "high", timeoutMs: 15 * 60 * 1000 },
  FORWARD_FLAGS: { model: "claude-opus-5", effort: "medium", checks: ["EXTRACT"] },
  SORT: { model: "claude-sonnet-5", effort: "medium" },
  FILL_BLANK: { model: "claude-sonnet-5", effort: "medium" },
  FAMILY: { model: "claude-sonnet-5", effort: "medium" },
});

function epubRunner(scope, defaults = {}) {
  const scopeEnvPrefix = scope ? [`ANKI_BUILDER_${scope}`, FAMILY_PREFIX] : [FAMILY_PREFIX];
  return (prompt) =>
    runClaudeWithPrompt(prompt, { scopeEnvPrefix, defaults, maxBuffer: MAX_BUFFER });
}

/**
 * Chapter extraction. Effort `high`, and 25 minutes rather than 10.
 *
 * This is the one pass in the pipeline whose failure mode is silent AND unrecoverable, and it is
 * agentic — which is exactly where effort buys reading discipline over a long file with several
 * competing inclusion rules. The timeout goes up with it because a measured live run of one mid-book
 * chapter at Sonnet-medium already took over four minutes; `high` on a longer chapter has to have
 * room to finish rather than abort at the ceiling.
 */
export const runExtractionClaude = epubRunner("EXTRACT", EPUB_PASS_PINS.EXTRACT);

/**
 * The one-time whole-book conventions analysis. Batched over chapter ranges (see
 * epubBookConventions.js), so this ceiling is per BATCH, not per book.
 */
export const runBookConventionsClaude = epubRunner("CONVENTIONS", EPUB_PASS_PINS.CONVENTIONS);

/** The one-time taught-content index — the whole book again, read to build the forward-flag input. */
export const runTaughtIndexClaude = epubRunner("TAUGHT_INDEX", EPUB_PASS_PINS.TAUGHT_INDEX);

/**
 * Forward flags: which of this chapter's items a later chapter explicitly re-teaches.
 *
 * OPUS, and it is the only pass in this file that is. This is a CHECKING role: it reads items another
 * pass just produced and judges whether any are premature. v2's rule is that a role which verifies
 * another is pinned strictly above it, for two reasons that both apply here. Noticing that something
 * is wrong is harder than producing it, and a model checking its own family's output is measurably
 * biased toward approving it. The extraction it checks runs on Sonnet, so this runs on Opus.
 *
 * Before this pin it ran on whatever `DEFAULT_MODEL` was, which is Sonnet: the same rank as the pass
 * it checks, with nothing anywhere saying that was a choice.
 */
export const runForwardFlagsClaude = epubRunner("FORWARD_FLAGS", EPUB_PASS_PINS.FORWARD_FLAGS);

/** Pedagogical sort: a permutation of one chapter's items, mechanically validated, fails open. */
export const runPedagogicalSortClaude = epubRunner("SORT", EPUB_PASS_PINS.SORT);

/** Fill-in-the-blank mining: composes practice cards from the chapter's own patterns. */
export const runFillInBlankClaude = epubRunner("FILL_BLANK", EPUB_PASS_PINS.FILL_BLANK);

/**
 * The family-scoped runner, with no per-pass scope of its own. Kept for callers that are not one of
 * the named passes above; anything on the pipeline path should use its own runner instead.
 */
export const runClaude = epubRunner(null, EPUB_PASS_PINS.FAMILY);
