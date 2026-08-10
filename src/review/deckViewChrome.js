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
/* Scene cue (front of BOTH directions) — slightly stronger than the hint below it. */
td.hint-col .scene-cue{color:var(--soft)}
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
.dblock a.dt{color:inherit;text-decoration:none}
.dblock a.dt:hover{color:var(--accent);text-decoration:underline}
.dblock .dm{font-size:11px;color:var(--faint);text-transform:uppercase;letter-spacing:.04em;margin-left:10px}
/* Whole-deck spot-check link: the deck-level review with every lesson's cards on one page. */
.dball{margin-left:auto;font-size:12px;font-weight:600;color:var(--accent);text-decoration:none;white-space:nowrap}
.dball:hover{text-decoration:underline}
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
.deliverbar{margin-top:14px;display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.deliver-anki{font:inherit;font-size:13px;font-weight:600;color:#fff;background:var(--accent);border:1px solid var(--accent);border-radius:100px;padding:6px 16px;cursor:pointer}
.deliver-anki:hover{filter:brightness(1.06)}
.deliver-anki:disabled{opacity:.55;cursor:default}
.deliver-status{font-size:12.5px;color:var(--faint)}
/* The slim pinned bar: fixed at the top, hidden until STICKY_HEADER_SCRIPT reveals it once the full
   header scrolls out. z-index above the stretched-link rows (1), below the modals (20). */
.topbar{position:fixed;top:0;left:0;right:0;z-index:10;display:flex;align-items:center;gap:14px;padding:9px 4vw;background:var(--paper);border-bottom:1px solid var(--rule2);transform:translateY(-100%);transition:transform .15s ease}
.topbar.on{transform:translateY(0)}
.topbar a.back{flex:0 0 auto;white-space:nowrap}
.topbar .tb-title{font-family:var(--serif);font-size:15px;flex:1 1 auto;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.topbar .deliver-anki{flex:0 0 auto;font-size:12px;padding:4px 12px}
.topbar .deliver-status{flex:0 1 auto;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
/* A single-unit deck block is itself the link. */
.dblock.single{display:block;text-decoration:none;color:inherit;cursor:pointer}
.dblock.single:hover{border-color:var(--accent)}
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

// The client-side script constants moved to clientScripts.js; re-exported here so
// every existing importer keeps working unchanged.
export {
  EXPAND_COLLAPSE_SCRIPT,
  DASH_PRELUDE_SCRIPT,
  DECK_EDIT_SCRIPT,
  AUDIO_TRIM_SCRIPT,
  REVIEW_EDIT_SCRIPT,
  MARK_DONE_SCRIPT,
  STICKY_HEADER_SCRIPT,
  DELIVER_SCRIPT,
  CLEAR_CLAIM_SCRIPT,
} from "./clientScripts.js";

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
// Scene (front of both directions) stacked above Hint (Production front only) in the shared column.
const hintCell = (c) =>
  `<td class="hint-col">${c.scene ? `<div class="scene-cue" title="Scene — front of both directions">${escapeHtml(c.scene)}</div>` : ""}${c.hint ? escapeHtml(c.hint) : ""}</td>`;
const STAGE_TABLES = {
  audio: {
    cols: `<col class="c-num"><col class="c-en"><col class="c-jp"><col class="c-pron"><col class="c-au"><col class="c-hint"><col class="c-note">`,
    head: `<th class="num">#</th><th>English</th><th>Japanese</th><th>Romaji</th><th>Audio</th><th>Hint</th><th>Note</th>`,
    cells: (c, ctx) =>
      `<td class="en">${escapeHtml(c.english)}${c.category ? `<div class="cat">${escapeHtml(c.category)}</div>` : ""}${inlineFlags(c)}</td>
  <td class="jp">${escapeHtml(c.target)}</td>
  <td class="pron">${escapeHtml(c.pronunciation)}</td>
  ${ctx.originalCell ? `<td class="au au-orig">${ctx.originalCell(c)}</td>\n  ` : ""}<td class="au">${ctx.audioCell(c)}</td>
  ${hintCell(c)}
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
  ${hintCell(c)}
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
  ${hintCell(c)}
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
