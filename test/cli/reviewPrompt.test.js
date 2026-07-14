import test from "node:test";
import assert from "node:assert";
import { parseExclusionInput, runReviewLoop } from "../../src/cli/reviewPrompt.js";

test("parseExclusionInput() parses comma-separated numbers within range", () => {
  assert.deepEqual(parseExclusionInput("1, 3, 5", 5), [1, 3, 5]);
});

test("parseExclusionInput() ignores out-of-range and non-numeric entries", () => {
  assert.deepEqual(parseExclusionInput("1, foo, 99, 2", 3), [1, 2]);
});

test("parseExclusionInput() dedupes and sorts", () => {
  assert.deepEqual(parseExclusionInput("3, 1, 3, 1", 5), [1, 3]);
});

test("parseExclusionInput() returns an empty array for blank input", () => {
  assert.deepEqual(parseExclusionInput("", 5), []);
  assert.deepEqual(parseExclusionInput("   ", 5), []);
  assert.deepEqual(parseExclusionInput(undefined, 5), []);
});

test("runReviewLoop() excludes the requested item then returns the rest on confirmation", async () => {
  const items = [{ id: "a" }, { id: "b" }, { id: "c" }];
  // Round 1: exclude #2 (b). Round 2 (now [a, c]): no more exclusions, then confirm.
  const answers = ["2", "", "y"];
  const printed = [];

  const result = await runReviewLoop(items, {
    print: (line) => printed.push(line),
    ask: async () => answers.shift(),
  });

  assert.deepEqual(
    result.map((i) => i.id),
    ["a", "c"],
  );
  assert.equal(printed.length, 2); // re-rendered once after excluding item 2
});

test("runReviewLoop() keeps everything when the user confirms with no exclusions", async () => {
  const items = [{ id: "a" }, { id: "b" }];
  const answers = ["", "yes"];

  const result = await runReviewLoop(items, {
    print: () => {},
    ask: async () => answers.shift(),
  });

  assert.deepEqual(
    result.map((i) => i.id),
    ["a", "b"],
  );
});

test("runReviewLoop() re-prompts if the confirmation is declined", async () => {
  const items = [{ id: "a" }, { id: "b" }];
  const answers = ["", "n", "", "y"];

  const result = await runReviewLoop(items, {
    print: () => {},
    ask: async () => answers.shift(),
  });

  assert.deepEqual(
    result.map((i) => i.id),
    ["a", "b"],
  );
  assert.equal(answers.length, 0);
});

test("runReviewLoop() allows excluding across multiple rounds before confirming", async () => {
  const items = [{ id: "a" }, { id: "b" }, { id: "c" }];
  // Round 1: exclude #2 (b). Round 2 (now [a, c]): exclude #2 (c). Round 3 (now [a]):
  // no more exclusions, then confirm.
  const answers = ["2", "2", "", "y"];

  const result = await runReviewLoop(items, {
    print: () => {},
    ask: async () => answers.shift(),
  });

  assert.deepEqual(
    result.map((i) => i.id),
    ["a"],
  );
});
