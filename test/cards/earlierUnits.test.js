import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import os from "os";
import { loadEarlierUnitItems } from "../../src/cards/earlierUnits.js";

async function withCollection(units, fn) {
  const dir = await fs.mkdtemp(join(os.tmpdir(), "earlier-"));
  try {
    for (const [name, items] of Object.entries(units)) {
      mkdirSync(join(dir, name), { recursive: true });
      writeFileSync(
        join(dir, name, "cards.json"),
        JSON.stringify({ meta: { chapterLabel: name }, items }),
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
