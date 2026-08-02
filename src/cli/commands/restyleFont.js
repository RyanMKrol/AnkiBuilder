// The `restyle-font` command. Moved verbatim from src/cli/index.js when the CLI
// was split per command.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join, resolve } from "path";
import { resolveIso639Code } from "../../model/iso639.js";

// Applies a language's configured deck font (src/deck/fontLibrary.js) to ANY .apkg — including
// third-party decks not built here — embedding the font and pointing every note type at it.
export async function runRestyleFont(flags, ctx) {
  if (!flags.apkg) {
    throw new Error("--apkg <path.apkg> is required");
  }
  if (!flags.lang) {
    throw new Error("--lang <code> is required (e.g. ja)");
  }

  const languageCode = resolveIso639Code(flags.lang) || flags.lang;
  const descriptor = ctx.getLanguageFont(languageCode);
  if (!descriptor) {
    throw new Error(`no deck font is configured for language "${flags.lang}"`);
  }

  const inputPath = resolve(flags.apkg);
  if (!existsSync(inputPath)) {
    throw new Error(`input .apkg not found: ${inputPath}`);
  }
  const outPath = flags.out
    ? resolve(flags.out)
    : `${inputPath.replace(/\.apkg$/i, "")}.${descriptor.family.replace(/\s+/g, "")}.apkg`;

  const freshNoteType = Boolean(flags["fresh-notetype"]);
  const outBuffer = ctx.restyleApkgBuffer(
    readFileSync(inputPath),
    descriptor,
    ctx.readFontBytes(descriptor),
    { freshNoteType },
  );
  mkdirSync(join(outPath, ".."), { recursive: true });
  writeFileSync(outPath, outBuffer);
  ctx.log(
    `restyled ${inputPath} in ${descriptor.family}${freshNoteType ? " (fresh note type)" : ""} — wrote ${outPath}`,
  );
}
