import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { setCardExcluded, editCard, setLessonDone } from "../../src/server/adapters/applyCards.js";

function runDir(items, meta = {}) {
  const dir = mkdtempSync(join(tmpdir(), "applycards-"));
  writeFileSync(
    join(dir, "cards.json"),
    JSON.stringify({ meta: { targetLanguage: "ja", sourceType: "epub", ...meta }, items }),
  );
  return dir;
}
// A lesson that has passed the corpus review — the precondition for "Mark done".
const reviewed = { reviewed: true };
const read = (dir) => JSON.parse(readFileSync(join(dir, "cards.json"), "utf-8"));
const card = (id, over = {}) => ({
  id,
  english: id,
  category: "Numbers",
  target: id,
  pronunciation: id,
  ...over,
});

test("setLessonDone sets meta.done and clears it on reopen", () => {
  const dir = runDir([card("a")], reviewed);
  try {
    setLessonDone(dir, true);
    assert.equal(read(dir).meta.done, true);
    setLessonDone(dir, false);
    assert.equal("done" in read(dir).meta, false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("setCardExcluded toggles the flag (reversible) and rejects unknown ids", () => {
  const dir = runDir([card("a"), card("b")]);
  try {
    setCardExcluded(dir, "a", true);
    assert.equal(read(dir).items.find((i) => i.id === "a").excluded, true);
    setCardExcluded(dir, "a", false);
    assert.equal("excluded" in read(dir).items.find((i) => i.id === "a"), false);
    assert.throws(() => setCardExcluded(dir, "nope", true), /not found/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("editCard writes only whitelisted fields (target/pronunciation/reading), ignoring the rest", () => {
  const dir = runDir([card("a", { target: "いち", pronunciation: "ichi" })]);
  try {
    const applied = editCard(dir, "a", {
      target: "一",
      pronunciation: "ichi!",
      reading: "いち",
      english: "HACKED", // not whitelisted → ignored
    });
    assert.deepEqual(applied, { target: "一", pronunciation: "ichi!", reading: "いち" });
    const item = read(dir).items.find((i) => i.id === "a");
    assert.equal(item.target, "一");
    assert.equal(item.pronunciation, "ichi!");
    assert.equal(item.reading, "いち");
    assert.equal(item.english, "a", "non-whitelisted field untouched");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// "done" is what puts a lesson into the merged .apkg and from there into the live Anki collection, so
// it must not be reachable by a lesson that never passed the corpus review — regardless of whether the
// UI happens to offer the button.
test("setLessonDone refuses to mark an unreviewed lesson done", () => {
  const dir = runDir([card("a")]);
  try {
    assert.throws(() => setLessonDone(dir, true), /has not passed the corpus review/);
    assert.equal("done" in read(dir).meta, false);
    // Reopening one is always allowed — it only ever removes the flag.
    assert.doesNotThrow(() => setLessonDone(dir, false));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
