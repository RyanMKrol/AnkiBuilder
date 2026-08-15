import test from "node:test";
import assert from "node:assert/strict";
import { BASE_CSS, modelCss } from "../../src/deck/cardStyles.js";
import { getLanguageFont } from "../../src/deck/fontLibrary.js";

// WCAG relative luminance and contrast ratio, from the spec. Computed rather than eyeballed, so a
// future colour tweak that drops a style below AA fails here instead of on the owner's phone.
const channel = (value) => {
  const s = value / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
};
function luminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  return (
    0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
  );
}
function contrast(a, b) {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

/** The `color` a rule sets, from the CSS text — no CSS parser, just the one property these use. */
function colorOf(css, selector) {
  // `[^{]*` absorbs the rest of a comma-separated selector list (the night-mode rules pair
  // `.night_mode` with the older `.nightMode` Anki stamps).
  const block = css.match(new RegExp(`${selector.replace(/\./g, "\\.")}[^{]*{([^}]*)}`));
  assert.ok(block, `no rule for ${selector}`);
  const color = block[1].match(/color:\s*(#[0-9a-f]{6})/i);
  assert.ok(color, `${selector} sets no colour`);
  return color[1].toLowerCase();
}

const LIGHT_BG = "#ffffff";
const AA = 4.5;

test("every text style on a light card clears WCAG AA", () => {
  // .note-back was #888888 (3.5:1) and the single shared cue style was #9a9284 (3.1:1) — the two
  // smallest text styles on the card were the two that failed.
  for (const selector of [".pron", ".note-back", ".scene", ".hint", ".field-label", ".cat-chip"]) {
    const ratio = contrast(colorOf(BASE_CSS, selector), LIGHT_BG);
    assert.ok(ratio >= AA, `${selector} is ${ratio.toFixed(2)}:1 on white, below AA (${AA}:1)`);
  }
});

test("every text style on a night-mode card clears WCAG AA", () => {
  const nightBg = BASE_CSS.match(/\.card\.night_mode[^}]*background-color:\s*(#[0-9a-f]{6})/i)[1];
  for (const selector of [
    ".night_mode .pron",
    ".night_mode .note-back",
    ".night_mode .scene",
    ".night_mode .hint",
    ".night_mode .field-label",
    ".night_mode .cat-chip",
  ]) {
    const ratio = contrast(colorOf(BASE_CSS, selector), nightBg);
    assert.ok(ratio >= AA, `${selector} is ${ratio.toFixed(2)}:1 in night mode, below AA`);
  }
});

// The same sentence rendered at 20px as a question and 26px bold as an answer made the harder
// direction the smaller one.
test("the prompt is set at the same size and weight as the answer", () => {
  const rule = (selector) => BASE_CSS.match(new RegExp(`\\${selector}\\s*{([^}]*)}`))[1];
  const size = (selector) => rule(selector).match(/font-size:\s*(\S+);/)[1];
  const weight = (selector) => rule(selector).match(/font-weight:\s*(\S+);/)[1];
  assert.equal(size(".prompt"), size(".answer"));
  assert.equal(weight(".prompt"), weight(".answer"));
});

// Two identical unlabelled grey lines stack on the Production front; the learner has to tell a
// situation cue apart from a word cue at a glance.
test("scene and hint are visually distinct, not one shared style", () => {
  assert.notEqual(colorOf(BASE_CSS, ".scene"), colorOf(BASE_CSS, ".hint"));
  assert.match(BASE_CSS, /\.scene\s*{[^}]*font-style:\s*italic/);
  assert.match(BASE_CSS, /\.hint\s*{[^}]*font-style:\s*normal/);
  assert.match(BASE_CSS, /\.hint::before\s*{[^}]*content:/);
  assert.doesNotMatch(BASE_CSS, /hint-front/, "the shared cue class is gone");
});

test("the language font is appended after the base CSS and only claims the target script", () => {
  const css = modelCss(getLanguageFont("ja"));
  assert.ok(css.startsWith(BASE_CSS), "the base rules come first so the font rule can win");
  assert.match(css, /unicode-range:/, "the font is scoped by unicode-range, per glyph");
  // Registering a Japanese font must not also restyle every Latin string on the card.
  assert.match(css, /font-family: "Klee One", arial;/);
  assert.doesNotMatch(css, /Helvetica Neue/);
});

test("a language with no configured font gets the base CSS unchanged", () => {
  assert.equal(modelCss(undefined), BASE_CSS);
});
