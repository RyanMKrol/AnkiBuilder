import { createHash } from "crypto";
import { Buffer } from "buffer";
import { buildZip } from "../deck/zip.js";

// Writes the remastered book: an ordinary EPUB 3 with one XHTML file per outline entry and a nav
// document naming each one. The goal is a book the existing pipeline cannot tell apart from a
// born-digital one, so it is deliberately plain: no styling, no fixed layout, no scripting.
//
// Every page keeps its provenance. Each page becomes a <section> carrying its page number, its
// printed page number and its source image name, so a card can be traced back to the picture it
// came from when someone doubts it.

function escapeXml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * `chapter-04.xhtml`, from the chapter number (see numberChapters in outline.js). Sortable, and the
 * same number the chapter's label, nav position and spine position carry.
 */
export function entryFileName(entry) {
  return `chapter-${String(entry.number).padStart(2, "0")}.xhtml`;
}

export function renderEntryXhtml(entry, pages, { language }) {
  const sections = pages.map((page) => {
    const printed = page.printed ? ` data-printed-page="${escapeXml(page.printed)}"` : "";
    return (
      `<section class="page" id="page-${page.number}" data-source-page="${page.number}"${printed}>\n` +
      `${page.body}\n</section>`
    );
  });
  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${language}" lang="${language}">
<head>
<meta charset="utf-8"/>
<title>${escapeXml(entry.label)}</title>
</head>
<body>
<h1>${escapeXml(entry.label)}</h1>
${sections.join("\n")}
</body>
</html>
`;
}

function renderNav(entries, { title, language }) {
  const items = entries
    .map((entry) => `<li><a href="${entryFileName(entry)}">${escapeXml(entry.label)}</a></li>`)
    .join("\n      ");
  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${language}" lang="${language}">
<head><meta charset="utf-8"/><title>${escapeXml(title)}</title></head>
<body>
  <nav epub:type="toc" id="toc">
    <h1>Contents</h1>
    <ol>
      ${items}
    </ol>
  </nav>
</body>
</html>
`;
}

function renderOpf(entries, images, { title, language, identifier, source, modified }) {
  const manifest = [
    ...entries.map(
      (entry) =>
        `<item id="e${entry.number}" href="${entryFileName(entry)}" media-type="application/xhtml+xml"/>`,
    ),
    ...images.map(
      (image, i) => `<item id="img${i + 1}" href="${image.name}" media-type="image/jpeg"/>`,
    ),
  ].join("\n    ");
  const spine = entries.map((entry) => `<itemref idref="e${entry.number}"/>`).join("\n    ");
  return `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="book-id">${escapeXml(identifier)}</dc:identifier>
    <dc:title>${escapeXml(title)}</dc:title>
    <dc:language>${escapeXml(language)}</dc:language>
    <dc:source>${escapeXml(source)}</dc:source>
    <meta property="dcterms:modified">${modified}</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    ${manifest}
  </manifest>
  <spine>
    ${spine}
  </spine>
</package>
`;
}

const CONTAINER = `<?xml version="1.0" encoding="utf-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
`;

/**
 * Builds the EPUB bytes. `entries` are outline entries, each with `pages` (parsed transcripts, in
 * order). `sourceHash` ties the result to the file it was made from; the identifier is derived
 * from it and from the entry list, so rebuilding the same selection gives the same identifier.
 *
 * `modified` is a parameter, not `new Date()`, so a test gets identical bytes on every run.
 */
export function buildRemasteredEpub(entries, { title, language, sourceHash, modified }) {
  // Figure crops and whole-page images, each `{ name: "images/…jpg", data }`, relative to OEBPS/
  // like the chapter files that reference them. The same crop can be listed by two builds of one
  // entry; it is packed once.
  const images = [];
  const seenImages = new Set();
  for (const entry of entries) {
    for (const image of entry.images ?? []) {
      if (seenImages.has(image.name)) continue;
      seenImages.add(image.name);
      images.push(image);
    }
  }
  const identity = createHash("sha256")
    .update(
      `${sourceHash}\n${entries.map((e) => `${e.label}:${e.firstPage}-${e.lastPage}`).join("\n")}`,
    )
    .digest("hex");
  const identifier = `urn:anki-builder:remaster:${identity.slice(0, 32)}`;
  const files = [
    { name: "mimetype", data: Buffer.from("application/epub+zip"), store: true },
    { name: "META-INF/container.xml", data: Buffer.from(CONTAINER) },
    {
      name: "OEBPS/content.opf",
      data: Buffer.from(
        renderOpf(entries, images, {
          title,
          language,
          identifier,
          source: `remastered from page images, source sha256 prefix ${sourceHash}`,
          modified,
        }),
      ),
    },
    { name: "OEBPS/nav.xhtml", data: Buffer.from(renderNav(entries, { title, language })) },
    ...entries.map((entry) => ({
      name: `OEBPS/${entryFileName(entry)}`,
      data: Buffer.from(renderEntryXhtml(entry, entry.pages, { language })),
    })),
    ...images.map((image) => ({ name: `OEBPS/${image.name}`, data: image.data })),
  ];
  return buildZip(files);
}
