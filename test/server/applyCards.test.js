import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  setCardExcluded,
  editCard,
  setLessonDone,
  unmarkCardsReviewed,
} from "../../src/server/adapters/applyCards.js";

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
const readCorpus = (dir) => JSON.parse(readFileSync(join(dir, "corpus.json"), "utf-8"));
/** Give a run dir the corpus.json a real EPUB unit has, holding the same ids. */
const withCorpus = (dir, items) => {
  writeFileSync(
    join(dir, "corpus.json"),
    JSON.stringify({ meta: { targetLanguage: "ja", sourceType: "epub" }, items }),
  );
  return dir;
};
const card = (id, over = {}) => ({
  id,
  english: id,
  category: "Numbers",
  target: id,
  pronunciation: id,
  ...over,
});

test("setLessonDone sets meta.done and the clearing form removes the key", () => {
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

test("unmarkCardsReviewed withdraws the sign-off and drops the dedup-library entry", () => {
  const dir = runDir([card("a")], { ...reviewed, epubHash: "hash123", chapterNumber: 4 });
  try {
    const removed = [];
    const out = unmarkCardsReviewed(dir, {
      removeChapterCorpus: (hash, chapter) => (removed.push([hash, chapter]), true),
    });
    assert.deepEqual(out, { reviewed: false });
    assert.equal("reviewed" in read(dir).meta, false);
    // The library holds only signed-off chapters — the entry goes with the sign-off.
    assert.deepEqual(removed, [["hash123", 4]]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("unmarkCardsReviewed never touches the library for a unit without an epubHash (extras)", () => {
  const dir = runDir([card("a")], reviewed);
  try {
    const removed = [];
    unmarkCardsReviewed(dir, { removeChapterCorpus: (...args) => removed.push(args) });
    assert.deepEqual(removed, []);
    assert.equal("reviewed" in read(dir).meta, false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("unmarkCardsReviewed refuses while the lesson is done", () => {
  const dir = runDir([card("a")], { ...reviewed, done: true });
  try {
    assert.throws(() => unmarkCardsReviewed(dir, { removeChapterCorpus: () => {} }), /marked done/);
    assert.equal(read(dir).meta.reviewed, true, "the sign-off stays intact");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("setCardExcluded mirrors the exclusion into corpus.json, both ways", () => {
  // The two files are read by different things: the deck build and the review read cards.json, while
  // translate and resume rebuild the cards FROM corpus.json. An exclusion in only one of them is a
  // decision with a shelf life — the next rebuild reinstates an excluded card, or re-drops a restored
  // one. Every scripts/ tool mirrored; the dashboard toggle, where almost every real exclusion is
  // made, did not, and four units had drifted before anyone noticed.
  const dir = withCorpus(runDir([card("a"), card("b")]), [card("a"), card("b")]);
  try {
    const on = setCardExcluded(dir, "a", true);
    assert.equal(on.mirrored, true);
    assert.equal(readCorpus(dir).items.find((i) => i.id === "a").excluded, true);
    assert.equal(readCorpus(dir).items.find((i) => i.id === "a").excludedBy, "human");

    const off = setCardExcluded(dir, "a", false);
    assert.equal(off.mirrored, true);
    const restored = readCorpus(dir).items.find((i) => i.id === "a");
    assert.equal("excluded" in restored, false);
    assert.equal("excludedBy" in restored, false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("setCardExcluded is silent when the corpus has no such card, or none at all", () => {
  // A mined drill card exists only on the cards side by design, and a unit need not have a corpus.
  // Neither is an error, and neither may stop the exclusion the reviewer actually asked for.
  const noCorpus = runDir([card("a")]);
  try {
    assert.equal(setCardExcluded(noCorpus, "a", true).mirrored, false);
    assert.equal(read(noCorpus).items[0].excluded, true, "cards.json still updated");
  } finally {
    rmSync(noCorpus, { recursive: true, force: true });
  }

  const cardsOnly = withCorpus(runDir([card("a"), card("fib-1")]), [card("a")]);
  try {
    assert.equal(setCardExcluded(cardsOnly, "fib-1", true).mirrored, false);
    assert.equal(read(cardsOnly).items.find((i) => i.id === "fib-1").excluded, true);
    assert.equal(readCorpus(cardsOnly).items.length, 1, "corpus untouched");
  } finally {
    rmSync(cardsOnly, { recursive: true, force: true });
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

// A script sweep and a reviewed decision used to be byte-identical on disk, which is what made the
// excluded set unauditable.
test("setCardExcluded stamps a human exclusion, and un-excluding clears the provenance", () => {
  const dir = runDir([card("a", { excluded: true, excludedBy: "extras-duplicate-check" })]);
  try {
    setCardExcluded(dir, "a", true);
    assert.equal(read(dir).items[0].excludedBy, "human");

    setCardExcluded(dir, "a", false);
    const item = read(dir).items[0];
    assert.equal("excludedBy" in item, false, "a stale author must not outlive the exclusion");
    assert.equal("excludedReason" in item, false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("editCard writes only whitelisted fields (target/pronunciation/ttsText), ignoring the rest", () => {
  const dir = runDir([card("a", { target: "いち", pronunciation: "ichi" })]);
  try {
    const applied = editCard(dir, "a", {
      target: "一",
      pronunciation: "ichi!",
      ttsText: "いち",
      english: "HACKED", // not whitelisted → ignored
    });
    assert.deepEqual(applied, { target: "一", pronunciation: "ichi!", ttsText: "いち" });
    const item = read(dir).items.find((i) => i.id === "a");
    assert.equal(item.target, "一");
    assert.equal(item.pronunciation, "ichi!");
    assert.equal(item.ttsText, "いち");
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
    // Clearing is always allowed — it only ever removes the flag.
    assert.doesNotThrow(() => setLessonDone(dir, false));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
