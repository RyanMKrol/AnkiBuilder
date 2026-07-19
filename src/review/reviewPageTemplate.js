// Shared visual/interaction shell for every review-stage HTML artifact (corpus, translate,
// audio). Keeping this in one place is the whole point: individual renderers only ever supply
// column headers + row cell markup, so the page's palette, layout, and JS behavior (click-to-mark,
// inline notes, copy-to-clipboard) can never drift between stages or between runs.

const MODES = {
  exclude: {
    markedClass: "excluded",
    actionVerb: "exclude",
    noneMarkedText: "No rows marked for exclusion.",
  },
  regenerate: {
    markedClass: "flagged",
    actionVerb: "regenerate audio for",
    noneMarkedText: "No rows flagged for regeneration.",
  },
  // Audio review when cards carry a second (alt) recording. Unlike the single-action modes above,
  // each row cycles through two actions (switch to alt / drop) — the client JS below tracks two
  // sets and emits up to two instruction clauses. `markedClass` is unused here.
  "audio-alt": {
    markedClass: null,
    actionVerb: "cycle (alt recording → drop → keep)",
    noneMarkedText:
      "No rows marked. Click a row to cycle: switch to alt → drop audio → keep default.",
  },
};

export function escapeHtml(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch],
  );
}

function renderRow(row, index) {
  const cells = row.cells.map((cell) => `<td>${cell}</td>`).join("");
  const noteCell = row.note ? escapeHtml(row.note) : "";
  // Only the audio-alt renderer sets a boolean `hasAlt`; the attribute lets the client cycle skip
  // the "switch to alt" state for a row that has no alt clip. Other stages omit it entirely.
  const hasAltAttr =
    typeof row.hasAlt === "boolean" ? ` data-has-alt="${row.hasAlt ? "1" : "0"}"` : "";
  return `<tr class="row" data-row="${index + 1}"${hasAltAttr}><td class="row-num">${index + 1}</td>${cells}<td class="note-cell">${noteCell}</td></tr>`;
}

export function renderReviewPage({
  eyebrow,
  title,
  subtitle,
  metaItems = [],
  columns,
  rows,
  mode,
}) {
  if (!MODES[mode]) {
    throw new Error(
      `renderReviewPage: unknown mode "${mode}" — expected one of: ${Object.keys(MODES).join(", ")}`,
    );
  }
  const modeConfig = MODES[mode];

  // The counter and footer read differently for the two-action audio-alt mode than for the
  // single-action modes. Computed here so the markup below stays declarative.
  const counterInitialHtml =
    mode === "audio-alt"
      ? `<strong>0</strong> to switch to alt · <strong>0</strong> to drop`
      : `<strong>0</strong> ${mode === "regenerate" ? "flagged for regeneration" : "marked for exclusion"}`;
  const footerHint =
    mode === "audio-alt"
      ? "click a row to cycle it (switch to alt recording → drop audio → keep default)"
      : `click a row to ${escapeHtml(modeConfig.actionVerb)} it`;

  const metaRowHtml = metaItems
    .map(
      ({ label, value }) =>
        `<div class="meta-item"><span class="meta-label">${escapeHtml(label)}</span><span class="meta-value">${escapeHtml(value)}</span></div>`,
    )
    .join("");

  const headHtml =
    `<th class="row-num">#</th>` +
    columns.map((c) => `<th>${escapeHtml(c)}</th>`).join("") +
    `<th>Note</th>`;

  const bodyHtml = rows.map(renderRow).join("");

  return `<title>${escapeHtml(title)}</title>
<style>
  :root {
    --paper: #efeee8;
    --card: #fbfaf7;
    --ink: #22262a;
    --ink-soft: #5b6067;
    --ink-faint: #8c9096;
    --rule: #dedcd3;
    --rule-strong: #c9c6ba;
    --accent: #7a3b36;
    --accent-tint: #f2e3df;
    --accent-tint-strong: #e7c9c2;
    --flag: #6b5d1f;
    --flag-tint: #f4edd4;
    --ok: #2f6b47;
    --serif: "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif;
    --sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    --mono: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
    --script: "Hiragino Sans", "Hiragino Mincho ProN", "Yu Gothic", "Noto Sans JP", "Noto Sans SC", sans-serif;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--paper);
    color: var(--ink);
    font-family: var(--sans);
    -webkit-font-smoothing: antialiased;
  }
  .page { padding: 48px 96px 96px; }
  header { margin-bottom: 24px; }
  .eyebrow {
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.09em;
    text-transform: uppercase;
    color: var(--accent);
  }
  h1 {
    font-family: var(--serif);
    font-weight: 500;
    font-size: 30px;
    line-height: 1.15;
    margin: 6px 0 4px;
    text-wrap: balance;
  }
  .subtitle {
    font-size: 14.5px;
    color: var(--ink-soft);
    margin: 0 0 18px;
    max-width: 90ch;
  }
  .meta-row {
    display: flex;
    flex-wrap: wrap;
    gap: 10px 22px;
    padding-top: 16px;
    border-top: 1px solid var(--rule);
  }
  .meta-item { display: flex; flex-direction: column; gap: 2px; }
  .meta-label {
    font-size: 10.5px;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    color: var(--ink-faint);
  }
  .meta-value { font-size: 14px; color: var(--ink); }
  .toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 14px;
  }
  .counter { font-size: 14px; color: var(--ink-soft); }
  .counter strong { color: var(--ink); }
  #copy-btn {
    font-family: var(--sans);
    font-size: 13px;
    font-weight: 600;
    color: #fff;
    background: var(--accent);
    border: none;
    border-radius: 8px;
    padding: 9px 16px;
    cursor: pointer;
  }
  #copy-btn:hover { opacity: 0.92; }
  #copy-fallback {
    display: none;
    margin-top: 8px;
    width: 100%;
    font-family: var(--mono);
    font-size: 13px;
    padding: 8px 10px;
    border: 1px solid var(--rule-strong);
    border-radius: 6px;
    background: var(--card);
    color: var(--ink);
  }
  .table-wrap {
    overflow-x: auto;
    border: 1px solid var(--rule);
    border-radius: 12px;
    background: var(--card);
  }
  table { width: 100%; border-collapse: collapse; }
  thead th {
    text-align: left;
    font-size: 11.5px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--ink-soft);
    padding: 12px 14px;
    border-bottom: 1px solid var(--rule-strong);
    white-space: nowrap;
  }
  tbody td {
    padding: 10px 14px;
    font-size: 14.5px;
    border-bottom: 1px solid var(--rule);
    vertical-align: middle;
  }
  tbody tr:last-child td { border-bottom: none; }
  tr.row { cursor: pointer; }
  tr.row:hover td { background: rgba(122, 59, 54, 0.05); }
  .row-num {
    font-variant-numeric: tabular-nums;
    color: var(--ink-faint);
    width: 1%;
    white-space: nowrap;
  }
  tr.row.excluded td { color: var(--ink-faint); text-decoration: line-through; }
  tr.row.excluded audio { text-decoration: none; }
  tr.row.flagged td { background: var(--flag-tint); }
  tr.row.flagged .row-num { color: var(--flag); font-weight: 700; }
  tr.row.use-alt td { background: var(--accent-tint); }
  tr.row.use-alt .row-num { color: var(--accent); font-weight: 700; }
  tr.row.drop td { color: var(--ink-faint); text-decoration: line-through; }
  tr.row.drop audio { text-decoration: none; }
  tr.row.drop .row-num { color: var(--ink-faint); font-weight: 700; }
  .target-cell { font-family: var(--script); }
  .empty { color: var(--ink-faint); }
  .badge {
    display: inline-block;
    font-size: 10.5px;
    font-weight: 600;
    letter-spacing: 0.02em;
    border-radius: 100px;
    padding: 2px 9px;
    margin: 0 4px 2px 0;
    white-space: nowrap;
  }
  .badge-uncertain { color: var(--flag); background: var(--flag-tint); }
  .badge-ai-suggested { color: var(--accent); background: var(--accent-tint); }
  .note-cell {
    max-width: 320px;
    white-space: normal;
    color: var(--ink-soft);
    font-size: 13.5px;
  }
  audio { display: block; width: 220px; height: 32px; }
  /* Per-card "audio variants" cell: each take is a descriptor + its player, stacked. */
  .variants { display: flex; flex-direction: column; gap: 6px; }
  .var { display: flex; align-items: center; gap: 9px; }
  .var .vd {
    font-size: 11.5px;
    color: var(--ink-faint);
    min-width: 104px;
    white-space: nowrap;
  }
  .var .vd b { color: var(--ok); font-weight: 700; }
  .var audio { display: block; width: 190px; height: 30px; }
  footer {
    margin-top: 20px;
    font-size: 12.5px;
    color: var(--ink-faint);
    text-align: center;
  }
</style>
<div class="page">
  <header>
    <div class="eyebrow">${escapeHtml(eyebrow)}</div>
    <h1>${escapeHtml(title)}</h1>
    <p class="subtitle">${subtitle}</p>
    <div class="meta-row">${metaRowHtml}</div>
  </header>

  <div class="toolbar">
    <div class="counter" id="counter">${counterInitialHtml}</div>
    <button type="button" id="copy-btn">Copy instruction</button>
  </div>
  <input type="text" id="copy-fallback" readonly />

  <div class="table-wrap">
    <table>
      <thead><tr>${headHtml}</tr></thead>
      <tbody>${bodyHtml}</tbody>
    </table>
  </div>

  <footer>Generated by <code>anki-builder render-review</code> — ${footerHint}, then copy the instruction back into the conversation.</footer>
</div>
<script>
(function () {
  var mode = ${JSON.stringify(mode)};
  var noneMarkedText = ${JSON.stringify(modeConfig.noneMarkedText)};

  function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch(function () {
        fallbackCopy(text);
      });
    } else {
      fallbackCopy(text);
    }
  }

  function fallbackCopy(text) {
    var textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    var ok = false;
    try {
      ok = document.execCommand("copy");
    } catch (err) {
      ok = false;
    }
    document.body.removeChild(textarea);
    if (!ok) {
      var input = document.getElementById("copy-fallback");
      input.value = text;
      input.style.display = "block";
      input.focus();
      input.select();
    }
  }

  function wireCopy(buildText) {
    document.getElementById("copy-btn").addEventListener("click", function () {
      copyToClipboard(buildText());
    });
  }

  // Two-action audio review: each row cycles none -> use-alt -> drop -> none (a row with no alt
  // clip skips straight to drop). Two sets feed a two-clause copy instruction.
  if (mode === "audio-alt") {
    var useAlt = new Set();
    var dropSet = new Set();
    var updateCounter = function () {
      document.getElementById("counter").innerHTML =
        "<strong>" + useAlt.size + "</strong> to switch to alt · <strong>" + dropSet.size + "</strong> to drop";
    };
    document.querySelectorAll("tr.row").forEach(function (tr) {
      tr.addEventListener("click", function (e) {
        if (e.target.closest("audio")) return;
        var n = Number(tr.getAttribute("data-row"));
        var hasAlt = tr.getAttribute("data-has-alt") === "1";
        if (useAlt.has(n)) {
          useAlt.delete(n); tr.classList.remove("use-alt");
          dropSet.add(n); tr.classList.add("drop");
        } else if (dropSet.has(n)) {
          dropSet.delete(n); tr.classList.remove("drop");
        } else if (hasAlt) {
          useAlt.add(n); tr.classList.add("use-alt");
        } else {
          dropSet.add(n); tr.classList.add("drop");
        }
        updateCounter();
      });
    });
    wireCopy(function () {
      var a = Array.from(useAlt).sort(function (x, y) { return x - y; });
      var d = Array.from(dropSet).sort(function (x, y) { return x - y; });
      var parts = [];
      if (a.length) parts.push("switch to alt audio for rows " + a.join(", "));
      if (d.length) parts.push("drop audio for rows " + d.join(", "));
      return parts.length === 0 ? noneMarkedText : "Please " + parts.join(". Please ") + ".";
    });
    updateCounter();
    return;
  }

  // Single-action modes (exclude / regenerate): one marked set, one instruction clause.
  var markedClass = ${JSON.stringify(modeConfig.markedClass)};
  var instructionVerb = ${JSON.stringify(modeConfig.actionVerb)};
  var marked = new Set();
  var updateCounter = function () {
    var suffix = mode === "regenerate" ? "flagged for regeneration" : "marked for exclusion";
    document.getElementById("counter").innerHTML = "<strong>" + marked.size + "</strong> " + suffix;
  };
  document.querySelectorAll("tr.row").forEach(function (tr) {
    tr.addEventListener("click", function (e) {
      if (e.target.closest("audio")) return;
      var n = Number(tr.getAttribute("data-row"));
      if (marked.has(n)) {
        marked.delete(n);
        tr.classList.remove(markedClass);
      } else {
        marked.add(n);
        tr.classList.add(markedClass);
      }
      updateCounter();
    });
  });
  wireCopy(function () {
    var rows = Array.from(marked).sort(function (a, b) { return a - b; });
    return rows.length === 0 ? noneMarkedText : "Please " + instructionVerb + " rows " + rows.join(", ") + ".";
  });
  updateCounter();
})();
</script>
`;
}
