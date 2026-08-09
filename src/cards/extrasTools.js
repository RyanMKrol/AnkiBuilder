import { createHash } from "crypto";

// Deterministic tooling behind the extras pass's three mechanical audits (see
// .claude/skills/build-anki-deck/references/extras-pass.md): the cross-chapter duplicate check,
// the deck-wide collision audit, and the seeded-shuffle + hoist-foundations ordering. These were
// prose procedures an agent re-derived per chapter — every one a chance to get them subtly wrong.
// Pure functions here; the scripts/ wrappers do the file IO.

const normalizeEnglish = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[.?!。]+$/u, "")
    .trim();

const normalizeTarget = (value) => String(value || "").trim();

/**
 * Cross-chapter duplicate check. `units` is `[{ unit, label, reviewed, done, items }]` in BOOK
 * order (earliest first; a lesson before its extras). Groups every non-excluded card in the book
 * by target; any group spanning more than one unit is a duplicate set — the earliest occurrence
 * is the keeper, every later one a candidate for exclusion.
 *
 * Question-vs-answer safety is reported, not decided: excluding an ANSWER is always safe (a
 * question card stands alone), while excluding a QUESTION strands any elliptical answer whose
 * hint names it — so each duplicate carries `isQuestion` and the caller warns before applying.
 */
export function findCrossChapterDuplicates(units) {
  const byTarget = new Map();
  units.forEach((unit, unitIndex) => {
    for (const item of unit.items) {
      if (item.excluded || !item.target) continue;
      const key = normalizeTarget(item.target);
      if (!key) continue;
      if (!byTarget.has(key)) byTarget.set(key, []);
      byTarget.get(key).push({ unitIndex, unit: unit.unit, label: unit.label, item });
    }
  });

  const groups = [];
  for (const [target, occurrences] of byTarget) {
    const unitCount = new Set(occurrences.map((o) => o.unit)).size;
    if (unitCount < 2) continue;
    const [keeper, ...duplicates] = occurrences; // book order — earliest wins
    groups.push({
      target,
      keeper: { unit: keeper.unit, id: keeper.item.id, english: keeper.item.english },
      duplicates: duplicates.map((o) => ({
        unit: o.unit,
        id: o.item.id,
        english: o.item.english,
        reviewed: units[o.unitIndex].reviewed,
        done: units[o.unitIndex].done,
        isQuestion: /[?？]\s*$/.test(o.item.english || "") || /か$/.test(o.item.target || ""),
      })),
    });
  }
  return groups;
}

/**
 * Deck-wide collision audit: groups whose shared face has more than one distinct answer, so each
 * member needs a `hint` to stay studiable. Two directions: same English gloss with different
 * targets (a Production card's face), and same target with different glosses (Recognition).
 * Report-only by design — pre-existing collisions on signed-off cards are for a human to word.
 */
export function findCollisions(units) {
  const collect = (keyOf, valueOf) => {
    const map = new Map();
    for (const unit of units) {
      for (const item of unit.items) {
        if (item.excluded) continue;
        const key = keyOf(item);
        if (!key) continue;
        if (!map.has(key)) map.set(key, []);
        map.get(key).push({ unit: unit.unit, item });
      }
    }
    const collisions = [];
    for (const [key, members] of map) {
      const answers = new Set(members.map(({ item }) => valueOf(item)));
      if (answers.size < 2) continue;
      collisions.push({
        key,
        members: members.map(({ unit, item }) => ({
          unit,
          id: item.id,
          english: item.english,
          target: item.target,
          // Either cue disambiguates a colliding face: `hint` on the Production front, `scene` on
          // the front of both directions.
          hasHint:
            (typeof item.hint === "string" && item.hint.trim().length > 0) ||
            (typeof item.scene === "string" && item.scene.trim().length > 0),
        })),
      });
    }
    return collisions;
  };

  return {
    byEnglish: collect(
      (item) => normalizeEnglish(item.english),
      (item) => normalizeTarget(item.target),
    ),
    byTarget: collect(
      (item) => normalizeTarget(item.target),
      (item) => normalizeEnglish(item.english),
    ),
  };
}

// mulberry32 over a sha256-derived seed: stable across runs and platforms for the same string.
function seededRandom(seed) {
  let state = createHash("sha256").update(String(seed)).digest().readUInt32LE(0);
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A trailing bare particle makes a fragment prefix-match every sentence about its topic for a
// boring grammatical reason (ささきさんは) — such a card is fine, but it is not a foundation.
const TRAILING_PARTICLES = new Set(["は", "が", "を", "に", "で", "へ", "と", "も", "の", "か"]);

/**
 * The extras unit's shipping order: a SEEDED shuffle of the whole unit (cards come out of the
 * build grouped by how they were made, and neighbours leak answers), then the unit's foundations
 * hoisted to the front, shortest first (atoms before the molecules that contain them).
 *
 * A card is foundational when at least `minContainers` other cards' targets contain its target
 * verbatim — excluding elliptical answers (scene or hint starts with "answering": a reply, not a
 * building block) and fragments ending in a bare particle. A unit with no shared atoms hoists nothing.
 *
 * Pure: returns a NEW array; `seed` must be supplied by the caller (default it to something
 * stable like the unit folder name — an unseeded shuffle would re-order the deck every re-run,
 * and card order is what a fresh .apkg import turns into new-card position).
 */
export function orderExtrasUnit(items, { seed, minContainers = 2 } = {}) {
  if (seed == null) throw new Error("orderExtrasUnit requires a seed");
  const random = seededRandom(seed);

  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  const isFoundation = (item) => {
    const target = normalizeTarget(item.target);
    if (item.excluded || target.length < 2) return false;
    if (TRAILING_PARTICLES.has(target[target.length - 1])) return false;
    const cue = [item.scene, item.hint].find((v) => typeof v === "string" && v.trim());
    if (cue && /^answering\b/i.test(cue.trim())) return false;
    const containers = items.filter(
      (other) =>
        other !== item && !other.excluded && normalizeTarget(other.target).includes(target),
    );
    return containers.length >= minContainers;
  };

  const foundations = shuffled.filter(isFoundation);
  // Shortest first: the most atomic material leads, and a substring can never land after a card
  // that contains it.
  foundations.sort((a, b) => normalizeTarget(a.target).length - normalizeTarget(b.target).length);
  const rest = shuffled.filter((item) => !foundations.includes(item));
  return {
    items: [...foundations, ...rest],
    foundations: foundations.map((f) => ({ id: f.id, target: f.target })),
  };
}
