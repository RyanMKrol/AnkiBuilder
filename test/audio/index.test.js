import test from "node:test";
import assert from "node:assert";
import { promises as fs } from "fs";
import { join, resolve } from "path";
import os from "os";
import { Buffer } from "buffer";
import { createHash } from "crypto";
import { generateAudio as generateAudioImpl } from "../../src/audio/index.js";
import { getAltAudioTransform } from "../../src/audio/altAudio.js";
import { TTS_MODEL } from "../../src/audio/ttsModel.js";

// The core-mechanics tests below (dedup, caching, hashing, reading-vs-target) exercise the DEFAULT
// recording pass. Since baseCards is tagged `ja` — which has an alt-audio transform — the alt pass
// would double every fetch/file count and muddy those assertions. Default alt OFF here so they stay
// focused; a test can re-enable it by passing its own `getAltTransform`. The alt pass has its own
// dedicated tests at the bottom of this file.
function generateAudio(cards, opts = {}) {
  return generateAudioImpl(cards, { getAltTransform: () => undefined, ...opts });
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
      assert.deepEqual(new Set(calls), new Set(["こんにちは", "さようなら"]));

      // Cache is segmented by model: audio/<voiceId>/<model>/
      const audioDir = resolve(join(tmpDir, "audio", "voice123", "test-model"));
      const files = await fs.readdir(audioDir);
      assert.equal(files.length, 2);

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
      assert.deepEqual(new Set(calls), new Set(["こんにちは", "さようなら"]));

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

test("speaks `reading` instead of `target` when a card carries one", async () => {
  const originalKey = process.env.ELEVENLABS_API_KEY;
  process.env.ELEVENLABS_API_KEY = "test-key";

  try {
    await withTempDir(async (tmpDir) => {
      const cards = baseCards([
        // Kanji face, kana reading — TTS must receive the kana, not the kanji.
        {
          id: "n21",
          english: "Twenty-one",
          category: "Numbers",
          target: "二十一",
          reading: "にじゅういち",
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

      assert.deepEqual(calls, ["にじゅういち"]);
      // The card still carries its kanji target untouched; only what was spoken changed.
      assert.equal(result.items[0].target, "二十一");
      assert.equal(result.items[0].reading, "にじゅういち");
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

test("audio cache key follows the spoken text: same target + different reading => distinct clips", async () => {
  const originalKey = process.env.ELEVENLABS_API_KEY;
  process.env.ELEVENLABS_API_KEY = "test-key";

  try {
    await withTempDir(async (tmpDir) => {
      const cards = baseCards([
        { id: "c1", english: "A", category: "Numbers", target: "同", reading: "どう" },
        { id: "c2", english: "B", category: "Numbers", target: "同", reading: "おなじ" },
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

      // Two readings => two TTS calls => two files, even though `target` is identical.
      assert.equal(calls.length, 2);
      assert.notEqual(result.items[0].audio, result.items[1].audio);

      const audioDir = resolve(join(tmpDir, "audio", "voice123", TTS_MODEL));
      const files = await fs.readdir(audioDir);
      assert.equal(files.length, 2);
    });
  } finally {
    if (originalKey) {
      process.env.ELEVENLABS_API_KEY = originalKey;
    } else {
      delete process.env.ELEVENLABS_API_KEY;
    }
  }
});

test("falls back to `target` when `reading` is an empty string", async () => {
  const originalKey = process.env.ELEVENLABS_API_KEY;
  process.env.ELEVENLABS_API_KEY = "test-key";

  try {
    await withTempDir(async (tmpDir) => {
      const cards = baseCards([
        { id: "e1", english: "Hello", category: "Greetings", target: "こんにちは", reading: "" },
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

      assert.deepEqual(calls, ["こんにちは"]);
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
// Default take (the ONLY clip generated up front — see src/audio/altAudio.js). For a language with a
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
      getAltTransform: getAltAudioTransform,
    });

    // Mirrors hashTerm in src/audio/index.js.
    const clip = (t) => `${createHash("sha256").update(t).digest("hex").slice(0, 16)}.mp3`;
    const item = result.items[0];
    assert.equal(item.audio, clip("はちじ。"), "default take is the with-。 clip");
    assert.equal("altAudio" in item, false, "no altAudio field — the up-front alt pass is gone");
    assert.deepEqual(calls, ["はちじ。"], "only the with-。 default is fetched");

    const files = await fs.readdir(resolve(join(tmpDir, "audio", "voice123", TTS_MODEL)));
    assert.equal(files.length, 1, "only the default clip is cached");
  });
});

test("default: language with no transform yields no altAudio field", async () => {
  await withKey(async (tmpDir) => {
    const cards = baseCards([{ id: "a1", english: "eight", category: "Time", target: "はちじ" }]);
    const result = await generateAudioImpl(cards, {
      voiceId: "voice123",
      fetchTts: async () => Buffer.from("x"),
      libraryHomeDir: tmpDir,
      getAltTransform: () => undefined,
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
      getAltTransform: getAltAudioTransform,
    });

    const first = [];
    await generateAudioImpl(cards, opts(first));
    assert.equal(first.length, 1, "first run fetches the default only");

    const second = [];
    await generateAudioImpl(cards, opts(second));
    assert.equal(second.length, 0, "second run is a full cache hit");
  });
});

test("default: the clip is built from the spoken text (reading when present)", async () => {
  await withKey(async (tmpDir) => {
    const cards = baseCards([
      { id: "a1", english: "one", category: "Numbers", target: "一", reading: "いち" },
    ]);
    const calls = [];
    await generateAudioImpl(cards, {
      voiceId: "voice123",
      fetchTts: async (term) => {
        calls.push(term);
        return Buffer.from("x");
      },
      libraryHomeDir: tmpDir,
      getAltTransform: getAltAudioTransform,
    });
    assert.deepEqual(calls, ["いち。"], "speaks the reading's 。 variant, not the kanji target");
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
    assert.equal(aFiles.length, 1);
    assert.equal(bFiles.length, 1);
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
      getAltTransform: getAltAudioTransform,
    });
    // default only, space-free; the with-。 default appends 。 to the already-。-terminated text.
    assert.deepEqual(
      calls,
      ["これはフランスのワインです。。"],
      "spaces stripped before TTS; the with-。 default appends 。 to the stripped text",
    );
  } finally {
    if (originalKey) process.env.ELEVENLABS_API_KEY = originalKey;
    else delete process.env.ELEVENLABS_API_KEY;
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});
