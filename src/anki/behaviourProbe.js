/**
 * Live-AnkiConnect behaviour probes, and the fail-closed interlock that decides whether they may run.
 *
 * ── WHAT THIS IS FOR ─────────────────────────────────────────────────────────────────────────────
 *
 * Three questions about delivery cannot be answered headlessly, because they are questions about
 * what AnkiConnect does to a LIVE collection:
 *
 *   1. Does `modelTemplateAdd` / `updateModelTemplates` regenerate a card row the `.apkg` writer
 *      omitted, and does it UNSUSPEND anything? (WS4's per-card direction control turns on this.)
 *   2. What does `changeDeck` do to a card sitting in a FILTERED deck, with a non-zero `odid`?
 *      (WS6's `--refile` must not ship until this passes.)
 *   3. What does `suspend` do to a card with a non-zero `odid`, and does a template update or a
 *      Check Database unsuspend it again?
 *
 * ── WHY THE INTERLOCK IS THE WHOLE POINT ─────────────────────────────────────────────────────────
 *
 * `src/anki/ankiConnect.js` pins its endpoint to `http://127.0.0.1:8765`, and AnkiConnect talks only
 * to whichever Anki instance is running. On this machine that is, by default, the collection the
 * owner studies every day: ~4,300 cards with years of scheduling. These probes perform experimental
 * schema-modifying writes, deck moves and suspend/unsuspend calls. Run against the wrong profile
 * they are the exact damage this plan spends a workstream preventing.
 *
 * AnkiConnect is installed per INSTALLATION, not per profile, so it is live in every profile the
 * owner opens. That is why the guard is this interlock and not the setup instructions: the setup can
 * be followed correctly and the wrong profile still be open, one click away.
 *
 * The interlock is a CONJUNCTION — all four must hold — and it is re-asserted immediately before
 * every write-bearing probe, not just at startup, because a profile switch mid-run is exactly the
 * accident it exists to catch:
 *
 *   (a) no note type matches the deliverable pattern (`AnkiBuilder …`). Rename-proof by being a
 *       pattern rather than a list of today's two names.
 *   (b) `findNotes("tag:abid:*")` returns ZERO. The durable delivery tag survives a note-type
 *       rename and a deck rename, so it catches a collection (a) would miss.
 *   (c) the sentinel deck `ANKIBUILDER-PROBE-ONLY` exists AND the collection holds fewer than 200
 *       CARDS. Card count, not note count: a two-template note type means a 150-note collection is
 *       300 cards, and it is cards the probes move and suspend.
 *   (d) no deck matches any `ankiParent` recorded in a delivered marker on disk.
 *
 * (d) reads every collection's marker, and that is NOT a cross-collection comparison of the kind the
 * isolation rule forbids (CLAUDE.md, "Collections are isolated"). It reads each collection's own
 * deck NAME, independently, and asks one question of the live Anki profile: "is any of these here?"
 * No collection is compared against another, and no card content is read at all. The rule exists to
 * keep two products from being authored against each other; this is the guard that keeps an
 * experiment away from all of them.
 *
 * ── WHAT IS DELIBERATELY NOT AUTOMATED ───────────────────────────────────────────────────────────
 *
 * Creating, resetting and deleting the `ANKIBUILDER-PROBE` profile are HUMAN steps, documented in
 * references/deliver.md and never scripted. A script that can delete a profile is a script that can
 * delete the wrong profile, and no interlock can make that safe. For the same reason the script
 * creates its own note type only AFTER the interlock has passed.
 *
 * Everything here takes an injected client, so the whole module is testable with a fake and no
 * running Anki. Nothing in this file calls `createAnkiConnect`.
 */

/** The profile a human creates for this, and the sentinel deck inside it. */
export const PROBE_PROFILE = "ANKIBUILDER-PROBE";
export const SENTINEL_DECK = "ANKIBUILDER-PROBE-ONLY";
/** The filtered deck the human creates from the sentinel deck, for probes 2 and 3. */
export const FILTERED_DECK = "ANKIBUILDER-PROBE-FILTERED";
/** The note type the SCRIPT creates, after the interlock passes. Shares no prefix with the real one. */
export const PROBE_MODEL = "PROBE-ONLY Note";
export const MAX_PROBE_CARDS = 200;

/** A note type this repo would deliver into. Pattern, not a list, so a rename cannot defeat it. */
const DELIVERABLE_MODEL = /^ankibuilder\s/i;
/** The durable per-card delivery tag. Survives every rename, which is why it is checked separately. */
const ABID_QUERY = "tag:abid:*";

/**
 * Runs all four interlock conditions and returns `{ ok, checks }` where `checks` is
 * `[{ id, ok, detail }]`. Never throws for a failed condition: the caller decides, and a caller that
 * wants a refusal calls `assertInterlock`.
 *
 * `deliveredParents` is every `ankiParent` read off the delivered markers on disk (see
 * `readDeliveredParents`). Passing an empty list is legitimate only when nothing has ever been
 * delivered; the CLI refuses to treat an unreadable output tree as an empty one.
 */
export async function checkInterlock(client, { deliveredParents = [] } = {}) {
  const checks = [];

  const models = (await client.modelNames()) ?? [];
  const deliverable = models.filter((name) => DELIVERABLE_MODEL.test(name));
  checks.push({
    id: "no-deliverable-model",
    ok: deliverable.length === 0,
    detail: deliverable.length
      ? `this collection has the note type(s) this repo delivers into: ${deliverable.join(", ")}`
      : `no "AnkiBuilder …" note type present`,
  });

  const abidNotes = (await client.findNotes(ABID_QUERY)) ?? [];
  checks.push({
    id: "no-delivered-notes",
    ok: abidNotes.length === 0,
    detail: abidNotes.length
      ? `${abidNotes.length} note(s) carry an abid: delivery tag — this is a delivered collection`
      : "no note carries a delivery tag",
  });

  const decks = (await client.deckNames()) ?? [];
  const hasSentinel = decks.includes(SENTINEL_DECK);
  // findCards, not findNotes: a two-template note type makes the note count half the card count,
  // and it is CARDS these probes move, suspend and unsuspend.
  const allCards = (await client.findCards("")) ?? [];
  checks.push({
    id: "sentinel-and-size",
    ok: hasSentinel && allCards.length < MAX_PROBE_CARDS,
    detail: !hasSentinel
      ? `the sentinel deck "${SENTINEL_DECK}" is not here — create it by hand in the ${PROBE_PROFILE} profile`
      : `${allCards.length} card(s) in the collection (limit ${MAX_PROBE_CARDS})`,
  });

  const collisions = decks.filter((deck) =>
    deliveredParents.some((parent) => deck === parent || deck.startsWith(`${parent}::`)),
  );
  checks.push({
    id: "no-delivered-decks",
    ok: collisions.length === 0,
    detail: collisions.length
      ? `deck(s) matching a delivered collection are present: ${collisions.join(", ")}`
      : `no deck matches any of the ${deliveredParents.length} delivered parent deck name(s)`,
  });

  return { ok: checks.every((c) => c.ok), checks };
}

/**
 * The refusal. Called at startup AND immediately before every write-bearing probe.
 *
 * `stage` names where the refusal happened, because "the interlock passed at startup and failed
 * before probe 2" means something changed under the script — a profile switch, most likely — and
 * that is a far more alarming message than a startup refusal.
 */
export async function assertInterlock(client, { deliveredParents = [], stage = "startup" } = {}) {
  const result = await checkInterlock(client, { deliveredParents });
  if (result.ok) return result;
  const failed = result.checks.filter((c) => !c.ok);
  throw new Error(
    `REFUSING TO PROBE (${stage}): the reachable Anki collection is not the throwaway ` +
      `${PROBE_PROFILE} profile.\n` +
      failed.map((c) => `  ✗ ${c.id}: ${c.detail}`).join("\n") +
      `\n\nAnkiConnect talks to whichever profile is OPEN, and it is installed for the whole ` +
      `installation. Close the current profile, switch to ${PROBE_PROFILE}, and re-run. Never ` +
      `"fix" this by relaxing the interlock.`,
  );
}

/** `{ Front, Back }` templates for the probe note type. Two rows, so a missing row is observable. */
export const PROBE_TEMPLATES = [
  { name: "One", qfmt: "{{A}}", afmt: "{{A}}<hr id=answer>{{B}}" },
  { name: "Two", qfmt: "{{B}}", afmt: "{{B}}<hr id=answer>{{A}}" },
];

/**
 * Creates the probe's own note type, if it is not there. Called ONLY after the interlock passes.
 *
 * Named so it shares no prefix with the deliverable note type: if the probe's own model could match
 * the interlock's `AnkiBuilder …` pattern, the second run of this script would refuse itself, and
 * the obvious "fix" would be to loosen the pattern.
 */
export async function ensureProbeModel(client) {
  const models = (await client.modelNames()) ?? [];
  if (models.includes(PROBE_MODEL)) return { created: false };
  await client.createModel({
    modelName: PROBE_MODEL,
    inOrderFields: ["A", "B"],
    css: ".card { font-size: 20px; }",
    isCloze: false,
    cardTemplates: PROBE_TEMPLATES.map((t) => ({ Name: t.name, Front: t.qfmt, Back: t.afmt })),
  });
  return { created: true };
}

/**
 * PROBE 1 — does a template update regenerate a missing card row, and does it unsuspend anything?
 *
 * Adds a note, suspends its second card, records the state, then rewrites the templates and records
 * the state again. WS4's per-card direction control depends on the answer: if a template update
 * unsuspends, then "suspend the unwanted direction" is not durable and the whole mechanism has to
 * change.
 */
export async function probeTemplateRegeneration(client, { guard }) {
  await guard("before probe 1 (template regeneration)");
  const noteId = await client.addNote({
    deckName: SENTINEL_DECK,
    modelName: PROBE_MODEL,
    fields: { A: "probe1-a", B: "probe1-b" },
    tags: ["probe-only"],
    options: { allowDuplicate: true },
  });
  const cards = await client.findCards(`nid:${noteId}`);
  const before = await client.cardsInfo(cards);
  const second = before.find((c) => c.ord === 1);
  if (second) await client.suspend([second.cardId]);
  const afterSuspend = await client.cardsInfo(cards);

  await guard("before probe 1's template write");
  await client.updateModelTemplates(
    PROBE_MODEL,
    Object.fromEntries(
      PROBE_TEMPLATES.map((t) => [t.name, { Front: `${t.qfmt} `, Back: `${t.afmt} ` }]),
    ),
  );
  const afterTemplateWrite = await client.cardsInfo(await client.findCards(`nid:${noteId}`));

  return {
    probe: "template-regeneration",
    noteId,
    cardsBefore: summarize(before),
    cardsAfterSuspend: summarize(afterSuspend),
    cardsAfterTemplateWrite: summarize(afterTemplateWrite),
    answers: {
      rowCountChanged: afterTemplateWrite.length !== before.length,
      templateWriteUnsuspended:
        suspendedOrds(afterSuspend).length > 0 && suspendedOrds(afterTemplateWrite).length === 0,
    },
  };
}

/**
 * PROBE 2 — what does `changeDeck` do to a card sitting in a FILTERED deck?
 *
 * A card pulled into a filtered deck has its home deck in `odid` and its real due date in `odue`.
 * Moving it with `changeDeck` might rewrite `did` (leaving a card that says it is in two places),
 * might rewrite `odid`, or might be refused. WS6's `--refile` moves every card of a book, and a
 * learner with a custom-study session open is the normal case, not the edge case.
 *
 * Requires the human to have built `FILTERED_DECK` from the sentinel deck first — the script does
 * not create it, because AnkiConnect's filtered-deck surface differs by version and a probe that
 * quietly fell back to an ordinary deck would answer a different question than the one asked.
 */
export async function probeChangeDeckOnFiltered(client, { guard }) {
  await guard("before probe 2 (changeDeck on a filtered card)");
  const filteredCards = (await client.findCards(`deck:"${FILTERED_DECK}"`)) ?? [];
  if (!filteredCards.length) {
    return {
      probe: "changedeck-on-filtered",
      skipped:
        `no cards in "${FILTERED_DECK}". Build that filtered deck from "${SENTINEL_DECK}" by hand ` +
        `(Tools > Create Filtered Deck) so there is a card with a non-zero odid to move.`,
    };
  }
  const [cardId] = filteredCards;
  const [before] = await client.cardsInfo([cardId]);

  await guard("before probe 2's changeDeck write");
  let error = null;
  try {
    await client.changeDeck([cardId], SENTINEL_DECK);
  } catch (e) {
    error = e.message;
  }
  const [after] = await client.cardsInfo([cardId]);

  return {
    probe: "changedeck-on-filtered",
    error,
    before: summarize([before])[0],
    after: summarize([after])[0],
    answers: {
      refused: Boolean(error),
      odidCleared: before.odid !== 0 && after.odid === 0,
      leftInTwoPlaces: after.odid !== 0 && after.did !== before.did,
    },
  };
}

/**
 * PROBE 3 — what does `suspend` do to a card with a non-zero `odid`, and does a template update
 * bring it back?
 *
 * Added in the round-3 review, which held suspend-at-delivery to the same consent standard as
 * `changeDeck`: `suspend` is absent from this repo's AnkiConnect client today, so it is a genuinely
 * new live write path with no existing behaviour to lean on.
 */
export async function probeSuspendOnFiltered(client, { guard }) {
  await guard("before probe 3 (suspend on a filtered card)");
  const filteredCards = (await client.findCards(`deck:"${FILTERED_DECK}"`)) ?? [];
  if (!filteredCards.length) {
    return {
      probe: "suspend-on-filtered",
      skipped: `no cards in "${FILTERED_DECK}" — see probe 2`,
    };
  }
  const [cardId] = filteredCards;
  const [before] = await client.cardsInfo([cardId]);

  await guard("before probe 3's suspend write");
  await client.suspend([cardId]);
  const [afterSuspend] = await client.cardsInfo([cardId]);

  await guard("before probe 3's template write");
  await client.updateModelTemplates(
    PROBE_MODEL,
    Object.fromEntries(PROBE_TEMPLATES.map((t) => [t.name, { Front: t.qfmt, Back: t.afmt }])),
  );
  const [afterTemplateWrite] = await client.cardsInfo([cardId]);

  return {
    probe: "suspend-on-filtered",
    before: summarize([before])[0],
    afterSuspend: summarize([afterSuspend])[0],
    afterTemplateWrite: summarize([afterTemplateWrite])[0],
    answers: {
      suspendKeptOdid: afterSuspend.odid === before.odid,
      suspendPulledOutOfFilteredDeck: before.odid !== 0 && afterSuspend.odid === 0,
      templateWriteUnsuspended: afterSuspend.queue === -1 && afterTemplateWrite.queue !== -1,
    },
  };
}

/** Every probe, in order. `guard` is the re-assertion the caller supplies. */
export async function runProbes(client, { guard }) {
  return [
    await probeTemplateRegeneration(client, { guard }),
    await probeChangeDeckOnFiltered(client, { guard }),
    await probeSuspendOnFiltered(client, { guard }),
  ];
}

/** Only the card fields these questions are about — a full cardsInfo row is unreadable in a report. */
function summarize(cards) {
  return (cards ?? []).map((c) => ({
    cardId: c.cardId,
    ord: c.ord,
    deckName: c.deckName,
    did: c.did,
    odid: c.odid,
    odue: c.odue,
    queue: c.queue,
    type: c.type,
    suspended: c.queue === -1,
  }));
}

const suspendedOrds = (cards) => cards.filter((c) => c.queue === -1).map((c) => c.ord);
