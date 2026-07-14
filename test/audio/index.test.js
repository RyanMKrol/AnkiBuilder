import test from "node:test";
import assert from "node:assert";
import { promises as fs } from "fs";
import { join, resolve } from "path";
import os from "os";
import { Buffer } from "buffer";
import { generateAudio } from "../../src/audio/index.js";

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
      });

      assert.equal(calls.length, 2);
      assert.deepEqual(new Set(calls), new Set(["こんにちは", "さようなら"]));

      const audioDir = resolve(join(tmpDir, "audio", "voice123"));
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
