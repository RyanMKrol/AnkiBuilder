import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "child_process";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import { makeOutputRoot, writeUnit, writeMarker, writeRaw, card } from "../audit/fixture.js";

/**
 * End-to-end tests for the two `scripts/` entry points, against a THROWAWAY output root.
 *
 * `scripts/` was thirteen files and 1,653 lines with no tests at all, and it is where roughly ten
 * new tools are about to land. The rule this workstream adopts, which the codebase already
 * half-followed: anything that reasons about or mutates `output/` keeps its logic in `src/` behind
 * unit tests, and the `.mjs` is arg parsing plus reporting. These tests cover the half that is left
 * — that the arg parsing, the scope filter and the EXIT CODE are what the pipeline docs claim. A
 * shipped arg-parsing bug was once fixed with a defensive comment rather than a test.
 *
 * Every run points at a tmpdir. Nothing here can see the repo's own `output/`, which the suite-wide
 * durable-write guard would fail the build over anyway.
 */

const REPO = resolve(join(dirname(fileURLToPath(import.meta.url)), "..", ".."));

function run(script, args) {
  const out = spawnSync(process.execPath, [join(REPO, "scripts", script), ...args], {
    cwd: REPO,
    encoding: "utf-8",
  });
  return { status: out.status, stdout: out.stdout ?? "", stderr: out.stderr ?? "" };
}

/** A book, a course, a template deck, and one deliberately broken unit of each kind. */
function fixtureRoot() {
  const { root, cleanup } = makeOutputRoot();
  writeUnit(root, "epubs/book/chapter-1", {
    meta: { epubHash: "h", chapterNumber: 11, reviewed: true },
    items: [card("ok")],
  });
  writeUnit(root, "epubs/book/chapter-1-extras", { items: [card("drill")] });
  writeUnit(root, "courses/course/lesson-1", { items: [card("lesson")] });
  writeUnit(root, "templates/numbers/ja", {
    meta: { sourceType: "template" },
    items: [card("one")],
  });
  return { root, cleanup };
}

test("preflight --all reports a coverage header naming every collection and unit shape", () => {
  const { root, cleanup } = fixtureRoot();
  try {
    const { status, stdout } = run("preflight.mjs", ["--all", root]);
    assert.match(stdout, /2 unit, 1 extras, 1 template/);
    assert.match(stdout, /1 course, 1 epub, 1 template/);
    assert.equal(status, 0, stdout);
  } finally {
    cleanup();
  }
});

test("preflight exits 1 on a FAIL finding and names the unit", () => {
  const { root, cleanup } = fixtureRoot();
  try {
    // A hand-authored extras unit with editorial spaces — the exact drift the spacing check exists
    // for, and the one shape that can still produce it.
    writeUnit(root, "epubs/book/chapter-2-extras", {
      items: [card("spaced", { target: "これは ペン です" })],
    });
    const { status, stdout } = run("preflight.mjs", ["--all", root]);
    assert.equal(status, 1);
    assert.match(stdout, /chapter-2-extras\/spaced\.target/);
    assert.match(stdout, /FAIL finding\(s\)/);
  } finally {
    cleanup();
  }
});

test("preflight exits 1 on an unreviewed ACK finding, and 0 once it is accepted", () => {
  const { root, cleanup } = fixtureRoot();
  try {
    // Two bare-guid collections sharing an id with DIFFERENT content: the live `scarf` case.
    writeMarker(root, "epubs/book", "book.json", { slug: "book" });
    writeMarker(root, "courses/course", "course.json", { name: "course" });
    writeUnit(root, "epubs/book/chapter-3", { items: [card("scarf", { target: "スカーフ" })] });
    writeUnit(root, "courses/course/lesson-2", { items: [card("scarf", { target: "マフラー" })] });

    const first = run("preflight.mjs", ["--all", root, "--only", "cross-collection-ids"]);
    assert.equal(first.status, 1);
    assert.match(first.stdout, /1 UNREVIEWED/);

    const accept = run("preflight.mjs", [
      "--all",
      root,
      "--only",
      "cross-collection-ids",
      "--accept",
      "--note",
      "known",
    ]);
    assert.equal(accept.status, 0);
    assert.match(accept.stdout, /accepted 1 finding/);

    const second = run("preflight.mjs", ["--all", root, "--only", "cross-collection-ids"]);
    assert.equal(second.status, 0, second.stdout);
    assert.match(second.stdout, /all acknowledged/);
  } finally {
    cleanup();
  }
});

test("preflight --scope runs only that scope's checks", () => {
  const { root, cleanup } = fixtureRoot();
  try {
    const { stdout } = run("preflight.mjs", ["--all", root, "--scope", "workspace"]);
    assert.doesNotMatch(stdout, /── epubs?\/?book/);
    assert.match(stdout, /check\(s\) declared/);
  } finally {
    cleanup();
  }
});

test("preflight on ONE collection dir works for a book, a course and a template deck", () => {
  const { root, cleanup } = fixtureRoot();
  try {
    for (const [dir, expect] of [
      [join(root, "epubs/book"), /1 epub/],
      [join(root, "courses/course"), /1 course/],
      [join(root, "templates/numbers/ja"), /1 template/],
    ]) {
      const { stdout } = run("preflight.mjs", [dir]);
      assert.match(stdout, expect, dir);
    }
  } finally {
    cleanup();
  }
});

test("an empty output root exits 0 and says so, rather than reading as clean", () => {
  const { root, cleanup } = makeOutputRoot();
  try {
    const { status, stdout } = run("preflight.mjs", ["--all", root]);
    assert.equal(status, 0);
    assert.match(stdout, /\(no collections found under/);
  } finally {
    cleanup();
  }
});

test("preflight --schema-only is what validate-decks runs, and both see the template unit", () => {
  const { root, cleanup } = fixtureRoot();
  try {
    // A template unit with a bad field type: only reachable at all because the shared loader knows
    // the templates/<name>/<lang> shape. The old preflight regex could not match it.
    writeUnit(root, "templates/numbers/ja", {
      meta: { sourceType: "template" },
      items: [card("bad", { english: 7 })],
    });
    const preflight = run("preflight.mjs", ["--all", root, "--schema-only"]);
    const validate = run("validate-decks.mjs", [root]);
    assert.equal(preflight.status, 1);
    assert.equal(validate.status, 1);
    for (const out of [preflight.stdout, validate.stdout]) {
      assert.match(out, /numbers\/ja/);
      assert.match(out, /cards\.json/);
    }
  } finally {
    cleanup();
  }
});

test("a foreign .apkg in a collection dir is a FAIL, and the collection's own package is not", () => {
  const { root, cleanup } = fixtureRoot();
  try {
    writeRaw(root, "courses/course/course.apkg", "own");
    const clean = run("preflight.mjs", ["--all", root, "--only", "stray-package"]);
    assert.equal(clean.status, 0, clean.stdout);

    writeRaw(root, "courses/course/some-other-book.apkg", "FOREIGN");
    const dirty = run("preflight.mjs", ["--all", root, "--only", "stray-package"]);
    assert.equal(dirty.status, 1);
    assert.match(dirty.stdout, /some-other-book\.apkg is not this collection's package/);
  } finally {
    cleanup();
  }
});

test("extras-duplicate-check reports without --apply and exits 2, writing nothing", () => {
  const { root, cleanup } = fixtureRoot();
  try {
    writeUnit(root, "epubs/book/chapter-4", {
      items: [card("pen-a", { target: "ペン", english: "Pen" })],
    });
    writeUnit(root, "epubs/book/chapter-5", {
      items: [card("pen-b", { target: "ペン", english: "Pen" })],
    });
    const { status, stdout } = run("extras-duplicate-check.mjs", [join(root, "epubs/book")]);
    // Exit 2 is the script's "found something, changed nothing" code.
    assert.equal(status, 2);
    assert.match(stdout, /would exclude/);
    assert.doesNotMatch(stdout, /wrote /);
  } finally {
    cleanup();
  }
});

test("extras-duplicate-check --apply refuses a group whose glosses disagree", () => {
  const { root, cleanup } = fixtureRoot();
  try {
    // The live に case in miniature: a number and a particle sharing one spelling.
    writeUnit(root, "epubs/book/chapter-4", {
      items: [card("num-2", { target: "に", english: "2" })],
    });
    writeUnit(root, "epubs/book/chapter-5", {
      items: [card("ni-particle", { target: "に", english: "To (particle)" })],
    });
    const { status, stdout } = run("extras-duplicate-check.mjs", [
      join(root, "epubs/book"),
      "--apply",
    ]);
    assert.equal(status, 0);
    assert.match(stdout, /two senses, not a duplicate/);
    assert.match(stdout, /excluded 0 duplicate/);
    assert.doesNotMatch(stdout, /wrote /);
  } finally {
    cleanup();
  }
});
