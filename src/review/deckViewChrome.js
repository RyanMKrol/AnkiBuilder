// Shared "deck view" chrome — the editorial visual system used by BOTH the static deck-view artifact
// (audio inlined as base64 data URIs, size-capped) and the local deck dashboard server (audio served
// over HTTP, no size cap). Keeping the CSS, the collapsible-lesson markup, and the expand/collapse
// script in one place is what keeps the two byte-for-byte visually identical: each caller supplies
// only its own `audioCell(card)` (base64 vs URL) and its own page header.

// HTML-escapes a value for safe interpolation into the templates below.
export function escapeHtml(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch],
  );
}

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
thead th{text-align:left;font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--faint);padding:10px 12px 8px;border-bottom:1px solid var(--rule2);vertical-align:bottom;overflow-wrap:anywhere}
col.c-num{width:48px}col.c-en{width:24%}col.c-jp{width:22%}col.c-pron{width:15%}col.c-au{width:180px}col.c-hint{width:150px}col.c-note{width:auto}
col.c-cat{width:13%}col.c-flags{width:150px}col.c-flag{width:120px}col.c-excl{width:104px}
/* Flag-bearing stages (incomplete / corpus) mix an auto NOTE column with several fixed-px columns; on a
   narrow viewport the auto column collapses to ~0 and its header spills onto the next one. Give every
   column a real px width and the table a min-width, so it scrolls in its .tw wrapper instead of crushing. */
table.tbl-incomplete{min-width:1070px}
.tbl-incomplete col.c-num{width:44px}.tbl-incomplete col.c-en{width:240px}.tbl-incomplete col.c-cat{width:140px}.tbl-incomplete col.c-hint{width:170px}.tbl-incomplete col.c-note{width:196px}.tbl-incomplete col.c-flag{width:120px}
table.tbl-corpus{min-width:1310px}
.tbl-corpus col.c-num{width:44px}.tbl-corpus col.c-en{width:200px}.tbl-corpus col.c-cat{width:120px}.tbl-corpus col.c-jp{width:190px}.tbl-corpus col.c-pron{width:140px}.tbl-corpus col.c-hint{width:150px}.tbl-corpus col.c-note{width:120px}.tbl-corpus col.c-flag{width:104px}.tbl-corpus col.c-excl{width:96px}
/* Audio review with the extra Exclude / Review-note columns: the base audio table's AUTO Note column
   would collapse, so give the whole table explicit px widths + a min-width (scrolls in .tw). Only the
   crowded review render gets this class — the read-only 6-column audio browse/artifact is untouched. */
/* Audio review with the extra Exclude / Review-note columns. NO min-width — the table always fits the
   viewport (width:100%): num / audio / exclude are fixed px (audio needs room for its player), and the
   rest are PERCENTAGES so English/Japanese/Note/Review-note share the remaining space and the notes
   just wrap into more lines rather than pushing the table off-screen. Percentages sum to ~72%, leaving
   headroom for the ~268px of fixed columns at any reasonable width. */
.tbl-audio.tbl-wide col.c-num{width:40px}.tbl-audio.tbl-wide col.c-en{width:13%}.tbl-audio.tbl-wide col.c-jp{width:12%}.tbl-audio.tbl-wide col.c-pron{width:9%}.tbl-audio.tbl-wide col.c-au{width:184px}.tbl-audio.tbl-wide col.c-hint{width:12%}.tbl-audio.tbl-wide col.c-note{width:14%}.tbl-audio.tbl-wide col.c-excl{width:44px}.tbl-audio.tbl-wide col.c-rnote{width:16%}
/* The audio REVIEW carries two audio columns (Original, In use). That's ~368px of fixed width before
   num/exclude, so the percentage columns are trimmed to keep the whole table inside a normal window
   rather than pushing it into the .tw wrapper's horizontal scroll. */
.tbl-audio.tbl-twoau col.c-en{width:11%}.tbl-audio.tbl-twoau col.c-jp{width:10%}.tbl-audio.tbl-twoau col.c-pron{width:7%}.tbl-audio.tbl-twoau col.c-hint{width:9%}.tbl-audio.tbl-twoau col.c-note{width:11%}.tbl-audio.tbl-twoau col.c-rnote{width:12%}
/* The Original column is supporting evidence, not the answer — muted so the eye lands on In use. */
td.au-orig{background:rgba(0,0,0,.018)}
td.au-orig audio{opacity:.72}
td.au-orig audio:hover{opacity:1}
th.ctr,td.ctr{text-align:center}.tick{color:#5c7a52;font-weight:700}
tbody td{padding:11px 12px;border-bottom:1px solid var(--rule);vertical-align:top;overflow-wrap:anywhere}
tbody tr:hover td{background:rgba(122,59,54,.045)}
td.num{color:var(--faint);font-variant-numeric:tabular-nums;white-space:nowrap}
td.en{font-size:14px}.cat{font-size:10.5px;text-transform:uppercase;letter-spacing:.04em;color:var(--faint);margin-top:3px}
td.jp{font-family:var(--jp);font-size:21px;line-height:1.4}
td.pron{font-family:var(--mono);font-size:12px;color:var(--soft)}
/* Fill the audio column but never overflow it (which would spill the player onto the Note column). */
td.au audio{height:30px;width:100%;max-width:168px}.x{color:var(--faint)}
td.note{font-size:12px;color:var(--soft)}
/* Front-of-card hint (disambiguator) — italic + muted to set it apart from the back Note. */
td.hint-col{font-size:12px;color:var(--faint);font-style:italic}
/* Review-only internal note (uncertainty / AI-suggestion rationale) — visually set apart (amber,
   italic) from the user-facing card Note so a reviewer never confuses the two. Never shown in the deck. */
col.c-rnote{width:220px}
td.rnote{font-size:11.5px;color:#8a6a24;font-style:italic}
td.cat-col{font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:var(--soft)}
.badge{display:inline-block;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;padding:2px 7px;border-radius:100px;border:1px solid var(--rule2);color:var(--soft);white-space:nowrap}
.badge-drop{color:var(--accent);border-color:var(--accent)}
.badge-ai{color:#3f6f6a;border-color:#3f6f6a}.badge-uncertain{color:#8a6a24;border-color:#8a6a24}
.badge-marker{color:#8a2a24;border-color:#8a2a24}
.rowflags{margin-top:4px;display:flex;gap:5px;flex-wrap:wrap}
tr.row.excluded td{color:var(--faint);text-decoration:line-through}
.tw{overflow-x:auto}
footer{margin-top:40px;padding-top:14px;border-top:1px solid var(--rule);font-size:12px;color:var(--faint)}
/* dashboard index */
.decks{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px;margin-top:16px}
.deck{display:block;border:1px solid var(--rule2);border-radius:10px;background:var(--card);padding:16px 18px;text-decoration:none;color:inherit}
.deck:hover{border-color:var(--accent)}
.deck .dt{font-family:var(--serif);font-size:18px;margin-bottom:6px}
.deck .dm{font-size:12px;color:var(--faint);text-transform:uppercase;letter-spacing:.04em}
.deck-actions{display:flex;gap:16px;margin-top:12px}
.deck-actions a.da{font-size:12.5px;color:var(--accent);text-decoration:none}
.deck-actions a.da.primary{font-weight:700}.deck-actions a.da:hover{text-decoration:underline}
.grp{margin-top:30px}.grp h2{font-family:var(--serif);font-weight:500;font-size:20px;margin:0 0 2px;border-bottom:2px solid var(--accent);padding-bottom:6px}
.grp h2 .gcount{font-family:var(--sans);font-size:12px;font-weight:400;color:var(--faint);font-variant-numeric:tabular-nums}
.ghint{font-size:12.5px;color:var(--soft);margin:6px 0 0}
.grp-built h2{border-bottom-color:#5c7a52}
/* "Not finished" — a build that stopped before there was anything to review. Warm-warning tone, so it
   reads as a problem to clear rather than a third review step. */
.grp-unfinished h2{border-bottom-color:#9a4f2a}
.dblock{border:1px solid var(--rule2);border-radius:10px;background:var(--card);padding:14px 16px;margin-top:14px}
.grp-review .dblock{border-left:3px solid var(--accent)}
.grp-built .dblock{border-left:3px solid #5c7a52}
.grp-unfinished .dblock{border-left:3px solid #9a4f2a}
.grp-unfinished .urow .ustage{color:#9a4f2a;font-weight:700}
.ghint code{font-family:var(--mono);font-size:11.5px}
.dblock .dt{font-family:var(--serif);font-size:17px}
.dblock .dm{font-size:11px;color:var(--faint);text-transform:uppercase;letter-spacing:.04em;margin-left:10px}
.dbhead{display:flex;align-items:baseline;flex-wrap:wrap;margin-bottom:2px}
/* Each lesson row IS the link — the whole row is clickable (no separate Open/Review button).
   Symmetric vertical padding (no lopsided margin) so the label sits centred between the row rules. */
.urow{display:flex;align-items:center;gap:12px;padding:11px 4px;border-top:1px solid var(--rule);text-decoration:none;color:inherit;cursor:pointer}
.urow:first-of-type{margin-top:6px}
.urow:hover{background:rgba(122,59,54,.05)}
.urow:hover .ulabel{color:var(--accent)}
.urow .ulabel{flex:1 1 auto;font-size:13.5px}
.urow .ustage{font-size:10.5px;text-transform:uppercase;letter-spacing:.04em;color:var(--faint)}
.urow .ustage.done{color:#5c7a52;font-weight:700}
.urow .ustage.building{color:#8a6d1f;font-weight:700}
.urow .ustage.interrupted{color:#9a4f2a;font-weight:700}
.build-banner{margin:12px 0;padding:10px 12px;border-radius:6px;background:#fdf6e3;border:1px solid #e8d9a8;font-size:13px;line-height:1.5}
.build-banner.interrupted{background:#fdf0ea;border-color:#e8c3ae}
.build-banner .clear-claim{margin-left:8px;font-size:12px;padding:2px 8px;cursor:pointer}
/* A built row: the label link stretches over the whole row (click → open the view), while the Reopen
   button sits above it (z-index) so it's independently clickable. */
.urow-built{position:relative}
.urow-built .urow-link{flex:1 1 auto;text-decoration:none;color:inherit;min-width:0}
.urow-built .urow-link::after{content:"";position:absolute;inset:0}
.urow-built .ustage.done{position:relative;z-index:1}
.home-reopen{position:relative;z-index:1;font:inherit;font-size:11.5px;color:var(--accent);background:var(--card);border:1px solid var(--rule2);border-radius:100px;padding:3px 12px;cursor:pointer;white-space:nowrap}
.home-reopen:hover{border-color:var(--accent)}
.deliverbar{margin-top:14px;display:flex;align-items:center;gap:12px;flex-wrap:wrap}
#deliver-anki{font:inherit;font-size:13px;font-weight:600;color:#fff;background:var(--accent);border:1px solid var(--accent);border-radius:100px;padding:6px 16px;cursor:pointer}
#deliver-anki:hover{filter:brightness(1.06)}
#deliver-anki:disabled{opacity:.55;cursor:default}
.deliver-status{font-size:12.5px;color:var(--faint)}
.home-reopen:disabled{opacity:.6;cursor:default}
/* A single-unit deck block is itself the link. */
.dblock.single{display:block;text-decoration:none;color:inherit;cursor:pointer}
.dblock.single:hover{border-color:var(--accent)}
/* …unless it's built and gets a Reopen button: the block link stretches, the button sits above it. */
.dblock.single.dbreopen{display:flex;align-items:center;gap:12px;position:relative}
.dblock.single.dbreopen .dblock-link{flex:1 1 auto;text-decoration:none;color:inherit;min-width:0}
.dblock.single.dbreopen .dblock-link::after{content:"";position:absolute;inset:0}
/* editor: per-row controls */
/* One audio-edit button per line (Replace / Generate / Generate (kanji)) so they never wrap mid-row. */
.au .ed{margin-top:6px;display:flex;flex-direction:column;align-items:flex-start;gap:5px}
.au .ed button,.au .ed label.btn{text-align:center;white-space:nowrap}
.au .ed button,.au .ed label.btn{font:inherit;font-size:11px;color:var(--accent);background:var(--card);border:1px solid var(--rule2);border-radius:100px;padding:2px 9px;cursor:pointer}
.au .ed button:hover,.au .ed label.btn:hover{border-color:var(--accent)}
.au .ed .msg{font-size:10.5px;color:var(--faint)}
/* editor: rebuild toolbar */
.rb{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-left:6px}
/* editor: generate modal */
.modal{position:fixed;inset:0;background:rgba(35,32,28,.5);display:flex;align-items:center;justify-content:center;padding:20px;z-index:20}
.modal[hidden]{display:none}
.modal-box{background:var(--paper);border:1px solid var(--rule2);border-radius:12px;max-width:640px;width:100%;max-height:85vh;overflow:auto;padding:22px 24px}
.modal-box h3{font-family:var(--serif);font-weight:500;font-size:19px;margin:0 0 4px}
.modal-box .sub{font-size:13px;color:var(--soft);margin:0 0 14px}
.vlist{display:flex;flex-direction:column;gap:8px}
.vrow{display:flex;align-items:center;gap:10px;padding:8px 10px;border:1px solid var(--rule);border-radius:8px;background:var(--card)}
.vrow .vlabel{font-size:12px;color:var(--soft);min-width:130px}.vrow audio{height:30px;width:170px}
.vrow button{margin-left:auto;font:inherit;font-size:12px;color:#fff;background:var(--accent);border:none;border-radius:7px;padding:5px 12px;cursor:pointer}
.modal-foot{display:flex;justify-content:flex-end;margin-top:16px}
.modal-foot button{font:inherit;font-size:13px;color:var(--soft);background:none;border:1px solid var(--rule2);border-radius:8px;padding:6px 14px;cursor:pointer}
.spin{font-size:13px;color:var(--soft)}
/* editor: the manual trim modal (waveform + draggable start/end handles) */
#trim-modal .modal-box{max-width:780px}
.wfwrap{position:relative;height:150px;margin:6px 0 10px;border:1px solid var(--rule2);border-radius:8px;background:var(--card);overflow:hidden;touch-action:none;user-select:none}
.wfwrap canvas{display:block;width:100%;height:100%}
/* The DISCARDED regions are shaded, so the clip you keep is the part shown plainly. */
.wfcut{position:absolute;top:0;bottom:0;background:rgba(35,32,28,.42);pointer-events:none}
.wfhandle{position:absolute;top:0;bottom:0;width:11px;margin-left:-5px;cursor:ew-resize;background:transparent}
.wfhandle::before{content:"";position:absolute;top:0;bottom:0;left:4px;width:3px;background:var(--accent)}
.wfhandle::after{content:"";position:absolute;top:50%;left:0;width:11px;height:26px;margin-top:-13px;border-radius:3px;background:var(--accent)}
.wfhandle:hover::after,.wfhandle.drag::after{filter:brightness(1.25)}
/* Playhead — only visible while auditioning. */
.wfplay{position:absolute;top:0;bottom:0;width:1px;background:#2f6f4f;pointer-events:none;display:none}
.wfplay.on{display:block}
.trimtimes{display:flex;gap:18px;font-family:var(--mono);font-size:12px;color:var(--soft);font-variant-numeric:tabular-nums}
.trimtimes b{color:var(--ink);font-weight:600}
.trimbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:12px}
.trimbar button{font:inherit;font-size:12.5px;color:var(--accent);background:var(--card);border:1px solid var(--rule2);border-radius:100px;padding:5px 13px;cursor:pointer}
.trimbar button:hover{border-color:var(--accent)}
.trimbar button:disabled{opacity:.5;cursor:default}
.trimbar button.primary{color:#fff;background:var(--accent);border-color:var(--accent)}
.trimbar .trim-msg{font-size:12px;color:var(--faint);margin-left:auto}
.trimbar .trim-msg.err{color:var(--accent)}
.trimnote{font-size:12px;color:var(--faint);margin:10px 0 0}
.cleanbar{border-top:1px solid var(--rule);padding-top:10px;margin-top:14px}
.cleanbar .cleanlabel{font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--faint);margin-right:4px}
.cleanbar .clean-btn{text-transform:capitalize}
.cleanbar .clean-btn.on{color:#fff;background:var(--accent);border-color:var(--accent)}
.cleanbar .clean-msg{font-size:12px;color:var(--faint);margin-left:auto}
.cleanbar .clean-msg.err{color:var(--accent)}
/* editor: corpus-review controls */
.sec-tools{display:flex;gap:10px;align-items:center;padding:10px 12px;border-bottom:1px solid var(--rule)}
.sec-tools button{font:inherit;font-size:12px;color:var(--accent);background:var(--card);border:1px solid var(--rule2);border-radius:100px;padding:4px 12px;cursor:pointer}
.sec-tools button:hover{border-color:var(--accent)}.sec-tools button:disabled{opacity:.5;cursor:default}
.sec-tools .rev-msg,.sec-tools .done-msg{font-size:11px;color:var(--faint)}
.sec-tools .done-badge{font-size:11px;font-weight:700;color:#5c7a52;text-transform:uppercase;letter-spacing:.04em}
.sec-tools .hint{font-size:12px;color:var(--faint)}.sec-tools .hint code{font-family:var(--mono);font-size:11px}
/* Exclude is a single compact icon button (the circled-slash glyph) — no wrapping text; .on = excluded. */
.excl-btn{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;font-size:16px;line-height:1;color:var(--soft);background:var(--card);border:1px solid var(--rule2);border-radius:8px;cursor:pointer}
.excl-btn:hover{border-color:var(--accent);color:var(--accent)}
.excl-btn.on{color:#fff;background:var(--accent);border-color:var(--accent)}
.excl-btn:disabled{opacity:.5;cursor:default}
td.excl-cell{text-align:center}
td[data-field]{cursor:text}td[data-field][contenteditable]:focus{outline:2px solid var(--accent);outline-offset:-2px;background:var(--card)}
td.saved{background:rgba(122,59,54,.1)}`;

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

// Client wiring for the editor (only included when the dashboard is editable). Reads the deck
// type/id/done from #deckctx; per-row card id/unit from each <tr>'s data-* attributes. Vanilla JS, no
// template literals / ${} (it's embedded in a template literal). Handles: Replace (raw upload) and
// Shared client prelude — the tiny helpers every dashboard script leans on, defined ONCE as
// window.__ab. Each script used to carry its own copy of `jsonp` (five of them) and the
// rebuild-if-done helper (three), which is exactly how the copies drift apart. Loaded FIRST on any
// page that loads the scripts below; on the home page (no #deckctx) `base`/`maybeRebuild` are
// inert and only `jsonp` is used.
export const DASH_PRELUDE_SCRIPT = `(function () {
  var ctx = document.getElementById("deckctx");
  var status = document.getElementById("rebuild-status");
  var base = ctx ? "/api/deck/" + encodeURIComponent(ctx.getAttribute("data-type")) + "/" + encodeURIComponent(ctx.getAttribute("data-id")) : null;
  var isDone = !!ctx && ctx.getAttribute("data-done") === "1";
  var jsonp = function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); };
  var setStatus = function (t) { if (status) status.textContent = t; };
  var rebuild = function () {
    setStatus("rebuilding\\u2026");
    return window.fetch(base + "/rebuild", { method: "POST" }).then(jsonp).then(function (x) {
      if (!x.ok) throw new Error(x.j.error || "rebuild failed");
      setStatus("\\u2713 deck rebuilt (" + x.j.noteCount + " cards)");
    }).catch(function (e) { setStatus("rebuild failed: " + e.message); });
  };
  // Put a clip into one of a row's two audio cells. The selector matters: "td.au" alone matches
  // the Original column FIRST (it is rendered in front), so an unqualified query would swap the
  // wrong player and leave the In use column showing the previous take.
  var putAudio = function (tr, sel, url) {
    var cell = tr.querySelector(sel);
    if (!cell || !url) return;
    var a = cell.querySelector("audio");
    if (a) { a.src = url; return; }
    var na = document.createElement("audio"); na.controls = true; na.preload = "none"; na.src = url;
    var x = cell.querySelector(".x"); if (x) { x.replaceWith(na); } else { cell.insertBefore(na, cell.firstChild); }
  };
  // Write into a row's own message span — the non-blocking alternative to alert().
  var rowMsg = function (tr, text) {
    var m = tr && tr.querySelector(".msg");
    if (m) m.textContent = text || "";
  };
  window.__ab = {
    jsonp: jsonp,
    base: base,
    setStatus: setStatus,
    rebuild: rebuild,
    // After an edit: auto-rebuild the group, but only if this lesson is already part of it (done).
    maybeRebuild: function () { return isDone ? rebuild() : Promise.resolve(); },
    putAudio: putAudio,
    swapInUse: function (tr, url) { putAudio(tr, "td.au:not(.au-orig)", url); },
    rowMsg: rowMsg
  };
})();`;

// Generate (ElevenLabs variants in a modal → Use this). There is ONE package per group (the book/course
// merge, or a template's own deck) and rebuilds are FULLY AUTOMATIC — no manual button. After every
// successful edit the group auto-rebuilds, but ONLY when this lesson is already done (data-done="1"),
// so the on-disk .apkg stays current without pointless whole-book rebuilds while you're still finishing
// a fresh lesson (Mark done rebuilds it in). Auditioning is via the inline players; there is no download
// — the dashboard is local, the .apkg is already on disk.
export const DECK_EDIT_SCRIPT = `(function () {
  var ctx = document.getElementById("deckctx");
  if (!ctx || !window.__ab) return;
  var A = window.__ab;
  var base = A.base, jsonp = A.jsonp, put = A.putAudio, swap = A.swapInUse, maybeRebuild = A.maybeRebuild;
  var rowRef = function (el) {
    var tr = el.closest("tr");
    return { tr: tr, cid: tr.getAttribute("data-card-id"), unit: tr.getAttribute("data-unit"),
             msg: tr.querySelector(".msg") };
  };
  // Replace and Generate install a whole NEW recording, so everything the editor reads off the row is
  // now stale: the original it would cut from, any hand-trim range (the server clears it — it
  // described the PREVIOUS recording), and the cleanup chain. Refresh the lot, or the editor silently
  // goes on offering the old take.
  var refreshRow = function (tr, j) {
    swap(tr, j.mediaUrl);
    put(tr, "td.au.au-orig", j.originalUrl);
    if (j.originalUrl) tr.setAttribute("data-original-url", j.originalUrl);
    if (j.audioTrim) {
      tr.setAttribute("data-trim-start", String(j.audioTrim.start));
      tr.setAttribute("data-trim-end", String(j.audioTrim.end));
    } else {
      tr.removeAttribute("data-trim-start");
      tr.removeAttribute("data-trim-end");
    }
    if (j.audioFilter) tr.setAttribute("data-filter", j.audioFilter);
    else tr.removeAttribute("data-filter");
  };
  document.querySelectorAll("input.repl").forEach(function (inp) {
    inp.addEventListener("change", function () {
      var f = inp.files[0]; if (!f) return;
      var r = rowRef(inp); var ext = (f.name.split(".").pop() || "mp3").toLowerCase();
      if (r.msg) r.msg.textContent = "uploading…";
      fetch(base + "/unit/" + encodeURIComponent(r.unit) + "/card/" + encodeURIComponent(r.cid) + "/audio?ext=" + encodeURIComponent(ext), { method: "POST", body: f })
        .then(jsonp).then(function (x) { if (!x.ok) throw new Error(x.j.error || "upload failed"); refreshRow(r.tr, x.j); if (r.msg) r.msg.textContent = "\\u2713 replaced"; return maybeRebuild(); })
        .catch(function (e) { if (r.msg) r.msg.textContent = e.message; });
      inp.value = "";
    });
  });
  var modal = document.getElementById("gen-modal");
  var closeModal = function () { modal.hidden = true; modal.querySelector(".vlist").innerHTML = ""; };
  var fetchVariants = function (r, path, labels) {
    var opts = { method: "POST" };
    if (labels && labels.length && path === "/generate") {
      opts.headers = { "Content-Type": "application/json" };
      opts.body = JSON.stringify({ labels: labels });
    }
    return fetch(base + "/unit/" + encodeURIComponent(r.unit) + "/card/" + encodeURIComponent(r.cid) + path, opts)
      .then(jsonp).then(function (x) {
        if (!x.ok) throw new Error(x.j.error || "generation failed");
        return x.j.variants;
      });
  };
  var variantRow = function (r, path, v) {
    var row = document.createElement("div"); row.className = "vrow";
    var lab = document.createElement("span"); lab.className = "vlabel"; lab.textContent = v.kanji ? v.label + " — " + v.kanji : v.label;
    var au = document.createElement("audio"); au.controls = true; au.preload = "none"; au.src = v.mediaUrl;
    var use = document.createElement("button"); use.textContent = "Use this";
    use.addEventListener("click", function () {
      fetch(base + "/unit/" + encodeURIComponent(r.unit) + "/card/" + encodeURIComponent(r.cid) + "/audio/select", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ audio: v.audio, original: v.original || null }) })
        .then(jsonp).then(function (y) { if (!y.ok) throw new Error(y.j.error || "select failed"); refreshRow(r.tr, y.j); closeModal(); if (r.msg) r.msg.textContent = "\\u2713 generated"; return maybeRebuild(); })
        .catch(function (e) { closeModal(); A.rowMsg(r.tr, "select failed: " + e.message); });
    });
    // A fresh roll of THIS take alone — one credit — replacing only this row.
    var reroll = document.createElement("button"); reroll.textContent = "Re-roll";
    reroll.addEventListener("click", function () {
      reroll.disabled = true; reroll.textContent = "\\u2026";
      fetchVariants(r, path, [v.label]).then(function (variants) {
        var fresh = null;
        variants.forEach(function (nv) { if (nv.label === v.label) fresh = nv; });
        if (!fresh && variants.length === 1) fresh = variants[0];
        if (fresh) row.replaceWith(variantRow(r, path, fresh));
        else throw new Error("no matching take came back");
      }).catch(function (e) { reroll.disabled = false; reroll.textContent = "Re-roll"; lab.textContent = v.label + " — re-roll failed: " + e.message; });
    });
    row.appendChild(lab); row.appendChild(au); row.appendChild(use); row.appendChild(reroll);
    return row;
  };
  var openGen = function (btn, path) {
    var r = rowRef(btn); modal.hidden = false;
    var list = modal.querySelector(".vlist"); list.innerHTML = '<div class="spin">Generating variants via ElevenLabs\\u2026</div>';
    fetchVariants(r, path, null).then(function (variants) {
        list.innerHTML = "";
        variants.forEach(function (v) { list.appendChild(variantRow(r, path, v)); });
      })
      .catch(function (e) { list.innerHTML = '<div class="spin"></div>'; list.firstChild.textContent = e.message; });
  };
  document.querySelectorAll("button.gen").forEach(function (btn) { btn.addEventListener("click", function () { openGen(btn, "/generate"); }); });
  document.querySelectorAll("button.gen-kanji").forEach(function (btn) { btn.addEventListener("click", function () { openGen(btn, "/generate-kanji"); }); });
  modal.querySelector(".close").addEventListener("click", closeModal);
  modal.addEventListener("click", function (e) { if (e.target === modal) closeModal(); });
  // Same affordance as the trim modal.
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !modal.hidden) closeModal(); });
})();`;

// Client wiring for the manual trim editor (included when the audio review is editable). Opens a modal
// showing the card's ORIGINAL take as a waveform with draggable start/end handles; Apply cuts that
// range server-side and the result becomes the clip that ships.
//
// The waveform is computed here rather than server-side: the browser already has to fetch the mp3 to
// play it, and decodeAudioData gives the samples for free — no dependency, no extra round trip, no
// peaks file to keep in step with the audio. One clip is decoded per modal open, so a lesson with
// forty cards doesn't decode forty mp3s to render a page.
//
// Vanilla JS, no template literals / ${} (it's embedded in one). Reads deck ctx from #deckctx and each
// row's card id / unit / original URL / saved range from its data-* attributes.
export const AUDIO_TRIM_SCRIPT = `(function () {
  var ctx = document.getElementById("deckctx");
  var modal = document.getElementById("trim-modal");
  if (!ctx || !modal) return;
  if (!window.__ab) return;
  var A = window.__ab;
  var base = A.base, jsonp = A.jsonp, maybeRebuild = A.maybeRebuild, swapInUse = A.swapInUse;
  var PAD = 0.08;        // matches the automatic trim's padSec
  var SPEECH = 0.01;     // amplitude ~= the automatic trim's -40dB noise floor
  var MIN_RANGE = 0.05;  // the server refuses anything shorter

  var wrap = modal.querySelector(".wfwrap");
  var canvas = modal.querySelector("canvas");
  var cutL = modal.querySelector(".wfcut.left");
  var cutR = modal.querySelector(".wfcut.right");
  var hStart = modal.querySelector(".wfhandle.start");
  var hEnd = modal.querySelector(".wfhandle.end");
  var playhead = modal.querySelector(".wfplay");
  var tStart = modal.querySelector(".t-start");
  var tEnd = modal.querySelector(".t-end");
  var tKept = modal.querySelector(".t-kept");
  var msg = modal.querySelector(".trim-msg");
  var revertBtn = modal.querySelector(".trim-revert");
  var audio = new Audio();
  var st = null;

  var fmt = function (n) { return n.toFixed(2) + "s"; };
  var say = function (t, err) { msg.textContent = t || ""; msg.classList.toggle("err", !!err); };

  var draw = function () {
    var dpr = window.devicePixelRatio || 1;
    var w = wrap.clientWidth, h = wrap.clientHeight;
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
    var g = canvas.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    var data = st.samples, mid = h / 2, step = data.length / w;
    g.strokeStyle = "#7a3b36";
    g.lineWidth = 1;
    g.beginPath();
    for (var x = 0; x < w; x++) {
      var from = Math.floor(x * step), to = Math.min(data.length, Math.floor((x + 1) * step));
      var lo = 0, hi = 0;
      for (var i = from; i < to; i++) { var v = data[i]; if (v < lo) lo = v; if (v > hi) hi = v; }
      g.moveTo(x + 0.5, mid - hi * mid * 0.92);
      g.lineTo(x + 0.5, mid - lo * mid * 0.92);
    }
    g.stroke();
    g.strokeStyle = "rgba(35,32,28,.18)";
    g.beginPath(); g.moveTo(0, mid); g.lineTo(w, mid); g.stroke();
  };

  var paint = function () {
    var a = (st.start / st.duration) * 100, b = (st.end / st.duration) * 100;
    cutL.style.left = "0%"; cutL.style.width = a + "%";
    cutR.style.left = b + "%"; cutR.style.width = (100 - b) + "%";
    hStart.style.left = a + "%"; hEnd.style.left = b + "%";
    tStart.textContent = fmt(st.start);
    tEnd.textContent = fmt(st.end);
    tKept.textContent = fmt(st.end - st.start);
  };

  // Where speech starts and stops, by the same standard the automatic trim uses — but applied to BOTH
  // ends, which is the half it never does. A starting point to nudge, not a decision.
  var snap = function () {
    var d = st.samples, rate = st.rate, win = 256;
    var first = -1, last = -1;
    for (var i = 0; i + win <= d.length; i += win) {
      var sum = 0;
      for (var j = i; j < i + win; j++) sum += d[j] * d[j];
      if (Math.sqrt(sum / win) > SPEECH) { if (first < 0) first = i; last = i + win; }
    }
    if (first < 0) { say("no speech found \\u2014 leaving the selection as it is", true); return false; }
    st.start = Math.max(0, first / rate - PAD);
    st.end = Math.min(st.duration, last / rate + PAD);
    paint();
    say("");
    return true;
  };

  var stop = function () { audio.pause(); playhead.classList.remove("on"); };
  var tick = function () {
    if (audio.paused) { playhead.classList.remove("on"); return; }
    if (st.limit != null && audio.currentTime >= st.limit) { stop(); return; }
    playhead.classList.add("on");
    playhead.style.left = (audio.currentTime / st.duration) * 100 + "%";
    window.requestAnimationFrame(tick);
  };
  var play = function (from, to) {
    stop();
    st.limit = to;
    audio.currentTime = from;
    audio.play().then(function () { window.requestAnimationFrame(tick); }).catch(function (e) { say(e.message, true); });
  };

  var drag = function (handle, which) {
    handle.addEventListener("pointerdown", function (e) {
      e.preventDefault();
      handle.setPointerCapture(e.pointerId);
      handle.classList.add("drag");
      var move = function (ev) {
        var box = wrap.getBoundingClientRect();
        var t = ((ev.clientX - box.left) / box.width) * st.duration;
        t = Math.max(0, Math.min(st.duration, t));
        if (which === "start") st.start = Math.min(t, st.end - MIN_RANGE);
        else st.end = Math.max(t, st.start + MIN_RANGE);
        st.start = Math.max(0, st.start);
        st.end = Math.min(st.duration, st.end);
        paint();
      };
      var up = function () {
        handle.classList.remove("drag");
        handle.removeEventListener("pointermove", move);
        handle.removeEventListener("pointerup", up);
        handle.removeEventListener("pointercancel", up);
        commit();
      };
      handle.addEventListener("pointermove", move);
      handle.addEventListener("pointerup", up);
      handle.addEventListener("pointercancel", up);
    });
  };
  drag(hStart, "start");
  drag(hEnd, "end");

  var close = function () { stop(); modal.hidden = true; st = null; };

  var open = function (btn) {
    var tr = btn.closest("tr");
    var url = tr.getAttribute("data-original-url");
    if (!url) { window.alert("This card has no audio to trim."); return; }
    modal.hidden = false;
    say("loading\\u2026");
    revertBtn.hidden = tr.getAttribute("data-trim-start") == null;
    markFilter(tr.getAttribute("data-filter"));
    modal.querySelector(".clean-msg").textContent = "";
    st = { row: tr, cid: tr.getAttribute("data-card-id"), unit: tr.getAttribute("data-unit"), limit: null };
    audio.src = url;
    window.fetch(url)
      .then(function (r) { return r.arrayBuffer(); })
      .then(function (buf) {
        var AC = window.AudioContext || window.webkitAudioContext;
        return new AC().decodeAudioData(buf);
      })
      .then(function (decoded) {
        if (!st) return;
        st.samples = decoded.getChannelData(0);
        st.rate = decoded.sampleRate;
        st.duration = decoded.duration;
        // Where the handles start. A hand cut is authoritative — reopening restores the exact range it
        // was made with, so a selection that came out a shade tight is nudged rather than re-found by
        // ear. Otherwise fall back to where the AUTOMATIC trim currently sits, which matters because
        // trimming happens by default: opening on the full original would misrepresent every card as
        // untrimmed, and dragging from there would silently undo the automatic cut.
        //
        // The automatic trim only ever removes from the END, never the start, so its range is exactly
        // [0, length of the clip in use] — derivable from the page with no stored value, which is what
        // makes this work for clips built before the editor existed.
        var s = parseFloat(tr.getAttribute("data-trim-start"));
        var e = parseFloat(tr.getAttribute("data-trim-end"));
        var settle = function (start, end) {
          if (!st) return;
          st.start = Math.max(0, start);
          st.end = Math.min(st.duration, end);
          if (st.end - st.start < MIN_RANGE) { st.start = 0; st.end = st.duration; }
          draw();
          paint();
          say("");
        };
        if (isFinite(s) && isFinite(e)) { settle(s, e); return; }
        var inUse = tr.querySelector("td.au:not(.au-orig) audio");
        if (!inUse || !inUse.getAttribute("src")) { settle(0, st.duration); return; }
        // Metadata only — the length is all we need, and decoding a second clip per open would be
        // wasted work.
        var probe = new Audio();
        probe.preload = "metadata";
        var done = false;
        var use = function (end) { if (!done) { done = true; settle(0, end); } };
        probe.addEventListener("loadedmetadata", function () {
          use(isFinite(probe.duration) && probe.duration > 0 ? probe.duration : st.duration);
        });
        // A clip that won't report its length must not leave the editor stuck with no handles.
        probe.addEventListener("error", function () { use(st.duration); });
        probe.src = inUse.getAttribute("src");
      })
      .catch(function (e) { say("could not read this clip: " + e.message, true); });
  };

  var postTo = function (t, path, body) {
    return window.fetch(base + "/unit/" + encodeURIComponent(t.unit) + "/card/" + encodeURIComponent(t.cid) + path,
      body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : { method: "POST" })
      .then(jsonp);
  };
  var post = function (path, body) {
    return window.fetch(base + "/unit/" + encodeURIComponent(st.unit) + "/card/" + encodeURIComponent(st.cid) + path,
      body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : { method: "POST" })
      .then(jsonp);
  };

  // Applying is automatic: a drag lands the moment you let go, so the In use player is always what the
  // handles say. The cut is the only thing that could be lost by walking away, and doing it on release
  // (never on pointermove) keeps it to ONE ffmpeg cut per drag rather than one per pixel.
  //
  // Everything the request needs is captured up front, so closing the modal mid-flight cannot orphan
  // it — the row still updates when it lands. A FAILURE, though, would be written into a hidden modal
  // and never seen, so errors also go to the row's own message span.
  var inFlight = false, queued = null, lastSent = null;
  var rowSay = function (tr, text) {
    var m = tr.querySelector(".msg");
    if (m) m.textContent = text;
  };
  // The send path works ENTIRELY from its captured range, never from st — closing the modal
  // nulls st, and the old replay went back through commit(), so the final drag before a quick
  // close was silently dropped while the previous cut stayed applied.
  var sendRange = function (range) {
    if (inFlight) { queued = range; return; }        // land the latest position, not every one
    if (lastSent && lastSent.row === range.row &&
        lastSent.start === range.start && lastSent.end === range.end) return;
    inFlight = true;
    lastSent = range;
    say("applying\\u2026");
    postTo(range, "/audio/trim", { start: range.start, end: range.end }).then(function (x) {
      if (!x.ok) throw new Error(x.j.error || "trim failed");
      swapInUse(range.row, x.j.mediaUrl);
      range.row.setAttribute("data-trim-start", String(range.start));
      range.row.setAttribute("data-trim-end", String(range.end));
      revertBtn.hidden = false;
      say("\\u2713 applied");
      rowSay(range.row, "");
      return maybeRebuild();
    }).catch(function (e) {
      lastSent = null;                                // let the same range be retried
      say(e.message, true);
      // Visible even if the modal was closed while this was in the air.
      rowSay(range.row, "trim failed: " + e.message);
    }).finally(function () {
      inFlight = false;
      if (queued) { var q = queued; queued = null; sendRange(q); }
    });
  };
  var commit = function () {
    if (!st) return;
    sendRange({ row: st.row, start: st.start, end: st.end, unit: st.unit, cid: st.cid });
  };

  revertBtn.addEventListener("click", function () {
    revertBtn.disabled = true;
    say("reverting\\u2026");
    var row = st.row;
    post("/audio/trim/revert").then(function (x) {
      if (!x.ok) throw new Error(x.j.error || "revert failed");
      if (x.j.mediaUrl) swapInUse(row, x.j.mediaUrl);
      row.removeAttribute("data-trim-start");
      row.removeAttribute("data-trim-end");
      close();
      return maybeRebuild();
    }).catch(function (e) { say(e.message, true); }).finally(function () { revertBtn.disabled = false; });
  });

  var markFilter = function (name) {
    modal.querySelectorAll(".clean-btn").forEach(function (b) {
      b.classList.toggle("on", b.getAttribute("data-filter") === (name || "standard"));
    });
  };
  modal.querySelectorAll(".clean-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var name = btn.getAttribute("data-filter");
      var cmsg = modal.querySelector(".clean-msg");
      var row = st.row;
      modal.querySelectorAll(".clean-btn").forEach(function (b) { b.disabled = true; });
      cmsg.textContent = "re-cleaning\u2026"; cmsg.classList.remove("err");
      post("/audio/clean", { filter: name }).then(function (x) {
        if (!x.ok) throw new Error(x.j.error || "clean failed");
        swapInUse(row, x.j.mediaUrl);
        row.setAttribute("data-filter", name);
        // Re-cleaning re-derives from the original, so a saved hand trim is re-cut under the new
        // chain rather than dropped — keep the row's stored range in step with what came back.
        if (x.j.audioTrim) {
          row.setAttribute("data-trim-start", String(x.j.audioTrim.start));
          row.setAttribute("data-trim-end", String(x.j.audioTrim.end));
        } else {
          row.removeAttribute("data-trim-start"); row.removeAttribute("data-trim-end");
        }
        markFilter(name);
        cmsg.textContent = "\u2713 " + name;
        return maybeRebuild();
      }).catch(function (e) { cmsg.textContent = e.message; cmsg.classList.add("err"); })
        .finally(function () { modal.querySelectorAll(".clean-btn").forEach(function (b) { b.disabled = false; }); });
    });
  });
  modal.querySelector(".trim-play-sel").addEventListener("click", function () { play(st.start, st.end); });
  modal.querySelector(".trim-play-all").addEventListener("click", function () { play(0, null); });
  modal.querySelector(".trim-snap").addEventListener("click", function () { if (snap()) commit(); });
  modal.querySelector(".trim-close").addEventListener("click", close);
  modal.addEventListener("click", function (e) { if (e.target === modal) close(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !modal.hidden) close(); });
  document.querySelectorAll("button.trim").forEach(function (btn) {
    btn.addEventListener("click", function () { open(btn); });
  });
})();`;

// Client wiring for the combined Corpus review (included when the first-review section is editable).
// Reads the deck type/id from #deckctx; per-row card id/unit from each <tr>'s data-* attributes.
// Vanilla JS, no ${}. Handles: the per-row Exclude toggle, inline editing of the target/pronunciation
// cells (contentEditable, saved on blur), and the per-section "Mark reviewed" button. All wired to
// the `corpus`-review rows (which carry the translated cards).
export const REVIEW_EDIT_SCRIPT = `(function () {
  var ctx = document.getElementById("deckctx");
  if (!ctx || !window.__ab) return;
  var A = window.__ab;
  var base = A.base, jsonp = A.jsonp;
  // Excluding a card on an ALREADY-DONE lesson (from the audio review) must rebuild the group package so
  // the card leaves the .apkg immediately — same auto-rebuild rule as an audio edit. On a not-yet-done
  // lesson there's nothing to rebuild (Mark done folds the current, excluded-filtered state in).
  var rebuildIfDone = A.maybeRebuild;
  // Exclude toggle — a single icon button (⊘), wired on BOTH the Corpus review and the
  // audio review. aria-pressed carries the state; clicking flips it.
  document.querySelectorAll("button.excl-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var tr = btn.closest("tr");
      var cid = tr.getAttribute("data-card-id"), unit = tr.getAttribute("data-unit");
      var next = btn.getAttribute("aria-pressed") !== "true";
      btn.disabled = true;
      fetch(base + "/unit/" + encodeURIComponent(unit) + "/card/" + encodeURIComponent(cid) + "/review/exclude", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ excluded: next }) })
        .then(jsonp).then(function (x) {
          if (!x.ok) throw new Error(x.j.error || "failed");
          btn.setAttribute("aria-pressed", next ? "true" : "false");
          btn.classList.toggle("on", next);
          btn.title = next ? "Excluded — click to include" : "Exclude this card from the deck";
          tr.classList.toggle("excluded", next);
          A.rowMsg(tr, "");
          return rebuildIfDone();
        })
        .catch(function (e) { A.rowMsg(tr, e.message); })
        .finally(function () { btn.disabled = false; });
    });
  });
  document.querySelectorAll('tr[data-stage="corpus"] td[data-field]').forEach(function (cell) {
    cell.contentEditable = "true"; cell.spellcheck = false;
    var orig = cell.textContent;
    cell.addEventListener("focus", function () { orig = cell.textContent; });
    cell.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); cell.blur(); } });
    cell.addEventListener("blur", function () {
      var val = cell.textContent.trim();
      if (val === orig.trim()) { cell.textContent = val; return; }
      var tr = cell.closest("tr");
      var cid = tr.getAttribute("data-card-id"), unit = tr.getAttribute("data-unit");
      var body = {}; body[cell.getAttribute("data-field")] = val;
      fetch(base + "/unit/" + encodeURIComponent(unit) + "/card/" + encodeURIComponent(cid) + "/review/edit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
        .then(jsonp).then(function (x) { if (!x.ok) throw new Error(x.j.error || "failed"); cell.textContent = val; orig = val; cell.classList.add("saved"); setTimeout(function () { cell.classList.remove("saved"); }, 800); })
        .catch(function (e) { cell.textContent = orig; A.rowMsg(tr, "edit failed: " + e.message); });
    });
  });
  document.querySelectorAll("button.mark-rev").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var unit = btn.getAttribute("data-unit");
      var msg = btn.parentNode.querySelector(".rev-msg");
      btn.disabled = true; if (msg) msg.textContent = "saving\\u2026";
      fetch(base + "/unit/" + encodeURIComponent(unit) + "/review/reviewed", { method: "POST" })
        .then(jsonp).then(function (x) { if (!x.ok) throw new Error(x.j.error || "failed"); if (msg) msg.textContent = "\\u2713 reviewed"; btn.disabled = false; })
        .catch(function (e) { if (msg) msg.textContent = e.message; btn.disabled = false; });
    });
  });
})();`;

// Client wiring for the lesson-level "Mark done" / "Reopen" buttons (the final sign-off in the audio
// review, and reopening a done lesson). Reads deck ctx from #deckctx; unit from data-unit. Reloads on
// success so the lesson moves between In review / Built. Vanilla JS, no ${}.
export const MARK_DONE_SCRIPT = `(function () {
  var ctx = document.getElementById("deckctx");
  if (!ctx || !window.__ab) return;
  var base = window.__ab.base, jsonp = window.__ab.jsonp;
  var wire = function (sel, path, okText) {
    document.querySelectorAll(sel).forEach(function (btn) {
      btn.addEventListener("click", function () {
        var unit = btn.getAttribute("data-unit");
        var msg = btn.parentNode.querySelector(".done-msg");
        btn.disabled = true; if (msg) msg.textContent = "saving\\u2026";
        fetch(base + "/unit/" + encodeURIComponent(unit) + path, { method: "POST" })
          .then(jsonp).then(function (x) {
            if (!x.ok) throw new Error(x.j.error || "failed");
            if (x.j.rebuildError) {
              // The mark landed but the group .apkg did NOT rebuild — say so and stay on the page
              // (an auto-reload would wipe the message and the stale package would go unnoticed).
              if (msg) msg.textContent = okText + " — but deck rebuild FAILED: " + x.j.rebuildError;
              btn.disabled = false;
              return;
            }
            if (msg) msg.textContent = okText;
            setTimeout(function () { location.reload(); }, 500);
          })
          .catch(function (e) { if (msg) msg.textContent = e.message; btn.disabled = false; });
      });
    });
  };
  wire("button.mark-done", "/done", "\\u2713 done");
  wire("button.reopen", "/reopen", "reopened");
  // Sends a mis-clicked corpus sign-off back to the corpus gate (and drops the lesson's dedup
  // library entry server-side) — the corpus-review mirror of Reopen.
  wire("button.unreview", "/review/unreviewed", "sent back to corpus review");
})();`;

// Home-page Reopen buttons on built rows: each carries its own data-type/id/unit (no #deckctx). POSTs
// reopen, then reloads so the lesson moves from Built → In review. The click is stopped so it doesn't
// also follow the row's stretched view link. Vanilla JS, no ${}.
export const HOME_REOPEN_SCRIPT = `(function () {
  document.querySelectorAll("button.home-reopen").forEach(function (btn) {
    btn.addEventListener("click", function (e) {
      e.preventDefault(); e.stopPropagation();
      var label = btn.textContent;
      btn.disabled = true; btn.textContent = "reopening\\u2026";
      var base = "/api/deck/" + encodeURIComponent(btn.getAttribute("data-type")) + "/" + encodeURIComponent(btn.getAttribute("data-id"));
      fetch(base + "/unit/" + encodeURIComponent(btn.getAttribute("data-unit")) + "/reopen", { method: "POST" })
        .then(function (r) { if (!r.ok) throw new Error("reopen failed"); location.reload(); })
        .catch(function (err) { btn.disabled = false; btn.textContent = label; alert(err.message); });
    });
  });
})();`;

// Home-page "Deliver to Anki" button: previews the plan (dry run), asks to confirm, then delivers.
// Talks to POST /api/anki/deliver (?dry=1 for the preview). Synchronous fetch → status text, matching
// the rest of the dashboard (no framework, no streaming).
export const DELIVER_SCRIPT = `(function () {
  var btn = document.getElementById("deliver-anki");
  var status = document.getElementById("deliver-status");
  if (!btn) return;
  function set(m) { status.textContent = m; }
  async function post(dry) {
    var r = await fetch("/api/anki/deliver" + (dry ? "?dry=1" : ""), { method: "POST" });
    var j = await r.json().catch(function () { return {}; });
    if (!r.ok) throw new Error(j.error || ("HTTP " + r.status));
    return j;
  }
  function summarize(rep) {
    var upd = 0, add = 0, amb = 0;
    rep.content.forEach(function (c) { upd += c.updated; add += c.added; amb += c.ambiguous.length; });
    var struct = rep.structure.map(function (s) {
      var ch = [];
      if (s.createModel) ch.push("created");
      if (s.addedFields.length) ch.push("+" + s.addedFields.join(","));
      if (s.templates) ch.push("templates");
      if (s.css) ch.push("css");
      return s.model + ": " + (ch.length ? ch.join(", ") : "current");
    }).join("; ");
    return upd + " fields updated, " + add + " cards added" + (amb ? (", " + amb + " ambiguous (skipped)") : "") + ". Note type — " + struct + ".";
  }
  btn.addEventListener("click", async function () {
    btn.disabled = true;
    try {
      set("Previewing\\u2026");
      var plan = await post(true);
      if (!window.confirm("Deliver to Anki?\\n\\n" + summarize(plan) + "\\n\\nEvery managed deck is backed up (with scheduling) first. Proceed?")) {
        set("Cancelled."); btn.disabled = false; return;
      }
      set("Delivering\\u2026");
      var done = await post(false);
      var msg2 = "Delivered. " + summarize(done);
      if (done.syncedAfter === true) msg2 += " Synced with AnkiWeb.";
      else if (done.syncedAfter === false) msg2 += " Sync FAILED (" + (done.syncError || "") + ") \\u2014 sync manually.";
      if (done.schemaChanged) msg2 += " Note-type changed: click 'Upload to AnkiWeb' in Anki to finish the full sync.";
      set(msg2 + " Backup: " + done.backupDir);
    } catch (e) {
      set("Failed: " + e.message);
    }
    btn.disabled = false;
  });
})();`;

// The AI-suggested / Uncertain provenance badges (shown at EVERY review stage). `excluded` is not
// included here — an excluded row is already shown struck-through.
const aiBadge = `<span class="badge badge-ai">AI-suggested</span>`;
const uncertainBadge = `<span class="badge badge-uncertain">Uncertain</span>`;
// The automatic trim could not cut the TTS end marker off this card's clip — it is audible in the
// shipping take until the reviewer replaces or re-generates the audio.
const markerStuckBadge = `<span class="badge badge-marker">Marker audible</span>`;
const provenanceBadges = (c) =>
  [
    c.aiSuggested ? aiBadge : "",
    c.uncertain ? uncertainBadge : "",
    c.audioMarkerStuck ? markerStuckBadge : "",
  ]
    .filter(Boolean)
    .join(" ");
// Inline block under a card's English gloss (corpus/audio reviews, which have no Flags column).
const inlineFlags = (c) => {
  const b = provenanceBadges(c);
  return b ? `<div class="rowflags">${b}</div>` : "";
};
// A centered ✓ (or —) for a boolean provenance column. An excluded row is already
// shown struck-through, so it isn't repeated as a badge here.
const tick = (on) => (on ? `<span class="tick">✓</span>` : `<span class="x">—</span>`);
const jpOrDash = (v) => (v ? escapeHtml(v) : `<span class="x">—</span>`);

// Per-stage table shape: the <colgroup>, the <thead> row, and the trailing <td>s after the shared
// leading `#` cell. The `audio` preset is byte-identical to the original layout (so the static
// deck-view artifact and existing callers are unchanged); `audioCell(c)` is only consulted there.
// Per-stage table shape: the <colgroup>, the <thead> row, and the trailing <td>s after the shared
// leading `#` cell. The `audio` preset is byte-identical to the original layout (so the static
// deck-view artifact and existing callers are unchanged). `ctx.audioCell(c)` is consulted by the
// audio stage; `ctx.rowControl(stage, c)` (optional) injects an editor control into a row's Exclude
// cell — omitted for a read-only render.
const rowExtra = (ctx, stage, c) => (ctx.rowControl ? ctx.rowControl(stage, c) : "");
const STAGE_TABLES = {
  audio: {
    cols: `<col class="c-num"><col class="c-en"><col class="c-jp"><col class="c-pron"><col class="c-au"><col class="c-hint"><col class="c-note">`,
    head: `<th class="num">#</th><th>English</th><th>Japanese</th><th>Romaji</th><th>Audio</th><th>Hint</th><th>Note</th>`,
    cells: (c, ctx) =>
      `<td class="en">${escapeHtml(c.english)}${c.category ? `<div class="cat">${escapeHtml(c.category)}</div>` : ""}${inlineFlags(c)}</td>
  <td class="jp">${escapeHtml(c.target)}</td>
  <td class="pron">${escapeHtml(c.pronunciation)}</td>
  ${ctx.originalCell ? `<td class="au au-orig">${ctx.originalCell(c)}</td>\n  ` : ""}<td class="au">${ctx.audioCell(c)}</td>
  <td class="hint-col">${c.hint ? escapeHtml(c.hint) : ""}</td>
  <td class="note">${c.note ? escapeHtml(c.note) : ""}</td>`,
  },
  // A lesson whose build never finished — corpus.json but no cards.json, so there is no target to
  // check and nothing to sign off. READ-ONLY, and not one of the two review stages: it renders only so
  // you can see what was extracted before re-running the build. No Exclude column here.
  incomplete: {
    cols: `<col class="c-num"><col class="c-en"><col class="c-cat"><col class="c-hint"><col class="c-note"><col class="c-flag"><col class="c-flag">`,
    head: `<th class="num">#</th><th>English</th><th>Category</th><th>Hint</th><th>Note</th><th class="ctr">AI-suggested</th><th class="ctr">Uncertain</th>`,
    cells: (c) =>
      `<td class="en">${escapeHtml(c.english)}</td>
  <td class="cat-col">${escapeHtml(c.category)}</td>
  <td class="hint-col">${c.hint ? escapeHtml(c.hint) : ""}</td>
  <td class="note">${c.note ? escapeHtml(c.note) : ""}</td>
  <td class="ctr">${tick(c.aiSuggested)}</td>
  <td class="ctr">${tick(c.uncertain)}</td>`,
  },
  // The "Corpus" review — the FIRST of the two review stages: English + target + pronunciation
  // together, so you verify the list AND the translation at one gate. English-first, then Category,
  // then the inline-editable Target / Pronunciation, then Note, the AI / Uncertain provenance ticks,
  // and the Exclude checkbox.
  corpus: {
    cols: `<col class="c-num"><col class="c-en"><col class="c-cat"><col class="c-jp"><col class="c-pron"><col class="c-hint"><col class="c-note"><col class="c-flag"><col class="c-flag"><col class="c-excl">`,
    head: `<th class="num">#</th><th>English</th><th>Category</th><th>Target</th><th>Pronunciation</th><th>Hint</th><th>Note</th><th class="ctr">AI-suggested</th><th class="ctr">Uncertain</th><th></th>`,
    cells: (c, ctx) =>
      `<td class="en">${escapeHtml(c.english)}</td>
  <td class="cat-col">${escapeHtml(c.category)}</td>
  <td class="jp" data-field="target">${jpOrDash(c.target)}</td>
  <td class="pron" data-field="pronunciation">${escapeHtml(c.pronunciation)}</td>
  <td class="hint-col">${c.hint ? escapeHtml(c.hint) : ""}</td>
  <td class="note">${c.note ? escapeHtml(c.note) : ""}</td>
  <td class="ctr">${tick(c.aiSuggested)}</td>
  <td class="ctr">${tick(c.uncertain)}</td>
  <td class="excl-cell">${rowExtra(ctx, "corpus", c)}</td>`,
  },
};

const cardRow = (c, n, stage, ctx) => {
  const spec = STAGE_TABLES[stage] || STAGE_TABLES.audio;
  // The trim editor reads its source clip and any saved range straight off the row, so opening the
  // modal costs no extra request. Only emitted where the editor is wired (originalCell present).
  const trimAttrs =
    ctx.originalCell && c.originalUrl
      ? ` data-original-url="${escapeHtml(c.originalUrl)}"` +
        (c.audioTrim && Number.isFinite(c.audioTrim.start) && Number.isFinite(c.audioTrim.end)
          ? ` data-trim-start="${escapeHtml(String(c.audioTrim.start))}" data-trim-end="${escapeHtml(String(c.audioTrim.end))}"`
          : "") +
        (c.audioFilter ? ` data-filter="${escapeHtml(c.audioFilter)}"` : "")
      : "";
  const attrs =
    `${c.id ? ` data-card-id="${escapeHtml(c.id)}"` : ""}` +
    `${c.unit != null ? ` data-unit="${escapeHtml(String(c.unit))}"` : ""}` +
    ` data-stage="${escapeHtml(stage)}"` +
    trimAttrs;
  // The audio-stage review gains an Exclude cell too, but only when editable (rowControl present) — the
  // read-only Browse view / artifact pass no rowControl, so their audio table stays untouched. The
  // corpus table already carries its own excl cell inside spec.cells.
  const auExcl =
    stage === "audio" && ctx.rowControl
      ? `\n  <td class="excl-cell">${rowExtra(ctx, "audio", c)}</td>`
      : "";
  // Internal review-only note (why a card is uncertain / AI-suggested). Rightmost column, and ONLY in
  // the dashboard review (showReviewNote) — never the read-only Browse view / artifact / deck.
  const rnote = ctx.showReviewNote
    ? `\n  <td class="rnote">${c.reviewNote ? escapeHtml(c.reviewNote) : ""}</td>`
    : "";
  return `<tr class="row${c.excluded ? " excluded" : ""}"${attrs}>
  <td class="num">${n}</td>
  ${spec.cells(c, ctx)}${auExcl}${rnote}
</tr>`;
};

/**
 * Renders the deck's units as collapsible <details> sections (collapsed by default). Each section may
 * carry a `stage` (`incomplete` | `corpus` | `audio`, default `audio`) that picks its column layout; the
 * `audio` layout uses the caller's `audioCell(card)`. Optional `rowControl(stage, card)` injects a
 * per-row editor control; optional `sectionControl(section)` a per-section toolbar (both omitted for a
 * read-only render). Numbering is global and continues from `startNumber`.
 *
 * Optional `originalCell(card)` adds a SECOND audio column, in front of the shipping one, showing the
 * card's untouched take. Only the dashboard's audio review passes it: the read-only Browse view and the
 * `view-deck` artifact are about what the deck sounds like, not how it got there, so they keep exactly
 * one audio column and render byte-identically to before.
 * @returns {{ html: string, endNumber: number }}
 */
export function renderLessonSections({
  sections,
  startNumber = 1,
  audioCell,
  originalCell,
  rowControl,
  sectionControl,
  open = false,
  showReviewNote = false,
}) {
  const ctx = { audioCell, originalCell, rowControl, showReviewNote };
  let n = startNumber - 1;
  const html = sections
    .map((s) => {
      const stage = s.stage || "audio";
      const spec = STAGE_TABLES[stage] || STAGE_TABLES.audio;
      const from = n + 1;
      const rows = s.cards.map((c) => cardRow(c, ++n, stage, ctx)).join("");
      const range = s.cards.length ? `${from}–${n}` : "—";
      const tools = sectionControl ? sectionControl(s) : "";
      // Editable audio review adds a trailing Exclude column; keep it off the read-only audio layout.
      const auExcl = stage === "audio" && !!ctx.rowControl;
      // …and a leading Original column, so the reviewer can hear what the trim was applied to. It goes
      // in front of the shipping clip's column, which the `audio` spec already declares.
      const auOrig = stage === "audio" && !!ctx.originalCell;
      const specCols = auOrig
        ? spec.cols.replace('<col class="c-au">', '<col class="c-au"><col class="c-au">')
        : spec.cols;
      const specHead = auOrig
        ? spec.head.replace("<th>Audio</th>", "<th>Original</th><th>In use</th>")
        : spec.head;
      const cols =
        specCols +
        (auExcl ? `<col class="c-excl">` : "") +
        (showReviewNote ? `<col class="c-rnote">` : "");
      const head =
        specHead + (auExcl ? `<th></th>` : "") + (showReviewNote ? `<th>Review note</th>` : "");
      // The audio table has an AUTO-width Note column; once the Exclude / Review-note columns are added
      // it collapses to ~0 and its text breaks one char per line. `tbl-wide` gives that crowded case
      // explicit px widths + a min-width so it scrolls in its .tw wrapper instead of crushing.
      const wide = stage === "audio" && (auExcl || showReviewNote);
      const tblClass = `tbl tbl-${stage}${wide ? " tbl-wide" : ""}${auOrig ? " tbl-twoau" : ""}`;
      return `<details class="lesson"${open ? " open" : ""}><summary><span class="st">${escapeHtml(s.leaf)}</span><span class="cnt">${s.cards.length} cards · ${range}</span></summary>
  ${tools ? `<div class="sec-tools">${tools}</div>\n  ` : ""}<div class="tw"><table class="${tblClass}"><colgroup>${cols}</colgroup>
  <thead><tr>${head}</tr></thead>
  <tbody>${rows}</tbody></table></div></details>`;
    })
    .join("\n");
  return { html, endNumber: n };
}

// Clears a STALE build claim (the server refuses if the build is actually still live), so a
// crashed build never leaves a lesson wedged.
export const CLEAR_CLAIM_SCRIPT = `
document.querySelectorAll(".clear-claim").forEach((btn) => {
  btn.addEventListener("click", async () => {
    btn.disabled = true;
    const res = await fetch(location.pathname.replace(/\\/review\\//, "/api/deck/").replace(/\\/([^/]+)$/, "/unit/$1/claim/clear"), { method: "POST" });
    if (res.ok) location.reload();
    else { btn.disabled = false; btn.textContent = "Could not clear"; }
  });
});
`;
