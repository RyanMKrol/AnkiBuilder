#!/usr/bin/env node
// Turns the pictures of words inside an otherwise ordinary EPUB back into text.
//
// Some EPUBs print every kanji word that carries a reading as a small picture (the kanji with its
// furigana underneath) in the middle of a line of kana. The text around it reads fine; the word
// itself is missing, to the deck pipeline and to every other text reader. `remaster-epub.mjs check`
// says `glyphs` for such a book. This script reads each distinct picture three ways, settles the
// ones the readers disagree on, and writes a copy of the book with each picture replaced by the
// text it showed (as <ruby> when a reading was printed). Everything else in the book is untouched.
//
//   node scripts/glyph-images.mjs scan   <book.epub>              free: list the pictures
//   node scripts/glyph-images.mjs ocr    <book.epub>              free: Apple Vision, local
//   node scripts/glyph-images.mjs read   <book.epub> --reading a|b [--limit N] [--batch 20]
//                                                    [--concurrency 6]
//   node scripts/glyph-images.mjs settle <book.epub> [--limit N] [--batch 10] [--concurrency 4]
//   node scripts/glyph-images.mjs build  <book.epub> --out <fixed.epub> [--allow-unsettled]
//   node scripts/glyph-images.mjs status <book.epub>
//
// `read` and `settle` are paid (Sonnet, then Opus). Both resume: a picture already read is never
// sent again. `--limit N` works on the first N pictures only, for a pilot. `settle` exits 1 when it
// STOPPED (a usage limit: re-run it) and 3 when it finished with pictures it could not settle.
//
// The workspace is .anki-builder/glyphs/<hash>/ and holds pictures cut from a commercial book: it is
// gitignored with the rest of the library and must stay that way.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join, resolve } from "path";
import { readZip } from "../src/deck/zip.js";
import { listChapters, getBookTitle } from "../src/corpus/epubArchive.js";
import { hashEpubFile } from "../src/corpus/epubLibrary.js";
import { assessEpubEligibility, formatEligibility } from "../src/corpus/epubEligibility.js";
import { buildGlyphInventory, glyphBytes, glyphId } from "../src/glyphs/inventory.js";
import {
  renderReadPrompt,
  renderSettlePrompt,
  parseGlyphReply,
  acceptedWithoutSettle,
  ocrVerdict,
  sameReading,
} from "../src/glyphs/glyphRead.js";
import { rewriteEpub } from "../src/glyphs/rewriteEpub.js";
import { glyphPaths } from "../src/glyphs/workspace.js";
import { ensureOcrBinary, ocrPages } from "../src/remaster/visionOcr.js";
import {
  runGlyphReadClaude,
  runGlyphSettleClaude,
  remasterPinning,
} from "../src/remaster/remasterRunners.js";
import { appendJournal, loggedRunner } from "../src/remaster/journal.js";
import { writeFileAtomic } from "../src/util/atomicWrite.js";
import { chunk } from "../src/util/chunk.js";

const EXIT_STOPPED = 1;
const EXIT_UNSETTLED = 3;
// A batch whose reply breaks a rule is sent again, up to this many times in all; only the pictures
// still without a valid reading go in the retry.
const ATTEMPTS = 3;

function parseArgs(argv) {
  const [command, book, ...rest] = argv;
  const flags = {};
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (!arg.startsWith("--")) throw new Error(`unexpected argument: ${arg}`);
    const name = arg.slice(2);
    const next = rest[i + 1];
    if (next === undefined || next.startsWith("--")) flags[name] = true;
    else {
      flags[name] = next;
      i++;
    }
  }
  return { command, book: book && resolve(book), flags };
}

function readJson(path, fallback) {
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf-8")) : fallback;
}

function writeJson(path, value) {
  writeFileAtomic(path, `${JSON.stringify(value, null, 1)}\n`);
}

function loadInventory(paths) {
  const inventory = readJson(paths.inventory, null);
  if (!inventory) throw new Error(`no inventory yet: run \`scan\` first (${paths.inventory})`);
  for (const glyph of inventory.glyphs) glyph.imagePath = join(paths.images, glyph.id + glyph.ext);
  return inventory;
}

function limited(glyphs, flags) {
  return flags.limit ? glyphs.slice(0, Number(flags.limit)) : glyphs;
}

async function pool(items, concurrency, worker) {
  const queue = [...items];
  const runners = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    while (queue.length) await worker(queue.shift());
  });
  await Promise.all(runners);
}

function scan(book, paths) {
  const entries = readZip(readFileSync(book));
  const inventory = buildGlyphInventory(book, { entries });
  mkdirSync(paths.images, { recursive: true });
  for (const glyph of inventory.glyphs) {
    const dest = join(paths.images, glyph.id + glyph.ext);
    if (!existsSync(dest)) writeFileSync(dest, glyphBytes(entries, glyph));
  }
  writeJson(paths.inventory, { book, title: getBookTitle(book), ...inventory });
  appendJournal(paths.root, {
    event: "scan",
    glyphs: inventory.glyphs.length,
    uses: inventory.uses,
    files: inventory.files,
  });
  console.log(
    `${inventory.glyphs.length} distinct picture(s), used ${inventory.uses} time(s) across ` +
      `${inventory.files} file(s). Pictures: ${paths.images}`,
  );
}

async function ocr(paths) {
  const inventory = loadInventory(paths);
  const binaryPath = ensureOcrBinary(paths.ocrBinary);
  const pages = inventory.glyphs.map((g, i) => ({ number: i + 1, localPath: g.imagePath }));
  const result = await ocrPages(pages, {
    binaryPath,
    ocrDir: paths.ocr,
    stem: glyphId,
    log: (line) => process.stdout.write(`\r${line}`),
  });
  console.log(`\nocr: ${result.ocred} read, ${result.skipped} already done`);
}

/**
 * Sends `glyphs` to `run` in batches, retrying only the pictures whose entry was missing or broke a
 * rule. `save(id, entry)` is called for every valid entry as it arrives, so a stop loses nothing.
 */
async function readInBatches(
  glyphs,
  { prompt, run, save, batchSize, concurrency, label, journal },
) {
  const failed = [];
  let done = 0;
  await pool(chunk(glyphs, batchSize), concurrency, async (batch) => {
    let todo = batch;
    for (let attempt = 1; attempt <= ATTEMPTS && todo.length; attempt++) {
      let reply;
      try {
        reply = await run(prompt(todo));
      } catch (error) {
        // A usage limit stops everything (every other batch would fail the same way); anything
        // else (a timeout, a crash) costs this attempt only.
        if (error.quotaExhausted) throw error;
        journal({ event: `${label}-error`, attempt, error: error.message });
        continue;
      }
      const { entries, problems } = parseGlyphReply(
        reply,
        todo.map((g) => g.id),
      );
      for (const [id, entry] of entries) save(id, entry);
      if (problems.length) journal({ event: `${label}-problems`, attempt, problems });
      todo = todo.filter((g) => !entries.has(g.id));
    }
    failed.push(...todo.map((g) => g.id));
    done += batch.length;
    process.stdout.write(`\r  ${label} ${done}/${glyphs.length}`);
  });
  process.stdout.write("\n");
  return failed;
}

async function read(paths, flags) {
  const reading = flags.reading;
  if (reading !== "a" && reading !== "b") throw new Error("--reading must be a or b");
  const inventory = loadInventory(paths);
  const file = paths.reading(reading);
  const readings = readJson(file, {});
  const todo = limited(inventory.glyphs, flags).filter((g) => !readings[g.id]);
  const { model, effort } = remasterPinning("GLYPH_READ");
  console.log(`reading ${reading}: ${todo.length} picture(s) to read with ${model} (${effort})`);
  let current = [];
  const { run } = loggedRunner(paths.root, runGlyphReadClaude, {
    role: `glyph-read-${reading}`,
    model,
    effort,
    context: () => ({ ids: current.map((g) => g.id) }),
  });
  const failed = await readInBatches(todo, {
    prompt: (batch) => {
      current = batch;
      return renderReadPrompt({ bookTitle: inventory.title, batch });
    },
    run,
    save: (id, entry) => {
      readings[id] = { ...entry, model, effort };
      writeJson(file, readings);
    },
    batchSize: Number(flags.batch ?? 20),
    concurrency: Number(flags.concurrency ?? 6),
    label: `read-${reading}`,
    journal: (event) => appendJournal(paths.root, event),
  });
  appendJournal(paths.root, { event: "read", reading, sent: todo.length, failed });
  if (failed.length) console.log(`no valid reading after ${ATTEMPTS} tries: ${failed.join(", ")}`);
}

function ocrFor(paths, glyph) {
  return readJson(join(paths.ocr, `${glyph.id}.json`), null);
}

function settleQueue(paths, inventory, flags) {
  const a = readJson(paths.reading("a"), {});
  const b = readJson(paths.reading("b"), {});
  const queue = [];
  const unread = [];
  for (const glyph of limited(inventory.glyphs, flags)) {
    if (!a[glyph.id] || !b[glyph.id]) {
      unread.push(glyph.id);
      continue;
    }
    const ocrResult = ocrFor(paths, glyph);
    if (!acceptedWithoutSettle(a[glyph.id], b[glyph.id], ocrResult)) {
      queue.push({ glyph, a: a[glyph.id], b: b[glyph.id], ocr: ocrResult });
    }
  }
  return { queue, unread };
}

async function settle(paths, flags) {
  const inventory = loadInventory(paths);
  const settled = readJson(paths.settled, {});
  const { queue, unread } = settleQueue(paths, inventory, flags);
  if (unread.length) {
    throw new Error(`${unread.length} picture(s) lack reading a or b: run \`read\` for both first`);
  }
  const todo = queue.filter((item) => !settled[item.glyph.id]);
  const { model, effort } = remasterPinning("GLYPH_SETTLE");
  console.log(
    `${queue.length} picture(s) need settling, ${todo.length} not yet settled; using ${model} (${effort})`,
  );
  const byId = new Map(todo.map((item) => [item.glyph.id, item]));
  let current = [];
  const { run } = loggedRunner(paths.root, runGlyphSettleClaude, {
    role: "glyph-settle",
    model,
    effort,
    context: () => ({ ids: current.map((g) => g.id) }),
  });
  const failed = await readInBatches(
    todo.map((item) => item.glyph),
    {
      prompt: (batch) => {
        current = batch;
        return renderSettlePrompt({
          bookTitle: inventory.title,
          items: batch.map((g) => byId.get(g.id)),
        });
      },
      run,
      save: (id, entry) => {
        const item = byId.get(id);
        settled[id] = {
          ...entry,
          model,
          effort,
          agreedWith: ["a", "b"].filter((r) => sameReading(item[r], entry)),
          ocr: ocrVerdict(item.ocr, entry),
        };
        writeJson(paths.settled, settled);
      },
      batchSize: Number(flags.batch ?? 10),
      concurrency: Number(flags.concurrency ?? 4),
      label: "settle",
      journal: (event) => appendJournal(paths.root, event),
    },
  );
  appendJournal(paths.root, { event: "settle", sent: todo.length, failed });
  if (failed.length) {
    console.log(`could not settle: ${failed.join(", ")}`);
    return EXIT_UNSETTLED;
  }
  return 0;
}

/** The reading each picture ends up with, and where it came from. */
function finalReadings(paths, inventory) {
  const a = readJson(paths.reading("a"), {});
  const b = readJson(paths.reading("b"), {});
  const settled = readJson(paths.settled, {});
  const final = new Map();
  const missing = [];
  const sources = { agreed: 0, settled: 0 };
  for (const glyph of inventory.glyphs) {
    const ocrResult = ocrFor(paths, glyph);
    if (a[glyph.id] && b[glyph.id] && acceptedWithoutSettle(a[glyph.id], b[glyph.id], ocrResult)) {
      final.set(glyph.sha, { ...a[glyph.id], source: "agreed" });
      sources.agreed++;
    } else if (settled[glyph.id]) {
      final.set(glyph.sha, { ...settled[glyph.id], source: "settled" });
      sources.settled++;
    } else {
      missing.push(glyph.id);
    }
  }
  return { final, missing, sources };
}

function build(book, paths, flags) {
  if (!flags.out || flags.out === true) throw new Error("build needs --out <fixed.epub>");
  const out = resolve(flags.out);
  if (out === book) throw new Error("--out must be a new file, not the source book");
  const inventory = loadInventory(paths);
  const { final, missing, sources } = finalReadings(paths, inventory);
  if (missing.length && !flags["allow-unsettled"]) {
    throw new Error(
      `${missing.length} picture(s) have no settled reading (${missing.slice(0, 10).join(", ")}` +
        `${missing.length > 10 ? ", …" : ""}). Finish read and settle, or pass --allow-unsettled ` +
        `to leave those as pictures.`,
    );
  }
  const entries = readZip(readFileSync(book));
  const { chapters } = listChapters(book);
  const { buffer, files } = rewriteEpub(entries, chapters, final);
  writeFileSync(out, buffer);

  const replaced = files.reduce((sum, f) => sum + f.replaced, 0);
  const kept = files.reduce((sum, f) => sum + f.kept, 0);
  const other = [...final.values()].filter((r) => r.kind === "other").length;
  const after = assessEpubEligibility(out);
  const leftover = buildGlyphInventory(out);
  appendJournal(paths.root, {
    event: "build",
    out,
    replaced,
    kept,
    sources,
    missing,
    verdictAfter: after.verdict,
    picturesLeft: leftover.glyphs.length,
  });
  console.log(
    `wrote ${out}\n  ${replaced} picture use(s) replaced with text across ${files.length} file(s); ` +
      `${kept} left as pictures (${other} distinct picture(s) read as not writing` +
      `${missing.length ? `, ${missing.length} unsettled` : ""})\n` +
      `  readings: ${sources.agreed} agreed by all three readers, ${sources.settled} settled`,
  );
  console.log(formatEligibility(after).join("\n"));
  if (after.verdict !== "native") {
    console.log("VERIFY FAILED: the rewritten book is not native.");
    return 2;
  }
  return 0;
}

function status(paths) {
  const inventory = loadInventory(paths);
  const a = readJson(paths.reading("a"), {});
  const b = readJson(paths.reading("b"), {});
  const settled = readJson(paths.settled, {});
  const ocrDone = inventory.glyphs.filter((g) =>
    existsSync(join(paths.ocr, `${g.id}.json`)),
  ).length;
  const both = inventory.glyphs.filter((g) => a[g.id] && b[g.id]);
  const abAgree = both.filter((g) => sameReading(a[g.id], b[g.id])).length;
  const { queue } = settleQueue(paths, inventory, {});
  const { missing, sources } = finalReadings(paths, inventory);
  console.log(
    [
      `pictures: ${inventory.glyphs.length} (used ${inventory.uses} times)`,
      `ocr: ${ocrDone}`,
      `reading a: ${Object.keys(a).length}, reading b: ${Object.keys(b).length}`,
      `a and b agree: ${abAgree} of ${both.length}`,
      `need settling: ${queue.length}, settled: ${Object.keys(settled).length}`,
      `final: ${sources.agreed} agreed, ${sources.settled} settled, ${missing.length} still open`,
    ].join("\n"),
  );
}

async function main() {
  const { command, book, flags } = parseArgs(process.argv.slice(2));
  if (!command || !book) {
    console.log(
      readFileSync(new URL(import.meta.url), "utf-8")
        .split("\n")
        .slice(1, 21)
        .join("\n"),
    );
    return 2;
  }
  if (!existsSync(book)) throw new Error(`no such file: ${book}`);
  const paths = glyphPaths(hashEpubFile(book));
  mkdirSync(paths.root, { recursive: true });
  switch (command) {
    case "scan":
      scan(book, paths);
      return 0;
    case "ocr":
      await ocr(paths);
      return 0;
    case "read":
      await read(paths, flags);
      return 0;
    case "settle":
      return settle(paths, flags);
    case "build":
      return build(book, paths, flags);
    case "status":
      status(paths);
      return 0;
    default:
      throw new Error(`unknown command: ${command}`);
  }
}

main()
  .then((code) => process.exit(code ?? 0))
  .catch((error) => {
    console.error(error.message);
    process.exit(error.quotaExhausted ? EXIT_STOPPED : 2);
  });
