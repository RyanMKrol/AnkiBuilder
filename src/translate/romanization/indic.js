/** Romanizes Devanagari (Hindi) to IAST via @indic-transliteration/sanscript. Only `hi` is wired
 * in romanizationLibraries.js today — the library covers ~30 Indic scripts in principle, but each
 * additional script should be verified individually before being wired in, not assumed to work
 * identically. */
export async function romanize(targetText) {
  const { default: Sanscript } = await import("@indic-transliteration/sanscript");
  return Sanscript.t(targetText, "devanagari", "iast");
}
