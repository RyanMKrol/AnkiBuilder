import { categoryHistogram } from "./itemSetDiff.js";

/**
 * Renders a `diffItemSets` result as plain text for a person to read.
 *
 * There is no verdict line and no exit code riding on this, on purpose (see the rationale on
 * `diffItemSets`): the report's job is to put every difference in front of whoever changed the
 * prompt, in the order they will want to look at them — what disappeared first, since a dropped item
 * is the only unrecoverable outcome; then what appeared; then what stayed but changed.
 */
export function formatItemSetReport(diff, { referenceLabel, candidateLabel, limit = 200 } = {}) {
  const lines = [];
  const { counts } = diff;

  lines.push(`reference (${referenceLabel}): ${counts.reference} items`);
  lines.push(`candidate (${candidateLabel}): ${counts.candidate} items`);
  lines.push(
    `matched ${counts.matched} · missing ${diff.missing.length} · extra ${diff.extra.length} · ` +
      `changed-in-place ${counts.changed}`,
  );

  lines.push("");
  lines.push(section("MISSING — in the reference, not produced by this run", diff.missing.length));
  for (const item of diff.missing.slice(0, limit)) {
    lines.push(`  - ${describe(item)}`);
  }

  lines.push("");
  lines.push(section("EXTRA — produced by this run, not in the reference", diff.extra.length));
  for (const item of diff.extra.slice(0, limit)) {
    lines.push(`  + ${describe(item)}`);
  }

  lines.push("");
  lines.push(section("CATEGORY CHANGED", diff.categoryChanged.length));
  for (const pair of diff.categoryChanged.slice(0, limit)) {
    const change = pair.changes.find((c) => c.field === "category");
    lines.push(`  ~ ${describe(pair.candidate)}`);
    lines.push(`      category: ${change.from} -> ${change.to}`);
  }

  const otherChanges = diff.changed.filter(
    (pair) => !pair.changes.every((change) => change.field === "category"),
  );
  lines.push("");
  lines.push(section("OTHER FIELD CHANGES on matched items", otherChanges.length));
  for (const pair of otherChanges.slice(0, limit)) {
    lines.push(`  ~ ${describe(pair.candidate)}`);
    for (const change of pair.changes) {
      if (change.field === "category") continue;
      lines.push(
        `      ${change.field}: ${JSON.stringify(change.from)} -> ${JSON.stringify(change.to)}`,
      );
    }
  }

  lines.push("");
  lines.push("CATEGORY MIX");
  lines.push(formatHistogram(diff, referenceLabel, candidateLabel));

  return lines.join("\n");
}

function section(title, count) {
  return `${title} (${count})`;
}

function describe(item) {
  const parts = [`${item.english ?? "(no english)"} / ${item.target ?? "(no target)"}`];
  parts.push(`[${item.category ?? "(no category)"}]`);
  if (item.id) parts.push(`id=${item.id}`);
  if (item.uncertain) parts.push("uncertain");
  if (item.aiSuggested) parts.push("aiSuggested");
  return parts.join(" ");
}

function formatHistogram(diff, referenceLabel, candidateLabel) {
  const reference = categoryHistogram([
    ...diff.missing,
    ...diff.matched.map((pair) => pair.reference),
  ]);
  const candidate = categoryHistogram([
    ...diff.extra,
    ...diff.matched.map((pair) => pair.candidate),
  ]);
  const names = [...new Set([...reference.keys(), ...candidate.keys()])].sort();
  const width = Math.max(...names.map((name) => name.length), 8);
  const rows = [`  ${"category".padEnd(width)}  ${referenceLabel} -> ${candidateLabel}`];
  for (const name of names) {
    rows.push(
      `  ${name.padEnd(width)}  ${reference.get(name) ?? 0} -> ${candidate.get(name) ?? 0}`,
    );
  }
  return rows.join("\n");
}

/** Renders an id-set comparison (the dedup exclusion set, the forward-flag set) as plain text. */
export function formatIdSetReport(referenceIds, candidateIds, { describeId = (id) => id } = {}) {
  const reference = new Set(referenceIds);
  const candidate = new Set(candidateIds);
  const both = [...reference].filter((id) => candidate.has(id));
  const onlyReference = [...reference].filter((id) => !candidate.has(id));
  const onlyCandidate = [...candidate].filter((id) => !reference.has(id));

  const lines = [
    `reference set: ${reference.size} · candidate set: ${candidate.size} · agreed on ${both.length}`,
    "",
    section("ONLY IN THE REFERENCE — this run did not pick these", onlyReference.length),
    ...onlyReference.map((id) => `  - ${describeId(id)}`),
    "",
    section("ONLY IN THIS RUN — not in the reference", onlyCandidate.length),
    ...onlyCandidate.map((id) => `  + ${describeId(id)}`),
    "",
    section("AGREED", both.length),
    ...both.map((id) => `  = ${describeId(id)}`),
  ];
  return lines.join("\n");
}
