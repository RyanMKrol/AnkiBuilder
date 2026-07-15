// kuroshiro's own dynamic import() resolves through Node's CJS interop as a Babel-style
// double-wrapped default export ({ default: Kuroshiro }.default), while its analyzer package
// exposes the class directly as its default — the two packages were built differently and each
// needs its own unwrap; verified directly against the installed packages rather than assumed
// from either package's own docs.
let kuroshiroInstance = null;

async function getKuroshiro() {
  if (kuroshiroInstance) {
    return kuroshiroInstance;
  }

  const [kuroshiroMod, analyzerMod] = await Promise.all([
    import("kuroshiro"),
    import("kuroshiro-analyzer-kuromoji"),
  ]);
  const Kuroshiro = kuroshiroMod.default.default;
  const KuromojiAnalyzer = analyzerMod.default;

  const instance = new Kuroshiro();
  await instance.init(new KuromojiAnalyzer());
  kuroshiroInstance = instance;
  return instance;
}

/**
 * Romanizes Japanese text (kana and/or kanji) to spaced romaji via kuroshiro + kuromoji's
 * morphological analyzer — the only real kanji-aware deterministic option (see
 * .harness/custom/docs/LIMITATIONS.md). The analyzer's dictionary is loaded once per process
 * (module-level cache above), not once per call.
 */
export async function romanize(targetText) {
  const kuroshiro = await getKuroshiro();
  const romaji = await kuroshiro.convert(targetText, { to: "romaji", mode: "spaced" });
  return romaji.replace(/\s+/g, " ").trim();
}
