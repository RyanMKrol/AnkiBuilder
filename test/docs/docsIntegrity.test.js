import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

// The prose surfaces describe a system they cannot see, so they drift silently: a script gets
// deleted and the doc telling you to run it stays, a script gets added and no doc mentions it, a
// rename lands everywhere except the walkthrough. Each of those was live in this repo when this test
// was written. None of it is caught by lint, tests or CI, because none of it is code.
//
// What this checks is mechanical only — that a named file exists, that a shipped tool is mentioned
// somewhere, that a renamed artifact is not still called by its old name. Whether a doc's CLAIMS are
// true is a human job; this just removes the class of drift a machine can see.

const REPO = resolve(join(dirname(fileURLToPath(import.meta.url)), "..", ".."));

// The docs this project OWNS. `docs/designs/` is deliberately out: a design doc names things the
// plan intends to build, and holding a plan to "it exists already" would be backwards.
const DOC_ROOTS = [
  "README.md",
  "CLAUDE.md",
  "docs",
  ".claude/skills/build-anki-deck",
  ".claude/skills/augment-anki-deck",
  ".harness/custom/docs/LIMITATIONS.md",
];

function docFiles() {
  const found = [];
  const walk = (path) => {
    if (!existsSync(path)) return;
    if (statSync(path).isDirectory()) {
      for (const name of readdirSync(path)) walk(join(path, name));
    } else if (path.endsWith(".md") && !path.includes(join("docs", "designs"))) {
      found.push(path);
    }
  };
  for (const root of DOC_ROOTS) walk(join(REPO, root));
  return found;
}

const DOCS = docFiles().map((path) => ({
  path: path.slice(REPO.length + 1),
  text: readFileSync(path, "utf-8"),
}));

// `scripts/foo.mjs`, but not `.harness/scripts/foo.mjs` — that tree belongs to the harness.
const SCRIPT_REFERENCE = /(^|[^/\w])scripts\/([\w.-]+\.mjs)/g;

test("every scripts/ path named in a doc exists on disk", () => {
  const missing = [];
  for (const doc of DOCS) {
    for (const [, , file] of doc.text.matchAll(SCRIPT_REFERENCE)) {
      if (!existsSync(join(REPO, "scripts", file))) missing.push(`${doc.path} → scripts/${file}`);
    }
  }
  assert.deepEqual(missing, [], `docs point at scripts that do not exist:\n${missing.join("\n")}`);
});

test("every script in scripts/ is mentioned by at least one doc", () => {
  const prose = DOCS.map((d) => d.text).join("\n");
  const unmentioned = readdirSync(join(REPO, "scripts")).filter((file) => !prose.includes(file));
  assert.deepEqual(
    unmentioned,
    [],
    `these scripts are undiscoverable — document them or delete them:\n${unmentioned.join("\n")}`,
  );
});

test("the old deck.apkg name appears only on lines explicitly marked legacy", () => {
  const unmarked = [];
  for (const doc of DOCS) {
    doc.text.split("\n").forEach((line, i) => {
      if (line.includes("deck.apkg") && !/legacy/i.test(line)) {
        unmarked.push(`${doc.path}:${i + 1}: ${line.trim()}`);
      }
    });
  }
  assert.deepEqual(
    unmarked,
    [],
    `packages are named after their folder; say so, or mark the mention "legacy":\n${unmarked.join("\n")}`,
  );
});

// Four prose surfaces describe one system, and nothing said which one wins when they disagree.
test("SKILL.md and PIPELINE.md each declare what they are authoritative for", () => {
  const skill = readFileSync(join(REPO, ".claude/skills/build-anki-deck/SKILL.md"), "utf-8");
  const pipeline = readFileSync(join(REPO, "docs/PIPELINE.md"), "utf-8");
  assert.match(skill, /normative for .*procedure/i);
  assert.match(pipeline, /no procedure/i);
});
