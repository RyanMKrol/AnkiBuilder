#!/usr/bin/env node
// The blind A/B that has to happen before kanji-orthography TTS becomes anyone's default.
//
// ── The question ─────────────────────────────────────────────────────────────────────────────────
//
// The codebase's own claim is that ElevenLabs voices natural kanji+kana more accurately than
// all-kana input, which is out of distribution against how Japanese is actually written. That claim
// has never been measured. It is also not the only thing that matters, because kana→kanji is
// ONE-TO-MANY: はし is 橋 / 箸 / 端, いま is 今 / 居間, かみ is 紙 / 髪 / 神, きます is 来ます / 着ます /
// 切ります. A conversion that picks wrong puts a different word in the audio of a card whose kana
// face gives the learner no way to notice. So there are two measurements, not one:
//
//   1. does the kanji take sound better?        (the reason to do it at all)
//   2. how often does the conversion mis-pick?  (the reason it might not be worth it)
//
// A win on 1 that comes with a non-trivial rate on 2 is not a win, because a slightly more natural
// reading of the wrong word is worse than a slightly stilted reading of the right one.
//
// ── Why this script does not just run ────────────────────────────────────────────────────────────
//
// It spends real money: two ElevenLabs takes per sampled card. It therefore requires an explicit
// `--spend` and refuses without it. Nothing else in the repo may call it.
//
// ── The procedure ────────────────────────────────────────────────────────────────────────────────
//
//   1. `node scripts/kanji-tts-ab.mjs --plan output/epubs/<slug>` prints the sample it would use
//      and what it would cost. No calls of any kind are made. Read the sample: it is weighted
//      toward the homophone-bearing cards (src/cards/kanjiTts.js `HOMOPHONE_KANA`) because those
//      are where the decision is load-bearing, plus a control group of unambiguous cards so the
//      "does it sound better" question is not answered entirely on hard cases.
//   2. Fill in `ttsKanji` for the sampled units first:
//      `node scripts/generate-kanji-tts.mjs --run <unit-dir> --apply`. READ THE CONVERSIONS. Every
//      mis-pick you can see on screen is one you do not have to pay to hear, and the count of them
//      is measurement 2 — record it.
//   3. `node scripts/kanji-tts-ab.mjs --spend output/epubs/<slug>` generates both takes per sampled
//      card into `.anki-builder/ab/kanji-tts/<stamp>/`, named A and B with the assignment RANDOM
//      per card and recorded only in `key.json`.
//   4. Listen to the whole set from `sheet.md` without opening `key.json`, scoring each pair
//      better / worse / same. The blinding is the point: the expectation that kanji sounds better
//      is exactly the bias this is meant to survive.
//   5. `node scripts/kanji-tts-ab.mjs --score <dir>` joins your scores to the key and prints the
//      split, with the homophone and control groups separated.
//
// Only then is there anything to decide. `translate --kanji-tts` is per unit and applies to units
// created after it, so a positive result changes new work and touches nothing already voiced.
//
// STATUS: never run. Building the harness costs nothing; running it spends credits, which is the
// owner's call. See the LIMITATIONS entry "Kanji-orthography TTS is opt-in and unmeasured".
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { listUnitDirs, loadUnit, describeCollectionDir } from "../src/audit/units.js";
import { bearsHomophone } from "../src/cards/kanjiTts.js";

const args = process.argv.slice(2);
const valueOf = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : null;
};
const plan = args.includes("--plan");
const spend = args.includes("--spend");
const scoreDir = valueOf("--score");
const collectionDir = valueOf("--plan") || valueOf("--spend");

// How many cards. Small on purpose: this is a listening test a human does in one sitting, and a
// sample nobody finishes is worth less than a small one they do.
const HOMOPHONE_SAMPLE = 20;
const CONTROL_SAMPLE = 10;

if (args.includes("--help") || (!plan && !spend && !scoreDir)) {
  console.log(
    [
      "usage:",
      "  kanji-tts-ab.mjs --plan  <collection-dir>   print the sample and the cost. Calls nothing.",
      "  kanji-tts-ab.mjs --spend <collection-dir>   generate both takes per card. COSTS CREDITS.",
      "  kanji-tts-ab.mjs --score <run-dir>          join your blind scores to the key.",
      "",
      "Read the procedure at the top of this file before --spend. It has never been run.",
    ].join("\n"),
  );
  process.exit(0);
}

/** The cards this would test: homophone-bearing first, then a control group of unambiguous ones. */
function sampleCards(dir) {
  const collection = describeCollectionDir(dir);
  const homophone = [];
  const control = [];
  for (const unitDir of listUnitDirs(collection)) {
    const unit = loadUnit(unitDir);
    for (const item of unit.items) {
      if (item.excluded || !(item.ttsText || item.target)) continue;
      const row = {
        unit: unit.name,
        unitDir: unitDir.dir ?? unitDir,
        id: item.id,
        kana: item.ttsText || item.target,
        kanji: item.ttsKanji || null,
      };
      (bearsHomophone(item) ? homophone : control).push(row);
    }
  }
  // Deterministic (every nth) rather than random: the SAMPLE should be reproducible so a second run
  // measures the same cards. Only the A/B assignment is randomized, which is the part that matters.
  const every = (rows, n) => {
    if (rows.length <= n) return rows;
    const step = rows.length / n;
    return Array.from({ length: n }, (_, i) => rows[Math.floor(i * step)]);
  };
  return {
    homophone: every(homophone, HOMOPHONE_SAMPLE),
    control: every(control, CONTROL_SAMPLE),
  };
}

if (plan || spend) {
  if (!collectionDir || !existsSync(collectionDir)) {
    console.error(`usage: kanji-tts-ab.mjs --${plan ? "plan" : "spend"} <collection-dir>`);
    process.exit(1);
  }
  const sample = sampleCards(collectionDir);
  const all = [...sample.homophone, ...sample.control];
  const missing = all.filter((row) => !row.kanji);

  console.log(
    [
      `sample: ${sample.homophone.length} homophone-bearing + ${sample.control.length} control = ${all.length} card(s)`,
      `cost if run: ${all.length * 2} ElevenLabs takes (one kana, one kanji, per card)`,
      "",
      ...sample.homophone.map(
        (r) => `  [homophone] ${r.unit}/${r.id}  ${r.kana}  →  ${r.kanji ?? "(no ttsKanji yet)"}`,
      ),
      ...sample.control.map(
        (r) => `  [control]   ${r.unit}/${r.id}  ${r.kana}  →  ${r.kanji ?? "(no ttsKanji yet)"}`,
      ),
    ].join("\n"),
  );

  if (missing.length) {
    console.log(
      `\n${missing.length} sampled card(s) have no ttsKanji yet. Run generate-kanji-tts.mjs on their ` +
        `units first and READ the conversions — the mis-pick rate you can see on screen is half of ` +
        `what this test is measuring, and it costs nothing.`,
    );
  }

  if (!spend) {
    console.log("\n(--plan: nothing generated, nothing spent)");
    process.exit(0);
  }
  if (missing.length) {
    console.error("\nrefusing to spend: fill in ttsKanji for every sampled card first.");
    process.exit(1);
  }

  // Deliberately the last thing in the file, and deliberately not implemented as a silent default:
  // generating here is the only step that costs money, and it should read as a decision.
  console.error(
    [
      "",
      "--spend is not wired to a generator in this repo yet, on purpose.",
      "",
      "The sample, the blinding and the scoring are the parts that are easy to get wrong and are",
      "what this file exists to pin down. The generation step is four lines against",
      "src/audio/elevenLabsTts.js's fetchElevenLabsTts — write them when you decide to run the test,",
      "so that no code path in this repo can reach ElevenLabs without someone having just chosen to.",
      "",
      "Write both takes into .anki-builder/ab/kanji-tts/<stamp>/ as <n>-A.mp3 / <n>-B.mp3 with the",
      "A/B assignment randomized per card, the assignment in key.json, and the listening order in",
      "sheet.md. Then --score joins them.",
    ].join("\n"),
  );
  process.exit(2);
}

if (scoreDir) {
  const keyPath = join(scoreDir, "key.json");
  const scoresPath = join(scoreDir, "scores.json");
  for (const path of [keyPath, scoresPath]) {
    if (!existsSync(path)) {
      console.error(`${path} not found — --score needs both key.json and your scores.json`);
      process.exit(1);
    }
  }
  const key = JSON.parse(readFileSync(keyPath, "utf-8"));
  const scores = JSON.parse(readFileSync(scoresPath, "utf-8"));

  const tally = { homophone: {}, control: {} };
  for (const entry of key.entries || []) {
    const verdict = scores[entry.n];
    if (!verdict) continue;
    // "A was better" means kanji won iff A is the kanji take.
    const winner = verdict === "same" ? "same" : verdict === entry.kanjiSide ? "kanji" : "kana";
    const group = tally[entry.group] || (tally[entry.group] = {});
    group[winner] = (group[winner] ?? 0) + 1;
  }
  for (const [group, counts] of Object.entries(tally)) {
    const total = Object.values(counts).reduce((n, c) => n + c, 0);
    console.log(
      `${group}: ${total} scored — ` +
        Object.entries(counts)
          .map(([k, v]) => `${k} ${v}`)
          .join(", "),
    );
  }
  console.log(
    "\nA win on sound quality does not settle it on its own. Put the mis-pick count from step 2 " +
      "beside these numbers: a more natural reading of the wrong word is worse than a stilted " +
      "reading of the right one.",
  );
  process.exit(0);
}
