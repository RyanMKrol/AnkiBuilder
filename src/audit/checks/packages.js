import { existsSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { defineCheck } from "../registry.js";
import { deckFileNameForDir, resolveDeckPathForDir } from "../../deck/deckFileName.js";

// The two checks about the `.apkg` on disk: is it the RIGHT one, and is it CURRENT.

export const strayPackageCheck = defineCheck({
  id: "stray-package",
  title: "packages",
  scope: "collection",
  tier: "FAIL",
  /**
   * A collection directory holds exactly one package, and it is the one `deckFileNameForDir`
   * computes for it.
   *
   * Package names are derived from the directory PATH alone, by both the writer and every reader,
   * precisely so the two cannot disagree. That guarantee is worth nothing if a SECOND, foreign
   * package is sitting in the folder: `resolveDeckPathForDir` picks the right one, but a human
   * opening the folder to import a deck picks whichever name they recognise. Live at the time this
   * landed: an 11 MB `japanese-for-busy-people-book-1-kana.apkg` inside
   * `output/courses/nihongo-101-course-n5/`, dated three weeks before the course's own package.
   * Importing it while meaning to import the course would have merged a book's 2,000 bare-guid
   * notes into the collection.
   *
   * `deck.apkg` is tolerated: it is the pre-rename name, `resolveDeckPathForDir` still reads it,
   * and renaming it is a migration, not a preflight's business.
   */
  run({ collection }) {
    const expected = deckFileNameForDir(collection.dir);
    const strays = readdirSync(collection.dir)
      .filter((name) => name.endsWith(".apkg"))
      .filter((name) => name !== expected && name !== "deck.apkg");
    return {
      findings: strays.map((name) => ({
        key: `stray/${name}`,
        message:
          `${join(collection.dir, name)} is not this collection's package (expected ${expected}). ` +
          `A foreign .apkg in a deck folder is one mis-click away from being imported into the live ` +
          `collection. Delete it, or move it to where it belongs.`,
      })),
      summary: `${expected}`,
    };
  },
});

export const packageFreshnessCheck = defineCheck({
  id: "package-freshness",
  title: "package freshness",
  scope: "collection",
  tier: "FAIL",
  /**
   * FAIL when a done unit's `cards.json` is newer than the collection's built package.
   *
   * The package is what gets imported, and nothing else on disk says whether it still matches the
   * cards it was built from. The dashboard rebuilds the group package at Mark done — and ONLY at
   * Mark done: `rebuildGroupQuiet` has exactly one caller (`handleLessonDone` in
   * src/server/index.js). Two comments used to claim that an exclude or audio edit on an
   * already-done lesson rebuilt too; they were wrong, and they were in the two files a maintainer
   * would trust. They are corrected, and this check is what actually reports the staleness they
   * promised away.
   *
   * "Fresh" means REBUILT FROM THE CURRENT `cards.json` — not "identical to what is in Anki". Once
   * per-card direction suspension exists (WS4 item 6) the package deliberately stops reproducing
   * the delivered deck card-for-card, and that is not staleness.
   *
   * Compares modification times, which is the only signal available without unpacking and diffing
   * the package. That has one honest weakness: anything that rewrites a `cards.json` byte-identically
   * (a checkout, a restore from backup) trips it. The remedy is the same either way — rebuild, which
   * is cheap and idempotent — so a false positive costs one command and never a wrong belief.
   */
  run({ collection, units }) {
    // A template deck has no `done` gate — its single unit is packaged by `deck --run`, so its own
    // unit is always the input the package has to keep up with.
    const done = collection.kind === "template" ? units : units.filter((unit) => unit.meta?.done);
    if (done.length === 0) return { skipped: "no done units — nothing should be packaged yet" };

    const packagePath = resolveDeckPathForDir(collection.dir);
    if (!existsSync(packagePath)) {
      // A template deck has no `done` gate, so "no package" means "never built", which is a
      // perfectly ordinary state for a template that was assembled but not yet packaged. For a book
      // or a course, `done` is the human's statement that the lesson ships — so a missing package
      // there means something they believe is shipping is not.
      if (collection.kind === "template") {
        return { skipped: "no package built for this template yet" };
      }
      return {
        findings: [
          {
            key: "missing-package",
            message:
              `${done.length} unit(s) are marked done but ${packagePath} does not exist. ` +
              `Rebuild: ${rebuildCommand(collection)}`,
          },
        ],
      };
    }

    const packageTime = statSync(packagePath).mtimeMs;
    const stale = [];
    for (const unit of done) {
      const cardsPath = unit.files["cards.json"];
      if (!cardsPath?.present) continue;
      const cardsTime = statSync(cardsPath.path).mtimeMs;
      if (cardsTime > packageTime) {
        stale.push({ name: unit.name, cardsTime });
      }
    }

    if (!stale.length) {
      return { findings: [], summary: `${done.length} done unit(s), package current` };
    }

    return {
      findings: [
        {
          key: "stale-package",
          message:
            `${packagePath} (${new Date(packageTime).toISOString()}) is older than ` +
            `${stale.length} done unit(s): ${stale.map((s) => s.name).join(", ")}. ` +
            `The shipping package does not contain those edits. Rebuild: ${rebuildCommand(collection)}`,
        },
      ],
    };
  },
});

/** The command that rebuilds this collection's package, which differs by kind. */
function rebuildCommand(collection) {
  return collection.kind === "template"
    ? `node src/cli/bin.js deck --run ${collection.dir}`
    : `node src/cli/bin.js deck --book-dir ${collection.dir}`;
}
