import test from "node:test";
import assert from "node:assert";
import { promises as fs } from "fs";
import { join, resolve } from "path";
import os from "os";
import { Buffer } from "buffer";
import { createHash } from "crypto";
import {
  generateAudio as generateAudioImpl,
  deriveCardAudio,
  isStageOwnedCard,
  defaultClipFilename,
} from "../../src/audio/index.js";
import { TTS_MODEL } from "../../src/audio/ttsModel.js";

// The core-mechanics tests below (dedup, caching, hashing, ttsText-vs-target) exercise the default
// recording pass — the only one there is; the with-。 / no-。 pair the alt-audio transform used to
// produce is gone, replaced by the end marker.
//
// The trim is stubbed to a no-op by default too. generateAudio derives each card's trimmed take
// itself now, and the real trimmer SHELLS OUT to ffmpeg — which would make these tests slow and
// dependent on whether the machine happens to have it installed. Tests that care about the trim pass
// their own; see "keeps the untouched original beside the trimmed take" below.
// Japanese TTS text carries a throwaway end marker (src/audio/ttsMarker.js) — `。ででで` — so
// ElevenLabs truncates that instead of the card's actual words. It is part of the text SENT and so
// part of the cache key, which is why the expected strings and hashes below include it. The `。` is
// part of the MARKER, not of the card's text: it is what makes the model leave a gap in front of the
// marker, which is what makes the marker findable and removable.
const noTrim = async (bytes) => bytes;

// Every cached term is two files — the shipping clip and its untouched `.orig.mp3` sibling. Tests
// asserting "one clip per term" mean the shipping ones, so count those rather than raw directory
// entries, and keep saying what they were always about.
const shippingClips = (files) => files.filter((f) => !f.endsWith(".orig.mp3"));

function generateAudio(cards, opts = {}) {
  return generateAudioImpl(cards, { trim: noTrim, ...opts });
}

function baseCards(items) {
  return {
    meta: { targetLanguage: "ja", sourceType: "manual" },
    items,
  };
}

async function withTempDir(fn) {
  const tmpDir = await fs.mkdtemp(join(os.tmpdir(), "audio-test-"));
  try {
    return await fn(tmpDir);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

test("writes one MP3 per unique target term into voice-specific cache dir", async () => {
  const originalKey = process.env.ELEVENLABS_API_KEY;
  process.env.ELEVENLABS_API_KEY = "test-key";

  try {
    await withTempDir(async (tmpDir) => {
      const cards = baseCards([
        { id: "a1", english: "Hello", category: "Greetings", target: "こんにちは" },
        { id: "a2", english: "Goodbye", category: "Greetings", target: "さようなら" },
      ]);

      const calls = [];
      const mockFetchTts = async (term) => {
        calls.push(term);
        return Buffer.from(`audio for ${term}`);
      };

      await generateAudio(cards, {
        voiceId: "voice123",
        fetchTts: mockFetchTts,
        libraryHomeDir: tmpDir,
        model: "test-model",
      });

      assert.equal(calls.length, 2);
      assert.deepEqual(new Set(calls), new Set(["こんにちは。ででで", "さようなら。ででで"]));

      // Cache is segmented by model: audio/<voiceId>/<model>/
      const audioDir = resolve(join(tmpDir, "audio", "voice123", "test-model"));
      const files = await fs.readdir(audioDir);
      // Two takes per term: the shipping <hash>.mp3 and its untouched <hash>.orig.mp3 sibling.
      assert.equal(files.length, 4);
      assert.equal(files.filter((f) => f.endsWith(".orig.mp3")).length, 2);

      for (const file of files) {
        const content = await fs.readFile(resolve(join(audioDir, file)), "utf8");
        assert(content.startsWith("audio for"));
      }
    });
  } finally {
    if (originalKey) {
      process.env.ELEVENLABS_API_KEY = originalKey;
    } else {
      delete process.env.ELEVENLABS_API_KEY;
    }
  }
});

test("skips excluded cards: no TTS fetch, and their audio field is cleared", async () => {
  const originalKey = process.env.ELEVENLABS_API_KEY;
  process.env.ELEVENLABS_API_KEY = "test-key";
  try {
    await withTempDir(async (tmpDir) => {
      const cards = baseCards([
        { id: "a1", english: "Hello", category: "Greetings", target: "こんにちは" },
        // Excluded — must not be synthesized, and its stale audio must be dropped.
        {
          id: "x1",
          english: "Drop me",
          category: "Other",
          target: "すてる",
          excluded: true,
          audio: "stale.mp3",
        },
      ]);

      const calls = [];
      const result = await generateAudio(cards, {
        voiceId: "voice123",
        fetchTts: async (term) => {
          calls.push(term);
          return Buffer.from("audio data");
        },
        libraryHomeDir: tmpDir,
      });

      // Only the active card is fetched — the excluded one is never sent to TTS.
      assert.deepEqual(calls, ["こんにちは。ででで"]);
      assert.ok(result.items[0].audio, "active card is annotated with audio");
      assert.equal("audio" in result.items[1], false, "excluded card's audio is cleared");
      assert.equal(result.items[1].excluded, true, "the exclusion flag is preserved");
    });
  } finally {
    if (originalKey) process.env.ELEVENLABS_API_KEY = originalKey;
    else delete process.env.ELEVENLABS_API_KEY;
  }
});

test("leaves hand-picked cards alone on a re-run: no fetch, fields untouched", async () => {
  const originalKey = process.env.ELEVENLABS_API_KEY;
  process.env.ELEVENLABS_API_KEY = "test-key";
  try {
    await withTempDir(async (tmpDir) => {
      const picked = {
        id: "p1",
        english: "Picked",
        category: "Other",
        target: "えらんだ",
        // A dashboard-picked Generate variant — not the stage's to regenerate.
        audio: "abcd1234-gen-9f9f9f9f.mp3",
        audioOriginal: "abcd1234-gen-9f9f9f9f.orig.mp3",
      };
      const trimmed = {
        id: "m1",
        english: "Hand-cut",
        category: "Other",
        target: "きった",
        audio: "m1-manual-1-2.mp3",
        audioAuto: "deadbeefdeadbeef.mp3",
        audioOriginal: "deadbeefdeadbeef.orig.mp3",
        audioManual: "m1-manual-1-2.mp3",
        audioTrim: { start: 0.1, end: 1.2 },
      };
      const cards = baseCards([
        { id: "a1", english: "Hello", category: "Greetings", target: "こんにちは" },
        picked,
        trimmed,
      ]);

      const calls = [];
      const result = await generateAudio(cards, {
        voiceId: "voice123",
        fetchTts: async (term) => {
          calls.push(term);
          return Buffer.from("audio data");
        },
        libraryHomeDir: tmpDir,
      });

      // Only the stage-owned card is synthesized; the hand-picked ones cost nothing.
      assert.deepEqual(calls, ["こんにちは。ででで"]);
      // And they come back byte-for-byte untouched — including the manual trim.
      assert.deepEqual(result.items[1], picked);
      assert.deepEqual(result.items[2], trimmed);
    });
  } finally {
    if (originalKey) process.env.ELEVENLABS_API_KEY = originalKey;
    else delete process.env.ELEVENLABS_API_KEY;
  }
});

test("uses stable hash so same term yields same filename across runs", async () => {
  const originalKey = process.env.ELEVENLABS_API_KEY;
  process.env.ELEVENLABS_API_KEY = "test-key";

  try {
    await withTempDir(async (tmpDir) => {
      const term = "こんにちは";
      const cards1 = baseCards([
        { id: "a1", english: "Hello", category: "Greetings", target: term },
      ]);
      const cards2 = baseCards([
        { id: "a2", english: "Hello 2", category: "Greetings", target: term },
      ]);

      let callCount = 0;
      const mockFetchTts = async () => {
        callCount++;
        return Buffer.from("audio data");
      };

      const result1 = await generateAudio(cards1, {
        voiceId: "voice123",
        fetchTts: mockFetchTts,
        libraryHomeDir: tmpDir,
      });

      const result2 = await generateAudio(cards2, {
        voiceId: "voice123",
        fetchTts: mockFetchTts,
        libraryHomeDir: tmpDir,
      });

      assert.equal(result1.items[0].audio, result2.items[0].audio);
      assert.equal(callCount, 1);
    });
  } finally {
    if (originalKey) {
      process.env.ELEVENLABS_API_KEY = originalKey;
    } else {
      delete process.env.ELEVENLABS_API_KEY;
    }
  }
});

test("is idempotent: second run with files present makes zero calls (cache hit)", async () => {
  const originalKey = process.env.ELEVENLABS_API_KEY;
  process.env.ELEVENLABS_API_KEY = "test-key";

  try {
    await withTempDir(async (tmpDir) => {
      const cards = baseCards([
        { id: "a1", english: "Hello", category: "Greetings", target: "こんにちは" },
        { id: "a2", english: "Goodbye", category: "Greetings", target: "さようなら" },
      ]);

      let callCount = 0;
      const mockFetchTts = async () => {
        callCount++;
        return Buffer.from("audio data");
      };

      await generateAudio(cards, {
        voiceId: "voice123",
        fetchTts: mockFetchTts,
        libraryHomeDir: tmpDir,
      });

      assert.equal(callCount, 2);

      await generateAudio(cards, {
        voiceId: "voice123",
        fetchTts: mockFetchTts,
        libraryHomeDir: tmpDir,
      });

      assert.equal(callCount, 2);
    });
  } finally {
    if (originalKey) {
      process.env.ELEVENLABS_API_KEY = originalKey;
    } else {
      delete process.env.ELEVENLABS_API_KEY;
    }
  }
});

test("handles multiple cards with duplicate target terms", async () => {
  const originalKey = process.env.ELEVENLABS_API_KEY;
  process.env.ELEVENLABS_API_KEY = "test-key";

  try {
    await withTempDir(async (tmpDir) => {
      const cards = baseCards([
        { id: "a1", english: "Hello", category: "Greetings", target: "こんにちは" },
        { id: "a2", english: "Hello 2", category: "Greetings", target: "こんにちは" },
        { id: "a3", english: "Goodbye", category: "Greetings", target: "さようなら" },
      ]);

      const calls = [];
      const mockFetchTts = async (term) => {
        calls.push(term);
        return Buffer.from(`audio for ${term}`);
      };

      const result = await generateAudio(cards, {
        voiceId: "voice123",
        fetchTts: mockFetchTts,
        libraryHomeDir: tmpDir,
      });

      assert.equal(calls.length, 2);
      assert.deepEqual(new Set(calls), new Set(["こんにちは。ででで", "さようなら。ででで"]));

      assert.equal(result.items[0].audio, result.items[1].audio);
      assert.notEqual(result.items[0].audio, result.items[2].audio);
    });
  } finally {
    if (originalKey) {
      process.env.ELEVENLABS_API_KEY = originalKey;
    } else {
      delete process.env.ELEVENLABS_API_KEY;
    }
  }
});

// Every clip the stage installs records the text it was made from, so the check that a clip still
// matches its card stops depending on whether the stage happens to own that card.
test("stamps each generated clip with the text it was generated from", async () => {
  const originalKey = process.env.ELEVENLABS_API_KEY;
  process.env.ELEVENLABS_API_KEY = "test-key";
  try {
    await withTempDir(async (tmpDir) => {
      const cards = baseCards([
        { id: "a1", english: "Hello", category: "Greetings", target: "こんにちは" },
      ]);
      // A stale acceptance of the PREVIOUS clip must not survive onto a fresh recording.
      cards.items[0].audioTextHashAcceptedBy = "human";
      cards.items[0].audioTextHashAcceptedAt = "2026-01-01T00:00:00.000Z";

      const result = await generateAudio(cards, {
        voiceId: "voice123",
        fetchTts: async (term) => Buffer.from(`audio for ${term}`),
        libraryHomeDir: tmpDir,
      });

      const item = result.items[0];
      assert.equal(
        item.audioTextHash,
        createHash("sha256").update("こんにちは。ででで").digest("hex").slice(0, 16),
      );
      assert.equal(item.audio, `${item.audioTextHash}.mp3`, "the name and the stamp agree");
      assert.equal("audioTextHashAcceptedBy" in item, false);
      assert.equal("audioTextHashAcceptedAt" in item, false);
    });
  } finally {
    if (originalKey) process.env.ELEVENLABS_API_KEY = originalKey;
    else delete process.env.ELEVENLABS_API_KEY;
  }
});

test("flags a card whose end marker survived the trim, and only that card", async () => {
  const originalKey = process.env.ELEVENLABS_API_KEY;
  process.env.ELEVENLABS_API_KEY = "test-key";
  try {
    await withTempDir(async (tmpDir) => {
      const cards = baseCards([
        { id: "ok", english: "Hello", category: "Greetings", target: "こんにちは" },
        { id: "stuck", english: "Ra", category: "Other", target: "ら" },
      ]);

      // The real trimmer reports via opts.flags; this stub fails the strip for one clip only.
      const trim = async (bytes, opts) => {
        if (opts.marker && opts.flags) {
          opts.flags.markerStripped = !bytes.toString().includes("STUCK");
        }
        return bytes;
      };

      const result = await generateAudio(cards, {
        voiceId: "voice123",
        fetchTts: async (term) =>
          Buffer.from(term.startsWith("ら") ? "STUCK-bytes" : "clean-bytes"),
        libraryHomeDir: tmpDir,
        trim,
      });

      assert.equal("audioMarkerStuck" in result.items[0], false);
      assert.equal(result.items[1].audioMarkerStuck, true);
    });
  } finally {
    if (originalKey) process.env.ELEVENLABS_API_KEY = originalKey;
    else delete process.env.ELEVENLABS_API_KEY;
  }
});

test("a cache hit does NOT clear a marker-stuck flag it produced no evidence about", async () => {
  const originalKey = process.env.ELEVENLABS_API_KEY;
  process.env.ELEVENLABS_API_KEY = "test-key";
  try {
    await withTempDir(async (tmpDir) => {
      const cards = baseCards([{ id: "stuck", english: "Ra", category: "Other", target: "ら" }]);
      const trim = async (bytes, opts) => {
        if (opts.marker && opts.flags) opts.flags.markerStripped = false;
        return bytes;
      };
      const opts = {
        voiceId: "voice123",
        fetchTts: async () => Buffer.from("STUCK-bytes"),
        libraryHomeDir: tmpDir,
        trim,
      };

      const first = await generateAudio(cards, opts);
      assert.equal(first.items[0].audioMarkerStuck, true);

      // Second run: the clip is cached, so nothing is fetched and nothing is trimmed. The clip on
      // disk is byte-identical and still says ででで, so the flag must survive.
      //
      // It did not. The cache branch reported no `markerStuck` at all, `undefined` was treated as
      // "clean", and the flag was deleted — leaving the card asserting clean audio, the dashboard
      // badge gone, and preflight's audio-markers check passing on a clip a reviewer can hear the
      // marker in. Found on a live unit: re-running `audio` to re-roll one clip wiped the truthful
      // flag off it instead.
      let fetches = 0;
      const second = await generateAudio(first, {
        ...opts,
        fetchTts: async () => {
          fetches++;
          return Buffer.from("STUCK-bytes");
        },
      });
      assert.equal(fetches, 0, "the clip is cached — nothing should be fetched");
      assert.equal(second.items[0].audioMarkerStuck, true);
    });
  } finally {
    if (originalKey) process.env.ELEVENLABS_API_KEY = originalKey;
    else delete process.env.ELEVENLABS_API_KEY;
  }
});

test("a real trim that finds no marker DOES clear a stale flag", async () => {
  const originalKey = process.env.ELEVENLABS_API_KEY;
  process.env.ELEVENLABS_API_KEY = "test-key";
  try {
    await withTempDir(async (tmpDir) => {
      // The flag is only ever cleared by evidence: a fetch-and-trim that actually stripped the
      // marker. That half must keep working, or the flag becomes impossible to get rid of.
      const cards = baseCards([
        {
          id: "stuck",
          english: "Ra",
          category: "Other",
          target: "ら",
          audioMarkerStuck: true,
        },
      ]);
      const trim = async (bytes, opts) => {
        if (opts.marker && opts.flags) opts.flags.markerStripped = true;
        return bytes;
      };

      const result = await generateAudio(cards, {
        voiceId: "voice123",
        fetchTts: async () => Buffer.from("clean-bytes"),
        libraryHomeDir: tmpDir,
        trim,
      });

      assert.equal("audioMarkerStuck" in result.items[0], false);
    });
  } finally {
    if (originalKey) process.env.ELEVENLABS_API_KEY = originalKey;
    else delete process.env.ELEVENLABS_API_KEY;
  }
});

test("annotates each card with its audio filename", async () => {
  const originalKey = process.env.ELEVENLABS_API_KEY;
  process.env.ELEVENLABS_API_KEY = "test-key";

  try {
    await withTempDir(async (tmpDir) => {
      const cards = baseCards([
        { id: "a1", english: "Hello", category: "Greetings", target: "こんにちは" },
      ]);

      const mockFetchTts = async () => Buffer.from("audio data");

      const result = await generateAudio(cards, {
        voiceId: "voice123",
        fetchTts: mockFetchTts,
        libraryHomeDir: tmpDir,
      });

      assert.equal(result.items[0].audio, result.items[0].audio);
      assert(result.items[0].audio.endsWith(".mp3"));
      assert.equal(result.items[0].audio.length, 20);
    });
  } finally {
    if (originalKey) {
      process.env.ELEVENLABS_API_KEY = originalKey;
    } else {
      delete process.env.ELEVENLABS_API_KEY;
    }
  }
});

test("throws clear error if ELEVENLABS_API_KEY is not set", async () => {
  await withTempDir(async (tmpDir) => {
    const cards = baseCards([
      { id: "a1", english: "Hello", category: "Greetings", target: "こんにちは" },
    ]);

    const originalKey = process.env.ELEVENLABS_API_KEY;
    delete process.env.ELEVENLABS_API_KEY;

    try {
      await generateAudio(cards, {
        voiceId: "voice123",
        fetchTts: async () => Buffer.from("audio data"),
        libraryHomeDir: tmpDir,
      });
      assert.fail("should have thrown");
    } catch (error) {
      assert.match(error.message, /ELEVENLABS_API_KEY/);
    } finally {
      if (originalKey) {
        process.env.ELEVENLABS_API_KEY = originalKey;
      }
    }
  });
});

test("throws error if voiceId is not provided", async () => {
  await withTempDir(async (tmpDir) => {
    const cards = baseCards([
      { id: "a1", english: "Hello", category: "Greetings", target: "こんにちは" },
    ]);

    try {
      await generateAudio(cards, {
        fetchTts: async () => Buffer.from("audio data"),
        libraryHomeDir: tmpDir,
      });
      assert.fail("should have thrown");
    } catch (error) {
      assert.match(error.message, /voiceId/);
    }
  });
});

test("throws error if fetchTts is not provided", async () => {
  await withTempDir(async (tmpDir) => {
    const cards = baseCards([
      { id: "a1", english: "Hello", category: "Greetings", target: "こんにちは" },
    ]);

    try {
      await generateAudio(cards, {
        voiceId: "voice123",
        libraryHomeDir: tmpDir,
      });
      assert.fail("should have thrown");
    } catch (error) {
      assert.match(error.message, /fetchTts/);
    }
  });
});

test("preserves other card properties when annotating with audio", async () => {
  const originalKey = process.env.ELEVENLABS_API_KEY;
  process.env.ELEVENLABS_API_KEY = "test-key";

  try {
    await withTempDir(async (tmpDir) => {
      const cards = baseCards([
        {
          id: "a1",
          english: "Hello",
          category: "Greetings",
          target: "こんにちは",
          pronunciation: "kon-ni-chi-wa",
          hint: "polite greeting",
        },
      ]);

      const mockFetchTts = async () => Buffer.from("audio data");

      const result = await generateAudio(cards, {
        voiceId: "voice123",
        fetchTts: mockFetchTts,
        libraryHomeDir: tmpDir,
      });

      const item = result.items[0];
      assert.equal(item.id, "a1");
      assert.equal(item.english, "Hello");
      assert.equal(item.category, "Greetings");
      assert.equal(item.target, "こんにちは");
      assert.equal(item.pronunciation, "kon-ni-chi-wa");
      assert.equal(item.hint, "polite greeting");
      assert.equal(typeof item.audio, "string");
    });
  } finally {
    if (originalKey) {
      process.env.ELEVENLABS_API_KEY = originalKey;
    } else {
      delete process.env.ELEVENLABS_API_KEY;
    }
  }
});

test("passes voiceId and apiKey to fetchTts function", async () => {
  await withTempDir(async (tmpDir) => {
    process.env.ELEVENLABS_API_KEY = "test-api-key-12345";

    const cards = baseCards([
      { id: "a1", english: "Hello", category: "Greetings", target: "こんにちは" },
    ]);

    const mockFetchTts = async (term, voiceId, apiKey) => {
      assert.equal(voiceId, "voice123");
      assert.equal(apiKey, "test-api-key-12345");
      return Buffer.from("audio data");
    };

    await generateAudio(cards, {
      voiceId: "voice123",
      fetchTts: mockFetchTts,
      libraryHomeDir: tmpDir,
    });
  });
});

test("passes the resolved ISO 639-1 language code to fetchTts when targetLanguage is a real code", async () => {
  await withTempDir(async (tmpDir) => {
    process.env.ELEVENLABS_API_KEY = "test-api-key-12345";

    const cards = baseCards([
      { id: "a1", english: "Hello", category: "Greetings", target: "こんにちは" },
    ]);

    const mockFetchTts = async (term, voiceId, apiKey, languageCode) => {
      assert.equal(languageCode, "ja");
      return Buffer.from("audio data");
    };

    await generateAudio(cards, {
      voiceId: "voice123",
      fetchTts: mockFetchTts,
      libraryHomeDir: tmpDir,
    });
  });
});

test("passes null as the language code when targetLanguage isn't a recognized ISO 639-1 code", async () => {
  await withTempDir(async (tmpDir) => {
    process.env.ELEVENLABS_API_KEY = "test-api-key-12345";

    const cards = {
      meta: { targetLanguage: "Japanese", sourceType: "manual" },
      items: [{ id: "a1", english: "Hello", category: "Greetings", target: "こんにちは" }],
    };

    const mockFetchTts = async (term, voiceId, apiKey, languageCode) => {
      assert.equal(languageCode, null);
      return Buffer.from("audio data");
    };

    await generateAudio(cards, {
      voiceId: "voice123",
      fetchTts: mockFetchTts,
      libraryHomeDir: tmpDir,
    });
  });
});

test("passes null as the language code when targetLanguage is missing entirely", async () => {
  await withTempDir(async (tmpDir) => {
    process.env.ELEVENLABS_API_KEY = "test-api-key-12345";

    const cards = {
      meta: { sourceType: "manual" },
      items: [{ id: "a1", english: "Hello", category: "Greetings", target: "こんにちは" }],
    };

    const mockFetchTts = async (term, voiceId, apiKey, languageCode) => {
      assert.equal(languageCode, null);
      return Buffer.from("audio data");
    };

    await generateAudio(cards, {
      voiceId: "voice123",
      fetchTts: mockFetchTts,
      libraryHomeDir: tmpDir,
    });
  });
});

test("preserves meta property in returned cards", async () => {
  const originalKey = process.env.ELEVENLABS_API_KEY;
  process.env.ELEVENLABS_API_KEY = "test-key";

  try {
    await withTempDir(async (tmpDir) => {
      const cards = baseCards([
        { id: "a1", english: "Hello", category: "Greetings", target: "こんにちは" },
      ]);

      const mockFetchTts = async () => Buffer.from("audio data");

      const result = await generateAudio(cards, {
        voiceId: "voice123",
        fetchTts: mockFetchTts,
        libraryHomeDir: tmpDir,
      });

      assert.deepEqual(result.meta, cards.meta);
    });
  } finally {
    if (originalKey) {
      process.env.ELEVENLABS_API_KEY = originalKey;
    } else {
      delete process.env.ELEVENLABS_API_KEY;
    }
  }
});

test("speaks `ttsText` instead of `target` when a card carries one", async () => {
  const originalKey = process.env.ELEVENLABS_API_KEY;
  process.env.ELEVENLABS_API_KEY = "test-key";

  try {
    await withTempDir(async (tmpDir) => {
      const cards = baseCards([
        // Kanji face, kana ttsText — TTS must receive the kana, not the kanji.
        {
          id: "n21",
          english: "Twenty-one",
          category: "Numbers",
          target: "二十一",
          ttsText: "にじゅういち",
        },
      ]);

      const calls = [];
      const mockFetchTts = async (term) => {
        calls.push(term);
        return Buffer.from(`audio for ${term}`);
      };

      const result = await generateAudio(cards, {
        voiceId: "voice123",
        fetchTts: mockFetchTts,
        libraryHomeDir: tmpDir,
      });

      assert.deepEqual(calls, ["にじゅういち。ででで"]);
      // The card still carries its kanji target untouched; only what was spoken changed.
      assert.equal(result.items[0].target, "二十一");
      assert.equal(result.items[0].ttsText, "にじゅういち");
      assert.ok(result.items[0].audio);
    });
  } finally {
    if (originalKey) {
      process.env.ELEVENLABS_API_KEY = originalKey;
    } else {
      delete process.env.ELEVENLABS_API_KEY;
    }
  }
});

test("audio cache key follows the spoken text: same target + different ttsText => distinct clips", async () => {
  const originalKey = process.env.ELEVENLABS_API_KEY;
  process.env.ELEVENLABS_API_KEY = "test-key";

  try {
    await withTempDir(async (tmpDir) => {
      const cards = baseCards([
        { id: "c1", english: "A", category: "Numbers", target: "同", ttsText: "どう" },
        { id: "c2", english: "B", category: "Numbers", target: "同", ttsText: "おなじ" },
      ]);

      const calls = [];
      const mockFetchTts = async (term) => {
        calls.push(term);
        return Buffer.from(`audio for ${term}`);
      };

      const result = await generateAudio(cards, {
        voiceId: "voice123",
        fetchTts: mockFetchTts,
        libraryHomeDir: tmpDir,
      });

      // Two ttsText values => two TTS calls => two files, even though `target` is identical.
      assert.equal(calls.length, 2);
      assert.notEqual(result.items[0].audio, result.items[1].audio);

      const audioDir = resolve(join(tmpDir, "audio", "voice123", TTS_MODEL));
      const files = await fs.readdir(audioDir);
      assert.equal(shippingClips(files).length, 2);
    });
  } finally {
    if (originalKey) {
      process.env.ELEVENLABS_API_KEY = originalKey;
    } else {
      delete process.env.ELEVENLABS_API_KEY;
    }
  }
});

test("falls back to `target` when `ttsText` is an empty string", async () => {
  const originalKey = process.env.ELEVENLABS_API_KEY;
  process.env.ELEVENLABS_API_KEY = "test-key";

  try {
    await withTempDir(async (tmpDir) => {
      const cards = baseCards([
        { id: "e1", english: "Hello", category: "Greetings", target: "こんにちは", ttsText: "" },
      ]);

      const calls = [];
      const mockFetchTts = async (term) => {
        calls.push(term);
        return Buffer.from("audio data");
      };

      await generateAudio(cards, {
        voiceId: "voice123",
        fetchTts: mockFetchTts,
        libraryHomeDir: tmpDir,
      });

      assert.deepEqual(calls, ["こんにちは。ででで"]);
    });
  } finally {
    if (originalKey) {
      process.env.ELEVENLABS_API_KEY = originalKey;
    } else {
      delete process.env.ELEVENLABS_API_KEY;
    }
  }
});

// ---------------------------------------------------------------------------
// Default take (the ONLY clip generated up front). For a language with a
// transform (Japanese appends 。) the default IS the with-。 take; there is no second "alt" pass any
// more (the no-。 take and every other variant are on-demand dashboard actions). These call the real
// implementation with the real ja transform, overriding the no-alt default the wrapper applies.
// ---------------------------------------------------------------------------

async function withKey(fn) {
  const original = process.env.ELEVENLABS_API_KEY;
  process.env.ELEVENLABS_API_KEY = "test-key";
  try {
    return await withTempDir(fn);
  } finally {
    if (original) process.env.ELEVENLABS_API_KEY = original;
    else delete process.env.ELEVENLABS_API_KEY;
  }
}

test("default: a ja card's default is the with-。 clip, and NO alt clip is generated", async () => {
  await withKey(async (tmpDir) => {
    const cards = baseCards([{ id: "a1", english: "eight", category: "Time", target: "はちじ" }]);
    const calls = [];
    const result = await generateAudioImpl(cards, {
      voiceId: "voice123",
      fetchTts: async (term) => {
        calls.push(term);
        return Buffer.from(`audio for ${term}`);
      },
      libraryHomeDir: tmpDir,
      trim: noTrim,
    });

    // Mirrors hashTerm in src/audio/index.js.
    const clip = (t) => `${createHash("sha256").update(t).digest("hex").slice(0, 16)}.mp3`;
    const item = result.items[0];
    assert.equal(item.audio, clip("はちじ。ででで"), "default take is the with-。 clip");
    assert.equal("altAudio" in item, false, "no altAudio field — the up-front alt pass is gone");
    assert.deepEqual(calls, ["はちじ。ででで"], "only the with-。 default is fetched");

    const files = await fs.readdir(resolve(join(tmpDir, "audio", "voice123", TTS_MODEL)));
    assert.equal(shippingClips(files).length, 1, "only the default clip is cached");
  });
});

test("default: language with no transform yields no altAudio field", async () => {
  await withKey(async (tmpDir) => {
    const cards = baseCards([{ id: "a1", english: "eight", category: "Time", target: "はちじ" }]);
    const result = await generateAudioImpl(cards, {
      voiceId: "voice123",
      fetchTts: async () => Buffer.from("x"),
      libraryHomeDir: tmpDir,
      trim: noTrim,
    });
    assert.ok(result.items[0].audio);
    assert.equal("altAudio" in result.items[0], false, "no altAudio key at all");
  });
});

test("default: the clip is cached — a second run makes zero calls", async () => {
  await withKey(async (tmpDir) => {
    const cards = baseCards([{ id: "a1", english: "eight", category: "Time", target: "はちじ" }]);
    const opts = (calls) => ({
      voiceId: "voice123",
      fetchTts: async (term) => {
        calls.push(term);
        return Buffer.from(`audio for ${term}`);
      },
      libraryHomeDir: tmpDir,
      trim: noTrim,
    });

    const first = [];
    await generateAudioImpl(cards, opts(first));
    assert.equal(first.length, 1, "first run fetches the default only");

    const second = [];
    await generateAudioImpl(cards, opts(second));
    assert.equal(second.length, 0, "second run is a full cache hit");
  });
});

test("default: the clip is built from the spoken text (ttsText when present)", async () => {
  await withKey(async (tmpDir) => {
    const cards = baseCards([
      { id: "a1", english: "one", category: "Numbers", target: "一", ttsText: "いち" },
    ]);
    const calls = [];
    await generateAudioImpl(cards, {
      voiceId: "voice123",
      fetchTts: async (term) => {
        calls.push(term);
        return Buffer.from("x");
      },
      libraryHomeDir: tmpDir,
      trim: noTrim,
    });
    assert.deepEqual(
      calls,
      ["いち。ででで"],
      "speaks the ttsText's 。 variant, not the kanji target",
    );
  });
});

test("cache is segmented by model — the same text under two models does not collide", async () => {
  const tmpDir = await fs.mkdtemp(join(os.tmpdir(), "audio-test-"));
  const originalKey = process.env.ELEVENLABS_API_KEY;
  process.env.ELEVENLABS_API_KEY = "test-key";
  try {
    const cards = { meta: { targetLanguage: "es" }, items: [{ id: "a1", target: "hola" }] };
    const calls = [];
    const fetchTts = async (term) => {
      calls.push(term);
      return Buffer.from(`clip-${term}`);
    };

    const r1 = await generateAudio(cards, {
      voiceId: "v",
      fetchTts,
      libraryHomeDir: tmpDir,
      model: "model-a",
    });
    const r2 = await generateAudio(cards, {
      voiceId: "v",
      fetchTts,
      libraryHomeDir: tmpDir,
      model: "model-b",
    });

    // Same text, but a second model must NOT hit the first model's cache — fetched under both.
    assert.equal(calls.length, 2, "each model fetches its own clip; no cross-model cache hit");
    // Same filename (hash of the text) but under different model directories.
    assert.equal(r1.items[0].audio, r2.items[0].audio);
    const aFiles = await fs.readdir(resolve(join(tmpDir, "audio", "v", "model-a")));
    const bFiles = await fs.readdir(resolve(join(tmpDir, "audio", "v", "model-b")));
    assert.equal(shippingClips(aFiles).length, 1);
    assert.equal(shippingClips(bFiles).length, 1);
  } finally {
    if (originalKey) process.env.ELEVENLABS_API_KEY = originalKey;
    else delete process.env.ELEVENLABS_API_KEY;
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test("ja: the text sent to TTS (and cache key) has spaces stripped, though target keeps them", async () => {
  const tmpDir = await fs.mkdtemp(join(os.tmpdir(), "audio-test-"));
  const originalKey = process.env.ELEVENLABS_API_KEY;
  process.env.ELEVENLABS_API_KEY = "test-key";
  try {
    const cards = {
      meta: { targetLanguage: "ja" },
      items: [
        { id: "s1", english: "This is a French wine.", target: "これは フランスの ワインです。" },
      ],
    };
    const calls = [];
    await generateAudioImpl(cards, {
      voiceId: "v",
      fetchTts: async (term) => {
        calls.push(term);
        return Buffer.from("x");
      },
      libraryHomeDir: tmpDir,
      trim: noTrim,
    });
    // default only, space-free; the with-。 default appends 。 to the already-。-terminated text.
    assert.deepEqual(
      calls,
      ["これはフランスのワインです。。ででで"],
      "spaces stripped before TTS; the with-。 default appends 。 to the stripped text",
    );
  } finally {
    if (originalKey) process.env.ELEVENLABS_API_KEY = originalKey;
    else delete process.env.ELEVENLABS_API_KEY;
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

// --- keeping the original take -------------------------------------------------------------------
// The automatic trim only ever cuts the END of a clip, and it used to run at the ElevenLabs fetch —
// so the untouched take was discarded before it reached disk and the trim's mistakes were permanent.
// Both takes are now cached side by side.

test("keeps the untouched original beside the trimmed take, and ships the trimmed one", async () => {
  await withKey(async (tmpDir) => {
    const cards = baseCards([{ id: "a1", english: "eight", category: "Time", target: "はちじ" }]);
    const result = await generateAudio(cards, {
      voiceId: "v",
      fetchTts: async () => Buffer.from("RAW-full-length-take"),
      libraryHomeDir: tmpDir,
      model: "m",
      trim: async () => Buffer.from("CUT"),
    });

    const item = result.items[0];
    assert.ok(item.audioOriginal.endsWith(".orig.mp3"), "original is the .orig.mp3 sibling");
    assert.equal(item.audioAuto, item.audio, "the trimmed take is what ships by default");
    assert.notEqual(item.audioOriginal, item.audio);

    const audioDir = resolve(join(tmpDir, "audio", "v", "m"));
    assert.equal(
      await fs.readFile(join(audioDir, item.audioOriginal), "utf8"),
      "RAW-full-length-take",
      "the original is stored verbatim — nothing is cut from it",
    );
    assert.equal(await fs.readFile(join(audioDir, item.audio), "utf8"), "CUT");
  });
});

test("caches an original even when the trim changed nothing, so 'no sibling' can only mean 'predates originals'", async () => {
  await withKey(async (tmpDir) => {
    const cards = baseCards([{ id: "a1", english: "eight", category: "Time", target: "はちじ" }]);
    const result = await generateAudio(cards, {
      voiceId: "v",
      fetchTts: async () => Buffer.from("x"),
      libraryHomeDir: tmpDir,
      model: "m",
      trim: noTrim,
    });

    const files = await fs.readdir(resolve(join(tmpDir, "audio", "v", "m")));
    assert.equal(files.length, 2, "both takes on disk even though they are byte-identical");
    assert.ok(result.items[0].audioOriginal);
  });
});

test("a cache entry with no .orig.mp3 sibling reports no original — and is NOT refetched for one", async () => {
  await withKey(async (tmpDir) => {
    const cards = baseCards([{ id: "a1", english: "eight", category: "Time", target: "はちじ" }]);
    const audioDir = resolve(join(tmpDir, "audio", "v", "m"));

    // Stand in for a cache written before originals were kept: the shipping clip, no sibling.
    const first = await generateAudio(cards, {
      voiceId: "v",
      fetchTts: async () => Buffer.from("x"),
      libraryHomeDir: tmpDir,
      model: "m",
      trim: noTrim,
    });
    await fs.rm(join(audioDir, first.items[0].audioOriginal));

    let calls = 0;
    const result = await generateAudio(cards, {
      voiceId: "v",
      fetchTts: async () => {
        calls++;
        return Buffer.from("x");
      },
      libraryHomeDir: tmpDir,
      model: "m",
      trim: noTrim,
    });

    // Refetching would spend credits re-rolling a non-deterministic voice purely to recover a take we
    // had already chosen to throw away — and would change how an approved card sounds.
    assert.equal(calls, 0, "a missing original never triggers a refetch");
    assert.equal("audioOriginal" in result.items[0], false);
    assert.ok(result.items[0].audio, "the card still ships its cached clip");
  });
});

test("regenerating a card drops a stale manual trim, which described the previous original", async () => {
  await withKey(async (tmpDir) => {
    const cards = baseCards([
      {
        id: "a1",
        english: "eight",
        category: "Time",
        target: "はちじ",
        audioManual: "a1-manual-deadbeef.mp3",
        audioTrim: { start: 0.2, end: 1.4 },
      },
    ]);
    const result = await generateAudio(cards, {
      voiceId: "v",
      fetchTts: async () => Buffer.from("x"),
      libraryHomeDir: tmpDir,
      trim: noTrim,
    });

    const item = result.items[0];
    assert.equal("audioManual" in item, false, "the hand cut is dropped, not carried forward");
    assert.equal("audioTrim" in item, false);
    assert.equal(item.audio, item.audioAuto, "the card falls back to the fresh automatic take");
  });
});

test("an excluded card is stripped of every audio field, not just `audio`", async () => {
  await withKey(async (tmpDir) => {
    const cards = baseCards([
      {
        id: "x1",
        english: "drop",
        category: "Other",
        target: "すてる",
        excluded: true,
        audio: "stale.mp3",
        audioOriginal: "stale.orig.mp3",
        audioAuto: "stale.mp3",
        audioManual: "stale-manual.mp3",
        audioTrim: { start: 0, end: 1 },
      },
      { id: "a1", english: "keep", category: "Other", target: "のこす" },
    ]);
    const result = await generateAudio(cards, {
      voiceId: "v",
      fetchTts: async () => Buffer.from("x"),
      libraryHomeDir: tmpDir,
      trim: noTrim,
    });

    for (const field of ["audio", "audioOriginal", "audioAuto", "audioManual", "audioTrim"]) {
      assert.equal(field in result.items[0], false, field + " is cleared on an excluded card");
    }
  });
});

// --- which take actually ships --------------------------------------------------------------------

test("deriveCardAudio: a hand cut beats the automatic trim, which beats the original", () => {
  const takes = {
    audioOriginal: "raw.orig.mp3",
    audioAuto: "auto.mp3",
    audioManual: "manual.mp3",
  };
  assert.equal(deriveCardAudio(takes), "manual.mp3");

  assert.equal(
    deriveCardAudio({ audioOriginal: takes.audioOriginal, audioAuto: takes.audioAuto }),
    "auto.mp3",
    "without a hand cut, the automatic trim ships",
  );

  assert.equal(
    deriveCardAudio({ audioOriginal: "raw.orig.mp3" }),
    "raw.orig.mp3",
    "a clip the trim left alone ships as-is",
  );
  assert.equal(deriveCardAudio({}), undefined, "a card with no takes has no audio at all");
});

// --- which cards the audio stage owns --------------------------------------------------------------
// Provenance lives on the ORIGINAL, not the shipping clip. `audio` is a derived artifact whose name
// encodes the processing applied, so it changes when the cleanup changes — asking it "did the stage
// make this?" broke the moment every clip was renamed to <hash>.standard.mp3, which silently told the
// stage that all 1179 cards were hand-picked and none could ever be regenerated.

test("isStageOwnedCard judges on the original, not on the processed shipping clip", () => {
  const stage = { audioOriginal: "9f8e7d6c5b4a3210.orig.mp3", audioAuto: "9f8e7d6c5b4a3210.mp3" };
  assert.equal(isStageOwnedCard(stage), true);
  // Same card after a cleanup sweep renamed the shipping clip — still the stage's.
  assert.equal(isStageOwnedCard({ ...stage, audio: "9f8e7d6c5b4a3210.standard.mp3" }), true);
});

test("isStageOwnedCard leaves a human's choice alone", () => {
  for (const original of [
    "9f8e7d6c5b4a3210-gen-ab12cd34.orig.mp3",
    "9f8e7d6c5b4a3210-genkanji-ab12cd34.orig.mp3",
    "a1-user-ab12cd34.orig.mp3",
  ]) {
    assert.equal(isStageOwnedCard({ audioOriginal: original }), false, original);
  }
  // A hand trim is a deliberate placement, whatever the original's provenance.
  assert.equal(
    isStageOwnedCard({
      audioOriginal: "9f8e7d6c5b4a3210.orig.mp3",
      audioManual: "a1-manual-x.mp3",
    }),
    false,
  );
});

test("isStageOwnedCard falls back to the clip name for cards that predate originals", () => {
  assert.equal(isStageOwnedCard({ audio: "9f8e7d6c5b4a3210.mp3" }), true);
  assert.equal(isStageOwnedCard({ audio: "a1-user-ab12cd34.mp3" }), false);
  assert.equal(isStageOwnedCard({}), true, "a card with no audio yet is the stage's to fill");
  assert.equal(isStageOwnedCard(null), false);
});

test("the marker is part of the cache key, so a marked clip is never reused as an unmarked one", () => {
  const item = { target: "はちじ" };
  const marked = defaultClipFilename(item, "ja", (t) => t + "。");
  const plain = defaultClipFilename(item, "es", (t) => t + "。");
  assert.notEqual(marked, plain);
});
