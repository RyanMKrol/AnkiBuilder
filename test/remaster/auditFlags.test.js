import test from "node:test";
import assert from "node:assert/strict";
import {
  describeDisagreements,
  renderAuditPrompt,
  parseAudit,
  applyCorrections,
} from "../../src/remaster/auditFlags.js";

// The flagged pages are judged by a model, so the model's answer is held to the same rule the
// settle guard enforces: a spot-check corrects a span, it does not rewrite a page.

const check = {
  onlyInOcr: "子×2 日",
  onlyInTranscript: "ス",
  wordsOnlyInOcr: "",
  wordsOnlyInTranscript: "menyuu",
  missingLines: [{ text: "たけし：いいえ、にほんじんです。", fromTop: 0.42 }],
  numberingGaps: ["2 is followed by 4"],
};

test("the auditor is asked about the disagreements, not the page", () => {
  const lines = describeDisagreements(check);
  assert.match(lines, /Characters the OCR saw .*子×2 日/);
  assert.match(lines, /Characters only the transcript has: ス/);
  assert.match(lines, /about 42% down the page.*たけし：いいえ/);
  assert.match(lines, /gap in numbered items: 2 is followed by 4/);
  const prompt = renderAuditPrompt({
    imagePath: "/w/page-060.jpg",
    bookTitle: "B",
    pageNumber: 60,
    transcript: '<page number="60"><p>あ</p></page>',
    check,
  });
  assert.match(prompt, /\/w\/page-060.jpg/);
  assert.match(prompt, /You are NOT re-transcribing the\npage/);
});

test("a verdict parses, and corrections are kept only when the transcript is judged wrong", () => {
  const correct = parseAudit(
    '{"verdict":"transcript-correct","reason":"OCR misread ソラ","corrections":[{"find":"a","replace":"b"}]}',
  );
  assert.deepEqual(correct.corrections, [], "a correct transcript gets no corrections");
  const wrong = parseAudit(
    '```json\n{"verdict":"transcript-wrong","reason":"the line is on the page","corrections":[{"find":"x","replace":"y"}]}\n```',
  );
  assert.deepEqual(wrong.corrections, [{ find: "x", replace: "y" }]);
  assert.throws(() => parseAudit('{"verdict":"maybe"}'), /unknown verdict/);
  assert.throws(
    () => parseAudit('{"verdict":"transcript-wrong","corrections":[{"find":1}]}'),
    /string find/,
  );
});

test("a correction is applied when its text occurs exactly once", () => {
  const body = "<p>たけし：はい。</p><p>メアリー：そうですか。</p>";
  const result = applyCorrections(body, [
    { find: "たけし：はい。", replace: "たけし：いいえ、にほんじんです。" },
  ]);
  assert.deepEqual(result.problems, []);
  assert.equal(result.applied, 1);
  assert.match(result.body, /にほんじんです/);
});

test("an ambiguous or missing swap changes nothing", () => {
  const body = "<p>はい。</p><p>はい。</p>";
  const twice = applyCorrections(body, [{ find: "はい。", replace: "いいえ。" }]);
  assert.match(twice.problems[0], /occurs 2 time\(s\)/);
  assert.equal(twice.body, body, "the page is left exactly as it was");
  const absent = applyCorrections(body, [{ find: "ありません", replace: "x" }]);
  assert.match(absent.problems[0], /occurs 0 time\(s\)/);
  assert.equal(absent.body, body);
});

test("an audit that rewrites the page is rejected, however plausible its swaps", () => {
  const body = "<p>" + "あ".repeat(400) + "</p>";
  const result = applyCorrections(body, [{ find: "あ".repeat(400), replace: "い".repeat(400) }]);
  assert.match(result.problems[0], /this is a rewrite, not a fix/);
  assert.equal(result.body, body);
});
