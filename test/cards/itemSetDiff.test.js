import test from "node:test";
import assert from "node:assert/strict";

import {
  diffItemSets,
  spokenTextOf,
  categoryHistogram,
  orderDisagreement,
} from "../../src/cards/itemSetDiff.js";
import { formatItemSetReport, formatIdSetReport } from "../../src/evals/report.js";

const item = (over) => ({ id: "x", english: "Water", target: "みず", category: "Food", ...over });

test("an identical set diffs to all matched, nothing missing or extra", () => {
  const items = [item(), item({ id: "b", english: "Fire", target: "ひ" })];
  const diff = diffItemSets(
    items,
    items.map((i) => ({ ...i })),
    { languageCode: "ja" },
  );

  assert.equal(diff.matched.length, 2);
  assert.deepEqual(diff.missing, []);
  assert.deepEqual(diff.extra, []);
  assert.equal(diff.counts.changed, 0);
});

test("a renamed id still matches — ids are model-authored and must not drive the diff", () => {
  const diff = diffItemSets([item({ id: "mizu" })], [item({ id: "water-noun" })], {
    languageCode: "ja",
  });
  assert.equal(diff.matched.length, 1);
  assert.equal(diff.missing.length, 0);
  assert.equal(diff.extra.length, 0);
});

test("editorial spaces and a trailing 。 never split a real match", () => {
  const reference = [item({ target: "みずを のみます" })];
  const candidate = [item({ target: "みずをのみます。" })];
  const diff = diffItemSets(reference, candidate, { languageCode: "ja" });
  assert.equal(diff.matched.length, 1);
});

test("a re-spelled target still pairs up through the english fallback pass", () => {
  const reference = [item({ english: "Please (get me a coffee)", target: "〜を おねがいします" })];
  const candidate = [
    item({ english: "please (get me a coffee).", target: "コーヒーを おねがいします" }),
  ];
  const diff = diffItemSets(reference, candidate, { languageCode: "ja" });
  assert.equal(diff.matched.length, 1);
  assert.equal(
    diff.matched[0].changes.some((c) => c.field === "target"),
    true,
  );
});

test("a dropped item is missing and an invented item is extra", () => {
  const diff = diffItemSets(
    [item({ id: "a" }), item({ id: "b", english: "Fire", target: "ひ" })],
    [item({ id: "a" }), item({ id: "c", english: "Wind", target: "かぜ" })],
    { languageCode: "ja" },
  );
  assert.deepEqual(
    diff.missing.map((i) => i.id),
    ["b"],
  );
  assert.deepEqual(
    diff.extra.map((i) => i.id),
    ["c"],
  );
});

test("a category change is reported separately from other field changes", () => {
  const diff = diffItemSets([item()], [item({ category: "Other" })], { languageCode: "ja" });
  assert.equal(diff.categoryChanged.length, 1);
  assert.deepEqual(diff.categoryChanged[0].changes[0], {
    field: "category",
    from: "Food",
    to: "Other",
  });
});

test("the same word taught twice does not absorb a third copy", () => {
  const reference = [item({ id: "a" }), item({ id: "b" })];
  const candidate = [item({ id: "a" }), item({ id: "b" }), item({ id: "c" })];
  const diff = diffItemSets(reference, candidate, { languageCode: "ja" });
  assert.equal(diff.matched.length, 2);
  assert.equal(diff.extra.length, 1);
});

test("the spoken form reads under either field name, mid-rename", () => {
  assert.equal(spokenTextOf({ reading: "にせんえん" }), "にせんえん");
  assert.equal(spokenTextOf({ ttsText: "にせんえん" }), "にせんえん");
  assert.equal(spokenTextOf({}), undefined);

  // Same content under different field names is NOT a change — otherwise the rename itself would
  // read as a chapter-wide diff.
  const diff = diffItemSets([item({ reading: "みず" })], [item({ ttsText: "みず" })], {
    languageCode: "ja",
  });
  assert.equal(diff.counts.changed, 0);
});

test("a changed spoken form IS reported, under the ttsText label", () => {
  const diff = diffItemSets([item({ reading: "にせんえん" })], [item({ ttsText: "にせん" })], {
    languageCode: "ja",
  });
  assert.deepEqual(diff.changed[0].changes, [
    { field: "ttsText", from: "にせんえん", to: "にせん" },
  ]);
});

test("categoryHistogram counts what is there, including items with no category", () => {
  const counts = categoryHistogram([item(), item({ category: "Other" }), { english: "x" }]);
  assert.equal(counts.get("Food"), 1);
  assert.equal(counts.get("Other"), 1);
  assert.equal(counts.get("(none)"), 1);
});

test("orderDisagreement is 0 for the same order and 1 for the reverse", () => {
  assert.equal(orderDisagreement(["a", "b", "c"], ["a", "b", "c"]).fraction, 0);
  assert.equal(orderDisagreement(["a", "b", "c"], ["c", "b", "a"]).fraction, 1);
  assert.equal(orderDisagreement(["a"], ["a"]).fraction, 0);
  assert.equal(orderDisagreement(["a", "b"], ["b", "a"]).inverted, 1);
});

test("orderDisagreement only scores the ids both sides have", () => {
  const result = orderDisagreement(["a", "b", "c"], ["a", "c"]);
  assert.equal(result.shared, 2);
  assert.equal(result.inverted, 0);
});

test("the report names every difference and never states a verdict", () => {
  const diff = diffItemSets(
    [item({ id: "a" }), item({ id: "gone", english: "Fire", target: "ひ" })],
    [item({ id: "a", category: "Other" }), item({ id: "new", english: "Wind", target: "かぜ" })],
    { languageCode: "ja" },
  );
  const text = formatItemSetReport(diff, { referenceLabel: "reviewed", candidateLabel: "run" });

  assert.match(text, /MISSING/);
  assert.match(text, /Fire/);
  assert.match(text, /EXTRA/);
  assert.match(text, /Wind/);
  assert.match(text, /CATEGORY CHANGED/);
  assert.match(text, /Food -> Other/);
  assert.doesNotMatch(text, /\b(PASS|FAIL|FAILED)\b/);
});

test("the id-set report splits agreed, reference-only and run-only", () => {
  const text = formatIdSetReport(["a", "b"], ["b", "c"]);
  assert.match(text, /ONLY IN THE REFERENCE[^\n]*\(1\)/);
  assert.match(text, /ONLY IN THIS RUN[^\n]*\(1\)/);
  assert.match(text, /AGREED \(1\)/);
});
