#!/usr/bin/env node
// Every deterministic check that should pass BEFORE a unit is handed to a human reviewer, in one
// command. Run it at the end of a build, before you post the review link, and before a deliver.
//
// This file is arg parsing, a scope filter and a printer. The checks themselves — and the loader,
// scope model and severity tiers they hang off — live in src/audit/, behind unit tests. Adding a
// check is one `defineCheck` plus one line in src/audit/checks/index.js; nothing here changes.
//
// Usage:
//   node scripts/preflight.mjs --all [output-root]       every collection under the root
//   node scripts/preflight.mjs <collection-dir>          one book / course / template deck
//   node scripts/preflight.mjs --all --schema-only       just the schema pass (validate-decks)
//   node scripts/preflight.mjs --all --scope unit        only the per-unit checks
//   node scripts/preflight.mjs --all --only card-ids     one check by id
//   node scripts/preflight.mjs --all --verbose           print passing checks too
//   node scripts/preflight.mjs --all --accept [--note …] record the unreviewed ACK findings
//
// Exit 0 when nothing blocks. Exit 1 on any FAIL finding, or any ACK finding nobody has accepted.
import {
  ALL_CHECKS,
  SCHEMA_ONLY_CHECKS,
  SCOPES,
  acceptFindings,
  audit,
  formatReport,
} from "../src/audit/index.js";

const args = process.argv.slice(2);
const has = (flag) => args.includes(flag);
const valueOf = (flag) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : null;
};
// A flag's VALUE is not a positional argument.
const flagValues = new Set(
  ["--scope", "--only", "--note"].map((flag) => valueOf(flag)).filter(Boolean),
);
const positional = args.filter((arg) => !arg.startsWith("--") && !flagValues.has(arg));

if (has("--help")) {
  console.log(
    [
      "usage: preflight.mjs --all [output-root] | <collection-dir>",
      "  --schema-only       run the schema check only (what validate-decks is)",
      "  --scope <s>         one of: " + SCOPES.join(", "),
      "  --only <id>         a single check id (comma-separated for several)",
      "  --verbose           print passing checks as well as findings",
      "  --accept [--note]   record every unreviewed ACK finding in .preflight-accepted.json",
    ].join("\n"),
  );
  process.exit(0);
}

const all = has("--all");
const scope = valueOf("--scope");
const only = valueOf("--only");

const result = audit({
  outputRoot: all ? positional[0] || "output" : "output",
  collectionDir: all ? null : positional[0],
  checks: has("--schema-only") ? SCHEMA_ONLY_CHECKS : ALL_CHECKS,
  scopes: scope ? [scope] : SCOPES,
  only: only ? only.split(",") : null,
});

if (!all && !positional[0]) {
  console.error("usage: preflight.mjs --all [output-root] | <collection-dir>  (--help for more)");
  process.exit(1);
}

// An empty output root is not a failure. A fresh clone has no deck state at all, and a command that
// found nothing must never be indistinguishable from one that found something broken.
if (result.workspace.missing || result.workspace.collections.length === 0) {
  console.log(`(no collections found under ${result.workspace.root})`);
  process.exit(0);
}

for (const line of formatReport(result, { verbose: has("--verbose") })) console.log(line);

if (has("--accept")) {
  const written = acceptFindings(result.results, { note: valueOf("--note") });
  const added = written.reduce((n, w) => n + w.added, 0);
  console.log(
    added
      ? `\naccepted ${added} finding(s) into ${written.length} acknowledgement file(s):\n` +
          written.map((w) => `  ${w.path}  (+${w.added})`).join("\n")
      : "\nnothing to accept — no unreviewed ACK findings",
  );
  process.exit(0);
}

process.exit(result.exitCode);
