import { spawnSync } from "child_process";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";

/**
 * Import a built `.apkg` into a THROWAWAY Anki collection and report what actually happened.
 *
 * Why this exists. LIMITATIONS.md records three `.apkg` format bugs that "all passed `npm test` and
 * every synthetic check", because nothing in this repo has ever run a real import. The zip is
 * written by hand, the collection is hand-built SQLite, and every assertion about the result is an
 * assertion about bytes this repo produced, checked by code this repo also produced. A real import
 * is the only thing that can disagree.
 *
 * It shells out to the `anki` Python package in a virtualenv it bootstraps itself (see
 * `ensureVenv`). Nothing here touches a running Anki, and nothing here talks to port 8765: the
 * collection is created fresh in a tmpdir, imported into, inspected and thrown away.
 *
 * The two questions it settles, which the plan otherwise had to assume:
 *
 *  1. **dconf preset id 1.** Every package this repo writes ships a deck-options preset with id 1
 *     named "Default", which is also the id of the importing collection's own default preset. Does
 *     the import overwrite the target collection's preset, renumber, or ignore ours?
 *  2. **guid match vs duplicate on re-import.** The two live delivery markers' own text disagrees
 *     about this. Importing the same package twice answers it: either the second import updates the
 *     notes matched by guid, or it creates a second copy of every note.
 *
 * This module is the pure(ish) half: path resolution, the Python program text, and result parsing.
 * `scripts/verify-apkg-import.mjs` is the CLI around it. Nothing here writes inside the repo except
 * the venv, which lives under a caller-supplied directory.
 */

/** The Anki Python package this verifier pins. A moving target would make its answers meaningless. */
export const ANKI_PYTHON_PIN = "anki==24.6.3";

/** Is a usable `python3` on PATH? Returns its version string, or null. */
export function probePython(run = spawnSync) {
  const out = run("python3", ["--version"], { encoding: "utf-8" });
  if (out.error || out.status !== 0) return null;
  return String(out.stdout || out.stderr || "").trim() || "python3";
}

/**
 * Creates (once) a virtualenv holding the pinned `anki` package and returns the python inside it.
 *
 * Kept OUT of `npm test` and out of `npm run ci` deliberately: it downloads a large wheel and needs
 * a working Python toolchain, neither of which a format/lint/test/build gate should depend on. The
 * verifier is a documented Definition-of-Done step for a first-ever build of a new source type, and
 * a manual `npm run check` step otherwise.
 */
export function ensureVenv(venvDir, { run = spawnSync, log = () => {} } = {}) {
  const python = join(venvDir, "bin", "python");
  if (existsSync(python)) return python;

  log(`creating a virtualenv for ${ANKI_PYTHON_PIN} at ${venvDir} (one time, a few minutes)`);
  mkdirSync(venvDir, { recursive: true });
  const created = run("python3", ["-m", "venv", venvDir], { encoding: "utf-8", stdio: "inherit" });
  if (created.status !== 0) {
    throw new Error(`could not create a virtualenv at ${venvDir} — is python3 -m venv available?`);
  }
  const installed = run(python, ["-m", "pip", "install", "--quiet", ANKI_PYTHON_PIN], {
    encoding: "utf-8",
    stdio: "inherit",
  });
  if (installed.status !== 0) {
    throw new Error(`pip install ${ANKI_PYTHON_PIN} failed inside ${venvDir}`);
  }
  return python;
}

/**
 * The Python program that does the work.
 *
 * Written as a string rather than a checked-in `.py` so the whole verifier is one reviewable unit,
 * and so its contract with the JS side (a single JSON object on stdout, marked by a sentinel) is
 * visible in one place. It prints EXACTLY one line starting with the sentinel; anything else on
 * stdout is Anki's own logging and is ignored.
 */
export const RESULT_SENTINEL = "ANKI_VERIFY_RESULT ";

export const PYTHON_PROGRAM = `
import json, os, sys
from anki.collection import Collection

apkg = sys.argv[1]
workdir = sys.argv[2]

col_path = os.path.join(workdir, "collection.anki2")
col = Collection(col_path)

def snapshot():
    return {
        "notes": col.note_count(),
        "cards": col.card_count() if hasattr(col, "card_count") else len(col.find_cards("")),
        "decks": sorted(d.name for d in col.decks.all_names_and_ids()),
        "dconf_ids": sorted(int(c["id"]) for c in col.decks.all_config()),
        "dconf_names": sorted(c["name"] for c in col.decks.all_config()),
        "models": sorted(m["name"] for m in col.models.all()),
        "guids": sorted(col.db.list("select guid from notes")),
        "media": sorted(os.listdir(col.media.dir())) if os.path.isdir(col.media.dir()) else [],
    }

before = snapshot()

def do_import():
    # importCsv/import_anki_package differ by version; use whichever this build exposes.
    if hasattr(col, "import_anki_package"):
        from anki.import_export_pb2 import ImportAnkiPackageRequest
        req = ImportAnkiPackageRequest(package_path=apkg)
        col.import_anki_package(req)
    else:
        from anki.importing.apkg import AnkiPackageImporter
        imp = AnkiPackageImporter(col, apkg)
        imp.run()

do_import()
first = snapshot()
do_import()
second = snapshot()

col.close()

result = {
    "before": before,
    "afterFirstImport": first,
    "afterSecondImport": second,
    # The two questions this verifier exists to settle, stated as answers rather than raw counts.
    "answers": {
        "dconfIdOneCollided": 1 in first["dconf_ids"] and first["dconf_names"] != before["dconf_names"],
        "dconfNamesAfterImport": first["dconf_names"],
        "reimportDuplicatedNotes": second["notes"] > first["notes"],
        "reimportNoteDelta": second["notes"] - first["notes"],
        "guidsStableAcrossReimport": first["guids"] == second["guids"],
    },
}
print("${RESULT_SENTINEL}" + json.dumps(result))
`;

/** Pulls the single sentinel line out of the Python process's stdout. */
export function parseResult(stdout) {
  const line = String(stdout || "")
    .split("\n")
    .find((l) => l.startsWith(RESULT_SENTINEL));
  if (!line) {
    throw new Error(
      "the verifier's Python half produced no result line — its stdout is above. This means the " +
        "import raised before it could report, which is itself the finding.",
    );
  }
  return JSON.parse(line.slice(RESULT_SENTINEL.length));
}

/**
 * Runs the verifier over one package. `workDir` must be a throwaway directory: the collection, its
 * media folder and the Python program are all written inside it.
 */
export function verifyApkgImport(apkgPath, workDir, { python, run = spawnSync } = {}) {
  if (!existsSync(apkgPath)) throw new Error(`no such package: ${apkgPath}`);
  mkdirSync(workDir, { recursive: true });
  const programPath = join(workDir, "verify.py");
  writeFileSync(programPath, PYTHON_PROGRAM);

  const out = run(python, [programPath, apkgPath, workDir], {
    encoding: "utf-8",
    maxBuffer: 32 * 1024 * 1024,
  });
  if (out.status !== 0) {
    throw new Error(
      `the import verifier failed (exit ${out.status}).\n--- stdout ---\n${out.stdout}\n--- stderr ---\n${out.stderr}`,
    );
  }
  return parseResult(out.stdout);
}

/**
 * The assertions that hold for any package this repo writes. Returns `[{ ok, label, detail }]` so
 * the CLI can print all of them rather than stopping at the first.
 */
export function checkResult(result, { expectedNotes = null } = {}) {
  const first = result.afterFirstImport;
  const before = result.before;
  const checks = [];

  const add = (ok, label, detail) => checks.push({ ok, label, detail });

  add(first.notes > before.notes, "the import added notes", `${before.notes} -> ${first.notes}`);
  if (expectedNotes !== null) {
    add(
      first.notes - before.notes === expectedNotes,
      "the note count matches the package's card set",
      `expected ${expectedNotes}, got ${first.notes - before.notes}`,
    );
  }
  add(
    first.models.some((name) => name.startsWith("AnkiBuilder")),
    "the note type arrived",
    first.models.join(", "),
  );
  add(
    first.decks.length > before.decks.length,
    "the deck arrived",
    first.decks.filter((d) => !before.decks.includes(d)).join(", "),
  );
  // Not an assertion about which way it goes — an assertion that we now KNOW which way it goes.
  add(
    true,
    "re-import behaviour recorded",
    result.answers.reimportDuplicatedNotes
      ? `re-import DUPLICATES: +${result.answers.reimportNoteDelta} note(s)`
      : "re-import matches by guid and updates in place (no new notes)",
  );
  add(
    true,
    "dconf id-1 behaviour recorded",
    `presets after import: ${result.answers.dconfNamesAfterImport.join(", ")}`,
  );
  return checks;
}
