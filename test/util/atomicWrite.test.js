import { test } from "node:test";
import assert from "node:assert";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  mkdtempSync,
  rmSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Buffer } from "node:buffer";
import { setImmediate } from "node:timers";
import {
  writeFileAtomic,
  writeFileAtomicAsync,
  copyFileAtomic,
} from "../../src/util/atomicWrite.js";

const execFileAsync = promisify(execFile);
const ATOMIC_WRITE_MODULE = fileURLToPath(
  new URL("../../src/util/atomicWrite.js", import.meta.url),
);

function withTempDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), "atomic-write-"));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// Temp files are dotfiles named `.<dest>.tmp.<pid>.<n>` in the destination's own directory.
function leftoverTemps(dir) {
  return readdirSync(dir).filter((name) => name.includes(".tmp."));
}

test("writeFileAtomic writes the file and leaves no temp behind", () => {
  withTempDir((dir) => {
    const dest = join(dir, "cards.json");
    writeFileAtomic(dest, '{"a":1}');
    assert.equal(readFileSync(dest, "utf-8"), '{"a":1}');
    assert.deepEqual(leftoverTemps(dir), []);
  });
});

test("writeFileAtomic creates the destination's parent directory", () => {
  withTempDir((dir) => {
    const dest = join(dir, "nested", "deeper", "corpus.json");
    writeFileAtomic(dest, "hello");
    assert.equal(readFileSync(dest, "utf-8"), "hello");
  });
});

test("writeFileAtomic overwrites an existing file", () => {
  withTempDir((dir) => {
    const dest = join(dir, "cards.json");
    writeFileSync(dest, "old");
    writeFileAtomic(dest, "new");
    assert.equal(readFileSync(dest, "utf-8"), "new");
    assert.deepEqual(leftoverTemps(dir), []);
  });
});

test("writeFileAtomic passes options through to writeFileSync", () => {
  withTempDir((dir) => {
    const dest = join(dir, "utf.txt");
    writeFileAtomic(dest, "日本語", "utf-8");
    assert.equal(readFileSync(dest, "utf-8"), "日本語");
  });
});

test("writeFileAtomic cleans up its temp file and rethrows when the rename fails", () => {
  withTempDir((dir) => {
    // A directory at the destination makes renameSync fail after the temp is written.
    const dest = join(dir, "occupied");
    mkdirSync(join(dest, "child"), { recursive: true });

    assert.throws(() => writeFileAtomic(dest, "payload"));
    assert.deepEqual(
      leftoverTemps(dir),
      [],
      "a failed publish must not strand a temp file next to the destination",
    );
  });
});

test("writeFileAtomicAsync writes the file and leaves no temp behind", async () => {
  const dir = mkdtempSync(join(tmpdir(), "atomic-write-"));
  try {
    const dest = join(dir, "clip.mp3");
    await writeFileAtomicAsync(dest, Buffer.from("mp3 bytes"));
    assert.equal(readFileSync(dest, "utf-8"), "mp3 bytes");
    assert.deepEqual(leftoverTemps(dir), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("copyFileAtomic copies and leaves no temp behind", () => {
  withTempDir((dir) => {
    const src = join(dir, "book.epub");
    const dest = join(dir, "copy", "book.epub");
    writeFileSync(src, "epub bytes");
    copyFileAtomic(src, dest);
    assert.equal(readFileSync(dest, "utf-8"), "epub bytes");
    assert.deepEqual(leftoverTemps(join(dir, "copy")), []);
  });
});

// The real proof. Four separate PROCESSES publish distinct 1 MB payloads to one path in a
// loop while this process reads that path continuously. Every read must come back as one
// payload whole — never a mix of two, never a truncation. Without the rename this fails
// essentially every run at 1 MB; with it, it cannot fail.
//
// Separate processes, not Promise.all: `runClaude` is spawnSync and blocks the event loop,
// so in-process concurrency would not reproduce the race this guards against anyway.
test("concurrent writers from separate processes never expose a partial file", async () => {
  const dir = mkdtempSync(join(tmpdir(), "atomic-write-race-"));
  try {
    const dest = join(dir, "contended.bin");
    const writers = ["a", "b", "c", "d"];
    const SIZE = 1024 * 1024;
    const ITERATIONS = 30;

    const childPath = join(dir, "writer.mjs");
    writeFileSync(
      childPath,
      `import { writeFileAtomic } from ${JSON.stringify(ATOMIC_WRITE_MODULE)};
const [dest, char, size, iterations] = [process.argv[2], process.argv[3], Number(process.argv[4]), Number(process.argv[5])];
const payload = char.repeat(size);
for (let i = 0; i < iterations; i++) writeFileAtomic(dest, payload);
`,
    );

    const children = writers.map((char) =>
      execFileAsync(process.execPath, [childPath, dest, char, String(SIZE), String(ITERATIONS)]),
    );

    let reads = 0;
    let settled = false;
    const all = Promise.all(children).then(() => {
      settled = true;
    });

    while (!settled) {
      if (existsSync(dest)) {
        let contents;
        try {
          contents = readFileSync(dest, "utf-8");
        } catch {
          contents = null; // the file was renamed over mid-read; not a torn read
        }
        if (contents !== null) {
          reads += 1;
          assert.equal(contents.length, SIZE, `read a ${contents.length}-byte partial file`);
          const first = contents[0];
          assert.ok(writers.includes(first), `unexpected payload starting with ${first}`);
          assert.equal(
            contents,
            first.repeat(SIZE),
            "read a file containing bytes from more than one writer",
          );
        }
      }
      await new Promise((r) => setImmediate(r));
    }
    await all;

    assert.ok(reads > 0, "the reader never observed the file — test proved nothing");
    assert.deepEqual(leftoverTemps(dir), [], "no temp files may survive the run");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
