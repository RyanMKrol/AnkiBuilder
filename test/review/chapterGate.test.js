import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  chapterUnits,
  chapterAudioReadiness,
  awaitingDone,
  chapterIsDone,
} from "../../src/review/chapterGate.js";

const base = (meta = { reviewed: true }) => ({ name: "chapter-2", extras: false, meta });
const extras = (meta = { reviewed: true }) => ({ name: "chapter-2-extras", extras: true, meta });

function withCollection(units, fn) {
  const dir = mkdtempSync(join(tmpdir(), "chapter-gate-"));
  for (const [name, meta] of Object.entries(units)) {
    mkdirSync(join(dir, name), { recursive: true });
    if (meta !== null)
      writeFileSync(join(dir, name, "cards.json"), JSON.stringify({ meta, items: [] }));
  }
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("a chapter's units are its base unit and its extras sibling, base first", () => {
  withCollection(
    {
      "chapter-2": { reviewed: true },
      "chapter-2-extras": { reviewed: false },
      "chapter-3": { reviewed: true },
    },
    (dir) => {
      const units = chapterUnits(dir, 2);
      assert.deepEqual(
        units.map((u) => u.name),
        ["chapter-2", "chapter-2-extras"],
      );
      assert.equal(units[0].extras, false);
    },
  );
});

test("audio waits for BOTH corpus reviews, not one", () => {
  const verdict = chapterAudioReadiness([base(), extras({ reviewed: false })]);
  assert.equal(verdict.ok, false);
  assert.match(verdict.reason, /chapter-2-extras not signed off/);
  assert.match(verdict.reason, /waits for both reviews rather than splitting into two/);
});

test("both reviewed opens the gate", () => {
  const verdict = chapterAudioReadiness([base(), extras()]);
  assert.equal(verdict.ok, true);
  assert.deepEqual(verdict.units, ["chapter-2", "chapter-2-extras"]);
});

test("a missing extras unit is 'not finished', not 'has none'", () => {
  // Phase 2 runs after the base review and before audio, so its absence means the chapter is
  // incomplete rather than that this chapter legitimately has no drills.
  const verdict = chapterAudioReadiness([base()]);
  assert.equal(verdict.ok, false);
  assert.match(verdict.reason, /not finished rather than that it has none/);
});

test("the three refusals are distinguishable, so a caller knows what to do next", () => {
  assert.match(chapterAudioReadiness([]).reason, /no units found/);
  assert.match(
    chapterAudioReadiness([{ name: "chapter-2", extras: false, meta: null }]).reason,
    /no readable cards\.json/,
  );
  assert.match(
    chapterAudioReadiness([base(), extras({ reviewed: false })]).reason,
    /not signed off/,
  );
});

test("an unreadable cards.json is reported rather than treated as unreviewed", () => {
  withCollection({ "chapter-2": null }, (dir) => {
    const units = chapterUnits(dir, 2);
    assert.equal(units[0].meta, null);
    assert.match(chapterAudioReadiness(units).reason, /no readable cards\.json/);
  });
});

test("awaitingDone and chapterIsDone track the shared sign-off", () => {
  const pair = [base({ reviewed: true }), extras({ reviewed: true })];
  assert.deepEqual(
    awaitingDone(pair).map((u) => u.name),
    ["chapter-2", "chapter-2-extras"],
  );
  assert.equal(chapterIsDone(pair), false);

  const finished = [base({ reviewed: true, done: true }), extras({ reviewed: true, done: true })];
  assert.deepEqual(awaitingDone(finished), []);
  assert.equal(chapterIsDone(finished), true);
  // Half-done is not done: the package build selects on `done` per unit.
  assert.equal(
    chapterIsDone([base({ reviewed: true, done: true }), extras({ reviewed: true })]),
    false,
  );
});
