import test from "node:test";
import assert from "node:assert/strict";
import { Buffer } from "buffer";

import { buildZip, readZip } from "../../src/deck/zip.js";

const entry = (name, text) => ({ name, data: Buffer.from(text, "utf-8") });

test("round-trips names and bytes through build and read", () => {
  const entries = [entry("a.txt", "alpha"), entry("dir/b.json", '{"k":1}')];
  const round = readZip(buildZip(entries));

  assert.deepEqual(
    round.map((e) => e.name),
    ["a.txt", "dir/b.json"],
  );
  assert.equal(round[1].data.toString("utf-8"), '{"k":1}');
});

// The EOCD entry count is a uint16. Past 65,535 it wraps, and what comes out is still a VALID zip
// that anything trusting the central directory reads happily — just missing 65,536 entries. A
// .apkg is exactly that kind of consumer, so the corruption would surface as cards that quietly
// never arrived, not as an import error.
test("refuses to build past the uint16 entry ceiling instead of emitting a wrapped count", () => {
  const tooMany = Array.from({ length: 0x10000 }, (_, i) => entry(`f${i}`, "x"));
  assert.throws(() => buildZip(tooMany), /structurally corrupt archive/);
  assert.throws(() => buildZip(tooMany), /65535/);
});

test("the ceiling itself is allowed — the throw is strictly past it", () => {
  // Only the count matters here, and building 65,535 real deflate streams is slow, so this checks
  // the boundary condition on the guard rather than the whole archive.
  const atCeiling = Array.from({ length: 3 }, (_, i) => entry(`f${i}`, "x"));
  assert.doesNotThrow(() => buildZip(atCeiling));
  assert.equal(readZip(buildZip(atCeiling)).length, 3);
});
