import test from "node:test";
import assert from "node:assert/strict";
import { reconcile, reconcileReason, candidateKey } from "../../src/cards/unionReconciler.js";
import { validateCorpus } from "../../src/model/index.js";

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

test("a target holding two readings becomes two entries, before the merge", () => {
  // From the first live shadow run: four targets came back as raw table cells (ゼロ／れい and
  // friends). A target holding two readings is not a word, and the readings after the separator
  // (れい, し, しち, く) are the target of no card in the real deck.
  const { items } = reconcile(
    [from("tableSpecialist", { id: "zero", target: "ゼロ／れい", english: "Zero" })],
    ja,
  );
  assert.deepEqual(
    items.map((i) => i.target),
    ["ゼロ", "れい"],
  );
  assert.deepEqual(
    items.map((i) => i.id),
    ["zero", "zero-alt2"],
  );
  assert.equal(items.filter((i) => /[／/]/.test(i.target)).length, 0);
});

test("each half names its sibling, because two cards glossed 'Zero' need separating", () => {
  const { items } = reconcile(
    [from("tableSpecialist", { id: "z", target: "ゼロ／れい", english: "Zero" })],
    ja,
  );
  assert.match(items[0].note, /Also read れい/);
  assert.match(items[1].note, /Also read ゼロ/);
  assert.equal(items[1].alternateOf, "ゼロ");
});

test("splitting happens before merging, so the halves join what other roles found alone", () => {
  // This ordering is the point: one role's ゼロ／れい becomes ゼロ + れい, and that ゼロ then merges
  // with the bare ゼロ another role found, rather than shipping as a third card.
  const { items, provenance } = reconcile(
    [
      from("tableSpecialist", { id: "zero", target: "ゼロ／れい", english: "Zero" }),
      from("chapterReader", { id: "zero2", target: "ゼロ", english: "Zero" }),
    ],
    ja,
  );
  assert.deepEqual(
    items.map((i) => i.target),
    ["ゼロ", "れい"],
  );
  assert.deepEqual(provenance[items[0].id].sort(), ["chapterReader", "tableSpecialist"]);
});

test("an existing note is kept, not replaced, when a target is split", () => {
  const { items } = reconcile(
    [
      from("tableSpecialist", {
        id: "z",
        target: "ゼロ／れい",
        english: "Zero",
        note: "Used in phone numbers.",
      }),
    ],
    ja,
  );
  assert.match(items[0].note, /Used in phone numbers\./);
  assert.match(items[0].note, /Also read れい/);
});

test("a target with no separator is untouched", () => {
  const { items } = reconcile(
    [from("tableSpecialist", { id: "a", target: "ねこ", english: "Cat" })],
    ja,
  );
  assert.equal(items.length, 1);
  assert.equal(items[0].target, "ねこ");
  assert.ok(!("alternateOf" in items[0]));
});

test("a field an agent volunteered is dropped from the corpus and reported, not carried into it", () => {
  // The first live run of chapter 17 died here. Phase 1 finished all ten steps, both deduplicators
  // ran, the forward pass ran, and the build then refused to write corpus.json over `fromTable` --
  // provenance the table specialist reports, already persisted in candidates/tables.json, needed by
  // nothing downstream. About twenty minutes of paid agent calls for a field nobody wanted. The
  // corpus schema is closed on purpose; what was wrong was making a whole build the unit of failure.
  const { items, droppedFields } = reconcile(
    [
      from("tableSpecialist", {
        id: "omiyage",
        target: "おみやげ",
        english: "Souvenir",
        category: "Shopping",
        fromTable: 3,
      }),
      from("chapterReader", {
        id: "onsen",
        target: "おんせん",
        english: "Hot spring",
        category: "Shopping",
        foundIn: "Key Sentences",
      }),
    ],
    ja,
  );

  assert.deepEqual(droppedFields, ["foundIn", "fromTable"]);
  for (const item of items) {
    assert.equal("fromTable" in item, false);
    assert.equal("foundIn" in item, false);
  }
  // And the item is still a valid corpus item, which is the actual point of the projection.
  assert.doesNotThrow(() =>
    validateCorpus({ meta: { targetLanguage: "ja", sourceType: "epub" }, items }),
  );
});

test("alternateOf survives the projection, because the reconciler itself writes it", () => {
  // The opposite call to fromTable, and the reason the projection reads its allowed set off the
  // schema instead of a hand-kept list. `alternateOf` is code-authored and load-bearing: it tells the
  // review gate this card is one reading of a printed pair. It was missing from the schema, so every
  // corpus containing a split headword was unwritable, and nothing caught it because the field only
  // appears when a chapter actually has one.
  const { items, droppedFields } = reconcile(
    [
      from("tableSpecialist", {
        id: "z",
        target: "ゼロ／れい",
        english: "Zero",
        category: "Numbers",
      }),
    ],
    ja,
  );

  assert.deepEqual(droppedFields, []);
  assert.equal(items[1].alternateOf, "ゼロ");
  assert.doesNotThrow(() =>
    validateCorpus({ meta: { targetLanguage: "ja", sourceType: "epub" }, items }),
  );
});

test("a category off the list becomes Other and is reported, so the corpus write cannot fail on it", () => {
  // Lesson 20's extras: the inventive author wrote "Daily Life", the phase finished, and prepare
  // died on the schema.
  const merged = reconcile(
    [
      from("inventiveAuthor", {
        id: "overslept",
        target: "ねぼうしました",
        english: "I overslept",
        category: "Daily Life",
      }),
      from("exerciseMiner", { id: "bus", target: "バス", english: "Bus", category: "Transport" }),
    ],
    ja,
  );
  const byId = Object.fromEntries(merged.items.map((i) => [i.id, i]));
  assert.equal(byId.overslept.category, "Other");
  assert.equal(byId.bus.category, "Transport");
  assert.deepEqual(merged.recategorized, [{ id: "overslept", category: "Daily Life" }]);
  assert.match(reconcileReason(merged), /overslept \("Daily Life"\)/);
  assert.doesNotThrow(() =>
    validateCorpus({ meta: { targetLanguage: "ja", sourceType: "epub" }, items: merged.items }),
  );
});

test("reconcileReason is null when nothing was repaired", () => {
  assert.equal(reconcileReason({ droppedFields: [], recategorized: [] }), null);
});
