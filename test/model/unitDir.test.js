import test from "node:test";
import assert from "node:assert/strict";
import { UNIT_DIR_PATTERN, isUnitDir, parseUnitDir } from "../../src/model/unitDir.js";

test("isUnitDir recognises base and extras units of a book or course", () => {
  for (const name of [
    "chapter-0",
    "chapter-13",
    "chapter-13-extras",
    "lesson-3",
    "lesson-12-extras",
  ]) {
    assert.ok(isUnitDir(name), name);
  }
});

test("isUnitDir rejects everything that is not a unit directory", () => {
  // A template's unit dir is its LANGUAGE CODE, recognised by position under templates/ and never
  // by name. Each hand-copied regex got that right by accident; this pins it on purpose.
  for (const name of [
    "ja",
    "es",
    "chapter-x",
    "chapter",
    "chapter-3-drills",
    "chapter--1",
    "epubs",
  ]) {
    assert.ok(!isUnitDir(name), name);
  }
});

test("parseUnitDir returns named fields, so no caller touches a group index", () => {
  assert.deepEqual(parseUnitDir("chapter-13-extras"), {
    name: "chapter-13-extras",
    kind: "chapter",
    number: 13,
    extras: true,
  });
  assert.deepEqual(parseUnitDir("lesson-3"), {
    name: "lesson-3",
    kind: "lesson",
    number: 3,
    extras: false,
  });
});

test("parseUnitDir is null for a non-unit, so `if (unit)` is the whole guard", () => {
  assert.equal(parseUnitDir("ja"), null);
  assert.equal(parseUnitDir("chapter-3-drills"), null);
});

test("the pattern has one group layout, which is what the seven hand-copies did not", () => {
  // Three copies captured nothing, two captured (number, extras), and two captured
  // (kind, number, extras) and never read the kind. match[1] therefore meant different things in
  // different files. One layout, asserted here.
  assert.deepEqual(UNIT_DIR_PATTERN.exec("chapter-13-extras").slice(1), [
    "chapter",
    "13",
    "-extras",
  ]);
  assert.deepEqual(UNIT_DIR_PATTERN.exec("lesson-3").slice(1), ["lesson", "3", undefined]);
});
