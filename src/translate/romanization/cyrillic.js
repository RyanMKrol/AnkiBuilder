// cyrillic-romanization (the originally-researched candidate) ships a broken build under Node's
// ESM resolver — its dist/index.js does `import { mappingAlphabet } from './mapping'` with no
// file extension, which Node's strict ESM resolution rejects (confirmed directly against the
// installed package, not assumed). cyrillic-to-translit-js is the verified-working substitute.
let translitInstance = null;

async function getTranslit() {
  if (translitInstance) {
    return translitInstance;
  }
  const { default: CyrillicToTranslit } = await import("cyrillic-to-translit-js");
  translitInstance = new CyrillicToTranslit();
  return translitInstance;
}

/** Romanizes Russian (and other Cyrillic-script) text via cyrillic-to-translit-js. */
export async function romanize(targetText) {
  const translit = await getTranslit();
  return translit.transform(targetText);
}
