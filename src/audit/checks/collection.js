import { defineCheck } from "../registry.js";
import { validateCards, validateCorpus } from "../../model/index.js";
import { findCollisions, findCrossChapterDuplicates } from "../../cards/extrasTools.js";
import { assertUniqueCardIds } from "../../deck/shippableCards.js";
import { normalizeDisplayText, isSpaceFreeLanguage } from "../../model/scriptSpacing.js";
import { resolveIso639Code } from "../../model/iso639.js";
import { audioTextState } from "../../audio/textHash.js";
import { unitChapterNumber } from "../units.js";

// The checks that answer a question about ONE unit, or about one collection's units together.
// Everything here reads files preflight has already loaded; none of it writes.

const shipped = (unit) => unit.items.filter((item) => !item.excluded);

export const schemaCheck = defineCheck({
  id: "schema",
  title: "schema",
  scope: "unit",
  tier: "FAIL",
  // A hand-authored unit skips the assemble/translate stages that would otherwise shape its fields,
  // so a wrong field TYPE reaches the dashboard intact and only surfaces as "invalid card data
  // after edit" when a review gate is clicked.
  run({ unit }) {
    const findings = [];
    for (const [file, validate] of [
      ["cards.json", validateCards],
      ["corpus.json", validateCorpus],
    ]) {
      const entry = unit.files[file];
      if (!entry.present) continue;
      if (entry.error) {
        findings.push({ key: file, message: `${file} will not parse: ${entry.error}` });
        continue;
      }
      try {
        validate(entry.data);
      } catch (error) {
        findings.push({ key: file, message: `${file}: ${error.message}` });
      }
    }
    return { findings, summary: "valid" };
  },
});

export const cardIdsCheck = defineCheck({
  id: "card-ids",
  title: "card ids",
  scope: "collection",
  tier: "FAIL",
  // The one that used to surface only at Mark done, after the corpus and audio reviews were both
  // signed off — a card id becomes the Anki note guid, so a clash makes the build refuse to package
  // the deck at all. Checked across EVERY unit, not just done ones, so a clash is caught while the
  // new unit is still editable.
  run({ collection, units }) {
    try {
      assertUniqueCardIds(
        units.map((unit) => ({ label: unit.name, items: shipped(unit) })),
        collection.label,
      );
      return { findings: [], summary: `unique across ${units.length} unit(s)` };
    } catch (error) {
      return { findings: [{ key: "duplicate-ids", message: error.message }] };
    }
  },
});

export const collisionsCheck = defineCheck({
  id: "collisions",
  title: "collisions",
  scope: "collection",
  tier: "FAIL",
  // A shared face with two different answers is unstudiable without a cue. An English-gloss group
  // accepts a hint OR a scene; a target group needs a SCENE, because a hint renders on the back of a
  // Recognition card, after the learner has already answered. `hasCue` encodes that per group.
  run({ units }) {
    const { byEnglish, byTarget } = findCollisions(units.map(unitView));
    const uncued = [...byEnglish, ...byTarget].flatMap((group) =>
      group.members.filter((m) => !m.hasCue).map((m) => ({ ...m, key: group.key })),
    );
    return {
      findings: uncued.map((m) => ({
        key: `${m.unit}/${m.id}`,
        message: `${m.unit}/${m.id}  "${m.english}" / ${m.target} — no cue on the colliding face`,
      })),
      summary: "every member cued on the colliding face",
    };
  },
});

export const duplicatesCheck = defineCheck({
  id: "duplicates",
  title: "duplicates",
  scope: "collection",
  tier: "INFO",
  // Reported, never auto-applied: whether a pair is one word taught twice or two senses that share
  // a spelling is a judgment about the source material. See scripts/extras-duplicate-check.mjs.
  run({ units }) {
    const groups = findCrossChapterDuplicates(units.map(unitView));
    return {
      notes: groups.length
        ? [`${groups.length} target group(s) span units — review, don't auto-exclude`]
        : [],
      summary: `${groups.length} cross-unit target group(s)`,
    };
  },
});

export const spacingCheck = defineCheck({
  id: "spacing",
  title: "spacing",
  scope: "unit",
  tier: "FAIL",
  // For a space-free script (Japanese) a stored target must carry no editorial spaces and no
  // trailing 。. The pipeline normalizes during translate, so ONLY hand-authored units (extras) can
  // drift; chapter-13-extras shipped 66 spaced cards this way and rendered the 分かち書き word
  // separation the deck deliberately strips.
  run({ unit }) {
    const lang = unit.meta?.targetLanguage ?? "ja";
    if (!isSpaceFreeLanguage(lang)) return { findings: [], summary: `${lang}: not space-free` };
    const findings = [];
    for (const item of shipped(unit)) {
      for (const field of ["target", "ttsText"]) {
        const value = item[field];
        if (typeof value !== "string") continue;
        if (normalizeDisplayText(value, lang) !== value) {
          findings.push({
            key: `${item.id}.${field}`,
            message: `${unit.name}/${item.id}.${field} carries editorial spaces or a trailing 。`,
          });
        }
      }
    }
    return { findings, summary: "display text normalized for the script" };
  },
});

export const placeholderTargetCheck = defineCheck({
  id: "placeholder-target",
  title: "placeholder target",
  scope: "unit",
  tier: "FAIL",
  /**
   * A `〜` (or its halfwidth/ASCII cousins) in a SHIPPED target means the card's front is a
   * schematic pattern, not an utterance: the placeholder stands for a word the learner is supposed
   * to supply. Such a card has meaningless audio, unreadable romaji and an unanswerable Production
   * face, and the rule that it must never ship is stated as an absolute in the authoring prose and
   * enforced by nothing.
   *
   * Deliberately narrow. `〜` is perfectly legitimate in a `note` or a `scene` — that is how the
   * prose refers to a suffix ("attaches after a number, written 〜えん in the source"), and there
   * are ~30 such notes live. It is the TARGET, the thing the learner reads and the voice speaks,
   * that must be a real utterance.
   *
   * Green on live data at the time it landed: the one survivor (chapter-12
   * `dare-mo-masen-no-one`, `だれも…〜ません`) is already `excluded` with a review note explaining
   * why, so it does not ship. Excluded cards are out of scope for exactly that reason.
   */
  run({ unit }) {
    const findings = shipped(unit)
      .filter((item) => /[〜～~]/.test(item.target ?? ""))
      .map((item) => ({
        key: `${item.id}.target`,
        message: `${unit.name}/${item.id} ships a schematic target "${item.target}" — a placeholder is not an utterance`,
      }));
    return { findings, summary: "no placeholder targets shipped" };
  },
});

export const exclusionsCheck = defineCheck({
  id: "exclusions",
  title: "exclusions",
  scope: "collection",
  tier: "INFO",
  // An exclusion a script applied is a machine judgement, and the tools that make them
  // false-positive often enough that the set is worth re-reading; a human's reviewed decision is
  // not. Cards written before `excludedBy` existed report as unattributed, which is honest.
  run({ units }) {
    let total = 0;
    let unattributed = 0;
    const byScript = new Map();
    for (const unit of units) {
      for (const item of unit.items) {
        if (!item.excluded) continue;
        total++;
        if (!item.excludedBy) unattributed++;
        else if (item.excludedBy !== "human") {
          const key = `${unit.name} (${item.excludedBy})`;
          byScript.set(key, (byScript.get(key) ?? 0) + 1);
        }
      }
    }
    if (!total) return { summary: "no excluded cards" };
    const scripted = [...byScript.values()].reduce((n, c) => n + c, 0);
    return {
      notes: [
        `${total} excluded card(s): ${scripted} script-authored, ${unattributed} unattributed (pre-provenance or human)`,
        ...[...byScript].sort().map(([key, count]) => `${key}: ${count} — re-read before shipping`),
      ],
      summary: `${total} excluded`,
    };
  },
});

export const audioMarkerCheck = defineCheck({
  id: "audio-markers",
  title: "audio markers",
  scope: "collection",
  tier: "ACK",
  /**
   * A clip shipping with the TTS end marker still audible on the end of it.
   *
   * This was the report's other permanently non-zero line: "7 clip(s) flagged marker-audible",
   * printed before "preflight clean", every run, for months. All seven had in fact been fixed —
   * the flag described the take the audio stage produced rather than the hand cut that shipped —
   * and the count carried no information at all, which is exactly how a number becomes wallpaper.
   *
   * ACK rather than INFO now that it can go to zero: an unreviewed instance blocks, and the way to
   * clear it is to fix the clip (re-trim it in the dashboard, or run
   * `scripts/audit-marker-stuck.mjs --apply` if the flag is stale) or to say out loud that this one
   * is acceptable. ACK rather than FAIL because the detection is a heuristic with a real
   * false-positive rate, and a gate you have to override on a wrong answer is how a --force habit
   * starts. Green on live data the day it landed.
   */
  run({ units }) {
    const findings = units.flatMap((unit) =>
      shipped(unit)
        .filter((item) => item.audioMarkerStuck)
        .map((item) => ({
          key: `${unit.name}/${item.id}`,
          message: `${unit.name}/${item.id} ships a clip with the TTS end marker audible — re-trim it, or accept it`,
        })),
    );
    return { findings, summary: "no clip ships an audible end marker" };
  },
});

export const audioTextHashCheck = defineCheck({
  id: "audio-text-hash",
  title: "audio text hash",
  scope: "collection",
  tier: "INFO",
  /**
   * How many shipping clips still speak their card's text — and how many nobody can tell about.
   *
   * INFO on purpose, and the plan's own ruling says why: `handleLessonDone` has no gate of any kind
   * today, and a hash mismatch has no exit that does not destroy a reviewer's hand trim or hand
   * pick. A block here would be the first ever on the owner's daily path, and the only way to clear
   * it would be to throw away the work it exists to protect. So it counts, publicly, and the
   * decision about promoting it is made against a measured number rather than a guess.
   *
   * `unverifiable` is a first-class outcome, not a failure: a Replace upload and the hand-named
   * legacy takes carry no text hash in their names, and inventing one from the card's current text
   * would certify exactly the drift this measures.
   */
  run({ units }) {
    const tally = { current: 0, stale: 0, unverifiable: 0 };
    const stale = [];
    for (const unit of units) {
      const kanjiTts = unit.meta?.kanjiTts === true;
      const lang = resolveIso639Code(unit.meta?.targetLanguage);
      for (const item of shipped(unit)) {
        const { state } = audioTextState(item, lang, { kanjiTts });
        if (state === "none") continue;
        tally[state] = (tally[state] ?? 0) + 1;
        if (state === "stale") stale.push(`${unit.name}/${item.id}`);
      }
    }
    const total = tally.current + tally.stale + tally.unverifiable;
    if (!total) return { summary: "no audio-bearing cards" };
    return {
      notes: [
        `${tally.current} clip(s) match their card's text, ${tally.stale} changed since, ` +
          `${tally.unverifiable} unverifiable (no text hash in the take's name)`,
        ...(stale.length ? [`text changed under: ${stale.join(", ")}`] : []),
      ],
      summary: `${tally.stale} stale of ${total}`,
    };
  },
});

export const chapterNumberCheck = defineCheck({
  id: "chapter-number",
  title: "chapter numbers",
  scope: "collection",
  tier: "FAIL",
  appliesTo: (collection) => collection.kind === "epub" || collection.kind === "course",
  /**
   * Pins the `chapterNumber` invariant documented in ../units.js: it is the lesson's FIRST spine
   * index, it is the join key four subsystems resolve through, and a unit shares it with its
   * `-extras` sibling. Three things are actually checkable on disk:
   *
   *  1. every unit that names a chapter names it as a NUMBER (a string "33" would key a different
   *     library path and match no run dir);
   *  2. `lastChapterNumber`, when present, is not BEFORE `chapterNumber` — an inverted range is the
   *     silent-degradation shape the EPUB probe found in the wild;
   *  3. two BASE units never claim the same chapter. A base unit and its own extras sharing one is
   *     the invariant; two chapters sharing one means a run dir was reused for the wrong chapter,
   *     and the dedup library then holds one entry for what the book treats as two lessons.
   */
  run({ units }) {
    const findings = [];
    const byNumber = new Map();
    for (const unit of units) {
      const raw = unit.meta?.chapterNumber;
      if (raw === undefined || raw === null) continue;
      const number = unitChapterNumber(unit.meta);
      if (number === null) {
        findings.push({
          key: `${unit.name}/chapterNumber-type`,
          message: `${unit.name} has a non-numeric chapterNumber (${JSON.stringify(raw)}) — it is a join key, not a label`,
        });
        continue;
      }
      const last = unit.meta?.lastChapterNumber;
      if (typeof last === "number" && last < number) {
        findings.push({
          key: `${unit.name}/inverted-range`,
          message: `${unit.name} spans ${number}..${last}, which runs backwards`,
        });
      }
      if (!unit.extras) {
        if (byNumber.has(number)) {
          findings.push({
            key: `${unit.name}/shared-with-${byNumber.get(number)}`,
            message:
              `${unit.name} and ${byNumber.get(number)} both claim chapterNumber ${number}. ` +
              `Only a unit and its own -extras may share one — two base units sharing it means they ` +
              `share a dedup-library entry and an extracted-chapter cache entry.`,
          });
        } else {
          byNumber.set(number, unit.name);
        }
      }
    }
    return { findings, summary: `${byNumber.size} chapter number(s), no clashes` };
  },
});

/** The shape `src/cards/extrasTools.js` expects: `{ unit, label, reviewed, done, items }`. */
function unitView(unit) {
  return {
    unit: unit.name,
    label: unit.label,
    reviewed: Boolean(unit.meta?.reviewed),
    done: Boolean(unit.meta?.done),
    items: unit.items,
  };
}
