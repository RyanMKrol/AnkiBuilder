import test from "node:test";
import assert from "node:assert/strict";
import { Buffer } from "buffer";
import {
  getLanguageFont,
  fontFaceCss,
  readFontBytes,
  fontAssetPath,
} from "../../src/deck/fontLibrary.js";

test("Japanese maps to Klee One with an underscore-prefixed media name", () => {
  const d = getLanguageFont("ja");
  assert.equal(d.family, "Klee One");
  assert.equal(d.format, "woff2");
  assert.match(d.mediaName, /^_/); // underscore keeps Anki's Check Media from purging it
});

test("a language with no configured font returns undefined", () => {
  assert.equal(getLanguageFont("en"), undefined);
  assert.equal(getLanguageFont(null), undefined);
});

test("fontFaceCss references the family, media name, format, and Japanese unicode-range", () => {
  const css = fontFaceCss(getLanguageFont("ja"));
  assert.match(css, /@font-face/);
  assert.match(css, /font-family:\s*"Klee One"/);
  assert.match(css, /url\("_KleeOne-Regular\.woff2"\)/);
  assert.match(css, /format\("woff2"\)/);
  // scoped to Japanese so it never touches Latin text
  assert.match(css, /unicode-range:.*U\+3040-30FF/);
});

test("the bundled font file exists and is non-trivial", () => {
  const bytes = readFontBytes(getLanguageFont("ja"));
  assert.ok(Buffer.isBuffer(bytes));
  assert.ok(bytes.length > 10000, "a real font, not a stub");
  assert.match(
    fontAssetPath(getLanguageFont("ja")),
    /assets[/\\]fonts[/\\]KleeOne-Regular\.woff2$/,
  );
});
