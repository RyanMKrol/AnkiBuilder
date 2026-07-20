import { Buffer } from "buffer";
import { escapeHtml } from "./reviewPageTemplate.js";

// Renders a read-only "deck browser" artifact: every card of a built deck laid out for scanning at a
// glance, grouped by its sub-deck, with the deck's own audio clip embedded inline per card. Same
// editorial visual system as the audio-review artifacts (Klee kana for the target script, paper
// palette). This is a browse view — no marking, no interaction — so a whole deck can be read and
// played through in one page. The CLI splits a large deck into parts, each a call to this with a
// continued `startNumber`.

const player = (audioData) =>
  audioData
    ? `<audio controls preload="none" src="data:audio/mpeg;base64,${Buffer.from(audioData).toString("base64")}"></audio>`
    : `<span class="x">—</span>`;

const card = (c, n) => `<tr class="row">
  <td class="num">${n}</td>
  <td class="en">${escapeHtml(c.english)}${c.category ? `<div class="cat">${escapeHtml(c.category)}</div>` : ""}</td>
  <td class="jp">${escapeHtml(c.target)}</td>
  <td class="pron">${escapeHtml(c.pronunciation)}</td>
  <td class="au">${player(c.audioData)}</td>
  <td class="note">${c.note ? escapeHtml(c.note) : ""}</td>
</tr>`;

/**
 * @param {object} opts
 * @param {string} opts.title           Book/course/deck title (page heading).
 * @param {Array}  opts.sections        [{ leaf, cards: [{english,target,pronunciation,category,note,audioData}] }]
 * @param {number} [opts.startNumber=1] First global card number on this page (for split parts).
 * @param {string|null} [opts.fontBase64=null] Base64 woff2 of the target-script font to embed.
 * @param {string|null} [opts.partLabel=null]  e.g. "Part 2 of 3" — shown when the deck is split.
 * @returns {string} self-contained HTML
 */
export function renderDeckViewPage({
  title,
  sections,
  startNumber = 1,
  fontBase64 = null,
  partLabel = null,
}) {
  let n = startNumber - 1;
  const total = sections.reduce((sum, s) => sum + s.cards.length, 0);
  const withAudio = sections.reduce((sum, s) => sum + s.cards.filter((c) => c.audioData).length, 0);

  // Each sub-deck is a native <details>, collapsed by default, so the deck can be worked through one
  // lesson at a time. The <summary> shows the lesson name, its card count, and its global row range.
  const sectionHtml = sections
    .map((s) => {
      const from = n + 1;
      const rows = s.cards.map((c) => card(c, ++n)).join("");
      const range = s.cards.length ? `${from}–${n}` : "—";
      return `<details class="lesson"><summary><span class="st">${escapeHtml(s.leaf)}</span><span class="cnt">${s.cards.length} cards · ${range}</span></summary>
  <div class="tw"><table><colgroup><col class="c-num"><col class="c-en"><col class="c-jp"><col class="c-pron"><col class="c-au"><col class="c-note"></colgroup>
  <thead><tr><th class="num">#</th><th>English</th><th>Japanese</th><th>Romaji</th><th>Audio</th><th>Note</th></tr></thead>
  <tbody>${rows}</tbody></table></div></details>`;
    })
    .join("\n");

  const fontFace = fontBase64
    ? `@font-face{font-family:"DeckScript";src:url("data:font/woff2;base64,${fontBase64}") format("woff2");font-display:swap}`
    : "";

  return `<title>${escapeHtml(title)} — deck view</title>
<style>
${fontFace}
:root{--paper:#ece8df;--card:#f6f3ec;--ink:#23201c;--soft:#6a6459;--faint:#9a9284;--rule:#ded8cb;--rule2:#cdc6b6;--accent:#7a3b36;
--serif:"Iowan Old Style",Palatino,Georgia,serif;--sans:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;--mono:ui-monospace,Menlo,monospace;--jp:"DeckScript","Hiragino Mincho ProN","Hiragino Sans",serif}
*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font-family:var(--sans);-webkit-font-smoothing:antialiased}
.wrap{max-width:none;margin:0;padding:0 4vw 90px}
header{padding:44px 0 16px}.eyebrow{font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--accent)}
h1{font-family:var(--serif);font-weight:500;font-size:clamp(26px,4vw,34px);margin:8px 0 6px}
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
</style>
<div class="wrap">
<header><div class="eyebrow">Deck view · anki-builder${partLabel ? ` · ${escapeHtml(partLabel)}` : ""}</div>
<h1>${escapeHtml(title)}</h1>
<p class="lede"><b>${total}</b> cards${sections.length > 1 ? ` across <b>${sections.length}</b> sub-decks` : ""}${partLabel ? ` (${escapeHtml(partLabel)})` : ""}. Each lesson is collapsed — click one to open it, play each card's audio inline, and scan the fields at a glance. This is a read-only view of exactly what's in the deck. <b>${withAudio}</b> have audio.</p>
<div class="bar"><button type="button" id="xall">Expand all</button><button type="button" id="call">Collapse all</button></div>
</header>
${sectionHtml}
<footer>Read-only deck browser. Lessons collapsed by default. Target script in Klee One where embedded. Audio is the clip stored in the deck.</footer>
</div>
<script>
(function () {
  var all = function () { return document.querySelectorAll("details.lesson"); };
  var setAll = function (open) { all().forEach(function (d) { d.open = open; }); };
  document.getElementById("xall").addEventListener("click", function () { setAll(true); });
  document.getElementById("call").addEventListener("click", function () { setAll(false); });
})();
</script>`;
}
