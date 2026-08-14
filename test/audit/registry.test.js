import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { acceptFindings, audit, defineCheck } from "../../src/audit/index.js";
import { acceptedPath } from "../../src/audit/accepted.js";
import { makeOutputRoot, writeUnit, card } from "./fixture.js";

function threeShapes(root) {
  writeUnit(root, "epubs/book/chapter-1", { items: [card("a")] });
  writeUnit(root, "epubs/book/chapter-1-extras", { items: [card("b")] });
  writeUnit(root, "courses/course/lesson-1", { items: [card("c")] });
  writeUnit(root, "templates/numbers/ja", {
    meta: { sourceType: "template" },
    items: [card("d")],
  });
}

const countingCheck = (scope, tier, findingsPerRun = 0) =>
  defineCheck({
    id: `probe-${scope}-${tier}`.toLowerCase(),
    title: `probe ${scope}`,
    scope,
    tier,
    run() {
      return {
        findings: Array.from({ length: findingsPerRun }, (_, i) => ({
          key: `f${i}`,
          message: `finding ${i}`,
        })),
        summary: "ran",
      };
    },
  });

test("scope decides how many times a check runs", () => {
  const { root, cleanup } = makeOutputRoot();
  try {
    threeShapes(root);
    const checks = [
      countingCheck("unit", "INFO"),
      countingCheck("collection", "INFO"),
      countingCheck("workspace", "INFO"),
    ];
    const { results } = audit({ outputRoot: root, checks });
    const runsOf = (scope) => results.filter((r) => r.scope === scope).length;
    // 4 units (book chapter + its extras + course lesson + template), 3 collections, 1 workspace.
    assert.equal(runsOf("unit"), 4);
    assert.equal(runsOf("collection"), 3);
    assert.equal(runsOf("workspace"), 1);
  } finally {
    cleanup();
  }
});

test("the coverage header counts collections, unit shapes and skipped checks", () => {
  const { root, cleanup } = makeOutputRoot();
  try {
    threeShapes(root);
    const skipper = defineCheck({
      id: "skipper",
      title: "skipper",
      scope: "collection",
      tier: "FAIL",
      run: () => ({ skipped: "no input on this machine" }),
    });
    const { coverage } = audit({ outputRoot: root, checks: [skipper] });
    assert.equal(coverage.collections, 3);
    assert.deepEqual(coverage.collectionsByKind, { epub: 1, course: 1, template: 1 });
    assert.equal(coverage.units, 4);
    assert.deepEqual(coverage.unitsByShape, { unit: 2, extras: 1, template: 1 });
    assert.equal(coverage.checksSkipped, 3);
  } finally {
    cleanup();
  }
});

test("a skipped check is never a pass and never a failure", () => {
  const { root, cleanup } = makeOutputRoot();
  try {
    threeShapes(root);
    const skipper = defineCheck({
      id: "skipper",
      title: "skipper",
      scope: "workspace",
      tier: "FAIL",
      run: () => ({ skipped: "nothing to look at" }),
    });
    const result = audit({ outputRoot: root, checks: [skipper] });
    assert.equal(result.exitCode, 0);
    assert.equal(result.results[0].skipped, "nothing to look at");
    assert.equal(result.results[0].findings.length, 0);
  } finally {
    cleanup();
  }
});

test("FAIL findings block; INFO findings never do", () => {
  const { root, cleanup } = makeOutputRoot();
  try {
    threeShapes(root);
    assert.equal(
      audit({ outputRoot: root, checks: [countingCheck("workspace", "INFO", 5)] }).exitCode,
      0,
    );
    const failing = audit({ outputRoot: root, checks: [countingCheck("workspace", "FAIL", 2)] });
    assert.equal(failing.exitCode, 1);
    assert.equal(failing.failCount, 2);
  } finally {
    cleanup();
  }
});

test("a throwing check reports itself instead of silently passing", () => {
  const { root, cleanup } = makeOutputRoot();
  try {
    threeShapes(root);
    const thrower = defineCheck({
      id: "thrower",
      title: "thrower",
      scope: "workspace",
      tier: "FAIL",
      run() {
        throw new Error("boom");
      },
    });
    const result = audit({ outputRoot: root, checks: [thrower] });
    assert.equal(result.exitCode, 1);
    assert.match(result.results[0].findings[0].message, /check threw: boom/);
  } finally {
    cleanup();
  }
});

test("ACK findings block until accepted, then stop blocking without disappearing", () => {
  const { root, cleanup } = makeOutputRoot();
  try {
    threeShapes(root);
    const checks = [countingCheck("collection", "ACK", 2)];

    const before = audit({ outputRoot: root, checks });
    assert.equal(before.exitCode, 1);
    assert.equal(before.unreviewedCount, 6); // 2 findings x 3 collections

    const written = acceptFindings(before.results, { note: "known" });
    assert.equal(written.length, 3);
    for (const { path, added } of written) {
      assert.equal(added, 2);
      assert.ok(existsSync(path));
    }

    const after = audit({ outputRoot: root, checks });
    assert.equal(after.exitCode, 0);
    assert.equal(after.unreviewedCount, 0);
    // Still reported, just not as unreviewed — an accepted finding is a standing count, not a
    // deletion.
    assert.equal(after.results[0].findings.length, 2);
    assert.equal(after.results[0].accepted, 2);
  } finally {
    cleanup();
  }
});

test("an acknowledgement is keyed per unit, so accepting one does not accept its neighbour", () => {
  const { root, cleanup } = makeOutputRoot();
  try {
    writeUnit(root, "epubs/book/chapter-1", { items: [card("a")] });
    writeUnit(root, "epubs/book/chapter-2", { items: [card("b")] });
    const perUnit = defineCheck({
      id: "per-unit",
      title: "per unit",
      scope: "unit",
      tier: "ACK",
      run: () => ({ findings: [{ key: "same-key", message: "same message" }] }),
    });

    const first = audit({ outputRoot: root, checks: [perUnit] });
    assert.deepEqual(
      first.results.flatMap((r) => r.findings.map((f) => f.key)),
      ["chapter-1/same-key", "chapter-2/same-key"],
    );

    // Accept only chapter-1's instance.
    acceptFindings([first.results[0]]);
    const second = audit({ outputRoot: root, checks: [perUnit] });
    assert.equal(second.unreviewedCount, 1);
    assert.equal(second.results[1].unreviewed[0].key, "chapter-2/same-key");
  } finally {
    cleanup();
  }
});

test("acceptance is recorded in the collection's own file and keeps its first timestamp", () => {
  const { root, cleanup } = makeOutputRoot();
  try {
    writeUnit(root, "epubs/book/chapter-1", { items: [card("a")] });
    const checks = [countingCheck("collection", "ACK", 1)];
    const first = audit({ outputRoot: root, checks });
    acceptFindings(first.results, { now: () => new Date("2020-01-01T00:00:00Z") });

    const path = acceptedPath(join(root, "epubs/book"));
    const record = JSON.parse(readFileSync(path, "utf-8"));
    const entry = record.accepted["probe-collection-ack"]["f0"];
    assert.equal(entry.at, "2020-01-01T00:00:00.000Z");

    // Re-accepting keeps the ORIGINAL date: the file records when a decision was made, not when
    // preflight last ran.
    acceptFindings(audit({ outputRoot: root, checks }).results, {
      now: () => new Date("2024-06-06T00:00:00Z"),
    });
    const again = JSON.parse(readFileSync(path, "utf-8"));
    assert.equal(again.accepted["probe-collection-ack"]["f0"].at, "2020-01-01T00:00:00.000Z");
  } finally {
    cleanup();
  }
});

test("an unreadable acknowledgement file throws rather than silently un-accepting everything", () => {
  const { root, cleanup } = makeOutputRoot();
  try {
    writeUnit(root, "epubs/book/chapter-1", { items: [card("a")] });
    writeFileSync(acceptedPath(join(root, "epubs/book")), "{ broken");
    assert.throws(() => audit({ outputRoot: root, checks: [] }), /will not parse/);
  } finally {
    cleanup();
  }
});

test("an empty output root reports as empty, not as clean", () => {
  const { root, cleanup } = makeOutputRoot();
  try {
    const result = audit({ outputRoot: root });
    assert.equal(result.workspace.collections.length, 0);
    assert.equal(result.exitCode, 0);
  } finally {
    cleanup();
  }
});

test("defineCheck refuses an unknown scope or tier", () => {
  assert.throws(
    () => defineCheck({ id: "x", title: "x", scope: "galaxy", tier: "FAIL", run: () => ({}) }),
    /unknown scope/,
  );
  assert.throws(
    () => defineCheck({ id: "x", title: "x", scope: "unit", tier: "MAYBE", run: () => ({}) }),
    /unknown tier/,
  );
});
