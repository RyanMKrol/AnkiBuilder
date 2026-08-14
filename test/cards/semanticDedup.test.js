import test from "node:test";
import assert from "node:assert/strict";
import { dedupeByPattern } from "../../src/cards/semanticDedup.js";

const lesson = () => [
  { id: "src-1", english: "I'm from France.", target: "フランスからきました" },
  {
    id: "fib-1",
    english: "Mr Tanaka is from France.",
    target: "たなかさんはフランスから",
    fillInBlank: true,
  },
  {
    id: "fib-2",
    english: "Ms Smith is from France.",
    target: "スミスさんはフランスから",
    fillInBlank: true,
  },
];

const reply = (remove) => () => JSON.stringify({ remove });

test("excludes a redundant practice card instead of deleting it, with the reason on the card", () => {
  const items = lesson();
  const result = dedupeByPattern({
    items,
    targetLanguage: "ja",
    runClaude: reply([
      { id: "fib-2", pattern: "[person] は [place] から", reason: "Third example." },
    ]),
  });

  // Nothing is dropped from the list — the reviewer sees the call and can undo it in one click.
  assert.equal(result.items.length, 3);
  const excluded = result.items.find((i) => i.id === "fib-2");
  assert.equal(excluded.excluded, true);
  assert.match(excluded.reviewNote, /de-dup/);
  assert.match(excluded.reviewNote, /Third example\./);
  assert.deepEqual(
    result.excluded.map((e) => e.id),
    ["fib-2"],
  );
});

test("refuses to touch a source card even when the model names one", () => {
  const items = lesson();
  const result = dedupeByPattern({
    items,
    targetLanguage: "ja",
    runClaude: reply([{ id: "src-1", reason: "looks repetitive" }]),
  });
  assert.equal(result.items.find((i) => i.id === "src-1").excluded, undefined);
  assert.equal(result.excluded.length, 0);
});

test("ignores an unknown id and an already-excluded card", () => {
  const items = lesson();
  items[1].excluded = true;
  const result = dedupeByPattern({
    items,
    targetLanguage: "ja",
    runClaude: reply([{ id: "nope" }, { id: "fib-1" }]),
  });
  assert.equal(result.excluded.length, 0);
  // The already-excluded card keeps whatever note it had — this pass didn't make that call.
  assert.equal(items[1].reviewNote, undefined);
});

test("no practice cards → no model call at all", () => {
  let called = false;
  const items = [{ id: "src-1", english: "one", target: "いち" }];
  const result = dedupeByPattern({
    items,
    targetLanguage: "ja",
    runClaude: () => {
      called = true;
      return "{}";
    },
  });
  assert.equal(called, false);
  assert.equal(result.excluded.length, 0);
});

test("fails open on a malformed response, keeping every practice card", () => {
  const logged = [];
  const items = lesson();
  const result = dedupeByPattern({
    items,
    targetLanguage: "ja",
    log: (line) => logged.push(line),
    runClaude: () => "¯\\_(ツ)_/¯",
  });
  assert.equal(result.excluded.length, 0);
  assert.ok(result.items.every((i) => !i.excluded));
  assert.match(logged.join("\n"), /semantic de-dup: failed/);
});

// The pass is a machine judgement. `reviewNote` carries the prose, but it is free text a human also
// writes into, so provenance needs its own field to be countable.
test("stamps machine provenance on every card it excludes", () => {
  const items = lesson();
  dedupeByPattern({
    items,
    targetLanguage: "ja",
    runClaude: reply([{ id: "fib-2", pattern: "[person] は [place] から", reason: "Third one." }]),
  });

  const excluded = items.find((i) => i.id === "fib-2");
  assert.equal(excluded.excludedBy, "semantic-dedup");
  assert.match(excluded.excludedReason, /pattern: \[person\] は \[place\] から — Third one\./);

  const untouched = items.find((i) => i.id === "fib-1");
  assert.equal("excludedBy" in untouched, false);
});
