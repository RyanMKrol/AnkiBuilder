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
import { makeOutputRoot, writeUnit, writeRaw, writeMarker, card } from "./fixture.js";

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

test("scanWorkspace leaves a retired collection out of the sweep, but REPORTS it", () => {
  // Every finding against a retired deck is noise nobody will act on: its Anki deck is gone on
  // purpose and its cards are frozen. But it must not vanish silently: this module exists because a
  // checker that cannot see a unit reads exactly like one that checked it and found nothing, so the
  // retired collection has to come back somewhere a reader will see it.
  const { root, cleanup } = makeOutputRoot();
  try {
    writeUnit(root, "epubs/live/chapter-1", { items: [card("a")] });
    writeUnit(root, "courses/dead/lesson-1", { items: [card("b")] });
    writeMarker(root, "courses/dead", "course.json", { name: "Dead", retired: true });

    const scan = scanWorkspace(root);
    assert.deepEqual(
      scan.collections.map((c) => `${c.kind}:${c.slug}`),
      ["epub:live"],
      "the retired course is not swept",
    );
    assert.deepEqual(
      scan.retired.map((c) => `${c.kind}:${c.slug}`),
      ["course:dead"],
      "and is reported instead of being dropped",
    );
  } finally {
    cleanup();
  }
});

test("a retired BOOK is skipped too, and `retired` must be exactly true", () => {
  // Books and courses use different manifests; a filter that only knew course.json would let a
  // retired book keep emitting findings forever. And absence must stay live: every collection on
  // disk today lacks the field entirely.
  const { root, cleanup } = makeOutputRoot();
  try {
    writeUnit(root, "epubs/gone/chapter-1", { items: [card("a")] });
    writeMarker(root, "epubs/gone", "book.json", { title: "Gone", retired: true });
    assert.deepEqual(
      scanWorkspace(root).retired.map((c) => c.slug),
      ["gone"],
    );
  } finally {
    cleanup();
  }

  for (const value of [undefined, false, "yes", 1, "true"]) {
    const { root, cleanup } = makeOutputRoot();
    try {
      writeUnit(root, "epubs/bk/chapter-1", { items: [card("a")] });
      const manifest = { title: "Bk" };
      if (value !== undefined) manifest.retired = value;
      writeMarker(root, "epubs/bk", "book.json", manifest);
      assert.deepEqual(
        scanWorkspace(root).collections.map((c) => c.slug),
        ["bk"],
        `retired: ${JSON.stringify(value)} must still be swept`,
      );
    } finally {
      cleanup();
    }
  }
});

test("pointing preflight at ONE retired collection still checks it", () => {
  // The filter keeps dead decks out of a whole-root sweep; it must not make them unexaminable.
  // Naming a directory explicitly is a deliberate act.
  const { root, cleanup } = makeOutputRoot();
  try {
    writeUnit(root, "courses/dead/lesson-1", { items: [card("b")] });
    writeMarker(root, "courses/dead", "course.json", { name: "Dead", retired: true });
    const collection = describeCollectionDir(join(root, "courses", "dead"));
    assert.equal(collection.kind, "course");
    assert.equal(collection.unitDirs.length, 1, "its unit is still enumerated");
  } finally {
    cleanup();
  }
});
