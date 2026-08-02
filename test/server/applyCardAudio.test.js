import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  rmSync,
  existsSync,
} from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { Buffer } from "buffer";
import {
  applyCardAudio,
  selectCardAudio,
  trimCardAudio,
  revertCardAudio,
  recleanCardAudio,
} from "../../src/server/adapters/applyCardAudio.js";

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

// --- the manual trim ------------------------------------------------------------------------------

// Fake cutter: records what it was handed and returns a marker naming the range, so a test can tell
// WHICH take a cut was made from without decoding audio.
// The cleanup chain is baked into the output the way the real cutter's would be, so a different chain
// yields different bytes — and therefore a different content-addressed filename, as in production.
function fakeCut(calls) {
  return (bytes, start, end, opts = {}) => {
    calls.push({ source: bytes.toString(), start, end, cleanup: opts.cleanup ?? null });
    const tag = opts.cleanup ? opts.cleanup.slice(0, 12) : "none";
    return Buffer.from("CUT(" + bytes.toString() + "," + start + "-" + end + "," + tag + ")");
  };
}

// Sets up a card that has been through the audio stage: an untouched original plus the trimmed take.
function trimmableCard(dir) {
  mkdirSync(join(dir, "audio"), { recursive: true });
  writeFileSync(join(dir, "audio", "take.orig.mp3"), "FULL-LENGTH");
  writeFileSync(join(dir, "audio", "take.mp3"), "AUTO");
  const cards = JSON.parse(readFileSync(join(dir, "cards.json"), "utf-8"));
  Object.assign(cards.items[0], {
    audio: "take.mp3",
    audioOriginal: "take.orig.mp3",
    audioAuto: "take.mp3",
  });
  writeFileSync(join(dir, "cards.json"), JSON.stringify(cards));
  return dir;
}

test("a hand trim cuts the ORIGINAL and ships the result, leaving the other takes alone", () => {
  const dir = trimmableCard(runDir());
  try {
    const calls = [];
    trimCardAudio(dir, "a", 0.2, 1.4, { trimToRange: fakeCut(calls) });

    assert.equal(calls.length, 1);
    assert.deepEqual(
      { source: calls[0].source, start: calls[0].start, end: calls[0].end },
      { source: "FULL-LENGTH", start: 0.2, end: 1.4 },
    );
    // A hand cut comes off the untouched original, so the cleanup has to be re-applied here or the
    // trim would quietly reintroduce the rumble the automatic take had removed.
    assert.match(calls[0].cleanup, /asubcut|highpass/, "the cut is cleaned too");
    const card = cardOf(dir);
    assert.match(card.audioManual, /^a-manual-[0-9a-f]{8}\.mp3$/);
    assert.deepEqual(card.audioTrim, { start: 0.2, end: 1.4 });
    assert.equal(card.audio, card.audioManual, "the hand cut wins the derive");
    assert.equal(card.audioOriginal, "take.orig.mp3", "the original is untouched");
    assert.equal(
      card.audioAuto,
      "take.mp3",
      "the automatic take is kept, so revert needs no re-cut",
    );
    assert.match(
      readFileSync(join(dir, "audio", card.audio), "utf-8"),
      /^CUT\(FULL-LENGTH,0\.2-1\.4,/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// The whole point of keeping the original. Re-cutting the PREVIOUS cut would compound the edits, so a
// selection made slightly too tight could only ever get tighter — the handles would be one-way.
test("re-trimming cuts the original again, not the previous cut", () => {
  const dir = trimmableCard(runDir());
  try {
    const calls = [];
    const cut = { trimToRange: fakeCut(calls) };
    trimCardAudio(dir, "a", 0.5, 1.0, cut);
    trimCardAudio(dir, "a", 0.1, 1.9, cut); // widened back out, past the first cut on both sides

    assert.deepEqual(
      calls.map((c) => c.source),
      ["FULL-LENGTH", "FULL-LENGTH"],
      "both cuts are made from the full-length take",
    );
    const card = cardOf(dir);
    assert.deepEqual(card.audioTrim, { start: 0.1, end: 1.9 });
    assert.match(
      readFileSync(join(dir, "audio", card.audio), "utf-8"),
      /^CUT\(FULL-LENGTH,0\.1-1\.9,/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("reverting drops the hand cut and falls back to the automatic take", () => {
  const dir = trimmableCard(runDir());
  try {
    trimCardAudio(dir, "a", 0.2, 1.4, { trimToRange: fakeCut([]) });
    revertCardAudio(dir, "a");

    const card = cardOf(dir);
    assert.equal("audioManual" in card, false);
    assert.equal("audioTrim" in card, false);
    assert.equal(card.audio, "take.mp3");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// A clip generated before originals were kept has no `audioOriginal`. It can still be trimmed — just
// not widened back out past what the automatic trim already removed.
test("a card with no original is trimmed from its shipping clip", () => {
  const dir = runDir();
  try {
    mkdirSync(join(dir, "audio"), { recursive: true });
    writeFileSync(join(dir, "audio", "legacy.mp3"), "ALREADY-TRIMMED");
    const cards = JSON.parse(readFileSync(join(dir, "cards.json"), "utf-8"));
    cards.items[0].audio = "legacy.mp3";
    writeFileSync(join(dir, "cards.json"), JSON.stringify(cards));

    const calls = [];
    trimCardAudio(dir, "a", 0, 0.9, { trimToRange: fakeCut(calls) });
    assert.equal(calls[0].source, "ALREADY-TRIMMED");
    assert.equal(cardOf(dir).audio, cardOf(dir).audioManual);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// Failing open here would tell the reviewer their cut landed while the card still holds the old clip.
test("a cutter failure surfaces as an error and leaves the card untouched", () => {
  const dir = trimmableCard(runDir());
  try {
    assert.throws(
      () =>
        trimCardAudio(dir, "a", 0.2, 1.4, {
          trimToRange: () => {
            throw new Error("ffmpeg is required to trim audio but was not found");
          },
        }),
      /ffmpeg is required to trim audio/,
    );
    const card = cardOf(dir);
    assert.equal("audioManual" in card, false);
    assert.equal(card.audio, "take.mp3", "the card still ships what it shipped before");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("trimming a card with no audio at all is refused", () => {
  const dir = runDir();
  try {
    assert.throws(() => trimCardAudio(dir, "a", 0, 1, { trimToRange: fakeCut([]) }), /no audio/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("trimming a card whose source is missing from disk is refused", () => {
  const dir = runDir();
  try {
    const cards = JSON.parse(readFileSync(join(dir, "cards.json"), "utf-8"));
    cards.items[0].audioOriginal = "vanished.orig.mp3";
    writeFileSync(join(dir, "cards.json"), JSON.stringify(cards));
    assert.throws(() => trimCardAudio(dir, "a", 0, 1, { trimToRange: fakeCut([]) }), /not found/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// --- switching the noise-cleanup chain -------------------------------------------------------------

test("re-cleaning re-derives from the ORIGINAL, so chains never stack on each other", async () => {
  const dir = trimmableCard(runDir());
  try {
    const seen = [];
    await recleanCardAudio(dir, "a", "aggressive", {
      trim: async (bytes) => {
        seen.push(bytes.toString());
        return Buffer.from("CLEANED");
      },
    });
    // Not "AUTO" — re-cleaning an already-cleaned take would compound the filters, and the result
    // would depend on the order the reviewer happened to click the buttons.
    assert.deepEqual(seen, ["FULL-LENGTH"]);
    const card = cardOf(dir);
    assert.equal(card.audioFilter, "aggressive");
    assert.equal(card.audioOriginal, "take.orig.mp3", "the original is never touched");
    assert.equal(card.audio, card.audioAuto);
    assert.equal(readFileSync(join(dir, "audio", card.audio), "utf-8"), "CLEANED");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("switching chains deletes the take the card is moving away from, never the stage clip", async () => {
  const dir = trimmableCard(runDir());
  try {
    const noopTrim = async () => Buffer.from("CLEANED");
    await recleanCardAudio(dir, "a", "gentle", { trim: noopTrim });
    assert.ok(existsSync(join(dir, "audio", "take.gentle.mp3")));
    // The stage's own take (no chain suffix) survives — it's shared with the durable cache.
    assert.ok(existsSync(join(dir, "audio", "take.mp3")));

    await recleanCardAudio(dir, "a", "aggressive", { trim: noopTrim });
    assert.ok(existsSync(join(dir, "audio", "take.aggressive.mp3")));
    // The previous chain's take is unreachable once the card points elsewhere — deleted, not litter.
    assert.equal(existsSync(join(dir, "audio", "take.gentle.mp3")), false);
    assert.ok(existsSync(join(dir, "audio", "take.orig.mp3")), "the original is never touched");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// Switching chains must not silently discard a hand cut the reviewer already made.
test("re-cleaning re-applies a saved hand trim under the new chain", async () => {
  const dir = trimmableCard(runDir());
  try {
    trimCardAudio(dir, "a", 0.3, 1.2, { trimToRange: fakeCut([]) });
    const before = cardOf(dir).audioManual;

    const cuts = [];
    await recleanCardAudio(dir, "a", "gentle", {
      trim: async () => Buffer.from("CLEANED"),
      trimToRange: fakeCut(cuts),
    });

    const card = cardOf(dir);
    assert.deepEqual(card.audioTrim, { start: 0.3, end: 1.2 }, "the range survives the switch");
    assert.equal(cuts[0].source, "FULL-LENGTH", "and is re-cut from the original");
    assert.equal(card.audio, card.audioManual, "the hand cut still wins the derive");
    assert.notEqual(card.audioManual, before, "under a new chain it is a new file");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a card with no untouched original cannot be re-cleaned", async () => {
  const dir = runDir();
  try {
    mkdirSync(join(dir, "audio"), { recursive: true });
    writeFileSync(join(dir, "audio", "legacy.mp3"), "OLD");
    const cards = JSON.parse(readFileSync(join(dir, "cards.json"), "utf-8"));
    cards.items[0].audio = "legacy.mp3";
    writeFileSync(join(dir, "cards.json"), JSON.stringify(cards));
    await assert.rejects(() => recleanCardAudio(dir, "a", "gentle", {}), /no untouched original/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// The chain names reach an ffmpeg command line, so only names from the fixed table are accepted.
test("an unknown cleanup name is refused before anything runs", async () => {
  const dir = trimmableCard(runDir());
  try {
    await assert.rejects(
      () => recleanCardAudio(dir, "a", "asubcut=cutoff=1; rm -rf /", {}),
      /unknown cleanup filter/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// A hand trim is cut from the untouched original, so without re-applying the cleanup it would quietly
// reintroduce the rumble the automatic take had removed.
test("a hand trim re-applies the card's own cleanup chain", () => {
  const dir = trimmableCard(runDir());
  try {
    const cards = JSON.parse(readFileSync(join(dir, "cards.json"), "utf-8"));
    cards.items[0].audioFilter = "aggressive";
    writeFileSync(join(dir, "cards.json"), JSON.stringify(cards));

    let opts = null;
    trimCardAudio(dir, "a", 0.2, 1.4, {
      trimToRange: (bytes, start, end, o) => {
        opts = o;
        return Buffer.from("CUT");
      },
    });
    assert.match(opts.cleanup, /asubcut=cutoff=130/, "the card's own chain, not the default");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
