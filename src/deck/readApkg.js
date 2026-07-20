import { readFileSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { DatabaseSync } from "node:sqlite";
import { readZip } from "./zip.js";

// Reads an Anki `.apkg` package back into a structured, display-ready deck: its sub-decks (in book
// order), and for each the cards' fields (English/Target/Pronunciation/Category/Note) plus the raw
// bytes of each card's embedded audio clip. The inverse of the deck build — it reads the legacy
// `collection.anki2` (or `collection.anki21`) SQLite collection and the `media` manifest that a
// `.apkg` carries. Modern zstd-compressed exports (`collection.anki21b`) are not supported; those
// throw a clear error (re-export as legacy, or view a deck built by anki-builder).

const FIELD_SEP = "\x1f";
const SOUND_RE = /\[sound:([^\]]+)\]/;

// The apkg stores media under numeric names ("0", "1", …); the `media` JSON maps each to its real
// filename. Invert that so a `[sound:foo.mp3]` reference resolves to the right zip entry's bytes.
function buildMediaIndex(entries) {
  const byName = new Map(entries.map((e) => [e.name, e.data]));
  const manifestRaw = byName.get("media");
  const byRealName = new Map();
  if (manifestRaw) {
    const manifest = JSON.parse(manifestRaw.toString("utf-8"));
    for (const [numeric, realName] of Object.entries(manifest)) {
      const data = byName.get(numeric);
      if (data) byRealName.set(realName, data);
    }
  }
  return byRealName;
}

function openCollection(entries) {
  const byName = new Map(entries.map((e) => [e.name, e.data]));
  // Prefer the newest legacy format present. The zstd format (`.anki21b`) is a different container.
  const dbBytes = byName.get("collection.anki21") || byName.get("collection.anki2");
  if (!dbBytes) {
    if (byName.has("collection.anki21b")) {
      throw new Error(
        "This .apkg uses Anki's modern zstd collection format (collection.anki21b), which is not " +
          "supported. Re-export it with 'Support older Anki versions' enabled, or view a deck built " +
          "by anki-builder.",
      );
    }
    throw new Error("Not a valid .apkg: no collection.anki2/collection.anki21 database found");
  }
  const dbPath = join(tmpdir(), `anki-builder-view-${process.pid}-${Date.now()}.anki2`);
  writeFileSync(dbPath, dbBytes);
  return { db: new DatabaseSync(dbPath), dbPath };
}

export function readApkg(apkgPath, { readFile = readFileSync } = {}) {
  const entries = readZip(readFile(apkgPath));
  const mediaByRealName = buildMediaIndex(entries);
  const { db, dbPath } = openCollection(entries);

  try {
    const col = db.prepare("SELECT models, decks FROM col LIMIT 1").get();
    if (!col) throw new Error("Not a valid .apkg: empty collection");
    const models = JSON.parse(col.models);
    const decks = JSON.parse(col.decks);

    // model id -> field names in ordinal order
    const modelFields = {};
    for (const [mid, model] of Object.entries(models)) {
      modelFields[mid] = [...model.flds].sort((a, b) => a.ord - b.ord).map((f) => f.name);
    }

    // note id -> the deck it belongs to (via any of its cards; both templates share the deck here)
    const noteDeck = new Map();
    for (const card of db.prepare("SELECT nid, did FROM cards").all()) {
      if (!noteDeck.has(card.nid)) noteDeck.set(card.nid, card.did);
    }

    // Preserve note order (ids are chapter-block-ordered in an anki-builder book => book order).
    const notes = db.prepare("SELECT id, mid, flds FROM notes ORDER BY id").all();

    // Group cards under their deck, first-seen order. Skip decks that hold no cards (the Default
    // deck, and a book's parent deck, which only aggregates its sub-decks).
    const sectionsByName = new Map();
    for (const note of notes) {
      const fieldNames = modelFields[note.mid];
      if (!fieldNames) continue;
      const values = String(note.flds).split(FIELD_SEP);
      const f = {};
      fieldNames.forEach((name, i) => (f[name] = values[i] ?? ""));

      const did = noteDeck.get(note.id);
      const deckName = (decks[did] && decks[did].name) || "Deck";

      const soundMatch = (f.Audio || "").match(SOUND_RE);
      const audioName = soundMatch ? soundMatch[1] : null;
      const audioData = audioName ? mediaByRealName.get(audioName) || null : null;

      if (!sectionsByName.has(deckName)) sectionsByName.set(deckName, []);
      sectionsByName.get(deckName).push({
        english: f.English || "",
        target: f.Target || "",
        pronunciation: f.Pronunciation || "",
        category: f.Category || "",
        note: f.Hint || "",
        audioName,
        audioData,
      });
    }

    const sections = [...sectionsByName.entries()].map(([name, cards]) => {
      const parts = name.split("::");
      return { name, leaf: parts[parts.length - 1], parent: parts.slice(0, -1).join("::"), cards };
    });

    // The book/course title is the common parent of the sub-decks (or the lone deck's own name).
    const parents = new Set(sections.map((s) => s.parent).filter(Boolean));
    const title = parents.size === 1 ? [...parents][0] : sections[0]?.name || "Deck";

    const totalCards = sections.reduce((n, s) => n + s.cards.length, 0);
    return { title, sections, totalCards };
  } finally {
    db.close();
    rmSync(dbPath, { force: true });
  }
}
