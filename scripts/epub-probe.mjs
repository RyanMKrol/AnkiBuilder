#!/usr/bin/env node
// Answers "will this book work?" for an EPUB, in about a second, for zero LLM and zero TTS
// spend — before any pass runs, and without registering the book or writing anything at all.
//
// Everything it prints is a degradation that happens today in silence: nav entries that
// resolve nowhere, entries collapsed onto one spine file, spine files no nav entry names (so
// no --lesson selector reaches them), inverted ranges, labels that collide with each other,
// images from different archive directories that overwrite each other in the shared cache.
// The one book this pipeline is proven on degrades on two of those axes; a hostile book
// degrades on all of them and still throws nothing.
//
// STRICTLY READ-ONLY. It opens the .epub and prints. It does not touch .anki-builder/,
// does not register the book, and does not extract a single file.
//
// Usage:
//   node scripts/epub-probe.mjs <book.epub> [--json]
import { existsSync } from "fs";
import { resolve } from "path";
import { buildShapeReport, formatShapeReport } from "../src/corpus/epubShapeReport.js";

const args = process.argv.slice(2);
const json = args.includes("--json");
const target = args.find((arg) => !arg.startsWith("--"));

if (!target) {
  console.error("usage: node scripts/epub-probe.mjs <book.epub> [--json]");
  process.exit(2);
}

const epubPath = resolve(target);
if (!existsSync(epubPath)) {
  console.error(`no such file: ${epubPath}`);
  process.exit(2);
}

let report;
try {
  report = buildShapeReport(epubPath);
} catch (error) {
  // A throw here is the GOOD case — the parser's loud rejections (ZIP64, an encrypted spine
  // document, a missing container.xml) are exactly what this probe exists to surface early.
  console.error(`REJECTED  ${epubPath}`);
  console.error(`  ${error.message}`);
  process.exit(1);
}

if (json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`${report.title ?? "(no <dc:title>)"}`);
  console.log(epubPath);
  console.log("");
  for (const line of formatShapeReport(report, { detail: true })) console.log(line);
  console.log("");
  console.log(
    report.warnings.length
      ? `${report.warnings.length} shape warning(s) — read them before spending a pass on this book`
      : "no shape warnings",
  );
}

// Warnings are advisory, not a gate: every one of them describes a book that still builds,
// just not the way its own table of contents suggests. Exit 0 so the probe can sit in a
// pipeline without failing it; a real parse failure above exits 1.
process.exit(0);
