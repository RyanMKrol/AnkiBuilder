import { test } from "node:test";
import assert from "node:assert/strict";
import { hello } from "../src/index.js";

test("smoke: hello() returns the package name", () => {
  assert.equal(hello(), "anki-builder");
});
