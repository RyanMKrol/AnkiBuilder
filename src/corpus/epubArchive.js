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
// the archive root, hence the posix.join/normalize against opfDir. Also surfaces the
// full manifest item list (id/href/properties/media-type) and the <spine>'s own `toc`
// idref — both unused by chapter reading itself, but needed to locate the EPUB's own
// navigation document (nav.xhtml/toc.ncx) for describeChapter()/listExternalChapters().
function parseOpfDocument(opfXml, opfDir) {
  const manifestItems = [];
  const hrefById = new Map();
  for (const attrString of findTags(opfXml, "item")) {
    const { id, href, properties, "media-type": mediaType } = parseAttrs(attrString);
    if (!id || !href) {
      continue;
    }
    const archiveHref = posix.normalize(posix.join(opfDir, href));
    manifestItems.push({ id, href: archiveHref, properties, mediaType });
    hrefById.set(id, archiveHref);
  }

  const [spineAttrString] = findTags(opfXml, "spine");
  const tocId = spineAttrString ? parseAttrs(spineAttrString).toc : undefined;

  const spineIds = findTags(opfXml, "itemref")
    .map((attrString) => parseAttrs(attrString).idref)
    .filter(Boolean);

  const chapters = spineIds
    .map((id, index) => ({ number: index + 1, href: hrefById.get(id) }))
    .filter((chapter) => chapter.href);

  return { chapters, manifestItems, tocId };
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
  const opfXml = opfEntry.data.toString("utf-8");
  const { chapters, manifestItems, tocId } = parseOpfDocument(opfXml, opfDir);

  return { entries, chapters, opfDir, manifestItems, tocId, opfXml };
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

// OPF <metadata> can rarely carry more than one <dc:title> (a main title plus a
// subtitle wired together via `refines`) — the first one in document order is always
// the primary title, so no further disambiguation is needed.
const DC_TITLE_PATTERN = /<dc:title\b[^>]*>([\s\S]*?)<\/dc:title>/i;

/**
 * The book's own title, read from its OPF `<dc:title>` metadata — `null` when absent
 * (never a fallback string; callers decide what to substitute).
 */
export function getBookTitle(epubPath) {
  const { opfXml } = loadEpub(epubPath);
  const match = opfXml.match(DC_TITLE_PATTERN);
  if (!match) {
    return null;
  }
  const title = decodeHtmlEntities(match[1].replace(/<[^>]+>/g, "")).trim();
  return title || null;
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

const TITLE_TAG_PATTERN = /<title>([^<]*)<\/title>/i;
const HTML_ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'" };

function decodeHtmlEntities(text) {
  return text.replace(/&(amp|lt|gt|quot|#39);/g, (_, name) => HTML_ENTITIES[name]);
}

// EPUB chapter <title> tags commonly follow "<page title>, <book title>" — the book
// title repeats identically on every chapter and carries no per-chapter information, so
// it's dropped by keeping only the text before the first comma. Within what's left, a
// lesson/unit-style title can itself be several ":"-separated segments deep (e.g.
// "Lesson 1: Meeting: Nice to Meet You" — label, then title, then a fuller description) —
// only the first two are kept, since the third+ segment is descriptive prose rather than
// a label, and this needs to read naturally as a short human-facing chapter reference.
// This is the FALLBACK tier used only when the EPUB has no usable navigation document —
// see listExternalChapters() below for the preferred, spec-grounded source.
function shortenChapterTitle(rawTitle) {
  const pageTitle = decodeHtmlEntities(rawTitle).split(",")[0].trim();
  const segments = pageTitle
    .split(":")
    .map((s) => s.trim())
    .filter(Boolean);
  return segments.slice(0, 2).join(": ");
}

function describeChapterFromTitleTag(epubPath, number) {
  const { content } = loadChapterEntry(epubPath, number);
  const match = content.match(TITLE_TAG_PATTERN);
  const shortened = match ? shortenChapterTitle(match[1]) : "";
  return shortened || `chapter ${number}`;
}

// Same regex/attribute-scanning approach as findTags()/parseAttrs() (no real XML/HTML
// parser — see the "OPF/container.xml parsing is a hand-rolled scanner" trade-off this
// project has already accepted), but also captures each match's offset, since isolating
// the specific <nav epub:type="toc"> block among possibly several <nav> elements (toc,
// landmarks, page-list) needs position info that findTags() itself doesn't expose.
function findTagOccurrences(xml, tagName) {
  const pattern = new RegExp(`<${tagName}\\b([^>]*)>`, "g");
  return [...xml.matchAll(pattern)].map((m) => ({
    attrs: parseAttrs(m[1]),
    start: m.index,
    end: m.index + m[0].length,
  }));
}

// EPUB3's nav document can contain several <nav> blocks for different purposes
// (epub:type="toc", "landmarks", "page-list", ...) — only the "toc" one is a chapter
// list. epub:type is itself a space-separated token list (rarely, but validly,
// "toc landmarks" etc.), so this token-matches rather than doing an exact-string
// comparison.
function isolateNavToc(xhtml) {
  for (const tag of findTagOccurrences(xhtml, "nav")) {
    const epubTypeTokens = (tag.attrs["epub:type"] || "").split(/\s+/);
    if (!epubTypeTokens.includes("toc")) {
      continue;
    }
    const closeIndex = xhtml.indexOf("</nav>", tag.end);
    if (closeIndex === -1) {
      continue;
    }
    return xhtml.slice(tag.end, closeIndex);
  }
  return null;
}

const NAV_A_TAG_PATTERN = /<a\b[^>]*\bhref="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g;

// Returns the toc <nav>'s <a href="...">Label</a> entries in document order — nesting
// (a sub-<ol> under one <li> for sub-sections) is deliberately NOT tracked structurally,
// only sequence is: a <ol><li> tree read top-to-bottom already IS book reading order
// regardless of depth, and building a real tree here would be a step up in parsing
// complexity this codebase has consistently avoided (see findTags()'s own comment).
function parseNavXhtmlToc(xhtml) {
  const tocXml = isolateNavToc(xhtml);
  if (!tocXml) {
    return [];
  }

  const entries = [];
  for (const m of tocXml.matchAll(NAV_A_TAG_PATTERN)) {
    const href = m[1];
    const label = decodeHtmlEntities(m[2].replace(/<[^>]+>/g, "")).trim();
    if (href && label) {
      entries.push({ href, label });
    }
  }
  return entries;
}

function isolateNavMap(ncxXml) {
  const startMatch = /<navMap\b[^>]*>/i.exec(ncxXml);
  if (!startMatch) {
    return null;
  }
  const endIndex = ncxXml.indexOf("</navMap>", startMatch.index);
  if (endIndex === -1) {
    return null;
  }
  return ncxXml.slice(startMatch.index + startMatch[0].length, endIndex);
}

// NCX <navPoint>s can nest for sub-levels. Rather than tracking depth, this slices the
// navMap between one <navPoint> tag's start and the NEXT <navPoint> tag's start (sibling
// OR first child, whichever comes first in document order) — since a navPoint's own
// <navLabel>/<content> always precede any nested child <navPoint> in a well-formed NCX,
// taking the first label/content match within that slice always yields that navPoint's
// own data, never a descendant's. This produces one entry per navPoint, parent and child
// alike, flattened into one list in document order (same flattening philosophy as the
// nav.xhtml <ol> case above).
function parseNcxNavMap(ncxXml) {
  const navMapXml = isolateNavMap(ncxXml);
  if (!navMapXml) {
    return [];
  }

  const navPointStarts = [...navMapXml.matchAll(/<navPoint\b[^>]*>/g)].map((m) => m.index);
  const entries = [];
  for (let i = 0; i < navPointStarts.length; i++) {
    const start = navPointStarts[i];
    const end = i + 1 < navPointStarts.length ? navPointStarts[i + 1] : navMapXml.length;
    const slice = navMapXml.slice(start, end);

    const labelMatch = /<navLabel>\s*<text>([^<]*)<\/text>/i.exec(slice);
    const contentMatch = /<content\b[^>]*\bsrc="([^"]*)"/i.exec(slice);
    if (!labelMatch || !contentMatch) {
      continue;
    }

    const label = decodeHtmlEntities(labelMatch[1]).trim();
    const href = contentMatch[1];
    if (label && href) {
      entries.push({ href, label });
    }
  }
  return entries;
}

// properties is a space-separated token list (e.g. properties="nav scripted") — must
// token-match, not substring-match, so a hypothetical "navsomething" value doesn't
// false-positive.
function findManifestItemByProperty(manifestItems, token) {
  return manifestItems.find((item) => (item.properties || "").split(/\s+/).includes(token));
}

function findNcxManifestItem(manifestItems, tocId) {
  if (tocId) {
    const byId = manifestItems.find((item) => item.id === tocId);
    if (byId) {
      return byId;
    }
  }
  return manifestItems.find((item) => item.mediaType === "application/x-dtbncx+xml");
}

// A nav/NCX entry's href is relative to the nav/NCX document's OWN directory, not
// necessarily the OPF's — resolved the same posix.join/normalize way chapter hrefs are.
// Fragments (#page_267) are stripped since chapter identity is file-level, not
// position-within-file. URL-decoded before comparing since real EPUBs occasionally
// percent-encode spaces/special characters in nav hrefs even when the OPF manifest's
// hrefs for the same files aren't encoded.
function resolveHrefToSpinePosition(href, baseDir, chapters) {
  const withoutFragment = href.split("#")[0];
  if (!withoutFragment) {
    return null;
  }

  let decoded;
  try {
    decoded = decodeURIComponent(withoutFragment);
  } catch {
    decoded = withoutFragment;
  }

  const archivePath = posix.normalize(posix.join(baseDir, decoded));
  const chapter = chapters.find((c) => c.href === archivePath);
  return chapter ? chapter.number : null;
}

// Tries nav.xhtml (EPUB3, preferred — required by spec, located via the OPF manifest
// item whose properties include "nav") first, then toc.ncx (EPUB2/legacy, located via
// <spine toc="..."> or a media-type fallback) — returns null if neither exists, isn't
// found in the archive, or parses to zero entries, so the caller can fall through to the
// <title>-tag heuristic.
function resolveNavSource(entries, manifestItems, tocId) {
  const navItem = findManifestItemByProperty(manifestItems, "nav");
  if (navItem) {
    const navEntry = entries.find((e) => e.name === navItem.href);
    if (navEntry) {
      const rawEntries = parseNavXhtmlToc(navEntry.data.toString("utf-8"));
      if (rawEntries.length > 0) {
        return { rawEntries, baseDir: posix.dirname(navItem.href), source: "nav" };
      }
    }
  }

  const ncxItem = findNcxManifestItem(manifestItems, tocId);
  if (ncxItem) {
    const ncxEntry = entries.find((e) => e.name === ncxItem.href);
    if (ncxEntry) {
      const rawEntries = parseNcxNavMap(ncxEntry.data.toString("utf-8"));
      if (rawEntries.length > 0) {
        return { rawEntries, baseDir: posix.dirname(ncxItem.href), source: "ncx" };
      }
    }
  }

  return null;
}

/**
 * Lists the book's own human-declared chapters — sourced from its navigation document
 * (nav.xhtml, falling back to toc.ncx), each as a spine-position RANGE rather than a
 * single number, since one external (human) chapter can span several internal (spine)
 * files, or several external chapters can point into the same internal file. When
 * consecutive nav/NCX entries resolve to the SAME spine position, only the first one's
 * label is kept — there's no addressing finer than a chapter number to disambiguate
 * "the 2nd of 3 chapters in this file," so this is a deliberate, deterministic collapse,
 * not a crash or a silent duplicate. Returns `[]` when the EPUB has no navigation
 * document, it can't be found/parsed, or every one of its entries fails to resolve to a
 * real spine file — callers should treat that as "fall back to the <title>-tag
 * heuristic," not as an error.
 */
export function listExternalChapters(epubPath, { log = () => {} } = {}) {
  const { entries, chapters, manifestItems, tocId } = loadEpub(epubPath);

  const resolved = resolveNavSource(entries, manifestItems, tocId);
  if (!resolved) {
    return [];
  }
  const { rawEntries, baseDir, source } = resolved;

  const positioned = [];
  for (const { href, label } of rawEntries) {
    const spinePosition = resolveHrefToSpinePosition(href, baseDir, chapters);
    if (spinePosition == null) {
      log(
        `listExternalChapters: "${label}" (href "${href}") did not resolve to a spine file — skipped`,
      );
      continue;
    }
    positioned.push({ label, spinePosition });
  }

  const deduped = [];
  for (const entry of positioned) {
    const prev = deduped[deduped.length - 1];
    if (prev && prev.spinePosition === entry.spinePosition) {
      continue;
    }
    deduped.push(entry);
  }

  if (deduped.length === 0) {
    return [];
  }

  const lastSpineNumber = chapters[chapters.length - 1].number;
  return deduped.map((entry, i) => ({
    label: entry.label,
    firstChapterNumber: entry.spinePosition,
    lastChapterNumber: i + 1 < deduped.length ? deduped[i + 1].spinePosition - 1 : lastSpineNumber,
    source,
  }));
}

// listExternalChapters() itself stays pure/uncached (so tests and any other caller get
// deterministic, cache-free behavior, including a caller-supplied `log`). This cache
// exists only for describeChapter()'s own internal call path, which can invoke it many
// times in one process (e.g. once per flagged item in flagForwardConcerns) — without it,
// the same book's nav/NCX document would be re-parsed on every single call. Scoped to one
// process's lifetime: no TTL, no eviction, no invalidation — a CLI invocation processes
// one book.
const externalChaptersCache = new Map();

function listExternalChaptersCached(epubPath) {
  if (!externalChaptersCache.has(epubPath)) {
    externalChaptersCache.set(epubPath, listExternalChapters(epubPath));
  }
  return externalChaptersCache.get(epubPath);
}

/**
 * A short, human-readable label for chapter `number` — e.g. "Lesson 6: Going
 * Places (1)" — for surfacing to a person instead of the raw 1-indexed spine
 * position, which is an internal detail with no relationship to how the book
 * itself numbers/names its own chapters. Prefers the book's own navigation
 * document (see listExternalChapters()); falls back to the chapter's own
 * `<title>` tag when there's no usable nav document or `number` falls
 * outside every one of its entries' ranges (e.g. front matter before the
 * first real chapter); falls back further to plain `chapter ${number}`
 * wording when even that yields nothing — so callers can drop the result
 * straight into an "in ___" phrase no matter which tier answered.
 */
export function describeChapter(epubPath, number) {
  const externalChapters = listExternalChaptersCached(epubPath);
  const match = externalChapters.find(
    (chapter) => number >= chapter.firstChapterNumber && number <= chapter.lastChapterNumber,
  );
  if (match) {
    return match.label;
  }

  return describeChapterFromTitleTag(epubPath, number);
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

/**
 * Extracts an inclusive RANGE of spine chapters [firstNumber..lastNumber] to a single
 * file at `destPath`, concatenated in reading order with an HTML comment marking each
 * source spine file, plus every image any of them references. This is how a lesson that
 * spans several spine files (see epubLessons.js / listExternalChapters) is handed to the
 * single-file LLM extractor as one unit. A one-file range (first === last) is just
 * extractChapterToFile with a comment header. Images are resolved and placed per source
 * chapter exactly as extractChapterToFile does — so `<img src>`s that are relative to
 * each source file still resolve against the combined file's directory (the common case,
 * where a lesson's files share one directory); a cross-directory `src` collision is the
 * same tolerated edge as a single dangling image ref.
 */
export function extractChapterRangeToFile(epubPath, firstNumber, lastNumber, destPath) {
  if (lastNumber < firstNumber) {
    throw new Error(`Invalid chapter range ${firstNumber}-${lastNumber}: last is before first`);
  }
  const { entries, chapters } = loadEpub(epubPath);
  mkdirSync(dirname(destPath), { recursive: true });

  const parts = [];
  for (let number = firstNumber; number <= lastNumber; number++) {
    const chapter = chapters.find((c) => c.number === number);
    if (!chapter) {
      throw new Error(`Chapter ${number} not found — book has ${chapters.length} chapter(s)`);
    }
    const contentEntry = entries.find((e) => e.name === chapter.href);
    if (!contentEntry) {
      throw new Error(`Chapter ${number}'s content file "${chapter.href}" not found in archive`);
    }
    const content = contentEntry.data.toString("utf-8");
    parts.push(`<!-- anki-builder: spine chapter ${number} (${chapter.href}) -->\n${content}`);
    extractReferencedImages(entries, chapter, content, destPath);
  }

  writeFileSync(destPath, parts.join("\n\n"), "utf-8");
  return destPath;
}
