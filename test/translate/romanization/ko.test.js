import test from "node:test";
import assert from "node:assert";
import { romanize } from "../../../src/translate/romanization/ko.js";

test("romanize() converts hangul to romanization", async () => {
  const result = await romanize("안녕하세요");
  assert.equal(result, "annyeonghaseyo");
});

test("romanize() returns a Promise even though koroman's own API is synchronous", () => {
  const result = romanize("안녕하세요");
  assert.ok(typeof result.then === "function");
});
