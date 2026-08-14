#!/usr/bin/env node
/**
 * Import a built `.apkg` into a throwaway Anki collection and report what really happened.
 *
 * ── WHY ──────────────────────────────────────────────────────────────────────────────────────────
 * LIMITATIONS.md records three `.apkg` format bugs that "all passed npm test and every synthetic
 * check". They passed because nothing here has ever run a real import: the zip is hand-written, the
 * collection is hand-built SQLite, and every check on the result is written by the same repo that
 * produced the bytes. This is the one tool that can disagree with us.
 *
 * ── SETUP (one time, automatic) ──────────────────────────────────────────────────────────────────
 * Needs `python3` with the `venv` module. On first run it creates a virtualenv under
 * `.anki-builder/verify-venv/` and pip-installs the pinned `anki` package into it (a large wheel;
 * expect a few minutes). Nothing is installed globally. Delete that directory to start over.
 *
 * There is NO running Anki involved and NOTHING on port 8765. The collection is created fresh in a
 * tmpdir, imported into twice, inspected, and deleted. Live-Anki behaviour is a different tool
 * entirely: scripts/anki-behaviour-probe.mjs, which runs against a separate throwaway PROFILE.
 *
 * ── USAGE ────────────────────────────────────────────────────────────────────────────────────────
 *   node scripts/verify-apkg-import.mjs <path/to/deck.apkg> [--expect-notes N] [--json]
 *   node scripts/verify-apkg-import.mjs --smoke        build a tiny package and verify that
 *
 * `--smoke` synthesizes a two-card package in a tmpdir through the real deck writer, so the tool can
 * be exercised without any deck state on the machine. Use it to check the setup works before
 * pointing it at a real package.
 *
 * Deliberately NOT part of `npm run ci` or `npm run check`: it needs a Python toolchain and a
 * network fetch, and `npm run ci` must stay green in a fresh clone with no deck state. It is a
 * documented Definition-of-Done step for the first-ever build of a NEW source type, and the
 * end-to-end proof for any change to `.apkg` structure.
 *
 * Exit 0 when every assertion holds, 1 otherwise.
 */
import { mkdtempSync, rmSync } from "fs";
import { join, resolve } from "path";
import { tmpdir } from "os";
import {
  ANKI_PYTHON_PIN,
  checkResult,
  ensureVenv,
  probePython,
  verifyApkgImport,
} from "../src/deck/verifyImport.js";
import { buildDeck } from "../src/deck/index.js";

const args = process.argv.slice(2);
const has = (flag) => args.includes(flag);
const valueOf = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : null;
};
const positional = args.filter((a) => !a.startsWith("--") && a !== valueOf("--expect-notes"));

if (has("--help") || (!positional.length && !has("--smoke"))) {
  console.log(
    [
      "usage: verify-apkg-import.mjs <deck.apkg> [--expect-notes N] [--json]",
      "       verify-apkg-import.mjs --smoke",
      "",
      `Imports the package into a throwaway collection using ${ANKI_PYTHON_PIN} in a venv it`,
      "bootstraps under .anki-builder/verify-venv/. No running Anki, nothing on :8765.",
    ].join("\n"),
  );
  process.exit(has("--help") ? 0 : 1);
}

const version = probePython();
if (!version) {
  console.error(
    "python3 is not available on PATH. This verifier needs it (plus the venv module) to run the " +
      "real Anki importer. Install Python 3 and re-run; nothing else in this repo depends on it.",
  );
  process.exit(1);
}
console.error(`python: ${version}`);

const python = ensureVenv(resolve(".anki-builder/verify-venv"), {
  log: (m) => console.error(m),
});

const workRoot = mkdtempSync(join(tmpdir(), "apkg-verify-"));
let apkgPath = positional[0] ? resolve(positional[0]) : null;
let expectedNotes = valueOf("--expect-notes") ? Number(valueOf("--expect-notes")) : null;

try {
  if (has("--smoke")) {
    // A minimal package built through the REAL writer, so the smoke test exercises the same code
    // path a shipping deck does. Two cards, no audio, no embedded font (the font would add a media
    // entry and prove nothing extra here).
    const cards = {
      meta: { targetLanguage: "ja", sourceType: "manual", chapterLabel: "Smoke" },
      items: [
        {
          id: "smoke-1",
          english: "One",
          category: "Numbers",
          target: "いち",
          pronunciation: "ichi",
        },
        { id: "smoke-2", english: "Two", category: "Numbers", target: "に", pronunciation: "ni" },
      ],
    };
    apkgPath = join(workRoot, "smoke.apkg");
    buildDeck(cards, {
      outPath: apkgPath,
      deckName: "AnkiBuilder Smoke",
      getFont: () => undefined,
    });
    expectedNotes = 2;
    console.error(`built a 2-card smoke package at ${apkgPath}`);
  }

  const result = verifyApkgImport(apkgPath, join(workRoot, "collection"), { python });

  if (has("--json")) {
    console.log(JSON.stringify(result, null, 2));
  }

  const checks = checkResult(result, { expectedNotes });
  console.log(`\n=== ${apkgPath} ===`);
  for (const check of checks) {
    console.log(`  ${check.ok ? "✓" : "✗"} ${check.label}: ${check.detail}`);
  }

  const failed = checks.filter((c) => !c.ok);
  console.log(failed.length ? `\n${failed.length} assertion(s) FAILED` : "\nimport verified");
  process.exit(failed.length ? 1 : 0);
} finally {
  rmSync(workRoot, { recursive: true, force: true });
}
