// The kana deck of a Japanese reading collection (docs/designs/reading-decks/09-kana-deck.md).
//
// Reading kana is a finite skill: the sounds, their voiced forms, the small-kana combinations, small
// っ and ー. After a few hundred words every new kana-only card is the same drill again, so a reading
// collection cards its kana words ONCE, in one deck chosen from the whole book: first so that every
// sound the book uses is seen a few times, then up to a budget per script (owner decisions,
// 2026-09-24). Kanji is never limited; it lives in the chapter decks.
//
// A SOUND UNIT is what a reader has to recognise as one thing. A kana followed by a small ゃゅょ is
// one sound (にゃ, not に + ゃ), and so is a katakana followed by a small ァィゥェォ (ティ, ファ): the
// owner asked for the merging to be respected, because reading にゃ is a different skill from reading
// に. Small っ and ー are units of their own, since each changes how the word is read.

const HIRAGANA = /\p{Script=Hiragana}/u;
const KATAKANA = /\p{Script=Katakana}/u;
const YOON = new Set([..."ゃゅょゎャュョヮ"]);
const SMALL_VOWEL = new Set([..."ぁぃぅぇぉァィゥェォ"]);
const JOINS_PREVIOUS = (c) => YOON.has(c) || SMALL_VOWEL.has(c);
const isKana = (c) => HIRAGANA.test(c) || KATAKANA.test(c) || c === "ー";

/**
 * The sound units of a kana string, in order: `がっこう` is `["が", "っ", "こ", "う"]`, `コーヒー`
 * is `["コ", "ー", "ヒ", "ー"]`, `ティー` is `["ティ", "ー"]`. Anything that is not kana (a kanji,
 * punctuation, a space) is skipped.
 */
export function kanaUnits(text) {
  const units = [];
  for (const c of [...String(text ?? "").normalize("NFC")]) {
    if (!isKana(c)) continue;
    const last = units.length - 1;
    if (JOINS_PREVIOUS(c) && last >= 0 && !JOINS_PREVIOUS(units[last].at(-1))) {
      units[last] += c;
    } else {
      units.push(c);
    }
  }
  return units;
}

/**
 * Which budget a kana word counts against: `katakana` if it has any katakana, else `hiragana`. A mixed
 * word (アジアけんきゅう) goes to katakana, the scarcer of the two in a beginners' book.
 */
export function kanaScript(text) {
  return [...String(text ?? "")].some((c) => KATAKANA.test(c) && c !== "ー")
    ? "katakana"
    : "hiragana";
}

/**
 * Chooses the kana deck from `pool`: every kana-only word of the book, as `{ target, position, ... }`
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
export function selectKanaDeck(pool, { budgets, minPerUnit }) {
  const words = [];
  const seen = new Set();
  for (const entry of [...pool].sort((a, b) => a.position - b.position)) {
    if (seen.has(entry.target)) continue;
    seen.add(entry.target);
    const units = [...new Set(kanaUnits(entry.target))];
    if (units.length) words.push({ entry, units, script: kanaScript(entry.target) });
  }

  const inPool = new Map();
  for (const w of words) for (const u of w.units) inPool.set(u, (inPool.get(u) ?? 0) + 1);
  const need = (u) => Math.min(minPerUnit, inPool.get(u));
  const covered = new Map();
  const chosen = new Set();
  const used = { hiragana: 0, katakana: 0 };
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

  const unselected = [];
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
