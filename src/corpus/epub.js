import { readFileSync } from "fs";
import { inflateRawSync } from "zlib";
import { validateCorpus } from "../model/index.js";

const DEFAULT_CATEGORY = "General";
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

function decodeEntities(text) {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function extractTextBlocks(html) {
  // The lookahead after the tag-name alternation enforces a real tag-name boundary —
  // without it, "li" matches as a prefix of "link", so a stray <link .../> in <head>
  // gets treated as an opening <li>, and the regex then swallows everything up to the
  // next unrelated </li> into one corrupted "block".
  const blockPattern = /<(p|li|dt|dd|td)(?=[\s/>])[^>]*>([\s\S]*?)<\/\1>/gi;
  const blocks = [];
  let match;
  while ((match = blockPattern.exec(html)) !== null) {
    const text = decodeEntities(match[2].replace(/<[^>]+>/g, " "))
      .replace(/\s+/g, " ")
      .trim();
    if (text) {
      blocks.push(text);
    }
  }
  return blocks;
}

function parseCandidate(text) {
  const match = text.match(/^(.+?)\s*(?:[—–:]|-{1,2})\s*(.+)$/);
  if (match) {
    return { english: match[1].trim(), translation: match[2].trim() };
  }
  return { english: text, translation: null };
}

function slugify(text, index) {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return slug ? `epub_${slug}_${index}` : `epub_item_${index}`;
}

export function extractEpub(epubPath, { targetLanguage } = {}) {
  if (!targetLanguage) {
    throw new Error("targetLanguage is required");
  }

  const buffer = readFileSync(epubPath);
  const entries = readZipEntries(buffer);
  const contentEntries = entries.filter((entry) => /\.(xhtml|html|htm)$/i.test(entry.name));

  const items = [];
  const seen = new Set();

  for (const entry of contentEntries) {
    const html = entry.data.toString("utf-8");
    const blocks = extractTextBlocks(html);

    for (const block of blocks) {
      const candidate = parseCandidate(block);
      if (!candidate.english) {
        continue;
      }

      const key = candidate.english.toLowerCase();
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);

      const item = {
        id: slugify(candidate.english, items.length + 1),
        english: candidate.english,
        category: DEFAULT_CATEGORY,
      };
      if (candidate.translation) {
        item.notes = candidate.translation;
      }
      items.push(item);
    }
  }

  const corpus = {
    meta: {
      targetLanguage,
      sourceType: "epub",
    },
    items,
  };

  validateCorpus(corpus);
  return corpus;
}
