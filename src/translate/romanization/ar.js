/** Romanizes Arabic text via arabic-transliterate (IJMES academic standard). The package's
 * default direction is latin2arabic — both `direction` and `language` must be passed explicitly
 * to get arabic2latin output (verified directly against the installed package; omitting
 * `language` throws inside the library rather than defaulting sensibly). */
export async function romanize(targetText) {
  const { default: arabicTransliterate } = await import("arabic-transliterate");
  return arabicTransliterate(targetText, "arabic2latin", "Arabic");
}
