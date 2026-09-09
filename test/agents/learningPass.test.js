import test from "node:test";
import assert from "node:assert/strict";
import { learnFromReview, describeLearning, HUMAN } from "../../src/agents/learningPass.js";

const snapshot = {
  phase: "base",
  provenance: {
    a: ["tableSpecialist"],
    b: ["chapterReader"],
    c: ["tableSpecialist", "chapterReader"],
    d: [],
  },
  items: [
    { id: "a", target: "ねこ", english: "Cat" },
    { id: "b", target: "いぬ", english: "Dog" },
    { id: "c", target: "とり", english: "Bird" },
    { id: "d", target: "さかな", english: "Fish" },
  ],
};

test("a human exclusion is feedback and is attributed to the role that produced it", () => {
  const approved = {
    items: [
      {
        id: "a",
        target: "ねこ",
        english: "Cat",
        excluded: true,
        excludedBy: HUMAN,
        excludedReason: "already taught",
      },
      { id: "b", target: "いぬ", english: "Dog" },
      { id: "c", target: "とり", english: "Bird" },
      { id: "d", target: "さかな", english: "Fish" },
    ],
  };
  const report = learnFromReview(snapshot, approved, { languageCode: "ja" });
  assert.equal(report.byRole.tableSpecialist.excludedByHuman.length, 1);
  assert.equal(report.byRole.tableSpecialist.excludedByHuman[0].reason, "already taught");
  assert.equal(report.byRole.chapterReader.excludedByHuman.length, 0);
});

test("a SCRIPT exclusion is not feedback and is counted apart", () => {
  // Counting a semantic-dedup exclusion against the role that produced the card would punish it for
  // being deduplicated, which is the system working rather than a mistake.
  const approved = {
    items: [
      { id: "a", target: "ねこ", english: "Cat", excluded: true, excludedBy: "semantic-dedup" },
      { id: "b", target: "いぬ", english: "Dog" },
      { id: "c", target: "とり", english: "Bird" },
      { id: "d", target: "さかな", english: "Fish" },
    ],
  };
  const report = learnFromReview(snapshot, approved, { languageCode: "ja" });
  assert.equal(report.byRole.tableSpecialist.excludedByHuman.length, 0);
  assert.equal(report.byRole.tableSpecialist.excludedByScript.length, 1);
  assert.equal(report.byRole.tableSpecialist.excludedByScript[0].by, "semantic-dedup");
});

test("an item two roles produced credits the exclusion to both", () => {
  const approved = {
    items: [
      { id: "a", target: "ねこ", english: "Cat" },
      { id: "b", target: "いぬ", english: "Dog" },
      { id: "c", target: "とり", english: "Bird", excluded: true, excludedBy: HUMAN },
      { id: "d", target: "さかな", english: "Fish" },
    ],
  };
  const report = learnFromReview(snapshot, approved, { languageCode: "ja" });
  assert.equal(report.byRole.tableSpecialist.excludedByHuman.length, 1);
  assert.equal(report.byRole.chapterReader.excludedByHuman.length, 1);
});

test("an item no role claimed is unattributed, never guessed at", () => {
  const approved = { items: snapshot.items.map((i) => ({ ...i })) };
  const report = learnFromReview(snapshot, approved, { languageCode: "ja" });
  assert.equal(report.unattributed.produced, 1, "item d");
  assert.equal(report.unattributed.kept, 1);
});

test("a changed field is reported as changed, never as a rejection", () => {
  // The card records no author for a field, so a reviewer's edit and a later pass's edit are
  // indistinguishable. Claiming the reviewer rejected the wording would send someone to fix a
  // prompt that was never at fault.
  const approved = {
    items: [
      { id: "a", target: "ねこ", english: "A cat." },
      { id: "b", target: "いぬ", english: "Dog" },
      { id: "c", target: "とり", english: "Bird" },
      { id: "d", target: "さかな", english: "Fish" },
    ],
  };
  const report = learnFromReview(snapshot, approved, { languageCode: "ja" });
  const change = report.byRole.tableSpecialist.changedSinceGeneration[0];
  assert.deepEqual(change, { id: "a", field: "english", from: "Cat", to: "A cat." });
  assert.match(describeLearning(report), /may\n?have come from a later pass/);
});

test("a card added after generation is counted, not attributed to a role", () => {
  const approved = {
    items: [...snapshot.items, { id: "new", target: "とら", english: "Tiger" }],
  };
  const report = learnFromReview(snapshot, approved, { languageCode: "ja" });
  assert.equal(report.totals.addedAfterGeneration, 1);
  assert.equal(report.added[0].target, "とら");
});

test("a generated item missing from the approved file is recorded as removed", () => {
  const approved = { items: snapshot.items.filter((i) => i.id !== "b") };
  const report = learnFromReview(snapshot, approved, { languageCode: "ja" });
  assert.deepEqual(
    report.byRole.chapterReader.changedSinceGeneration.map((c) => c.field),
    ["(removed)"],
  );
});

test("the summary leads with human exclusions, the only unambiguous signal", () => {
  const approved = {
    items: [
      { id: "a", target: "ねこ", english: "Cat" },
      { id: "b", target: "いぬ", english: "Dog", excluded: true, excludedBy: HUMAN },
      { id: "c", target: "とり", english: "Bird" },
      { id: "d", target: "さかな", english: "Fish" },
    ],
  };
  const text = describeLearning(learnFromReview(snapshot, approved, { languageCode: "ja" }));
  const roleLines = text.split("\n").filter((l) => /produced/.test(l));
  assert.match(roleLines[0], /chapterReader/, "the role with a human cut sorts first");
  assert.match(text, /Only 'cut by human' is feedback/);
});
