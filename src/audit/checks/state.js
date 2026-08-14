import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { defineCheck } from "../registry.js";
import { collectionState, unitState } from "../state.js";

/**
 * MAKE THE INVISIBLE STATES VISIBLE.
 *
 * Three things about a collection are true on disk right now, matter, and were reported by nothing:
 *
 *   1. a unit can be DONE without ever having run the passes the readiness gate exists to require
 *      (two of the three shipped course lessons carry no pass markers at all — legitimately, they
 *      were signed off before the markers existed, and removing the carve-out would retroactively
 *      unreview finished work). The carve-outs stay. Being unable to name them does not;
 *   2. a unit's own metadata can disagree with the collection it is sitting in (one live lesson
 *      carries a `courseSlug` from a different course entirely);
 *   3. `corpus.json` and `cards.json` can drift apart — an id in one and not the other, a different
 *      relative order, an exclusion applied to one and not mirrored into the other.
 *
 * All three are INFO. None of them is a reason to refuse to hand over a review link; every one of
 * them is something the operator should be able to see without going and looking.
 *
 * ⚠️ ISOLATION (CLAUDE.md golden rule 7). The unit/marker check compares a unit's own metadata to
 * ITS OWN collection's marker — the `book.json` / `course.json` sitting in the directory above it —
 * and to nothing else. It never reads a second collection to find out whether a slug "belongs"
 * somewhere, and a foreign-looking slug is reported as a disagreement with THIS collection, not as a
 * match against another one.
 */

/** The collection's own marker (`book.json` for a book, `course.json` for a course), or null. */
function readCollectionMarker(collection) {
  for (const name of ["book.json", "course.json"]) {
    const path = join(collection.dir, name);
    if (!existsSync(path)) continue;
    try {
      return { name, data: JSON.parse(readFileSync(path, "utf-8")) };
    } catch (error) {
      return { name, data: null, error: error.message };
    }
  }
  return null;
}

export const readinessExemptionsCheck = defineCheck({
  id: "readiness-exemptions",
  title: "readiness exemptions",
  scope: "collection",
  tier: "INFO",
  /**
   * Which done units were signed off WITHOUT the pre-review passes recorded, and which ran a pass
   * against an incomplete view of the book.
   *
   * `lessonReadiness` waives the gate for anything already `reviewed` — deliberately, so tightening
   * the rule cannot retroactively unreview signed-off work. That waiver is correct and permanent.
   * The consequence is that "this unit ran the drill and cross-lesson passes" and "this unit was
   * reviewed before those passes existed" are the same picture on disk. This names the second group.
   */
  appliesTo: (collection) => collection.kind !== "template",
  run({ units }) {
    const notes = [];
    const exempt = [];
    const degraded = [];
    for (const unit of units) {
      const meta = unit.meta ?? {};
      if (!meta.done) continue;
      const missing = ["enriched", "notesEnhanced"].filter((key) => meta[key] !== true);
      if (missing.length) exempt.push(`${unit.name} (no ${missing.join(", ")})`);
      if (meta.prepareDegraded) degraded.push(unit.name);
    }
    if (exempt.length) {
      notes.push(
        `${exempt.length} done unit(s) carry no record of the pre-review passes: ${exempt.join(", ")}`,
        `They were signed off before those markers existed. The readiness gate waives an already-` +
          `reviewed unit on purpose, so this is permanent and expected — it is listed so the exemption ` +
          `is a known set rather than an invisible one.`,
      );
    }
    if (degraded.length) {
      notes.push(
        `${degraded.length} unit(s) carry meta.prepareDegraded — a pass ran against an incomplete ` +
          `view of the collection: ${degraded.join(", ")}`,
      );
    }
    return {
      notes,
      summary: exempt.length
        ? `${exempt.length} readiness exemption(s), ${degraded.length} degraded`
        : "every done unit records its passes",
    };
  },
});

export const unitMarkerCheck = defineCheck({
  id: "unit-marker",
  title: "unit vs marker",
  scope: "collection",
  tier: "INFO",
  /**
   * A unit's `epubHash` / `courseSlug` against the marker of the collection it is IN.
   *
   * These are provenance: they say which book or course the unit was assembled from, and four
   * subsystems resolve a cached artifact through them. A unit whose provenance names a different
   * source than its own directory's marker is either a run dir reused across collections or a
   * hand-copied unit, and either way the dedup library and chapter cache it reads are not this
   * collection's.
   *
   * Live instance at the time this landed: `lesson-0` of `nihongo-101-course-n5` carries
   * `courseSlug: "intensive-japanese-1"`.
   *
   * Absence is not disagreement. An `-extras` unit legitimately carries no `epubHash` (it is
   * hand-authored drills, not extracted material), and only a value that CONTRADICTS the marker is
   * reported.
   */
  appliesTo: (collection) => collection.kind === "epub" || collection.kind === "course",
  run({ collection, units }) {
    const marker = readCollectionMarker(collection);
    if (!marker) return { skipped: "this collection has no book.json / course.json marker" };
    if (!marker.data) {
      return {
        notes: [`${marker.name} will not parse (${marker.error}) — provenance cannot be checked`],
        summary: "marker unreadable",
      };
    }

    const expected =
      collection.kind === "epub"
        ? { field: "epubHash", value: marker.data.epubHash }
        : { field: "courseSlug", value: marker.data.slug ?? collection.slug };
    const notes = [];
    for (const unit of units) {
      const declared = unit.meta?.[expected.field];
      if (declared === undefined || declared === null) continue;
      if (expected.value && declared !== expected.value) {
        notes.push(
          `${unit.name} declares ${expected.field} "${declared}" but sits in a collection whose ` +
            `${marker.name} says "${expected.value}" — its cached artifacts are another ` +
            `collection's`,
        );
      }
    }

    // Lesson NUMBER gaps, for a manual course only. For an EPUB book `chapterNumber` is a spine
    // index and gaps are the normal shape of a book (front matter, quizzes, dividers), so reporting
    // them there would be pure noise — see the invariant in ../units.js.
    if (collection.kind === "course") {
      const numbers = [
        ...new Set(
          units
            .filter((unit) => !unit.extras && typeof unit.meta?.chapterNumber === "number")
            .map((unit) => unit.meta.chapterNumber),
        ),
      ].sort((a, b) => a - b);
      const gaps = [];
      for (let n = numbers[0]; n < numbers[numbers.length - 1]; n++) {
        if (!numbers.includes(n)) gaps.push(n);
      }
      if (gaps.length) {
        notes.push(`lesson number(s) ${gaps.join(", ")} are missing from this course's sequence`);
      }
    }

    return {
      notes,
      summary: notes.length ? `${notes.length} disagreement(s)` : "provenance agrees",
    };
  },
});

export const corpusDriftCheck = defineCheck({
  id: "corpus-drift",
  title: "corpus drift",
  scope: "unit",
  tier: "INFO",
  /**
   * `corpus.json` against `cards.json`, in the one direction that means something is missing.
   *
   * `cards.json` legitimately holds ids the corpus does not: the drill cards the enrichment pass
   * mines are authored straight into it. The reverse is a loss — a corpus item that never became a
   * card, or a card deleted from one file and not the other. Live at the time this landed:
   * `chapter-6` carries `grammar-party-ni-e` in its corpus and nowhere else.
   *
   * Also checked: the two files' RELATIVE order of their shared ids (`extras-order.mjs` writes both
   * to keep the review and the deck agreeing, and a hand edit to one of them silently breaks that),
   * and whether an exclusion applied in one file is mirrored in the other.
   */
  run({ unit }) {
    if (!unit.files["corpus.json"].present) return { skipped: "no corpus.json in this unit" };
    const corpusItems = Array.isArray(unit.corpus?.items) ? unit.corpus.items : [];
    if (!corpusItems.length) return { skipped: "corpus.json holds no items" };

    const cardById = new Map(unit.items.map((item) => [item.id, item]));
    const notes = [];

    const missing = corpusItems.filter((item) => !cardById.has(item.id)).map((item) => item.id);
    if (missing.length) {
      notes.push(
        `${missing.length} corpus id(s) have no card: ${missing.join(", ")} — an item that never ` +
          `became a card, or a card deleted from one file only`,
      );
    }

    const sharedInCards = unit.items
      .filter((item) => corpusItems.some((c) => c.id === item.id))
      .map((item) => item.id);
    const sharedInCorpus = corpusItems.filter((item) => cardById.has(item.id)).map((c) => c.id);
    if (sharedInCards.join("") !== sharedInCorpus.join("")) {
      notes.push(
        `cards.json and corpus.json list their shared ids in a different order — the review and the ` +
          `deck disagree about what comes next (extras-order.mjs writes both together)`,
      );
    }

    const unmirrored = corpusItems
      .filter((item) => {
        const cardItem = cardById.get(item.id);
        return cardItem && Boolean(cardItem.excluded) !== Boolean(item.excluded);
      })
      .map((item) => item.id);
    if (unmirrored.length) {
      notes.push(
        `${unmirrored.length} exclusion(s) are not mirrored between the two files: ` +
          `${unmirrored.join(", ")}`,
      );
    }

    return {
      notes,
      summary: notes.length ? `${notes.length} drift(s)` : "corpus and cards agree",
    };
  },
});

export const guidNamespaceCheck = defineCheck({
  id: "guid-namespace",
  title: "guid namespace",
  scope: "collection",
  tier: "INFO",
  /**
   * Whether THIS collection's package writes namespaced note guids, and what follows if it does not.
   *
   * A note's guid is how Anki decides, at import, whether it already has this note — and it matches
   * guids COLLECTION-wide, across every deck. A package that ships bare card ids as guids therefore
   * reaches beyond its own deck: import it into an Anki collection that already holds another
   * bare-guid deck and any shared id lands on the other deck's note.
   *
   * ⚠️ ISOLATION. This reads ONE collection's marker and reports one property of it. It does not
   * look at any other collection's ids, and it must not: whether this package is namespaced is a
   * fact about this package alone. The rule for the un-namespaced case is a RUNBOOK rule for the
   * human doing the importing, not a comparison for a checker to run.
   *
   * New collections get a namespace at creation, from their immutable slug (a rename must never
   * change a guid — that would orphan the live scheduling of every card). The two collections
   * delivered before that existed keep bare guids on purpose: changing them now would make every
   * note look new.
   */
  run({ collection }) {
    const marker = readCollectionMarker(collection);
    const namespace = marker?.data?.guidNamespace ?? null;
    if (namespace) {
      return { summary: `namespaced ("${namespace}/<card id>")` };
    }
    return {
      notes: [
        `this package writes BARE card ids as note guids, and Anki matches guids collection-wide. ` +
          `Never .apkg-import it into an Anki collection that already holds another bare-guid deck ` +
          `from this tool — a shared card id would overwrite that deck's note. Delivering over ` +
          `AnkiConnect is unaffected (it is deck-scoped and matches by abid: tag).`,
      ],
      summary: "bare guids",
    };
  },
});

export const collectionStateCheck = defineCheck({
  id: "collection-state",
  title: "state",
  scope: "collection",
  tier: "INFO",
  /**
   * The five states, printed. This is the line that makes `delivered` visible: it is the state the
   * "never damage the user's scheduling" rule is about, and before `src/audit/state.js` no report
   * said it out loud.
   */
  run({ collection, units }) {
    const state = collectionState(collection.dir);
    const flags = ["authored", "reviewed", "done", "packaged", "delivered"]
      .map((key) => `${state[key] ? "✓" : "·"} ${key}`)
      .join("   ");
    const notes = [flags];
    if (state.markerUnreadable) {
      notes.push(
        `⚠ ${collection.dir}'s delivered marker will not parse — whether these cards are live in ` +
          `Anki is currently unknowable`,
      );
    }
    if (state.delivered) {
      const deliveredUnits = units.filter(
        (unit) => unitState(unit.dir, { collection: state }).delivered,
      );
      notes.push(
        `${deliveredUnits.length} of ${units.length} unit(s) are in the live collection — a write ` +
          `here needs --force-delivered`,
      );
    }
    return { notes, summary: state.delivered ? "DELIVERED" : "not delivered" };
  },
});
