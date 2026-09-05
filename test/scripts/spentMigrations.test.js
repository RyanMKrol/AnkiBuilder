import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

const SCRIPTS = resolve(join(dirname(fileURLToPath(import.meta.url)), "..", "..", "scripts"));

/**
 * `scripts/` mixes two kinds of file that read identically and must not: STANDING TOOLS you run as
 * part of a procedure, and SPENT MIGRATIONS that ran once against the live decks and would re-apply
 * a decision a human already made and reviewed.
 *
 * The marker is a `// SPENT: <date>` header rather than a `scripts/migrations/` folder, because
 * moving the files would break every doc reference and every muscle-memory path for a distinction
 * that only needs to be visible at the top of the file. This test is what keeps the marker honest:
 * a spent migration says so, and a standing tool does not.
 */

const SPENT = [
  "migrate-deck-numbering.mjs",
  "migrate-reading-to-ttstext.mjs",
  "jumble-number-runs.mjs",
  "split-front-hint.mjs",
  "strip-restatement-notes.mjs",
  "enhance-card-notes.mjs",
  "backfill-audio-text-hash.mjs",
  "absorb-nihongo.mjs",
  "migrate-nihongo-absorption.mjs",
  "retire-nihongo-course.mjs",
  "migrate-absorption-to-additions.mjs",
  "migrate-mark-inherited-audio.mjs",
  "add-verb-forms-family.mjs",
];

const STANDING = [
  "preflight.mjs",
  "validate-decks.mjs",
  "deliver-to-anki.mjs",
  "restore-anki-backup.mjs",
  "extras-duplicate-check.mjs",
  "extras-collision-audit.mjs",
  "extras-order.mjs",
  "finalize-extras.mjs",
  "check-done.mjs",
  "undone-unit.mjs",
  "await-review.mjs",
  "chapter-images.mjs",
  "chapter-outline.mjs",
  "epub-probe.mjs",
  "eval-pass.mjs",
  "vocab-coverage.mjs",
  "paradigm-grid.mjs",
  "clean-audio.mjs",
  "audit-marker-stuck.mjs",
  "generate-kanji-tts.mjs",
  "kanji-tts-ab.mjs",
  "prune-baks.mjs",
  "test-with-write-guard.mjs",
  "verify-apkg-import.mjs",
  "anki-behaviour-probe.mjs",
  "absorption-crosscheck.mjs",
];

const read = (name) => readFileSync(join(SCRIPTS, name), "utf-8");

test("every spent migration carries a dated SPENT header saying not to run it", () => {
  for (const name of SPENT) {
    const source = read(name);
    assert.match(source, /^\/\/ SPENT: \d{4}-\d{2}-\d{2}/m, name);
    assert.match(source, /Do not run it as part of any procedure/, name);
  }
});

test("no standing tool is marked spent", () => {
  for (const name of STANDING) {
    assert.doesNotMatch(read(name), /^\/\/ SPENT:/m, name);
  }
});

test("every script in scripts/ is classified as one or the other", () => {
  const present = readdirSync(SCRIPTS).filter((n) => n.endsWith(".mjs"));
  const classified = new Set([...SPENT, ...STANDING]);
  const unclassified = present.filter((n) => !classified.has(n));
  assert.deepEqual(
    unclassified,
    [],
    "a new script has to be added to STANDING or SPENT in this file. That is the whole point of " +
      "the distinction: a spent migration and a standing tool read identically otherwise, and " +
      "re-running a spent one re-applies a decision a human already made and reviewed.",
  );
});
