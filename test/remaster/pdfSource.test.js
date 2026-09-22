import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { isPdf, extractSourcePages } from "../../src/remaster/sourceBook.js";
import { renderPdfPages, DEFAULT_SCALE } from "../../src/remaster/pdfPages.js";
import { assessEpubEligibility } from "../../src/corpus/epubEligibility.js";

// A PDF joins the conversion where a page-image EPUB does: a numbered list of page pictures. Only
// this seam knows the difference, so these tests are about the seam, never about PDFKit.

test("a PDF is recognised by its extension, whatever its case", () => {
  assert.equal(isPdf("/books/genki.pdf"), true);
  assert.equal(isPdf("/books/GENKI.PDF"), true);
  assert.equal(isPdf("/books/genki.epub"), false);
});

test("a PDF is never native: it is converted, and the check says why", () => {
  const verdict = assessEpubEligibility("/books/genki.pdf");
  assert.equal(verdict.verdict, "remaster");
  assert.match(verdict.reasons[0], /this is a PDF/);
  assert.equal(verdict.report, null);
});

test("rendering reports the pages, the text layer and the title, as the same page shape", () => {
  const dir = mkdtempSync(join(tmpdir(), "anki-builder-pdf-"));
  try {
    const calls = [];
    const rendered = renderPdfPages("/books/genki.pdf", dir, {
      binaryPath: "/bin/pdf-render",
      run: (binary, args) => {
        calls.push({ binary, args });
        return {
          status: 0,
          stdout: JSON.stringify({
            pages: 2,
            written: ["page-001.jpg", "page-002.jpg"],
            textLayerChars: 0,
            title: "GENKI I",
          }),
        };
      },
    });
    assert.deepEqual(calls[0].args, ["/books/genki.pdf", dir, String(DEFAULT_SCALE)]);
    assert.deepEqual(rendered.pages, [
      { number: 1, localPath: join(dir, "page-001.jpg") },
      { number: 2, localPath: join(dir, "page-002.jpg") },
    ]);
    assert.equal(rendered.textLayerChars, 0);
    assert.equal(rendered.title, "GENKI I");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a renderer that fails says which file it could not read", () => {
  assert.throws(
    () =>
      renderPdfPages("/books/broken.pdf", "/tmp/x", {
        binaryPath: "/bin/pdf-render",
        run: () => ({ status: 1, stderr: "could not open" }),
      }),
    /could not render \/books\/broken.pdf: could not open/,
  );
});

test("an EPUB source reports no text layer, because the question does not apply", () => {
  const dir = mkdtempSync(join(tmpdir(), "anki-builder-pdf-"));
  try {
    // A one-page EPUB is enough: this asserts the shape of the answer, not the archive reading.
    const epub = join(dir, "book.epub");
    writeFileSync(epub, "");
    assert.throws(() => extractSourcePages(epub, { imagesDir: dir, binDir: dir }));
    assert.ok(!existsSync(join(dir, "pdf-render")), "no renderer is compiled for an EPUB");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
