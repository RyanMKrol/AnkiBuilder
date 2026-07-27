import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { Buffer } from "buffer";
import { applyCardAudio, selectCardAudio } from "../../src/server/adapters/applyCardAudio.js";

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

test("the stored name is content-addressed on the uploaded bytes, so a re-upload busts the cache", async () => {
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
    // Two uploads, two takes each — the original and the clip trimmed from it.
    assert.equal(readdirSync(join(dir, "audio")).length, 4);
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

// --- takes, and the field the deck actually reads ------------------------------------------------

const cardOf = (dir) => JSON.parse(readFileSync(join(dir, "cards.json"), "utf-8")).items[0];

test("an upload is stored as the card's original, with the trimmed take derived from it", async () => {
  const dir = runDir();
  try {
    await applyCardAudio(dir, "a", Buffer.from("RAW"), "mp3", {
      trim: async () => Buffer.from("TRIMMED"),
    });
    const card = cardOf(dir);
    assert.match(card.audioOriginal, /\.orig\.mp3$/);
    assert.equal(
      readFileSync(join(dir, "audio", card.audioOriginal), "utf-8"),
      "RAW",
      "the original is kept verbatim so a hand trim can re-cut the full-length upload",
    );
    assert.equal(card.audio, card.audioAuto, "the trimmed take ships by default");
    assert.notEqual(card.audio, card.audioOriginal);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// An .mp3 upload's two takes would otherwise both want `<stem>.mp3`, and the trimmed one would
// silently overwrite the original — destroying the very thing the original exists to preserve.
test("an mp3 upload's original and trimmed take do not collide", async () => {
  const dir = runDir();
  try {
    await applyCardAudio(dir, "a", Buffer.from("RAW"), "mp3", {
      trim: async () => Buffer.from("TRIMMED"),
    });
    const card = cardOf(dir);
    assert.notEqual(card.audioOriginal, card.audioAuto);
    assert.equal(readFileSync(join(dir, "audio", card.audioOriginal), "utf-8"), "RAW");
    assert.equal(readFileSync(join(dir, "audio", card.audioAuto), "utf-8"), "TRIMMED");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// A trim that changed nothing needs no second file — the original IS the shipping take.
test("an untrimmed upload stores one file and ships the original", async () => {
  const dir = runDir();
  try {
    await applyCardAudio(dir, "a", Buffer.from("WAVE"), "wav", { trim: async (b) => b });
    const card = cardOf(dir);
    assert.equal(card.audioAuto, card.audioOriginal);
    assert.equal(card.audio, card.audioOriginal);
    assert.equal(readdirSync(join(dir, "audio")).length, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// A hand cut describes a range of the take it was made from. Leaving it in place across a new upload
// would keep it winning the derive, so the card would go on shipping a slice of the OLD recording.
test("replacing a card's audio clears a manual trim made against the previous take", async () => {
  const dir = runDir();
  try {
    const cards = JSON.parse(readFileSync(join(dir, "cards.json"), "utf-8"));
    Object.assign(cards.items[0], {
      audio: "a-manual-old.mp3",
      audioOriginal: "old.orig.mp3",
      audioAuto: "old.mp3",
      audioManual: "a-manual-old.mp3",
      audioTrim: { start: 0.2, end: 1.4 },
    });
    writeFileSync(join(dir, "cards.json"), JSON.stringify(cards));

    await applyCardAudio(dir, "a", Buffer.from("NEW"), "mp3", {
      trim: async () => Buffer.from("NEW-TRIMMED"),
    });

    const card = cardOf(dir);
    assert.equal("audioManual" in card, false);
    assert.equal("audioTrim" in card, false);
    assert.equal(card.audio, card.audioAuto, "the new upload's trimmed take ships");
    assert.equal(readFileSync(join(dir, "audio", card.audio), "utf-8"), "NEW-TRIMMED");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("selecting a generated variant records the variant's own original", async () => {
  const dir = runDir();
  try {
    mkdirSync(join(dir, "audio"), { recursive: true });
    writeFileSync(join(dir, "audio", "v-gen-1234.mp3"), "TRIMMED");
    writeFileSync(join(dir, "audio", "v-gen-1234.orig.mp3"), "RAW");

    selectCardAudio(dir, "a", "v-gen-1234.mp3", "v-gen-1234.orig.mp3");

    const card = cardOf(dir);
    assert.equal(card.audioOriginal, "v-gen-1234.orig.mp3");
    assert.equal(card.audioAuto, "v-gen-1234.mp3");
    assert.equal(card.audio, "v-gen-1234.mp3");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// Older previews (and any caller that doesn't know about originals) pass only the clip. It becomes
// both takes — honest about there being nothing longer to re-cut from.
test("selecting a variant with no original falls back to the clip itself", async () => {
  const dir = runDir();
  try {
    mkdirSync(join(dir, "audio"), { recursive: true });
    writeFileSync(join(dir, "audio", "v-gen-1234.mp3"), "CLIP");

    selectCardAudio(dir, "a", "v-gen-1234.mp3");

    const card = cardOf(dir);
    assert.equal(card.audioOriginal, "v-gen-1234.mp3");
    assert.equal(card.audio, "v-gen-1234.mp3");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("selecting a variant whose original is missing from the run dir is refused", async () => {
  const dir = runDir();
  try {
    mkdirSync(join(dir, "audio"), { recursive: true });
    writeFileSync(join(dir, "audio", "v-gen-1234.mp3"), "CLIP");
    assert.throws(
      () => selectCardAudio(dir, "a", "v-gen-1234.mp3", "v-gen-1234.orig.mp3"),
      /not found/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
