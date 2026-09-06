import test from "node:test";
import assert from "node:assert/strict";
import { reconcile, candidateKey } from "../../src/cards/unionReconciler.js";

const ja = { languageCode: "ja" };
const from = (role, ...items) => items.map((i) => ({ ...i, producedBy: role }));

test("an item two roles found is merged once, and both are credited", () => {
  const { items, provenance } = reconcile(
    [
      from("tableSpecialist", { id: "neko", target: "ねこ", english: "Cat", category: "Animals" }),
      from("chapterReader", { id: "neko", target: "ねこ", english: "Cat" }),
    ],
    ja,
  );
  assert.equal(items.length, 1);
  assert.deepEqual(provenance.neko, ["chapterReader", "tableSpecialist"]);
});

test("an item only one role found is KEPT, because that is why three roles exist", () => {
  // テニス was lost from a real lesson for appearing only in a drill's cue, and れい only in a
  // chart. Those are exactly the singletons a vote would delete.
  const { items, singletons } = reconcile(
    [
      from("tableSpecialist", { id: "neko", target: "ねこ", english: "Cat" }),
      from("chapterReader", { id: "tenisu", target: "テニス", english: "Tennis" }),
      from("imageSpecialist", { id: "rei", target: "れい", english: "Zero" }),
    ],
    ja,
  );
  assert.equal(items.length, 3);
  assert.deepEqual(singletons.sort(), ["neko", "rei", "tenisu"]);
});

test("the richer record wins the fields, and the thinner role is still credited", () => {
  const { items, provenance } = reconcile(
    [
      from("chapterReader", { id: "neko", target: "ねこ", english: "Cat" }),
      from("tableSpecialist", {
        id: "neko",
        target: "ねこ",
        english: "Cat",
        category: "Animals",
        note: "a house cat",
      }),
    ],
    ja,
  );
  assert.equal(items[0].category, "Animals", "information is not lost to a tie-break");
  assert.equal(provenance.neko.length, 2);
});

test("matching survives editorial spacing and a trailing 。, as the deck's own dedup does", () => {
  const { items } = reconcile(
    [
      from("tableSpecialist", { id: "a", target: "これは ペンです。", english: "This is a pen." }),
      from("chapterReader", { id: "b", target: "これはペンです", english: "This is a pen." }),
    ],
    ja,
  );
  assert.equal(items.length, 1);
});

test("a role that found only half the key folds into the role that found both", () => {
  // The image specialist reading れい off a chart with no gloss is AGREEING with the table
  // specialist that glossed it, not describing something else.
  const { items, provenance } = reconcile(
    [
      from("tableSpecialist", { id: "rei", target: "れい", english: "Zero" }),
      from("imageSpecialist", { id: "rei-img", target: "れい" }),
    ],
    ja,
  );
  assert.equal(items.length, 1);
  assert.equal(items[0].english, "Zero");
  assert.deepEqual(provenance[items[0].id], ["imageSpecialist", "tableSpecialist"]);
});

test("two words that differ only in spelling are NOT merged on their shared gloss", () => {
  // 〜さん and さん are the same word to a human, but resolving a wave dash is a language rule and
  // belongs to the dedup pass that owns it, not to a reconciler guessing from an identical gloss.
  const { items } = reconcile(
    [
      from("tableSpecialist", { id: "a", target: "〜さん", english: "Mr., Ms. (suffix)" }),
      from("chapterReader", { id: "b", target: "さん", english: "Mr., Ms. (suffix)" }),
    ],
    ja,
  );
  assert.equal(items.length, 2);
});

test("an item with no target and no english is kept, not folded into a neighbour", () => {
  assert.equal(candidateKey({ id: "x" }, "ja"), null);
  const { items } = reconcile([from("chapterReader", { id: "x" }, { id: "y" })], ja);
  assert.equal(items.length, 2);
});

test("id collisions across roles are resolved, because an id becomes an Anki note GUID", () => {
  // A duplicate id makes the package build refuse outright, and it used to do so only at Mark done,
  // after both reviews had been signed off.
  const { items, provenance } = reconcile(
    [
      from("tableSpecialist", { id: "hashi", target: "はし", english: "Bridge" }),
      from("chapterReader", { id: "hashi", target: "はし", english: "Chopsticks" }),
    ],
    ja,
  );
  assert.equal(items.length, 2, "two senses, not one");
  assert.deepEqual(
    items.map((i) => i.id),
    ["hashi", "hashi-2"],
  );
  assert.ok(provenance["hashi-2"]);
});

test("two senses sharing a target are kept AND named, so a reviewer sees the pair", () => {
  const { senseCollisions } = reconcile(
    [
      from("tableSpecialist", { id: "hashi", target: "はし", english: "Bridge" }),
      from("chapterReader", { id: "hashi", target: "はし", english: "Chopsticks" }),
    ],
    ja,
  );
  assert.deepEqual(senseCollisions, [{ target: "はし", ids: ["hashi", "hashi-2"] }]);
});

test("the merged item drops producedBy, since provenance carries the full list", () => {
  const { items } = reconcile([from("tableSpecialist", { id: "a", target: "ねこ" })], ja);
  assert.ok(!("producedBy" in items[0]));
});

test("agreement is reported as evidence, not applied as a threshold", () => {
  const { agreement } = reconcile(
    [
      from("tableSpecialist", { id: "a", target: "ねこ" }, { id: "b", target: "いぬ" }),
      from("chapterReader", { id: "a2", target: "ねこ" }),
    ],
    ja,
  );
  assert.equal(agreement.total, 2);
  assert.deepEqual(agreement.byRoleCount, { 1: 1, 2: 1 });
});
