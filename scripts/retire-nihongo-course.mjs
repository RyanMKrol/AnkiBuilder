#!/usr/bin/env node
//
// SPENT: 2026-08-24. A one-off MIGRATION, not a standing tool.
// It retired the Nihongo 101 course deck from the live collection, once, after the absorption had
// moved everything worth keeping into the book. It is kept for the record, and because re-reading
// what a migration actually did is the only way to understand the shape of the data it left behind.
// Do not run it as part of any procedure.
//
// ⚠️ THIS DELETES NOTES THE OWNER HAS BEEN STUDYING. That is the point of it, and it is why every
// safety property below exists. Run it only when the routing table says those notes are redundant
// and a backup exists.
//
// What it deletes, and what it refuses to:
//   - ONLY notes whose abid: tag is a card the routing table marks `drop-duplicate`. A note under
//     the course parent whose id is not in that set is REPORTED AND LEFT ALONE, because it is either
//     something the migration missed or something the owner added by hand, and neither is this
//     script's to remove.
//   - Then the course decks, with cardsToo:false, so a deck that turns out not to be empty gives its
//     cards up to Default rather than to deletion. If any deck still holds cards, it is left alone
//     and reported.
//
// Safety properties, in order of how much they matter:
//   - A note is deleted only if the routing table says its card is a duplicate of one still shipping
//     in the book, and only if that book card is CONFIRMED present on disk first. A "duplicate" whose
//     twin has gone missing is not a duplicate, it is the last copy.
//   - Nothing is deleted until the full plan has been printed.
//   - --dry is the DEFAULT. A real run needs --apply AND --i-have-a-backup.
//
// Usage:
//   node scripts/retire-nihongo-course.mjs                          plan only
//   node scripts/retire-nihongo-course.mjs --apply --i-have-a-backup
import { readFileSync, existsSync, readdirSync } from "fs";
import { join, resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { createAnkiConnect } from "../src/anki/ankiConnect.js";

const REPO = resolve(join(dirname(fileURLToPath(import.meta.url)), ".."));
const BOOK = join(REPO, "output/epubs/japanese-for-busy-people-book-1-kana");
const ROUTING = join(REPO, "docs/designs/nihongo-absorption-2026-08.routing.json");
const COURSE_PARENT = "Nihongo 101 Course (N5)";
const MODEL = "AnkiBuilder ja";
const ABID = "abid:";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const backed = args.includes("--i-have-a-backup");
const endpointIdx = args.indexOf("--endpoint");
const endpoint = endpointIdx >= 0 ? args[endpointIdx + 1] : undefined;

const readJson = (p) => JSON.parse(readFileSync(p, "utf-8"));
const rows = readJson(ROUTING).rows;

// Every card id still shipping in the book, read from disk. A drop-duplicate is only safe to delete
// if the card it duplicates is really there: a "duplicate" whose twin has gone missing is not a
// duplicate, it is the last copy.
//
// The check is by CARD ID, from the routing table's `duplicateOf`, not by comparing target strings.
// Two cards can be the same expression and not the same string: じゃあまた against the book's
// じゃ、また is exactly that, and a string check refuses to retire it for a reason that is not true.
const shipping = new Set();
for (const d of readdirSync(BOOK)) {
  const p = join(BOOK, d, "cards.json");
  if (!existsSync(p)) continue;
  for (const i of readJson(p).items) if (!i.excluded) shipping.add(i.id);
}

const client = createAnkiConnect(endpoint ? { endpoint } : {});

const main = async () => {
  await client.version();

  const noteIds = (await client.findNotes(`deck:"${COURSE_PARENT}" note:"${MODEL}"`)) ?? [];
  const infos = noteIds.length ? await client.notesInfo(noteIds) : [];
  const byAbid = new Map();
  for (const n of infos) {
    const tag = (n.tags || []).find((t) => t.startsWith(ABID));
    if (tag) byAbid.set(tag.slice(ABID.length), n);
  }
  console.log(`${COURSE_PARENT}: ${infos.length} note(s) remaining\n`);

  const deletable = [];
  const keptBack = [];
  for (const r of rows.filter((x) => x.disposition === "drop-duplicate" && x.cardId)) {
    const note = byAbid.get(r.cardId);
    if (!note) continue;
    // The twin has to actually be shipping. Otherwise this is the last copy.
    if (!r.duplicateOf) {
      keptBack.push(`${r.cardId} (${r.target}): the routing table names no card it duplicates`);
      continue;
    }
    if (!shipping.has(r.duplicateOf)) {
      keptBack.push(`${r.cardId} (${r.target}): its twin ${r.duplicateOf} is not shipping`);
      continue;
    }
    deletable.push({ id: r.cardId, noteId: note.noteId, target: r.target });
  }

  const deletableIds = new Set(deletable.map((d) => d.id));
  const unaccounted = [...byAbid.keys()].filter((id) => !deletableIds.has(id));

  console.log(`to delete: ${deletable.length} note(s) the routing table marks as duplicates`);
  if (keptBack.length) {
    console.log(
      `\n⚠️  ${keptBack.length} marked duplicate(s) KEPT because the twin is not shipping:`,
    );
    for (const k of keptBack) console.log("      " + k);
  }
  if (unaccounted.length) {
    console.log(
      `\n⚠️  ${unaccounted.length} note(s) under ${COURSE_PARENT} are NOT in the delete set and are left alone:`,
    );
    for (const id of unaccounted) console.log("      " + id);
    console.log("    Deal with those by hand before removing the decks.");
  }

  const decks = (await client.deckNames()).filter(
    (d) => d === COURSE_PARENT || d.startsWith(COURSE_PARENT + "::"),
  );
  console.log(`\ncourse decks: ${decks.length}`);
  for (const d of decks) console.log("      " + d);

  if (!apply || !backed) {
    console.log(
      "\ndry run - nothing deleted. A real run needs BOTH --apply and --i-have-a-backup.\n" +
        "Take one with: node scripts/deliver-to-anki.mjs --dry is NOT a backup; use Anki's own\n" +
        "export, or the snapshot a real deliver writes into anki-backups/.",
    );
    return;
  }

  if (unaccounted.length) {
    console.error(
      "\n✗ REFUSING: notes under the course parent are unaccounted for (listed above).",
    );
    process.exit(1);
  }

  await client.deleteNotes(deletable.map((d) => d.noteId));
  console.log(`\ndeleted ${deletable.length} note(s)`);

  const stillHolding = [];
  for (const d of decks) {
    const left = (await client.findCards(`deck:"${d}"`)) ?? [];
    if (left.length) stillHolding.push(`${d} (${left.length} card(s))`);
  }
  if (stillHolding.length) {
    console.error("\n✗ these decks still hold cards and were NOT removed:");
    for (const s of stillHolding) console.error("      " + s);
    process.exit(1);
  }
  // cardsToo:false. If the emptiness check above is somehow wrong, the cards go to Default rather
  // than to deletion.
  await client.deleteDecks(decks, false);
  console.log(`removed ${decks.length} empty deck(s)`);
  console.log("\nNext: sync Anki, then archive output/courses/nihongo-101-course-n5 on disk.");
};

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
