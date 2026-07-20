import { escapeHtml } from "./reviewPageTemplate.js";

// Shared "deck view" chrome — the editorial visual system used by BOTH the static deck-view artifact
// (audio inlined as base64 data URIs, size-capped) and the local deck dashboard server (audio served
// over HTTP, no size cap). Keeping the CSS, the collapsible-lesson markup, and the expand/collapse
// script in one place is what keeps the two byte-for-byte visually identical: each caller supplies
// only its own `audioCell(card)` (base64 vs URL) and its own page header.

export { escapeHtml };

// The full stylesheet (no <style> wrapper, no @font-face — the caller prepends fontFaceRule()).
export const DECK_VIEW_CSS = `:root{--paper:#ece8df;--card:#f6f3ec;--ink:#23201c;--soft:#6a6459;--faint:#9a9284;--rule:#ded8cb;--rule2:#cdc6b6;--accent:#7a3b36;
--serif:"Iowan Old Style",Palatino,Georgia,serif;--sans:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;--mono:ui-monospace,Menlo,monospace;--jp:"DeckScript","Hiragino Mincho ProN","Hiragino Sans",serif}
*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font-family:var(--sans);-webkit-font-smoothing:antialiased}
.wrap{max-width:none;margin:0;padding:0 4vw 90px}
header{padding:44px 0 16px}.eyebrow{font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--accent)}
h1{font-family:var(--serif);font-weight:500;font-size:clamp(26px,4vw,34px);margin:8px 0 6px}
a.plain{color:inherit;text-decoration:none}a.back{font-size:13px;color:var(--accent);text-decoration:none}a.back:hover{text-decoration:underline}
.lede{font-size:15px;color:var(--soft);margin:0;max-width:92ch}.lede b{color:var(--ink)}
.lesson{margin-top:14px;border:1px solid var(--rule2);border-radius:10px;background:var(--card);overflow:hidden}
.lesson>summary{list-style:none;cursor:pointer;display:flex;align-items:baseline;gap:12px;justify-content:space-between;padding:14px 16px;user-select:none}
.lesson>summary::-webkit-details-marker{display:none}
.lesson>summary::before{content:"▸";color:var(--accent);font-size:13px;line-height:1.4;transition:transform .12s ease;flex:0 0 auto}
.lesson[open]>summary::before{transform:rotate(90deg)}
.lesson>summary:hover{background:rgba(122,59,54,.05)}
.lesson[open]>summary{border-bottom:1px solid var(--rule)}
.st{font-family:var(--serif);font-weight:500;font-size:19px;flex:1 1 auto}
.cnt{font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:var(--faint);white-space:nowrap;font-variant-numeric:tabular-nums}
.bar{display:flex;gap:8px;margin:18px 0 2px}
.bar button{font:inherit;font-size:12.5px;color:var(--accent);background:var(--card);border:1px solid var(--rule2);border-radius:100px;padding:5px 13px;cursor:pointer}
.bar button:hover{border-color:var(--accent)}
table{width:100%;border-collapse:collapse;table-layout:fixed}
thead th{text-align:left;font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--faint);padding:10px 12px 8px;border-bottom:1px solid var(--rule2)}
col.c-num{width:48px}col.c-en{width:24%}col.c-jp{width:22%}col.c-pron{width:15%}col.c-au{width:180px}col.c-note{width:auto}
tbody td{padding:11px 12px;border-bottom:1px solid var(--rule);vertical-align:top;overflow-wrap:anywhere}
tbody tr:hover td{background:rgba(122,59,54,.045)}
td.num{color:var(--faint);font-variant-numeric:tabular-nums;white-space:nowrap}
td.en{font-size:14px}.cat{font-size:10.5px;text-transform:uppercase;letter-spacing:.04em;color:var(--faint);margin-top:3px}
td.jp{font-family:var(--jp);font-size:21px;line-height:1.4}
td.pron{font-family:var(--mono);font-size:12px;color:var(--soft)}
td.au audio{height:30px;width:168px}.x{color:var(--faint)}
td.note{font-size:12px;color:var(--soft)}
.tw{overflow-x:auto}
footer{margin-top:40px;padding-top:14px;border-top:1px solid var(--rule);font-size:12px;color:var(--faint)}
/* dashboard index */
.decks{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px;margin-top:16px}
.deck{display:block;border:1px solid var(--rule2);border-radius:10px;background:var(--card);padding:16px 18px;text-decoration:none;color:inherit}
.deck:hover{border-color:var(--accent)}
.deck .dt{font-family:var(--serif);font-size:18px;margin-bottom:6px}
.deck .dm{font-size:12px;color:var(--faint);text-transform:uppercase;letter-spacing:.04em}
.grp{margin-top:30px}.grp h2{font-family:var(--serif);font-weight:500;font-size:20px;margin:0 0 2px;border-bottom:2px solid var(--accent);padding-bottom:6px}`;

// The @font-face rule for the target-script font. Pass { base64 } for an inlined data URI (static
// artifact) or { url } for a served asset (dashboard). Returns "" when no font is supplied.
export function fontFaceRule(src) {
  if (!src) return "";
  const url = src.base64 ? `data:font/woff2;base64,${src.base64}` : src.url;
  if (!url) return "";
  return `@font-face{font-family:"DeckScript";src:url("${url}") format("woff2");font-display:swap}`;
}

// Vanilla-JS expand/collapse-all wiring (no <script> wrapper). Include on any page with
// <details class="lesson"> sections and #xall / #call buttons.
export const EXPAND_COLLAPSE_SCRIPT = `(function () {
  var all = function () { return document.querySelectorAll("details.lesson"); };
  var setAll = function (open) { all().forEach(function (d) { d.open = open; }); };
  var x = document.getElementById("xall"); if (x) x.addEventListener("click", function () { setAll(true); });
  var c = document.getElementById("call"); if (c) c.addEventListener("click", function () { setAll(false); });
})();`;

const cardRow = (c, n, audioCell) => `<tr class="row">
  <td class="num">${n}</td>
  <td class="en">${escapeHtml(c.english)}${c.category ? `<div class="cat">${escapeHtml(c.category)}</div>` : ""}</td>
  <td class="jp">${escapeHtml(c.target)}</td>
  <td class="pron">${escapeHtml(c.pronunciation)}</td>
  <td class="au">${audioCell(c)}</td>
  <td class="note">${c.note ? escapeHtml(c.note) : ""}</td>
</tr>`;

/**
 * Renders the deck's units as collapsible <details> sections (collapsed by default), each with a
 * cards table whose audio cell is produced by `audioCell(card)`. Numbering is global and continues
 * from `startNumber`.
 * @returns {{ html: string, endNumber: number }}
 */
export function renderLessonSections({ sections, startNumber = 1, audioCell }) {
  let n = startNumber - 1;
  const html = sections
    .map((s) => {
      const from = n + 1;
      const rows = s.cards.map((c) => cardRow(c, ++n, audioCell)).join("");
      const range = s.cards.length ? `${from}–${n}` : "—";
      return `<details class="lesson"><summary><span class="st">${escapeHtml(s.leaf)}</span><span class="cnt">${s.cards.length} cards · ${range}</span></summary>
  <div class="tw"><table><colgroup><col class="c-num"><col class="c-en"><col class="c-jp"><col class="c-pron"><col class="c-au"><col class="c-note"></colgroup>
  <thead><tr><th class="num">#</th><th>English</th><th>Japanese</th><th>Romaji</th><th>Audio</th><th>Note</th></tr></thead>
  <tbody>${rows}</tbody></table></div></details>`;
    })
    .join("\n");
  return { html, endNumber: n };
}
