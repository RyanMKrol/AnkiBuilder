// A SOUND DECK, chosen once for a whole reading collection: the words written only in the language's
// phonetic script, picked so every sound unit is seen a few times and then up to a budget per script
// (docs/designs/reading-decks/09-kana-deck.md). Nothing here knows a language: the language plugin
// (src/reading/readingSchemes.js) supplies `units` (a word's sound units) and `script` (which budget
// a word counts against). Japanese's are in src/reading/kanaUnits.js.

/**
 * Chooses a sound deck from `pool`: every word of the book written only in the language's phonetic
 * script (Japanese: kana), as `{ target, position, ... }`
 * where `position` is book order. Deterministic: the same pool always gives the same deck.
 *
 * 1. Coverage: a greedy pass that keeps taking the word meeting the most outstanding need, where a
 *    need is a sound unit seen in fewer than `minPerUnit` chosen words, weighted towards the units the
 *    book rarely uses. Ties go to the earlier word in the book. This pass ignores
 *    the budgets, which is the rare-sound exception: a sound the book has is never left out because
 *    a budget ran out first.
 * 2. Fill: what is left of each script's budget, in book order.
 *
 * Returns `{ selected, unselected, coverage, short }`: the chosen words in book order, the rest with
 * a reason, how many chosen words contain each unit, and the units the WHOLE pool has fewer than
 * `minPerUnit` of (the book cannot give more).
 */
export function selectSoundDeck(pool, { budgets, minPerUnit, units: unitsOf, script: scriptOf }) {
  const words = [];
  const seen = new Set();
  const unselected = [];
  for (const entry of [...pool].sort((a, b) => a.position - b.position)) {
    if (seen.has(entry.target)) continue;
    seen.add(entry.target);
    // A digit is not kana to read, and the voice and the romaji cannot say it reliably: Genki's
    // classroom phrase 10ページをみてください held the whole kana deck at the readiness gate.
    if (/\p{Nd}/u.test(entry.target)) {
      unselected.push({ target: entry.target, reason: "it contains a digit, which is not kana" });
      continue;
    }
    const units = [...new Set(unitsOf(entry.target))];
    if (units.length) words.push({ entry, units, script: scriptOf(entry.target) });
  }

  const inPool = new Map();
  for (const w of words) for (const u of w.units) inPool.set(u, (inPool.get(u) ?? 0) + 1);
  const need = (u) => Math.min(minPerUnit, inPool.get(u));
  const covered = new Map();
  const chosen = new Set();
  const used = Object.fromEntries(Object.keys(budgets).map((name) => [name, 0]));
  const take = (w) => {
    chosen.add(w);
    used[w.script]++;
    for (const u of w.units) covered.set(u, (covered.get(u) ?? 0) + 1);
  };

  const score = (w) =>
    w.units.reduce(
      (sum, u) => ((covered.get(u) ?? 0) < need(u) ? sum + 1 / inPool.get(u) : sum),
      0,
    );
  for (;;) {
    let best = null;
    let bestScore = 0;
    for (const w of words) {
      if (chosen.has(w)) continue;
      const s = score(w);
      // Strictly greater keeps the earlier word on a tie: `words` is in book order.
      if (s > bestScore + 1e-12) {
        best = w;
        bestScore = s;
      }
    }
    if (!best) break;
    take(best);
  }

  for (const w of words) {
    if (chosen.has(w)) continue;
    if (used[w.script] < (budgets[w.script] ?? 0)) take(w);
    else {
      unselected.push({
        target: w.entry.target,
        reason: `the ${w.script} budget (${budgets[w.script] ?? 0} words) was already full`,
      });
    }
  }

  return {
    selected: words.filter((w) => chosen.has(w)).map((w) => w.entry),
    unselected,
    coverage: Object.fromEntries([...inPool.keys()].map((u) => [u, covered.get(u) ?? 0])),
    short: [...inPool].filter(([, n]) => n < minPerUnit).map(([u]) => u),
  };
}
