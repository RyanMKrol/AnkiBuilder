import { spawn as nodeSpawn, spawnSync } from "child_process";
import { createHash } from "crypto";
import { existsSync, readFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { writeFileAtomic } from "../util/atomicWrite.js";

// Apple Vision OCR, used as an independent second reading of every page.
//
// It is not the transcription. Vision reads individual characters very well (on Genki it got
// every kana on a dense exercise page right) but it has no idea of layout: furigana comes back as
// orphan lines detached from the word they sit over, columns interleave, and list numbers vanish.
// So Claude writes the structured transcript and Vision checks its characters. Two readers that
// fail differently are what make a disagreement worth looking at (see ocrCrossCheck.js).
//
// macOS only. It needs `swiftc`, which ships with the Xcode command line tools; the Vision
// framework itself is part of the OS. Free, local, and about two seconds a page.

const SOURCE = join(dirname(fileURLToPath(import.meta.url)), "vision-ocr.swift");

/**
 * Compiles the helper once and reuses it. The source hash is stored beside the binary, so an
 * edit to vision-ocr.swift rebuilds it rather than silently running the old one.
 */
export function ensureOcrBinary(binaryPath, { run = spawnSync } = {}) {
  const sourceHash = createHash("sha256").update(readFileSync(SOURCE)).digest("hex");
  const stampPath = `${binaryPath}.source-sha256`;
  if (existsSync(binaryPath) && existsSync(stampPath)) {
    if (readFileSync(stampPath, "utf-8").trim() === sourceHash) return binaryPath;
  }
  mkdirSync(dirname(binaryPath), { recursive: true });
  const result = run("swiftc", ["-O", "-o", binaryPath, SOURCE], { encoding: "utf-8" });
  if (result.error || result.status !== 0) {
    throw new Error(
      `could not compile the Vision OCR helper (${SOURCE}). It needs macOS and swiftc from the ` +
        `Xcode command line tools (xcode-select --install).\n` +
        `${result.error?.message ?? ""}${result.stderr ?? ""}`,
    );
  }
  writeFileAtomic(stampPath, `${sourceHash}\n`);
  return binaryPath;
}

function runBatch(binaryPath, imagePaths, spawn) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(binaryPath, imagePaths, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`vision-ocr exited ${code}: ${stderr.trim()}`));
        return;
      }
      resolvePromise(
        stdout
          .split("\n")
          .filter((line) => line.trim())
          .map((line) => JSON.parse(line)),
      );
    });
  });
}

/**
 * OCRs `pages` (each `{ number, localPath }`) and writes `<ocrDir>/page-NNN.json` for each,
 * skipping pages whose OCR already exists. Runs `concurrency` helper processes, each over a batch
 * of `batchSize` images, so process start-up is paid per batch rather than per page.
 */
export async function ocrPages(
  pages,
  { binaryPath, ocrDir, stem, concurrency = 4, batchSize = 10, spawn = nodeSpawn, log = () => {} },
) {
  mkdirSync(ocrDir, { recursive: true });
  const todo = pages.filter((page) => !existsSync(join(ocrDir, `${stem(page.number)}.json`)));
  const batches = [];
  for (let i = 0; i < todo.length; i += batchSize) batches.push(todo.slice(i, i + batchSize));

  let done = 0;
  const worker = async () => {
    while (batches.length) {
      const batch = batches.shift();
      const results = await runBatch(
        binaryPath,
        batch.map((page) => page.localPath),
        spawn,
      );
      results.forEach((result, index) => {
        const page = batch[index];
        writeFileAtomic(
          join(ocrDir, `${stem(page.number)}.json`),
          `${JSON.stringify({ page: page.number, ...result, file: undefined }, null, 1)}\n`,
        );
      });
      done += batch.length;
      log(`  ocr ${done}/${todo.length}`);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, batches.length) }, worker));
  return { ocred: todo.length, skipped: pages.length - todo.length };
}

export function loadPageOcr(ocrDir, stem, number) {
  const path = join(ocrDir, `${stem(number)}.json`);
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf-8")) : null;
}

/** OCR lines top to bottom (Vision's y grows upward), for reading as plain text. */
export function ocrLinesTopDown(ocr) {
  return [...(ocr?.lines ?? [])].sort((a, b) => b.y - a.y || a.x - b.x);
}

/**
 * The lines in a page's margins: running headers, printed page numbers and side tabs, which is
 * where a book says where you are in it. `band` is the fraction of the page counted as margin at
 * each edge, top and bottom as well as left and right (Genki's lesson tab sits on the right edge).
 */
export function marginLines(ocr, { band = 0.08, maxChars = 20 } = {}) {
  // Short lines only. A header, a page number and a tab are a few characters; a footnote printed
  // near the bottom edge is a sentence, and treating it as margin hid it from the cross-check
  // (Genki page 50's footnote about こんにちは) and fed body text to the outline pass.
  return ocrLinesTopDown(ocr).filter(
    (line) =>
      line.text.trim().length <= maxChars &&
      (line.y + line.h > 1 - band || line.y < band || line.x > 1 - band || line.x + line.w < band),
  );
}
