#!/usr/bin/env node
// Builds src/reading/data/joyo-readings.json: the official school reading list (常用漢字表, the jōyō
// kanji and their approved readings), the reference every Japanese kanji card is completed to
// (src/reading/joyoReadings.js; owner decision, 2026-09-28).
//
//   node scripts/build-joyo-readings.mjs <List_of_jōyō_kanji wikitext>
//
// The input is the raw wikitext of English Wikipedia's "List of jōyō kanji"
// (https://en.wikipedia.org/w/index.php?title=List_of_j%C5%8Dy%C5%8D_kanji&action=raw), whose table
// reproduces the official list's readings: on readings in katakana, kun readings in hiragana with a
// hyphen before the kana ending (あわ-れ). Wikipedia text is CC BY-SA 4.0; the list itself is a
// government notice. src/reading/data/NOTICE.md carries the attribution.
import { readFileSync, writeFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

const input = process.argv[2];
if (!input) {
  console.error("usage: build-joyo-readings.mjs <List_of_jōyō_kanji wikitext>");
  process.exit(1);
}
// Six rows write their kanji as HTML character references (&#x6669; for 晩), to force the glyph.
const text = readFileSync(resolve(input), "utf-8").replace(/&#x([0-9a-f]+);/gi, (_, hex) =>
  String.fromCodePoint(parseInt(hex, 16)),
);
const toHiragana = (s) => s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
const KATAKANA = /^[゠-ヿ]+$/u;
const out = {};
for (const row of text.split(/\n\|-\n/)) {
  // Only the table's own rows, which open with their number (the page's introduction also links a
  // few kanji, the ones removed from the list in 2010).
  if (!/^\|\d+\|\|/.test(row)) continue;
  const kanji = row.match(/\[\[wikt:[^|]+\|(\p{Script=Han})\]\]/u)?.[1];
  if (!kanji) continue;
  const cells = row.split("||");
  const readingsCell = cells
    .at(-1)
    .split("<br>")[0]
    .replace(/<ref[^>]*\/>|<ref[^>]*>[\s\S]*?<\/ref>/g, "")
    .trim();
  const meaning = cells.at(-2)?.trim() ?? "";
  const parse = ({ includeBracketed }) => {
    const on = [];
    const kun = [];
    for (const raw of readingsCell.split(/[、,]\s*/)) {
      // A reading in brackets is, per the official table, a special or very narrow-use reading: not
      // one a learner's card lists, unless the kanji has no other (岡, 埼, 栃, 阜: prefecture names).
      if (!includeBracketed && /[(（]/.test(raw)) continue;
      const reading = raw.replace(/[()（）\s]/g, "");
      if (!reading) continue;
      if (KATAKANA.test(reading)) on.push(toHiragana(reading));
      else kun.push(reading.split("-")[0]);
    }
    return { on, kun };
  };
  let { on, kun } = parse({ includeBracketed: false });
  if (!on.length && !kun.length) ({ on, kun } = parse({ includeBracketed: true }));
  out[kanji] = { on: [...new Set(on)], kun: [...new Set(kun)], meaning };
}
const dest = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "src/reading/data/joyo-readings.json",
);
writeFileSync(
  dest,
  `${JSON.stringify({ source: "List of jōyō kanji, English Wikipedia (常用漢字表)", kanji: out })}\n`,
);
console.log(`${Object.keys(out).length} kanji written to ${dest}`);
