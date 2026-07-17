import { writeFileSync } from "fs";
import { join } from "path";
import { deflateRawSync } from "zlib";
import { Buffer } from "buffer";

// Shared by any test needing a real, parseable (if minimal) .epub fixture — a
// dependency-free hand-rolled zip writer mirroring src/deck/zip.js's own approach,
// since the project already avoids pulling in a zip library for this.

function crc32(buffer) {
  let crc = ~0;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return ~crc >>> 0;
}

export function buildZip(files) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const { name, content } of files) {
    const nameBuffer = Buffer.from(name, "utf-8");
    const contentBuffer = Buffer.from(content, "utf-8");
    const compressed = deflateRawSync(contentBuffer);
    const crc = crc32(contentBuffer);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(8, 8);
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(contentBuffer.length, 22);
    localHeader.writeUInt16LE(nameBuffer.length, 26);
    localHeader.writeUInt16LE(0, 28);

    localParts.push(localHeader, nameBuffer, compressed);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(8, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(compressed.length, 20);
    centralHeader.writeUInt32LE(contentBuffer.length, 24);
    centralHeader.writeUInt16LE(nameBuffer.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);

    centralParts.push(centralHeader, nameBuffer);

    offset += localHeader.length + nameBuffer.length + compressed.length;
  }

  const centralDirectoryOffset = offset;
  const centralDirectory = Buffer.concat(centralParts);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralDirectory.length, 12);
  eocd.writeUInt32LE(centralDirectoryOffset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDirectory, eocd]);
}

export function containerXml(opfPath) {
  return `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="${opfPath}" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;
}

// manifestItems: [{ id, href, properties?, mediaType? }]; spineIdrefs: [id, ...] in reading
// order — deliberately NOT required to match manifestItems' order, so tests can prove spine
// order wins. Per-item `properties` (e.g. "nav") and `mediaType` (e.g. an NCX's
// "application/x-dtbncx+xml") are optional, needed only by tests that exercise navigation
// documents. dcTitles: raw inner content for zero or more <dc:title> elements, in document
// order. spineToc: the <spine toc="..."> idref, for locating a legacy NCX.
export function opfXml(manifestItems, spineIdrefs, dcTitles = [], { spineToc } = {}) {
  const manifest = manifestItems
    .map((i) => {
      const mediaType = i.mediaType || "application/xhtml+xml";
      const props = i.properties ? ` properties="${i.properties}"` : "";
      return `<item id="${i.id}" href="${i.href}" media-type="${mediaType}"${props}/>`;
    })
    .join("\n    ");
  const spine = spineIdrefs.map((id) => `<itemref idref="${id}"/>`).join("\n    ");
  const tocAttr = spineToc ? ` toc="${spineToc}"` : "";
  const metadata = dcTitles.length
    ? `<metadata>
    ${dcTitles.map((t) => `<dc:title>${t}</dc:title>`).join("\n    ")}
  </metadata>`
    : "";
  return `<?xml version="1.0"?>
<package version="3.0" xmlns="http://www.idpf.org/2007/opf">
  ${metadata}
  <manifest>
    ${manifest}
  </manifest>
  <spine${tocAttr}>
    ${spine}
  </spine>
</package>`;
}

/**
 * Writes a minimal, real (parseable) .epub fixture to `<dir>/book.epub` — just enough
 * for src/corpus/epubArchive.js's zip/OPF/nav parsing to succeed: a container.xml, an
 * OPF with the given manifest/spine (and optional <dc:title>s), plus any extra raw
 * files (chapter content, nav documents, images, ...).
 */
export function buildFixtureEpub(
  dir,
  {
    opfPath = "OEBPS/content.opf",
    manifestItems,
    spineIdrefs,
    extraFiles = [],
    dcTitles = [],
    spineToc,
  },
) {
  const epubPath = join(dir, "book.epub");
  const zipBuffer = buildZip([
    { name: "META-INF/container.xml", content: containerXml(opfPath) },
    { name: opfPath, content: opfXml(manifestItems, spineIdrefs, dcTitles, { spineToc }) },
    ...extraFiles,
  ]);
  writeFileSync(epubPath, zipBuffer);
  return epubPath;
}
