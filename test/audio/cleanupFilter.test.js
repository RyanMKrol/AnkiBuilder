import test from "node:test";
import assert from "node:assert/strict";
import {
  cleanupChain,
  cleanupNames,
  isCleanupName,
  CLEANUP_CHAINS,
  DEFAULT_CLEANUP,
} from "../../src/audio/cleanupFilter.js";

test("an unnamed chain resolves to the default", () => {
  assert.equal(cleanupChain(null, {}), CLEANUP_CHAINS[DEFAULT_CLEANUP]);
  assert.equal(cleanupChain(undefined, {}), CLEANUP_CHAINS[DEFAULT_CLEANUP]);
});

test("a named chain resolves to its own filter, case-insensitively", () => {
  assert.equal(cleanupChain("gentle", {}), CLEANUP_CHAINS.gentle);
  assert.equal(cleanupChain("AGGRESSIVE", {}), CLEANUP_CHAINS.aggressive);
  assert.notEqual(CLEANUP_CHAINS.gentle, CLEANUP_CHAINS.aggressive);
});

test("the env var picks the default, and turns cleanup off entirely", () => {
  assert.equal(cleanupChain(null, { ANKI_BUILDER_AUDIO_CLEANUP: "gentle" }), CLEANUP_CHAINS.gentle);
  for (const off of ["off", "0", "false", "none"]) {
    assert.equal(cleanupChain(null, { ANKI_BUILDER_AUDIO_CLEANUP: off }), null, off);
    assert.equal(cleanupChain(off, {}), null, off);
  }
});

// An explicit per-card choice is the reviewer looking at one clip that the default handled badly.
test("an explicit name beats the env default", () => {
  assert.equal(
    cleanupChain("aggressive", { ANKI_BUILDER_AUDIO_CLEANUP: "gentle" }),
    CLEANUP_CHAINS.aggressive,
  );
});

// Cleanup is a nicety layered on the audio build. A typo in an env var must not be able to stop a
// deck being made, so an unknown name degrades to the default rather than throwing.
test("an unknown name falls back to the default instead of throwing", () => {
  assert.equal(cleanupChain("nonsense", {}), CLEANUP_CHAINS[DEFAULT_CLEANUP]);
  assert.equal(
    cleanupChain(null, { ANKI_BUILDER_AUDIO_CLEANUP: "tpyo" }),
    CLEANUP_CHAINS[DEFAULT_CLEANUP],
  );
});

// The chains reach an ffmpeg command line, so a name arriving over HTTP is validated against a fixed
// table and a raw filter string is never accepted. isCleanupName is that gate.
test("isCleanupName accepts only the known names", () => {
  for (const n of cleanupNames()) assert.equal(isCleanupName(n), true, n);
  for (const bad of ["", "off", "; rm -rf /", "asubcut=cutoff=1", null, undefined, 7, {}]) {
    assert.equal(isCleanupName(bad), false, JSON.stringify(bad));
  }
});

test("every chain cuts low frequencies — that is what the noise turned out to be", () => {
  for (const [name, chain] of Object.entries(CLEANUP_CHAINS)) {
    assert.match(chain, /asubcut|highpass/, `${name} should remove low-frequency rumble`);
  }
});
