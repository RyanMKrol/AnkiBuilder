#!/usr/bin/env node
//
// SPENT: 2026-08-24. A one-off MIGRATION, not a standing tool.
// It moved the Nihongo 101 course's live Anki notes into the book's deck tree, once, so the cards
// the absorption relocated on disk kept the review history the owner had built up on them. It is
// kept for the record, and because re-reading what a migration actually did is the only way to
// understand the shape of the data it left behind. Do not run it as part of any procedure: the
// course deck is retired and the notes have already moved.
//
// WHY THIS EXISTS. `deliver-to-anki.mjs` matches a note to a card by a durable `abid:<card.id>` tag,
// but it looks for it with ONE book-wide query scoped to the collection's own parent deck. A note
// sitting under "Nihongo 101 Course (N5)" is therefore invisible to the book's delivery: the card
// would read as new, be added with fresh scheduling, and the matured original would merely be
// reported as orphaned. Moving the notes into the book's tree FIRST is what makes the next deliver
// find them and update them in place.
//
// The safety design is copied from migrate-deck-numbering.mjs, which did the same kind of move on
// this collection in August and states the reasoning: `changeDeck` only reassigns a card's deck and
// leaves due date, interval, ease, reps and lapses untouched, but "leaves it untouched" is not
// something to take on trust with a daily learner's collection. So every affected card's scheduling
// is snapshotted first, re-read after the move, and compared field by field.
//
// Safety properties, in order of how much they matter:
//   - A card in a FILTERED deck (non-zero odid) is SKIPPED and reported, never moved. What
//     `changeDeck` does to one is the unanswered `change-deck-on-filtered` probe
//     (src/anki/probeResults.js), and this migration does not guess.
//   - Scheduling is diffed field by field, per card; any drift fails the run loudly.
//   - Nothing is deleted. Retiring the empty course decks is a separate, later, human step.
//   - --dry is the DEFAULT. A real move needs --apply.
//
// Usage:
//   node scripts/migrate-nihongo-absorption.mjs            plan only, touches nothing
//   node scripts/migrate-nihongo-absorption.mjs --apply    do it
//   ... --endpoint http://127.0.0.1:8765
import { readFileSync, existsSync } from "fs";
import { join, resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { createAnkiConnect } from "../src/anki/ankiConnect.js";
import { unitDeckSegments } from "../src/deck/deckPath.js";

const REPO = resolve(join(dirname(fileURLToPath(import.meta.url)), ".."));
const BOOK = join(REPO, "output/epubs/japanese-for-busy-people-book-1-kana");
const ROUTING = join(REPO, "docs/designs/nihongo-absorption-2026-08.routing.json");
const COURSE_PARENT = "Nihongo 101 Course (N5)";
const MODEL = "AnkiBuilder ja";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const endpointIdx = args.indexOf("--endpoint");
const endpoint = endpointIdx >= 0 ? args[endpointIdx + 1] : undefined;

// The fields that ARE the learner's progress. If any one of them changes across the move, the move
// did something other than what it claims and the run stops.
const SCHED_FIELDS = ["due", "ivl", "factor", "reps", "lapses", "queue", "type"];

const readJson = (p) => JSON.parse(readFileSync(p, "utf-8"));
const ABID = "abid:";

const bookName = readJson(join(BOOK, "book.json")).title;
const rows = readJson(ROUTING).rows.filter((r) => r.disposition === "move");

// Destination deck name per unit, derived from the unit's own label through the ONE function both
// the package builder and the deliverer use. Deriving it any other way here is how a migration ends
// up filing cards into a deck that looks right and is not the one the deliverer will look in.
const deckForUnit = new Map();
for (const unit of new Set(rows.map((r) => r.destination))) {
  const p = join(BOOK, unit, "cards.json");
  if (!existsSync(p)) {
    console.error(`no such unit on disk: ${unit}`);
    process.exit(1);
  }
  const label = readJson(p).meta?.chapterLabel;
  if (!label) {
    console.error(`unit has no chapterLabel: ${unit}`);
    process.exit(1);
  }
  deckForUnit.set(unit, [bookName, ...unitDeckSegments(label)].join("::"));
}

const client = createAnkiConnect(endpoint ? { endpoint } : {});

const snapshot = async (cardIds) => {
  const info = (await client.cardsInfo(cardIds)) ?? [];
  const byId = new Map();
  for (const c of info) {
    byId.set(c.cardId, Object.fromEntries(SCHED_FIELDS.map((f) => [f, c[f]])));
  }
  return { byId, info };
};

const main = async () => {
  await client.version();

  const noteIds = (await client.findNotes(`deck:"${COURSE_PARENT}" note:"${MODEL}"`)) ?? [];
  const infos = noteIds.length ? await client.notesInfo(noteIds) : [];
  const byAbid = new Map();
  for (const n of infos) {
    const tag = (n.tags || []).find((t) => t.startsWith(ABID));
    if (tag) byAbid.set(tag.slice(ABID.length), n);
  }
  console.log(`${COURSE_PARENT}: ${infos.length} note(s), ${byAbid.size} carrying an abid: tag\n`);

  const moves = [];
  const unresolved = [];
  for (const r of rows) {
    const note = byAbid.get(r.cardId);
    if (!note) {
      unresolved.push(r.cardId);
      continue;
    }
    moves.push({ cardId: r.cardId, note, deck: deckForUnit.get(r.destination) });
  }

  if (unresolved.length) {
    console.log(`⚠️  ${unresolved.length} routed card(s) have no note under ${COURSE_PARENT}:`);
    for (const id of unresolved) console.log(`      ${id}`);
    console.log(
      "    Those will be ADDED as new notes by the next deliver, with fresh scheduling.\n",
    );
  }

  const allCardIds = moves.flatMap((m) => m.note.cards || []);
  const { byId: before, info } = await snapshot(allCardIds);

  // A card whose HOME deck is a filtered deck reports the filtered one here. Skipping is the same
  // decision `deliver-to-anki.mjs --refile` makes, for the same unanswered probe.
  const filtered = new Set(info.filter((c) => c.odid).map((c) => c.cardId));
  if (filtered.size) {
    console.log(`⚠️  ${filtered.size} card(s) are in a filtered deck and will be SKIPPED:`);
    for (const c of info.filter((x) => filtered.has(x.cardId))) {
      console.log(`      card ${c.cardId} (odid ${c.odid})`);
    }
    console.log("    Move them by hand once they leave the filtered deck.\n");
  }

  const byDeck = new Map();
  for (const m of moves) {
    const ids = (m.note.cards || []).filter((id) => !filtered.has(id));
    if (!ids.length) continue;
    if (!byDeck.has(m.deck)) byDeck.set(m.deck, []);
    byDeck.get(m.deck).push(...ids);
  }

  console.log(`plan: ${moves.length} note(s) into ${byDeck.size} deck(s)`);
  for (const [deck, ids] of [...byDeck].sort()) {
    console.log(`  ${String(ids.length).padStart(3)} card(s) -> ${deck}`);
  }

  if (!apply) {
    console.log("\ndry run (default) - nothing was moved. Re-run with --apply.");
    return;
  }

  console.log("\nmoving...");
  for (const [deck, ids] of byDeck) {
    await client.createDeck(deck);
    await client.changeDeck(ids, deck);
    console.log(`  moved ${ids.length} card(s) -> ${deck}`);
  }

  // The check the whole script exists for.
  const { byId: after } = await snapshot([...before.keys()].filter((id) => !filtered.has(id)));
  const drift = [];
  for (const [cardId, was] of before) {
    if (filtered.has(cardId)) continue;
    const now = after.get(cardId);
    if (!now) {
      drift.push(`card ${cardId}: vanished from cardsInfo after the move`);
      continue;
    }
    for (const f of SCHED_FIELDS) {
      if (was[f] !== now[f]) drift.push(`card ${cardId}: ${f} ${was[f]} -> ${now[f]}`);
    }
  }
  if (drift.length) {
    console.error(`\n✗ SCHEDULING DRIFT on ${drift.length} field(s) - the move changed progress:`);
    for (const d of drift) console.error("    " + d);
    console.error("\nRestore from the newest anki-backups snapshot before doing anything else.");
    process.exit(1);
  }
  console.log(
    `\n✓ scheduling verified identical across ${before.size - filtered.size} card(s) ` +
      `(${SCHED_FIELDS.join(", ")})`,
  );
  console.log("Next: node scripts/deliver-to-anki.mjs --dry, and check the moves read as UPDATES.");
};

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
