// Page renderers for the deck dashboard: the home page (renderDashboard), the
// guided review view (renderReviewPage) and the read-only browse view
// (renderDeckPage). The functions moved verbatim out of createDeckServer in
// src/server/index.js; there they closed over the server's injected deps, so this
// module keeps them as a factory taking those same values via a context object.
import { existsSync } from "fs";
import { join as pathJoin, dirname as pathDirname } from "path";
import {
  escapeHtml,
  renderLessonSections,
  DASH_PRELUDE_SCRIPT,
  EXPAND_COLLAPSE_SCRIPT,
  DECK_EDIT_SCRIPT,
  REVIEW_EDIT_SCRIPT,
  MARK_DONE_SCRIPT,
  HOME_REOPEN_SCRIPT,
  DELIVER_SCRIPT,
  CLEAR_CLAIM_SCRIPT,
  AUDIO_TRIM_SCRIPT,
} from "../review/deckViewChrome.js";
import { DELIVERED_MARKER } from "../anki/deliver.js";
import { INCOMPLETE } from "./adapters/stage.js";
import { describeReadiness } from "../cards/readiness.js";
import { cleanupNames } from "../audio/cleanupFilter.js";
import { page } from "./respond.js";

const TYPE_LABEL = { book: "Book", course: "Course", template: "Template" };

export function createPageRenderers({
  outputRoot,
  adapters,
  adapterFor,
  editable,
  resolveIso639Code,
  mediaUrl,
}) {
  // The home page splits by STATUS at the SUB-DECK (lesson) level: "Not finished" (the build stopped
  // before there were any cards to review), "In review" (at one of the two review gates, not yet marked
  // done) and "Built" (done lessons) — with each deck's lessons grouped under its heading. A deck with
  // lessons in several states appears (grouped) in each. Actions are per-lesson and link to the
  // unit-scoped views.
  function renderDashboard() {
    const decks = adapters.flatMap((a) => a.listDecks(outputRoot));
    if (decks.length === 0) {
      return page(
        "Decks — anki-builder",
        `<header><div class="eyebrow">Deck dashboard · anki-builder</div><h1>Your decks</h1>
<p class="lede">No decks found under <code>${escapeHtml(outputRoot)}</code>. Assemble one first, then reload this page.</p></header>`,
      );
    }
    const enc = encodeURIComponent;
    const withUnits = decks.map((d) => {
      const adapter = adapterFor(d.type);
      // Status rows only — skip materializing a render card for every item of every lesson.
      const full = adapter?.loadDeck
        ? adapter.loadDeck(outputRoot, d.id, { includeCards: false })
        : null;
      const units = ((full && full.units) || []).map((u) => ({
        seq: u.seq,
        label: u.label,
        stage: u.stage || "audio",
        done: !!u.done,
        ready: u.ready !== false,
        missing: u.missing || [],
        building: !!u.building,
        interrupted: !!u.interrupted,
        claim: u.claim || null,
      }));
      // A deck delivered over AnkiConnect carries a marker beside its .apkg (see deliver.js):
      // re-importing the package into that collection would create duplicate notes, so the
      // heading warns before anyone reaches for drag-and-drop.
      const deckFile = adapter?.deckFile ? adapter.deckFile(outputRoot, d.id) : null;
      const managed = deckFile
        ? existsSync(pathJoin(pathDirname(deckFile), DELIVERED_MARKER))
        : false;
      return {
        type: d.type,
        id: d.id,
        title: (full && full.title) || d.title,
        lang: d.targetLanguage,
        total: units.length,
        units,
        managed,
      };
    });

    // Every lesson row / single-unit block links to the unit-scoped review (a superset of read-only
    // browse: cards + inline players, plus Replace/Generate and Mark done/Reopen). The WHOLE row is the
    // link (see .urow / .dblock.single in the CSS) — there's no separate Open/Review button.
    const unitUrl = (deck, u) => `/review/${enc(deck.type)}/${enc(deck.id)}/${enc(u.seq)}`;
    const deckMeta = (deck) =>
      [TYPE_LABEL[deck.type] || deck.type, deck.lang ? escapeHtml(deck.lang.toUpperCase()) : null]
        .filter(Boolean)
        .join(" · ");
    const deckBlock = (deck, units, mode) => {
      const managedChip = deck.managed
        ? `<span class="dm" title="Delivered via AnkiConnect — push updates with Deliver to Anki. Re-importing the .apkg into that collection creates duplicate notes.">· AnkiConnect-managed</span>`
        : "";
      const head = `<div class="dbhead"><span class="dt">${escapeHtml(deck.title)}</span><span class="dm">${deckMeta(deck)}</span>${managedChip}</div>`;
      const reopenBtn = (u) =>
        `<button type="button" class="home-reopen" data-type="${escapeHtml(deck.type)}" data-id="${escapeHtml(deck.id)}" data-unit="${escapeHtml(String(u.seq))}">Reopen</button>`;
      // A single-unit deck (template) has no meaningful sub-decks — the whole block is the link. When
      // it's built, the block gets a Reopen button too (same stretched-link + button-above pattern).
      // A single-lesson deck renders as one block with no per-unit row, so any badge that says this
      // lesson is NOT simply sitting at a review — building, interrupted, or an unfinished build — has
      // to hang off the block itself or it would never be shown.
      const buildBadge = (u) =>
        u.building
          ? `<span class="ustage building">building (${escapeHtml(u.claim?.stage || "?")})</span>`
          : u.interrupted
            ? `<span class="ustage interrupted">interrupted</span>`
            : u.stage === INCOMPLETE
              ? `<span class="ustage">${INCOMPLETE}</span>`
              : u.stage === "corpus" && !u.ready
                ? `<span class="ustage">prepare unfinished</span>`
                : "";
      if (deck.total === 1) {
        const u = units[0];
        if (mode === "built" && editable)
          return `<div class="dblock single dbreopen"><a class="dblock-link" href="${unitUrl(deck, u)}">${head}</a>${buildBadge(u)}${reopenBtn(u)}</div>`;
        return `<a class="dblock single" href="${unitUrl(deck, u)}">${head}${buildBadge(u)}</a>`;
      }
      const rows = units
        .map((u) => {
          const url = unitUrl(deck, u);
          const label = escapeHtml(u.label);
          // A built row gets a Reopen button (editable server only) so a finished lesson can be pushed
          // back into review straight from the home page — no need to open it first. The whole row still
          // opens the view via a stretched link; the button sits above it (z-index) and stops the click.
          if (mode === "built" && editable) {
            return `<div class="urow urow-built"><a class="urow-link" href="${url}"><span class="ulabel">${label}</span></a><span class="ustage done">done</span>${reopenBtn(u)}</div>`;
          }
          if (u.building) {
            return `<a class="urow" href="${url}"><span class="ulabel">${label}</span><span class="ustage building">building (${escapeHtml(u.claim?.stage || "?")})</span></a>`;
          }
          if (u.interrupted) {
            return `<a class="urow" href="${url}"><span class="ulabel">${label}</span><span class="ustage interrupted">interrupted</span></a>`;
          }
          // The badge IS the stage name — the two review stages are called `corpus` and `audio`
          // everywhere: on disk, in the code, and here. A lesson held back for an un-run pass says
          // which one instead, since "corpus" would imply it was waiting on the reviewer.
          const badge =
            mode === "built"
              ? "done"
              : u.stage === "corpus" && !u.ready
                ? "prepare unfinished"
                : escapeHtml(u.stage);
          return `<a class="urow" href="${url}"><span class="ulabel">${label}</span><span class="ustage${mode === "built" ? " done" : ""}">${badge}</span></a>`;
        })
        .join("");
      return `<div class="dblock">${head}${rows}</div>`;
    };

    // Three buckets, and the first one is not a review. A lesson whose build stopped before cards.json
    // has nothing to sign off — listing it under "In review" is what let a lesson with no translations
    // masquerade as a reviewable deck. It gets its own section naming the command that finishes it.
    const unfinishedBlocks = [];
    const reviewBlocks = [];
    const builtBlocks = [];
    let unfinishedCount = 0;
    let reviewCount = 0;
    let builtCount = 0;
    for (const deck of withUnits) {
      // "Not finished" is about whether the PIPELINE has completed, not about which file exists: a
      // lesson with no cards at all and a lesson whose enrichment passes never ran are the same kind
      // of not-ready, and neither belongs in front of a reviewer. That keeps "In review" meaning
      // exactly one thing — a lesson a human can actually sign off.
      // Readiness gates the FIRST review only. A lesson at the audio stage is past that gate by
      // definition (the audio stage refuses to run until it's signed off), so it is never held back
      // here whatever its markers say.
      const prepared = (u) => u.stage !== INCOMPLETE && (u.stage !== "corpus" || u.ready);
      const unfinished = deck.units.filter((u) => !prepared(u) && !u.done);
      const inReview = deck.units.filter((u) => prepared(u) && !u.done);
      const built = deck.units.filter((u) => prepared(u) && u.done);
      if (unfinished.length) {
        unfinishedBlocks.push(deckBlock(deck, unfinished, "unfinished"));
        unfinishedCount += unfinished.length;
      }
      if (inReview.length) {
        reviewBlocks.push(deckBlock(deck, inReview, "review"));
        reviewCount += inReview.length;
      }
      if (built.length) {
        builtBlocks.push(deckBlock(deck, built, "built"));
        builtCount += built.length;
      }
    }

    const section = (cls, title, hint, blocks, count) =>
      blocks.length
        ? `<div class="grp ${cls}"><h2>${title} <span class="gcount">${count}</span></h2><p class="ghint">${hint}</p>${blocks.join("")}</div>`
        : "";

    // Deliver all built lessons to the live Anki collection via AnkiConnect (editable server only).
    // Previews (dry run) and backs up before writing — see src/anki/deliver.js.
    const deliverBar = editable
      ? `<div class="deliverbar"><button type="button" id="deliver-anki">Deliver to Anki</button><span id="deliver-status" class="deliver-status"></span></div>`
      : "";

    return page(
      "Decks — anki-builder",
      `<header><div class="eyebrow">Deck dashboard · anki-builder</div><h1>Your decks</h1>
<p class="lede"><b>${reviewCount}</b> lesson${reviewCount === 1 ? "" : "s"} in review · <b>${builtCount}</b> built${unfinishedCount ? ` · <b>${unfinishedCount}</b> unfinished` : ""}.</p>${deliverBar}</header>
${section("grp-unfinished", "Not finished", "These lessons stopped mid-build and have no cards to review yet. Re-run <code>anki-builder assemble</code> for the lesson (it picks up where it left off), or <code>anki-builder prepare --run &lt;dir&gt;</code> directly.", unfinishedBlocks, unfinishedCount)}
${section("grp-review", "In review", "Lessons awaiting one of the two review gates — corpus, then audio. Continue each lesson's review.", reviewBlocks, reviewCount)}
${section("grp-built", "Built · ready to study", "Finished (marked done) lessons — folded into the deck's single .apkg. Open one to play its cards, or Reopen it to edit.", builtBlocks, builtCount)}`,
      editable ? `${HOME_REOPEN_SCRIPT}\n${DELIVER_SCRIPT}` : null,
    );
  }

  // The REVIEW view (/review/:type/:id): the guided per-stage workflow across the two review gates —
  // corpus (English + target + pronunciation) then audio — with exclude / edit / mark-reviewed /
  // generate / rebuild controls when the server is editable. A lesson whose build never finished
  // (INCOMPLETE) renders read-only here with the command that completes it. (Browsing a finished deck
  // read-only is renderDeckPage below.)
  function renderReviewPage(type, id, unit = null) {
    const adapter = adapterFor(type);
    const deck = adapter ? adapter.loadDeck(outputRoot, id) : null;
    if (!deck) return null;
    // Unit-scoped review renders a single lesson; deck-level renders all of them.
    const units =
      unit != null ? deck.units.filter((u) => String(u.seq) === String(unit)) : deck.units;
    if (units.length === 0) return null;

    // A DONE lesson opens as a read-only VIEW (players you can listen to, plus a Reopen button) — no
    // exclude, no Replace/Generate/rebuild. Editing requires Reopen first (which pushes it back into the
    // review flow). So audio editing unlocks only when EVERY rendered unit is at the audio stage AND
    // none is done. Deck-level: a mixed book stays read-only. Unit-scoped: a single in-review audio
    // lesson is editable even when its siblings aren't — so you can finalize one lesson at a time.
    const allAudio = units.every((u) => (u.stage || "audio") === "audio");
    const anyDone = units.some((u) => u.done);
    const allDone = units.every((u) => u.done);
    // A lesson a CLI stage is actively writing renders READ-ONLY: the stage will rewrite
    // cards.json when it finishes, so any edit made now would be silently discarded.
    const anyBuilding = units.some((u) => u.building);
    const canEdit = editable && units.length > 0 && allAudio && !anyDone && !anyBuilding;
    // "Viewing" = a finished (all-done) lesson opened read-only. The header + lede reflect view vs review.
    const viewing = allDone;

    // The Corpus review — the first gate (editable: exclude / edit / mark reviewed).
    const hasReview = units.some((u) => (u.stage || "audio") === "corpus");
    const hasAudio = units.some((u) => (u.stage || "audio") === "audio");
    // Kana+kanji audio variants are Japanese-only (they generate a kanji orthography from the kana
    // reading), so the button only appears for a ja deck.
    const isJa = resolveIso639Code(adapter.deckLanguage?.(outputRoot, id)) === "ja";

    const sections = units.map((u) => ({
      leaf: u.label,
      stage: u.stage || "audio",
      seq: u.seq,
      reviewed: !!u.reviewed,
      done: !!u.done,
      ready: u.ready !== false,
      missing: u.missing || [],
      reason: u.reason || null,
      numberIssues: u.numberIssues || [],
      cards: u.cards.map((c) => ({
        ...c,
        unit: u.seq,
        stage: u.stage || "audio",
        audioUrl: c.audio ? mediaUrl(type, id, u.seq, c.audio) : null,
        // The take the trim editor cuts from. Falls back to the shipping clip for cards generated
        // before originals were kept — still trimmable, just not widenable past the automatic cut.
        originalUrl: c.audioOriginal
          ? mediaUrl(type, id, u.seq, c.audioOriginal)
          : c.audio
            ? mediaUrl(type, id, u.seq, c.audio)
            : null,
      })),
    }));
    // Replace / Generate mint a NEW recording, so they live with the Original — that column is what
    // they change. Trim only ever re-cuts an existing one, so it sits with the clip it produces.
    const editControls = canEdit
      ? `<div class="ed"><label class="btn">Replace<input type="file" class="repl" accept="audio/*" hidden></label><button type="button" class="gen">Generate</button>${isJa ? `<button type="button" class="gen-kanji">Generate (kanji)</button>` : ""}<span class="msg"></span></div>`
      : "";
    const player = (url) =>
      url ? `<audio controls preload="none" src="${url}"></audio>` : `<span class="x">—</span>`;
    const audioCell = (c) =>
      player(c.audioUrl) +
      (canEdit && c.originalUrl
        ? `<div class="ed"><button type="button" class="trim">Edit</button></div>`
        : "");
    // Only the editable review shows the Original column; passing undefined leaves the read-only
    // Browse view and the view-deck artifact with their single audio column, exactly as before.
    const originalCell = canEdit ? (c) => player(c.originalUrl) + editControls : undefined;
    // The Corpus review's write-back (exclude / inline edit) works per-section whenever the server is
    // editable — independent of the all-audio `canEdit` gate, which only governs audio editing + the
    // global rebuild. Both review stages are editable; an INCOMPLETE lesson is read-only (there is
    // nothing to sign off on yet).
    // Exclude is available on BOTH review stages: the Corpus review AND the audio review — so you can
    // drop a card late without going back to the Corpus review (which is meant to be one-and-done).
    // Excluding a done lesson's card rebuilds the deck (see REVIEW_EDIT_SCRIPT). Exclude shows on the
    // Corpus review always, and on the audio review ONLY while the lesson is in review (not done). A
    // done lesson is view-only — Reopen it to exclude a card.
    const rowControl =
      editable && !anyBuilding
        ? (stage, c) =>
            stage === "corpus" || (stage === "audio" && !anyDone)
              ? `<button type="button" class="excl-btn${c.excluded ? " on" : ""}" aria-pressed="${c.excluded ? "true" : "false"}" title="${c.excluded ? "Excluded — click to include" : "Exclude this card from the deck"}">⊘</button><span class="msg"></span>`
              : ""
        : undefined;
    const sectionControl =
      editable && !anyBuilding
        ? (s) => {
            // Not a review stage at all: the build stopped before cards.json existed, so there is
            // nothing to sign off. Name the command that finishes it.
            if (s.stage === INCOMPLETE)
              return `<span class="hint">This lesson's build didn't finish — no cards to review yet. Run <code>anki-builder prepare --run &lt;dir&gt;</code> (or re-run <code>assemble</code>) to complete it.</span>`;
            // Combined Corpus review (English + target + pronunciation): the first sign-off. `reviewed`
            // gates the `audio` step. A lesson whose pre-review passes haven't all run gets no button
            // at all — signing it off would mean approving a card set that is still going to change.
            if (s.stage === "corpus") {
              if (!s.ready) {
                // A numeral problem is fixable right here — `reading` and `pronunciation` are both
                // inline-editable — so name the cards instead of sending them to the CLI.
                if (s.numberIssues.length > 0 && s.missing.length === 0)
                  return `<span class="hint">Not ready to review — ${escapeHtml(describeReadiness(s))}: ${s.numberIssues.map((n) => `<code>${escapeHtml(n.target)}</code>`).join(", ")}. Edit the Pronunciation cell to spell the number out, and this clears.</span>`;
                return `<span class="hint">Not ready to review — ${escapeHtml(describeReadiness(s))}. Run <code>anki-builder prepare --run &lt;dir&gt;</code> to finish it.</span>`;
              }
              return `<button type="button" class="mark-rev" data-unit="${escapeHtml(String(s.seq))}">Mark reviewed</button><span class="rev-msg">${s.reviewed ? "✓ reviewed" : ""}</span>`;
            }
            // Audio stage: the final "Mark done" sign-off (or Reopen a done lesson). Only done lessons
            // ship in the merged deck.
            if (s.stage === "audio")
              return s.done
                ? `<span class="done-badge">✓ done</span> <button type="button" class="reopen" data-unit="${escapeHtml(String(s.seq))}">Reopen</button><span class="done-msg"></span>`
                : `<button type="button" class="mark-done" data-unit="${escapeHtml(String(s.seq))}">Mark done</button> <button type="button" class="unreview" data-unit="${escapeHtml(String(s.seq))}">Unreview</button><span class="done-msg"></span>`;
            return "";
          }
        : undefined;
    const { html: sectionHtml } = renderLessonSections({
      sections,
      startNumber: 1,
      audioCell,
      originalCell,
      rowControl,
      sectionControl,
      // Review opens a lesson to work on it — render its cards expanded, no expand/collapse chrome.
      open: true,
      // The internal Review-note column shows ONLY while actually reviewing (not on a done lesson's
      // read-only View), and never in Browse/artifact/deck.
      showReviewNote: !viewing,
    });

    const total = units.reduce((n, u) => n + u.cards.length, 0);
    const withAudio = units.reduce((n, u) => n + u.cards.filter((c) => c.audio).length, 0);
    // Rebuilds are fully automatic (see DECK_EDIT_SCRIPT) — there's no manual button. `anyDone` tells
    // the client whether an audio edit should auto-rebuild (only when a lesson in view is already part
    // of the package); it's carried on #deckctx. The toolbar keeps just a status line for feedback.
    const toolbar = canEdit ? `<span id="rebuild-status" class="rb"></span>` : "";
    const modal = canEdit
      ? `<div id="gen-modal" class="modal" hidden><div class="modal-box"><h3>Generated variants</h3><p class="sub">Audition and pick one to use for this card, or cancel to keep the current clip.</p><div class="vlist"></div><div class="modal-foot"><button type="button" class="close">Cancel</button></div></div></div>
<div id="trim-modal" class="modal" hidden><div class="modal-box"><h3>Edit audio</h3><p class="sub">This is the card's <b>original</b> recording, with the edges set to where the clip in use is currently trimmed. Drag them to change what is kept — the shaded parts are cut. Each drag is applied as soon as you let go, replacing the clip in use; the original is never changed.</p>
<div class="wfwrap"><canvas></canvas><div class="wfcut left"></div><div class="wfcut right"></div><div class="wfplay"></div><div class="wfhandle start"></div><div class="wfhandle end"></div></div>
<div class="trimtimes"><span>Start <b class="t-start">—</b></span><span>End <b class="t-end">—</b></span><span>Keeping <b class="t-kept">—</b></span></div>
<div class="trimbar"><button type="button" class="trim-play-sel">▶ Selection</button><button type="button" class="trim-play-all">▶ Original</button><button type="button" class="trim-snap">Snap to speech</button><span class="trim-msg"></span></div>
<div class="trimbar cleanbar"><span class="cleanlabel">Noise cleanup</span>${cleanupNames()
          .map(
            (n) =>
              `<button type="button" class="clean-btn" data-filter="${escapeHtml(n)}">${escapeHtml(n)}</button>`,
          )
          .join(
            "",
          )}<button type="button" class="clean-btn" data-filter="off">off</button><span class="clean-msg"></span></div>
<div class="trimbar"><button type="button" class="trim-revert" hidden>Revert to automatic</button><button type="button" class="trim-close primary">Close</button></div>
<p class="trimnote">Automatic trimming only ever cuts the end of a clip, so leading silence always survives it — and a cut that went too far can only be recovered here, from the original. <b>Noise cleanup</b> runs before the trim and is applied to the clip in use, not to the original above — switch chains if the default leaves rumble behind or thins the voice.</p></div></div>`
      : "";
    const lessonWord = `lesson${units.length === 1 ? "" : "s"}`;
    const lede = canEdit
      ? `<b>${total}</b> cards across <b>${units.length}</b> ${lessonWord}. Play a card's audio inline; <b>Replace</b> uploads a clip, <b>Generate</b> synthesizes variants to pick from, <b>Exclude</b> drops a card. Edits rebuild the deck's <code>.apkg</code> automatically — just re-import it.`
      : viewing
        ? `<b>${total}</b> cards across <b>${units.length}</b> ${lessonWord}, <b>${withAudio}</b> with audio. A finished ${units.length === 1 ? "lesson" : "set"} — read-only. Play any clip; <b>Reopen</b> a lesson to make changes.`
        : `<b>${total}</b> cards across <b>${units.length}</b> ${lessonWord}, expanded below for review. <b>${withAudio}</b> have audio.`;
    // Names the stage and when it started, so "why can't I edit this?" answers itself. A stale
    // claim instead offers a Clear button — a crashed build must never leave a lesson stuck.
    const buildBanner = units
      .filter((u) => u.building || u.interrupted)
      .map((u) =>
        u.building
          ? `<div class="build-banner">⚡ <b>${escapeHtml(u.label)}</b> is being built (${escapeHtml(u.claim?.stage || "?")}, started ${escapeHtml(u.claim?.startedAt || "?")}). Editing is disabled until it finishes.</div>`
          : `<div class="build-banner interrupted">⚠ <b>${escapeHtml(u.label)}</b>: a ${escapeHtml(u.claim?.stage || "?")} build was interrupted (started ${escapeHtml(u.claim?.startedAt || "?")}). Editing is available again.${editable ? ` <button type="button" class="clear-claim" data-unit="${u.seq}">Clear</button>` : ""}</div>`,
      )
      .join("");

    const body = `<header><a class="back" href="/">← All decks</a>
<div class="eyebrow" style="margin-top:12px">${viewing ? "View" : "Review"} · anki-builder</div>
<h1>${escapeHtml(deck.title)}</h1>
<p class="lede">${lede}${viewing ? "" : ` <a class="back" href="/deck/${encodeURIComponent(type)}/${encodeURIComponent(id)}">Browse (read-only) →</a>`}</p>
${buildBanner}
${toolbar ? `<div class="bar">${toolbar}</div>` : ""}
</header>
${editable ? `<div id="deckctx" data-type="${escapeHtml(type)}" data-id="${escapeHtml(id)}" data-done="${anyDone ? "1" : "0"}" hidden></div>` : ""}
${sectionHtml}
${modal}
<footer>Served locally by anki-builder. Audio streams from the deck's build folder.</footer>`;
    // Review renders lessons expanded with no expand/collapse buttons, so EXPAND_COLLAPSE_SCRIPT is
    // not needed here (it still drives the read-only Browse view below).
    const scripts = [];
    if (canEdit) scripts.push(DECK_EDIT_SCRIPT);
    // The trim editor lives in the same editable audio review as Replace/Generate.
    if (canEdit) scripts.push(AUDIO_TRIM_SCRIPT);
    // REVIEW_EDIT_SCRIPT wires the Exclude toggle + the Corpus-review inline-edit cells. It's only
    // needed where those controls render: the Corpus review, or an editable (in-review) audio
    // review. A done, view-only lesson shows neither, so it isn't loaded there.
    if (editable && !anyBuilding && (hasReview || canEdit)) scripts.push(REVIEW_EDIT_SCRIPT);
    if (buildBanner.includes("clear-claim")) scripts.push(CLEAR_CLAIM_SCRIPT);
    // MARK_DONE_SCRIPT wires Mark done AND Reopen, so it loads for any audio-stage lesson (done or not).
    if (editable && hasAudio) scripts.push(MARK_DONE_SCRIPT);
    // The shared prelude (window.__ab) must load before any of the scripts above — they all lean
    // on it for jsonp / the rebuild-if-done helper / audio-cell swaps.
    if (scripts.length > 0) scripts.unshift(DASH_PRELUDE_SCRIPT);
    const script = scripts.join("\n");
    return page(`${deck.title} — ${viewing ? "view" : "review"}`, body, script);
  }

  // The BROWSE view (/deck/:type/:id): a read-only look at a deck's cards + audio. No edit controls,
  // no review write-back — all editing lives in the Review view above.
  function renderDeckPage(type, id, unit = null) {
    const adapter = adapterFor(type);
    const deck = adapter ? adapter.loadDeck(outputRoot, id) : null;
    if (!deck) return null;
    const units =
      unit != null ? deck.units.filter((u) => String(u.seq) === String(unit)) : deck.units;
    if (units.length === 0) return null;

    const sections = units.map((u) => ({
      leaf: u.label,
      stage: u.stage || "audio",
      cards: u.cards.map((c) => ({
        ...c,
        unit: u.seq,
        stage: u.stage || "audio",
        audioUrl: c.audio ? mediaUrl(type, id, u.seq, c.audio) : null,
      })),
    }));
    const audioCell = (c) =>
      c.audioUrl
        ? `<audio controls preload="none" src="${c.audioUrl}"></audio>`
        : `<span class="x">—</span>`;
    const { html: sectionHtml } = renderLessonSections({ sections, startNumber: 1, audioCell });

    const total = units.reduce((n, u) => n + u.cards.length, 0);
    const withAudio = units.reduce((n, u) => n + u.cards.filter((c) => c.audio).length, 0);
    const body = `<header><a class="back" href="/">← All decks</a>
<div class="eyebrow" style="margin-top:12px">Browse · anki-builder</div>
<h1>${escapeHtml(deck.title)}</h1>
<p class="lede"><b>${total}</b> cards across <b>${units.length}</b> lesson${units.length === 1 ? "" : "s"}, <b>${withAudio}</b> with audio. Read-only. <a class="back" href="/review/${encodeURIComponent(type)}/${encodeURIComponent(id)}">Review / edit →</a></p>
<div class="bar"><button type="button" id="xall">Expand all</button><button type="button" id="call">Collapse all</button></div>
</header>
${sectionHtml}
<footer>Served locally by anki-builder. Audio streams from the deck's build folder.</footer>`;
    return page(`${deck.title} — browse`, body, EXPAND_COLLAPSE_SCRIPT);
  }

  return { renderDashboard, renderReviewPage, renderDeckPage };
}
