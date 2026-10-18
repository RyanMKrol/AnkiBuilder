import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "fs";
import { dirname, join, resolve } from "path";
import { tmpdir } from "os";
import { fileURLToPath } from "url";
import {
  backupAllManagedDecks,
  backupManagedDecks,
  backupStamp,
  pruneBackups,
  resolveBackupTargets,
} from "../../src/anki/deliver.js";
import { noteTypeSpec } from "../../src/deck/collection.js";

/**
 * The standalone backup (scripts/backup-anki-decks.mjs). Every test runs against a tmpdir output
 * root and backup root and a fake client: nothing here reaches AnkiConnect (CLAUDE.md rule 6).
 */

const REPO = resolve(join(dirname(fileURLToPath(import.meta.url)), "..", ".."));
const SPEC = noteTypeSpec("ja");
const NOW = Date.parse("2026-10-18T21:30:00.000Z");

function course(root, slug, { name, marker, retired = false } = {}) {
  const dir = join(root, "courses", slug);
  mkdirSync(join(dir, "lesson-0"), { recursive: true });
  writeFileSync(
    join(dir, "course.json"),
    JSON.stringify({ name, targetLanguage: "ja", ...(retired ? { retired: true } : {}) }),
  );
  if (marker !== undefined) {
    writeFileSync(
      join(dir, "anki-delivered.json"),
      typeof marker === "string" ? marker : JSON.stringify(marker),
    );
  }
  return dir;
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "backup-decks-out-"));
  const backupRoot = mkdtempSync(join(tmpdir(), "backup-decks-root-"));
  course(root, "alpha", { name: "Alpha", marker: { ankiParent: "Alpha Course" } });
  course(root, "beta", { name: "Beta", marker: { ankiParent: "Beta: Two" } });
  course(root, "gone", { name: "Gone", marker: { ankiParent: "Gone" }, retired: true });
  course(root, "fresh", { name: "Fresh" });
  return { root, backupRoot };
}

function fakeClient({ profile = "Ryan", exportResult = true } = {}) {
  const exported = [];
  return {
    exported,
    client: {
      version: async () => 6,
      invoke: async (action) => {
        if (action === "getActiveProfile") return profile;
        throw new Error(`unexpected invoke ${action}`);
      },
      exportPackage: async (deck, path, includeSched) => {
        exported.push({ deck, includeSched });
        if (exportResult) writeFileSync(path, `apkg of ${deck}`);
        return exportResult;
      },
      modelFieldNames: async () => [...SPEC.fields],
      modelTemplates: async () => ({ Recognition: { Front: "f", Back: "b" } }),
      modelStyling: async () => ({ css: ".card{}" }),
    },
  };
}

const cleanup = (...dirs) => dirs.forEach((d) => rmSync(d, { recursive: true, force: true }));

test("resolveBackupTargets reads each delivered marker and skips retired and undelivered", () => {
  const { root, backupRoot } = fixture();
  try {
    const { parents, modelNames, skipped } = resolveBackupTargets(root);
    assert.deepEqual(parents.sort(), ["Alpha Course", "Beta: Two"]);
    assert.deepEqual(modelNames, [SPEC.modelName]);
    assert.deepEqual(skipped.map((s) => `${s.id}:${s.reason}`).sort(), [
      "fresh:never delivered",
      "gone:retired",
    ]);
  } finally {
    cleanup(root, backupRoot);
  }
});

test("a marker that will not parse, or has no ankiParent, stops the backup", () => {
  const { root, backupRoot } = fixture();
  try {
    course(root, "broken", { name: "Broken", marker: "{ not json" });
    assert.throws(() => resolveBackupTargets(root), /will not parse/);
    rmSync(join(root, "courses", "broken"), { recursive: true });
    course(root, "nameless", { name: "Nameless", marker: { deliveredCardIds: [] } });
    assert.throws(() => resolveBackupTargets(root), /has no ankiParent/);
  } finally {
    cleanup(root, backupRoot);
  }
});

test("a standalone backup writes the restore layout under a labelled stamp, and never prunes", async () => {
  const { root, backupRoot } = fixture();
  try {
    // More routine snapshots than a delivery keeps, all in one old week: a delivery would prune.
    const old = Array.from(
      { length: 12 },
      (_, i) => `2026-07-0${(i % 7) + 1}T0${i % 10}-00-00-000Z`,
    );
    for (const stamp of old) mkdirSync(join(backupRoot, stamp), { recursive: true });
    const before = readdirSync(backupRoot).length;

    const { client, exported } = fakeClient();
    const result = await backupAllManagedDecks(root, {
      client,
      backupRoot,
      label: "pre qa/fix",
      now: () => NOW,
    });

    assert.equal(result.profile, "Ryan");
    assert.equal(result.backupDir, join(backupRoot, "2026-10-18T21-30-00-000Z-pre-qa-fix"));
    assert.ok(
      exported.every((e) => e.includeSched === true),
      "exported WITH scheduling",
    );
    const manifest = JSON.parse(readFileSync(join(result.backupDir, "manifest.json"), "utf-8"));
    assert.deepEqual(manifest.decks.map((d) => d.deck).sort(), ["Alpha Course", "Beta: Two"]);
    for (const d of manifest.decks) assert.ok(existsSync(d.path), `${d.path} was written`);
    const models = JSON.parse(readFileSync(join(result.backupDir, "models.json"), "utf-8"));
    assert.deepEqual(Object.keys(models), [SPEC.modelName]);
    assert.deepEqual(models[SPEC.modelName].fields, SPEC.fields);
    assert.equal(readdirSync(backupRoot).length, before + 1, "nothing was pruned");
  } finally {
    cleanup(root, backupRoot);
  }
});

test("restore-anki-backup.mjs --list reads the standalone snapshot", async () => {
  const { root, backupRoot } = fixture();
  try {
    const { client } = fakeClient();
    await backupAllManagedDecks(root, { client, backupRoot, label: "pre-qa-fix", now: () => NOW });
    const out = execFileSync(
      process.execPath,
      [join(REPO, "scripts/restore-anki-backup.mjs"), "--list"],
      {
        env: { ...process.env, ANKI_BUILDER_BACKUP_ROOT: backupRoot },
        encoding: "utf-8",
      },
    );
    assert.match(out, /2026-10-18T21-30-00-000Z-pre-qa-fix\n {2}(Alpha Course|Beta: Two)\n/);
    assert.match(out, / {2}Beta: Two/);
  } finally {
    cleanup(root, backupRoot);
  }
});

test("a probe profile is refused unless allowed", async () => {
  for (const profile of ["Testing", "Claude Test Profile"]) {
    const { root, backupRoot } = fixture();
    try {
      const { client, exported } = fakeClient({ profile });
      await assert.rejects(
        () => backupAllManagedDecks(root, { client, backupRoot }),
        /probe profile/,
      );
      assert.equal(exported.length, 0, "nothing was exported");
      assert.deepEqual(readdirSync(backupRoot), [], "no snapshot dir was made");
      const ok = await backupAllManagedDecks(root, { client, backupRoot, allowTestProfile: true });
      assert.equal(ok.backedUp.length, 2);
    } finally {
      cleanup(root, backupRoot);
    }
  }
});

test("a delivered deck that exports nothing fails the backup", async () => {
  const { root, backupRoot } = fixture();
  try {
    const { client } = fakeClient({ exportResult: false });
    await assert.rejects(
      () => backupAllManagedDecks(root, { client, backupRoot }),
      /backup failed for "(Alpha Course|Beta: Two)".*no deck is named/,
    );
  } finally {
    cleanup(root, backupRoot);
  }
});

test("backupManagedDecks skips an absent deck only when it is not required", async () => {
  const backupRoot = mkdtempSync(join(tmpdir(), "backup-decks-root-"));
  try {
    const { client } = fakeClient({ exportResult: false });
    const lines = [];
    const { backedUp } = await backupManagedDecks(client, ["New Book"], {
      backupRoot,
      mustExist: new Set(),
      log: (m) => lines.push(m),
    });
    assert.deepEqual(backedUp, []);
    assert.match(lines.join("\n"), /never been delivered/);
  } finally {
    cleanup(backupRoot);
  }
});

test("backupStamp appends a sanitised label, and pruneBackups leaves labelled snapshots alone", () => {
  assert.equal(backupStamp(NOW), "2026-10-18T21-30-00-000Z");
  assert.equal(backupStamp(NOW, " pre qa: fix "), "2026-10-18T21-30-00-000Z-pre-qa-fix");
  assert.equal(backupStamp(NOW, ""), "2026-10-18T21-30-00-000Z");

  const root = mkdtempSync(join(tmpdir(), "backup-prune-labelled-"));
  try {
    for (const stamp of [
      "2026-07-28T10-00-00-000Z",
      "2026-07-27T10-00-00-000Z",
      "2026-07-26T10-00-00-000Z-pre-qa-fix",
      "2026-07-25T10-00-00Z-hand-made",
    ]) {
      mkdirSync(join(root, stamp));
    }
    const { deleted } = pruneBackups(root, { keepRecent: 1 });
    assert.deepEqual(deleted, ["2026-07-27T10-00-00-000Z"]);
    assert.ok(existsSync(join(root, "2026-07-26T10-00-00-000Z-pre-qa-fix")));
    assert.ok(existsSync(join(root, "2026-07-25T10-00-00Z-hand-made")));
  } finally {
    cleanup(root);
  }
});

test("the script refuses an unknown flag and a flag missing its value, before reaching Anki", () => {
  const script = join(REPO, "scripts/backup-anki-decks.mjs");
  const bad = spawnSync(process.execPath, [script, "--dry"], { encoding: "utf-8" });
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /unknown argument "--dry"\. Nothing was done/);
  const missing = spawnSync(process.execPath, [script, "--label"], { encoding: "utf-8" });
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /--label needs a value/);
  const help = spawnSync(process.execPath, [script, "--help"], { encoding: "utf-8" });
  assert.equal(help.status, 0);
  assert.match(help.stdout, /--allow-test-profile/);
});
