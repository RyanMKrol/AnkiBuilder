// Small HTTP response helpers shared by the deck server's route modules (index.js,
// pages.js, mediaRoutes.js). Moved verbatim from src/server/index.js when the
// server was split per area.
import { escapeHtml, DECK_VIEW_CSS, fontFaceRule } from "../review/deckViewChrome.js";

export function page(title, body, script = null) {
  return `<title>${escapeHtml(title)}</title>
<style>
${fontFaceRule({ url: "/assets/font.woff2" })}
${DECK_VIEW_CSS}
</style>
<div class="wrap">
${body}
</div>${script ? `\n<script>\n${script}\n</script>` : ""}`;
}

export function sendHtml(res, body, status = 200) {
  res.writeHead(status, { "Content-Type": "text/html; charset=utf-8" });
  res.end(body);
}
export function sendJson(res, obj, status = 200) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(obj));
}
export const notFound = (res) =>
  sendHtml(res, page("Not found", `<header><h1>404 — not found</h1></header>`), 404);
export const forbidden = (res, message = "forbidden") => sendJson(res, { error: message }, 403);
