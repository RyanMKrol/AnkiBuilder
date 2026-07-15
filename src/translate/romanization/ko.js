/** Romanizes Korean (hangul) via koroman, following the official Korean Language Institute
 * pronunciation-aware romanization rules. */
export async function romanize(targetText) {
  const { romanize: koromanize } = await import("koroman");
  return koromanize(targetText);
}
