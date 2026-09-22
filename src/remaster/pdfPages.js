import { spawnSync } from "child_process";
import { createHash } from "crypto";
import { existsSync, mkdirSync, readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { writeFileAtomic } from "../util/atomicWrite.js";

// A PDF's pages as images, so a PDF joins the conversion at exactly the same place an EPUB of page
// images does: a numbered list of page pictures. Everything after that (OCR, outline, selection,
// transcription, settling, build) is unchanged and does not know which kind of file it came from.
//
// Rendering is PDFKit through a compiled Swift helper (pdf-render.swift), like the OCR helper.
// macOS only, free, and fast: Genki's 393 pages render in about 17 seconds.

const SOURCE = join(dirname(fileURLToPath(import.meta.url)), "pdf-render.swift");

// 2.0 puts a US Letter page at about 1224x1584, close to the size a Calibre reflow produces and
// legible for both readers. Higher costs disk and slows the vision pass without being easier to
// read; lower starts losing furigana, which is the smallest thing on these pages.
export const DEFAULT_SCALE = 2;

/** Compiles the helper once, rebuilding when its source changes (same stamp as the OCR helper). */
export function ensurePdfBinary(binaryPath, { run = spawnSync } = {}) {
  const sourceHash = createHash("sha256").update(readFileSync(SOURCE)).digest("hex");
  const stampPath = `${binaryPath}.source-sha256`;
  if (existsSync(binaryPath) && existsSync(stampPath)) {
    if (readFileSync(stampPath, "utf-8").trim() === sourceHash) return binaryPath;
  }
  mkdirSync(dirname(binaryPath), { recursive: true });
  const result = run("swiftc", ["-O", "-o", binaryPath, SOURCE], { encoding: "utf-8" });
  if (result.error || result.status !== 0) {
    throw new Error(
      `could not compile the PDF renderer (${SOURCE}). It needs macOS and swiftc from the Xcode ` +
        `command line tools (xcode-select --install).\n${result.error?.message ?? ""}${result.stderr ?? ""}`,
    );
  }
  writeFileAtomic(stampPath, `${sourceHash}\n`);
  return binaryPath;
}

/**
 * Renders every page into `destDir` and returns `{ pages, pageCount, textLayerChars, title }`.
 * `pages` is `[{ number, localPath }]`, the same shape the EPUB path produces. Pages already
 * rendered are left alone.
 *
 * `textLayerChars` is how much selectable text the PDF carries: zero means its pages are pictures.
 * Nothing branches on it here; the eligibility check reports it, because a PDF with a real text
 * layer may one day be converted from that text instead of from its pictures.
 */
export function renderPdfPages(
  pdfPath,
  destDir,
  { binaryPath, scale = DEFAULT_SCALE, run = spawnSync } = {},
) {
  mkdirSync(destDir, { recursive: true });
  const result = run(binaryPath, [pdfPath, destDir, String(scale)], {
    encoding: "utf-8",
    maxBuffer: 20 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    throw new Error(`could not render ${pdfPath}: ${result.stderr || result.error?.message}`);
  }
  const report = JSON.parse(result.stdout);
  return {
    pages: report.written.map((name, index) => ({
      number: index + 1,
      localPath: join(destDir, name),
    })),
    pageCount: report.pages,
    textLayerChars: report.textLayerChars,
    title: report.title || null,
  };
}
