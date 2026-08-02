// The `view-deck` command. Moved verbatim from src/cli/index.js when the CLI was
// split per command.
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join, resolve } from "path";
import { Buffer } from "buffer";

// Browse a built `.apkg` as a read-only Claude Artifact: every card grouped by sub-deck, each with
// its embedded audio clip inline. Splits a large deck into parts so no single HTML page blows past
// the Artifact size limit; card numbering runs globally across the parts.
export async function runViewDeck(flags, ctx) {
  if (!flags.apkg) {
    throw new Error("--apkg <file> is required");
  }
  const apkgPath = resolve(flags.apkg);
  if (!existsSync(apkgPath)) {
    throw new Error(`.apkg not found at ${apkgPath}`);
  }
  const deck = ctx.readApkg(apkgPath);

  // Embed the Japanese deck font so kana/kanji render the same everywhere; harmless for other
  // scripts (it only carries JP glyphs, so Latin text falls through to the page's own stack).
  const fontDesc = ctx.getLanguageFont("ja");
  const fontBase64 = fontDesc ? Buffer.from(ctx.readFontBytes(fontDesc)).toString("base64") : null;

  // Pack sub-decks (splitting one if needed) into parts under a raw-audio budget sized so each
  // rendered page stays under ~14 MB (comfortably below the ~16 MB Artifact limit). base64 inflates
  // bytes ~4/3, and the embedded font is a fixed per-part cost, so the audio budget is what's left of
  // the cap after the font and page overhead, converted back to raw bytes.
  const OUTPUT_CAP = 14 * 1024 * 1024;
  const perPartOverhead = (fontBase64 ? fontBase64.length : 0) + 200 * 1024;
  const BUDGET = Math.max(1024 * 1024, Math.floor(((OUTPUT_CAP - perPartOverhead) * 3) / 4));
  const parts = [];
  let cur = { sections: [], bytes: 0 };
  let frag = null;
  const closeFrag = () => {
    if (frag && frag.cards.length) cur.sections.push(frag);
    frag = null;
  };
  const pushPart = () => {
    closeFrag();
    if (cur.sections.length) parts.push(cur);
    cur = { sections: [], bytes: 0 };
  };
  for (const section of deck.sections) {
    closeFrag();
    // Keep a whole sub-deck together when it fits in one part: if it won't fit in what's left of the
    // current part but would fit in a fresh one, start a new part before it (rather than orphaning a
    // few of its cards). A sub-deck bigger than a whole part still splits mid-way, below.
    const sectionBytes = section.cards.reduce(
      (s, c) => s + (c.audioData ? c.audioData.length : 0),
      0,
    );
    if (cur.bytes > 0 && cur.bytes + sectionBytes > BUDGET && sectionBytes <= BUDGET) {
      pushPart();
    }
    frag = { leaf: section.leaf, cards: [] };
    for (const card of section.cards) {
      const size = card.audioData ? card.audioData.length : 0;
      if (cur.bytes + size > BUDGET && cur.bytes > 0) {
        pushPart();
        frag = { leaf: `${section.leaf} (cont.)`, cards: [] };
      }
      frag.cards.push(card);
      cur.bytes += size;
    }
  }
  pushPart();
  if (parts.length === 0) parts.push({ sections: [], bytes: 0 });

  const apkgBase = apkgPath.replace(/\.apkg$/i, "");
  const outBase = flags.out ? resolve(flags.out) : `${apkgBase}-view.html`;
  const n = parts.length;
  let startNumber = 1;
  for (let i = 0; i < n; i++) {
    const html = ctx.renderDeckViewPage({
      title: deck.title,
      sections: parts[i].sections,
      startNumber,
      fontBase64,
      partLabel: n > 1 ? `Part ${i + 1} of ${n}` : null,
    });
    const outPath = n === 1 ? outBase : outBase.replace(/\.html$/i, `-part${i + 1}.html`);
    mkdirSync(join(outPath, ".."), { recursive: true });
    writeFileSync(outPath, html);
    startNumber += parts[i].sections.reduce((sum, s) => sum + s.cards.length, 0);
    ctx.log(`wrote deck view to ${outPath}`);
  }
  ctx.log(
    `deck view: ${deck.totalCards} card(s) across ${deck.sections.length} sub-deck(s), ${n} part(s)`,
  );
}
