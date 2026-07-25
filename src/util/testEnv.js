/**
 * Is this process running under the test runner?
 *
 * `node --test` sets NODE_TEST_CONTEXT in every test child, so this is exact for the way this repo
 * runs its suite — including a stray direct invocation (`node --test test/foo.test.js`) outside
 * `npm test`, which is precisely the case a convention-based guard would miss.
 */
export function isTestEnv() {
  return Boolean(process.env.NODE_TEST_CONTEXT) || process.env.NODE_ENV === "test";
}

/**
 * Guard for anything that spends real money or real time on an external service. Every LLM pass in
 * this pipeline takes an injectable `runClaude`, and a test is expected to pass a stub — but forgetting
 * to inject one is silent: the test simply passes, slowly, having spawned a real model call. So the
 * refusal lives in the code rather than in the discipline of whoever writes the next test.
 *
 * Set ANKI_BUILDER_ALLOW_LLM_IN_TESTS=1 for a deliberate end-to-end check against the real CLI.
 */
export function assertExternalCallAllowed(what) {
  if (isTestEnv() && !process.env.ANKI_BUILDER_ALLOW_LLM_IN_TESTS) {
    throw new Error(
      `refusing to ${what} under the test runner — inject a stub instead ` +
        `(or set ANKI_BUILDER_ALLOW_LLM_IN_TESTS=1 if you really mean to call the live model)`,
    );
  }
}
