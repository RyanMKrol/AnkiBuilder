import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join, resolve } from "path";
import {
  JA_ROMAJI_STYLE,
  lintRomaji,
  romanizationStyleRules,
  unlintedRuleIds,
  formatStyleRules,
} from "../../src/translate/romajiStyle.js";
import { getLanguagePromptRules } from "../../src/translate/languageRules.js";
import { buildRomanizationPrompt } from "../../src/translate/romanizationEval.js";
import { renderNumberReadingPrompt } from "../../src/cards/numberReadings.js";
import { renderFillInBlankPrompt } from "../../src/cards/fillInBlank.js";

const REPO = resolve(join(dirname(fileURLToPath(import.meta.url)), "..", ".."));
const AUTHORING_RULES = join(
  REPO,
  ".claude",
  "skills",
  "build-anki-deck",
  "references",
  "card-authoring-rules.md",
);

test("every pinned rule reaches all three romanizing prompts, verbatim", () => {
  const prompts = {
    romanization: buildRomanizationPrompt([{ id: "x", english: "x", target: "こんにちは" }], "ja"),
    numberReading: renderNumberReadingPrompt({
      cards: [{ id: "x", english: "x", target: "2かい" }],
      targetLanguage: "ja",
    }),
    fillInBlank: renderFillInBlankPrompt({
      cards: [{ id: "x", english: "x", target: "こんにちは" }],
      targetLanguage: "ja",
    }),
  };
  for (const { id, rule } of JA_ROMAJI_STYLE) {
    for (const [name, prompt] of Object.entries(prompts)) {
      assert.ok(
        prompt.includes(rule),
        `the ${name} prompt lost the "${id}" rule — that pass would romanize to its own style again`,
      );
    }
  }
});

// The single-source claim, checked rather than asserted in a comment.
test("languageRules serves the pinned spec, not its own copy", () => {
  const rules = getLanguagePromptRules("ja");
  assert.deepEqual(rules.romanizationStyle, romanizationStyleRules("ja"));
  for (const rule of romanizationStyleRules("ja")) {
    assert.ok(rules.numberReadingStyle.includes(rule), `numberReadingStyle dropped: ${rule}`);
  }
});

// The hand-authoring reference copies the rules so an operator can read them without opening the
// code. This is what stops that copy from becoming a second, drifting source.
test("the card-authoring reference carries every pinned rule verbatim", () => {
  const doc = readFileSync(AUTHORING_RULES, "utf-8");
  for (const { id, rule } of JA_ROMAJI_STYLE) {
    assert.ok(
      doc.includes(rule),
      `card-authoring-rules.md is out of date with the "${id}" rule — paste the new text in`,
    );
  }
});

// A worked example that contradicts an injected rule is the most reliable way to make a model ignore
// the rule, which is exactly how the deck ended up with 209 hyphenated counters and a fused rest.
test("no shipped prompt's worked example breaks the style it injects", () => {
  const files = [
    "docs/romanization-prompt.md",
    "docs/number-reading-prompt.md",
    "docs/fill-in-blank-prompt.md",
  ];
  for (const file of files) {
    const text = readFileSync(join(REPO, file), "utf-8");
    for (const match of text.matchAll(/"pronunciation":\s*"([^"]+)"/g)) {
      const broken = lintRomaji(match[1], "ja");
      assert.equal(
        broken.length,
        0,
        `${file} shows "${match[1]}" as a worked example, which breaks: ${broken.map((b) => b.id).join(", ")}`,
      );
    }
  }
});

test("lint: each detectable rule fires on its own counter-example and not on a clean string", () => {
  const cases = [
    ["long-vowel-macron", "ginkou", "ginkō"],
    ["n-before-labial", "kombini", "konbini"],
    ["particles", "hon wo yomimasu", "hon o yomimasu"],
    ["sokuon", "ro tsu kai", "rok-kai"],
    ["no-terminal-punctuation", "konnichiwa.", "konnichiwa"],
    ["honorific-hyphen", "tanaka san wa", "Tanaka-san wa"],
    ["counter-hyphen", "gomai arimasu", "go-mai arimasu"],
    ["counter-hyphen", "mit-tsu", "mittsu"],
  ];
  for (const [id, bad, good] of cases) {
    assert.ok(
      lintRomaji(bad, "ja").some((b) => b.id === id),
      `"${bad}" should break ${id}`,
    );
    assert.deepEqual(
      lintRomaji(good, "ja").map((b) => b.id),
      [],
      `"${good}" should be clean`,
    );
  }
});

// The three the lint deliberately lets through, each for a stated reason. If one of these starts
// failing, someone tightened a detector into a false-positive machine.
test("lint: the known-ambiguous shapes are NOT reported", () => {
  for (const clean of [
    "mizuumi", // a doubled vowel across a morpheme boundary is genuine
    "san", // the number three, not a stripped honorific
    "nihon", // an ordinary word that merely looks like number + counter
    "Tanaka-san wa Nihon ni imasu", // proper-noun capitals are taught, not linted
  ]) {
    assert.deepEqual(lintRomaji(clean, "ja"), [], `"${clean}" must not be reported`);
  }
});

test("lint: a language with no pinned style is not linted, and says so", () => {
  assert.deepEqual(lintRomaji("anything at all.", "es"), []);
  assert.deepEqual(romanizationStyleRules("es"), []);
  assert.deepEqual(unlintedRuleIds("es"), []);
});

test("the taught-but-unlinted rules are reported by name, never silently dropped", () => {
  assert.deepEqual(unlintedRuleIds("ja").sort(), [
    "long-vowel-exceptions",
    "n-apostrophe",
    "proper-noun-casing",
  ]);
});

test("formatStyleRules indents every rule but the first", () => {
  assert.equal(formatStyleRules(["a", "b"], { indent: "  " }), "- a\n  - b");
});
