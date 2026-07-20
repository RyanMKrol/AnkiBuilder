import test from "node:test";
import assert from "node:assert/strict";
import { getSimpleScriptRule } from "../../src/translate/targetScript.js";

// The Japanese specifics live ONLY in this language plug-in — the translate core knows nothing about
// kana/kanji.
test("getSimpleScriptRule returns the Japanese kana rule and null for everything else", () => {
  const ja = getSimpleScriptRule("ja");
  assert.match(ja, /kana/);
  assert.match(ja, /no kanji/i);

  assert.equal(getSimpleScriptRule("es"), null);
  assert.equal(getSimpleScriptRule("fr"), null);
  assert.equal(getSimpleScriptRule("zh"), null);
  assert.equal(getSimpleScriptRule(null), null);
  assert.equal(getSimpleScriptRule(undefined), null);
});
