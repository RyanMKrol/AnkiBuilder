import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { Buffer } from "buffer";
import { readZip, buildZip } from "./zip.js";
import { fontFaceCss } from "./fontLibrary.js";

// A .apkg stores each note type's Styling in the `models` JSON of the `col` row; older exports may
// carry both schema files, so rewrite whichever are present.
const COLLECTION_NAMES = ["collection.anki2", "collection.anki21"];

/**
 * Rewrites one note type's CSS to render its cards in the embedded language font: drops any
 * `@font-face` pointing at an external URL (those never load in Anki), then registers the embedded
 * font and appends a `.card { font-family: … }` rule so it wins over whatever the deck set. The
 * font is listed first, with a target-language fallback after it, so the target text renders in it
 * on every client.
 */
export function restyleModelsCss(css, descriptor) {
  const withoutExternal = (css || "").replace(/@font-face\s*{[^}]*}/gi, (block) =>
    /url\(\s*['"]?https?:/i.test(block) ? "" : block,
  );
  return (
    withoutExternal.replace(/\s+$/, "") +
    "\n\n/* anki-builder: embedded language font */\n" +
    fontFaceCss(descriptor) +
    `\n.card { font-family: "${descriptor.family}", "Hiragino Mincho ProN", sans-serif; }\n`
  );
}

// SQLite needs a file path, so round-trip the collection bytes through a temp file (same pattern as
// the deck builder's writeCollectionDb).
//
// `freshNoteType` reassigns each note type a new id (+1, deterministic so both collection files and
// both scripts of the same deck stay consistent) and appends the font name to its name, then
// repoints its notes at it. Importing Anki keeps your EXISTING note type's styling on collision, so
// a same-id restyle silently does nothing on re-import; a fresh id imports as a brand-new note type
// that actually carries the restyled CSS.
function restyleCollectionBytes(dbBytes, descriptor, { freshNoteType = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "anki-builder-restyle-"));
  const path = join(dir, "collection.anki2");
  try {
    writeFileSync(path, dbBytes);
    const db = new DatabaseSync(path);
    try {
      const models = JSON.parse(db.prepare("SELECT models FROM col").get().models);
      const nextModels = {};
      const repointNotes = db.prepare("UPDATE notes SET mid = ? WHERE mid = ?");
      for (const [oldId, model] of Object.entries(models)) {
        model.css = restyleModelsCss(model.css, descriptor);
        if (freshNoteType) {
          const newId = Number(oldId) + 1;
          model.id = newId;
          model.name = `${model.name} · ${descriptor.family}`;
          repointNotes.run(newId, Number(oldId));
          nextModels[String(newId)] = model;
        } else {
          nextModels[oldId] = model;
        }
      }
      db.prepare("UPDATE col SET models = ? WHERE id = 1").run(JSON.stringify(nextModels));
    } finally {
      db.close();
    }
    return readFileSync(path);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Returns the bytes of a new `.apkg`, identical to `inputBuffer` except that every note type now
 * renders in `descriptor`'s font, which is embedded into the deck's media as `descriptor.mediaName`.
 * Idempotent — re-running reuses the font's existing media slot. Throws on the newer
 * (anki21b/protobuf-media) `.apkg` format, which this doesn't parse.
 */
export function restyleApkgBuffer(
  inputBuffer,
  descriptor,
  fontBytes,
  { freshNoteType = false } = {},
) {
  const entries = readZip(inputBuffer);

  const mediaEntry = entries.find((e) => e.name === "media");
  if (!mediaEntry) {
    throw new Error(
      "unsupported .apkg: no `media` manifest (newer anki21b format is not supported)",
    );
  }
  if (!entries.some((e) => COLLECTION_NAMES.includes(e.name))) {
    throw new Error(
      "unsupported .apkg: no collection.anki2/.anki21 found (newer anki21b format is not supported)",
    );
  }

  // 1) rewrite each collection db's note-type CSS
  const rewritten = entries.map((e) =>
    COLLECTION_NAMES.includes(e.name)
      ? { name: e.name, data: restyleCollectionBytes(e.data, descriptor, { freshNoteType }) }
      : e,
  );

  // 2) register the font in the media manifest — reuse its slot if already present (idempotent)
  const media = JSON.parse(mediaEntry.data.toString("utf-8"));
  const existingKey = Object.entries(media).find(([, name]) => name === descriptor.mediaName)?.[0];
  const fontKey =
    existingKey ?? String(Object.keys(media).reduce((max, k) => Math.max(max, Number(k)), -1) + 1);
  media[fontKey] = descriptor.mediaName;

  // 3) rebuild the entry list: updated media manifest, the font file under its numeric key
  const out = rewritten
    .filter((e) => e.name !== "media" && e.name !== fontKey)
    .concat(
      { name: "media", data: Buffer.from(JSON.stringify(media), "utf-8") },
      { name: fontKey, data: fontBytes },
    );

  return buildZip(out);
}
