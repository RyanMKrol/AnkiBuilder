import { parsePageReply } from "./pageTranscribe.js";

// A page whose reply cannot be used is asked again, a fixed number of times, with the SAME prompt.
//
// Why a retry at all: a model can decline to reproduce a copyrighted page word for word and write a
// summary instead. That call succeeds as far as the CLI is concerned (exit 0, some text), so the
// runner's own retry, which covers crashes and timeouts, never sees it. On Genki Lesson 1 it
// happened to one page in twenty, and the first retry transcribed that page cleanly.
//
// Why the same prompt: retrying is not rewording. A prompt edited to argue past a refusal is a
// different thing, and not one this loop does.
//
// Why a fixed limit: a page that fails every attempt is a page a person should look at, not one to
// keep paying for. It is reported, and the build refuses to include the lesson without it.
export const MAX_TRANSCRIBE_ATTEMPTS = 3;

/**
 * Up to `maxAttempts` calls for one page. Returns `{ page, raw, attempts, failures }`, where `page`
 * is null when every attempt failed and `failures` holds one `{ attempt, reason, raw }` per failed
 * attempt, so each rejected reply can be kept rather than overwritten.
 *
 * A usage-limit refusal is rethrown at once: every later attempt, and every later page, would fail
 * the same way (the runner's breaker then stops the rest of the run without spawning).
 */
export async function transcribeWithRetries({
  pageNumber,
  prompt,
  run,
  maxAttempts = MAX_TRANSCRIBE_ATTEMPTS,
}) {
  const failures = [];
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let raw;
    try {
      raw = await run(prompt);
    } catch (error) {
      if (error.quotaExhausted) throw error;
      failures.push({ attempt, reason: error.message.split("\n")[0], raw: null });
      continue;
    }
    let page;
    try {
      page = parsePageReply(raw, { pageNumber });
    } catch (error) {
      failures.push({ attempt, reason: error.message, raw });
      continue;
    }
    if (page.problems.length) {
      failures.push({ attempt, reason: page.problems.join("; "), raw });
      continue;
    }
    return { page, raw, attempts: attempt, failures };
  }
  return { page: null, raw: null, attempts: maxAttempts, failures };
}
