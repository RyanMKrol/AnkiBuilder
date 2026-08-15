// The `deck` command: build a single run's .apkg, or (with --book-dir) rebuild a
// whole book's merged deck. Moved verbatim from src/cli/index.js when the CLI was
// split per command.
import { existsSync } from "fs";
import { basename, resolve } from "path";
import { withClaim } from "../runClaim.js";
import { deckIdentityForDir, deckPathForDir } from "../../deck/deckFileName.js";
import { readJson } from "./shared.js";

async function runBookDeck(flags, ctx) {
  const bookDir = resolve(flags["book-dir"]);
  // Assembly + merge live in src/deck/rebuild.js (shared with the dashboard's Rebuild action). This
  // always rebuilds fresh — any upstream chapter change would otherwise leave a stale merged package.
  const result = await ctx.rebuildBookDir(bookDir, {
    buildBookDeck: ctx.buildBookDeck,
    loadBookMeta: ctx.loadBookMeta,
    loadCourseMeta: ctx.loadCourseMeta,
    bookNameFallback: flags.name || null,
  });

  ctx.log(
    `built book deck with ${result.noteCount} note(s) across ${result.chapterCount} chapter(s) at ${deckPathForDir(bookDir)}`,
  );
}

export async function runDeck(flags, ctx) {
  if (flags["book-dir"]) {
    return runBookDeck(flags, ctx);
  }

  if (!flags.run) {
    throw new Error("--run <dir> is required");
  }
  return withClaim(flags.run, { stage: "deck" }, () => runDeckInner(flags, ctx));
}

async function runDeckInner(flags, ctx) {
  const paths = ctx.runPaths(flags.run);

  if (existsSync(paths.deck)) {
    ctx.log(`${basename(paths.deck)} already exists at ${paths.deck} — reusing`);
    return;
  }

  if (!existsSync(paths.cards)) {
    throw new Error(`cards.json not found at ${paths.cards} — run "translate"/"audio" first`);
  }

  const cards = readJson(paths.cards);
  const result = ctx.buildDeck(cards, {
    outPath: paths.deck,
    audioDir: existsSync(paths.audio) ? paths.audio : null,
    deckName: flags.name || null,
    // Namespaced note guids, from the run dir's own immutable identity — NOT from `--name`, which
    // is a display name a rebuild may change. `resolve` first: the identity is derived by walking
    // basename/dirname, so the same directory typed two ways would otherwise get two namespaces and
    // the second build's notes would all import as new. See runDirGuidNamespace in ../deck/rebuild.js.
    guidNamespace: deckIdentityForDir(resolve(flags.run)),
  });

  ctx.log(
    `built deck with ${result.noteCount} note(s), ${result.mediaCount} media file(s) at ${paths.deck}`,
  );
}
