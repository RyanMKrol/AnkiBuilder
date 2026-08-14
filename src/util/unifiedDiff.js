/**
 * A minimal unified diff, good enough to show a human what a delivery is about to overwrite.
 *
 * Deliberately not a dependency and deliberately not clever: a longest-common-subsequence table over
 * lines, rendered with one line of context either side. The one thing it must never do is make a
 * change look smaller than it is, so an unchanged line is only ever printed as context, and every
 * differing line is printed.
 */
export function unifiedDiff(before, after, { label = "", context = 2 } = {}) {
  const a = String(before ?? "").split("\n");
  const b = String(after ?? "").split("\n");
  const ops = diffLines(a, b);
  if (ops.every((op) => op.kind === " ")) return "";

  // Which indexes into `ops` sit near a change, and so are worth printing.
  const keep = new Set();
  ops.forEach((op, i) => {
    if (op.kind === " ") return;
    for (let j = Math.max(0, i - context); j <= Math.min(ops.length - 1, i + context); j++) {
      keep.add(j);
    }
  });

  const lines = label ? [`--- ${label} (in Anki now)`, `+++ ${label} (this build)`] : [];
  let skipped = 0;
  ops.forEach((op, i) => {
    if (!keep.has(i)) {
      skipped++;
      return;
    }
    if (skipped) {
      lines.push(`@@ ${skipped} unchanged line(s) @@`);
      skipped = 0;
    }
    lines.push(`${op.kind}${op.text}`);
  });
  return lines.join("\n");
}

/** `[{ kind: " " | "-" | "+", text }]` — a straightforward LCS backtrack. */
function diffLines(a, b) {
  const table = Array.from({ length: a.length + 1 }, () => new Uint32Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i][j] =
        a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  const ops = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      ops.push({ kind: " ", text: a[i] });
      i++;
      j++;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      ops.push({ kind: "-", text: a[i] });
      i++;
    } else {
      ops.push({ kind: "+", text: b[j] });
      j++;
    }
  }
  while (i < a.length) ops.push({ kind: "-", text: a[i++] });
  while (j < b.length) ops.push({ kind: "+", text: b[j++] });
  return ops;
}
