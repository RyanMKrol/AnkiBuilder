import http from "node:http";
import { Buffer } from "buffer";
import { realpathSync } from "fs";
import { resolve, sep } from "path";
import { createAnkiConnect } from "../anki/ankiConnect.js";
import { deliverToAnki } from "../anki/deliver.js";
import { ADAPTERS } from "./adapters/index.js";
import { unitBuildState } from "./adapters/stage.js";
import { clearClaim, describeClaim } from "../cli/runClaim.js";
import {
  getLanguageFont as defaultGetLanguageFont,
  readFontBytes as defaultReadFontBytes,
} from "../deck/fontLibrary.js";
import {
  applyCardAudio,
  selectCardAudio,
  trimCardAudio,
  revertCardAudio,
  recleanCardAudio,
} from "./adapters/applyCardAudio.js";
import {
  setCardExcluded,
  editCard,
  setLessonDone,
  markCardsReviewed,
  unmarkCardsReviewed,
} from "./adapters/applyCards.js";
import {
  saveChapterCorpus as defaultSaveChapterCorpus,
  removeChapterCorpus as defaultRemoveChapterCorpus,
} from "../corpus/epubLibrary.js";
import { generateCardVariants } from "../audio/generateVariants.js";
import { generateCardKanjiVariants } from "../audio/generateKanjiVariants.js";
import { isGeneratedTakeFilename } from "../audio/index.js";
import { usesEndMarker } from "../audio/ttsMarker.js";
import { runKanjiOrthographyClaude as defaultRunClaude } from "../translate/runClaude.js";
import { fetchElevenLabsTts } from "../audio/elevenLabsTts.js";
import { trimToRange as defaultTrimToRange } from "../audio/trimToRange.js";
import { isCleanupName } from "../audio/cleanupFilter.js";
import { getDefaultVoice as defaultGetDefaultVoice } from "../audio/voiceLibrary.js";
import { resolveIso639Code as defaultResolveIso639Code } from "../model/iso639.js";
import { httpError } from "../util/httpError.js";
import { sendHtml, sendJson, notFound, forbidden } from "./respond.js";
import { createPageRenderers } from "./pages.js";
import { createMediaRoutes } from "./mediaRoutes.js";

// Local deck-dashboard server. Lists every built deck (via the format adapters) and renders per-deck
// collapsible lesson views in the same editorial style as the deck-view artifact — but serving audio
// over HTTP (`/media/...`) instead of base64, so an entire deck browses on one page with no size cap.
// Node builtins only; server-side rendered; dependency-injected for testing.

// True when a request's Host header names this machine (localhost / loopback IP, any port).
// Used to refuse writes from DNS-rebinding pages, whose Host is the attacker's hostname.
function isLocalHostHeader(host) {
  if (!host) return false;
  const name = host.startsWith("[") ? host.slice(1, host.indexOf("]")) : host.replace(/:\d+$/, "");
  return name === "localhost" || name === "127.0.0.1" || name === "::1";
}

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
  removeChapterCorpus = defaultRemoveChapterCorpus,
  runClaude = defaultRunClaude,
  // The automatic trailing-silence trim, applied to every clip this server stores (uploads and
  // generated variants alike). Injected like every other collaborator because the real one SHELLS OUT
  // to ffmpeg — a test that used it would be slow and would pass or fail on whether the machine
  // happens to have ffmpeg installed. Undefined means "use the real trimmer".
  trim = undefined,
  // The reviewer's explicit [start, end] cut. Also ffmpeg, so also injectable — and unlike `trim` it
  // deliberately THROWS on failure, because a hand-placed edit that silently did nothing would tell
  // the reviewer their cut landed when the card still holds the untrimmed clip.
  trimToRange = defaultTrimToRange,
} = {}) {
  const adapterFor = (type) => adapters.find((a) => a.type === type) || null;

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

  // The /media URLs for a write's resulting takes. Replace and Generate install a NEW recording, so a
  // row has to be told about BOTH clips — the editor reads the original straight off the row, and
  // without this it would go on offering the previous take to cut from.
  const takeUrls = (type, id, unit, takes) => ({
    mediaUrl: takes.audio ? mediaUrl(type, id, unit, takes.audio) : null,
    originalUrl: takes.audioOriginal ? mediaUrl(type, id, unit, takes.audioOriginal) : null,
  });

  const mediaUrl = (type, id, unit, file) =>
    `/media/${encodeURIComponent(type)}/${encodeURIComponent(id)}/${encodeURIComponent(String(unit))}/${encodeURIComponent(file)}`;

  // The page renderers and media routes moved to pages.js / mediaRoutes.js; each
  // factory receives the same injected values the functions used to close over.
  const { renderDashboard, renderReviewPage, renderDeckPage } = createPageRenderers({
    outputRoot,
    adapters,
    adapterFor,
    editable,
    resolveIso639Code,
    mediaUrl,
  });
  const { serveFont, serveMedia } = createMediaRoutes({
    outputRoot,
    adapterFor,
    getLanguageFont,
    readFontBytes,
  });

  // The run dir owning a card's edits, realpath-verified inside outputRoot. null => 404.
  function safeUnitDir(type, id, unit) {
    const adapter = adapterFor(type);
    const dir = adapter && adapter.unitDir ? adapter.unitDir(outputRoot, id, unit) : null;
    return dir ? realWithinRoot(dir) : null;
  }

  /**
   * Refuses a write to a lesson a CLI stage is currently building. The rendered page already
   * hides the controls, but a browser tab left open from before the build started will still
   * POST — and this is the half that actually prevents the lost update.
   */
  function assertNotBuilding(runDir) {
    const { building, claim } = unitBuildState(runDir);
    if (building) {
      throw httpError(
        409,
        `lesson is being built (${describeClaim(claim)}) — try again when it finishes`,
      );
    }
  }

  async function handleUpload(req, res, type, id, unit, cardId, ext) {
    const runDir = safeUnitDir(type, id, unit);
    if (!runDir) return notFound(res);
    assertNotBuilding(runDir);
    const bytes = await readBodyCapped(req, MAX_UPLOAD_BYTES);
    const takes = await applyCardAudio(runDir, cardId, bytes, ext, { trim });
    sendJson(res, { ...takes, ...takeUrls(type, id, unit, takes) });
  }

  async function handleGenerate(req, res, type, id, unit, cardId) {
    const runDir = safeUnitDir(type, id, unit);
    if (!runDir) return notFound(res);
    assertNotBuilding(runDir);
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
    // Optional body: {"labels": ["kanji+comma"]} re-rolls just those takes (one credit each)
    // instead of the whole set. An empty body keeps the original generate-everything behavior.
    let labels = null;
    const body = await readBodyCapped(req, 64 * 1024);
    if (body.length > 0) {
      try {
        ({ labels = null } = JSON.parse(body.toString("utf-8")));
      } catch {
        throw httpError(400, "invalid JSON body");
      }
    }
    const variants = await generateCardVariants(runDir, cardId, {
      voiceId,
      apiKey,
      languageCode,
      fetchTts,
      trim,
      labels,
    });
    sendJson(res, {
      variants: variants.map((v) => ({
        label: v.label,
        audio: v.audio,
        original: v.original,
        marked: v.marked,
        mediaUrl: mediaUrl(type, id, unit, v.audio),
      })),
    });
  }

  async function handleGenerateKanji(res, type, id, unit, cardId) {
    const runDir = safeUnitDir(type, id, unit);
    if (!runDir) return notFound(res);
    assertNotBuilding(runDir);
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
      trim,
    });
    sendJson(res, {
      variants: variants.map((v) => ({
        label: v.label,
        audio: v.audio,
        original: v.original,
        marked: v.marked,
        kanji: v.kanji,
        mediaUrl: mediaUrl(type, id, unit, v.audio),
      })),
    });
  }

  function handleCardsReviewed(res, type, id, unit) {
    const runDir = safeUnitDir(type, id, unit);
    if (!runDir) return notFound(res);
    assertNotBuilding(runDir);
    sendJson(res, markCardsReviewed(runDir, { saveChapterCorpus }));
  }

  function handleCardsUnreviewed(res, type, id, unit) {
    const runDir = safeUnitDir(type, id, unit);
    if (!runDir) return notFound(res);
    assertNotBuilding(runDir);
    sendJson(res, unmarkCardsReviewed(runDir, { removeChapterCorpus }));
  }

  async function handleLessonDone(res, type, id, unit) {
    const runDir = safeUnitDir(type, id, unit);
    if (!runDir) return notFound(res);
    assertNotBuilding(runDir);
    const result = setLessonDone(runDir, true);
    // The done-set just changed — refresh the group package so it always matches. A REAL rebuild
    // failure rides back on the response: reporting success while the shipping .apkg stayed stale
    // is exactly the divergence the auto-rebuild exists to prevent.
    const { rebuildError } = await rebuildGroupQuiet(type, id);
    sendJson(res, { ...result, rebuildError });
  }

  async function handleReviewExclude(req, res, type, id, unit, cardId) {
    const runDir = safeUnitDir(type, id, unit);
    if (!runDir) return notFound(res);
    assertNotBuilding(runDir);
    const body = await readBodyCapped(req, 64 * 1024);
    let excluded;
    try {
      excluded = !!JSON.parse(body.toString("utf-8")).excluded;
    } catch {
      throw httpError(400, "invalid JSON body");
    }
    sendJson(res, setCardExcluded(runDir, cardId, excluded));
  }

  async function handleReviewEdit(req, res, type, id, unit, cardId) {
    const runDir = safeUnitDir(type, id, unit);
    if (!runDir) return notFound(res);
    assertNotBuilding(runDir);
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
    assertNotBuilding(runDir);
    const body = await readBodyCapped(req, 64 * 1024);
    let filename, original;
    try {
      ({ audio: filename, original = null } = JSON.parse(body.toString("utf-8")));
    } catch {
      throw httpError(400, "invalid JSON body");
    }
    // `audioMarked` drives later marker strips (a re-clean, a re-trim), so it's derived from the
    // take's PROVENANCE — a generated filename in a marker-using language — never trusted from the
    // client, where a stale or hand-crafted value would poison every later re-derive.
    const adapter = adapterFor(type);
    const languageCode = resolveIso639Code(adapter?.deckLanguage?.(outputRoot, id));
    const marked = usesEndMarker(languageCode) && isGeneratedTakeFilename(original ?? filename);
    const takes = selectCardAudio(runDir, cardId, filename, original, { marked });
    sendJson(res, { ...takes, ...takeUrls(type, id, unit, takes) });
  }

  async function handleTrim(req, res, type, id, unit, cardId) {
    const runDir = safeUnitDir(type, id, unit);
    if (!runDir) return notFound(res);
    assertNotBuilding(runDir);
    const body = await readBodyCapped(req, 64 * 1024);
    let start, end;
    try {
      ({ start, end } = JSON.parse(body.toString("utf-8")));
    } catch {
      throw httpError(400, "invalid JSON body");
    }
    const { audio } = trimCardAudio(runDir, cardId, Number(start), Number(end), { trimToRange });
    sendJson(res, { audio, mediaUrl: mediaUrl(type, id, unit, audio) });
  }

  function handleTrimRevert(res, type, id, unit, cardId) {
    const runDir = safeUnitDir(type, id, unit);
    if (!runDir) return notFound(res);
    assertNotBuilding(runDir);
    const { audio } = revertCardAudio(runDir, cardId);
    sendJson(res, { audio, mediaUrl: audio ? mediaUrl(type, id, unit, audio) : null });
  }

  // Re-derive a card's takes under a different noise-cleanup chain. Always from the untouched
  // original, so switching chains never stacks one filter on another.
  async function handleClean(req, res, type, id, unit, cardId) {
    const runDir = safeUnitDir(type, id, unit);
    if (!runDir) return notFound(res);
    assertNotBuilding(runDir);
    const body = await readBodyCapped(req, 64 * 1024);
    let filter;
    try {
      ({ filter } = JSON.parse(body.toString("utf-8")));
    } catch {
      throw httpError(400, "invalid JSON body");
    }
    // Chains are selected BY NAME and looked up in a fixed table — a request can never supply a raw
    // ffmpeg filter string, which would otherwise reach a command line.
    if (!isCleanupName(filter) && String(filter).toLowerCase() !== "off") {
      throw httpError(400, `unknown cleanup filter: ${JSON.stringify(filter)}`);
    }
    const { audio, audioTrim } = await recleanCardAudio(runDir, cardId, filter, {
      trim,
      trimToRange,
    });
    sendJson(res, { audio, audioTrim, filter, mediaUrl: mediaUrl(type, id, unit, audio) });
  }

  // Rebuild the single group package (the book/course merge of done lessons, or a template's own deck)
  // — the only .apkg per group. Never writes a per-lesson file. Shared by the manual "Rebuild deck"
  // button and by rebuildGroupQuiet below.
  async function handleRebuild(res, type, id) {
    const adapter = adapterFor(type);
    if (!adapter || !adapter.rebuild) return notFound(res);
    if (!adapter.listDecks(outputRoot).some((d) => d.id === id)) return notFound(res);
    let result;
    try {
      result = await adapter.rebuild(outputRoot, id);
    } catch (e) {
      // No finished (done) lessons yet, or the book dir has no unit folders at all.
      throw httpError(409, e.message);
    }
    sendJson(res, { noteCount: result.noteCount, apkgPath: adapter.deckFile(outputRoot, id) });
  }

  // Deliver every managed deck's on-disk state to the live Anki collection via AnkiConnect. `?dry=1`
  // previews the plan (read-only, no backup, no writes); otherwise it backs up, syncs the note type,
  // and pushes note fields in place (scheduling preserved). Returns the structured report as JSON.
  async function handleDeliver(req, res) {
    const dry = new URL(req.url, "http://localhost").searchParams.get("dry") === "1";
    let report;
    try {
      report = await deliverToAnki(outputRoot, "all", { client: createAnkiConnect(), dry });
    } catch (e) {
      throw httpError(502, e.message);
    }
    sendJson(res, report);
  }

  // Best-effort rebuild of the group package, tolerating only the BENIGN cases — no lesson done
  // yet, or no unit folders at all — so marking a lesson done (or an edit to a done lesson)
  // keeps the on-disk package in step without failing the write. Every other
  // failure is a real build error the caller must surface: it used to be swallowed here, so Mark
  // done reported success while the shipping .apkg silently stayed stale.
  async function rebuildGroupQuiet(type, id) {
    const adapter = adapterFor(type);
    try {
      await adapter?.rebuild?.(outputRoot, id);
      return { rebuildError: null };
    } catch (e) {
      const benign = /no finished lessons|no chapter-\*\/|directories found/.test(e.message || "");
      return { rebuildError: benign ? null : e.message || "rebuild failed" };
    }
  }

  // POST route dispatch under /api/deck/:type/:id/… . Returns true if it handled the request.
  async function routePost(req, res, seg) {
    if (seg[0] !== "api") return false;
    if (seg[1] === "anki" && seg[2] === "deliver" && seg.length === 3) {
      await handleDeliver(req, res);
      return true;
    }
    if (seg[1] !== "deck") return false;
    const [type, id] = [seg[2], seg[3]];
    if (seg[4] === "rebuild" && seg.length === 5) {
      await handleRebuild(res, type, id);
      return true;
    }
    if (seg[4] === "unit" && seg[6] === "review" && seg[7] === "unreviewed" && seg.length === 8) {
      handleCardsUnreviewed(res, type, id, seg[5]);
      return true;
    }
    if (seg[4] === "unit" && seg[6] === "review" && seg[7] === "reviewed" && seg.length === 8) {
      return (handleCardsReviewed(res, type, id, seg[5]), true);
    }
    if (seg[4] === "unit" && seg[6] === "done" && seg.length === 7) {
      await handleLessonDone(res, type, id, seg[5]);
      return true;
    }
    if (seg[4] === "unit" && seg[6] === "claim" && seg[7] === "clear" && seg.length === 8) {
      const runDir = safeUnitDir(type, id, seg[5]);
      if (!runDir) return notFound(res);
      const { building, claim } = unitBuildState(runDir);
      // Never clear a LIVE claim — that would hand a second writer the lesson mid-build.
      if (building) throw httpError(409, `still building (${describeClaim(claim)})`);
      clearClaim(runDir);
      sendJson(res, { cleared: true });
      return true;
    }
    if (seg[4] === "unit" && seg[6] === "card") {
      const [unit, cardId] = [seg[5], seg[7]];
      const query = new URL(req.url, "http://localhost").searchParams;
      if (seg[8] === "audio" && seg.length === 9) {
        await handleUpload(req, res, type, id, unit, cardId, query.get("ext"));
        return true;
      }
      if (seg[8] === "generate" && seg.length === 9) {
        await handleGenerate(req, res, type, id, unit, cardId);
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
      if (seg[8] === "audio" && seg[9] === "clean" && seg.length === 10) {
        await handleClean(req, res, type, id, unit, cardId);
        return true;
      }
      if (seg[8] === "audio" && seg[9] === "trim" && seg.length === 10) {
        await handleTrim(req, res, type, id, unit, cardId);
        return true;
      }
      if (seg[8] === "audio" && seg[9] === "trim" && seg[10] === "revert" && seg.length === 11) {
        return (handleTrimRevert(res, type, id, unit, cardId), true);
      }
      if (seg[8] === "review" && seg[9] === "exclude" && seg.length === 10) {
        await handleReviewExclude(req, res, type, id, unit, cardId);
        return true;
      }
      if (seg[8] === "review" && seg[9] === "edit" && seg.length === 10) {
        await handleReviewEdit(req, res, type, id, unit, cardId);
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
        return notFound(res);
      }
      if (req.method === "POST") {
        if (!editable)
          return forbidden(res, "editing is disabled (server started with --read-only)");
        // The server only binds loopback, but a malicious page could still reach it via DNS
        // rebinding (a hostname that resolves to 127.0.0.1). Such a request carries the
        // attacker's hostname in the Host header, so refusing non-local Hosts on every
        // state-changing route closes that hole.
        if (!isLocalHostHeader(req.headers.host))
          return forbidden(res, "writes are only accepted from localhost");
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
export function startDeckServer({ port = 4321, host = "127.0.0.1", ...opts } = {}) {
  const server = http.createServer(createDeckServer(opts));
  return new Promise((resolvePromise, reject) => {
    server.once("error", reject);
    // Loopback only: the dashboard edits run files and can push into a live Anki collection
    // over AnkiConnect, so it must never be reachable from the LAN.
    server.listen(port, host, () => {
      const address = server.address();
      resolvePromise({ server, url: `http://localhost:${address.port}` });
    });
  });
}
