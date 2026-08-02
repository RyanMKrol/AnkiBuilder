// Helpers shared by more than one CLI command. Everything here used to live in
// src/cli/index.js and moved out verbatim when the per-command modules were split
// into src/cli/commands/, so no command has to duplicate another command's logic.
import { readFileSync } from "fs";
import { basename, dirname, resolve } from "path";
import { writeFileAtomic } from "../../util/atomicWrite.js";

export function readJson(path) {
  return JSON.parse(readFileSync(path, "utf-8"));
}

export function writeJson(path, obj) {
  writeFileAtomic(path, JSON.stringify(obj, null, 2));
}

/**
 * Where a run directory sits among its book's other lessons, and whether the passes that read those
 * lessons can actually see what they need.
 *
 * This is a status, not just a vocabulary string, because "no earlier lessons" has two completely
 * different meanings and they used to collapse into one. Lesson 1 of a book genuinely has no
 * predecessors. Lesson 8 whose earlier lessons stopped at `corpus.json` has seven — it just can't
 * see them. Both used to read as "first", so lesson 8 was silently built as though it opened the
 * book, and the enrichment markers then froze that in.
 *
 *   `unknown`  — can't place this lesson at all (no readable deck dir, no usable chapter number).
 *                A bare `--run`, a template, a first-ever chapter whose book dir doesn't exist yet.
 *   `first`    — genuinely the first lesson: no siblings other than this one.
 *   `ok`       — every earlier sibling is prepared and readable.
 *   `degraded` — earlier siblings exist but have no cards.json, so they are invisible to the passes.
 *
 * `vocab` is the drill pass's allowed-vocabulary grounding, built from the earlier lessons that ARE
 * readable; `unreviewed` is what the assemble-time ordering warning reports on.
 */
export function lessonOrderContext({ deckDir, unitName, ownNumber, ctx }) {
  let siblings;
  try {
    siblings = ctx.lessonSiblings(deckDir);
  } catch {
    return { status: "unknown", earlier: [], missing: [], unreviewed: [], vocab: null };
  }

  const others = siblings.filter((unit) => unit.name !== unitName);
  if (others.length === 0) {
    return { status: "first", earlier: [], missing: [], unreviewed: [], vocab: null };
  }
  if (!Number.isFinite(ownNumber)) {
    return { status: "unknown", earlier: [], missing: [], unreviewed: [], vocab: null };
  }

  const earlier = others.filter((unit) => unit.number < ownNumber);
  const missing = earlier.filter((unit) => !unit.hasCards);
  // `data` is belt-and-braces: lessonSiblings always sets it alongside hasCards, but a unit that
  // somehow arrives without it must be treated as unreadable rather than crash a different lesson.
  const readable = earlier.filter((unit) => unit.hasCards && unit.data);
  const unreviewed = earlier.filter((unit) => !unit.reviewed);

  const status = missing.length > 0 ? "degraded" : earlier.length > 0 ? "ok" : "first";
  const vocab = readable.length
    ? readable
        .map((unit) => {
          const lines = unit.data.items
            .filter((item) => !item.excluded)
            .map((item) => `- ${item.english} — ${item.target}`)
            .join("\n");
          return `### ${unit.label}\n\n${lines}`;
        })
        .join("\n\n")
    : null;

  return { status, earlier, missing, unreviewed, vocab };
}

/** `lessonOrderContext` for a run directory: the unit is the folder, the deck its parent. */
export function runDirOrderContext(runDir, ownNumber, ctx) {
  const absolute = resolve(runDir);
  return lessonOrderContext({
    deckDir: dirname(absolute),
    unitName: basename(absolute),
    ownNumber,
    ctx,
  });
}
