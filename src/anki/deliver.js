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

import { existsSync, mkdirSync, writeFileSync, readdirSync, rmSync } from "fs";
import { join, resolve, dirname } from "path";
import { noteTypeSpec, fieldValue, FIELD_NAMES } from "../deck/collection.js";
import { unitDeckSegments } from "../deck/deckPath.js";
import { unifiedDiff } from "../util/unifiedDiff.js";
import { selectDoneChapterDecks, resolveBookName } from "../deck/rebuild.js";
import {
  shippableCards,
  assertUniqueCardIds as assertUniqueCardIdsAcross,
} from "../deck/shippableCards.js";
import { getAdapter, listAllDecks, ADAPTERS } from "../server/adapters/index.js";
import { loadBookMeta } from "../corpus/epubLibrary.js";
import { loadCourseMeta } from "../cli/outputPaths.js";
import {
  applyDirectionSuspension,
  assertStudiableDirection,
  describeSuspension,
} from "./directionSuspension.js";

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

// Escape a value interpolated into an Anki search's quoted term. `"` would end the term early,
// `*`/`_` are wildcards even inside quotes, and `\` is the escape character itself — a book title
// carrying any of them either broke findNotes or over-matched, and that query feeds the
// first-run fingerprint bootstrap.
const escapeSearchTerm = (s) => String(s).replace(/([\\"*_])/g, "\\$1");

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
      label: cd.name,
      audioDir: cd.audioDir,
      cards: shippableCards(cd.cards),
    }));
    decks.push({ type, id, title: info.title, targetLanguage, spec, ankiParent, units, bookDir });
  }
  return decks;
}

/**
 * Prune old backup snapshots under `backupRoot`, keeping the newest `keepRecent` plus the newest
 * snapshot of each older ISO-ish week. Every deliver adds a full-scheduling `.apkg` per deck (the
 * backup dir had grown to ~780 MB across 41 runs with nothing ever removed); recent history is
 * what a panic restore reaches for, older history only needs coarse granularity.
 */
export function pruneBackups(
  backupRoot,
  { keepRecent = Number(process.env.ANKI_BUILDER_BACKUP_KEEP) || 10, log = () => {} } = {},
) {
  let entries;
  try {
    entries = readdirSync(backupRoot, { withFileTypes: true });
  } catch {
    return { deleted: [] };
  }
  const stamps = entries
    .filter((e) => e.isDirectory() && /^\d{4}-\d{2}-\d{2}T/.test(e.name))
    .map((e) => e.name)
    .sort()
    .reverse(); // newest first — the stamp format sorts chronologically

  const weekKey = (stamp) => {
    const date = new Date(`${stamp.slice(0, 10)}T00:00:00Z`);
    const jan1 = Date.UTC(date.getUTCFullYear(), 0, 1);
    return `${date.getUTCFullYear()}-w${Math.floor((date.getTime() - jan1) / (7 * 86_400_000))}`;
  };

  const keep = new Set(stamps.slice(0, keepRecent));
  const seenWeeks = new Set([...keep].map(weekKey));
  for (const stamp of stamps.slice(keepRecent)) {
    const week = weekKey(stamp);
    if (!seenWeeks.has(week)) {
      seenWeeks.add(week);
      keep.add(stamp); // newest snapshot of an older week survives
    }
  }

  const deleted = [];
  for (const stamp of stamps) {
    if (keep.has(stamp)) continue;
    try {
      rmSync(join(backupRoot, stamp), { recursive: true, force: true });
      deleted.push(stamp);
    } catch {
      // A snapshot that won't delete is disk litter, not a deliver failure.
    }
  }
  if (deleted.length > 0) {
    log(
      `pruned ${deleted.length} old backup snapshot(s) — keeping the last ${keepRecent} plus one per older week`,
    );
  }
  return { deleted };
}

// Marker written beside a deck's merged .apkg after a real (non-dry) deliver. Once a collection is
// AnkiConnect-managed, drag-and-drop importing the .apkg again CREATES DUPLICATES: notes added via
// addNote carry random guids, so the package's copies of those cards don't match and import as new.
// The dashboard reads this to warn next to the deck.
export const DELIVERED_MARKER = "anki-delivered.json";

function writeDeliveredMarker(deck) {
  if (!deck.bookDir) return;
  try {
    writeFileSync(
      join(deck.bookDir, DELIVERED_MARKER),
      JSON.stringify(
        {
          note: "This deck is delivered to Anki via AnkiConnect (scripts/deliver-to-anki.mjs). Do NOT re-import the .apkg into that collection — deliver updates instead; a re-import creates duplicate notes.",
          ankiParent: deck.ankiParent,
          lastDeliveredAt: new Date().toISOString(),
        },
        null,
        2,
      ) + "\n",
    );
  } catch {
    // The marker is advisory; a failed write must not fail the deliver.
  }
}

/**
 * Every deck whose cards use a note type, and how many cards that is.
 *
 * NOT a cross-collection comparison of the kind CLAUDE.md's "Collections are isolated" rule forbids:
 * it reads no card content and compares no two collections. It reads the LIVE Anki collection to
 * find out how far one write reaches. It is, in fact, what enforces isolation on this path, because
 * without it delivering one deck silently rewrites another deck's card faces.
 *
 * The blast radius of a template or CSS edit, measured before it happens. The note type is keyed on
 * LANGUAGE alone (`AnkiBuilder ja`, see resolveModelSpec in src/deck/collection.js), so it is shared
 * by every deck of that language: delivering the course rewrites the book's card faces too. That
 * sharing is correct and stays, but it must be visible at the moment of the write rather than
 * discovered afterwards.
 */
export async function modelUsage(client, modelName) {
  const cardIds = (await client.findCards(`"note:${modelName}"`)) ?? [];
  if (!cardIds.length) return { cards: 0, decks: [] };
  const byDeck = (await client.getDecks(cardIds)) ?? {};
  return { cards: cardIds.length, decks: Object.keys(byDeck).sort() };
}

/**
 * Renders what a template/CSS change is about to overwrite, as a unified diff plus the decks it
 * reaches. Reads only.
 */
export async function describeModelChange(client, spec, { liveTemplates, liveCss }) {
  const sections = [];
  for (const template of spec.templates) {
    const live = liveTemplates?.[template.name];
    for (const [side, liveText, specText] of [
      ["Front", live?.Front, template.qfmt],
      ["Back", live?.Back, template.afmt],
    ]) {
      const diff = unifiedDiff(liveText ?? "", specText ?? "", {
        label: `${spec.modelName} / ${template.name} / ${side}`,
      });
      if (diff) sections.push(diff);
    }
  }
  const cssDiff = unifiedDiff(liveCss ?? "", spec.css ?? "", { label: `${spec.modelName} / CSS` });
  if (cssDiff) sections.push(cssDiff);

  const usage = await modelUsage(client, spec.modelName);
  return { diff: sections.join("\n\n"), usage };
}

/**
 * Idempotent structure sync for one model. Reads current state; writes only the delta (unless dry).
 *
 * ⚠️ THE MODEL-CHANGE GUARD. A template or CSS write here is not a per-deck change. The note type is
 * named for the LANGUAGE, so `AnkiBuilder ja` is the note type of every Japanese deck in the
 * collection — delivering the three-lesson course rewrites the card faces of the 2,000-card book at
 * the same time. It also flips Anki's schema, which forces a one-way full AnkiWeb sync the owner has
 * to complete by hand through a GUI dialog AnkiConnect cannot answer.
 *
 * So a template/CSS change is refused unless it is asked for. `--dry` prints the unified diff of
 * what is live against what this build would write, plus every deck using the model and how many
 * cards that is; a real deliver needs `--allow-model-change`. Adding a FIELD, and creating the model
 * from scratch, are not gated: neither can silently change what an existing card looks like.
 *
 * WS6's `modelTemplateAdd` path must route through this same guard when it lands. A template ADD is
 * also a schema-modifying write on the shared model and forces the same manual sync; its own local
 * warning is not the same thing as a refusal.
 */
export async function syncStructure(client, spec, dry, { allowModelChange = false, log } = {}) {
  const say = log ?? (() => {});
  const out = {
    model: spec.modelName,
    createModel: false,
    addedFields: [],
    templates: false,
    css: false,
    modelChange: null,
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

  // Templates and styling — read BOTH before writing EITHER, so the guard below sees the whole
  // change at once rather than refusing halfway through it.
  const liveT = await client.modelTemplates(spec.modelName);
  const tmplChanged = spec.templates.some((t) => {
    const live = liveT?.[t.name];
    return !live || live.Front !== t.qfmt || live.Back !== t.afmt;
  });
  const liveCss = (await client.modelStyling(spec.modelName))?.css ?? "";
  const cssChanged = liveCss !== spec.css;

  if (tmplChanged || cssChanged) {
    out.templates = tmplChanged;
    out.css = cssChanged;
    out.modelChange = await describeModelChange(client, spec, { liveTemplates: liveT, liveCss });
    const { diff, usage } = out.modelChange;
    say(
      `model change on "${spec.modelName}" (${tmplChanged ? "templates" : ""}${
        tmplChanged && cssChanged ? " + " : ""
      }${cssChanged ? "CSS" : ""}) reaches ${usage.cards} card(s) in ${usage.decks.length} deck(s):\n` +
        usage.decks.map((d) => `  ${d}`).join("\n") +
        (diff ? `\n${diff}` : ""),
    );
    if (!dry && !allowModelChange) {
      throw new Error(
        `refusing to rewrite the note type "${spec.modelName}": this delivery changes ` +
          `${[tmplChanged && "card templates", cssChanged && "CSS"].filter(Boolean).join(" and ")}, ` +
          `which applies to all ${usage.cards} card(s) across ${usage.decks.length} deck(s) using ` +
          `that note type, and forces a one-way full AnkiWeb sync you have to complete by hand. ` +
          `Preview it with --dry, then re-run with --allow-model-change if that is what you mean.`,
      );
    }
  }

  if (!dry) {
    if (tmplChanged) {
      await client.updateModelTemplates(
        spec.modelName,
        Object.fromEntries(spec.templates.map((t) => [t.name, { Front: t.qfmt, Back: t.afmt }])),
      );
    }
    if (cssChanged) await client.updateModelStyling(spec.modelName, spec.css);
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
 * Deletes EMPTY leftover decks whose name is the UNGROUPED (pre-grouping-scheme) form of a
 * managed unit — `Book::Lesson 5: Title` where the real deck is `Book::Lesson 5::Title` — plus
 * the `::Extras` child the oldest scheme nested under it.
 *
 * These shells date from the earlier deck-naming eras and, once deleted locally, keep coming
 * back whenever an AnkiWeb sync resolves in the server's favor (a "Download" choice, or a
 * deletion that never got uploaded before the next pull). Sweeping them on every deliver makes
 * the cleanup converge no matter which way a sync went.
 *
 * Strictly conservative: only names derived from a managed unit's own label, only when the deck
 * exists, is not itself a managed deck, and holds ZERO cards (children included). A shell that
 * somehow contains cards is reported and left alone.
 */
export async function removeLegacyDeckShells(client, decks, { log = () => {} } = {}) {
  const existing = new Set(await client.deckNames());
  const managed = new Set(decks.flatMap((deck) => deck.units.map((unit) => unit.ankiDeck)));
  const removed = [];

  for (const deck of decks) {
    for (const unit of deck.units) {
      const flat = `${deck.ankiParent}::${sanitizeSeg(unit.label)}`;
      // An ungrouped label (e.g. "Frequently Used Expressions") IS its real deck — nothing legacy.
      if (flat === unit.ankiDeck) continue;
      // Child first, then the parent, so the parent's count reflects what's actually left.
      for (const legacy of [`${flat}::Extras`, flat]) {
        if (!existing.has(legacy) || managed.has(legacy)) continue;
        const cards = await client.findCards(`deck:"${escapeSearchTerm(legacy)}"`);
        if (cards.length > 0) {
          log(`legacy deck "${legacy}" still holds ${cards.length} card(s) — left alone`);
          continue;
        }
        await client.invoke("deleteDecks", { decks: [legacy], cardsToo: true });
        existing.delete(legacy);
        removed.push(legacy);
        log(`removed empty legacy deck: ${legacy}`);
      }
    }
  }
  return removed;
}

/**
 * Every card id in a deck, or a throw naming the ones that repeat. `abid:<card.id>` is the
 * durable note key, scoped to the DECK, not the unit — the shared check (and the story of why
 * it exists) lives in `src/deck/shippableCards.js`, next to the `.apkg` path's identical guard.
 */
export function assertUniqueCardIds(deck) {
  assertUniqueCardIdsAcross(
    deck.units.map((unit) => ({ label: unit.ankiDeck, items: unit.cards })),
    `${deck.type}:${deck.id}`,
  );
}

// Content sync for one deck. Returns per-deck counters + lists.
export async function syncDeckContent(
  client,
  deck,
  dry,
  { suspendDelivered = false, reSuspendHumanUnsuspended = false, log = () => {} } = {},
) {
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
    directions: null,
  };
  const templateCount = deck.spec.templates.length;
  // Refuse a card that suspends every direction BEFORE anything is written. That is a note with no
  // studiable card at all, which is what `excluded` is for.
  for (const unit of deck.units) {
    for (const card of unit.cards) assertStudiableDirection(card, templateCount);
  }
  // Every note this run touched, so the direction pass can tell a note IT created (unconditional —
  // nothing has been studied yet) from one that was already in the collection (opt-in, probe-gated).
  const touched = [];
  const query = `deck:"${escapeSearchTerm(deck.ankiParent)}" note:"${escapeSearchTerm(deck.spec.modelName)}"`;
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
        touched.push({ card, noteId, isNew: false });
      } else {
        const hadAudio = await maybeStoreMedia(client, card, unit, dry);
        if (!hadAudio) r.addedWithoutAudio++;
        let addedNoteId = null;
        if (!dry) {
          // The returned note id is what makes an unconditional direction suspension possible: it
          // identifies a note THIS run created, whose cards have never been studied.
          addedNoteId = await client.addNote({
            deckName: unit.ankiDeck,
            modelName: deck.spec.modelName,
            fields,
            tags: [`${ABID}${card.id}`],
            options: { allowDuplicate: true },
          });
        }
        r.added++;
        r.addedCards.push({ card: card.id, english: card.english, deck: unit.ankiDeck });
        touched.push({ card, noteId: addedNoteId, isNew: true });
      }
    }
  }

  // Direction suspension, last: every note exists and every field is current, so a suspension can
  // never be applied to a note that then fails to be written.
  r.directions = await applyDirectionSuspension(client, touched, {
    templateCount,
    dry,
    suspendDelivered,
    reSuspendHumanUnsuspended,
    log,
  });

  for (const [cid, nid] of byAbid) {
    if (!corpusIds.has(cid)) r.orphaned.push({ card: cid, noteId: nid });
  }
  return r;
}

/**
 * Reports what the direction pass did, one class at a time.
 *
 * Each class is a different fact and they must not be added together: a suspension applied, a
 * suspension a `--dry` run would apply, a card a HUMAN turned back on, and a flag in cards.json the
 * collection is deliberately not honouring. A single "3 directions handled" would hide the last two,
 * which are the only ones that need a decision.
 */
function logDirections(result, deck, dry, log) {
  const d = result.directions;
  if (!d) return;
  const names = deck.spec.templates.map((t) => t.name);
  if (d.suspended.length) {
    log(
      `suspended ${d.suspended.length} direction(s) on notes created by this deliver:\n` +
        d.suspended.map((e) => describeSuspension(e, names)).join("\n"),
    );
  }
  if (d.wouldSuspend.length) {
    log(
      `would suspend ${d.wouldSuspend.length} direction(s):\n` +
        d.wouldSuspend.map((e) => describeSuspension(e, names)).join("\n"),
    );
  }
  if (d.humanUnsuspended.length) {
    log(
      `${d.humanUnsuspended.length} direction(s) were unsuspended by hand after we suspended them ` +
        `and were left alone:\n` +
        d.humanUnsuspended
          .map((e) => `  ${e.card}  card ${e.cardId}  ord ${e.ord} (${names[e.ord] ?? e.ord})`)
          .join("\n"),
    );
  }
  if (d.skippedDelivered.length) {
    log(
      `${d.skippedDelivered.length} dirSuspended flag(s) are NOT applied: the note was already in ` +
        `the collection, so suspending it would change a card you may be studying. That path is ` +
        `opt-in (--suspend-delivered) and is currently gated on unrun behaviour probes.`,
    );
  }
  if (d.refused.length) {
    log(
      `${d.refused.length} direction(s) could not be applied:\n` +
        d.refused.map((e) => `  ${e.card}  ord ${e.ord}: ${e.reason}`).join("\n"),
    );
  }
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
    // Explicit consent for a write that reaches every deck sharing the language's note type. See
    // syncStructure's guard. A dry run never needs it: a dry run writes nothing.
    allowModelChange = false,
    // Direction suspension on notes that were ALREADY in the collection. Opt-in, previewed with
    // --dry, and gated on probe evidence that does not exist yet — so passing this today raises an
    // error naming the missing probes rather than touching a card the owner is studying.
    suspendDelivered = false,
    // The distinct SECOND flag: re-suspend a direction a person unsuspended by hand. Without it a
    // human unsuspend is permanent, which is the point.
    reSuspendHumanUnsuspended = false,
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
    removedLegacyDecks: [],
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
    // Manifest: the REAL deck name behind each .apkg. `safeFile` mangles names, so a restore
    // could not otherwise know which live deck to delete before importing.
    writeFileSync(
      join(backupDir, "manifest.json"),
      JSON.stringify({ decks: report.backedUp }, null, 2) + "\n",
    );
    pruneBackups(backupRoot, { log });
  }

  // 4. STRUCTURE SYNC (per unique model)
  for (const [, spec] of specsByModel) {
    report.structure.push(await syncStructure(client, spec, dry, { allowModelChange, log }));
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
  // Sweep the empty pre-grouping-era deck shells every run — a wrong-direction AnkiWeb sync can
  // resurrect them after a hand deletion, and re-cleaning here makes the cleanup converge.
  report.removedLegacyDecks = dry ? [] : await removeLegacyDeckShells(client, deliverable, { log });
  for (const name of report.createdDecks) {
    log(`${dry ? "would create" : "created"} deck: ${name}`);
  }

  // 6. CONTENT SYNC (per deck)
  for (const deck of deliverable) {
    const result = await syncDeckContent(client, deck, dry, {
      suspendDelivered,
      reSuspendHumanUnsuspended,
      log,
    });
    report.content.push(result);
    if (!dry) writeDeliveredMarker(deck);
    log(`content synced: ${deck.type}:${deck.id}`);
    logDirections(result, deck, dry, log);
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
