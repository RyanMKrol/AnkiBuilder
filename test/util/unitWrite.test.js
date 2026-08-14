import { test } from "node:test";
import assert from "node:assert";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { backupFileStamped } from "../../src/util/atomicWrite.js";
import { writeUnitJson, validatorFor } from "../../src/util/unitWrite.js";

function scratch() {
  return mkdtempSync(join(tmpdir(), "anki-builder-unitwrite-"));
}

function cardsDoc(items) {
  return {
    meta: { targetLanguage: "ja", sourceType: "epub" },
    items,
  };
}

const ONE_CARD = [
  { id: "a", english: "one", category: "Numbers", target: "いち", pronunciation: "ichi" },
];

test("backupFileStamped names the backup <file>.pre-<reason>-<YYYYMMDDHHmm>.bak", () => {
  const dir = scratch();
  try {
    const file = join(dir, "cards.json");
    writeFileSync(file, "before\n");

    const backup = backupFileStamped(file, "extras-order", new Date(2026, 7, 14, 19, 47));

    assert.strictEqual(backup, `${file}.pre-extras-order-202608141947.bak`);
    assert.strictEqual(readFileSync(backup, "utf-8"), "before\n");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// The whole reason for stamping: backupFileOnce keeps the FIRST snapshot forever, so a second run of
// a tool leaves no way back to the state IT found.
test("backupFileStamped never overwrites an existing backup, even within the same minute", () => {
  const dir = scratch();
  try {
    const file = join(dir, "cards.json");
    const sameMinute = new Date(2026, 7, 14, 19, 47);

    writeFileSync(file, "run-1 input\n");
    const first = backupFileStamped(file, "jumble", sameMinute);
    writeFileSync(file, "run-2 input\n");
    const second = backupFileStamped(file, "jumble", sameMinute);

    assert.notStrictEqual(first, second);
    assert.strictEqual(readFileSync(first, "utf-8"), "run-1 input\n");
    assert.strictEqual(readFileSync(second, "utf-8"), "run-2 input\n");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("writeUnitJson writes the file, keeps a stamped backup and leaves no temp files", () => {
  const dir = scratch();
  try {
    const file = join(dir, "cards.json");
    writeFileSync(file, JSON.stringify(cardsDoc([]), null, 2) + "\n");

    const { backup } = writeUnitJson(file, cardsDoc(ONE_CARD), { reason: "extras-dupes" });

    assert.ok(backup?.includes(".pre-extras-dupes-"));
    assert.strictEqual(JSON.parse(readFileSync(file, "utf-8")).items.length, 1);
    assert.strictEqual(JSON.parse(readFileSync(backup, "utf-8")).items.length, 0);
    assert.ok(readFileSync(file, "utf-8").endsWith("\n"));
    assert.deepStrictEqual(
      readdirSync(dir).filter((name) => name.includes(".tmp.")),
      [],
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("writeUnitJson refuses a malformed document and leaves the old file untouched", () => {
  const dir = scratch();
  try {
    const file = join(dir, "cards.json");
    const original = JSON.stringify(cardsDoc(ONE_CARD), null, 2) + "\n";
    writeFileSync(file, original);

    assert.throws(() =>
      // `english` is required, so this is exactly the shape a buggy --apply could build.
      writeUnitJson(file, cardsDoc([{ id: "b", category: "Numbers", target: "に" }]), {
        reason: "extras-order",
      }),
    );

    assert.strictEqual(readFileSync(file, "utf-8"), original);
    assert.deepStrictEqual(readdirSync(dir), ["cards.json"], "no backup, no temp file");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("writeUnitJson creates a file that did not exist yet, with no backup", () => {
  const dir = scratch();
  try {
    const file = join(dir, "cards.json");
    const { backup } = writeUnitJson(file, cardsDoc(ONE_CARD), { reason: "extras-order" });

    assert.strictEqual(backup, null);
    assert.strictEqual(JSON.parse(readFileSync(file, "utf-8")).items.length, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("writeUnitJson insists on a reason, so a backup can never land unnamed", () => {
  const dir = scratch();
  try {
    assert.throws(() => writeUnitJson(join(dir, "cards.json"), cardsDoc(ONE_CARD), {}), /reason/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("validatorFor picks the schema off the filename, and is null for anything else", () => {
  assert.ok(validatorFor("/x/cards.json"));
  assert.ok(validatorFor("/x/corpus.json"));
  assert.notStrictEqual(validatorFor("/x/cards.json"), validatorFor("/x/corpus.json"));
  assert.strictEqual(validatorFor("/x/book.json"), null);
  assert.strictEqual(validatorFor("/x/cards.json.pre-jumble-202608141947.bak"), null);
});
