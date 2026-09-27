import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { readingStudyOrder, applyStudyOrder } from "../../src/reading/studyOrder.js";

// Every reading unit is studied in a fixed shuffle (src/reading/studyOrder.js).

const days = ["ついたち", "ふつか", "みっか", "よっか", "いつか", "むいか", "なのか", "ようか"];
const cardsOf = (targets) =>
  targets.map((target) => ({ id: `r-${target}`, target, english: target }));

test("a run like the days of the month is shuffled, the same way every time", () => {
  const order = readingStudyOrder(cardsOf(days)).map((i) => i.target);
  assert.notDeepEqual(order, days);
  assert.deepEqual(
    readingStudyOrder(cardsOf([...days].reverse())).map((i) => i.target),
    order,
  );
});

test("a written unit is reordered in place, edits kept; a done unit is left alone", () => {
  const dir = mkdtempSync(join(tmpdir(), "study-order-"));
  try {
    const write = (name, meta, items) => {
      mkdirSync(join(dir, name), { recursive: true });
      writeFileSync(join(dir, name, "cards.json"), JSON.stringify({ meta, items }));
      writeFileSync(join(dir, name, "corpus.json"), JSON.stringify({ meta, items }));
    };
    const edited = cardsOf(days).map((c, i) =>
      i === 3 ? { ...c, english: "Fourth day (edited)" } : c,
    );
    write("chapter-1", { reviewed: false }, edited);
    write("chapter-2", { reviewed: true, done: true }, cardsOf(days));

    assert.equal(applyStudyOrder(join(dir, "chapter-1")), true);
    const cards = JSON.parse(readFileSync(join(dir, "chapter-1", "cards.json"), "utf-8"));
    const corpus = JSON.parse(readFileSync(join(dir, "chapter-1", "corpus.json"), "utf-8"));
    assert.deepEqual(
      cards.items.map((i) => i.target),
      readingStudyOrder(cardsOf(days)).map((i) => i.target),
    );
    assert.deepEqual(
      corpus.items.map((i) => i.id),
      cards.items.map((i) => i.id),
    );
    assert.equal(cards.items.find((i) => i.target === "よっか").english, "Fourth day (edited)");
    // Already in order: nothing to do.
    assert.equal(applyStudyOrder(join(dir, "chapter-1")), false);

    assert.equal(applyStudyOrder(join(dir, "chapter-2")), false);
    const done = JSON.parse(readFileSync(join(dir, "chapter-2", "cards.json"), "utf-8"));
    assert.deepEqual(
      done.items.map((i) => i.target),
      days,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a unit edited after its merge is known as edited; reordering alone is not an edit", async () => {
  const { editedSinceMerge } = await import("../../src/reading/studyOrder.js");
  const { utimesSync } = await import("fs");
  const dir = mkdtempSync(join(tmpdir(), "study-edited-"));
  try {
    const unit = join(dir, "chapter-1");
    mkdirSync(unit, { recursive: true });
    const write = (items) =>
      writeFileSync(join(unit, "cards.json"), JSON.stringify({ meta: {}, items }));
    write(cardsOf(days));
    writeFileSync(join(unit, "reading-report.json"), "{}");
    const merged = new Date(Date.now() - 60_000);
    utimesSync(join(unit, "reading-report.json"), merged, merged);
    utimesSync(join(unit, "cards.json"), merged, merged);
    assert.equal(editedSinceMerge(unit), false);

    // Reordering in place does not make it "edited".
    assert.equal(applyStudyOrder(unit), true);
    assert.equal(editedSinceMerge(unit), false);

    // A reviewer's later write does.
    const later = new Date(Date.now() + 60_000);
    utimesSync(join(unit, "cards.json"), later, later);
    assert.equal(editedSinceMerge(unit), true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
