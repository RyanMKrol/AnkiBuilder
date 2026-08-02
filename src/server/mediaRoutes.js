// Media routes for the deck server: the embedded deck font and ranged audio
// streaming. The functions moved verbatim out of createDeckServer in
// src/server/index.js; the factory takes the same injected values the functions
// used to close over.
import { Buffer } from "buffer";
import { createReadStream, statSync, realpathSync } from "fs";
import { resolve, sep } from "path";
import { notFound, forbidden } from "./respond.js";

// Matches applyCardAudio's upload EXT_ALLOWLIST; anything else on disk falls back to audio/mpeg.
const MEDIA_CONTENT_TYPES = {
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  ogg: "audio/ogg",
  wav: "audio/wav",
};

export function createMediaRoutes({ outputRoot, adapterFor, getLanguageFont, readFontBytes }) {
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

    // Replace uploads keep their real extension (.wav/.m4a/.ogg) — serving those as audio/mpeg
    // makes some browsers refuse to play them. Derive the type from what's actually on disk.
    const contentType = MEDIA_CONTENT_TYPES[real.split(".").pop().toLowerCase()] || "audio/mpeg";

    const range = req.headers.range;
    const match = range && /^bytes=(\d*)-(\d*)$/.exec(range);
    if (match) {
      let start, end;
      if (match[1] === "") {
        // Suffix form (`bytes=-500` = the LAST 500 bytes) — previously misread as bytes 0-500.
        const suffix = Number(match[2]);
        if (!Number.isInteger(suffix) || suffix <= 0) {
          res.writeHead(416, { "Content-Range": `bytes */${stat.size}` });
          return res.end();
        }
        start = Math.max(0, stat.size - suffix);
        end = stat.size - 1;
      } else {
        start = Number(match[1]);
        end = match[2] === "" ? stat.size - 1 : Number(match[2]);
      }
      if (!Number.isInteger(start) || !Number.isInteger(end) || start > end || end >= stat.size) {
        res.writeHead(416, { "Content-Range": `bytes */${stat.size}` });
        return res.end();
      }
      res.writeHead(206, {
        "Content-Type": contentType,
        "Content-Range": `bytes ${start}-${end}/${stat.size}`,
        "Accept-Ranges": "bytes",
        "Content-Length": end - start + 1,
      });
      return createReadStream(real, { start, end }).pipe(res);
    }

    res.writeHead(200, {
      "Content-Type": contentType,
      "Content-Length": stat.size,
      "Accept-Ranges": "bytes",
    });
    createReadStream(real).pipe(res);
  }

  return { serveFont, serveMedia };
}
