#!/usr/bin/env node
// Builds src/reading/data/kanjidic2-compact.json, the kanji dictionary the Japanese reading plugin
// looks a kanji up in when a word uses it before the book teaches it (src/reading/kanjiDictionary.js).
//
//   node scripts/build-kanji-dictionary.mjs <kanjidic2-en-*.json>
//
// The input is KANJIDIC2 in JSON, from https://github.com/scriptin/jmdict-simplified/releases (the
// kanjidic2-en asset). Only kanji with a school grade are kept (the jōyō and jinmeiyō sets, about
// 3,000), with their English meanings, on and kun readings, grade and frequency rank: everything a
// learner will realistically meet, small enough to commit. A rarer kanji falls back to the model.
// KANJIDIC2 is CC BY-SA 4.0 (EDRDG); src/reading/data/NOTICE.md carries the attribution.
import { readFileSync, writeFileSync } from "fs";
import { resolve, join, dirname } from "path";
import { fileURLToPath } from "url";

const input = process.argv[2];
if (!input) {
  console.error("usage: build-kanji-dictionary.mjs <kanjidic2-en-*.json>");
  process.exit(1);
}
const source = JSON.parse(readFileSync(resolve(input), "utf-8"));
const out = {};
for (const c of source.characters) {
  if (!c.misc?.grade) continue;
  const groups = c.readingMeaning?.groups ?? [];
  const readings = (type) =>
    groups.flatMap((g) => g.readings.filter((r) => r.type === type).map((r) => r.value));
  const meanings = groups.flatMap((g) =>
    g.meanings.filter((m) => m.lang === "en").map((m) => m.value),
  );
  out[c.literal] = {
    m: meanings,
    on: readings("ja_on"),
    kun: readings("ja_kun"),
    g: c.misc.grade,
    ...(c.misc.frequency ? { f: c.misc.frequency } : {}),
  };
}
const dest = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "src/reading/data/kanjidic2-compact.json",
);
writeFileSync(
  dest,
  `${JSON.stringify({ source: `KANJIDIC2 ${source.dictDate} (jmdict-simplified ${source.version})`, kanji: out })}\n`,
);
console.log(`${Object.keys(out).length} kanji written to ${dest}`);
