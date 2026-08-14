import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync } from "fs";
import { join } from "path";
import {
  UNIT_DIR_PATTERN,
  describeCollectionDir,
  isUnitDirName,
  listUnitDirs,
  loadUnit,
  loadUnits,
  scanWorkspace,
  unitChapterNumber,
} from "../../src/audit/units.js";
import { makeOutputRoot, writeUnit, writeRaw, card } from "./fixture.js";

test("the unit pattern matches all three folder shapes and nothing else", () => {
  assert.ok(isUnitDirName("chapter-3"));
  assert.ok(isUnitDirName("lesson-0"));
  assert.ok(isUnitDirName("chapter-13-extras"));
  assert.ok(isUnitDirName("lesson-12-extras"));
  // A template unit is NOT matched by name — it is recognised by its position under templates/,
  // which is exactly the distinction the four hand-copied regexes each got wrong.
  assert.ok(!isUnitDirName("ja"));
  assert.ok(!isUnitDirName("chapter-x"));
  assert.ok(!isUnitDirName("chapter-3-drills"));
  assert.deepEqual(UNIT_DIR_PATTERN.exec("chapter-13-extras").slice(1), ["13", "-extras"]);
});

test("scanWorkspace finds books, courses and template decks, and reports what it could not place", () => {
  const { root, cleanup } = makeOutputRoot();
  try {
    writeUnit(root, "epubs/book/chapter-1", { items: [card("a")] });
    writeUnit(root, "courses/course/lesson-2", { items: [card("b")] });
    writeUnit(root, "templates/numbers/ja", {
      meta: { sourceType: "template" },
      items: [card("c")],
    });
    // A unit-shaped payload in a folder nobody can name, and a top-level group nobody scans.
    writeUnit(root, "epubs/book/drills", { items: [card("d")] });
    mkdirSync(join(root, "ad-hoc"), { recursive: true });

    const scan = scanWorkspace(root);
    assert.deepEqual(scan.collections.map((c) => `${c.kind}:${c.slug}`).sort(), [
      "course:course",
      "epub:book",
      "template:numbers/ja",
    ]);
    assert.deepEqual(
      scan.unknownGroups.map((d) => d.replace(root, "")),
      ["/ad-hoc"],
    );
    const book = scan.collections.find((c) => c.kind === "epub");
    assert.deepEqual(
      book.unmatchedDirs.map((d) => d.replace(root, "")),
      ["/epubs/book/drills"],
    );
  } finally {
    cleanup();
  }
});

test("a template collection is its own single unit, because it is packaged on its own", () => {
  const { root, cleanup } = makeOutputRoot();
  try {
    writeUnit(root, "templates/travel/ja", {
      meta: { sourceType: "template" },
      items: [card("x")],
    });
    const [collection] = scanWorkspace(root).collections;
    assert.equal(collection.kind, "template");
    assert.equal(collection.unitDirs.length, 1);
    assert.equal(collection.unitDirs[0].dir, collection.dir);
    assert.equal(collection.unitDirs[0].shape, "template");
  } finally {
    cleanup();
  }
});

test("units come back in study order: by number, a lesson before its own extras", () => {
  const { root, cleanup } = makeOutputRoot();
  try {
    for (const name of ["chapter-10", "chapter-2-extras", "chapter-2", "chapter-10-extras"]) {
      writeUnit(root, `epubs/book/${name}`, { items: [] });
    }
    const [collection] = scanWorkspace(root).collections;
    assert.deepEqual(
      listUnitDirs(collection).map((u) => u.name),
      ["chapter-2", "chapter-2-extras", "chapter-10", "chapter-10-extras"],
    );
  } finally {
    cleanup();
  }
});

test("describeCollectionDir places a bare path by its shape, template included", () => {
  const { root, cleanup } = makeOutputRoot();
  try {
    writeUnit(root, "templates/numbers/ja", { meta: { sourceType: "template" }, items: [] });
    writeUnit(root, "epubs/book/chapter-1", { items: [] });
    writeUnit(root, "courses/course/lesson-1", { items: [] });
    assert.equal(describeCollectionDir(join(root, "templates/numbers/ja")).kind, "template");
    assert.equal(describeCollectionDir(join(root, "epubs/book")).kind, "epub");
    assert.equal(describeCollectionDir(join(root, "courses/course")).kind, "course");
  } finally {
    cleanup();
  }
});

test("an unreadable cards.json is recorded on the unit, never thrown", () => {
  const { root, cleanup } = makeOutputRoot();
  try {
    writeUnit(root, "epubs/book/chapter-1", { items: [card("a")] });
    writeRaw(root, "epubs/book/chapter-2/cards.json", "{ not json");
    const [collection] = scanWorkspace(root).collections;
    const units = loadUnits(collection);
    assert.equal(units.length, 2);
    const broken = units.find((u) => u.name === "chapter-2");
    assert.equal(broken.items.length, 0);
    assert.match(broken.errors[0], /cards\.json/);
    // The other unit is still fully loaded — one corrupt file must not stop the run.
    assert.equal(units.find((u) => u.name === "chapter-1").items.length, 1);
  } finally {
    cleanup();
  }
});

test("loadUnit accepts a bare directory path for every shape", () => {
  const { root, cleanup } = makeOutputRoot();
  try {
    writeUnit(root, "epubs/book/chapter-3-extras", { items: [card("a")] });
    writeUnit(root, "templates/numbers/ja", { meta: { sourceType: "template" }, items: [] });
    const extras = loadUnit(join(root, "epubs/book/chapter-3-extras"));
    assert.equal(extras.shape, "extras");
    assert.equal(extras.number, 3);
    assert.equal(extras.extras, true);
    assert.equal(loadUnit(join(root, "templates/numbers/ja")).shape, "template");
  } finally {
    cleanup();
  }
});

test("unitChapterNumber only accepts a number — the join key is not a label", () => {
  assert.equal(unitChapterNumber({ chapterNumber: 33 }), 33);
  assert.equal(unitChapterNumber({ chapterNumber: "33" }), null);
  assert.equal(unitChapterNumber({}), null);
  assert.equal(unitChapterNumber(null), null);
});
