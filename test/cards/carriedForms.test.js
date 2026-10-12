import test from "node:test";
import assert from "node:assert/strict";
import { missingCarriedForms } from "../../src/cards/carriedForms.js";

const verb = (target, english) => ({ id: target, target, english });
const dict = (target, english) => ({
  id: `${target}-dict`,
  target,
  english: `${english} (dictionary form)`,
});

test("an unconfigured language reports UNKNOWN (null), never a clean pass", () => {
  assert.equal(missingCarriedForms([verb("parler", "Speak")], { languageCode: "fr" }), null);
});

test("nothing is owed before the book introduces the form", () => {
  assert.deepEqual(missingCarriedForms([verb("ねます", "Sleep")], { languageCode: "ja" }), []);
});

test("after the form is introduced, a new verb without it is a gap", () => {
  const prior = [dict("たべる", "Eat")];
  const gaps = missingCarriedForms([verb("ねます", "Sleep"), verb("のみます", "Drink")], {
    priorItems: [...prior, dict("のむ", "Drink")],
    languageCode: "ja",
  });
  assert.deepEqual(
    gaps.map((g) => [g.target, g.carriedForm]),
    [["ねます", "dictionary form"]],
  );
});

test("the lesson that introduces the form owes it for every EARLIER verb too", () => {
  const gaps = missingCarriedForms([dict("たべる", "Eat")], {
    priorItems: [verb("たべます", "Eat"), verb("わかります", "Understand")],
    languageCode: "ja",
  });
  assert.deepEqual(
    gaps.map((g) => g.target),
    ["わかります"],
  );
});

test("each verb class is recognised without knowing the class", () => {
  const prior = [dict("いく", "Go")];
  const here = [
    verb("かえります", "Go home"), // Regular 1, り → る
    verb("おしえます", "Teach"), // Regular 2
    verb("きます", "Come"), // irregular
    verb("ダウンロードします", "Download"), // noun + する
    verb("もってきます", "Bring"), // compound of くる
  ];
  const owned = [
    ...here,
    dict("かえる", "Go home"),
    dict("おしえる", "Teach"),
    dict("くる", "Come"),
    dict("ダウンロードする", "Download"),
    dict("もってくる", "Bring"),
  ];
  assert.deepEqual(missingCarriedForms(owned, { priorItems: prior, languageCode: "ja" }), []);
});

test("a phrase is covered by its verb's form", () => {
  const gaps = missingCarriedForms(
    [verb("テニスをします", "Play tennis"), verb("シャワーをあびます", "Take a shower")],
    { priorItems: [dict("する", "Do")], languageCode: "ja" },
  );
  assert.deepEqual(
    gaps.map((g) => g.target),
    ["シャワーをあびます"],
  );
  const covered = missingCarriedForms([verb("シャワーをあびます", "Take a shower")], {
    priorItems: [dict("する", "Do"), dict("あびる", "Take (a shower)")],
    languageCode: "ja",
  });
  assert.deepEqual(covered, []);
});

test("sentences, set phrases, excluded cards and other forms are not verbs to conjugate", () => {
  const gaps = missingCarriedForms(
    [
      { id: "s", target: "ぎんこうがあります", english: "There is a bank." },
      { id: "g", target: "おはようございます", english: "Good morning" },
      { id: "o", target: "おねがいします", english: "Please" },
      { id: "n", target: "たべません", english: "Does not eat" },
      { id: "x", target: "ねます", english: "Sleep", excluded: true },
    ],
    { priorItems: [dict("する", "Do")], languageCode: "ja" },
  );
  assert.deepEqual(gaps, []);
});
