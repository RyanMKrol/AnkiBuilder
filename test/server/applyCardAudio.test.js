import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { Buffer } from "buffer";
import { applyCardAudio } from "../../src/server/adapters/applyCardAudio.js";

function runDir() {
  const dir = mkdtempSync(join(tmpdir(), "upload-"));
  writeFileSync(
    join(dir, "cards.json"),
    JSON.stringify({
      meta: { targetLanguage: "ja", sourceType: "epub" },
      items: [{ id: "a", english: "Ah", category: "Other", target: "あ", pronunciation: "a" }],
    }),
  );
  return dir;
}
const clipOf = (dir) => JSON.parse(readFileSync(join(dir, "cards.json"), "utf-8")).items[0].audio;

// Trimming used to happen only inside the ElevenLabs fetch, so a hand-uploaded replacement kept
// whatever trailing silence it arrived with while every generated clip beside it had been cleaned.
test("an uploaded clip is trimmed like a generated one", async () => {
  const dir = runDir();
  try {
    const seen = [];
    await applyCardAudio(dir, "a", Buffer.from("RAW-WITH-SILENCE"), "mp3", {
      trim: async (bytes) => {
        seen.push(bytes.toString());
        return Buffer.from("TRIMMED");
      },
    });
    assert.deepEqual(seen, ["RAW-WITH-SILENCE"]);
    assert.equal(readFileSync(join(dir, "audio", clipOf(dir)), "utf-8"), "TRIMMED");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// The trimmer re-encodes to mp3. Storing its output under the uploaded .wav name would be a worse bug
// than not trimming at all.
test("a trimmed upload is stored as .mp3 whatever it arrived as", async () => {
  const dir = runDir();
  try {
    await applyCardAudio(dir, "a", Buffer.from("WAVE-BYTES"), "wav", {
      trim: async () => Buffer.from("TRIMMED-MP3"),
    });
    assert.match(clipOf(dir), /\.mp3$/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// Best-effort: no ffmpeg, or any failure, returns the original bytes — and then the upload must keep
// its own format, because nothing was re-encoded.
test("an untrimmed upload keeps its original bytes and extension", async () => {
  const dir = runDir();
  try {
    const original = Buffer.from("WAVE-BYTES");
    await applyCardAudio(dir, "a", original, "wav", { trim: async (b) => b });
    assert.match(clipOf(dir), /\.wav$/);
    assert.equal(readFileSync(join(dir, "audio", clipOf(dir)), "utf-8"), "WAVE-BYTES");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the stored name is content-addressed on the FINAL bytes, so a re-upload busts the cache", async () => {
  const dir = runDir();
  try {
    await applyCardAudio(dir, "a", Buffer.from("v1"), "mp3", {
      trim: async () => Buffer.from("T1"),
    });
    const first = clipOf(dir);
    await applyCardAudio(dir, "a", Buffer.from("v2"), "mp3", {
      trim: async () => Buffer.from("T2"),
    });
    assert.notEqual(clipOf(dir), first, "a new upload must get a new /media URL");
    assert.equal(readdirSync(join(dir, "audio")).length, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("an unsupported extension is still refused before anything is written", async () => {
  const dir = runDir();
  try {
    await assert.rejects(
      () => applyCardAudio(dir, "a", Buffer.from("x"), "exe", { trim: async (b) => b }),
      /unsupported audio extension/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
