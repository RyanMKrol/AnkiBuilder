#!/usr/bin/env node
//
// SPENT: 2026-08-25. A one-off MIGRATION, not a standing tool.
// It moved the 2026-08-24 Nihongo absorption onto the additions gate, once. Kept for the record.
// Do not run it as part of any procedure.
//
// WHY. The absorption was done before the gate existed, so it held its cards back the only way
// available at the time: by clearing `done` on fifteen finished units and withdrawing each one's
// corpus sign-off. That put hundreds of already-approved cards back in front of a reviewer in order
// to approve about a dozen new ones per unit, which is exactly what the additions gate was built to
// stop.
//
// This puts things where they should have been. Every card the absorption added is stamped with its
// batch, so `shippableCards()` holds it back per card, and the fifteen units get their `reviewed`
// and `done` back. The units are finished again, with some pending additions attached.
//
// "Every card the absorption added" is derived from git rather than guessed: the merge commit is
// the one that wrote them, so the ids it introduced into each unit are exactly the set. Cards mined
// by `prepare` afterwards are included too, deliberately: they are equally new to the deck, equally
// unreviewed, and equally the reviewer's to judge.
//
// Usage:
//   node scripts/migrate-absorption-to-additions.mjs --dry
//   node scripts/migrate-absorption-to-additions.mjs
import { readFileSync, existsSync, readdirSync } from "fs";
import { join, resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { execFileSync } from "child_process";
import { mergeIntoCardsFile } from "../src/cards/mergeIntoCardsFile.js";

const REPO = resolve(join(dirname(fileURLToPath(import.meta.url)), ".."));
const BOOK = "output/epubs/japanese-for-busy-people-book-1-kana";
const BATCH = "nihongo-102-2026-08";
// The commit before Phase 3 wrote a single card into output/. Everything a unit has gained since is
// this retrofit.
const BEFORE = "ddd6d9a";
const REASON = "absorption-to-additions";

const dry = process.argv.includes("--dry");
const readJson = (p) => JSON.parse(readFileSync(p, "utf-8"));

const gitShow = (rev, path) => {
  try {
    return JSON.parse(execFileSync("git", ["show", `${rev}:${path}`], { cwd: REPO }).toString());
  } catch {
    return null;
  }
};

const units = readdirSync(join(REPO, BOOK))
  .filter((d) => existsSync(join(REPO, BOOK, d, "cards.json")))
  .sort((a, b) => (Number(a.match(/\d+/)?.[0]) || 0) - (Number(b.match(/\d+/)?.[0]) || 0));

let stamped = 0;
let restored = 0;
const plan = [];

for (const unit of units) {
  const rel = `${BOOK}/${unit}/cards.json`;
  const cur = readJson(join(REPO, rel));
  const before = gitShow(BEFORE, rel);
  if (!before) continue;
  const had = new Set(before.items.map((i) => i.id));
  const added = cur.items.filter((i) => !had.has(i.id) && typeof i.addition !== "string");
  // A unit the absorption reopened: it was done before, and is not now.
  const wasDone = before.meta?.done === true && cur.meta?.done !== true;
  const wasReviewed = before.meta?.reviewed === true && cur.meta?.reviewed !== true;
  if (!added.length && !wasDone && !wasReviewed) continue;
  plan.push({ unit, added, wasDone, wasReviewed });
  stamped += added.length;
  if (wasDone || wasReviewed) restored++;
}

for (const { unit, added, wasDone, wasReviewed } of plan) {
  const restore = [wasReviewed ? "reviewed" : null, wasDone ? "done" : null].filter(Boolean);
  console.log(
    `${unit.padEnd(20)} +${String(added.length).padStart(2)} stamped` +
      (restore.length ? `   restore ${restore.join(" + ")}` : ""),
  );
  if (dry) continue;
  const path = join(REPO, BOOK, unit, "cards.json");
  if (added.length) {
    mergeIntoCardsFile(path, {
      byId: new Map(added.map((i) => [i.id, { addition: BATCH }])),
      ownedFields: ["addition"],
      reason: REASON,
    });
  }
  if (wasDone || wasReviewed) {
    mergeIntoCardsFile(path, {
      meta: {
        ...(wasReviewed ? { reviewed: true } : {}),
        ...(wasDone ? { done: true } : {}),
      },
      reason: REASON,
    });
  }
}

console.log(
  `\n${dry ? "WOULD stamp" : "stamped"} ${stamped} card(s) as batch "${BATCH}" ` +
    `across ${plan.length} unit(s); ${restored} unit(s) get their sign-off back.`,
);
if (dry) console.log("dry run - nothing written.");
else
  console.log(
    "Next: rebuild the package, and confirm its note count DROPS by exactly the pending count.",
  );
