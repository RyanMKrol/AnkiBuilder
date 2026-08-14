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
import { DELIVERED_MARKER, readDeliveredMarker } from "./deliveredMarker.js";
import { assertProbeEvidence } from "./probeEvidence.js";
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
    // The collection's OWN delivered marker: what the last deliver recorded about this collection,
    // and nothing about any other. It is what the rename guard and the fail-closed baseline read.
    const marker = readDeliveredMarker(bookDir);
    decks.push({
      type,
      id,
      title: info.title,
      targetLanguage,
      spec,
      ankiParent,
      units,
      bookDir,
      marker: marker?.unreadable ? null : marker,
      markerUnreadable: marker?.unreadable ?? null,
    });
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
// The dashboard reads this to warn next to the deck, and `src/audit/state.js` reads it as the
// `delivered` state every mutation guard keys on — which is why the filename lives in its own leaf
// module now (./deliveredMarker.js) rather than here.
export { DELIVERED_MARKER };

const MARKER_NOTE =
  "This deck is delivered to Anki via AnkiConnect (scripts/deliver-to-anki.mjs). Do NOT re-import " +
  "the .apkg into that collection — deliver updates instead; a re-import creates duplicate notes.";

/**
 * Writes the delivered marker, including the BASELINE the next run's fail-closed check reads.
 *
 * `deliveredCardIds` is the set of card ids this deliver resolved to a real note in Anki. The next
 * deliver looks every one of them up by `abid:` and aborts if a large fraction has vanished, which
 * is what a book rename looks like from the inside: the query returns nothing, every card reads as
 * new, and the run would otherwise re-add the whole book with fresh scheduling.
 *
 * ⚠️ FAIL-LOUD, NEVER THROWING. This used to be a best-effort write inside a try with an empty
 * catch ("the marker is advisory"), and a gate on the largest unbounded-damage path in the delivery
 * layer must not inherit an error-swallowing writer. But it runs AFTER the notes have been written,
 * so throwing here would report a failure for a delivery that actually happened. Instead: on a
 * failure it tries to leave a DISARMED marker (no baseline), so the next run bootstraps rather than
 * trusting a stale one, and the outcome is returned for the caller to report prominently.
 */
function writeDeliveredMarker(deck, { cardIds = [] } = {}) {
  if (!deck.bookDir) return { ok: true, skipped: "no book dir" };
  const path = join(deck.bookDir, DELIVERED_MARKER);
  const write = (extra) =>
    writeFileSync(
      path,
      JSON.stringify(
        {
          note: MARKER_NOTE,
          ankiParent: deck.ankiParent,
          lastDeliveredAt: new Date().toISOString(),
          ...extra,
        },
        null,
        2,
      ) + "\n",
    );

  try {
    write({ deliveredCardIds: [...cardIds].sort() });
    return { ok: true, armed: true, count: cardIds.length, path };
  } catch (error) {
    try {
      // No baseline recorded → the next run bootstraps (see assertDeliveredBaseline). A stale
      // baseline would be worse than none: it would arm a gate against a set nobody can vouch for.
      write({ deliveredCardIds: null, baselineDisarmedBecause: error.message });
      return { ok: false, armed: false, disarmed: true, error: error.message, path };
    } catch (second) {
      return {
        ok: false,
        armed: false,
        disarmed: false,
        error: `${error.message}; ${second.message}`,
        path,
      };
    }
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
 * A template ADD routes through this same guard (see `addedTemplates` below). It is also a
 * schema-modifying write on the shared model and forces the same manual sync; its own local warning
 * is not the same thing as a refusal.
 */
export async function syncStructure(
  client,
  spec,
  dry,
  { allowModelChange = false, allowTemplateAdd = false, log } = {},
) {
  const say = log ?? (() => {});
  const out = {
    model: spec.modelName,
    createModel: false,
    addedFields: [],
    addedTemplates: [],
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

  // A spec template with NO live counterpart is not an edit, it is an ADD — and `updateModelTemplates`
  // cannot make one. AnkiConnect's update action addresses templates by name on an existing note
  // type; handed a name the note type does not have, it reports success and creates nothing. That is
  // a no-op reporting success on a live-collection write, so the add case is separated out here and
  // handled explicitly, either by refusing or by the guarded `modelTemplateAdd` below.
  out.addedTemplates = spec.templates.filter((t) => !liveT?.[t.name]).map((t) => t.name);
  const tmplChanged = spec.templates.some((t) => {
    const live = liveT?.[t.name];
    return live && (live.Front !== t.qfmt || live.Back !== t.afmt);
  });
  const liveCss = (await client.modelStyling(spec.modelName))?.css ?? "";
  const cssChanged = liveCss !== spec.css;

  if (out.addedTemplates.length) {
    const usage = await modelUsage(client, spec.modelName);
    say(
      `note type "${spec.modelName}" is MISSING ${out.addedTemplates.length} card template(s) this ` +
        `build defines: ${out.addedTemplates.join(", ")}. Adding one generates a new card on every ` +
        `one of the ${usage.cards} existing card(s)' notes, across ${usage.decks.length} deck(s).`,
    );
    if (!dry) assertTemplateAddAllowed(spec, out.addedTemplates, usage, allowTemplateAdd);
  }

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
    // Adds first: `updateModelTemplates` can only address rows that exist, so an edit pushed before
    // the add would silently skip the new row and the run would report both as applied.
    for (const name of out.addedTemplates) {
      const template = spec.templates.find((t) => t.name === name);
      await client.modelTemplateAdd(spec.modelName, name, template.qfmt, template.afmt);
      say(
        `added card template "${name}" to "${spec.modelName}" — every existing note now has a new ` +
          `card. Any per-card direction suspension has to be RE-APPLIED: the new rows are unsuspended.`,
      );
    }
    if (tmplChanged || out.addedTemplates.length) {
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
 * THE TEMPLATE-ADD REFUSAL.
 *
 * Shipping behaviour today is the fail-loud half: a spec template with no live counterpart stops the
 * deliver and tells the operator to add it by hand. The guarded `modelTemplateAdd` path exists below
 * it, fully written, and is DORMANT — `assertProbeEvidence` refuses it because the live-Anki probes
 * that would say what a template add does to existing cards have never been run. The order matters:
 * the operator sees the plain instruction first, and the flag only reveals itself as a real option
 * once the evidence exists.
 *
 * Two reasons this is not just a warning:
 *
 *  1. the note type is keyed on LANGUAGE, so an add reaches every deck of that language at once —
 *     the same blast radius the template/CSS guard exists for, and the same consent standard;
 *  2. adding a template regenerates cards on every existing note, so any per-card direction
 *     suspension has to be re-applied afterwards. Whether the add ALSO unsuspends is one of the
 *     unanswered probe questions, which is precisely why this is gated rather than warned about.
 */
function assertTemplateAddAllowed(spec, added, usage, allowTemplateAdd) {
  if (!allowTemplateAdd) {
    throw new Error(
      `the note type "${spec.modelName}" is missing ${added.length} card template(s) this build ` +
        `defines (${added.join(", ")}), and a deliver will not create them. ` +
        `updateModelTemplates cannot add a template — handed a name the note type does not have it ` +
        `reports success and creates nothing.\n` +
        `Add it by hand in Anki first: Tools > Manage Note Types > "${spec.modelName}" > Cards > ` +
        `Options > Add Card Type, name it EXACTLY "${added[0]}", then re-run this deliver so the ` +
        `front/back are pushed from the build.\n` +
        `That write reaches all ${usage.cards} card(s) in ${usage.decks.length} deck(s) using this ` +
        `note type, generates one new card on every existing note, and forces a one-way full ` +
        `AnkiWeb sync you finish by hand.`,
    );
  }
  // Asked for explicitly — and still refused, because nothing yet knows what the write does.
  assertProbeEvidence("template-add");
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

/**
 * How many notes one deliver may ADD to a collection before it wants to be asked twice.
 *
 * An add is the expensive mistake in this layer: a note added where one should have been matched is
 * a duplicate with no scheduling, sitting beside a matured original. The number that turns a bad
 * match into a catastrophe is the SIZE of the run, so the size is what the ceiling is on. A first
 * delivery of a whole book legitimately exceeds it — that is the case where you read the dry run and
 * then say so with `--allow-bulk-add`.
 */
export const DEFAULT_MAX_ADDS = 200;

/**
 * The fraction of a recorded baseline that may fail to resolve before a deliver refuses to run.
 *
 * Not zero: a note deleted by hand in Anki is a legitimate, ordinary thing, and a gate that fires on
 * one missing note would be turned off within a week. It fires on the shape of a disaster — most of
 * the book, or all of it.
 */
export const MAX_UNRESOLVED_BASELINE = 0.1;

/**
 * THE BOOTSTRAP INDEXES, AND WHY THEY ARE READ FROM TWO DIFFERENT QUERIES.
 *
 * `byAbid` comes from ONE BOOK-WIDE query and must never be narrowed. `abid:<card.id>` is the only
 * durable link between a card on disk and a note in Anki; narrow that lookup to the unit's own
 * sub-deck and a delivered note the learner moved, or one sitting under a differently-named
 * sub-deck, falls out of the index. The card then reads as new and the loop adds it —
 * `allowDuplicate: true`, fresh guid, fresh scheduling — while merely printing the matured original
 * under `orphaned`. That is the exact damage this whole layer exists to prevent, so the query stays
 * book-wide and this comment is the reason it may not be "simplified".
 *
 * `byTarget` / `byTargetEnglish` are the FIRST-RUN fingerprint indexes, used once to adopt notes
 * that predate the abid tag, and they ARE scoped to the unit being delivered. Book-wide they
 * cross-bind: 17 targets repeat across this book's units, so a unit's card can adopt another unit's
 * note by spelling alone. Scoping them costs one findNotes per unit and closes that.
 */
async function buildIndexes(client, deck) {
  const model = escapeSearchTerm(deck.spec.modelName);
  const bookQuery = `deck:"${escapeSearchTerm(deck.ankiParent)}" note:"${model}"`;
  const noteIds = (await client.findNotes(bookQuery)) ?? [];
  const infos = noteIds.length ? await client.notesInfo(noteIds) : [];

  const noteById = new Map();
  const byAbid = new Map();
  for (const n of infos) {
    noteById.set(n.noteId, n);
    const abid = (n.tags || []).find((t) => t.startsWith(ABID));
    if (abid) byAbid.set(abid.slice(ABID.length), n.noteId);
  }

  // One fingerprint index per unit, from that unit's own sub-deck. `deck:` matches a filtered card
  // by its HOME deck, so a card pulled into a custom-study session is still found here.
  const byUnit = new Map();
  for (const unit of deck.units) {
    const unitIds =
      (await client.findNotes(`deck:"${escapeSearchTerm(unit.ankiDeck)}" note:"${model}"`)) ?? [];
    const unitInfos = unitIds.filter((id) => noteById.has(id)).map((id) => noteById.get(id));
    // A note under the unit's deck that the book-wide query did not see cannot exist (the unit deck
    // is inside the book deck), but a differently-configured collection could return one; read it
    // rather than assume.
    for (const id of unitIds) {
      if (noteById.has(id)) continue;
      const [info] = (await client.notesInfo([id])) ?? [];
      if (info) {
        noteById.set(id, info);
        unitInfos.push(info);
      }
    }
    const byTarget = new Map();
    const byTargetEnglish = new Map();
    const push = (map, key, id) => (map.has(key) ? map.get(key).push(id) : map.set(key, [id]));
    for (const n of unitInfos) {
      push(byTarget, norm(noteField(n, "Target")), n.noteId);
      push(byTargetEnglish, fingerprint(noteField(n, "Target"), noteField(n, "English")), n.noteId);
    }
    byUnit.set(unit, { byTarget, byTargetEnglish });
  }

  return { noteIds, noteById, byAbid, byUnit };
}

/**
 * THE RENAME GUARD.
 *
 * `ankiParent` is the book's human-editable title. Rename the deck in Anki and the book-wide query
 * matches nothing, every card reads as new, and a routine deliver re-inserts the entire book as
 * fresh notes with no scheduling — while the pre-delivery backup records a success, because
 * AnkiConnect returns `result: false` without an error for a deck that does not exist.
 *
 * The marker is what makes this detectable: it says this collection HAS been delivered, under this
 * parent name. Marker present and zero notes found is not a first run, it is a lookup that broke.
 */
function assertBookQueryResolves(deck, noteIds) {
  if (!deck.marker || noteIds.length > 0) return;
  throw new Error(
    `"${deck.ankiParent}" has been delivered before (${DELIVERED_MARKER} says so, last on ` +
      `${deck.marker.lastDeliveredAt ?? "an unrecorded date"}) but the lookup found ZERO notes ` +
      `under it. The likeliest cause by far is that the deck was RENAMED in Anki: this tool finds ` +
      `notes by the parent deck's name, and the name it expects is "${deck.marker.ankiParent}". ` +
      `Continuing would re-add every card in this collection as a new note with no scheduling. ` +
      `Rename the deck back, or update the collection's title so the two agree, then re-run.`,
  );
}

/**
 * THE FAIL-CLOSED BASELINE.
 *
 * `deliveredCardIds` in the marker is the set of cards the last deliver resolved to a real note. If
 * a large fraction of them no longer resolves by `abid:`, something has happened to the collection
 * that this run's matching cannot be trusted through.
 *
 * THE BOOTSTRAP RULE, stated explicitly: a marker with no `deliveredCardIds` field — which is both
 * live collections until their next deliver — RECORDS the baseline and asserts nothing. The gate
 * arms from the second run. Without that, the check would either be red on the day it landed or
 * tuned so loose it never fires, which is the trap it exists to avoid.
 */
function assertDeliveredBaseline(deck, byAbid) {
  const recorded = deck.marker?.deliveredCardIds;
  if (!Array.isArray(recorded) || recorded.length === 0) {
    return { armed: false, reason: "no baseline recorded yet — this run records one" };
  }
  const unresolved = recorded.filter((id) => !byAbid.has(id));
  const fraction = unresolved.length / recorded.length;
  if (unresolved.length && (fraction === 1 || fraction > MAX_UNRESOLVED_BASELINE)) {
    throw new Error(
      `${unresolved.length} of ${recorded.length} previously-delivered card(s) ` +
        `(${Math.round(fraction * 100)}%) no longer resolve to a note in "${deck.ankiParent}". ` +
        `The last deliver recorded them; this run cannot find them. Something happened to the ` +
        `collection — a rename, a deleted deck, a restore from an older backup — and continuing ` +
        `would re-add them as new notes with no scheduling. First missing: ` +
        `${unresolved.slice(0, 5).join(", ")}${unresolved.length > 5 ? ", …" : ""}.`,
    );
  }
  return { armed: true, recorded: recorded.length, unresolved: unresolved.length };
}

/**
 * Resolves every card in a deck to an operation, WITHOUT writing anything.
 *
 * Separated from the execution so the whole run can be counted before any of it happens: the add
 * ceiling, the `--refile` preview and the fail-closed baseline all need to know the shape of the
 * whole delivery, and a check that fires halfway through a run of writes is not a gate.
 */
export async function planDeckContent(client, deck) {
  assertUniqueCardIds(deck);
  const { noteIds, noteById, byAbid, byUnit } = await buildIndexes(client, deck);
  assertBookQueryResolves(deck, noteIds);
  const baseline = assertDeliveredBaseline(deck, byAbid);

  const ops = [];
  const ambiguous = [];
  const orphaned = [];
  const corpusIds = new Set();
  const used = new Set();
  const abidNoteIds = new Set(byAbid.values());

  for (const unit of deck.units) {
    const { byTarget } = byUnit.get(unit) ?? { byTarget: new Map() };
    for (const card of unit.cards) {
      corpusIds.add(card.id);
      const fields = Object.fromEntries(FIELD_NAMES.map((f) => [f, fieldValue(card, f)]));

      let noteId = byAbid.get(card.id);
      let stamp = false;
      if (noteId == null) {
        const free = (id) => !used.has(id) && !abidNoteIds.has(id);
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
          // Unit-scoped like the index it filters, so the fallback can no longer reach across units.
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
            ambiguous.push({ card: card.id, english: card.english });
            continue;
          }
        }
        // tgtMatches.length === 0 → Target absent → genuinely new → fall through to add.
      }

      if (noteId != null) {
        used.add(noteId);
        const n = noteById.get(noteId);
        const differs = FIELD_NAMES.some((f) => !sameField(noteField(n, f), fields[f]));
        ops.push({ kind: differs ? "update" : "skip", noteId, card, unit, fields, stamp, note: n });
      } else {
        ops.push({ kind: "add", card, unit, fields });
      }
    }
  }

  for (const [cid, nid] of byAbid) {
    if (!corpusIds.has(cid)) orphaned.push({ card: cid, noteId: nid });
  }

  return { ops, ambiguous, orphaned, baseline, noteById };
}

/** The tag a `--suspend-orphans` run leaves, so a human can find (and reverse) exactly this set. */
export const ORPHAN_TAG = "ab-orphaned";

/**
 * THE RE-FILE PLAN — every card that would move, and every card that deliberately would not.
 *
 * Deck membership is not cosmetic: it selects the options preset, which is the scheduling behaviour
 * (per-day limits, sibling burying) the rest of this work is about. So a re-file is opt-in, and this
 * function computes the whole thing as a preview before anything moves. Reads only.
 *
 * Two skips, both deliberate:
 *
 *  - a card in a FILTERED deck (non-zero `odid`). Anki's `deck:` search matches such a card by its
 *    HOME deck while `getDecks`/`cardsInfo` report the FILTERED one, so it reads as "deck differs"
 *    and would be yanked out of a custom-study session mid-review. Whether `changeDeck` even leaves
 *    it coherent is one of the unanswered probe questions.
 *  - a card sitting OUTSIDE this collection's own deck tree. Inside the tree, a differing deck means
 *    a stale unit name (which is what re-filing is for). Outside it, it means somebody deliberately
 *    put that card somewhere, and this tool does not know better.
 */
export async function planRefile(client, deck, plan) {
  const matched = plan.ops.filter((op) => op.kind !== "add");
  const cardIds = matched.flatMap((op) => plan.noteById.get(op.noteId)?.cards ?? []);
  if (cardIds.length === 0) return { moves: [], skipped: [] };

  const byDeck = (await client.getDecks(cardIds)) ?? {};
  const deckOf = new Map();
  for (const [name, ids] of Object.entries(byDeck)) for (const id of ids) deckOf.set(id, name);

  const inCollection = (name) =>
    name === deck.ankiParent || String(name).startsWith(`${deck.ankiParent}::`);

  const candidates = [];
  for (const op of matched) {
    for (const cardId of plan.noteById.get(op.noteId)?.cards ?? []) {
      const from = deckOf.get(cardId);
      if (!from || from === op.unit.ankiDeck) continue;
      candidates.push({ cardId, from, to: op.unit.ankiDeck, card: op.card.id, noteId: op.noteId });
    }
  }
  if (candidates.length === 0) return { moves: [], skipped: [] };

  // odid is the only way to tell a filtered card from an ordinary one, and it needs the fuller read.
  const info = (await client.cardsInfo(candidates.map((c) => c.cardId))) ?? [];
  const odidOf = new Map(info.map((c) => [c.cardId, c.odid ?? 0]));

  const moves = [];
  const skipped = [];
  for (const candidate of candidates) {
    if ((odidOf.get(candidate.cardId) ?? 0) !== 0) {
      skipped.push({ ...candidate, reason: "in a filtered deck (non-zero odid) — left alone" });
    } else if (!inCollection(candidate.from)) {
      skipped.push({ ...candidate, reason: `outside "${deck.ankiParent}" — left alone` });
    } else {
      moves.push(candidate);
    }
  }
  return { moves, skipped };
}

/**
 * The orphan plan: delivered notes whose card id is no longer in the corpus, with their card ids.
 *
 * Suspending is the right retirement for these. The card, its interval and its whole revlog survive,
 * and one click reverses it — whereas leaving it is a card the learner drills forever, and deleting
 * it destroys history this project's first rule is about.
 */
export function planSuspendOrphans(plan) {
  return plan.orphaned.map((orphan) => ({
    ...orphan,
    cardIds: plan.noteById.get(orphan.noteId)?.cards ?? [],
  }));
}

/**
 * Content sync for one deck: plan (reads only), check the ceiling, then write. Returns per-deck
 * counters + lists.
 */
export async function syncDeckContent(client, deck, dry, options = {}) {
  const {
    maxAdds = DEFAULT_MAX_ADDS,
    allowBulkAdd = false,
    refile = false,
    suspendOrphans = false,
    log = () => {},
  } = options;
  const plan = await planDeckContent(client, deck);

  const r = {
    deck: `${deck.type}:${deck.id}`,
    updated: 0,
    added: 0,
    skipped: 0,
    tagged: 0,
    addedWithoutAudio: 0,
    addedCards: [],
    ambiguous: plan.ambiguous,
    orphaned: plan.orphaned,
    baseline: plan.baseline,
    deliveredCardIds: [],
    refiled: null,
    suspendedOrphans: null,
  };

  const adds = plan.ops.filter((op) => op.kind === "add");
  if (adds.length > maxAdds) {
    const message =
      `this deliver would ADD ${adds.length} note(s) to "${deck.ankiParent}", over the ceiling of ` +
      `${maxAdds}. A run this size is either a first delivery or a matching failure, and the two ` +
      `look identical from here. Preview it with --dry, and if the additions are what you mean, ` +
      `re-run with --allow-bulk-add.`;
    if (!dry && !allowBulkAdd) throw new Error(message);
    log(message);
  }

  for (const op of plan.ops) {
    if (op.kind === "add") {
      const hadAudio = await maybeStoreMedia(client, op.card, op.unit, dry);
      if (!hadAudio) r.addedWithoutAudio++;
      if (!dry) {
        await client.addNote({
          deckName: op.unit.ankiDeck,
          modelName: deck.spec.modelName,
          fields: op.fields,
          tags: [`${ABID}${op.card.id}`],
          options: { allowDuplicate: true },
        });
      }
      r.added++;
      r.addedCards.push({ card: op.card.id, english: op.card.english, deck: op.unit.ankiDeck });
      r.deliveredCardIds.push(op.card.id);
      continue;
    }

    if (op.kind === "update") {
      await maybeStoreMedia(client, op.card, op.unit, dry);
      if (!dry) await client.updateNoteFields(op.noteId, op.fields);
      r.updated++;
    } else {
      r.skipped++;
    }
    if (op.stamp) {
      if (!dry) await client.addTags([op.noteId], `${ABID}${op.card.id}`);
      r.tagged++;
    }
    r.deliveredCardIds.push(op.card.id);
  }

  // ── the two OPT-IN steps, both previewed, both refused until the probes have answered ──────────
  //
  // The preview is not gated: it reads and prints. The RUN is, because both of these are live
  // writes to a card's scheduling state whose behaviour on a card in a filtered deck nobody has
  // established. `assertProbeEvidence` names the missing evidence rather than failing vaguely.
  if (refile) {
    const { moves, skipped } = await planRefile(client, deck, plan);
    r.refiled = { moves, skipped, applied: false };
    for (const move of moves) {
      log(`refile: card ${move.cardId} (${move.card}) "${move.from}" → "${move.to}"`);
    }
    for (const skip of skipped) {
      log(`refile: SKIPPED card ${skip.cardId} (${skip.card}) in "${skip.from}" — ${skip.reason}`);
    }
    if (!dry && moves.length) {
      assertProbeEvidence("refile");
      const byTarget = new Map();
      for (const move of moves) {
        if (!byTarget.has(move.to)) byTarget.set(move.to, []);
        byTarget.get(move.to).push(move.cardId);
      }
      for (const [target, ids] of byTarget) await client.changeDeck(ids, target);
      r.refiled.applied = true;
    }
  }

  if (suspendOrphans) {
    const orphans = planSuspendOrphans(plan);
    r.suspendedOrphans = { orphans, applied: false };
    for (const orphan of orphans) {
      log(
        `suspend-orphans: note ${orphan.noteId} (${orphan.card}) — ${orphan.cardIds.length} card(s), ` +
          `tagged ${ORPHAN_TAG}`,
      );
    }
    if (!dry && orphans.length) {
      assertProbeEvidence("suspend-orphans");
      const ids = orphans.flatMap((orphan) => orphan.cardIds);
      if (ids.length) await client.suspend(ids);
      await client.addTags(
        orphans.map((orphan) => orphan.noteId),
        ORPHAN_TAG,
      );
      r.suspendedOrphans.applied = true;
    }
  }

  return r;
}

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
    // Explicit consent to ADD a card template to that shared note type. Dormant: even with this,
    // the add is refused until the live probes have answered what it does (probeEvidence.js).
    allowTemplateAdd = false,
    // The add ceiling. A run bigger than this is either a first delivery or a matching failure, and
    // they look identical from here, so it asks.
    maxAdds = DEFAULT_MAX_ADDS,
    allowBulkAdd = false,
    // Opt-in, previewed, and refused until the live probes have answered what they do. See
    // syncDeckContent's two opt-in steps.
    refile = false,
    suspendOrphans = false,
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
    markerWrites: [],
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
        // A FALSY result is a failure. AnkiConnect answers `{result: false, error: null}` for a deck
        // that does not exist — no throw, nothing to catch — so a backup of a renamed or missing
        // deck used to record a success and hand the delivery a fail-closed guarantee it did not
        // have. This is the one line that made the backup real.
        const ok = await client.exportPackage(parent, path, true);
        if (ok === false || ok == null) {
          throw new Error(
            `AnkiConnect reported no export (result: ${JSON.stringify(ok)}) — the usual cause is ` +
              `that no deck is named "${parent}" any more`,
          );
        }
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
    report.structure.push(
      await syncStructure(client, spec, dry, { allowModelChange, allowTemplateAdd, log }),
    );
    log(`structure synced: ${spec.modelName}`);
  }
  // A structural change (new field / template / CSS) bumps Anki's schema, which forces a one-way full
  // sync that Anki gates behind its GUI Upload/Download dialog — so the sync-after below can't complete
  // it unattended and the user must click Upload once. Surface it so the CLI/UI can warn.
  report.schemaChanged = report.structure.some(
    (s) => s.createModel || s.addedFields.length || s.addedTemplates.length || s.templates || s.css,
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
      maxAdds,
      allowBulkAdd,
      refile,
      suspendOrphans,
      log,
    });
    report.content.push(result);
    if (!dry) {
      // The marker write happens AFTER the notes are written, so it must never throw: that would
      // report a failure for a delivery that already happened. It reports instead, loudly, and
      // leaves a disarmed baseline rather than a stale one.
      const marker = writeDeliveredMarker(deck, { cardIds: result.deliveredCardIds });
      report.markerWrites.push({ deck: `${deck.type}:${deck.id}`, ...marker });
      if (!marker.ok) {
        log(
          `⚠ could not record the delivery baseline for ${deck.type}:${deck.id} (${marker.error}). ` +
            (marker.disarmed
              ? `The marker now records NO baseline, so the next deliver bootstraps one instead of ` +
                `trusting a stale one — the fail-closed check is not armed until then.`
              : `The marker could not be written at all; the next deliver may be checking against a ` +
                `stale baseline. Fix the file before delivering again.`),
        );
      }
    }
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
