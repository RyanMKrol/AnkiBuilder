import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import os from "os";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const BIN_PATH = join(__dirname, "../../src/cli/bin.js");

async function withTempDir(fn) {
  const tmpDir = await fs.mkdtemp(join(os.tmpdir(), "cli-env-test-"));
  try {
    return await fn(tmpDir);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

test("loads a variable from a scratch .env file in the working directory", async () => {
  await withTempDir(async (cwd) => {
    await fs.writeFile(join(cwd, ".env"), "ANKI_BUILDER_TEST_VAR=from-dotenv\n");

    const { stdout } = await execFileAsync(
      process.execPath,
      ["--env-file-if-exists=.env", "-e", "console.log(process.env.ANKI_BUILDER_TEST_VAR)"],
      { cwd },
    );

    assert.equal(stdout.trim(), "from-dotenv");
  });
});

test("bin.js runs fine with no .env file present (unknown command still reports an error)", async () => {
  await withTempDir(async (cwd) => {
    await assert.rejects(() => execFileAsync(process.execPath, [BIN_PATH, "bogus"], { cwd }));
  });
});
