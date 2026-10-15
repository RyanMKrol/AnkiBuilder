import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  findPageReferences,
  pageMarkersIn,
  resolveBookReferences,
  renderReferencedMaterial,
  MAX_FOLLOWED_PAGES,
} from "../../src/corpus/bookReferences.js";

const marker = (n) =>
  `<span epub:type="pagebreak" id="page_${n}" role="doc-pagebreak" title="${n}"/>`;

// A three-file book: an early lesson, the chapter under test, and an appendix after it.
function withBook(fn) {
  const root = mkdtempSync(join(tmpdir(), "book-refs-"));
  const chapters = join(root, "chapters");
  mkdirSync(chapters);
  mkdirSync(join(root, "images"));
  writeFileSync(join(root, "images", "p41.jpg"), "x");
  writeFileSync(join(chapters, "10.xhtml"), `${marker(5)}<p>Lesson one text.</p>`);
  const chapter =
    `${marker(20)}<p>The past form is shown once here. See the appendix (pp. 40, 41) for the past form.</p>` +
    `<p>As on p. 20 above, and as in Lesson one (see p. 5).</p><p>Also see p. 99.</p>`;
  writeFileSync(join(chapters, "12.xhtml"), chapter);
  writeFileSync(
    join(chapters, "30.xhtml"),
    `${marker(40)}<h2>D. Verbs</h2><table><tr><td>write</td>${marker(41)}<td>wrote</td></tr></table>` +
      `<img src="../images/p41.jpg"/>${marker(42)}<p>Index.</p>`,
  );
  try {
    return fn({ chapterFilePath: join(chapters, "12.xhtml"), chapterHtml: chapter });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("page references are found in the ways books write them", () => {
  const refs = findPageReferences("see p. 12; see pp. 244, 245; pages 4-6; p.152 and 30ページ").map(
    (r) => r.pages,
  );
  assert.deepEqual(refs, [["12"], ["244", "245"], ["4", "5", "6"], ["152"], ["30"]]);
});

test("only the EPUB page-break markers count as pages, labelled by their title", () => {
  const html = `${marker(7)}<img id="Page_7_img01" src="a.jpg"/>${marker(8)}`;
  assert.deepEqual(
    pageMarkersIn(html).map((m) => m.label),
    ["7", "8"],
  );
});

test("a later page is followed, with its text, tables and images; nothing is dropped in silence", () =>
  withBook((input) => {
    const resolved = resolveBookReferences(input);
    const statuses = Object.fromEntries(
      resolved.references.flatMap((r) => r.pages.map((p) => [p.page, p.status])),
    );
    assert.equal(statuses["40"], "followed");
    assert.equal(statuses["41"], "followed");
    assert.equal(statuses["20"], "in-chapter", "a page the chapter already holds is not re-sent");
    assert.equal(statuses["5"], "earlier", "an earlier part of the book taught it already");
    assert.equal(statuses["99"], "unresolved", "a page the cache cannot find is reported");
    assert.equal(resolved.counts.unresolved, 1);

    const [p40, p41] = resolved.followed;
    assert.match(p40.text, /D\. Verbs/);
    assert.equal(p40.tables.length, 1, "a table cut by a page break is still parsed whole");
    assert.equal(p41.images.length, 1);
    assert.equal(p41.images[0].exists, true);
    assert.match(renderReferencedMaterial(resolved), /Page 40 \(sent here by "pp\. 40, 41"\)/);
  }));

test("a chapter that points nowhere says so rather than rendering an empty block", () => {
  assert.match(renderReferencedMaterial({ followed: [] }), /no other part of the book/);
});

test("the followed pages are capped, and the ones past the cap are recorded", () =>
  withBook(({ chapterFilePath }) => {
    const pages = Array.from({ length: MAX_FOLLOWED_PAGES + 2 }, (_, i) => 50 + i);
    writeFileSync(
      join(chapterFilePath, "..", "40.xhtml"),
      pages.map((n) => `${marker(n)}<p>${n}</p>`).join(""),
    );
    const html = `${marker(20)}<p>see pp. ${pages[0]}-${pages.at(-1)}</p>`;
    const resolved = resolveBookReferences({ chapterFilePath, chapterHtml: html });
    assert.equal(resolved.counts.followed, MAX_FOLLOWED_PAGES);
    assert.equal(resolved.counts.overCap, 2);
  }));
