import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

// Both scripts only read, so every case runs against a throwaway collection in a temp dir. Golden
// rule 6: no test may touch a real collection under output/.
function withCollection(deckKind, units, fn) {
  const dir = mkdtempSync(join(tmpdir(), "qa-tools-"));
  try {
    writeFileSync(join(dir, "book.json"), JSON.stringify({ title: "T", slug: "t", deckKind }));
    for (const [name, cards] of Object.entries(units)) {
      mkdirSync(join(dir, name));
      writeFileSync(join(dir, name, "cards.json"), JSON.stringify(cards));
    }
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const run = (script, ...args) =>
  execFileSync("node", [`scripts/${script}`, ...args], { encoding: "utf-8" });

const card = (id, target, english, extra = {}) => ({ id, target, english, ...extra });

const speaking = {
  // Spine numbers are deliberately NOT in directory order: the supplement in chapter-3 sits between
  // the two lessons in the book, which is where the learner meets it.
  "chapter-1": {
    meta: { chapterLabel: "Lesson 1", chapterNumber: 10, done: true },
    items: [
      card("hello", "こんにちは", "Hello", { note: "A greeting." }),
      card("cut", "x", "Cut", { excluded: true }),
    ],
  },
  "chapter-1-extras": {
    meta: { chapterLabel: "Lesson 1 (Extras)", chapterNumber: 10, done: true },
    items: [card("hello-sentence", "こんにちは、たなかさん", "Hello, Tanaka-san.")],
  },
  "chapter-2": {
    meta: { chapterLabel: "Lesson 2", chapterNumber: 30, done: true },
    items: [
      card("pen", "ペン", "Pen", {
        scene: "at a desk",
        hint: "the writing tool",
        note: "A loanword.",
      }),
    ],
  },
  "chapter-3": {
    meta: { chapterLabel: "Casual Supplement", chapterNumber: 20, done: true },
    items: [card("yeah", "うん", "Yeah.")],
  },
};

test("the renderer prints both faces of every shipping card and none of the excluded ones", () => {
  const out = withCollection("speaking-listening", speaking, (dir) =>
    run("qa-render-unit.mjs", join(dir, "chapter-1")),
  );
  assert.match(out, /1 card\(s\) ship; 1 excluded/);
  assert.match(out, /\[hello\]/);
  assert.doesNotMatch(out, /\[cut\]/);
  assert.match(out, /Recognition FRONT:/);
  assert.match(out, /Production FRONT:/);
  assert.match(out, /END OF UNIT: 1 card\(s\) rendered/);
});

test("a scene shows on both fronts and a hint only on the Production front", () => {
  const out = withCollection("speaking-listening", speaking, (dir) =>
    run("qa-render-unit.mjs", join(dir, "chapter-2")),
  );
  const [recognitionFront, rest] = out.split("Recognition BACK:");
  const productionFront = rest.split("Production FRONT:")[1].split("Production BACK:")[0];
  assert.match(recognitionFront, /at a desk/);
  assert.match(productionFront, /at a desk/);
  assert.doesNotMatch(recognitionFront, /the writing tool/);
  assert.match(productionFront, /the writing tool/);
});

test("the ledger lists earlier units in BOOK order and stops before the unit asked for", () => {
  const out = withCollection("speaking-listening", speaking, (dir) =>
    run("qa-ledger.mjs", join(dir, "chapter-2")),
  );
  const headings = out.split("\n").filter((l) => l.startsWith("## "));
  assert.deepEqual(
    headings.map((h) => h.replace(/ {2}\(.*\)$/, "")),
    ["## Lesson 1", "## Lesson 1 (Extras)", "## Casual Supplement"],
  );
  assert.match(out, /こんにちは \| Hello/);
  assert.doesNotMatch(out, /ペン/);
  assert.doesNotMatch(out, /x \| Cut/);
  assert.match(out, /END OF LEDGER: 3 card\(s\)/);
});

test("an extras unit's ledger includes its own base unit, and --notes appends the note", () => {
  withCollection("speaking-listening", speaking, (dir) => {
    const plain = run("qa-ledger.mjs", join(dir, "chapter-1-extras"));
    const headings = plain.split("\n").filter((l) => l.startsWith("## "));
    assert.equal(headings.length, 1);
    assert.match(headings[0], /^## Lesson 1 {2}\(/);
    assert.doesNotMatch(plain, /A greeting/);
    const notes = run("qa-ledger.mjs", join(dir, "chapter-2"), "--notes");
    assert.match(notes, /こんにちは \| Hello \| A greeting/);
    const after = run("qa-ledger.mjs", join(dir, "chapter-3"), "--notes");
    // chapter-3 is the supplement (spine 20): Lesson 2 (spine 30) is not yet taught.
    assert.doesNotMatch(after, /ペン/);
  });
});

test("a reading unit renders one silent face per card", () => {
  const reading = {
    "chapter-1": {
      meta: { chapterLabel: "Chapter 01", chapterNumber: 1, done: true, phase: "reading" },
      items: [card("r-1", "映画", "Movie", { pronunciation: "eiga", audio: "a.mp3" })],
    },
  };
  const out = withCollection("reading", reading, (dir) =>
    run("qa-render-unit.mjs", join(dir, "chapter-1")),
  );
  assert.match(out, /Reading FRONT:\n {2}映画\nReading BACK:/);
  assert.doesNotMatch(out, /Production/);
  assert.match(out, /audio plays/);
});
