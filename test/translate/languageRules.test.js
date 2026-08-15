import test from "node:test";
import assert from "node:assert/strict";
import {
  LANGUAGE_PROMPT_RULES,
  getLanguagePromptRules,
  romanizationExamples,
} from "../../src/translate/languageRules.js";
import { buildRomanizationPrompt } from "../../src/translate/romanizationEval.js";

const prompt = (language, code, items) =>
  buildRomanizationPrompt(items, language, { languageCode: code });

test("a language with no entry gets an empty fragment set rather than another language's", () => {
  assert.deepEqual(getLanguagePromptRules("es"), {});
  assert.deepEqual(getLanguagePromptRules(null), {});
});

// The whole finding: a Hindi or Arabic run was shown ろっかい and こんにちは as its worked examples,
// and told about the small っ. Few-shot examples dominate a one-line instruction, so the model was
// anchored on Japanese regardless of what the input actually was.
test("no non-Japanese romanization prompt contains any Japanese", () => {
  const kana = /[぀-ヿ]/;
  for (const [language, code, target] of [
    ["Hindi", "hi", "सड़क"],
    ["Arabic", "ar", "كتاب"],
    ["Hebrew", "he", "ספר"],
    ["Mandarin", "zh", "中国"],
    ["Korean", "ko", "안녕하세요"],
    ["Russian", "ru", "привет"],
    ["Spanish", "es", "libro"],
  ]) {
    const text = prompt(language, code, [{ id: "a", english: "x", target }]);
    assert.doesNotMatch(text, kana, `${language} prompt still shows Japanese`);
    assert.match(text, new RegExp(language), `${language} prompt does not name its language`);
  }
});

test("the Japanese prompt keeps its own exemplars and failure modes", () => {
  const text = prompt("Japanese", "ja", [
    { id: "a", english: "Sixth floor", target: "ろっかい", libraryPronunciation: "ro tsu kai" },
  ]);
  assert.match(text, /sokuon/);
  assert.match(text, /ろっかい/);
  assert.match(text, /"pronunciation": "rok-kai"/);
});

// Arabic and Hebrew have no library any more, so the prompt must not describe one — telling the
// model to "keep the library's value when it is right" when there is no value is noise at best.
test("a language with no library is not told about a library's value", () => {
  for (const [language, code, target] of [
    ["Arabic", "ar", "كتاب"],
    ["Hebrew", "he", "ספר"],
  ]) {
    const text = prompt(language, code, [{ id: "a", english: "Book", target }]);
    assert.doesNotMatch(text, /produced by a deterministic library/, language);
    assert.doesNotMatch(
      text,
      /libraryRomanization": "/,
      `${language} example invents a library value`,
    );
    // …and it IS told the thing the library could never do.
    assert.match(text, /SUPPLY THE FULL VOCALIZATION/, language);
  }
});

test("Arabic and Hebrew examples show a real vocalized answer, not a consonant skeleton", () => {
  const ar = prompt("Arabic", "ar", [{ id: "a", english: "Book", target: "كتاب" }]);
  assert.match(ar, /"pronunciation": "kitāb"/);
  assert.doesNotMatch(ar, /"ktab"/);
  const he = prompt("Hebrew", "he", [{ id: "a", english: "Book", target: "ספר" }]);
  assert.match(he, /"pronunciation": "sefer"/);
  assert.doesNotMatch(he, /"spr"/);
});

// Sanscript's devanagari→IAST is a Sanskrit scheme: every inherent schwa is pronounced. Hindi
// deletes it, and a nukta can leak through raw. Both are correctable, which is why hi keeps its
// library — but only if the prompt says so.
test("Hindi is told about schwa deletion and the nukta", () => {
  const text = prompt("Hindi", "hi", [
    { id: "a", english: "Road", target: "सड़क", libraryPronunciation: "saḍa़ka" },
  ]);
  assert.match(text, /SCHWA DELETION/);
  assert.match(text, /nukta/);
  assert.match(text, /"pronunciation": "saṛak"/);
  assert.match(text, /frequently WRONG for Hindi/);
});

test("a language with no examples of its own gets a script-free placeholder pair", () => {
  const neutral = romanizationExamples("es");
  assert.equal(neutral.length, 1);
  assert.match(neutral[0].target, /^<.*>$/, "the neutral example teaches shape, not a script");
});

// The fragments are a plug-in layer: every entry has to be shaped the way the renderers expect, or
// a language silently renders half a prompt.
test("every configured language's fragments are the shape the renderers read", () => {
  for (const [code, rules] of Object.entries(LANGUAGE_PROMPT_RULES)) {
    for (const key of [
      "translationStyle",
      "numberReadingStyle",
      "romanizationStyle",
      "libraryFailureModes",
    ]) {
      if (key in rules) assert.ok(Array.isArray(rules[key]), `${code}.${key} must be an array`);
    }
    if ("romanizationSystem" in rules)
      assert.equal(typeof rules.romanizationSystem, "string", code);
    for (const example of rules.romanizationExamples ?? []) {
      assert.equal(typeof example.id, "string", code);
      assert.equal(typeof example.target, "string", code);
      assert.equal(typeof example.pronunciation, "string", code);
    }
  }
});
