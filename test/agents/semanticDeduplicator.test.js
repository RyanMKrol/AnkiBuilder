import test from "node:test";
import assert from "node:assert/strict";
import {
  applyVerdicts,
  deduplicateCorpus,
  renderSemanticDeduplicatorPrompt,
} from "../../src/agents/semanticDeduplicator.js";
import { findDuplicateCandidates } from "../../src/cards/dedupGroups.js";

const item = (id, target, english, extra = {}) => ({
  id,
  target,
  english,
  category: "Other",
  ...extra,
});

function setup(items) {
  const groups = findDuplicateCandidates(items, "ja");
  return { items, groups };
}

test("a duplicate verdict excludes the loser and keeps the winner, reversibly", () => {
  const { items, groups } = setup([
    item("tokei", "とけい", "Watch, clock."),
    item("tokei-2", "とけい", "Watch; clock."),
  ]);
  const out = applyVerdicts(items, groups, [
    { group: 1, verdict: "duplicate", keep: "tokei", drop: ["tokei-2"], reason: "same word" },
  ]);

  const [keep, dropped] = items;
  assert.equal(keep.excluded, undefined, "the winner is untouched");
  assert.equal(dropped.excluded, true);
  // Reversible and attributable: the card stays in the file and the learning pass can tell this from
  // a human's exclusion.
  assert.equal(dropped.excludedBy, "semantic-dedup");
  assert.equal(dropped.excludedReason, "same word");
  assert.deepEqual(
    out.excluded.map((e) => e.id),
    ["tokei-2"],
  );
});

test("a distinct verdict removes nothing and is reported for the cue check", () => {
  const { items, groups } = setup([
    item("hashi-bridge", "はし", "Bridge"),
    item("hashi-chopsticks", "はし", "Chopsticks"),
  ]);
  const out = applyVerdicts(items, groups, [
    { group: 1, verdict: "distinct", reason: "two senses; each needs a scene" },
  ]);
  assert.ok(
    items.every((i) => !i.excluded),
    "a sense split costs a card if it is got wrong",
  );
  assert.equal(out.excluded.length, 0);
  assert.deepEqual(out.distinct[0].ids, ["hashi-bridge", "hashi-chopsticks"]);
});

// ---------------------------------------------------------------------------
// The failure modes. This role can DELETE, so a malformed answer must cost nothing.
// ---------------------------------------------------------------------------

test("a verdict naming an id outside its group is discarded, not applied", () => {
  const { items, groups } = setup([
    item("a", "とけい", "Watch, clock."),
    item("b", "とけい", "Watch; clock."),
  ]);
  const out = applyVerdicts(items, groups, [
    { group: 1, verdict: "duplicate", keep: "a", drop: ["something-else"] },
  ]);
  assert.ok(items.every((i) => !i.excluded));
  assert.equal(out.unaccounted.length, 1);
  assert.match(out.unaccounted[0].reason, /does not account for/);
});

test("a verdict that would empty a group is refused", () => {
  // A group that drops everything is a parse error wearing a verdict's clothes.
  const { items, groups } = setup([
    item("a", "とけい", "Watch, clock."),
    item("b", "とけい", "Watch; clock."),
  ]);
  const out = applyVerdicts(items, groups, [
    { group: 1, verdict: "duplicate", keep: "a", drop: ["a", "b"] },
  ]);
  assert.ok(items.every((i) => !i.excluded));
  assert.equal(out.unaccounted.length, 1);
});

test("a missing or unknown verdict is reported, never read as 'no duplicates'", () => {
  // Silence and cleanliness must not look alike: that is the failure this whole project keeps
  // hitting, and a dedup step that quietly did nothing would be the same shape.
  const { items, groups } = setup([
    item("a", "とけい", "Watch, clock."),
    item("b", "とけい", "Watch; clock."),
  ]);
  assert.equal(applyVerdicts(items, groups, []).unaccounted.length, 1);
  assert.match(
    applyVerdicts(items, groups, [{ group: 1, verdict: "maybe" }]).unaccounted[0].reason,
    /unknown verdict/,
  );
});

test("a corpus with nothing to judge spends nothing", () => {
  let called = false;
  const out = deduplicateCorpus({
    items: [item("a", "とけい", "Watch"), item("b", "ほん", "Book")],
    targetLanguage: "ja",
    languageCode: "ja",
    runClaude: () => {
      called = true;
      return "{}";
    },
  });
  assert.equal(called, false, "no group means no Opus round trip");
  assert.equal(out.skipped, true);
});

test("the prompt carries the groups and the shared card rules", () => {
  const { groups } = setup([
    item("a", "とけい", "Watch, clock."),
    item("b", "とけい", "Watch; clock."),
  ]);
  const prompt = renderSemanticDeduplicatorPrompt({ groups, targetLanguage: "Japanese" });
  assert.match(prompt, /とけい/);
  assert.match(prompt, /"sharing": "same-target"/);
  assert.ok(!prompt.includes("{{"), "every placeholder resolved");
  assert.match(prompt, /irregular/i, "the shared card rules are injected");
});
