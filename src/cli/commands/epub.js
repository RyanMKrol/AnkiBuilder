// The `epub` command: book-level maintenance that is not a build. Today that is one
// subcommand, `cache`, which reports what a book has cached and clears the parts that are
// rebuildable.
//
// This exists because every parser and prompt fix in this tool is INERT for a book that has
// already been read once: a cached chapter file is treated as a complete extraction forever,
// and conventions.md / taught-index.json are written once and never re-derived. Until now the
// only way to force a re-derive was an improvised `rm -rf` inside `.anki-builder/epubs/<hash>/`
// — directly beside `corpora/`, the human-reviewed dedup registry that no amount of compute
// can rebuild.

const CACHE_KIND_FLAGS = ["chapters", "conventions", "taught-index"];

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

export async function runEpub(flags, ctx) {
  const [subcommand] = flags._ || [];
  if (subcommand !== "cache") {
    throw new Error(
      `unknown epub subcommand: ${subcommand ?? "(none)"}. Usage: ` +
        `anki-builder epub cache <hash> [--clear] [--chapters] [--conventions] [--taught-index] [--dry]`,
    );
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
