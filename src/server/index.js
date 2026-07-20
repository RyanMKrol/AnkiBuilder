import http from "node:http";
import { Buffer } from "buffer";
import { createReadStream, statSync, realpathSync } from "fs";
import { resolve, sep } from "path";
import {
  escapeHtml,
  DECK_VIEW_CSS,
  fontFaceRule,
  renderLessonSections,
  EXPAND_COLLAPSE_SCRIPT,
} from "../review/deckViewChrome.js";
import { ADAPTERS } from "./adapters/index.js";
import {
  getLanguageFont as defaultGetLanguageFont,
  readFontBytes as defaultReadFontBytes,
} from "../deck/fontLibrary.js";

// Local deck-dashboard server. Lists every built deck (via the format adapters) and renders per-deck
// collapsible lesson views in the same editorial style as the deck-view artifact — but serving audio
// over HTTP (`/media/...`) instead of base64, so an entire deck browses on one page with no size cap.
// Node builtins only; server-side rendered; dependency-injected for testing.

const TYPE_GROUPS = [
  { type: "book", label: "Books" },
  { type: "course", label: "Courses" },
  { type: "template", label: "Templates" },
];

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
const notFound = (res) =>
  sendHtml(res, page("Not found", `<header><h1>404 — not found</h1></header>`), 404);
const forbidden = (res) =>
  sendHtml(res, page("Forbidden", `<header><h1>403 — forbidden</h1></header>`), 403);

export function createDeckServer({
  outputRoot = "output",
  adapters = ADAPTERS,
  getLanguageFont = defaultGetLanguageFont,
  readFontBytes = defaultReadFontBytes,
} = {}) {
  const adapterFor = (type) => adapters.find((a) => a.type === type) || null;

  function renderDashboard() {
    const decks = adapters.flatMap((a) => a.listDecks(outputRoot));
    if (decks.length === 0) {
      return page(
        "Decks — anki-builder",
        `<header><div class="eyebrow">Deck dashboard · anki-builder</div><h1>Your decks</h1>
<p class="lede">No built decks found under <code>${escapeHtml(outputRoot)}</code>. Build a deck first, then reload this page.</p></header>`,
      );
    }
    const groups = TYPE_GROUPS.map((g) => {
      const items = decks.filter((d) => d.type === g.type);
      if (!items.length) return "";
      const cards = items
        .map((d) => {
          const unitWord =
            d.type === "template" ? null : `${d.unitCount} lesson${d.unitCount === 1 ? "" : "s"}`;
          const meta = [
            d.targetLanguage ? escapeHtml(d.targetLanguage.toUpperCase()) : null,
            unitWord,
          ]
            .filter(Boolean)
            .join(" · ");
          return `<a class="deck" href="/deck/${encodeURIComponent(d.type)}/${encodeURIComponent(d.id)}"><div class="dt">${escapeHtml(d.title)}</div><div class="dm">${meta}</div></a>`;
        })
        .join("");
      return `<div class="grp"><h2>${g.label}</h2><div class="decks">${cards}</div></div>`;
    }).join("");
    return page(
      "Decks — anki-builder",
      `<header><div class="eyebrow">Deck dashboard · anki-builder</div><h1>Your decks</h1>
<p class="lede"><b>${decks.length}</b> deck${decks.length === 1 ? "" : "s"}. Click one to browse its lessons and play the audio inline.</p></header>
${groups}`,
    );
  }

  function renderDeckPage(type, id) {
    const adapter = adapterFor(type);
    const deck = adapter ? adapter.loadDeck(outputRoot, id) : null;
    if (!deck) return null;

    const sections = deck.units.map((u) => ({
      leaf: u.label,
      cards: u.cards.map((c) => ({
        ...c,
        audioUrl: c.audio
          ? `/media/${encodeURIComponent(type)}/${encodeURIComponent(id)}/${encodeURIComponent(String(u.seq))}/${encodeURIComponent(c.audio)}`
          : null,
      })),
    }));
    const audioCell = (c) =>
      c.audioUrl
        ? `<audio controls preload="none" src="${c.audioUrl}"></audio>`
        : `<span class="x">—</span>`;
    const { html: sectionHtml } = renderLessonSections({ sections, startNumber: 1, audioCell });

    const total = deck.units.reduce((n, u) => n + u.cards.length, 0);
    const withAudio = deck.units.reduce((n, u) => n + u.cards.filter((c) => c.audio).length, 0);
    const body = `<header><a class="back" href="/">← All decks</a>
<div class="eyebrow" style="margin-top:12px">Deck · anki-builder</div>
<h1>${escapeHtml(deck.title)}</h1>
<p class="lede"><b>${total}</b> cards across <b>${deck.units.length}</b> lesson${deck.units.length === 1 ? "" : "s"}. Each lesson is collapsed — click one to open it and play the audio inline. <b>${withAudio}</b> have audio.</p>
<div class="bar"><button type="button" id="xall">Expand all</button><button type="button" id="call">Collapse all</button></div>
</header>
${sectionHtml}
<footer>Served locally by anki-builder. Audio streams from the deck's build folder.</footer>`;
    return page(`${deck.title} — deck`, body, EXPAND_COLLAPSE_SCRIPT);
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

  return function handler(req, res) {
    if (req.method !== "GET") {
      res.writeHead(405, { Allow: "GET" });
      return res.end();
    }
    let seg;
    try {
      const pathname = new URL(req.url, "http://localhost").pathname;
      seg = pathname
        .split("/")
        .filter(Boolean)
        .map((s) => decodeURIComponent(s));
      if (pathname === "/") return sendHtml(res, renderDashboard());
    } catch {
      return notFound(res);
    }

    if (seg[0] === "assets" && seg[1] === "font.woff2" && seg.length === 2) return serveFont(res);
    if (seg[0] === "deck" && seg.length === 3) {
      const html = renderDeckPage(seg[1], seg[2]);
      return html ? sendHtml(res, html) : notFound(res);
    }
    if (seg[0] === "media" && seg.length === 5) {
      return serveMedia(req, res, seg[1], seg[2], seg[3], seg[4]);
    }
    return notFound(res);
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
