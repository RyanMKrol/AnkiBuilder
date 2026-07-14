import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { inflateRawSync } from "zlib";
import { posix, dirname, join } from "path";

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;

function findEndOfCentralDirectory(buffer) {
  for (let i = buffer.length - 22; i >= 0; i--) {
    if (buffer.readUInt32LE(i) === EOCD_SIGNATURE) {
      return i;
    }
  }
  throw new Error("Not a valid zip/epub file: end of central directory not found");
}

function readCentralDirectoryEntries(buffer, eocdOffset) {
  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16);

  const entries = [];
  let offset = centralDirectoryOffset;
  for (let i = 0; i < entryCount; i++) {
    if (buffer.readUInt32LE(offset) !== CENTRAL_DIRECTORY_SIGNATURE) {
      throw new Error("Invalid zip/epub file: malformed central directory entry");
    }

    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString("utf-8", offset + 46, offset + 46 + nameLength);

    entries.push({ name, method, compressedSize, localHeaderOffset });
    offset += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
}

function readEntryData(buffer, entry) {
  if (buffer.readUInt32LE(entry.localHeaderOffset) !== LOCAL_FILE_HEADER_SIGNATURE) {
    throw new Error("Invalid zip/epub file: malformed local file header");
  }

  const nameLength = buffer.readUInt16LE(entry.localHeaderOffset + 26);
  const extraLength = buffer.readUInt16LE(entry.localHeaderOffset + 28);
  const dataStart = entry.localHeaderOffset + 30 + nameLength + extraLength;
  const compressed = buffer.subarray(dataStart, dataStart + entry.compressedSize);

  if (entry.method === 0) {
    return compressed;
  }
  if (entry.method === 8) {
    return inflateRawSync(compressed);
  }
  throw new Error(`Unsupported zip compression method: ${entry.method}`);
}

function readZipEntries(buffer) {
  const eocdOffset = findEndOfCentralDirectory(buffer);
  const entries = readCentralDirectoryEntries(buffer, eocdOffset);
  return entries.map((entry) => ({
    name: entry.name,
    data: readEntryData(buffer, entry),
  }));
}

// Isolates each `<tagName ...>` (or self-closing `<tagName .../>`) occurrence as raw
// attribute text, then pulls attr="value" pairs out of that isolated text separately.
// Two steps rather than one monolithic regex because EPUB's container.xml/OPF don't
// guarantee attribute order, and this stays order-independent without needing a real
// XML parser. The `\b` after tagName is load-bearing — without it "item" would also
// match as a prefix of "itemref" (the same class of bug fixed earlier in <li>/<link>).
function findTags(xml, tagName) {
  const pattern = new RegExp(`<${tagName}\\b([^>]*)>`, "g");
  return [...xml.matchAll(pattern)].map((m) => m[1]);
}

function parseAttrs(attrString) {
  const attrs = {};
  const pattern = /([a-zA-Z:_-]+)\s*=\s*"([^"]*)"/g;
  let match;
  while ((match = pattern.exec(attrString)) !== null) {
    attrs[match[1]] = match[2];
  }
  return attrs;
}

// EPUB's one fixed, spec-mandated path: container.xml always points to the real
// package (OPF) document from here.
const CONTAINER_PATH = "META-INF/container.xml";

function parseContainerXml(entries) {
  const containerEntry = entries.find((e) => e.name === CONTAINER_PATH);
  if (!containerEntry) {
    throw new Error(`Not a valid EPUB: ${CONTAINER_PATH} not found`);
  }

  const xml = containerEntry.data.toString("utf-8");
  const [rootfileAttrs] = findTags(xml, "rootfile");
  if (!rootfileAttrs) {
    throw new Error(`Not a valid EPUB: no <rootfile> found in ${CONTAINER_PATH}`);
  }

  const { "full-path": fullPath } = parseAttrs(rootfileAttrs);
  if (!fullPath) {
    throw new Error(`Not a valid EPUB: <rootfile> in ${CONTAINER_PATH} is missing full-path`);
  }

  return fullPath;
}

// Reading order is defined by <spine>'s <itemref idref="..."> list, resolved through
// <manifest>'s id -> href map — NOT by the order <item> tags happen to be declared in
// the manifest. hrefs are relative to the OPF's own directory inside the archive, not
// the archive root, hence the posix.join/normalize against opfDir.
function parseOpfSpine(opfXml, opfDir) {
  const manifest = new Map();
  for (const attrString of findTags(opfXml, "item")) {
    const { id, href } = parseAttrs(attrString);
    if (id && href) {
      manifest.set(id, posix.normalize(posix.join(opfDir, href)));
    }
  }

  const spineIds = findTags(opfXml, "itemref")
    .map((attrString) => parseAttrs(attrString).idref)
    .filter(Boolean);

  return spineIds
    .map((id, index) => ({ number: index + 1, href: manifest.get(id) }))
    .filter((chapter) => chapter.href);
}

function loadEpub(epubPath) {
  const buffer = readFileSync(epubPath);
  const entries = readZipEntries(buffer);

  const opfPath = parseContainerXml(entries);
  const opfEntry = entries.find((e) => e.name === opfPath);
  if (!opfEntry) {
    throw new Error(`Not a valid EPUB: OPF file not found at ${opfPath}`);
  }

  const opfDir = posix.dirname(opfPath);
  const chapters = parseOpfSpine(opfEntry.data.toString("utf-8"), opfDir);

  return { entries, chapters, opfDir };
}

/**
 * Lists an EPUB's chapters in spine (reading) order — 1-indexed, not manifest
 * declaration order. `opfDir` is the archive-internal directory the package
 * document lives in, included for callers that need to resolve further paths
 * relative to it.
 */
export function listChapters(epubPath) {
  const { chapters, opfDir } = loadEpub(epubPath);
  return { chapters, opfDir };
}

function loadChapterEntry(epubPath, number) {
  const { entries, chapters } = loadEpub(epubPath);

  const chapter = chapters.find((c) => c.number === number);
  if (!chapter) {
    throw new Error(`Chapter ${number} not found — book has ${chapters.length} chapter(s)`);
  }

  const contentEntry = entries.find((e) => e.name === chapter.href);
  if (!contentEntry) {
    throw new Error(`Chapter ${number}'s content file "${chapter.href}" not found in archive`);
  }

  return { entries, chapter, content: contentEntry.data.toString("utf-8") };
}

/**
 * Reads chapter `number`'s raw content (UTF-8 text) directly out of the
 * archive, by 1-indexed spine position. No HTML stripping or text
 * extraction happens here — callers that need flashcard content still go
 * through the LLM extractor, which reads whatever file this content ends up
 * in via its own Read tool.
 */
export function readChapter(epubPath, number) {
  return loadChapterEntry(epubPath, number).content;
}

// The image-aware extraction prompt (docs/epub-extraction-prompt.md) tells the model to
// resolve each <img src> relative to the chapter file it just Read and open it directly —
// so any referenced image has to actually exist on disk at that resolved location, not
// just inside the original .epub archive. This extracts each referenced image to the
// exact path that resolving its own (possibly "../"-relative) src against `destPath`
// would produce, by applying that same relative src against BOTH the chapter's real
// archive-internal directory (to find the bytes) and destPath's directory (to place
// them) — so the on-disk relationship it copies mirrors the one baked into the HTML,
// however many directories deep that happens to be for a given EPUB. Missing images
// (a dangling reference, an external URL, a data: URI) are skipped rather than failing
// the whole chapter — most of a chapter's images are still real content even if one ref
// is bad.
const IMG_SRC_PATTERN = /<img\b[^>]*\bsrc="([^"]*)"/g;

function isLocalRelativePath(src) {
  return Boolean(src) && !/^([a-z]+:)?\/\//i.test(src) && !src.startsWith("data:");
}

function extractReferencedImages(entries, chapter, content, destPath) {
  const srcs = new Set(
    [...content.matchAll(IMG_SRC_PATTERN)].map((m) => m[1]).filter(isLocalRelativePath),
  );

  const chapterDir = posix.dirname(chapter.href);
  const destDir = dirname(destPath);

  for (const src of srcs) {
    const archivePath = posix.normalize(posix.join(chapterDir, src));
    const imageEntry = entries.find((e) => e.name === archivePath);
    if (!imageEntry) {
      continue;
    }

    const localDest = join(destDir, src);
    mkdirSync(dirname(localDest), { recursive: true });
    writeFileSync(localDest, imageEntry.data);
  }
}

/**
 * Extracts chapter `number`'s content to a real file on disk at `destPath`
 * (creating parent directories as needed), along with every image it
 * references via `<img src>` — for handing to `runClaude`, which reads
 * files (including images) by path, not inline content. Returns `destPath`.
 */
export function extractChapterToFile(epubPath, number, destPath) {
  const { entries, chapter, content } = loadChapterEntry(epubPath, number);
  mkdirSync(dirname(destPath), { recursive: true });
  writeFileSync(destPath, content, "utf-8");
  extractReferencedImages(entries, chapter, content, destPath);
  return destPath;
}
