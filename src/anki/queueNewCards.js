// Pull the next few NEW cards from chosen chapters straight into today's learning queue, so studying
// the top-level deck shows them without opening each chapter deck in turn.
//
// Why this exists: Anki fills a parent deck's new cards in deck order and caps them with the parent's
// own daily limit, so "five new cards from each of Chapters 0, 6, 8 and 12" cannot be had from the
// top-level deck. The owner sets the top-level deck's new cards/day to 0 and runs this instead.
//
// What it writes: each chosen card becomes an unanswered learning card due now (type 1, queue 1,
// due = now in epoch seconds, left = the deck's number of learning steps). That is exactly the state
// a new card is in after it is shown, minus the first answer, so the first answer is logged as an
// ordinary learning review and FSRS starts the card's memory from it. Anki does not count these cards
// against any new-card limit, because they never pass through "new", which is why the chapter decks
// keep showing their full blue new count afterwards. That number is only the day's allowance.
//
// Running it twice in a day tops each chapter up to the target rather than adding another batch:
// cards already started today (`introduced:1`) and cards this script queued that are still unanswered
// both count towards it.

// A chapter's deck is the first segment under the parent: "Chapter 06: Lesson 4: The First Date" for
// a reading deck, "Lesson 06" for a speaking deck (see unitDeckSegments in src/deck/deckPath.js).
const UNIT_SEGMENT = /^(?:Lesson|Chapter|Unit)\s+(\d+)(?:\s*:|$)/;

/**
 * The decks directly under `parent` whose numbered prefix is one of `chapters`. Throws, before any
 * write, when a chapter matches no deck or more than one.
 */
export function resolveChapterDecks(deckNamesAndIds, parent, chapters) {
  const children = Object.entries(deckNamesAndIds)
    .map(([name, id]) => ({ name, id, segments: name.split("::") }))
    .filter((d) => d.segments.length === 2 && d.segments[0] === parent);
  if (!(parent in deckNamesAndIds)) throw new Error(`no deck named "${parent}" in this profile`);
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
    return { chapter, name: hits[0].name, id: hits[0].id };
  });
}

/**
 * Queue up to `perDeck` new cards per chapter. Returns one entry per chapter with what was already
 * there and which cards were (or, with `dryRun`, would be) queued. Every queued card's original new
 * position is in the result, which is all it takes to put it back: type 0, queue 0, left 0, due =
 * that position.
 */
export async function queueNewCards({
  client,
  parent,
  chapters,
  perDeck = 5,
  dryRun = false,
  now = Math.floor(Date.now() / 1000),
}) {
  if (!Number.isInteger(perDeck) || perDeck < 1) throw new Error("perDeck must be a whole number");
  const decks = resolveChapterDecks(await client.invoke("deckNamesAndIds"), parent, chapters);

  // Learning steps come from each card's own deck preset, so look each deck up once.
  const stepsByDeck = new Map();
  const learningSteps = async (deckName) => {
    if (!stepsByDeck.has(deckName)) {
      const config = await client.invoke("getDeckConfig", { deck: deckName });
      stepsByDeck.set(deckName, config?.new?.delays?.length ?? 0);
    }
    return stepsByDeck.get(deckName);
  };

  // Plan everything before writing anything, so a refusal leaves no chapter half done.
  const plans = [];
  for (const deck of decks) {
    const introduced = await client.findCards(`${deckSearch(deck.name)} introduced:1`);
    const learning = await client.findCards(`${deckSearch(deck.name)} is:learn`);
    const waiting = learning.length
      ? (await client.cardsInfo(learning)).filter((c) => c.reps === 0).length
      : 0;
    const want = Math.max(0, perDeck - introduced.length - waiting);

    const newIds = await client.findCards(
      `${deckSearch(deck.name)} is:new -is:suspended -is:buried`,
    );
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
    plans.push({
      ...deck,
      introduced: introduced.length,
      waiting,
      newLeft: newIds.length,
      picked,
    });
  }

  const results = [];
  for (const plan of plans) {
    const queued = plan.picked.map((c) => ({
      cardId: c.cardId,
      deckName: c.deckName,
      front: firstFieldValue(c),
      originalPosition: c.due,
    }));
    if (!dryRun && plan.picked.length) {
      for (const card of plan.picked) {
        const res = await client.invoke("setSpecificValueOfCard", {
          card: card.cardId,
          keys: ["type", "queue", "due", "left"],
          newValues: [1, 1, now, card.steps],
          warning_check: true,
        });
        if (!Array.isArray(res) || res[0] !== true) {
          throw new Error(`card ${card.cardId} was not updated: ${JSON.stringify(res)}`);
        }
      }
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
      chapter: plan.chapter,
      deck: plan.name,
      introducedToday: plan.introduced,
      queuedNotStudied: plan.waiting,
      newLeft: plan.newLeft - queued.length,
      queued,
    });
  }
  return results;
}

// A search term for one deck and its children. Not `did:`, which ignores every term after it
// (`did:<id> is:learn` returns the whole deck). Inside quotes Anki still treats `*` and `_` as
// wildcards and a backslash and `"` as escapes, so all four are escaped.
export function deckSearch(name) {
  return `deck:"${name.replace(/[\\"*_]/g, (ch) => `\\${ch}`)}"`;
}

function firstFieldValue(card) {
  const fields = Object.values(card.fields ?? {}).sort((a, b) => a.order - b.order);
  return fields[0]?.value ?? "";
}
