// Deterministic delivery of the on-disk corpus state into a running Anki collection via AnkiConnect.
//
//   preflight → backup (fail-closed) → structure sync (idempotent) → content sync → report
//
// The note type is force-set to the code's canonical `noteTypeSpec` (fields/templates/CSS), and every
// note's fields are pushed by an explicit `updateNoteFields` (never `.apkg` import) so scheduling rows
// are never touched. Notes are matched to corpus cards by a durable `abid:<card.id>` tag; on the first
// run un-tagged notes are matched once by a (Target, English) fingerprint and then stamped. Nothing is
// ever deleted. A `dry` run performs only READS and returns the exact plan.
//
// All effects go through an injected AnkiConnect client (see ./ankiConnect.js) and the injected `now`,
// so the whole thing is unit-testable with a fake client and no running Anki.

import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join, resolve, dirname } from "path";
import { noteTypeSpec, fieldValue, FIELD_NAMES } from "../deck/collection.js";
import { unitDeckSegments } from "../deck/deckPath.js";
import { selectDoneChapterDecks, resolveBookName } from "../deck/rebuild.js";
import { shippableCards } from "../deck/shippableCards.js";
import { getAdapter, listAllDecks, ADAPTERS } from "../server/adapters/index.js";
import { loadBookMeta } from "../corpus/epubLibrary.js";
import { loadCourseMeta } from "../cli/outputPaths.js";

const ABID = "abid:";
const sanitizeSeg = (s) => String(s).replace(/::/g, "-");
const safeFile = (s) =>
  String(s)
    .replace(/[^\w.-]+/g, "_")
    .slice(0, 120);

// Decode the handful of HTML entities Anki may store fields with, so our plain field values compare
// equal to what `notesInfo` returns (keeps re-runs a no-op).
const htmlDecode = (s) =>
  String(s ?? "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");

const sameField = (ankiValue, computed) => htmlDecode(ankiValue) === htmlDecode(computed);
const norm = (s) =>
  htmlDecode(s)
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
const fingerprint = (target, english) => `${norm(target)}\x1f${norm(english)}`;
const noteField = (n, name) => n.fields?.[name]?.value ?? "";

// Resolve selectors → managed decks with their Anki names, spec, and deliverable units (disk-only).
// Exported for tests: this is where a unit's Anki deck NAME is decided, and getting that wrong
// delivers cards into the wrong deck without any error to notice.
export function resolveDecks(outputRoot, selectors, adapters) {
  const wanted =
    !selectors || selectors === "all" || selectors.length === 0
      ? listAllDecks(outputRoot, adapters).map((d) => ({ type: d.type, id: d.id }))
      : selectors;

  const decks = [];
  for (const { type, id } of wanted) {
    const adapter = getAdapter(type);
    if (!adapter) continue;
    const info = adapter.loadDeck(outputRoot, id);
    if (!info) continue;
    const bookDir = dirname(adapter.deckFile(outputRoot, id));

    let selected;
    try {
      selected = selectDoneChapterDecks(bookDir);
    } catch {
      // Not a multi-unit book/course layout (e.g. a single-run template) — unsupported here.
      decks.push({ type, id, title: info.title, skipped: "not a book/course deck" });
      continue;
    }
    const { chapterDecks, epubHash } = selected;
    if (chapterDecks.length === 0) {
      decks.push({ type, id, title: info.title, skipped: "no finished (done) lessons" });
      continue;
    }

    const targetLanguage = info.targetLanguage || adapter.deckLanguage(outputRoot, id);
    const spec = noteTypeSpec(targetLanguage);
    const ankiParent = sanitizeSeg(
      resolveBookName(bookDir, epubHash, { loadBookMeta, loadCourseMeta }),
    );
    const units = chapterDecks.map((cd) => ({
      // Built from the SAME function the .apkg uses, so the package and AnkiConnect can never name
      // the same unit differently — they once did, and cards landed in a deck of the wrong name.
      ankiDeck: [ankiParent, ...unitDeckSegments(cd.name).map(sanitizeSeg)].join("::"),
      audioDir: cd.audioDir,
      cards: shippableCards(cd.cards),
    }));
    decks.push({ type, id, title: info.title, targetLanguage, spec, ankiParent, units });
  }
  return decks;
}

// Idempotent structure sync for one model. Reads current state; writes only the delta (unless dry).
export async function syncStructure(client, spec, dry) {
  const out = {
    model: spec.modelName,
    createModel: false,
    addedFields: [],
    templates: false,
    css: false,
  };
  const models = await client.modelNames();
  if (!models.includes(spec.modelName)) {
    out.createModel = true;
    if (!dry) {
      await client.createModel({
        modelName: spec.modelName,
        inOrderFields: spec.fields,
        css: spec.css,
        isCloze: false,
        cardTemplates: spec.templates.map((t) => ({ Name: t.name, Front: t.qfmt, Back: t.afmt })),
      });
    }
    return out; // a freshly created model already matches the spec exactly
  }

  // Fields: add any missing at their target index, then normalize order.
  let liveFields = await client.modelFieldNames(spec.modelName);
  for (let i = 0; i < spec.fields.length; i++) {
    if (!liveFields.includes(spec.fields[i])) {
      out.addedFields.push(spec.fields[i]);
      if (!dry) await client.modelFieldAdd(spec.modelName, spec.fields[i], i);
    }
  }
  if (!dry && out.addedFields.length) liveFields = await client.modelFieldNames(spec.modelName);
  if (!dry) {
    for (let i = 0; i < spec.fields.length; i++) {
      if (liveFields[i] !== spec.fields[i]) {
        await client.modelFieldReposition(spec.modelName, spec.fields[i], i);
        liveFields = await client.modelFieldNames(spec.modelName);
      }
    }
  }

  // Templates.
  const liveT = await client.modelTemplates(spec.modelName);
  const tmplChanged = spec.templates.some((t) => {
    const live = liveT?.[t.name];
    return !live || live.Front !== t.qfmt || live.Back !== t.afmt;
  });
  if (tmplChanged) {
    out.templates = true;
    if (!dry) {
      await client.updateModelTemplates(
        spec.modelName,
        Object.fromEntries(spec.templates.map((t) => [t.name, { Front: t.qfmt, Back: t.afmt }])),
      );
    }
  }

  // Styling.
  const liveCss = (await client.modelStyling(spec.modelName))?.css ?? "";
  if (liveCss !== spec.css) {
    out.css = true;
    if (!dry) await client.updateModelStyling(spec.modelName, spec.css);
  }
  return out;
}

/**
 * Creates any sub-deck a lesson needs that Anki doesn't have yet.
 *
 * `addNote` does not create its target deck — it fails outright with "deck was not found". Every
 * lesson delivered before this existed happened to land in a deck an earlier `.apkg` import had
 * already created, so the gap only shows up the first time a genuinely NEW lesson is delivered
 * through this path rather than by importing the package by hand.
 *
 * Returns the names it created (or, on a dry run, would create) so the preview reports them.
 */
export async function ensureDecks(client, decks, dry) {
  const existing = new Set(await client.deckNames());
  const wanted = [...new Set(decks.flatMap((deck) => deck.units.map((unit) => unit.ankiDeck)))];
  const missing = wanted.filter((name) => name && !existing.has(name));

  if (!dry) {
    for (const name of missing) {
      await client.createDeck(name);
    }
  }
  return missing;
}

/**
 * Every card id in a deck, or a throw naming the ones that repeat.
 *
 * `abid:<card.id>` is the durable note key, and it is scoped to the DECK, not the unit — so two units
 * that happen to name a card the same thing both resolve to one Anki note, and whichever is visited
 * last silently overwrites the other. The learner then studies one of the two cards and never sees the
 * other, with nothing anywhere reporting a problem. The JBP Book 1 deck carried ten such pairs
 * (`ni-particle` in two lessons, `yasumi` meaning "break" in one and "vacation" in another) for as long
 * as delivery had existed.
 *
 * This refuses instead, because there is no safe interpretation: whether the pair is one card taught
 * twice (drop a copy) or two cards that collided (re-id the later one) is a judgment about the source
 * material that only a human can make.
 */
export function assertUniqueCardIds(deck) {
  const seen = new Map();
  for (const unit of deck.units) {
    for (const card of unit.cards) {
      if (!seen.has(card.id)) seen.set(card.id, []);
      seen.get(card.id).push(unit.ankiDeck ?? "?");
    }
  }
  const clashes = [...seen.entries()].filter(([, where]) => where.length > 1);
  if (!clashes.length) return;
  const detail = clashes.map(([id, where]) => `${id} (${where.join(", ")})`).join("; ");
  throw new Error(
    `${deck.type}:${deck.id} has duplicate card ids, which would map two cards onto one Anki note: ` +
      `${detail}. Delete the redundant card, or give the later one its own id, then re-run.`,
  );
}

// Content sync for one deck. Returns per-deck counters + lists.
export async function syncDeckContent(client, deck, dry) {
  assertUniqueCardIds(deck);
  const r = {
    deck: `${deck.type}:${deck.id}`,
    updated: 0,
    added: 0,
    skipped: 0,
    tagged: 0,
    addedWithoutAudio: 0,
    addedCards: [],
    ambiguous: [],
    orphaned: [],
  };
  const query = `deck:"${deck.ankiParent}" note:"${deck.spec.modelName}"`;
  const noteIds = await client.findNotes(query);
  const infos = noteIds.length ? await client.notesInfo(noteIds) : [];

  // Two indexes for the first-run bootstrap: by Target (the Japanese — the field that almost never
  // changes, so it survives English-gloss edits), and by Target+English (to break Target collisions,
  // e.g. two cards sharing a sentence). Abid-tagged notes are the durable key on every later run.
  const noteById = new Map();
  const byAbid = new Map();
  const byTarget = new Map();
  const byTargetEnglish = new Map();
  const push = (map, key, id) => (map.has(key) ? map.get(key).push(id) : map.set(key, [id]));
  for (const n of infos) {
    noteById.set(n.noteId, n);
    const abid = (n.tags || []).find((t) => t.startsWith(ABID));
    if (abid) byAbid.set(abid.slice(ABID.length), n.noteId);
    push(byTarget, norm(noteField(n, "Target")), n.noteId);
    push(byTargetEnglish, fingerprint(noteField(n, "Target"), noteField(n, "English")), n.noteId);
  }

  const used = new Set();
  const corpusIds = new Set();
  for (const unit of deck.units) {
    for (const card of unit.cards) {
      corpusIds.add(card.id);
      const fields = Object.fromEntries(FIELD_NAMES.map((f) => [f, fieldValue(card, f)]));

      let noteId = byAbid.get(card.id);
      let stamp = false;
      if (noteId == null) {
        const free = (id) => !used.has(id) && !byAbidHas(byAbid, id);
        const tgtMatches = (byTarget.get(norm(card.target)) || []).filter(free);
        if (tgtMatches.length === 1) {
          noteId = tgtMatches[0];
          stamp = true;
        } else if (tgtMatches.length > 1) {
          // A shared Target (e.g. これはフランスのワインです glossed twice) → disambiguate by English.
          const ce = norm(fieldValue(card, "English"));
          let pick = tgtMatches.filter((id) => norm(noteField(noteById.get(id), "English")) === ce);
          // Fall back to a prefix match: a gloss edited since import (e.g. a parenthetical moved to the
          // hint, so the Anki gloss is the corpus gloss + extra) still resolves if it's the only one.
          if (pick.length !== 1) {
            pick = tgtMatches.filter((id) => {
              const ne = norm(noteField(noteById.get(id), "English"));
              return ne.startsWith(ce) || ce.startsWith(ne);
            });
          }
          if (pick.length === 1) {
            noteId = pick[0];
            stamp = true;
          } else {
            // Can't pick exactly one same-Target note → AMBIGUOUS. Report it; never add a duplicate.
            r.ambiguous.push({ card: card.id, english: card.english });
            continue;
          }
        }
        // tgtMatches.length === 0 → Target absent → genuinely new → fall through to add.
      }

      if (noteId != null) {
        used.add(noteId);
        const n = noteById.get(noteId);
        const differs = FIELD_NAMES.some((f) => !sameField(noteField(n, f), fields[f]));
        if (differs) {
          await maybeStoreMedia(client, card, unit, dry);
          if (!dry) await client.updateNoteFields(noteId, fields);
          r.updated++;
        } else {
          r.skipped++;
        }
        if (stamp) {
          if (!dry) await client.addTags([noteId], `${ABID}${card.id}`);
          r.tagged++;
        }
      } else {
        const hadAudio = await maybeStoreMedia(client, card, unit, dry);
        if (!hadAudio) r.addedWithoutAudio++;
        if (!dry) {
          await client.addNote({
            deckName: unit.ankiDeck,
            modelName: deck.spec.modelName,
            fields,
            tags: [`${ABID}${card.id}`],
            options: { allowDuplicate: true },
          });
        }
        r.added++;
        r.addedCards.push({ card: card.id, english: card.english, deck: unit.ankiDeck });
      }
    }
  }

  for (const [cid, nid] of byAbid) {
    if (!corpusIds.has(cid)) r.orphaned.push({ card: cid, noteId: nid });
  }
  return r;
}

const byAbidHas = (byAbid, noteId) => {
  for (const v of byAbid.values()) if (v === noteId) return true;
  return false;
};

// Store a card's audio file into Anki's media (idempotent). Returns true if the card had an audio file.
async function maybeStoreMedia(client, card, unit, dry) {
  if (!card.audio || !unit.audioDir) return false;
  const path = resolve(join(unit.audioDir, card.audio));
  if (!existsSync(path)) return false;
  if (!dry) await client.storeMediaFile({ filename: card.audio, path });
  return true;
}

/**
 * Deliver the on-disk corpus state to Anki. `selectors` is `"all"` (or omitted) for every managed deck,
 * or a list of `{ type, id }`. Returns a structured report. With `dry: true`, performs only reads and
 * reports the exact plan (no backup, no writes).
 */
export async function deliverToAnki(
  outputRoot,
  selectors = "all",
  {
    client,
    dry = false,
    sync = true,
    now = () => Date.now(),
    adapters = ADAPTERS,
    backupRoot = resolve("anki-backups"),
    log = () => {},
  } = {},
) {
  if (!client) throw new Error("deliverToAnki requires an AnkiConnect client");

  // 1. PREFLIGHT
  const apiVersion = await client.version();
  if (typeof apiVersion !== "number" || apiVersion < 6) {
    throw new Error(`unexpected AnkiConnect API version ${apiVersion} (need >= 6)`);
  }
  const decks = resolveDecks(outputRoot, selectors, adapters);
  const deliverable = decks.filter((d) => !d.skipped);
  const report = {
    dry,
    apiVersion,
    backupDir: null,
    decks: decks.map((d) => ({
      type: d.type,
      id: d.id,
      title: d.title,
      skipped: d.skipped || null,
    })),
    syncedBefore: null,
    syncedAfter: null,
    syncError: null,
    schemaChanged: false,
    structure: [],
    content: [],
    createdDecks: [],
    backedUp: [],
  };
  if (deliverable.length === 0) {
    log("no deliverable decks (none marked done / all skipped)");
    return report;
  }

  const specsByModel = new Map();
  for (const d of deliverable) specsByModel.set(d.spec.modelName, d.spec);
  const ankiParents = [...new Set(deliverable.map((d) => d.ankiParent))];

  // 2. SYNC BEFORE (pull remote → local). A safety net: even if a review happened on another device,
  // it merges in before we push, so the later clobbering upload can't silently drop it. Non-fatal —
  // a sync failure (offline, no AnkiWeb creds) doesn't block the local delivery. Skipped on a dry run.
  if (sync && !dry) {
    try {
      await client.sync();
      report.syncedBefore = true;
      log("synced with AnkiWeb (pulled) before delivery");
    } catch (e) {
      report.syncedBefore = false;
      report.syncError = e.message;
      log(`sync-before failed (continuing): ${e.message}`);
    }
  }

  // 3. BACKUP (before any write; fail-closed). Skipped on a dry run (a dry run writes nothing).
  if (!dry) {
    const stamp = new Date(now()).toISOString().replace(/[:.]/g, "-");
    const backupDir = join(backupRoot, stamp);
    report.backupDir = backupDir;
    mkdirSync(backupDir, { recursive: true });
    for (const parent of ankiParents) {
      const path = resolve(join(backupDir, `${safeFile(parent)}.apkg`));
      try {
        await client.exportPackage(parent, path, true);
        report.backedUp.push({ deck: parent, path });
      } catch (e) {
        throw new Error(
          `backup failed for "${parent}" (${e.message}) — aborting before any changes were made`,
        );
      }
      log(`backed up ${parent}`);
    }
    // Structure snapshot — what an .apkg re-import can't restore.
    const snap = {};
    for (const [name] of specsByModel) {
      snap[name] = {
        fields: await client.modelFieldNames(name).catch(() => null),
        templates: await client.modelTemplates(name).catch(() => null),
        css: (await client.modelStyling(name).catch(() => null))?.css ?? null,
      };
    }
    writeFileSync(join(backupDir, "models.json"), JSON.stringify(snap, null, 2) + "\n");
  }

  // 4. STRUCTURE SYNC (per unique model)
  for (const [, spec] of specsByModel) {
    report.structure.push(await syncStructure(client, spec, dry));
    log(`structure synced: ${spec.modelName}`);
  }
  // A structural change (new field / template / CSS) bumps Anki's schema, which forces a one-way full
  // sync that Anki gates behind its GUI Upload/Download dialog — so the sync-after below can't complete
  // it unattended and the user must click Upload once. Surface it so the CLI/UI can warn.
  report.schemaChanged = report.structure.some(
    (s) => s.createModel || s.addedFields.length || s.templates || s.css,
  );

  // 5. DECKS — a lesson's sub-deck must exist before a note can be added to it.
  report.createdDecks = await ensureDecks(client, deliverable, dry);
  for (const name of report.createdDecks) {
    log(`${dry ? "would create" : "created"} deck: ${name}`);
  }

  // 6. CONTENT SYNC (per deck)
  for (const deck of deliverable) {
    report.content.push(await syncDeckContent(client, deck, dry));
    log(`content synced: ${deck.type}:${deck.id}`);
  }

  // 7. SYNC AFTER (push local → remote). Content-only deliveries sync incrementally with no prompt; a
  // schema-changing one still needs the manual Upload click (see schemaChanged). Non-fatal.
  if (sync && !dry) {
    try {
      await client.sync();
      report.syncedAfter = true;
      log("synced with AnkiWeb (pushed) after delivery");
    } catch (e) {
      report.syncedAfter = false;
      report.syncError = report.syncError || e.message;
      log(`sync-after failed: ${e.message}`);
    }
  }

  return report;
}
