import test from "node:test";
import assert from "node:assert";
import { romanize } from "../../../src/translate/romanization/ja.js";

// This is the slowest test in the suite — it genuinely loads kuromoji's ~40MB IPADIC dictionary
// on first call (module-level cache in ja.js means every test in this file after the first pays
// no extra cost). If CI time ever becomes a real problem, this is the file to gate behind a
// slower/separate test run — see .harness/custom/docs/LIMITATIONS.md's dependency-exception entry.

test("romanize() converts hiragana-only text to spaced romaji", async () => {
  const result = await romanize("これはねこです");
  assert.equal(result, "kore wa neko desu");
});

test("romanize() converts kanji-containing text to spaced romaji", async () => {
  const result = await romanize("これは猫です。");
  assert.equal(result, "kore wa neko desu .");
});

test("romanize() returns a Promise", () => {
  const result = romanize("ねこ");
  assert.ok(typeof result.then === "function");
});
