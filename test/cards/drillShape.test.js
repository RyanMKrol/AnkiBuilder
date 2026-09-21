import test from "node:test";
import assert from "node:assert/strict";
import {
  dominantFrame,
  frameDistribution,
  itemsOnlyInFrame,
  drillCoverage,
} from "../../src/cards/drillShape.js";

const card = (target, extra = {}) => ({ id: target, target, ...extra });

/** Ten sentences, eight of which end in the same four-character frame. */
const concentrated = [
  card("ここでまってください"),
  card("ロビーでまってください"),
  card("ペンをかしてください"),
  card("ほんをかしてください"),
  card("メールをよんでください"),
  card("てがみをよんでください"),
  card("おんがくをきいてください"),
  card("ニュースをきいてください"),
  card("うちにかえって、テレビをみます"),
  card("ほんやにいって、ほんをかいます"),
];

test("a unit with too few sentences has no dominant frame, which is an answer and not a zero", () => {
  assert.equal(dominantFrame([card("みじかい"), card("ここです")]), null);
});

test("the dominant frame is the one most sentences end with", () => {
  const found = dominantFrame(concentrated);
  assert.ok(found.frame.endsWith("ください"), `unexpected frame: ${found.frame}`);
  assert.equal(found.count, 8);
  assert.equal(found.total, 10);
  assert.ok(found.share > 0.7);
});

test("a longer frame wins at equal count, so the real pattern beats the ending inside it", () => {
  const found = dominantFrame(concentrated);
  // "ください" and "てください" both describe these cards; the longer one is more informative.
  assert.ok(found.frame.length >= 4);
});

test("excluded cards are not counted, because they do not ship", () => {
  const withCuts = [...concentrated, card("けしたカード", { excluded: true })];
  assert.equal(dominantFrame(withCuts).total, 10);
});

test("frameDistribution reports every frame over the floor, largest first", () => {
  const dist = frameDistribution(concentrated, { minCount: 3 });
  assert.ok(dist.length > 0);
  for (let i = 1; i < dist.length; i++) assert.ok(dist[i - 1].count >= dist[i].count);
});

test("itemsOnlyInFrame finds taught items drilled ONLY inside the dominant frame", () => {
  const taught = [card("まって"), card("かえって"), card("およいで")];
  const only = itemsOnlyInFrame(taught, concentrated, "ください");
  const ids = only.map((o) => o.item.id);
  // まって appears twice, both times in a request; かえって appears once, in a linking sentence.
  assert.ok(ids.includes("まって"));
  assert.ok(!ids.includes("かえって"));
});

test("an item drilled NOWHERE is not reported here — that hole belongs to taughtNeverUsed", () => {
  const taught = [card("およいで")];
  assert.deepEqual(itemsOnlyInFrame(taught, concentrated, "ください"), []);
});

test("itemsOnlyInFrame with no frame reports nothing rather than everything", () => {
  assert.deepEqual(itemsOnlyInFrame([card("まって")], concentrated, null), []);
});

test("drillCoverage counts sentences per taught item, thinnest first", () => {
  const coverage = drillCoverage(
    [card("まって"), card("かえって"), card("およいで")],
    concentrated,
  );
  assert.equal(coverage[0].count, 0);
  assert.equal(coverage[0].item.id, "およいで");
  for (let i = 1; i < coverage.length; i++) assert.ok(coverage[i - 1].count <= coverage[i].count);
});

test("an optional-part headword counts the form a sentence actually writes", () => {
  // The book prints a handful of headwords with its optional-part notation — いろいろ(な), (お)さら —
  // and that literal string appears in no sentence. Before this, a card used every day read as
  // drilled zero times, which is the one number `leastDrilled` exists to report. Found by the final
  // review on Lesson 19, where いろいろ(な) showed 0 while two shipping sentences used いろいろな.
  const taught = [card("いろいろ(な)"), card("(お)さら")];
  const drills = [
    card("いろいろなサンプルをもらいました"),
    card("いろいろなカタログをみせてください"),
    card("おさらをとってください"),
  ];
  const coverage = drillCoverage(taught, drills);
  const by = Object.fromEntries(coverage.map((c) => [c.item.id, c.count]));
  assert.equal(by["いろいろ(な)"], 2);
  // Both readings count: (お)さら is さら or おさら depending on politeness, and which the sentence
  // uses is not knowable from the headword.
  assert.equal(by["(お)さら"], 1);
});

test("a plain headword is unaffected by the optional-part handling", () => {
  const coverage = drillCoverage([card("ほん")], [card("ほんをよみます"), card("ペンをかします")]);
  assert.equal(coverage[0].count, 1);
});
