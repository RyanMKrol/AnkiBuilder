import test from "node:test";
import assert from "node:assert/strict";
import {
  applyBackwardVerdicts,
  deduplicateAgainstEarlier,
  renderBackwardDeduplicatorPrompt,
} from "../../src/agents/backwardDeduplicator.js";
import { findBackwardCandidates } from "../../src/cards/backwardCandidates.js";

const now = (target, english, extra = {}) => ({ id: target, target, english, ...extra });
const prior = (unit, target, english) => ({ id: target, target, english, __unit: unit });

function setup(items, priors) {
  return { items, candidates: findBackwardCandidates(items, priors, { languageCode: "ja" }) };
}

test("already-taught FLAGS the card and never removes it", () => {
  // A word deliberately re-taught in a new grammatical role is a legitimate card. Only a human
  // reading both can say, so this annotates and leaves the decision alone.
  const { items, candidates } = setup(
    [now("から", "Because")],
    [prior("chapter-3", "から", "From")],
  );
  const out = applyBackwardVerdicts(items, candidates, [
    { candidate: 1, verdict: "already-taught", reason: "chapter-3 already teaches から" },
  ]);
  assert.equal(items[0].excluded, undefined, "flagged, not cut");
  assert.equal(items[0].uncertain, true);
  assert.match(items[0].reviewNote, /Possibly already taught/);
  assert.match(items[0].reviewNote, /chapter-3/);
  assert.deepEqual(out.flagged[0].priorUnits, ["chapter-3"]);
});

test("an existing review note is appended to, never overwritten", () => {
  const { items, candidates } = setup(
    [now("から", "Because", { reviewNote: "check the particle sense" })],
    [prior("chapter-3", "から", "From")],
  );
  applyBackwardVerdicts(items, candidates, [
    { candidate: 1, verdict: "already-taught", reason: "seen in chapter-3" },
  ]);
  assert.match(items[0].reviewNote, /check the particle sense \| Possibly already taught/);
});

test("a `new` verdict leaves the card completely alone", () => {
  const { items, candidates } = setup(
    [now("おかし", "Sweets")],
    [prior("chapter-2", "かし", "Sweets")],
  );
  const out = applyBackwardVerdicts(items, candidates, [
    { candidate: 1, verdict: "new", reason: "polite prefix form worth its own card" },
  ]);
  assert.equal(items[0].uncertain, undefined);
  assert.equal(items[0].reviewNote, undefined);
  assert.equal(out.cleared.length, 1);
});

test("a missing or unknown verdict is recorded, never read as 'nothing repeats'", () => {
  const { items, candidates } = setup(
    [now("から", "Because")],
    [prior("chapter-3", "から", "From")],
  );
  assert.equal(applyBackwardVerdicts(items, candidates, []).unaccounted.length, 1);
  assert.match(
    applyBackwardVerdicts(items, candidates, [{ candidate: 1, verdict: "dunno" }]).unaccounted[0]
      .reason,
    /unknown verdict/,
  );
  assert.equal(items[0].uncertain, undefined, "an unusable verdict changes nothing");
});

test("a unit with no candidates spends nothing", () => {
  let called = false;
  const out = deduplicateAgainstEarlier({
    items: [now("これ", "This")],
    earlierItems: [],
    targetLanguage: "Japanese",
    languageCode: "ja",
    runClaude: () => {
      called = true;
      return "{}";
    },
  });
  assert.equal(called, false);
  assert.equal(out.skipped, true);
});

test("the prompt shows the earlier unit by name, so the reviewer can go and look", () => {
  const { candidates } = setup([now("から", "Because")], [prior("chapter-3", "から", "From")]);
  const prompt = renderBackwardDeduplicatorPrompt({ candidates, targetLanguage: "Japanese" });
  assert.match(prompt, /"unit": "chapter-3"/);
  assert.match(prompt, /"noticed": "same-target"/);
  assert.ok(!prompt.includes("{{"));
});
