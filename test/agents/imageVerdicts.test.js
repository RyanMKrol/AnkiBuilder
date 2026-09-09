import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  VERDICT,
  writeVerdicts,
  readVerdicts,
  unaccountedImages,
  contentBearing,
} from "../../src/agents/imageVerdicts.js";

function withUnitDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), "verdicts-"));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const entries = [
  { src: "images/p016.jpg", verdict: VERDICT.REFERENCE_CHART, transcription: "0 ゼロ／れい" },
  { src: "images/p017.jpg", verdict: VERDICT.DECORATIVE },
  { src: "images/p018.jpg", verdict: VERDICT.UNREADABLE, note: "scan too low-contrast to read" },
];

test("every verdict is kept, including the boring ones", () => {
  withUnitDir((dir) => {
    writeVerdicts(dir, entries);
    const read = readVerdicts(dir);
    assert.equal(read.counts.total, 3);
    // Recording "decorative" is the point: what makes the failure invisible is an image with NO
    // entry, and that is only detectable when the uninteresting ones are present too.
    assert.equal(read.counts.byVerdict.decorative, 1);
    assert.equal(read.counts.byVerdict["reference-chart"], 1);
  });
});

test("an image nobody judged is reported, which is the whole check", () => {
  withUnitDir((dir) => {
    writeVerdicts(dir, entries);
    const referenced = ["images/p016.jpg", "images/p017.jpg", "images/p018.jpg", "images/p099.jpg"];
    assert.deepEqual(unaccountedImages(referenced, readVerdicts(dir)), ["images/p099.jpg"]);
  });
});

test("no verdicts at all means every image is unaccounted, not that there were none", () => {
  withUnitDir((dir) => {
    const referenced = ["images/p016.jpg"];
    assert.deepEqual(unaccountedImages(referenced, readVerdicts(dir)), referenced);
  });
});

test("'nobody looked' and 'looked and could not tell' are different answers", () => {
  withUnitDir((dir) => {
    writeVerdicts(dir, entries);
    const verdicts = readVerdicts(dir);
    // p018 is unreadable: judged, and worth a human's attention.
    assert.equal(unaccountedImages(["images/p018.jpg"], verdicts).length, 0);
    assert.equal(verdicts.entries.find((e) => e.src.endsWith("p018.jpg")).verdict, "unreadable");
  });
});

test("matching is on basename, so a full path and a filename agree", () => {
  withUnitDir((dir) => {
    writeVerdicts(dir, [{ src: "p016.jpg", verdict: VERDICT.CONTENT }]);
    assert.deepEqual(unaccountedImages(["../images/p016.jpg"], readVerdicts(dir)), []);
  });
});

test("content-bearing images are separable, so each can be checked against the corpus", () => {
  withUnitDir((dir) => {
    writeVerdicts(dir, entries);
    assert.deepEqual(
      contentBearing(readVerdicts(dir)).map((e) => e.src),
      ["images/p016.jpg"],
    );
  });
});

test("an unknown verdict is refused rather than sorting as not-content", () => {
  withUnitDir((dir) => {
    assert.throws(
      () => writeVerdicts(dir, [{ src: "a.jpg", verdict: "probably fine" }]),
      /unknown verdict/,
    );
    assert.throws(() => writeVerdicts(dir, [{ verdict: VERDICT.CONTENT }]), /needs the image src/);
    assert.equal(readVerdicts(dir), null, "nothing was written");
  });
});
