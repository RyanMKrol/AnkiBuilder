import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "fs";
import { join } from "path";
import os from "os";
import { Buffer } from "buffer";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { buildDeck } from "../../src/deck/index.js";
import { buildZip, readZip } from "../../src/deck/zip.js";
import { restyleModelsCss, restyleApkgBuffer } from "../../src/deck/restyleFont.js";
import { getLanguageFont } from "../../src/deck/fontLibrary.js";

const JA = getLanguageFont("ja");
const FONT = Buffer.from("FONT-BYTES-PLACEHOLDER");

async function withTempDir(fn) {
  const dir = await fs.mkdtemp(join(os.tmpdir(), "restyle-test-"));
  try {
    return await fn(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

function cssOfFirstModel(apkgBuffer) {
  const entries = readZip(apkgBuffer);
  const colName = entries.some((e) => e.name === "collection.anki21")
    ? "collection.anki21"
    : "collection.anki2";
  const dir = mkdtempSync(join(tmpdir(), "restyle-read-"));
  const p = join(dir, "c.anki2");
  try {
    writeFileSync(p, entries.find((e) => e.name === colName).data);
    const db = new DatabaseSync(p);
    try {
      return Object.values(JSON.parse(db.prepare("SELECT models FROM col").get().models))[0].css;
    } finally {
      db.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("restyleModelsCss drops external @font-face and points .card at the embedded font", () => {
  const input = `
    @font-face { font-family: myfont; src: url('https://fonts.googleapis.com/css2?family=DM+Sans'); }
    .card { font-family: "DM sans", "Hiragino Sans"; font-size: 20px; }`;
  const out = restyleModelsCss(input, JA);
  assert.doesNotMatch(out, /googleapis\.com/, "external @font-face removed");
  assert.match(out, /url\("_KleeOne-Regular\.woff2"\)/, "our @font-face added");
  assert.match(out, /\.card\s*{\s*font-family:\s*"Klee One"/, ".card now leads with the font");
  assert.match(out, /font-size: 20px/, "original rules preserved");
});

test("readZip round-trips buildZip", () => {
  const entries = [
    { name: "collection.anki2", data: Buffer.from("db-bytes") },
    { name: "media", data: Buffer.from("{}") },
    { name: "0", data: Buffer.from("audio") },
  ];
  const back = readZip(buildZip(entries));
  assert.deepEqual(
    back.map((e) => [e.name, e.data.toString()]),
    entries.map((e) => [e.name, e.data.toString()]),
  );
});

test("restyleApkgBuffer embeds the font and rewrites the note-type CSS", async () => {
  await withTempDir(async (dir) => {
    const outPath = join(dir, "deck.apkg");
    buildDeck(
      {
        meta: { targetLanguage: "ja", sourceType: "manual" },
        items: [
          { id: "a", english: "one", category: "Numbers", target: "いち", pronunciation: "ichi" },
        ],
      },
      { outPath, now: 1700000000000 },
    );
    const restyled = restyleApkgBuffer(readFileSync(outPath), JA, FONT);

    const entries = readZip(restyled);
    const media = JSON.parse(entries.find((e) => e.name === "media").data.toString("utf-8"));
    const fontKey = Object.entries(media).find(([, n]) => n === JA.mediaName)?.[0];
    assert.ok(fontKey, "font registered in the media manifest");
    const fontEntry = entries.find((e) => e.name === fontKey);
    assert.equal(fontEntry.data.toString(), "FONT-BYTES-PLACEHOLDER", "font bytes embedded");

    const css = cssOfFirstModel(restyled);
    assert.match(css, /url\("_KleeOne-Regular\.woff2"\)/);
    assert.match(css, /\.card\s*{\s*font-family:\s*"Klee One"/);
  });
});

test("restyleApkgBuffer is idempotent — a second pass reuses the font's media slot", async () => {
  await withTempDir(async (dir) => {
    const outPath = join(dir, "deck.apkg");
    buildDeck(
      {
        meta: { targetLanguage: "ja", sourceType: "manual" },
        items: [
          { id: "a", english: "one", category: "Numbers", target: "いち", pronunciation: "ichi" },
        ],
      },
      { outPath, now: 1700000000000 },
    );
    const once = restyleApkgBuffer(readFileSync(outPath), JA, FONT);
    const twice = restyleApkgBuffer(once, JA, FONT);

    const count = (buf) =>
      Object.values(
        JSON.parse(
          readZip(buf)
            .find((e) => e.name === "media")
            .data.toString("utf-8"),
        ),
      ).filter((n) => n === JA.mediaName).length;
    assert.equal(count(once), 1);
    assert.equal(count(twice), 1, "not duplicated on re-run");
  });
});

test("restyleApkgBuffer with freshNoteType gives the note type a new id + name and repoints its notes", async () => {
  await withTempDir(async (dir) => {
    const outPath = join(dir, "deck.apkg");
    buildDeck(
      {
        meta: { targetLanguage: "ja", sourceType: "manual" },
        items: [
          { id: "a", english: "one", category: "Numbers", target: "いち", pronunciation: "ichi" },
        ],
      },
      { outPath, now: 1700000000000 },
    );
    const restyled = restyleApkgBuffer(readFileSync(outPath), JA, FONT, { freshNoteType: true });

    const entries = readZip(restyled);
    const colName = entries.some((e) => e.name === "collection.anki21")
      ? "collection.anki21"
      : "collection.anki2";
    const tdir = mkdtempSync(join(tmpdir(), "fresh-"));
    const p = join(tdir, "c.anki2");
    try {
      writeFileSync(p, entries.find((e) => e.name === colName).data);
      const db = new DatabaseSync(p);
      try {
        const models = JSON.parse(db.prepare("SELECT models FROM col").get().models);
        const ids = Object.keys(models);
        assert.equal(ids.length, 1);
        // buildDeck uses model id 1; freshNoteType bumps it to 2
        assert.equal(ids[0], "2");
        assert.match(Object.values(models)[0].name, /· Klee One$/);
        const noteMids = db
          .prepare("SELECT DISTINCT mid FROM notes")
          .all()
          .map((r) => r.mid);
        assert.deepEqual(noteMids, [2], "notes repointed to the new note type id");
      } finally {
        db.close();
      }
    } finally {
      rmSync(tdir, { recursive: true, force: true });
    }
  });
});
