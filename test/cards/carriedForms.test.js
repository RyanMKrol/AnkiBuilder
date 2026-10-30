import test from "node:test";
import assert from "node:assert/strict";
import { missingCarriedForms, jaExpectedForm } from "../../src/cards/carriedForms.js";

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

test("a ています progressive is not a verb entry of its own", () => {
  // Its dictionary form is the base verb's. Treating it as a source generated のんでいる and
  // のんでう as candidates, so Lesson 23's paradigm cells were reported as gaps no card could close.
  const prior = [dict("たべる", "Eat"), dict("のむ", "Drink")];
  const here = [verb("たべています", "Be eating"), verb("のんでいます", "Is drinking")];
  assert.deepEqual(missingCarriedForms(here, { priorItems: prior, languageCode: "ja" }), []);
});

// ── the て-form and the ない-form (owner ruling 2026-10-30) ─────────────────────────────────────

const te = (target, english, of) => ({
  id: `${target}-te`,
  target,
  english: `${english} (て-form of ${of})`,
});
const nai = (target, english) => ({ id: `${target}-nai`, target, english, hint: "casual form" });

test("each class gets its exact て-form and ない-form from the dictionary form", () => {
  const cases = [
    ["のみます", "のむ", "のんで", "のまない"],
    ["たべます", "たべる", "たべて", "たべない"],
    ["かえります", "かえる", "かえって", "かえらない"],
    ["かいます", "かう", "かって", "かわない"],
    ["かきます", "かく", "かいて", "かかない"],
    ["およぎます", "およぐ", "およいで", "およがない"],
    ["はなします", "はなす", "はなして", "はなさない"],
    ["まちます", "まつ", "まって", "またない"],
    ["いきます", "いく", "いって", "いかない"],
    ["きます", "くる", "きて", "こない"],
    ["します", "する", "して", "しない"],
    ["もってきます", "もってくる", "もってきて", "もってこない"],
    ["ダウンロードします", "ダウンロードする", "ダウンロードして", "ダウンロードしない"],
    ["あります", "ある", "あって", "ない"],
    // Looks like かいます's かって on the candidates, which is how the 2026-10 sweep missed it.
    ["かります", "かりる", "かりて", "かりない"],
  ];
  for (const [masu, dictionary, teForm, naiForm] of cases) {
    const dicts = [{ target: dictionary, english: "X (dictionary form)" }];
    assert.equal(jaExpectedForm(masu, "te", dicts), teForm, `${masu} て-form`);
    assert.equal(jaExpectedForm(masu, "nai", dicts), naiForm, `${masu} ない-form`);
  }
});

test("a phrase gets the form of its verb alone", () => {
  const dicts = [{ target: "あびる", english: "Take (a shower) (dictionary form)" }];
  assert.equal(jaExpectedForm("シャワーをあびます", "te", dicts), "あびて");
  assert.equal(
    jaExpectedForm("ねつがあります", "nai", [{ target: "ある", english: "Be (dictionary form)" }]),
    "ない",
  );
});

test("no dictionary form, or two that fit, means no exact form rather than a guess", () => {
  assert.equal(jaExpectedForm("のみます", "te", []), null);
  const both = [
    { target: "くる", english: "Come (dictionary form)" },
    { target: "きる", english: "Wear (dictionary form)" },
  ];
  assert.equal(jaExpectedForm("きます", "nai", both), null);
  assert.equal(jaExpectedForm("きます", "nai", both, "Come"), "こない", "the gloss settles it");
});

test("a Regular 1 き stem is not mistaken for a compound of くる", () => {
  // つきます once matched つくる ("make") and おきます matched おくる ("send").
  const dicts = [
    { target: "つく", english: "Arrive (dictionary form)" },
    { target: "つくる", english: "Make (dictionary form)" },
  ];
  assert.equal(jaExpectedForm("つきます", "nai", dicts), "つかない");
});

test("the て-form is owed from the lesson that introduces it, with its exact target", () => {
  const prior = [dict("のむ", "Drink"), dict("たべる", "Eat"), verb("のみます", "Drink")];
  const here = [te("たべて", "Eat", "たべます"), verb("たべます", "Eat")];
  const gaps = missingCarriedForms(here, { priorItems: prior, languageCode: "ja" });
  assert.deepEqual(
    gaps.map((g) => [g.key, g.expected, g.wantsSentence]),
    [["のみます (て-form)", "のんで", false]],
  );
});

test("an adjective's negative does not introduce the ない-form", () => {
  // Busy People's Casual Style 1 interlude teaches おおきくない before Lesson 18, and counting it
  // made every verb in the book owe a ない-form there.
  const prior = [dict("のむ", "Drink"), verb("のみます", "Drink")];
  const here = [
    { id: "a", target: "おおきくない", english: "Is not big." },
    { id: "b", target: "きれいじゃない", english: "Is not pretty / clean." },
  ];
  assert.deepEqual(missingCarriedForms(here, { priorItems: prior, languageCode: "ja" }), []);
});

test("an exact form closes the gap whatever the card calls itself, even in a later lesson", () => {
  const prior = [dict("あるく", "Walk"), dict("のむ", "Drink"), verb("あるきます", "Walk")];
  const here = [te("のんで", "Drink", "のみます"), verb("のみます", "Drink")];
  const owed = missingCarriedForms(here, { priorItems: prior, languageCode: "ja" });
  assert.deepEqual(
    owed.map((g) => g.expected),
    ["あるいて"],
  );
  const later = [{ id: "on-foot", target: "あるいて", english: "On foot" }];
  assert.deepEqual(
    missingCarriedForms(here, { priorItems: prior, laterItems: later, languageCode: "ja" }),
    [],
  );
});

test("a homophone's form does not close the gap, and its dictionary form is not borrowed", () => {
  const put = verb("おきます", "Put, place");
  const getUp = { ...verb("おきます", "Get up, wake up"), id: "okimasu-get-up" };
  // This lesson introduces the ない-form, so it owes one for every verb taught before it.
  const prior = [dict("のむ", "Drink"), dict("おく", "Put, place"), put, getUp];
  const here = [nai("おかない", "Does not put"), nai("のまない", "Does not drink")];
  // Without おきる the get-up verb has no exact form, so nothing is claimed for it either way.
  const before = missingCarriedForms(here, { priorItems: prior, languageCode: "ja" });
  assert.ok(!before.some((g) => g.expected === "おかない"), "never the other verb's form");
  // With おきる carded, its ない-form is exact and おかない does not stand in for it.
  const after = missingCarriedForms(here, {
    priorItems: [...prior, dict("おきる", "Get up, wake up")],
    languageCode: "ja",
  });
  assert.deepEqual(
    after.filter((g) => g.sourceId === "okimasu-get-up").map((g) => g.expected),
    ["おきない"],
  );
});
