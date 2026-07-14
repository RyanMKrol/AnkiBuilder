import test from "node:test";
import assert from "node:assert/strict";
import { renderTranslateReviewPage } from "../../src/review/renderTranslateReviewPage.js";

function cards(overrides = {}) {
  return {
    meta: { targetLanguage: "Japanese", sourceType: "epub" },
    items: [
      {
        id: "hello",
        english: "Hello",
        category: "Greetings",
        target: "こんにちは",
        pronunciation: "konnichiwa",
        notes: "casual greeting",
      },
    ],
    ...overrides,
  };
}

test("renderTranslateReviewPage() renders English/Target/Pronunciation/Category columns", () => {
  const html = renderTranslateReviewPage(cards());
  assert.match(
    html,
    /<th class="row-num">#<\/th><th>English<\/th><th>Target<\/th><th>Pronunciation<\/th><th>Category<\/th><th>Note<\/th>/,
  );
  assert.match(html, /konnichiwa/);
});

test("renderTranslateReviewPage() uses exclude mode", () => {
  const html = renderTranslateReviewPage(cards());
  assert.match(html, /"excluded"/);
});

test("renderTranslateReviewPage() surfaces a note popover button when notes are present", () => {
  const html = renderTranslateReviewPage(cards());
  assert.match(html, /data-note="casual greeting"/);
});
