import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import os from "os";
import { loadEarlierUnitItems, loadEarlierTaughtItems } from "../../src/cards/earlierUnits.js";

// A unit's book position defaults to its folder number, which is the common case. `spine` overrides
// it for the case this module exists to get right: a unit whose folder number and book position
// disagree.
async function withCollection(units, fn, spine = {}) {
  const dir = await fs.mkdtemp(join(os.tmpdir(), "earlier-"));
  try {
    for (const [name, items] of Object.entries(units)) {
      mkdirSync(join(dir, name), { recursive: true });
      const base = name.replace(/-extras$/, "");
      const chapterNumber = spine[base] ?? Number(base.split("-")[1]);
      writeFileSync(
        join(dir, name, "cards.json"),
        JSON.stringify({ meta: { chapterLabel: name, chapterNumber }, items }),
      );
    }
    return await fn(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

const card = (id) => ({ id, target: id, english: id });

test("extras units ARE included: that absence is the whole blind spot", () =>
  withCollection(
    {
      "chapter-1": [card("a")],
      "chapter-1-extras": [card("b")],
      "chapter-2": [card("c")],
    },
    (dir) => {
      const items = loadEarlierUnitItems(dir, "chapter-2");
      assert.deepEqual(
        items.map((i) => `${i.__unit}/${i.id}`),
        ["chapter-1/a", "chapter-1-extras/b"],
      );
    },
  ));

test("a base unit is prior art for its OWN extras sibling", () =>
  withCollection({ "chapter-2": [card("a")], "chapter-2-extras": [card("b")] }, (dir) => {
    // The extras unit is built FROM the base unit's approved vocabulary, so the base unit precedes
    // it by construction even though they share a number.
    assert.deepEqual(
      loadEarlierUnitItems(dir, "chapter-2-extras").map((i) => i.__unit),
      ["chapter-2"],
    );
    assert.deepEqual(loadEarlierUnitItems(dir, "chapter-2"), []);
  }));

test("later units are never prior art", () =>
  withCollection({ "chapter-1": [card("a")], "chapter-9": [card("z")] }, (dir) => {
    assert.deepEqual(
      loadEarlierUnitItems(dir, "chapter-1").map((i) => i.id),
      [],
    );
  }));

test("excluded cards teach nothing, so they are not prior art", () =>
  withCollection(
    { "chapter-1": [card("a"), { ...card("b"), excluded: true }], "chapter-2": [] },
    (dir) => {
      assert.deepEqual(
        loadEarlierUnitItems(dir, "chapter-2").map((i) => i.id),
        ["a"],
      );
    },
  ));

test("a missing collection is the first-chapter case, not an error", () => {
  assert.deepEqual(loadEarlierUnitItems("/nowhere/at/all", "chapter-1"), []);
  assert.deepEqual(loadEarlierUnitItems(null, "chapter-1"), []);
});

test("a unit that will not parse is skipped rather than crashing the build", () =>
  withCollection({ "chapter-1": [card("a")], "chapter-3": [] }, (dir) => {
    mkdirSync(join(dir, "chapter-2"), { recursive: true });
    writeFileSync(join(dir, "chapter-2", "cards.json"), "{ not json");
    assert.deepEqual(
      loadEarlierUnitItems(dir, "chapter-3").map((i) => i.__unit),
      ["chapter-1"],
    );
  }));

const ja = (id, target, extra = {}) => ({ id, target, english: id, ...extra });

test("taught vocabulary counts an earlier extras unit's WORDS but not its sentences", () =>
  withCollection(
    {
      "chapter-7": [ja("bus", "バス")],
      // Lesson 7's extras really do teach どうやって, as a Nihongo 102 addition. Leaving it out made
      // Lesson 20's miners drop the chapter's title question as untaught.
      "chapter-7-extras": [
        ja("how", "どうやって"),
        ja("sentence", "スミスさんはバスでかいしゃにいきます"),
      ],
      "chapter-8": [ja("hotel", "ホテル", { excluded: true })],
      "chapter-20": [ja("later", "あとで")],
    },
    (dir) => {
      const items = loadEarlierTaughtItems(dir, 20, "ja");
      assert.deepEqual(items.map((i) => i.id).sort(), ["bus", "how"]);
    },
  ));

test("taught vocabulary keeps extras out entirely for a language with no sentence markers", () =>
  withCollection({ "chapter-1": [card("a")], "chapter-1-extras": [card("b")] }, (dir) => {
    // isPredicateShaped returns null here, and null must mean "not known to be a word".
    const items = loadEarlierTaughtItems(dir, 2, "xx");
    assert.deepEqual(
      items.map((i) => i.id),
      ["a"],
    );
  }));

// QA ruling 1 (2026-10-18): "taught" means taught by the BOOK's order. A supplement built late gets a
// high folder number but sits early in the book (Busy People's chapter-25 is at spine 40, between
// chapter-17 at 39 and chapter-18 at 42), and it has to be judged where the book puts it.
const SPINE = { "chapter-1": 10, "chapter-3": 20, "chapter-2": 30 };

test("prior art is ordered by spine position, not folder number", () =>
  withCollection(
    {
      "chapter-1": [card("a")],
      "chapter-2": [card("c")],
      "chapter-3": [card("b")],
      "chapter-3-extras": [card("b2")],
    },
    (dir) => {
      assert.deepEqual(
        loadEarlierUnitItems(dir, "chapter-2").map((i) => i.__unit),
        ["chapter-1", "chapter-3", "chapter-3-extras"],
      );
      // chapter-2 has the lower folder number but the book puts it after chapter-3.
      assert.deepEqual(
        loadEarlierUnitItems(dir, "chapter-3").map((i) => i.__unit),
        ["chapter-1"],
      );
      assert.deepEqual(
        loadEarlierUnitItems(dir, "chapter-3-extras").map((i) => i.__unit),
        ["chapter-1", "chapter-3"],
      );
    },
    SPINE,
  ));

test("taught vocabulary is filtered by spine position, not folder number", () =>
  withCollection(
    { "chapter-1": [card("a")], "chapter-2": [card("c")], "chapter-3": [card("b")] },
    (dir) => {
      assert.deepEqual(
        loadEarlierTaughtItems(dir, 30, "xx").map((i) => i.id),
        ["a", "b"],
      );
      assert.deepEqual(
        loadEarlierTaughtItems(dir, 20, "xx").map((i) => i.id),
        ["a"],
      );
    },
    SPINE,
  ));

test("a first build passes its position, since it has no cards.json to read it from", () =>
  withCollection(
    { "chapter-1": [card("a")], "chapter-2": [card("c")] },
    (dir) => {
      assert.deepEqual(
        loadEarlierUnitItems(dir, "chapter-3", { chapterNumber: 20 }).map((i) => i.__unit),
        ["chapter-1"],
      );
      // Without it there is nothing to place the unit by, and guessing from the folder is the bug.
      assert.throws(() => loadEarlierUnitItems(dir, "chapter-3"), /no book position/);
    },
    SPINE,
  ));

test("an extras unit on its first build takes its base sibling's position", () =>
  withCollection(
    { "chapter-1": [card("a")], "chapter-2": [card("c")], "chapter-3": [card("b")] },
    (dir) => {
      assert.deepEqual(
        loadEarlierUnitItems(dir, "chapter-3-extras").map((i) => i.__unit),
        ["chapter-1", "chapter-3"],
      );
    },
    SPINE,
  ));
