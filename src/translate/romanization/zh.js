/** Romanizes Mandarin Chinese (hanzi) to tone-marked pinyin via pinyin-pro. */
export async function romanize(targetText) {
  const { pinyin } = await import("pinyin-pro");
  return pinyin(targetText);
}
