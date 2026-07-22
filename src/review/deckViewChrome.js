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
col.c-num{width:48px}col.c-en{width:24%}col.c-jp{width:22%}col.c-pron{width:15%}col.c-au{width:180px}col.c-note{width:auto}
col.c-cat{width:13%}col.c-flags{width:150px}col.c-flag{width:120px}col.c-excl{width:104px}
/* Flag-bearing stages (corpus / translate) mix an auto NOTE column with several fixed-px columns; on a
   narrow viewport the auto column collapses to ~0 and its header spills onto the next one. Give every
   column a real px width and the table a min-width, so it scrolls in its .tw wrapper instead of crushing. */
table.tbl-corpus{min-width:900px}
.tbl-corpus col.c-num{width:44px}.tbl-corpus col.c-en{width:260px}.tbl-corpus col.c-cat{width:150px}.tbl-corpus col.c-note{width:196px}.tbl-corpus col.c-flag{width:125px}
table.tbl-translate{min-width:1160px}
.tbl-translate col.c-num{width:44px}.tbl-translate col.c-en{width:210px}.tbl-translate col.c-cat{width:130px}.tbl-translate col.c-jp{width:200px}.tbl-translate col.c-pron{width:150px}.tbl-translate col.c-note{width:120px}.tbl-translate col.c-flag{width:106px}.tbl-translate col.c-excl{width:100px}
/* Audio review with the extra Exclude / Review-note columns: the base audio table's AUTO Note column
   would collapse, so give the whole table explicit px widths + a min-width (scrolls in .tw). Only the
   crowded review render gets this class — the read-only 6-column audio browse/artifact is untouched. */
table.tbl-audio.tbl-wide{min-width:1240px}
.tbl-audio.tbl-wide col.c-num{width:44px}.tbl-audio.tbl-wide col.c-en{width:210px}.tbl-audio.tbl-wide col.c-jp{width:190px}.tbl-audio.tbl-wide col.c-pron{width:140px}.tbl-audio.tbl-wide col.c-au{width:150px}.tbl-audio.tbl-wide col.c-note{width:200px}.tbl-audio.tbl-wide col.c-excl{width:60px}.tbl-audio.tbl-wide col.c-rnote{width:246px}
th.ctr,td.ctr{text-align:center}.tick{color:#5c7a52;font-weight:700}
tbody td{padding:11px 12px;border-bottom:1px solid var(--rule);vertical-align:top;overflow-wrap:anywhere}
tbody tr:hover td{background:rgba(122,59,54,.045)}
td.num{color:var(--faint);font-variant-numeric:tabular-nums;white-space:nowrap}
td.en{font-size:14px}.cat{font-size:10.5px;text-transform:uppercase;letter-spacing:.04em;color:var(--faint);margin-top:3px}
td.jp{font-family:var(--jp);font-size:21px;line-height:1.4}
td.pron{font-family:var(--mono);font-size:12px;color:var(--soft)}
td.au audio{height:30px;width:168px}.x{color:var(--faint)}
td.note{font-size:12px;color:var(--soft)}
/* Review-only internal note (uncertainty / AI-suggestion rationale) — visually set apart (amber,
   italic) from the user-facing card Note so a reviewer never confuses the two. Never shown in the deck. */
col.c-rnote{width:220px}
td.rnote{font-size:11.5px;color:#8a6a24;font-style:italic}
td.cat-col{font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:var(--soft)}
.badge{display:inline-block;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;padding:2px 7px;border-radius:100px;border:1px solid var(--rule2);color:var(--soft);white-space:nowrap}
.badge-drop{color:var(--accent);border-color:var(--accent)}
.badge-ai{color:#3f6f6a;border-color:#3f6f6a}.badge-uncertain{color:#8a6a24;border-color:#8a6a24}
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
.dblock{border:1px solid var(--rule2);border-radius:10px;background:var(--card);padding:14px 16px;margin-top:14px}
.grp-review .dblock{border-left:3px solid var(--accent)}
.grp-built .dblock{border-left:3px solid #5c7a52}
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
/* A built row: the label link stretches over the whole row (click → open the view), while the Reopen
   button sits above it (z-index) so it's independently clickable. */
.urow-built{position:relative}
.urow-built .urow-link{flex:1 1 auto;text-decoration:none;color:inherit;min-width:0}
.urow-built .urow-link::after{content:"";position:absolute;inset:0}
.urow-built .ustage.done{position:relative;z-index:1}
.home-reopen{position:relative;z-index:1;font:inherit;font-size:11.5px;color:var(--accent);background:var(--card);border:1px solid var(--rule2);border-radius:100px;padding:3px 12px;cursor:pointer;white-space:nowrap}
.home-reopen:hover{border-color:var(--accent)}
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
/* editor: corpus/translate review controls */
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
// Generate (ElevenLabs variants in a modal → Use this). There is ONE package per group (the book/course
// merge, or a template's own deck) and rebuilds are FULLY AUTOMATIC — no manual button. After every
// successful edit the group auto-rebuilds, but ONLY when this lesson is already done (data-done="1"),
// so the on-disk .apkg stays current without pointless whole-book rebuilds while you're still finishing
// a fresh lesson (Mark done rebuilds it in). Auditioning is via the inline players; there is no download
// — the dashboard is local, the .apkg is already on disk.
export const DECK_EDIT_SCRIPT = `(function () {
  var ctx = document.getElementById("deckctx");
  if (!ctx) return;
  var type = ctx.getAttribute("data-type");
  var id = ctx.getAttribute("data-id");
  var base = "/api/deck/" + encodeURIComponent(type) + "/" + encodeURIComponent(id);
  var rebuildUrl = base + "/rebuild"; // always the group package
  var isDone = ctx.getAttribute("data-done") === "1";
  var status = document.getElementById("rebuild-status");
  var setStatus = function (t) { if (status) status.textContent = t; };
  var jsonp = function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); };
  var rowRef = function (el) {
    var tr = el.closest("tr");
    return { tr: tr, cid: tr.getAttribute("data-card-id"), unit: tr.getAttribute("data-unit"),
             msg: tr.querySelector(".msg") };
  };
  var swap = function (tr, url) {
    var cell = tr.querySelector("td.au");
    var a = cell.querySelector("audio");
    if (a) { a.src = url; return; }
    var na = document.createElement("audio"); na.controls = true; na.preload = "none"; na.src = url;
    var x = cell.querySelector(".x"); if (x) { x.replaceWith(na); } else { cell.insertBefore(na, cell.firstChild); }
  };
  var rebuild = function () {
    setStatus("rebuilding\\u2026");
    return fetch(rebuildUrl, { method: "POST" }).then(jsonp).then(function (x) {
      if (!x.ok) throw new Error(x.j.error || "rebuild failed");
      setStatus("\\u2713 deck rebuilt (" + x.j.noteCount + " cards)");
    }).catch(function (e) { setStatus("rebuild failed: " + e.message); });
  };
  // After an edit: auto-rebuild the group, but only if this lesson is already part of it (done). A
  // not-yet-done lesson isn't in the deck, so Mark done is what folds it in (and rebuilds then).
  var maybeRebuild = function () { return isDone ? rebuild() : Promise.resolve(); };
  document.querySelectorAll("input.repl").forEach(function (inp) {
    inp.addEventListener("change", function () {
      var f = inp.files[0]; if (!f) return;
      var r = rowRef(inp); var ext = (f.name.split(".").pop() || "mp3").toLowerCase();
      if (r.msg) r.msg.textContent = "uploading…";
      fetch(base + "/unit/" + encodeURIComponent(r.unit) + "/card/" + encodeURIComponent(r.cid) + "/audio?ext=" + encodeURIComponent(ext), { method: "POST", body: f })
        .then(jsonp).then(function (x) { if (!x.ok) throw new Error(x.j.error || "upload failed"); swap(r.tr, x.j.mediaUrl); if (r.msg) r.msg.textContent = "\\u2713 replaced"; return maybeRebuild(); })
        .catch(function (e) { if (r.msg) r.msg.textContent = e.message; });
      inp.value = "";
    });
  });
  var modal = document.getElementById("gen-modal");
  var closeModal = function () { modal.hidden = true; modal.querySelector(".vlist").innerHTML = ""; };
  var openGen = function (btn, path) {
    var r = rowRef(btn); modal.hidden = false;
    var list = modal.querySelector(".vlist"); list.innerHTML = '<div class="spin">Generating variants via ElevenLabs\\u2026</div>';
    fetch(base + "/unit/" + encodeURIComponent(r.unit) + "/card/" + encodeURIComponent(r.cid) + path, { method: "POST" })
      .then(jsonp).then(function (x) {
        if (!x.ok) throw new Error(x.j.error || "generation failed");
        list.innerHTML = "";
        x.j.variants.forEach(function (v) {
          var row = document.createElement("div"); row.className = "vrow";
          var lab = document.createElement("span"); lab.className = "vlabel"; lab.textContent = v.kanji ? v.label + " — " + v.kanji : v.label;
          var au = document.createElement("audio"); au.controls = true; au.preload = "none"; au.src = v.mediaUrl;
          var use = document.createElement("button"); use.textContent = "Use this";
          use.addEventListener("click", function () {
            fetch(base + "/unit/" + encodeURIComponent(r.unit) + "/card/" + encodeURIComponent(r.cid) + "/audio/select", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ audio: v.audio }) })
              .then(jsonp).then(function (y) { if (!y.ok) throw new Error(y.j.error || "select failed"); swap(r.tr, y.j.mediaUrl); closeModal(); if (r.msg) r.msg.textContent = "\\u2713 generated"; return maybeRebuild(); })
              .catch(function (e) { alert(e.message); });
          });
          row.appendChild(lab); row.appendChild(au); row.appendChild(use); list.appendChild(row);
        });
      })
      .catch(function (e) { list.innerHTML = '<div class="spin"></div>'; list.firstChild.textContent = e.message; });
  };
  document.querySelectorAll("button.gen").forEach(function (btn) { btn.addEventListener("click", function () { openGen(btn, "/generate"); }); });
  document.querySelectorAll("button.gen-kanji").forEach(function (btn) { btn.addEventListener("click", function () { openGen(btn, "/generate-kanji"); }); });
  modal.querySelector(".close").addEventListener("click", closeModal);
  modal.addEventListener("click", function (e) { if (e.target === modal) closeModal(); });
})();`;

// Client wiring for the combined Corpus review (included when the first-review section is editable).
// Reads the deck type/id from #deckctx; per-row card id/unit from each <tr>'s data-* attributes.
// Vanilla JS, no ${}. Handles: the per-row Exclude toggle, inline editing of the target/pronunciation
// cells (contentEditable, saved on blur), and the per-section "Mark reviewed" button. All wired to
// the `translate` file-stage rows (which carry the translated cards).
export const REVIEW_EDIT_SCRIPT = `(function () {
  var ctx = document.getElementById("deckctx");
  if (!ctx) return;
  var base = "/api/deck/" + encodeURIComponent(ctx.getAttribute("data-type")) + "/" + encodeURIComponent(ctx.getAttribute("data-id"));
  var jsonp = function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); };
  // Excluding a card on an ALREADY-DONE lesson (from the audio review) must rebuild the group package so
  // the card leaves the .apkg immediately — same auto-rebuild rule as an audio edit. On a not-yet-done
  // lesson there's nothing to rebuild (Mark done folds the current, excluded-filtered state in).
  var isDone = ctx.getAttribute("data-done") === "1";
  var status = document.getElementById("rebuild-status");
  var rebuildIfDone = function () {
    if (!isDone) return Promise.resolve();
    if (status) status.textContent = "rebuilding\\u2026";
    return fetch(base + "/rebuild", { method: "POST" }).then(jsonp).then(function (x) {
      if (status) status.textContent = x.ok ? "\\u2713 deck rebuilt (" + x.j.noteCount + " cards)" : "rebuild failed: " + (x.j.error || "");
    });
  };
  // Exclude toggle — a single icon button (⊘), wired on BOTH the translate (Corpus) review and the
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
          return rebuildIfDone();
        })
        .catch(function (e) { alert(e.message); })
        .finally(function () { btn.disabled = false; });
    });
  });
  document.querySelectorAll('tr[data-stage="translate"] td[data-field]').forEach(function (cell) {
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
        .catch(function (e) { cell.textContent = orig; alert(e.message); });
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
  if (!ctx) return;
  var base = "/api/deck/" + encodeURIComponent(ctx.getAttribute("data-type")) + "/" + encodeURIComponent(ctx.getAttribute("data-id"));
  var jsonp = function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); };
  var wire = function (sel, path, okText) {
    document.querySelectorAll(sel).forEach(function (btn) {
      btn.addEventListener("click", function () {
        var unit = btn.getAttribute("data-unit");
        var msg = btn.parentNode.querySelector(".done-msg");
        btn.disabled = true; if (msg) msg.textContent = "saving\\u2026";
        fetch(base + "/unit/" + encodeURIComponent(unit) + path, { method: "POST" })
          .then(jsonp).then(function (x) { if (!x.ok) throw new Error(x.j.error || "failed"); if (msg) msg.textContent = okText; setTimeout(function () { location.reload(); }, 500); })
          .catch(function (e) { if (msg) msg.textContent = e.message; btn.disabled = false; });
      });
    });
  };
  wire("button.mark-done", "/done", "\\u2713 done");
  wire("button.reopen", "/reopen", "reopened");
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

// The AI-suggested / Uncertain provenance badges (shown at EVERY review stage). `excluded` is not
// included here — an excluded row is already shown struck-through.
const aiBadge = `<span class="badge badge-ai">AI-suggested</span>`;
const uncertainBadge = `<span class="badge badge-uncertain">Uncertain</span>`;
const provenanceBadges = (c) =>
  [c.aiSuggested ? aiBadge : "", c.uncertain ? uncertainBadge : ""].filter(Boolean).join(" ");
// Inline block under a card's English gloss (translate/audio stages, which have no Flags column).
const inlineFlags = (c) => {
  const b = provenanceBadges(c);
  return b ? `<div class="rowflags">${b}</div>` : "";
};
// A centered ✓ (or —) for a boolean provenance column (corpus stage). An excluded row is already
// shown struck-through, so it isn't repeated as a badge here.
const tick = (on) => (on ? `<span class="tick">✓</span>` : `<span class="x">—</span>`);
const jpOrDash = (v) => (v ? escapeHtml(v) : `<span class="x">—</span>`);

// Per-stage table shape: the <colgroup>, the <thead> row, and the trailing <td>s after the shared
// leading `#` cell. The `audio` preset is byte-identical to the original layout (so the static
// deck-view artifact and existing callers are unchanged); `audioCell(c)` is only consulted there.
// Per-stage table shape: the <colgroup>, the <thead> row, and the trailing <td>s after the shared
// leading `#` cell. The `audio` preset is byte-identical to the original layout (so the static
// deck-view artifact and existing callers are unchanged). `ctx.audioCell(c)` is consulted by the
// audio stage; `ctx.rowControl(stage, c)` (optional) injects an editor control into the corpus Flags
// cell / translate Note cell — omitted for a read-only render.
const rowExtra = (ctx, stage, c) => (ctx.rowControl ? ctx.rowControl(stage, c) : "");
const STAGE_TABLES = {
  audio: {
    cols: `<col class="c-num"><col class="c-en"><col class="c-jp"><col class="c-pron"><col class="c-au"><col class="c-note">`,
    head: `<th class="num">#</th><th>English</th><th>Japanese</th><th>Romaji</th><th>Audio</th><th>Note</th>`,
    cells: (c, ctx) =>
      `<td class="en">${escapeHtml(c.english)}${c.category ? `<div class="cat">${escapeHtml(c.category)}</div>` : ""}${inlineFlags(c)}</td>
  <td class="jp">${escapeHtml(c.target)}</td>
  <td class="pron">${escapeHtml(c.pronunciation)}</td>
  <td class="au">${ctx.audioCell(c)}</td>
  <td class="note">${c.cardNote ? escapeHtml(c.cardNote) : ""}</td>`,
  },
  // Pre-translate placeholder — READ-ONLY. A corpus.json-only lesson isn't reviewable yet (no target
  // to check); the combined Corpus review happens post-translate (the `translate` preset below). No
  // Exclude column here.
  corpus: {
    cols: `<col class="c-num"><col class="c-en"><col class="c-cat"><col class="c-note"><col class="c-flag"><col class="c-flag">`,
    head: `<th class="num">#</th><th>English</th><th>Category</th><th>Note</th><th class="ctr">AI-suggested</th><th class="ctr">Uncertain</th>`,
    cells: (c) =>
      `<td class="en">${escapeHtml(c.english)}</td>
  <td class="cat-col">${escapeHtml(c.category)}</td>
  <td class="note">${c.cardNote ? escapeHtml(c.cardNote) : ""}</td>
  <td class="ctr">${tick(c.aiSuggested)}</td>
  <td class="ctr">${tick(c.uncertain)}</td>`,
  },
  // The combined "Corpus" review (first review step): English + target + pronunciation together, so
  // you verify the list AND the translation at one gate. English-first, then Category, then the
  // inline-editable Target / Pronunciation, then Note, the AI / Uncertain provenance ticks, and the
  // Exclude checkbox.
  translate: {
    cols: `<col class="c-num"><col class="c-en"><col class="c-cat"><col class="c-jp"><col class="c-pron"><col class="c-note"><col class="c-flag"><col class="c-flag"><col class="c-excl">`,
    head: `<th class="num">#</th><th>English</th><th>Category</th><th>Target</th><th>Pronunciation</th><th>Note</th><th class="ctr">AI-suggested</th><th class="ctr">Uncertain</th><th></th>`,
    cells: (c, ctx) =>
      `<td class="en">${escapeHtml(c.english)}</td>
  <td class="cat-col">${escapeHtml(c.category)}</td>
  <td class="jp" data-field="target">${jpOrDash(c.target)}</td>
  <td class="pron" data-field="pronunciation">${escapeHtml(c.pronunciation)}</td>
  <td class="note">${c.cardNote ? escapeHtml(c.cardNote) : ""}</td>
  <td class="ctr">${tick(c.aiSuggested)}</td>
  <td class="ctr">${tick(c.uncertain)}</td>
  <td class="excl-cell">${rowExtra(ctx, "translate", c)}</td>`,
  },
};

const cardRow = (c, n, stage, ctx) => {
  const spec = STAGE_TABLES[stage] || STAGE_TABLES.audio;
  const attrs =
    `${c.id ? ` data-card-id="${escapeHtml(c.id)}"` : ""}` +
    `${c.unit != null ? ` data-unit="${escapeHtml(String(c.unit))}"` : ""}` +
    ` data-stage="${escapeHtml(stage)}"`;
  // The audio-stage review gains an Exclude cell too, but only when editable (rowControl present) — the
  // read-only Browse view / artifact pass no rowControl, so their audio table stays untouched. The
  // translate table already carries its own excl cell inside spec.cells.
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
 * carry a `stage` (`corpus` | `translate` | `audio`, default `audio`) that picks its column layout; the
 * `audio` layout uses the caller's `audioCell(card)`. Optional `rowControl(stage, card)` injects a
 * per-row editor control; optional `sectionControl(section)` a per-section toolbar (both omitted for a
 * read-only render). Numbering is global and continues from `startNumber`.
 * @returns {{ html: string, endNumber: number }}
 */
export function renderLessonSections({
  sections,
  startNumber = 1,
  audioCell,
  rowControl,
  sectionControl,
  open = false,
  showReviewNote = false,
}) {
  const ctx = { audioCell, rowControl, showReviewNote };
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
      const cols =
        spec.cols +
        (auExcl ? `<col class="c-excl">` : "") +
        (showReviewNote ? `<col class="c-rnote">` : "");
      const head =
        spec.head + (auExcl ? `<th></th>` : "") + (showReviewNote ? `<th>Review note</th>` : "");
      // The audio table has an AUTO-width Note column; once the Exclude / Review-note columns are added
      // it collapses to ~0 and its text breaks one char per line. `tbl-wide` gives that crowded case
      // explicit px widths + a min-width so it scrolls in its .tw wrapper instead of crushing.
      const wide = stage === "audio" && (auExcl || showReviewNote);
      const tblClass = `tbl tbl-${stage}${wide ? " tbl-wide" : ""}`;
      return `<details class="lesson"${open ? " open" : ""}><summary><span class="st">${escapeHtml(s.leaf)}</span><span class="cnt">${s.cards.length} cards · ${range}</span></summary>
  ${tools ? `<div class="sec-tools">${tools}</div>\n  ` : ""}<div class="tw"><table class="${tblClass}"><colgroup>${cols}</colgroup>
  <thead><tr>${head}</tr></thead>
  <tbody>${rows}</tbody></table></div></details>`;
    })
    .join("\n");
  return { html, endNumber: n };
}
