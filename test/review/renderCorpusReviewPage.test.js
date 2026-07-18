import test from "node:test";
import assert from "node:assert/strict";
import { renderCorpusReviewPage } from "../../src/review/renderCorpusReviewPage.js";

function corpus(overrides = {}) {
  return {
    meta: { targetLanguage: "Japanese", sourceType: "epub" },
    items: [
      { id: "hello", english: "Hello", category: "Greetings", notes: null, target: "こんにちは" },
      { id: "bye", english: "Bye", category: "Greetings", notes: "informal", target: null },
    ],
    ...overrides,
  };
}

test("renderCorpusReviewPage() renders English/Category/Target/Flags columns", () => {
  const html = renderCorpusReviewPage(corpus());
  assert.match(
    html,
    /<th class="row-num">#<\/th><th>English<\/th><th>Category<\/th><th>Target<\/th><th>Flags<\/th><th>Note<\/th>/,
  );
  assert.match(html, /Hello/);
  assert.match(html, /こんにちは/);
});

test("renderCorpusReviewPage() adds a Reading column only when some item has a reading", () => {
  // No reading anywhere → no Reading column (unchanged four-column header).
  const plain = renderCorpusReviewPage(corpus());
  assert.doesNotMatch(plain, /<th>Reading \(spoken\)<\/th>/);

  // At least one reading → the column appears, between Target and Flags, showing the spoken form.
  const withReading = renderCorpusReviewPage(
    corpus({
      items: [
        {
          id: "price",
          english: "2,000 yen",
          category: "Shopping",
          notes: null,
          target: "2,000えん",
          reading: "にせんえん",
        },
      ],
    }),
  );
  assert.match(withReading, /<th>Target<\/th><th>Reading \(spoken\)<\/th><th>Flags<\/th>/);
  assert.match(withReading, /にせんえん/);
  assert.match(withReading, /2,000えん/);
});

test("renderCorpusReviewPage() renders badges for uncertain and aiSuggested items", () => {
  const html = renderCorpusReviewPage(
    corpus({
      items: [
        {
          id: "guess",
          english: "Guessed word",
          category: "Other",
          notes: null,
          target: "推測",
          uncertain: true,
        },
        {
          id: "gap",
          english: "Thank you",
          category: "Greetings",
          notes: null,
          target: "ありがとう",
          aiSuggested: true,
        },
      ],
    }),
  );
  assert.match(html, /<span class="badge badge-uncertain">Uncertain<\/span>/);
  assert.match(html, /<span class="badge badge-ai-suggested">AI-suggested<\/span>/);
});

test("renderCorpusReviewPage() renders an em dash placeholder for a null target", () => {
  const html = renderCorpusReviewPage(corpus());
  assert.match(html, /<span class="empty">—<\/span>/);
});

test("renderCorpusReviewPage() uses exclude mode", () => {
  const html = renderCorpusReviewPage(corpus());
  assert.match(html, /"excluded"/);
  assert.match(html, /No rows marked for exclusion\./);
});

test("renderCorpusReviewPage() surfaces target language and item count in the meta row", () => {
  const html = renderCorpusReviewPage(corpus());
  assert.match(html, /Japanese/);
  assert.match(html, /<span class="meta-value">2<\/span>/);
});

test("renderCorpusReviewPage() handles an empty corpus without throwing", () => {
  const html = renderCorpusReviewPage(corpus({ items: [] }));
  assert.match(html, /<tbody><\/tbody>/);
});

test("renderCorpusReviewPage() surfaces the human-readable chapter label in the meta row when present", () => {
  const html = renderCorpusReviewPage(
    corpus({
      meta: {
        targetLanguage: "Japanese",
        sourceType: "epub",
        chapterLabel: "Lesson 3: Asking the Time",
      },
    }),
  );
  assert.match(html, /<span class="meta-label">Chapter<\/span>/);
  assert.match(html, /<span class="meta-value">Lesson 3: Asking the Time<\/span>/);
});

test("renderCorpusReviewPage() omits the Chapter meta row when there's no chapterLabel", () => {
  const html = renderCorpusReviewPage(corpus());
  assert.doesNotMatch(html, /<span class="meta-label">Chapter<\/span>/);
});
