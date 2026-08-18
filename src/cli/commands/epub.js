// The `epub` command: book-level maintenance that is not a build. Two subcommands: `cache`,
// which reports what a book has cached and clears the parts that are rebuildable, and
// `taught-index`, which builds the book's once-per-book taught-content index.
//
// This exists because every parser and prompt fix in this tool is INERT for a book that has
// already been read once: a cached chapter file is treated as a complete extraction forever,
// and conventions.md / taught-index.json are written once and never re-derived. Until now the
// only way to force a re-derive was an improvised `rm -rf` inside `.anki-builder/epubs/<hash>/`
// — directly beside `corpora/`, the human-reviewed dedup registry that no amount of compute
// can rebuild.

import { existsSync } from "fs";

const CACHE_KIND_FLAGS = ["chapters", "conventions", "taught-index"];

const USAGE =
  "usage: anki-builder epub cache <hash> [--clear] [--chapters] [--conventions] [--taught-index] [--dry]\n" +
  "       anki-builder epub taught-index <hash> [--lang <lang>] [--force]";

function formatStamp(stamp) {
  return stamp ? stamp.replace("T", " ").slice(0, 19) : "unknown";
}

function printCache(cache, log) {
  if (!cache.registered) {
    log(`book ${cache.epubHash} is not registered in the library — nothing cached`);
    return;
  }
  log(`book ${cache.epubHash} (${cache.dir})`);
  log(`  cache version: v${cache.cacheVersion}`);
  log(
    cache.chapters.present
      ? `  chapters: ${cache.chapters.files} file(s), newest ${formatStamp(cache.chapters.generatedAt)}`
      : "  chapters: none extracted yet",
  );
  log(
    cache.conventions.present
      ? `  conventions.md: generated ${formatStamp(cache.conventions.generatedAt)} (paid pass)`
      : "  conventions.md: not generated",
  );
  log(
    cache.taughtIndex.present
      ? `  taught-index.json: generated ${formatStamp(cache.taughtIndex.generatedAt)} (paid pass)`
      : "  taught-index.json: not generated",
  );
  log(`  reviewed corpora: ${cache.reviewedCorpora} chapter(s) — never cleared by this command`);
  if (cache.staleRoots.length) {
    log(`  stale extraction roots from an older cache version: ${cache.staleRoots.join(", ")}`);
  }
  // Stated rather than implied: a timestamp is the ONLY provenance the paid artifacts carry.
  log("  (no artifact records which prompt version produced it — the timestamp is all there is)");
}

/**
 * `epub taught-index <hash>` — build the book's taught-content index, ONCE, deliberately.
 *
 * This used to happen inside whichever lesson build needed it first: a model pass over every
 * chapter of the book, fired unannounced in the middle of building one lesson. On a 57-chapter
 * book that is the single most expensive thing a build can do, and when it exhausted the usage
 * window it took the rest of that lesson's passes down with it. So it is its own command now:
 * the index is READ by a build and BUILT only here.
 */
async function runTaughtIndex(flags, ctx) {
  const hash = flags._[1] || flags.hash || null;
  if (!hash) {
    throw new Error(
      "epub taught-index needs a book hash: anki-builder epub taught-index <hash> " +
        "(the hash is the directory name under .anki-builder/epubs/)",
    );
  }

  const cache = ctx.describeBookCache(hash);
  if (!cache.registered) {
    throw new Error(
      `book ${hash} is not registered in the library — assemble one lesson of it first, ` +
        `which is what copies the .epub in and gives it a hash`,
    );
  }
  if (cache.taughtIndex.present && !flags.force) {
    ctx.log(
      `book ${hash} already has a taught index (generated ${formatStamp(cache.taughtIndex.generatedAt)}). ` +
        `Rebuilding costs another whole-book model pass — pass --force to do it anyway, or ` +
        `"epub cache ${hash} --clear --taught-index" to drop it first.`,
    );
    return;
  }

  const epubPath = ctx.libraryEpubPath(hash);
  if (!existsSync(epubPath)) {
    throw new Error(
      `no book.epub for ${hash} at ${epubPath} — re-assemble this book once with --epub`,
    );
  }

  // The language the index is written in the terms of. Recorded on the book when it was first
  // assembled, so it only has to be passed for a book that predates that record.
  const targetLanguage = flags.lang || ctx.loadBookMeta(hash)?.targetLanguage || null;
  if (!targetLanguage) {
    throw new Error(
      `this book records no target language — pass --lang <lang> (the same one its lessons are built in)`,
    );
  }

  ctx.log(
    `building the taught index for ${hash} (${targetLanguage}) — one model pass over the whole book, ` +
      `and the only time this book pays for it`,
  );
  const { path, chapterCount } = ctx.buildTaughtIndex({
    epubPath,
    targetLanguage,
    log: ctx.log,
  });
  ctx.log(`taught index: ${chapterCount} chapter(s) indexed -> ${path}`);
  ctx.log(
    "every later lesson of this book now consults it instead of re-reading the chapters after it",
  );
}

export async function runEpub(flags, ctx) {
  const [subcommand] = flags._ || [];
  if (subcommand === "taught-index") {
    return runTaughtIndex(flags, ctx);
  }
  if (subcommand !== "cache") {
    throw new Error(`unknown epub subcommand: ${subcommand ?? "(none)"}. ${USAGE}`);
  }

  // The hash can arrive either as a positional or as --clear's value, since both readings of
  // `epub cache --clear <hash>` are natural.
  const hash =
    flags._[1] || (typeof flags.clear === "string" ? flags.clear : null) || flags.hash || null;
  if (!hash) {
    throw new Error(
      "epub cache needs a book hash: anki-builder epub cache <hash> [--clear] " +
        "(the hash is the directory name under .anki-builder/epubs/)",
    );
  }

  const cache = ctx.describeBookCache(hash);
  printCache(cache, ctx.log);

  if (!flags.clear) {
    return;
  }

  const kinds = CACHE_KIND_FLAGS.filter((kind) => flags[kind]);
  // Chapters are a free zip inflate; the other two cost a paid whole-book pass to rebuild, so
  // they are never included unless named.
  const selected = kinds.length ? kinds : ["chapters"];

  const removed = ctx.clearBookCache(hash, { kinds: selected, dryRun: Boolean(flags.dry) });
  if (removed.length === 0) {
    ctx.log(`nothing to clear for ${selected.join(", ")}`);
    return;
  }
  for (const path of removed) {
    ctx.log(`${flags.dry ? "would remove" : "removed"}  ${path}`);
  }
  ctx.log(
    `${flags.dry ? "would clear" : "cleared"} ${selected.join(", ")} — corpora/ untouched ` +
      `(${cache.reviewedCorpora} reviewed chapter(s))`,
  );
}
