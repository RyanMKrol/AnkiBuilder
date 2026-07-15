/** Romanizes Hebrew text via hebrew-transliteration (SBL scheme). Most accurate when the source
 * text carries niqqud (vowel points); consonant-only text still transliterates, without vowels
 * the library can't infer. */
export async function romanize(targetText) {
  const { transliterate } = await import("hebrew-transliteration");
  return transliterate(targetText);
}
