import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

import { mergeIntoCardsFile } from "../../src/cards/mergeIntoCardsFile.js";

const card = (id, over = {}) => ({
  id,
  english: `English ${id}`,
  target: `ターゲット${id}`,
  pronunciation: `p-${id}`,
  category: "Other",
  ...over,
});

function withCards(items, meta, fn) {
  const dir = mkdtempSync(join(tmpdir(), "merge-cards-"));
  const path = join(dir, "cards.json");
  writeFileSync(
    path,
    JSON.stringify({ meta: { targetLanguage: "ja", ...meta }, items }, null, 2) + "\n",
  );
  try {
    return fn(path, () => JSON.parse(readFileSync(path, "utf-8")), dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const baks = (dir) => readdirSync(dir).filter((name) => name.endsWith(".bak"));

test("writes only the owned fields, leaving every other change on disk alone", () => {
  withCards([card("a"), card("b")], {}, (path, read) => {
    const result = mergeIntoCardsFile(path, {
      byId: new Map([["a", { note: "mine", english: "NOT MINE" }]]),
      ownedFields: ["note"],
      reason: "test",
    });

    assert.equal(result.changed, 1);
    const after = read();
    assert.equal(after.items[0].note, "mine");
    assert.equal(after.items[0].english, "English a", "an unowned field is never written");
  });
});

test("an id that vanished while the pass ran is simply not written", () => {
  withCards([card("a")], {}, (path, read) => {
    const result = mergeIntoCardsFile(path, {
      byId: new Map([["gone", { note: "for a card that is no longer here" }]]),
      ownedFields: ["note"],
      reason: "test",
    });
    assert.equal(result.changed, 0);
    assert.equal(read().items.length, 1);
  });
});

test("`undefined` deletes a field; `null` is stored, because the callers genuinely differ", () => {
  withCards([card("a", { note: "old", audio: "clip.mp3" })], {}, (path, read) => {
    mergeIntoCardsFile(path, {
      byId: new Map([["a", { note: null, audio: undefined }]]),
      ownedFields: ["note", "audio"],
      reason: "test",
    });
    const item = read().items[0];
    assert.equal(item.note, null);
    assert.equal("audio" in item, false, "an absent clip is an absent key, not audio: null");
  });
});

test("append adds new items at the end and never duplicates an id already there", () => {
  withCards([card("a")], {}, (path, read) => {
    const result = mergeIntoCardsFile(path, {
      append: [card("b", { fillInBlank: true }), card("a", { note: "dupe" })],
      reason: "test",
    });
    assert.equal(result.changed, 1);
    assert.deepEqual(
      read().items.map((i) => i.id),
      ["a", "b"],
    );
    assert.equal(read().items[0].note, undefined, "the duplicate was skipped, not merged");
  });
});

test("remove retires ids, and counts them as changes", () => {
  withCards([card("a"), card("b", { fillInBlank: true })], {}, (path, read) => {
    const result = mergeIntoCardsFile(path, { remove: ["b"], reason: "test" });
    assert.equal(result.changed, 1);
    assert.deepEqual(
      read().items.map((i) => i.id),
      ["a"],
    );
  });
});

test("meta is shallow-merged, and an undefined value deletes the key", () => {
  withCards([card("a")], { enriched: undefined, prepareDegraded: { why: "x" } }, (path, read) => {
    mergeIntoCardsFile(path, {
      meta: { enriched: true, prepareDegraded: undefined },
      reason: "test",
    });
    const meta = read().meta;
    assert.equal(meta.enriched, true);
    assert.equal("prepareDegraded" in meta, false);
    assert.equal(meta.targetLanguage, "ja", "an untouched meta key survives");
  });
});

test("a merge that changes nothing does not write and does not leave a backup", () => {
  withCards([card("a", { note: "same" })], {}, (path, read, dir) => {
    const before = readFileSync(path, "utf-8");
    const result = mergeIntoCardsFile(path, {
      byId: new Map([["a", { note: "same" }]]),
      ownedFields: ["note"],
      reason: "test",
    });
    assert.equal(result.changed, 0);
    assert.equal(result.backup, null);
    assert.equal(readFileSync(path, "utf-8"), before);
    assert.deepEqual(baks(dir), []);
    assert.equal(read().items[0].note, "same");
  });
});

test("a real change leaves a STAMPED backup, so two runs are separately reversible", () => {
  withCards([card("a")], {}, (path, read, dir) => {
    mergeIntoCardsFile(path, {
      byId: new Map([["a", { note: "first" }]]),
      ownedFields: ["note"],
      reason: "test",
    });
    mergeIntoCardsFile(path, {
      byId: new Map([["a", { note: "second" }]]),
      ownedFields: ["note"],
      reason: "test",
    });

    const snapshots = baks(dir).map(
      (name) => JSON.parse(readFileSync(join(dir, name), "utf-8")).items[0].note,
    );
    assert.equal(snapshots.length, 2);
    assert.deepEqual([...snapshots].sort(), ["first", undefined]);
    assert.equal(read().items[0].note, "second");
    for (const name of baks(dir)) assert.match(name, /cards\.json\.pre-test-\d{12}(-\d+)?\.bak/);
  });
});

test("a merge that would produce an invalid file throws before touching what is on disk", () => {
  withCards([card("a")], {}, (path) => {
    const before = readFileSync(path, "utf-8");
    assert.throws(
      () => mergeIntoCardsFile(path, { append: [{ id: "b" }], reason: "test" }),
      /english/,
    );
    assert.equal(readFileSync(path, "utf-8"), before);
  });
});

test("a reason is required, so a backup can never land unnamed", () => {
  withCards([card("a")], {}, (path) => {
    assert.throws(() => mergeIntoCardsFile(path, { remove: ["a"] }), /needs a `reason`/);
  });
});
