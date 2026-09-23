#!/usr/bin/env node
// Moves a collection onto a rebuilt edition of its own EPUB (src/cli/rebaseCollection.js): the
// markers, each unit's hash, spine number and chapter label, and the dedup library entries. The
// slug, card ids, audio and review state are kept, so Anki notes keep their GUIDs.
//
//   node scripts/rebase-collection.mjs <collectionDir> --epub <rebuilt.epub> [--dry]
//
// Afterwards: `anki-builder deck --book-dir <collectionDir>` to rebuild the package, then, if the
// collection was delivered, `node scripts/deliver-to-anki.mjs --dry --refile` to preview moving its
// notes into the renamed chapter decks. The old, now empty, decks are left in Anki to delete by hand.
import { resolve } from "path";
import {
  corpusPath,
  hashEpubFile,
  registerEpub,
  resolveLabelDecoding,
  saveBookSlug,
} from "../src/corpus/epubLibrary.js";
import { listLessons } from "../src/corpus/epubLessons.js";
import { planRebase, applyRebase } from "../src/cli/rebaseCollection.js";

const args = process.argv.slice(2);
const known = new Set(["--epub", "--dry"]);
const unknown = args.filter((a) => a.startsWith("-") && !known.has(a));
const epubAt = args.indexOf("--epub");
const collectionArg = args.find((a, i) => !a.startsWith("-") && i !== epubAt + 1);
if (unknown.length || epubAt < 0 || !args[epubAt + 1] || !collectionArg) {
  console.error("usage: rebase-collection.mjs <collectionDir> --epub <rebuilt.epub> [--dry]");
  process.exit(1);
}
const dry = args.includes("--dry");
const collectionDir = resolve(collectionArg);
const epubPath = resolve(args[epubAt + 1]);

const newHash = hashEpubFile(epubPath);
const lessons = listLessons(epubPath, { labelDecoding: resolveLabelDecoding(epubPath) });
const plan = planRebase({ collectionDir, newHash, lessons });

console.log(`collection: ${collectionDir}`);
console.log(`book:       ${plan.oldHash} -> ${plan.newHash}`);
for (const u of plan.units) {
  console.log(
    `  ${u.name}: "${u.from.label}" (spine ${u.from.chapterNumber}) -> "${u.to.label}" (spine ${u.to.chapterNumber})`,
  );
}
if (plan.oldHash === plan.newHash) {
  console.log("\nthe collection is already on this book; nothing to do");
  process.exit(0);
}
if (dry) {
  console.log("\ndry run: nothing written");
  process.exit(0);
}

registerEpub(epubPath);
applyRebase(plan, {
  collectionDir,
  epubPath,
  libraryCorpus: (hash, n) => corpusPath(hash, n, { deckKind: plan.deckKind }),
  registerSlug: (hash) =>
    saveBookSlug(hash, collectionDir.split("/").pop(), { deckKind: plan.deckKind }),
});
console.log("\nrebased. Next: anki-builder deck --book-dir, then deliver-to-anki --dry --refile");
