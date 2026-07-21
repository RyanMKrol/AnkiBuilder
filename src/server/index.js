import http from "node:http";
import { Buffer } from "buffer";
import { createReadStream, statSync, realpathSync, existsSync } from "fs";
import { resolve, sep, join } from "path";
import {
  escapeHtml,
  DECK_VIEW_CSS,
  fontFaceRule,
  renderLessonSections,
  EXPAND_COLLAPSE_SCRIPT,
  DECK_EDIT_SCRIPT,
  CORPUS_EDIT_SCRIPT,
  TRANSLATE_EDIT_SCRIPT,
  MARK_DONE_SCRIPT,
} from "../review/deckViewChrome.js";
import { ADAPTERS } from "./adapters/index.js";
import {
  getLanguageFont as defaultGetLanguageFont,
  readFontBytes as defaultReadFontBytes,
} from "../deck/fontLibrary.js";
import { applyCardAudio, selectCardAudio } from "./adapters/applyCardAudio.js";
import { setCorpusItemExcluded, markCorpusReviewed } from "./adapters/applyCorpus.js";
import { setCardExcluded, editCard, setLessonDone } from "./adapters/applyCards.js";
import { saveChapterCorpus as defaultSaveChapterCorpus } from "../corpus/epubLibrary.js";
import { rebuildRunDir } from "../deck/rebuild.js";
import { generateCardVariants } from "../audio/generateVariants.js";
import { generateCardKanjiVariants } from "../audio/generateKanjiVariants.js";
import { runClaude as defaultRunClaude } from "../translate/runClaude.js";
import { fetchElevenLabsTts } from "../audio/elevenLabsTts.js";
import { getDefaultVoice as defaultGetDefaultVoice } from "../audio/voiceLibrary.js";
import { resolveIso639Code as defaultResolveIso639Code } from "../model/iso639.js";
import { httpError } from "../util/httpError.js";

// Local deck-dashboard server. Lists every built deck (via the format adapters) and renders per-deck
// collapsible lesson views in the same editorial style as the deck-view artifact — but serving audio
// over HTTP (`/media/...`) instead of base64, so an entire deck browses on one page with no size cap.
// Node builtins only; server-side rendered; dependency-injected for testing.

const TYPE_LABEL = { book: "Book", course: "Course", template: "Template" };

function page(title, body, script = null) {
  return `<title>${escapeHtml(title)}</title>
<style>
${fontFaceRule({ url: "/assets/font.woff2" })}
${DECK_VIEW_CSS}
</style>
<div class="wrap">
${body}
</div>${script ? `\n<script>\n${script}\n</script>` : ""}`;
}

function sendHtml(res, body, status = 200) {
  res.writeHead(status, { "Content-Type": "text/html; charset=utf-8" });
  res.end(body);
}
function sendJson(res, obj, status = 200) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(obj));
}
const notFound = (res) =>
  sendHtml(res, page("Not found", `<header><h1>404 — not found</h1></header>`), 404);
const forbidden = (res, message = "forbidden") => sendJson(res, { error: message }, 403);

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

// Reads a request body into a Buffer, capping memory at `cap`. On overflow it STOPS buffering but
// keeps draining the stream to its end (rather than destroying the socket, which resets the client
// mid-upload), then rejects 413 — so the client reliably receives the error response.
function readBodyCapped(req, cap) {
  return new Promise((resolvePromise, reject) => {
    const chunks = [];
    let size = 0;
    let over = false;
    req.on("data", (chunk) => {
      if (over) return;
      size += chunk.length;
      if (size > cap) {
        over = true;
        chunks.length = 0;
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () =>
      over ? reject(httpError(413, "upload too large")) : resolvePromise(Buffer.concat(chunks)),
    );
    req.on("error", reject);
  });
}

export function createDeckServer({
  outputRoot = "output",
  adapters = ADAPTERS,
  editable = true,
  getLanguageFont = defaultGetLanguageFont,
  readFontBytes = defaultReadFontBytes,
  getDefaultVoice = defaultGetDefaultVoice,
  resolveIso639Code = defaultResolveIso639Code,
  fetchTts = fetchElevenLabsTts,
  voice = null,
  getApiKey = () => process.env.ELEVENLABS_API_KEY,
  saveChapterCorpus = defaultSaveChapterCorpus,
  runClaude = defaultRunClaude,
} = {}) {
  const adapterFor = (type) => adapters.find((a) => a.type === type) || null;

  // The home page splits by STATUS at the SUB-DECK (lesson) level: two sections — "In review" (lessons
  // not yet marked done) and "Built" (done lessons) — with each deck's lessons grouped under its
  // heading. A deck with lessons in both states appears (grouped) in both sections. Actions are
  // per-lesson and link to the unit-scoped views.
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
    const stageWord = (s) =>
      s === "corpus" ? "corpus" : s === "translate" ? "translation" : "audio";

    const withUnits = decks.map((d) => {
      const adapter = adapterFor(d.type);
      const full = adapter && adapter.loadDeck ? adapter.loadDeck(outputRoot, d.id) : null;
      const units = ((full && full.units) || []).map((u) => {
        const unitDir =
          adapter && adapter.unitDir ? adapter.unitDir(outputRoot, d.id, u.seq) : null;
        return {
          seq: u.seq,
          label: u.label,
          stage: u.stage || "audio",
          done: !!u.done,
          apkg: unitDir ? existsSync(join(unitDir, "deck.apkg")) : false,
        };
      });
      return {
        type: d.type,
        id: d.id,
        title: (full && full.title) || d.title,
        lang: d.targetLanguage,
        total: units.length,
        units,
      };
    });

    const unitActions = (deck, u, mode) => {
      const rurl = `/review/${enc(deck.type)}/${enc(deck.id)}/${enc(u.seq)}`;
      const burl = `/deck/${enc(deck.type)}/${enc(deck.id)}/${enc(u.seq)}`;
      const durl = `/download/${enc(deck.type)}/${enc(deck.id)}/${enc(u.seq)}/deck.apkg`;
      return mode === "review"
        ? `<a class="da primary" href="${rurl}">Review →</a>`
        : `<a class="da primary" href="${burl}">Browse</a>${u.apkg ? `<a class="da" href="${durl}">Download</a>` : ""}<a class="da" href="${rurl}">Edit audio</a>`;
    };
    const deckMeta = (deck) =>
      [TYPE_LABEL[deck.type] || deck.type, deck.lang ? escapeHtml(deck.lang.toUpperCase()) : null]
        .filter(Boolean)
        .join(" · ");
    const deckBlock = (deck, units, mode) => {
      const head = `<div class="dbhead"><span class="dt">${escapeHtml(deck.title)}</span><span class="dm">${deckMeta(deck)}</span></div>`;
      // A single-unit deck (template) has no meaningful sub-decks — actions go inline in the heading.
      if (deck.total === 1)
        return `<div class="dblock single">${head}<div class="deck-actions">${unitActions(deck, units[0], mode)}</div></div>`;
      const rows = units
        .map(
          (u) =>
            `<div class="urow"><span class="ulabel">${escapeHtml(u.label)}</span><span class="ustage${mode === "built" ? " done" : ""}">${mode === "built" ? "done" : stageWord(u.stage)}</span><span class="uactions">${unitActions(deck, u, mode)}</span></div>`,
        )
        .join("");
      return `<div class="dblock">${head}${rows}</div>`;
    };

    const reviewBlocks = [];
    const builtBlocks = [];
    let reviewCount = 0;
    let builtCount = 0;
    for (const deck of withUnits) {
      const inReview = deck.units.filter((u) => !u.done);
      const built = deck.units.filter((u) => u.done);
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

    return page(
      "Decks — anki-builder",
      `<header><div class="eyebrow">Deck dashboard · anki-builder</div><h1>Your decks</h1>
<p class="lede"><b>${reviewCount}</b> lesson${reviewCount === 1 ? "" : "s"} in review · <b>${builtCount}</b> built.</p></header>
${section("grp-review", "In review", "Lessons still being built — corpus / translation / audio. Continue each lesson's review.", reviewBlocks, reviewCount)}
${section("grp-built", "Built · ready to study", "Finished (marked done) lessons — browse, download, or reopen to tweak.", builtBlocks, builtCount)}`,
    );
  }

  // The REVIEW view (/review/:type/:id): the guided per-stage workflow — corpus (English-only) →
  // translate → audio — with exclude / edit / mark-reviewed / generate / rebuild controls when the
  // server is editable. (Browsing a finished deck read-only is renderDeckPage below.)
  function renderReviewPage(type, id, unit = null) {
    const adapter = adapterFor(type);
    const deck = adapter ? adapter.loadDeck(outputRoot, id) : null;
    if (!deck) return null;
    // Unit-scoped review renders a single lesson; deck-level renders all of them.
    const units =
      unit != null ? deck.units.filter((u) => String(u.seq) === String(unit)) : deck.units;
    if (units.length === 0) return null;

    // Audio editing (Replace/Generate + Rebuild) unlocks only when EVERY rendered unit is at the audio
    // stage. Deck-level: a mixed book stays read-only. Unit-scoped: a single audio lesson is editable
    // even when its siblings aren't — so you can finalize one lesson at a time.
    const canEdit =
      editable && units.length > 0 && units.every((u) => (u.stage || "audio") === "audio");

    const hasCorpus = units.some((u) => (u.stage || "audio") === "corpus");
    const hasTranslate = units.some((u) => (u.stage || "audio") === "translate");
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
      cards: u.cards.map((c) => ({
        ...c,
        unit: u.seq,
        stage: u.stage || "audio",
        audioUrl: c.audio ? mediaUrl(type, id, u.seq, c.audio) : null,
      })),
    }));
    const editControls = canEdit
      ? `<div class="ed"><label class="btn">Replace<input type="file" class="repl" accept="audio/*" hidden></label><button type="button" class="gen">Generate</button>${isJa ? `<button type="button" class="gen-kanji">Generate (kanji)</button>` : ""}<span class="msg"></span></div>`
      : "";
    const audioCell = (c) => {
      const player = c.audioUrl
        ? `<audio controls preload="none" src="${c.audioUrl}"></audio>`
        : `<span class="x">—</span>`;
      return player + editControls;
    };
    // Corpus/translate write-back works per-section whenever the server is editable — independent of
    // the all-audio `canEdit` gate, which only governs audio editing + the global rebuild.
    const rowControl = editable
      ? (stage, c) =>
          stage === "corpus" || stage === "translate"
            ? `<label class="excl-l"><input type="checkbox" class="excl"${c.excluded ? " checked" : ""}> exclude</label>`
            : ""
      : undefined;
    const sectionControl = editable
      ? (s) => {
          if (s.stage === "corpus")
            return `<button type="button" class="mark-rev" data-unit="${escapeHtml(String(s.seq))}">Mark reviewed</button><span class="rev-msg">${s.reviewed ? "✓ reviewed" : ""}</span>`;
          // Audio stage: the final "Mark done" sign-off (or Reopen a done lesson). Only done lessons
          // ship in the merged deck.
          if (s.stage === "audio")
            return s.done
              ? `<span class="done-badge">✓ done</span> <button type="button" class="reopen" data-unit="${escapeHtml(String(s.seq))}">Reopen</button><span class="done-msg"></span>`
              : `<button type="button" class="mark-done" data-unit="${escapeHtml(String(s.seq))}">Mark done</button><span class="done-msg"></span>`;
          return "";
        }
      : undefined;
    const { html: sectionHtml } = renderLessonSections({
      sections,
      startNumber: 1,
      audioCell,
      rowControl,
      sectionControl,
    });

    const total = units.reduce((n, u) => n + u.cards.length, 0);
    const withAudio = units.reduce((n, u) => n + u.cards.filter((c) => c.audio).length, 0);
    const toolbar = canEdit
      ? `<button type="button" id="rebuild" data-type="${escapeHtml(type)}" data-id="${escapeHtml(id)}"${unit != null ? ` data-unit="${escapeHtml(String(unit))}"` : ""}>Rebuild ${unit != null ? "lesson" : "deck"}</button><span id="rebuild-status" class="rb"></span>`
      : "";
    const modal = canEdit
      ? `<div id="gen-modal" class="modal" hidden><div class="modal-box"><h3>Generated variants</h3><p class="sub">Audition and pick one to use for this card, or cancel to keep the current clip.</p><div class="vlist"></div><div class="modal-foot"><button type="button" class="close">Cancel</button></div></div></div>`
      : "";
    const lede = canEdit
      ? `<b>${total}</b> cards across <b>${units.length}</b> lesson${units.length === 1 ? "" : "s"}. Play a card's audio inline; <b>Replace</b> uploads a clip, <b>Generate</b> synthesizes variants to pick from. Then <b>Rebuild deck</b> and import the .apkg.`
      : `<b>${total}</b> cards across <b>${units.length}</b> lesson${units.length === 1 ? "" : "s"}. Each lesson is collapsed — click one to open it and review the fields inline. <b>${withAudio}</b> have audio.`;
    const body = `<header><a class="back" href="/">← All decks</a>
<div class="eyebrow" style="margin-top:12px">Review · anki-builder</div>
<h1>${escapeHtml(deck.title)}</h1>
<p class="lede">${lede} <a class="back" href="/deck/${encodeURIComponent(type)}/${encodeURIComponent(id)}">Browse (read-only) →</a></p>
<div class="bar"><button type="button" id="xall">Expand all</button><button type="button" id="call">Collapse all</button>${toolbar}</div>
</header>
${editable ? `<div id="deckctx" data-type="${escapeHtml(type)}" data-id="${escapeHtml(id)}" hidden></div>` : ""}
${sectionHtml}
${modal}
<footer>Served locally by anki-builder. Audio streams from the deck's build folder.</footer>`;
    const scripts = [EXPAND_COLLAPSE_SCRIPT];
    if (canEdit) scripts.push(DECK_EDIT_SCRIPT);
    if (editable && hasCorpus) scripts.push(CORPUS_EDIT_SCRIPT);
    if (editable && hasTranslate) scripts.push(TRANSLATE_EDIT_SCRIPT);
    if (editable && hasAudio) scripts.push(MARK_DONE_SCRIPT);
    const script = scripts.join("\n");
    return page(`${deck.title} — review`, body, script);
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

  function serveFont(res) {
    const descriptor = getLanguageFont("ja");
    if (!descriptor) return notFound(res);
    const bytes = Buffer.from(readFontBytes(descriptor));
    res.writeHead(200, {
      "Content-Type": "font/woff2",
      "Content-Length": bytes.length,
      "Cache-Control": "public, max-age=31536000, immutable",
    });
    res.end(bytes);
  }

  function serveMedia(req, res, type, id, unit, file) {
    const adapter = adapterFor(type);
    const candidate = adapter ? adapter.resolveMedia(outputRoot, id, unit, file) : null;
    if (!candidate) return notFound(res);

    // Defense in depth: the resolved file must live inside outputRoot even after symlink resolution.
    let rootReal, real;
    try {
      rootReal = realpathSync(resolve(outputRoot));
      real = realpathSync(candidate);
    } catch {
      return notFound(res);
    }
    if (real !== rootReal && !real.startsWith(rootReal + sep)) return forbidden(res);

    let stat;
    try {
      stat = statSync(real);
    } catch {
      return notFound(res);
    }
    if (!stat.isFile()) return notFound(res);

    const range = req.headers.range;
    const match = range && /^bytes=(\d*)-(\d*)$/.exec(range);
    if (match) {
      const start = match[1] === "" ? 0 : Number(match[1]);
      const end = match[2] === "" ? stat.size - 1 : Number(match[2]);
      if (!Number.isInteger(start) || !Number.isInteger(end) || start > end || end >= stat.size) {
        res.writeHead(416, { "Content-Range": `bytes */${stat.size}` });
        return res.end();
      }
      res.writeHead(206, {
        "Content-Type": "audio/mpeg",
        "Content-Range": `bytes ${start}-${end}/${stat.size}`,
        "Accept-Ranges": "bytes",
        "Content-Length": end - start + 1,
      });
      return createReadStream(real, { start, end }).pipe(res);
    }

    res.writeHead(200, {
      "Content-Type": "audio/mpeg",
      "Content-Length": stat.size,
      "Accept-Ranges": "bytes",
    });
    createReadStream(real).pipe(res);
  }

  // Resolve a path (deck file / run dir) and return its realpath only if it stays inside outputRoot
  // (blocks traversal and symlink escapes); null otherwise or if it doesn't exist.
  function realWithinRoot(candidate) {
    try {
      const rootReal = realpathSync(resolve(outputRoot));
      const real = realpathSync(candidate);
      return real === rootReal || real.startsWith(rootReal + sep) ? real : null;
    } catch {
      return null;
    }
  }

  const mediaUrl = (type, id, unit, file) =>
    `/media/${encodeURIComponent(type)}/${encodeURIComponent(id)}/${encodeURIComponent(String(unit))}/${encodeURIComponent(file)}`;

  // The run dir owning a card's edits, realpath-verified inside outputRoot. null => 404.
  function safeUnitDir(type, id, unit) {
    const adapter = adapterFor(type);
    const dir = adapter && adapter.unitDir ? adapter.unitDir(outputRoot, id, unit) : null;
    return dir ? realWithinRoot(dir) : null;
  }

  function serveDownload(res, type, id, unit = null) {
    // unit-scoped → that lesson's own deck.apkg; otherwise the merged book/course deck.apkg.
    let file, filename;
    if (unit != null) {
      const runDir = safeUnitDir(type, id, unit);
      file = runDir ? join(runDir, "deck.apkg") : null;
      filename = `${id}-${unit}.apkg`;
    } else {
      const adapter = adapterFor(type);
      file = adapter && adapter.deckFile ? adapter.deckFile(outputRoot, id) : null;
      filename = `${id}.apkg`;
    }
    const real = file ? realWithinRoot(file) : null;
    if (!real) return notFound(res);
    let stat;
    try {
      stat = statSync(real);
    } catch {
      return notFound(res);
    }
    if (!stat.isFile()) return notFound(res);
    res.writeHead(200, {
      "Content-Type": "application/octet-stream",
      "Content-Length": stat.size,
      "Content-Disposition": `attachment; filename="${filename}"`,
    });
    createReadStream(real).pipe(res);
  }

  async function handleUpload(req, res, type, id, unit, cardId, ext) {
    const runDir = safeUnitDir(type, id, unit);
    if (!runDir) return notFound(res);
    const bytes = await readBodyCapped(req, MAX_UPLOAD_BYTES);
    const { audio } = applyCardAudio(runDir, cardId, bytes, ext);
    sendJson(res, { audio, mediaUrl: mediaUrl(type, id, unit, audio) });
  }

  async function handleGenerate(res, type, id, unit, cardId) {
    const runDir = safeUnitDir(type, id, unit);
    if (!runDir) return notFound(res);
    const adapter = adapterFor(type);
    const languageCode = resolveIso639Code(adapter.deckLanguage?.(outputRoot, id));
    const voiceId = voice || getDefaultVoice(languageCode);
    if (!voiceId)
      throw httpError(400, "no default voice for this language — start the server with --voice");
    const apiKey = getApiKey();
    if (!apiKey)
      throw httpError(
        503,
        "ELEVENLABS_API_KEY is not set — start the server with the key available",
      );
    const variants = await generateCardVariants(runDir, cardId, {
      voiceId,
      apiKey,
      languageCode,
      fetchTts,
    });
    sendJson(res, {
      variants: variants.map((v) => ({
        label: v.label,
        audio: v.audio,
        mediaUrl: mediaUrl(type, id, unit, v.audio),
      })),
    });
  }

  async function handleGenerateKanji(res, type, id, unit, cardId) {
    const runDir = safeUnitDir(type, id, unit);
    if (!runDir) return notFound(res);
    const adapter = adapterFor(type);
    const languageCode = resolveIso639Code(adapter.deckLanguage?.(outputRoot, id));
    const voiceId = voice || getDefaultVoice(languageCode);
    if (!voiceId)
      throw httpError(400, "no default voice for this language — start the server with --voice");
    const apiKey = getApiKey();
    if (!apiKey)
      throw httpError(
        503,
        "ELEVENLABS_API_KEY is not set — start the server with the key available",
      );
    const variants = await generateCardKanjiVariants(runDir, cardId, {
      voiceId,
      apiKey,
      languageCode,
      fetchTts,
      runClaude,
    });
    sendJson(res, {
      variants: variants.map((v) => ({
        label: v.label,
        audio: v.audio,
        kanji: v.kanji,
        mediaUrl: mediaUrl(type, id, unit, v.audio),
      })),
    });
  }

  async function handleCorpusExclude(req, res, type, id, unit, cardId) {
    const runDir = safeUnitDir(type, id, unit);
    if (!runDir) return notFound(res);
    const body = await readBodyCapped(req, 64 * 1024);
    let excluded;
    try {
      excluded = !!JSON.parse(body.toString("utf-8")).excluded;
    } catch {
      throw httpError(400, "invalid JSON body");
    }
    sendJson(res, setCorpusItemExcluded(runDir, cardId, excluded));
  }

  function handleCorpusReviewed(res, type, id, unit) {
    const runDir = safeUnitDir(type, id, unit);
    if (!runDir) return notFound(res);
    sendJson(res, markCorpusReviewed(runDir, { saveChapterCorpus }));
  }

  function handleLessonDone(res, type, id, unit, done) {
    const runDir = safeUnitDir(type, id, unit);
    if (!runDir) return notFound(res);
    sendJson(res, setLessonDone(runDir, done));
  }

  async function handleTranslateExclude(req, res, type, id, unit, cardId) {
    const runDir = safeUnitDir(type, id, unit);
    if (!runDir) return notFound(res);
    const body = await readBodyCapped(req, 64 * 1024);
    let excluded;
    try {
      excluded = !!JSON.parse(body.toString("utf-8")).excluded;
    } catch {
      throw httpError(400, "invalid JSON body");
    }
    sendJson(res, setCardExcluded(runDir, cardId, excluded));
  }

  async function handleTranslateEdit(req, res, type, id, unit, cardId) {
    const runDir = safeUnitDir(type, id, unit);
    if (!runDir) return notFound(res);
    const body = await readBodyCapped(req, 64 * 1024);
    let fields;
    try {
      fields = JSON.parse(body.toString("utf-8"));
    } catch {
      throw httpError(400, "invalid JSON body");
    }
    sendJson(res, editCard(runDir, cardId, fields));
  }

  async function handleSelect(req, res, type, id, unit, cardId) {
    const runDir = safeUnitDir(type, id, unit);
    if (!runDir) return notFound(res);
    const body = await readBodyCapped(req, 64 * 1024);
    let filename;
    try {
      filename = JSON.parse(body.toString("utf-8")).audio;
    } catch {
      throw httpError(400, "invalid JSON body");
    }
    const { audio } = selectCardAudio(runDir, cardId, filename);
    sendJson(res, { audio, mediaUrl: mediaUrl(type, id, unit, audio) });
  }

  function handleRebuild(res, type, id) {
    const adapter = adapterFor(type);
    if (!adapter || !adapter.rebuild) return notFound(res);
    if (!adapter.listDecks(outputRoot).some((d) => d.id === id)) return notFound(res);
    let result;
    try {
      result = adapter.rebuild(outputRoot, id);
    } catch (e) {
      // No finished (done) lessons yet — the deck can't be merged.
      throw httpError(409, e.message);
    }
    sendJson(res, {
      noteCount: result.noteCount,
      downloadUrl: `/download/${encodeURIComponent(type)}/${encodeURIComponent(id)}/deck.apkg`,
      apkgPath: adapter.deckFile(outputRoot, id),
    });
  }

  // Rebuild ONE lesson's own deck.apkg (rebuildRunDir) — for spot-checking a single lesson without
  // touching the merged book/course package. Auto-triggered after audio edits in a unit-scoped review.
  function handleUnitRebuild(res, type, id, unit) {
    const runDir = safeUnitDir(type, id, unit);
    if (!runDir) return notFound(res);
    let result;
    try {
      result = rebuildRunDir(runDir);
    } catch (e) {
      throw httpError(409, e.message);
    }
    sendJson(res, {
      noteCount: result.noteCount,
      downloadUrl: `/download/${encodeURIComponent(type)}/${encodeURIComponent(id)}/${encodeURIComponent(unit)}/deck.apkg`,
      apkgPath: join(runDir, "deck.apkg"),
    });
  }

  // POST route dispatch under /api/deck/:type/:id/… . Returns true if it handled the request.
  async function routePost(req, res, seg) {
    if (seg[0] !== "api" || seg[1] !== "deck") return false;
    const [type, id] = [seg[2], seg[3]];
    if (seg[4] === "rebuild" && seg.length === 5) return (handleRebuild(res, type, id), true);
    if (seg[4] === "unit" && seg[6] === "corpus" && seg[7] === "reviewed" && seg.length === 8) {
      return (handleCorpusReviewed(res, type, id, seg[5]), true);
    }
    if (seg[4] === "unit" && seg[6] === "done" && seg.length === 7) {
      return (handleLessonDone(res, type, id, seg[5], true), true);
    }
    if (seg[4] === "unit" && seg[6] === "reopen" && seg.length === 7) {
      return (handleLessonDone(res, type, id, seg[5], false), true);
    }
    if (seg[4] === "unit" && seg[6] === "rebuild" && seg.length === 7) {
      return (handleUnitRebuild(res, type, id, seg[5]), true);
    }
    if (seg[4] === "unit" && seg[6] === "card") {
      const [unit, cardId] = [seg[5], seg[7]];
      const query = new URL(req.url, "http://localhost").searchParams;
      if (seg[8] === "audio" && seg.length === 9) {
        await handleUpload(req, res, type, id, unit, cardId, query.get("ext"));
        return true;
      }
      if (seg[8] === "generate" && seg.length === 9) {
        await handleGenerate(res, type, id, unit, cardId);
        return true;
      }
      if (seg[8] === "generate-kanji" && seg.length === 9) {
        await handleGenerateKanji(res, type, id, unit, cardId);
        return true;
      }
      if (seg[8] === "audio" && seg[9] === "select" && seg.length === 10) {
        await handleSelect(req, res, type, id, unit, cardId);
        return true;
      }
      if (seg[8] === "corpus" && seg[9] === "exclude" && seg.length === 10) {
        await handleCorpusExclude(req, res, type, id, unit, cardId);
        return true;
      }
      if (seg[8] === "translate" && seg[9] === "exclude" && seg.length === 10) {
        await handleTranslateExclude(req, res, type, id, unit, cardId);
        return true;
      }
      if (seg[8] === "translate" && seg[9] === "edit" && seg.length === 10) {
        await handleTranslateEdit(req, res, type, id, unit, cardId);
        return true;
      }
    }
    return false;
  }

  return async function handler(req, res) {
    let pathname, seg;
    try {
      pathname = new URL(req.url, "http://localhost").pathname;
      seg = pathname
        .split("/")
        .filter(Boolean)
        .map((s) => decodeURIComponent(s));
    } catch {
      return notFound(res);
    }

    try {
      if (req.method === "GET") {
        if (pathname === "/") return sendHtml(res, renderDashboard());
        if (seg[0] === "assets" && seg[1] === "font.woff2" && seg.length === 2)
          return serveFont(res);
        if (seg[0] === "deck" && (seg.length === 3 || seg.length === 4)) {
          const html = renderDeckPage(seg[1], seg[2], seg[3] ?? null);
          return html ? sendHtml(res, html) : notFound(res);
        }
        if (seg[0] === "review" && (seg.length === 3 || seg.length === 4)) {
          const html = renderReviewPage(seg[1], seg[2], seg[3] ?? null);
          return html ? sendHtml(res, html) : notFound(res);
        }
        if (seg[0] === "media" && seg.length === 5)
          return serveMedia(req, res, seg[1], seg[2], seg[3], seg[4]);
        if (seg[0] === "download" && seg.length === 4 && seg[3] === "deck.apkg")
          return serveDownload(res, seg[1], seg[2]);
        // Per-lesson download: /download/:type/:id/:unit/deck.apkg
        if (seg[0] === "download" && seg.length === 5 && seg[4] === "deck.apkg")
          return serveDownload(res, seg[1], seg[2], seg[3]);
        return notFound(res);
      }
      if (req.method === "POST") {
        if (!editable)
          return forbidden(res, "editing is disabled (server started with --read-only)");
        if (await routePost(req, res, seg)) return;
        return notFound(res);
      }
      res.writeHead(405, { Allow: "GET, POST" });
      return res.end();
    } catch (err) {
      if (res.headersSent) return res.end();
      sendJson(res, { error: err.message || "server error" }, err.status || 500);
    }
  };
}

/**
 * Binds the deck server and resolves once it's listening.
 * @returns {Promise<{ server: import('node:http').Server, url: string }>}
 */
export function startDeckServer({ port = 4321, ...opts } = {}) {
  const server = http.createServer(createDeckServer(opts));
  return new Promise((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(port, () => {
      const address = server.address();
      resolvePromise({ server, url: `http://localhost:${address.port}` });
    });
  });
}
