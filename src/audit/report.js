/**
 * Turns a run's results into lines. Pure: returns an array of strings, so the report can be
 * asserted on in a test without capturing stdout.
 *
 * The COVERAGE HEADER comes first, and it is the reason this file exists. "preflight clean" has
 * meant, at various times, "every check passed", "the checks that could see anything passed" and
 * "nothing here matched my regex" — and it printed identically in all three cases. Naming what was
 * examined (collections by kind, units by shape, directories nobody could place, checks that were
 * skipped for want of input) is what makes the last line a claim instead of a mood.
 */

const TIER_MARK = { FAIL: "✗", ACK: "!", INFO: "·" };

export function formatReport({ coverage, results }, { verbose = false } = {}) {
  const lines = [];
  lines.push(...coverageLines(coverage));

  const byTarget = new Map();
  for (const result of results) {
    if (!byTarget.has(result.target)) byTarget.set(result.target, []);
    byTarget.get(result.target).push(result);
  }

  for (const [target, group] of byTarget) {
    const interesting = group.filter(
      (r) => r.findings.length || r.notes.length || r.skipped || verbose,
    );
    if (!interesting.length) continue;
    lines.push("", `── ${target} ${"─".repeat(Math.max(0, 56 - target.length))}`);
    for (const result of interesting) lines.push(...resultLines(result, { verbose }));
  }

  lines.push("", ...verdictLines(results));
  return lines;
}

function coverageLines(coverage) {
  const kinds = Object.entries(coverage.collectionsByKind)
    .map(([kind, n]) => `${n} ${kind}`)
    .join(", ");
  const shapes = Object.entries(coverage.unitsByShape)
    .filter(([, n]) => n > 0)
    .map(([shape, n]) => `${n} ${shape}`)
    .join(", ");

  const lines = [
    `coverage: ${coverage.collections} collection(s)${kinds ? ` (${kinds})` : ""}, ` +
      `${coverage.units} unit(s)${shapes ? ` (${shapes})` : ""}, ` +
      `${coverage.checksDeclared} check(s) declared` +
      (coverage.checksSkipped ? `, ${coverage.checksSkipped} skipped for want of input` : ""),
    `          root ${coverage.root}`,
  ];
  for (const dir of coverage.unknownGroups) {
    lines.push(`          ? ${dir} is not epubs/, courses/ or templates/ — not scanned`);
  }
  for (const dir of coverage.unmatchedDirs) {
    lines.push(`          ? ${dir} holds unit files but matches no known unit shape`);
  }
  return lines;
}

function resultLines(result, { verbose }) {
  const lines = [];
  const mark = TIER_MARK[result.tier];
  const label = result.title.padEnd(22);

  if (result.skipped) {
    lines.push(`  – ${label}skipped: ${result.skipped}`);
    return lines;
  }

  if (result.tier === "FAIL") {
    if (result.findings.length) {
      lines.push(`  ${mark} ${label}${result.findings.length} finding(s) [FAIL]`);
      for (const finding of result.findings) lines.push(`      ${finding.message}`);
    } else if (verbose) {
      lines.push(`  ✓ ${label}${result.summary ?? "ok"}`);
    }
  } else if (result.tier === "ACK") {
    if (result.unreviewed.length) {
      lines.push(
        `  ${mark} ${label}${result.unreviewed.length} UNREVIEWED of ${result.findings.length} [ACK]`,
      );
      for (const finding of result.unreviewed) lines.push(`      ${finding.message}`);
      lines.push(
        `      accept these with:  node scripts/preflight.mjs --accept --only ${result.id}`,
      );
    } else if (result.findings.length) {
      lines.push(`  ✓ ${label}${result.findings.length} finding(s), all acknowledged [ACK]`);
    } else if (verbose) {
      lines.push(`  ✓ ${label}${result.summary ?? "ok"}`);
    }
  }

  for (const note of result.notes) lines.push(`  · ${label}${note}`);
  return lines;
}

function verdictLines(results) {
  const failures = results.filter((r) => r.tier === "FAIL" && r.findings.length);
  const unreviewed = results.filter((r) => r.tier === "ACK" && r.unreviewed.length);
  const failCount = failures.reduce((n, r) => n + r.findings.length, 0);
  const ackCount = unreviewed.reduce((n, r) => n + r.unreviewed.length, 0);

  if (!failCount && !ackCount) return ["preflight clean"];
  const parts = [];
  if (failCount) parts.push(`${failCount} FAIL finding(s) in ${failures.length} check run(s)`);
  if (ackCount) {
    parts.push(`${ackCount} unreviewed ACK finding(s) in ${unreviewed.length} check run(s)`);
  }
  return [
    parts.join("; "),
    "FAIL blocks. ACK blocks only until each instance is fixed or explicitly accepted " +
      "(preflight --accept), which is what keeps a standing count from turning into wallpaper.",
  ];
}
