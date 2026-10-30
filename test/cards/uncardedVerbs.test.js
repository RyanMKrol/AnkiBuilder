import test from "node:test";
import assert from "node:assert/strict";
import { uncardedVerbs } from "../../src/cards/uncardedVerbs.js";

const cards = (...targets) => targets.map((target, i) => ({ id: `c${i}`, target }));

test("a language with no scanner says so (null), never a clean pass", () => {
  assert.equal(uncardedVerbs("Je mange", [], "fr"), null);
});

test("a verb hiding inside an unrelated word is still found", () => {
  // The case that started this: おき sits inside おおきい ("big"), and containment called it met.
  const taught = cards("おおきい", "はちじ", "わたし", "きます");
  assert.deepEqual(uncardedVerbs("わたしは、はちじにおきます", taught, "ja"), ["おきます"]);
  assert.deepEqual(
    uncardedVerbs("わたしは、はちじにおきます", [...taught, ...cards("おきます")], "ja"),
    [],
  );
});

test("every polite form, て-form, ない-form and dictionary form maps back to its ます entry", () => {
  const taught = cards("のみます", "まちます", "よみます", "かきます", "たべます", "みます");
  for (const sentence of [
    "おちゃをのみました",
    "ロビーでまってください",
    "ほんをよんでください",
    "なまえをかいてください",
    "ここでたべないでください",
    "テレビをみるまえに",
    "コーヒーをのみたいです",
  ]) {
    assert.deepEqual(uncardedVerbs(sentence, taught, "ja"), [], sentence);
  }
  assert.deepEqual(uncardedVerbs("ここでおよがないでください", taught, "ja"), [
    "およがないでください",
  ]);
});

test("a phrase card counts for its verb, and a whole-phrase card for itself", () => {
  assert.deepEqual(
    uncardedVerbs("まいあさシャワーをあびます", cards("シャワーをあびます"), "ja"),
    [],
  );
  assert.deepEqual(uncardedVerbs("おなかがすきましたね", cards("おなかがすきました"), "ja"), []);
  assert.deepEqual(uncardedVerbs("それをみせてください", cards("みせてください"), "ja"), []);
});

test("grammar that ends like a verb is not one", () => {
  const taught = cards("いきます", "します", "しります", "って", "つまらない");
  for (const sentence of [
    "ゆうめいじゃありません", // the copula
    "さむくないです", // an adjective
    "このほんはつまらなかったです", // an adjective carded on its own
    "いまべんきょうをしています", // ています is する's て-form
    "おはようございます", // a set expression
    "にっこうって、どんなところ?", // the casual topic marker
    "やましたさんをしっていますか", // a name that ends like ました
  ]) {
    assert.deepEqual(uncardedVerbs(sentence, taught, "ja"), [], sentence);
  }
});

test("a verb after a multi-kana particle or an adverb is found from there", () => {
  const taught = cards("きます", "みます");
  assert.deepEqual(uncardedVerbs("フランスからきました", taught, "ja"), []);
  assert.deepEqual(uncardedVerbs("いいえ、あまりみません", taught, "ja"), []);
});
