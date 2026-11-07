// Pull the next few NEW cards from chosen chapters straight into today's learning queue, so studying
// the top-level deck shows them without opening each chapter deck in turn. Used by
// scripts/queue-new-cards.mjs and by the "+N new" button on the dashboard.
//
// Why this exists: Anki fills a parent deck's new cards in deck order and caps them with the parent's
// own daily limit, so "five new cards from each of Chapters 0, 6, 8 and 12" cannot be had from the
// top-level deck. The owner sets the top-level deck's new cards/day to 0 and uses this instead.
//
// What it writes: each chosen card becomes an unanswered learning card due now (type 1, queue 1,
// due = now in epoch seconds, left = the deck's number of learning steps). That is exactly the state
// a new card is in after it is shown, minus the first answer, so the first answer is logged as an
// ordinary learning review and FSRS starts the card's memory from it. Anki does not count these cards
// against any new-card limit, because they never pass through "new", which is why the chapter decks
// keep showing their full blue new count afterwards. That number is only the day's allowance.
//
// Topping up, not adding: cards already started today (`introduced:1`) and queued cards still
// unanswered both count towards the target, so a second run or a second click the same day only
// fills the gap.
//
// Every write goes through `withSafetyNet`: sync, back up, write, sync. The owner's rule is that this
// is never a one-way door, so a failed first sync or a failed backup stops it before any card moves.
import { appendFileSync, mkdirSync } from "fs";
import { join, resolve } from "path";
import { backupManagedDecks, pruneBackups, TEST_PROFILES } from "./deliver.js";

// A chapter's deck is the first segment under the parent: "Chapter 06: Lesson 4: The First Date" for
// a reading deck, "Lesson 06" for a speaking deck (see unitDeckSegments in src/deck/deckPath.js).
const UNIT_SEGMENT = /^(?:Lesson|Chapter|Unit)\s+(\d+)(?:\s*:|$)/;

// Where the queue's backups and its log live, under the backup root. Its own folder, pruned on its
// own, so a few clicks a day never rotate a delivery's snapshots out.
export const QUEUE_BACKUP_DIR = "queue-new";
export const QUEUE_LOG = "queue-new-cards.jsonl";

/**
 * The decks directly under `parent` whose numbered prefix is one of `chapters`. Throws, before any
 * write, when a chapter matches no deck or more than one.
 */
export function resolveChapterDecks(deckNamesAndIds, parent, chapters) {
  if (!(parent in deckNamesAndIds)) throw new Error(`no deck named "${parent}" in this profile`);
  const children = Object.keys(deckNamesAndIds)
    .map((name) => ({ name, segments: name.split("::") }))
    .filter((d) => d.segments.length === 2 && d.segments[0] === parent);
  return chapters.map((chapter) => {
    const hits = children.filter((d) => {
      const m = UNIT_SEGMENT.exec(d.segments[1]);
      return m && Number(m[1]) === chapter;
    });
    if (hits.length === 0) throw new Error(`no chapter ${chapter} deck under "${parent}"`);
    if (hits.length > 1) {
      throw new Error(
        `chapter ${chapter} matches ${hits.length} decks: ${hits.map((h) => h.name).join(", ")}`,
      );
    }
    return hits[0].name;
  });
}

// A search term for one deck and its children. Not `did:`, which ignores every term after it
// (`did:<id> is:learn` returns the whole deck). Inside quotes Anki still treats `*` and `_` as
// wildcards and a backslash and `"` as escapes, so all four are escaped.
export function deckSearch(name) {
  return `deck:"${name.replace(/[\\"*_]/g, (ch) => `\\${ch}`)}"`;
}

// Today's position in one deck: started today, queued but not yet answered, and new cards left.
async function deckToday(client, name) {
  const introduced = await client.findCards(`${deckSearch(name)} introduced:1`);
  const learning = await client.findCards(`${deckSearch(name)} is:learn`);
  const waiting = learning.length
    ? (await client.cardsInfo(learning)).filter((c) => c.reps === 0).length
    : 0;
  const newIds = await client.findCards(`${deckSearch(name)} is:new -is:suspended -is:buried`);
  return { introducedToday: introduced.length, queuedNotStudied: waiting, newIds };
}

/** Read-only: where each deck stands today. What the dashboard shows beside its buttons. */
export async function queueStatus({ client, decks }) {
  const out = [];
  for (const deck of decks) {
    const { newIds, ...today } = await deckToday(client, deck);
    out.push({ deck, ...today, newLeft: newIds.length });
  }
  return out;
}

/**
 * Queue up to `perDeck` new cards in each deck named. Returns one entry per deck with what was
 * already there and which cards were (or, with `dryRun`, would be) queued, each with its original
 * new position, which is all `unqueueCards` needs to put it back.
 */
export async function queueIntoDecks({
  client,
  decks,
  perDeck = 5,
  dryRun = false,
  now = Math.floor(Date.now() / 1000),
}) {
  if (!Number.isInteger(perDeck) || perDeck < 1) throw new Error("perDeck must be a whole number");

  // Learning steps come from each card's own deck preset, so look each deck up once.
  const stepsByDeck = new Map();
  const learningSteps = async (deckName) => {
    if (!stepsByDeck.has(deckName)) {
      const config = await client.invoke("getDeckConfig", { deck: deckName });
      stepsByDeck.set(deckName, config?.new?.delays?.length ?? 0);
    }
    return stepsByDeck.get(deckName);
  };

  // Plan everything before writing anything, so a refusal leaves no deck half done.
  const plans = [];
  for (const name of decks) {
    const { introducedToday, queuedNotStudied, newIds } = await deckToday(client, name);
    const want = Math.max(0, perDeck - introducedToday - queuedNotStudied);
    let picked = [];
    if (want > 0 && newIds.length) {
      picked = (await client.cardsInfo(newIds))
        .filter((c) => c.type === 0 && c.queue === 0)
        .sort((a, b) => a.due - b.due || a.ord - b.ord || a.cardId - b.cardId)
        .slice(0, want);
      for (const card of picked) {
        const steps = await learningSteps(card.deckName);
        if (steps < 1) {
          throw new Error(
            `"${card.deckName}" has no learning steps, so a new card cannot be put into learning. Nothing was changed.`,
          );
        }
        card.steps = steps;
      }
    }
    plans.push({ name, introducedToday, queuedNotStudied, newLeft: newIds.length, picked });
  }

  const results = [];
  for (const plan of plans) {
    if (!dryRun && plan.picked.length) {
      await writeCards(
        client,
        plan.picked.map((c) => ({ cardId: c.cardId, values: [1, 1, now, c.steps] })),
      );
      // Read back rather than trust the write: AnkiConnect reports [true] for a key it ignored.
      const after = await client.cardsInfo(plan.picked.map((c) => c.cardId));
      const wrong = after.filter((c) => c.type !== 1 || c.queue !== 1);
      if (wrong.length) {
        throw new Error(
          `${wrong.length} card(s) in "${plan.name}" did not end up in learning: ${wrong.map((c) => c.cardId).join(", ")}`,
        );
      }
    }
    results.push({
      deck: plan.name,
      introducedToday: plan.introducedToday,
      queuedNotStudied: plan.queuedNotStudied,
      newLeft: plan.newLeft - plan.picked.length,
      queued: plan.picked.map((c) => ({
        cardId: c.cardId,
        deckName: c.deckName,
        front: firstFieldValue(c),
        originalPosition: c.due,
      })),
    });
  }
  return results;
}

/** `queueIntoDecks` for chapter numbers under a parent deck, as the script takes them. */
export async function queueNewCards({ client, parent, chapters, ...rest }) {
  const decks = resolveChapterDecks(await client.invoke("deckNamesAndIds"), parent, chapters);
  return queueIntoDecks({ client, decks, ...rest });
}

/**
 * Put queued cards back as new cards at their original positions. Only a card still exactly as the
 * queue left it (learning, never answered) is touched: once a card has been studied, its review is
 * real history and undoing the queue would erase it, so it is reported and left alone.
 */
export async function unqueueCards({ client, cards }) {
  const info = cards.length ? await client.cardsInfo(cards.map((c) => c.cardId)) : [];
  const byId = new Map(info.map((c) => [c.cardId, c]));
  const restore = [];
  const kept = [];
  for (const card of cards) {
    const live = byId.get(card.cardId);
    if (live && live.type === 1 && live.queue === 1 && live.reps === 0) restore.push(card);
    else kept.push({ ...card, reason: live ? "already studied" : "card not found" });
  }
  await writeCards(
    client,
    restore.map((c) => ({ cardId: c.cardId, values: [0, 0, c.originalPosition, 0] })),
  );
  const after = restore.length ? await client.cardsInfo(restore.map((c) => c.cardId)) : [];
  const wrong = after.filter((c) => c.type !== 0 || c.queue !== 0);
  if (wrong.length) {
    throw new Error(
      `${wrong.length} card(s) did not go back to new: ${wrong.map((c) => c.cardId)}`,
    );
  }
  return { restored: restore, kept };
}

/**
 * The guard around every write: check the profile, sync, back up `parent` with scheduling, run the
 * change, sync again. A failed first sync or backup throws before `change` runs, so nothing moves
 * without a way back. A failed second sync does not undo anything (the change is local and correct)
 * and is reported so the owner can sync by hand. Each run is appended to the queue log with its
 * backup's path and the cards it moved.
 */
export async function withSafetyNet({
  client,
  parent,
  action,
  change,
  backupRoot = resolve("anki-backups"),
  allowTestProfile = false,
  now = () => Date.now(),
  log = () => {},
}) {
  const profile = await client.invoke("getActiveProfile");
  if (TEST_PROFILES.includes(profile) && !allowTestProfile) {
    throw new Error(`Anki is open on the probe profile "${profile}", not your collection.`);
  }
  try {
    await client.sync();
  } catch (e) {
    throw new Error(
      `the sync before the change failed (${e.message}). Nothing was changed. Sync in Anki, then try again.`,
    );
  }
  log("synced");
  const backupDir = (
    await backupManagedDecks(client, [parent], {
      backupRoot: join(backupRoot, QUEUE_BACKUP_DIR),
      now,
      log,
    })
  ).backupDir;
  pruneBackups(join(backupRoot, QUEUE_BACKUP_DIR), { log });

  const record = (entry) => {
    mkdirSync(backupRoot, { recursive: true });
    appendFileSync(
      join(backupRoot, QUEUE_LOG),
      JSON.stringify({ at: new Date(now()).toISOString(), action, parent, backupDir, ...entry }) +
        "\n",
    );
  };
  let result;
  try {
    result = await change();
  } catch (e) {
    record({ error: e.message });
    throw new Error(`${e.message} (backup taken before the change: ${backupDir})`);
  }

  let syncedAfter = true;
  let syncError = null;
  try {
    await client.sync();
    log("synced again");
  } catch (e) {
    syncedAfter = false;
    syncError = e.message;
  }
  record({ result });
  return { profile, backupDir, syncedAfter, syncError, result };
}

async function writeCards(client, writes) {
  for (const { cardId, values } of writes) {
    const res = await client.invoke("setSpecificValueOfCard", {
      card: cardId,
      keys: ["type", "queue", "due", "left"],
      newValues: values,
      warning_check: true,
    });
    if (!Array.isArray(res) || res[0] !== true) {
      throw new Error(`card ${cardId} was not updated: ${JSON.stringify(res)}`);
    }
  }
}

function firstFieldValue(card) {
  const fields = Object.values(card.fields ?? {}).sort((a, b) => a.order - b.order);
  return fields[0]?.value ?? "";
}
