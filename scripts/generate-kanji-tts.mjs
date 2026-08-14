#!/usr/bin/env node
// Fill in a Japanese unit's `ttsKanji` — each card's kana rewritten in natural kanji+kana
// orthography — so a human can read the conversions before any of them is spoken.
//
// ElevenLabs mis-parses all-kana Japanese: it is out of distribution against how the language is
// actually written, so a kanji form voices more naturally (that is why the dashboard's per-card
// Generate (kanji) button exists at all). The button fuses two decisions, though: it converts,
// synthesizes and offers a take in one click, so the orthography only ever exists inside that one
// interaction and the only way to catch a bad conversion is by ear, after paying for it.
//
// This separates them. Converting a whole unit up front is a TEXT question — cheap, reviewable on
// screen, and wrong in ways a literate reader can see. It changes nothing about what is spoken:
// that is gated on the unit's `meta.kanjiTts` flag, set at unit creation with
// `translate --kanji-tts`. Storing the orthography is what makes the conversion reviewable; the
// flag is what makes it audible.
//
// COSTS MODEL CALLS (one per card, via the same runClaude as translate). It makes no ElevenLabs
// call and never touches audio.
//
// Usage:
//   node scripts/generate-kanji-tts.mjs --run <unit-dir>            # report what it would convert
//   node scripts/generate-kanji-tts.mjs --run <unit-dir> --apply    # convert and write
//   node scripts/generate-kanji-tts.mjs --run <unit-dir> --apply --force   # redo existing ones
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { generateUnitKanjiTts } from "../src/cards/kanjiTts.js";
import { writeUnitJson } from "../src/util/unitWrite.js";

const args = process.argv.slice(2);
const valueOf = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : null;
};
const runDir = valueOf("--run");
const apply = args.includes("--apply");
const force = args.includes("--force");

if (!runDir || args.includes("--help")) {
  console.log(
    [
      "usage: generate-kanji-tts.mjs --run <unit-dir> [--apply] [--force]",
      "  Converts each card's kana to natural kanji+kana orthography and stores it as `ttsKanji`.",
      "  Costs one model call per card. Speaks nothing: that needs `translate --kanji-tts` on the unit.",
    ].join("\n"),
  );
  process.exit(runDir ? 0 : 1);
}

const cardsPath = join(runDir, "cards.json");
if (!existsSync(cardsPath)) {
  console.error(`cards.json not found at ${cardsPath}`);
  process.exit(1);
}
const data = JSON.parse(readFileSync(cardsPath, "utf-8"));

if (!apply) {
  const pending = (data.items || []).filter(
    (i) => !i.excluded && (i.ttsText || i.target) && (force || !i.ttsKanji),
  );
  console.log(
    `${pending.length} card(s) would be converted (one model call each). Re-run with --apply.`,
  );
  process.exit(0);
}

const result = await generateUnitKanjiTts(data, { log: (line) => console.log(line), force });
if (result.converted > 0) {
  writeUnitJson(cardsPath, result.cards, { reason: "kanji-tts" });
}

console.log(
  [
    "",
    `${result.converted} converted, ${result.skipped} skipped, ${result.errors.length} failed`,
    ...(result.errors.length
      ? ["", "failed:", ...result.errors.map((e) => `  ${e.id}: ${e.message}`)]
      : []),
    "",
    data.meta?.kanjiTts
      ? "This unit is set to SPEAK the kanji — re-run `audio` to regenerate its clips."
      : "This unit still speaks the kana. Read the conversions above, then create future units with " +
        "`translate --kanji-tts` if you want them voiced from the kanji.",
  ].join("\n"),
);
if (result.errors.length) process.exit(1);
