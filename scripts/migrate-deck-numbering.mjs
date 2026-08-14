#!/usr/bin/env node
//
// SPENT: 2026-08-14 — a one-off MIGRATION, not a standing tool.
// the zero-padded deck rename ran once, on the two live collections. It is kept for the record, and because re-reading
// what a migration actually did is the only way to understand the shape of the data it left
// behind. Do not run it as part of any procedure: it is not in SKILL.md's per-chapter flow, and
// it will re-apply a decision that has already been made and reviewed.
//
// One-shot migration: rename managed lesson decks to the zero-padded scheme ("Lesson 9" ->
// "Lesson 09"), which is the only way Anki's text sort keeps a deck list in lesson order.
//
// AnkiConnect has no renameDeck action, so a rename is create -> changeDeck -> delete the empty
// original. changeDeck only reassigns a card's deck, leaving due date, interval, ease, reps and
// lapses untouched, but "leaves it untouched" is not something to take on trust with a daily
// learner's collection: this script snapshots the scheduling of every affected card first, and
// after moving them re-reads all of it and aborts unless every field of every card still matches.
//
// Safety properties, in order of how much they matter:
//   - Nothing is deleted until its cards are confirmed to be somewhere else.
//   - An old deck that still holds cards after the move is reported and LEFT ALONE.
//   - Scheduling is diffed field by field, per card; any drift fails the run loudly.
//   - --dry prints the plan and touches nothing.
//
// Usage: node scripts/migrate-deck-numbering.mjs [--dry] [--endpoint http://127.0.0.1:8765]

const args = process.argv.slice(2);
const dry = args.includes("--dry");
const endpoint = (() => {
  const i = args.indexOf("--endpoint");
  return i >= 0 ? args[i + 1] : "http://127.0.0.1:8765";
})();

const invoke = async (action, params) => {
  let res;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      body: JSON.stringify({ action, version: 6, params }),
    });
  } catch (e) {
    throw new Error(`AnkiConnect unreachable at ${endpoint} (is Anki open?): ${e.message}`);
  }
  const body = await res.json();
  if (body.error) throw new Error(`${action}: ${body.error}`);
  return body.result;
};

// "…::Lesson 9" or "…::Lesson 9::Child" -> the same with the number padded to two digits. Only a
// segment that is exactly a Lesson/Chapter/Unit + number is touched, so a title that happens to
// contain a number is never rewritten.
const SEGMENT = /^(Lesson|Chapter|Unit) (\d+)$/;
const padName = (name) =>
  name
    .split("::")
    .map((seg) => {
      const m = SEGMENT.exec(seg);
      return m ? `${m[1]} ${m[2].padStart(2, "0")}` : seg;
    })
    .join("::");

const SCHED_FIELDS = ["due", "interval", "factor", "reps", "lapses", "queue", "type"];

const snapshot = async (cardIds) => {
  const info = await invoke("cardsInfo", { cards: cardIds });
  const byId = new Map();
  for (const c of info) {
    byId.set(c.cardId, Object.fromEntries(SCHED_FIELDS.map((f) => [f, c[f]])));
  }
  return byId;
};

const main = async () => {
  const names = await invoke("deckNames");
  const renames = names
    .map((from) => ({ from, to: padName(from) }))
    .filter(({ from, to }) => from !== to)
    // Deepest first: a child is moved before the parent shell it lives under is removed.
    .sort((a, b) => b.from.split("::").length - a.from.split("::").length);

  if (renames.length === 0) {
    console.log("every deck already uses the padded scheme — nothing to do");
    return;
  }

  console.log(`${renames.length} deck(s) to rename${dry ? " (dry run)" : ""}:`);
  for (const { from, to } of renames) console.log(`  ${from}\n    -> ${to}`);

  // Snapshot BEFORE anything changes, across every card in every deck being touched.
  const affected = [];
  for (const { from } of renames) {
    const ids = await invoke("findCards", {
      query: `deck:"${from.replace(/"/g, '\\"')}" -deck:"${from.replace(/"/g, '\\"')}::*"`,
    });
    affected.push({ from, ids });
  }
  const allIds = affected.flatMap((a) => a.ids);
  console.log(`\n${allIds.length} card(s) sit directly in those decks`);
  const before = await snapshot(allIds);

  if (dry) {
    console.log("\ndry run — nothing was changed");
    return;
  }

  // Move: create the destination, then reassign the cards that live directly in the old deck.
  for (const { from, ids } of affected) {
    const to = padName(from);
    await invoke("createDeck", { deck: to });
    if (ids.length > 0) {
      await invoke("changeDeck", { cards: ids, deck: to });
      console.log(`moved ${ids.length} card(s): ${from} -> ${to}`);
    }
  }

  // VERIFY before deleting anything: same cards, same scheduling, now in the padded decks.
  const after = await snapshot(allIds);
  const info = await invoke("cardsInfo", { cards: allIds });
  const deckOf = new Map(info.map((c) => [c.cardId, c.deckName]));
  const problems = [];
  for (const [id, was] of before) {
    const now = after.get(id);
    if (!now) {
      problems.push(`card ${id} disappeared`);
      continue;
    }
    for (const f of SCHED_FIELDS) {
      if (was[f] !== now[f]) problems.push(`card ${id}: ${f} changed ${was[f]} -> ${now[f]}`);
    }
  }
  for (const { from, ids } of affected) {
    const to = padName(from);
    for (const id of ids) {
      if (deckOf.get(id) !== to)
        problems.push(`card ${id} is in "${deckOf.get(id)}", expected "${to}"`);
    }
  }
  if (problems.length > 0) {
    console.error(
      `\nVERIFICATION FAILED (${problems.length}) — nothing deleted, old decks intact:`,
    );
    problems.slice(0, 20).forEach((p) => console.error("  " + p));
    process.exit(2);
  }
  console.log(
    `\nverified: ${allIds.length} card(s) moved with scheduling identical field for field`,
  );

  // Only now remove the originals, and only the ones that are genuinely empty.
  const stillNamed = new Set(await invoke("deckNames"));
  for (const { from } of renames) {
    if (!stillNamed.has(from)) continue;
    const left = await invoke("findCards", { query: `deck:"${from.replace(/"/g, '\\"')}"` });
    if (left.length > 0) {
      console.log(`LEFT ALONE: "${from}" still holds ${left.length} card(s)`);
      continue;
    }
    await invoke("deleteDecks", { decks: [from], cardsToo: true });
    console.log(`removed empty deck "${from}"`);
  }
  console.log("\nmigration complete");
};

main().catch((e) => {
  console.error(`\nmigration aborted: ${e.message}`);
  process.exit(1);
});
