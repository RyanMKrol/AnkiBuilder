import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  ANKI_PYTHON_PIN,
  PYTHON_PROGRAM,
  RESULT_SENTINEL,
  checkResult,
  ensureVenv,
  parseResult,
  probePython,
  verifyApkgImport,
} from "../../src/deck/verifyImport.js";
import { buildDeck } from "../../src/deck/index.js";

/**
 * The verifier's own logic, driven with a FAKE `spawnSync`.
 *
 * The real thing needs a Python toolchain and downloads a large wheel, so it must never be a
 * dependency of `npm run ci` — a fresh clone with no Python has to stay green. The end-to-end test
 * at the bottom is env-gated for exactly that reason and skips cleanly when Python is absent.
 */

const RESULT = {
  before: {
    notes: 0,
    cards: 0,
    decks: ["Default"],
    dconf_ids: [1],
    dconf_names: ["Default"],
    models: ["Basic"],
    guids: [],
    media: [],
  },
  afterFirstImport: {
    notes: 2,
    cards: 4,
    decks: ["Default", "AnkiBuilder Smoke"],
    dconf_ids: [1],
    dconf_names: ["Default"],
    models: ["Basic", "AnkiBuilder ja"],
    guids: ["smoke-1", "smoke-2"],
    media: [],
  },
  afterSecondImport: {
    notes: 2,
    cards: 4,
    decks: ["Default", "AnkiBuilder Smoke"],
    dconf_ids: [1],
    dconf_names: ["Default"],
    models: ["Basic", "AnkiBuilder ja"],
    guids: ["smoke-1", "smoke-2"],
    media: [],
  },
  answers: {
    dconfIdOneCollided: false,
    dconfNamesAfterImport: ["Default"],
    reimportDuplicatedNotes: false,
    reimportNoteDelta: 0,
    guidsStableAcrossReimport: true,
  },
};

test("the Python half is asked for exactly one machine-readable line", () => {
  assert.match(PYTHON_PROGRAM, /print\("ANKI_VERIFY_RESULT "/);
  // The two questions the plan refuses to assume must both be answered by the program itself,
  // rather than inferred later from raw counts.
  assert.match(PYTHON_PROGRAM, /dconfIdOneCollided/);
  assert.match(PYTHON_PROGRAM, /reimportDuplicatedNotes/);
  // It imports TWICE — that is the only way to answer the guid question.
  assert.equal(PYTHON_PROGRAM.match(/do_import\(\)/g).length, 3); // definition + two calls
});

test("parseResult picks the sentinel line out of Anki's own chatter", () => {
  const stdout = [
    "some anki logging",
    `${RESULT_SENTINEL}${JSON.stringify({ answers: { reimportNoteDelta: 0 } })}`,
    "more logging",
  ].join("\n");
  assert.equal(parseResult(stdout).answers.reimportNoteDelta, 0);
});

test("a run that produced no result line is a finding, not a silent pass", () => {
  assert.throws(() => parseResult("traceback ..."), /produced no result line/);
});

test("checkResult asserts the import landed and RECORDS the two open questions", () => {
  const checks = checkResult(RESULT, { expectedNotes: 2 });
  assert.ok(checks.every((c) => c.ok));
  const byLabel = Object.fromEntries(checks.map((c) => [c.label, c.detail]));
  assert.match(byLabel["re-import behaviour recorded"], /matches by guid/);
  assert.match(byLabel["dconf id-1 behaviour recorded"], /Default/);
});

test("checkResult fails a package whose note count is not what was built", () => {
  const checks = checkResult(RESULT, { expectedNotes: 5 });
  const failed = checks.filter((c) => !c.ok);
  assert.equal(failed.length, 1);
  assert.match(failed[0].detail, /expected 5, got 2/);
});

test("checkResult fails when the note type never arrived", () => {
  const broken = {
    ...RESULT,
    afterFirstImport: { ...RESULT.afterFirstImport, models: ["Basic"] },
  };
  assert.ok(checkResult(broken).some((c) => !c.ok && c.label === "the note type arrived"));
});

test("verifyApkgImport refuses a package that is not there", () => {
  assert.throws(
    () => verifyApkgImport("/nope/missing.apkg", "/tmp/x", { python: "python" }),
    /no such package/,
  );
});

test("a non-zero exit from the Python half surfaces both streams", () => {
  const dir = mkdtempSync(join(tmpdir(), "verify-fake-"));
  const apkg = join(dir, "x.apkg");
  buildDeck(
    {
      meta: { targetLanguage: "ja", sourceType: "manual" },
      items: [{ id: "a", english: "A", category: "Numbers", target: "あ", pronunciation: "a" }],
    },
    { outPath: apkg, getFont: () => undefined },
  );
  try {
    assert.throws(
      () =>
        verifyApkgImport(apkg, join(dir, "work"), {
          python: "python",
          run: () => ({
            status: 1,
            stdout: "partial",
            stderr: "ImportError: no module named anki",
          }),
        }),
      /ImportError: no module named anki/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("ensureVenv reuses an existing venv rather than reinstalling", () => {
  const dir = mkdtempSync(join(tmpdir(), "verify-venv-"));
  try {
    const calls = [];
    const run = (cmd, args) => {
      calls.push([cmd, ...args]);
      // Pretend `python3 -m venv` produced the interpreter.
      if (args.includes("venv")) {
        mkdirSync(join(dir, "bin"), { recursive: true });
        writeFileSync(join(dir, "bin", "python"), "");
      }
      return { status: 0 };
    };
    const python = ensureVenv(dir, { run, log: () => {} });
    assert.equal(python, join(dir, "bin", "python"));
    assert.ok(
      calls.some((c) => c.includes(ANKI_PYTHON_PIN)),
      "pinned the anki version",
    );

    const second = [];
    ensureVenv(dir, { run: (...a) => (second.push(a), { status: 0 }), log: () => {} });
    assert.deepEqual(second, [], "a second call installs nothing");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/**
 * The real thing. Gated on ANKI_BUILDER_VERIFY_APKG=1 AND on python3 actually being present, so
 * `npm run ci` never depends on a Python toolchain or a network fetch. Run it deliberately:
 *
 *   ANKI_BUILDER_VERIFY_APKG=1 node --test test/deck/verifyImport.test.js
 */
test("end-to-end: a real import of a package this repo built", { skip: skipReason() }, () => {
  const dir = mkdtempSync(join(tmpdir(), "verify-e2e-"));
  try {
    const apkg = join(dir, "smoke.apkg");
    buildDeck(
      {
        meta: { targetLanguage: "ja", sourceType: "manual", chapterLabel: "Smoke" },
        items: [
          { id: "s1", english: "One", category: "Numbers", target: "いち", pronunciation: "ichi" },
          { id: "s2", english: "Two", category: "Numbers", target: "に", pronunciation: "ni" },
        ],
      },
      { outPath: apkg, deckName: "AnkiBuilder Smoke", getFont: () => undefined },
    );
    assert.ok(existsSync(apkg));

    const python = ensureVenv(join(dir, "venv"), { log: () => {} });
    const result = verifyApkgImport(apkg, join(dir, "work"), { python });
    const checks = checkResult(result, { expectedNotes: 2 });
    for (const check of checks) assert.ok(check.ok, `${check.label}: ${check.detail}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

function skipReason() {
  if (!process.env.ANKI_BUILDER_VERIFY_APKG) {
    return "set ANKI_BUILDER_VERIFY_APKG=1 to run the real import (needs python3 + a wheel download)";
  }
  return probePython() ? false : "python3 is not on PATH";
}
